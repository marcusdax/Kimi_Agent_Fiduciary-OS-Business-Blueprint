/**
 * security/revocation.ts — gap 13: make a stolen token stop working.
 *
 * The readiness review flagged the obvious cost of stateless tokens: they are valid
 * until they expire. A 12-hour window is unacceptable for a token that can write
 * evidence entries, so this module adds the smallest mechanism that closes it:
 *
 *   - **Per-token revocation** by `jti`, retained only for the token's remaining
 *     lifetime, so the list cannot grow without bound.
 *   - **Per-subject revocation** by bumping a version. Every token issued before the
 *     bump is invalid. This is what an operator actually needs at 2am: "kill everything
 *     for this user".
 *
 * Both live in the shared cache, not in process memory, so a second replica honours a
 * revocation immediately. That is the difference between a control and a decoration.
 *
 * The trade-off is stated rather than hidden: this is a deny-list, so it grows with the
 * rate of revocation (bounded by TTL) and it is read on every authenticated request.
 * The alternative — short-lived tokens plus refresh — is the better long-term design
 * and is why `ttlSeconds` exists on the issue endpoint.
 */
import type { CacheStore } from '../cache.ts';

export interface RevocationPolicy {
  /** Longest a revocation entry is retained. Never longer than the max token ttl. */
  maxRetentionSeconds: number;
}

export const DEFAULT_POLICY: RevocationPolicy = { maxRetentionSeconds: 12 * 3600 };

export class RevocationRegistry {
  readonly #cache: CacheStore;
  readonly #policy: RevocationPolicy;

  constructor(cache: CacheStore, policy: RevocationPolicy = DEFAULT_POLICY) {
    this.#cache = cache;
    this.#policy = policy;
  }

  #tokenKey(jti: string): string {
    return `revoked:jti:${jti}`;
  }

  #subjectKey(sub: string): string {
    return `revoked:sub:${sub}`;
  }

  /**
   * Revoke one token. `expiresAt` (epoch seconds) bounds how long the entry is kept:
   * once the token would have expired anyway, the entry is dead weight.
   */
  revokeToken(jti: string, expiresAt?: number, now = Date.now()): void {
    if (!jti.trim()) throw new RangeError('jti is required');
    const remaining = expiresAt ? Math.max(1, expiresAt - Math.floor(now / 1000)) : this.#policy.maxRetentionSeconds;
    const ttlSeconds = Math.min(remaining, this.#policy.maxRetentionSeconds);
    this.#cache.set(this.#tokenKey(jti), JSON.stringify({ at: new Date(now).toISOString() }), ttlSeconds * 1000);
  }

  /** Revoke every token for a subject by recording a revocation instant. */
  revokeSubject(sub: string, now = Date.now()): number {
    if (!sub.trim()) throw new RangeError('subject is required');
    const revokedAt = Math.floor(now / 1000);
    this.#cache.set(this.#subjectKey(sub), JSON.stringify({ revokedAt }), this.#policy.maxRetentionSeconds * 1000);
    return revokedAt;
  }

  isTokenRevoked(jti: string): boolean {
    return this.#cache.get(this.#tokenKey(jti)) !== undefined;
  }

  /** A token is dead if it was issued at or before the subject's revocation instant. */
  isSubjectRevoked(sub: string, issuedAt: number): boolean {
    const record = this.#cache.get(this.#subjectKey(sub));
    if (!record) return false;
    try {
      const { revokedAt } = JSON.parse(record.value) as { revokedAt: number };
      // Second resolution makes "issued in the same second as the revocation" ambiguous;
      // it is treated as revoked. A token minted a second or more later survives, which is
      // what a re-authentication flow needs.
      return issuedAt <= revokedAt;
    } catch {
      // A corrupt entry must fail closed.
      return true;
    }
  }

  /** Combined check used by the request path. */
  check(claims: { jti: string; sub: string; iat: number }): { revoked: boolean; reason: string | null } {
    if (this.isTokenRevoked(claims.jti)) return { revoked: true, reason: 'token_revoked' };
    if (this.isSubjectRevoked(claims.sub, claims.iat)) return { revoked: true, reason: 'subject_revoked' };
    return { revoked: false, reason: null };
  }
}
