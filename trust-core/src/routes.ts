/**
 * routes.ts — the single source of truth for the HTTP surface.
 *
 * Every route is declared once, with the scope it requires, the rate-limit bucket it
 * belongs to, and a summary. `server.ts` dispatches from this table and `openapi.ts`
 * generates the specification from it, so the document cannot drift from the code —
 * gap 11 in the readiness review was that nothing checked the boundary.
 */
import type { IncomingMessage } from 'node:http';
import type { Scope } from './security/auth.ts';

export interface RouteContext {
  req: IncomingMessage;
  url: URL;
  params: Record<string, string>;
  claims: { sub: string; scopes: Scope[]; firm?: string } | null;
  body: <T>() => Promise<T>;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

export interface RouteSpec {
  method: 'GET' | 'POST';
  /** Express-style path with `:param` segments. */
  path: string;
  scope?: Scope;
  /** Rate-limit bucket. */
  group: string;
  summary: string;
  /** True when no bearer token is required. */
  publicRoute?: boolean;
  requestSchema?: Record<string, unknown>;
  handler: (ctx: RouteContext) => Promise<RouteResult>;
}

/** Match `/api/v1/ledger/subject/:subject` against a concrete path. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const actual = pathParts[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (p !== actual) return null;
  }
  return params;
}
