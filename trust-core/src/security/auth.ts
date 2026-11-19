/**
 * security/auth.ts — signed bearer tokens with scopes, no dependencies.
 *
 * Gap 2: the trust core had no authentication, so anyone who reached the port
 * could write ledger entries and read exports. In a fiduciary product that is not
 * a hardening nicety — writing a false evidence entry is worse than reading one.
 *
 * Why not a JWT library: the token here is not an identity provider assertion, it
 * is a short-lived internal capability. HS256 over a shared secret is the correct
 * mechanism for that, it is 60 lines, and it keeps the runtime dependency count at
 * zero. The format is JWT-compatible (three base64url segments, same header), so a
 * real OIDC provider can replace the issuer later without touching verifiers.
 *
 * Deliberate constraints
 * ----------------------
 * - `exp` is mandatory and capped (`MAX_TTL`). A token that never expires is an
 *   incident waiting for a date.
 * - Scopes are an explicit allow-list; there is no wildcard that silently covers
 *   future scopes.
 * - Comparison is constant-time on the signature.
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export type Scope =
  | 'calc:read'
  | 'ledger:read'
  | 'ledger:write'
  | 'advice:write'
  | 'authz:read'
  | 'authz:write'
  | 'admin';

export const ALL_SCOPES: readonly Scope[] = [
  'calc:read',
  'ledger:read',
  'ledger:write',
  'advice:write',
  'authz:read',
  'authz:write',
  'admin',
];

export interface TokenClaims {
  sub: string;
  scopes: Scope[];
  iat: number;
  exp: number;
  jti: string;
  /** Optional tenancy. Present on advisor/firm tokens. */
  firm?: string;
}

export class AuthError extends Error {
  override readonly name = 'AuthError';
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 401, code = 'unauthorized') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_TTL_SECONDS = 12 * 3600;
const CLOCK_SKEW_SECONDS = 30;
const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set to at least 32 characters in production');
  }
  // Development only: a stable per-process secret, loudly announced.
  if (!process.env.__DEV_AUTH_SECRET) {
    process.env.__DEV_AUTH_SECRET = randomUUID();
    process.stderr.write('auth: AUTH_SECRET not set; using an ephemeral development secret\n');
  }
  return process.env.__DEV_AUTH_SECRET;
}

export function issueToken(input: { sub: string; scopes: Scope[]; ttlSeconds?: number; firm?: string }): string {
  if (!input.sub.trim()) throw new AuthError('sub is required', 400, 'bad_request');
  const unknown = input.scopes.filter((s) => !ALL_SCOPES.includes(s));
  if (unknown.length) throw new AuthError(`unknown scopes: ${unknown.join(', ')}`, 400, 'bad_request');
  if (input.scopes.length === 0) throw new AuthError('at least one scope is required', 400, 'bad_request');

  const ttl = Math.min(Math.max(60, input.ttlSeconds ?? 3600), MAX_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sub: input.sub,
    scopes: input.scopes,
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
    ...(input.firm ? { firm: input.firm } : {}),
  };
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify(claims));
  const signature = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, now = Date.now()): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('malformed token');
  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AuthError('invalid signature');

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims;
  } catch {
    throw new AuthError('malformed payload');
  }

  const nowSeconds = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number') throw new AuthError('token has no expiry');
  if (nowSeconds > claims.exp + CLOCK_SKEW_SECONDS) throw new AuthError('token expired');
  if (claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) throw new AuthError('token issued in the future');
  if (claims.exp - claims.iat > MAX_TTL_SECONDS + CLOCK_SKEW_SECONDS) throw new AuthError('token ttl exceeds policy');
  if (!Array.isArray(claims.scopes) || claims.scopes.length === 0) throw new AuthError('token has no scopes');

  return claims;
}

/** Extract claims from an `Authorization: Bearer …` header. */
export function authenticate(header: string | undefined): TokenClaims {
  if (!header) throw new AuthError('missing Authorization header');
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) throw new AuthError('expected "Bearer <token>"');
  return verifyToken(value);
}

export function hasScope(claims: TokenClaims, required: Scope): boolean {
  return claims.scopes.includes(required) || claims.scopes.includes('admin');
}

export function requireScope(claims: TokenClaims, required: Scope): void {
  if (!hasScope(claims, required)) {
    throw new AuthError(`token lacks required scope "${required}"`, 403, 'forbidden');
  }
}
