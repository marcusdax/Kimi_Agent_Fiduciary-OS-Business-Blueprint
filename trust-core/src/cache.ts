/**
 * cache.ts — the shared cache seam.
 *
 * Gap 4: the transport cache was a per-process Map, so two replicas doubled the
 * provider load and could disagree for one TTL. This module makes the cache an
 * interface with two interchangeable implementations:
 *
 *  - `MemoryCache` — fastest, correct for single-process deployments and tests.
 *  - `FileCache`   — shared across every process on the same host, which is what
 *                     a container replica set on one machine actually needs.
 *
 * For multi-host, implement `CacheStore` over Redis. That is ~40 lines against
 * `ioredis` and is deliberately *not* done here: adding a Redis client to the one
 * process that gates every client-facing number should be a decision, not a
 * default. The interface is the contract; the adapter is a later commit.
 *
 * Semantics that must hold for any implementation
 * ----------------------------------------------
 * - `get` returns a stale entry rather than `undefined` when the TTL has lapsed, so
 *   the caller can decide about `stale-if-error`. Expiry is policy, not deletion.
 * - Writes are atomic per key (temp + rename for the file store), so a reader never
 *   sees a half-written JSON document.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface CacheRecord {
  value: string;
  storedAt: number;
  ttlMs: number;
}

export interface CacheStore {
  readonly kind: string;
  get(key: string): CacheRecord | undefined;
  set(key: string, value: string, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
  stats(): { entries: number; bytes: number };
}

export class MemoryCache implements CacheStore {
  readonly kind = 'memory';
  readonly #map = new Map<string, CacheRecord>();
  readonly #maxEntries: number;

  constructor(maxEntries = 512) {
    this.#maxEntries = maxEntries;
  }

  get(key: string): CacheRecord | undefined {
    return this.#map.get(key);
  }

  set(key: string, value: string, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.#map.size >= this.#maxEntries && !this.#map.has(key)) {
      // Drop the oldest third: amortises eviction instead of paying it per insert.
      const drop = Math.ceil(this.#maxEntries / 3);
      let i = 0;
      for (const k of this.#map.keys()) {
        this.#map.delete(k);
        if (++i >= drop) break;
      }
    }
    this.#map.set(key, { value, storedAt: Date.now(), ttlMs });
  }

  delete(key: string): void {
    this.#map.delete(key);
  }

  clear(): void {
    this.#map.clear();
  }

  stats(): { entries: number; bytes: number } {
    let bytes = 0;
    for (const r of this.#map.values()) bytes += r.value.length;
    return { entries: this.#map.size, bytes };
  }
}

/**
 * File-backed cache. Keys are hashed so an arbitrary URL never becomes a filename
 * (path traversal, length limits, reserved names on Windows).
 */
export class FileCache implements CacheStore {
  readonly kind = 'file';
  readonly #dir: string;
  readonly #maxEntries: number;

  constructor(dir: string, maxEntries = 2048) {
    this.#dir = dir;
    this.#maxEntries = maxEntries;
    mkdirSync(dir, { recursive: true });
  }

  #path(key: string): string {
    return join(this.#dir, `${createHash('sha256').update(key).digest('hex')}.json`);
  }

  get(key: string): CacheRecord | undefined {
    const path = this.#path(key);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as CacheRecord;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.#evictIfNeeded();
    const path = this.#path(key);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ value, storedAt: Date.now(), ttlMs } satisfies CacheRecord), 'utf8');
    renameSync(tmp, path); // atomic replace
  }

  #evictIfNeeded(): void {
    let files: string[];
    try {
      files = readdirSync(this.#dir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    if (files.length < this.#maxEntries) return;
    const byAge = files
      .map((f) => ({ f, at: statSync(join(this.#dir, f)).mtimeMs }))
      .sort((a, b) => a.at - b.at)
      .slice(0, Math.ceil(files.length / 3));
    for (const { f } of byAge) {
      try {
        unlinkSync(join(this.#dir, f));
      } catch {
        /* another process won the race; fine */
      }
    }
  }

  delete(key: string): void {
    try {
      unlinkSync(this.#path(key));
    } catch {
      /* already gone */
    }
  }

  clear(): void {
    for (const f of readdirSync(this.#dir)) {
      if (f.endsWith('.json') || f.endsWith('.tmp')) {
        try {
          unlinkSync(join(this.#dir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }

  stats(): { entries: number; bytes: number } {
    let entries = 0;
    let bytes = 0;
    try {
      for (const f of readdirSync(this.#dir)) {
        if (!f.endsWith('.json')) continue;
        entries++;
        bytes += statSync(join(this.#dir, f)).size;
      }
    } catch {
      /* empty */
    }
    return { entries, bytes };
  }
}

/** Choose the store from the environment, defaulting to memory outside production. */
export function cacheFromEnv(): CacheStore {
  const mode = process.env.CACHE_MODE ?? (process.env.NODE_ENV === 'production' ? 'file' : 'memory');
  if (mode === 'file') {
    return new FileCache(process.env.CACHE_DIR ?? join(process.cwd(), '.data', 'cache'));
  }
  return new MemoryCache();
}
