/**
 * http.ts — the resilient transport every provider shares.
 *
 * A financial product's data layer fails in four predictable ways, and each one
 * has a specific answer here:
 *
 *   1. A provider goes slow.          -> per-attempt timeout (AbortSignal).
 *   2. A provider goes down.          -> per-host circuit breaker, so we stop
 *                                        paying the timeout on every request.
 *   3. A provider rate-limits us.     -> bounded retry with exponential backoff
 *                                        + jitter, and `Retry-After` respect.
 *   4. A provider blips once.         -> serve the last good cached value and
 *                                        mark it `stale`, rather than failing a
 *                                        client's retirement projection.
 *
 * There are no runtime dependencies: global `fetch` only. That is deliberate —
 * this module is the trust boundary, and it must not inherit a transitive
 * supply-chain risk from a convenience package.
 */

import { MemoryCache, type CacheStore } from './cache.ts';
import { metrics } from './observability/metrics.ts';

export class UpstreamError extends Error {
  override readonly name: string = 'UpstreamError';
  readonly status: number;
  readonly url: string;
  readonly retryable: boolean;
  constructor(message: string, status: number, url: string, retryable = false) {
    super(message);
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

export class CircuitOpenError extends UpstreamError {
  override readonly name: string = 'CircuitOpenError';
  readonly retryAt: number;
  constructor(url: string, retryAt: number) {
    super(`circuit open for ${new URL(url).host}; retry after ${new Date(retryAt).toISOString()}`, 503, url, false);
    this.retryAt = retryAt;
  }
}

type BreakerState = 'closed' | 'open' | 'half-open';

interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
  nextProbeAt: number;
}

export interface CacheEntry {
  value: string;
  storedAt: number;
  ttlMs: number;
}

export interface FetchResult {
  text: string;
  status: number;
  url: string;
  retrievedAt: string;
  /** True when we served a cached copy because the live call failed. */
  stale: boolean;
  ageMs: number;
}

export interface HttpClientOptions {
  /** Sent as User-Agent. Several public-sector APIs (SEC) require an identifying UA. */
  userAgent: string;
  defaultTimeoutMs: number;
  maxRetries: number;
  /** Consecutive failures before the breaker opens. */
  failureThreshold: number;
  /** How long the breaker stays open before a single probe request is allowed. */
  cooldownMs: number;
  /** Cap on cache entries for the default in-memory store. */
  maxCacheEntries: number;
  /** Maximum simultaneous in-flight requests per host. Protects provider quotas. */
  maxConcurrentPerHost: number;
}

const DEFAULTS: HttpClientOptions = {
  userAgent: 'FiduciaryOS/1.0 (+https://fiduciary-os.example; data-provenance)',
  defaultTimeoutMs: 10_000,
  maxRetries: 2,
  failureThreshold: 3,
  cooldownMs: 30_000,
  maxCacheEntries: 512,
  maxConcurrentPerHost: 6,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Full jitter backoff: spreads retries so a recovering provider is not thundered. */
const backoffMs = (attempt: number) => Math.round(Math.random() * Math.min(8_000, 250 * 2 ** attempt));

export class HttpClient {
  readonly opts: HttpClientOptions;
  readonly cache: CacheStore;
  readonly #breakers = new Map<string, Breaker>();
  readonly #slots = new Map<string, number>();

  constructor(options: Partial<HttpClientOptions> & { cache?: CacheStore } = {}) {
    const { cache, ...rest } = options;
    this.opts = { ...DEFAULTS, ...rest };
    this.cache = cache ?? new MemoryCache(this.opts.maxCacheEntries);
  }

  /** Wait for a per-host concurrency slot. Bounded so a stuck provider cannot queue forever. */
  async #acquireSlot(host: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while ((this.#slots.get(host) ?? 0) >= this.opts.maxConcurrentPerHost) {
      if (Date.now() > deadline) {
        throw new UpstreamError(`concurrency budget exhausted for ${host}`, 503, `https://${host}`, true);
      }
      await sleep(5);
    }
    this.#slots.set(host, (this.#slots.get(host) ?? 0) + 1);
  }

  #releaseSlot(host: string): void {
    this.#slots.set(host, Math.max(0, (this.#slots.get(host) ?? 0) - 1));
  }

  #breaker(host: string): Breaker {
    let b = this.#breakers.get(host);
    if (!b) {
      b = { state: 'closed', failures: 0, openedAt: 0, nextProbeAt: 0 };
      this.#breakers.set(host, b);
    }
    return b;
  }

  #recordSuccess(host: string): void {
    const b = this.#breaker(host);
    b.state = 'closed';
    b.failures = 0;
  }

  #recordFailure(host: string): void {
    const b = this.#breaker(host);
    b.failures += 1;
    if (b.failures >= this.opts.failureThreshold) {
      b.state = 'open';
      b.openedAt = Date.now();
      b.nextProbeAt = Date.now() + this.opts.cooldownMs;
      metrics.breakerState.set({ host }, 1);
    }
  }

  #admit(url: string): void {
    const host = new URL(url).host;
    const b = this.#breaker(host);
    if (b.state === 'open') {
      if (Date.now() < b.nextProbeAt) throw new CircuitOpenError(url, b.nextProbeAt);
      b.state = 'half-open';
    }
  }

  #readCache(key: string): CacheEntry | undefined {
    return this.cache.get(key);
  }

  #writeCache(key: string, value: string, ttlMs: number): void {
    this.cache.set(key, value, ttlMs);
  }

  /**
   * Fetch text with caching, retries and a circuit breaker.
   *
   * @param ttlMs how long a successful body stays fresh. On failure we may serve a
   *   body past this age (up to `staleIfErrorMs`) but the caller is told via `stale`.
   */
  async getText(
    url: string,
    init: {
      headers?: Record<string, string>;
      method?: 'GET' | 'POST';
      body?: string;
      ttlMs?: number;
      timeoutMs?: number;
      staleIfErrorMs?: number;
      /** Cache key override, for POST endpoints where the URL alone is not the identity. */
      cacheKey?: string;
    } = {},
  ): Promise<FetchResult> {
    const key = init.cacheKey ?? `${init.method ?? 'GET'} ${url} ${init.body ?? ''}`;
    const ttlMs = init.ttlMs ?? 0;
    const cached = this.#readCache(key);
    const now = Date.now();

    if (cached && now - cached.storedAt < cached.ttlMs) {
      metrics.cacheHits.inc({ result: 'hit', host: new URL(url).host });
      return {
        text: cached.value,
        status: 200,
        url,
        retrievedAt: new Date(cached.storedAt).toISOString(),
        stale: false,
        ageMs: now - cached.storedAt,
      };
    }

    const host = new URL(url).host;
    let lastError: Error | undefined;
    metrics.cacheHits.inc({ result: 'miss', host });

    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      try {
        this.#admit(url);
      } catch (err) {
        lastError = err as Error;
        break;
      }

      await this.#acquireSlot(host);
      const startedAt = Date.now();
      try {
        metrics.upstreamCalls.inc({ host, outcome: 'attempt' });
        const res = await fetch(url, {
          method: init.method ?? 'GET',
          body: init.body,
          headers: {
            Accept: '*/*',
            'User-Agent': this.opts.userAgent,
            ...(init.headers ?? {}),
          },
          signal: AbortSignal.timeout(init.timeoutMs ?? this.opts.defaultTimeoutMs),
        });

        if (res.ok) {
          const text = await res.text();
          this.#recordSuccess(host);
          this.#writeCache(key, text, ttlMs);
          metrics.upstreamCalls.inc({ host, outcome: 'ok' });
          metrics.upstreamLatency.observe(Date.now() - startedAt, { host });
          metrics.breakerState.set({ host }, 0);
          return { text, status: res.status, url, retrievedAt: new Date().toISOString(), stale: false, ageMs: 0 };
        }

        const retryable = res.status === 429 || res.status >= 500;
        lastError = new UpstreamError(`HTTP ${res.status} from ${host}`, res.status, url, retryable);
        metrics.upstreamCalls.inc({ host, outcome: 'http_' + res.status });
        metrics.upstreamLatency.observe(Date.now() - startedAt, { host });
        if (!retryable) break;

        const retryAfter = Number(res.headers.get('retry-after'));
        this.#recordFailure(host);
        if (attempt < this.opts.maxRetries) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        }
      } catch (err) {
        lastError = err as Error;
        this.#recordFailure(host);
        const name = (err as Error)?.name;
        metrics.upstreamCalls.inc({ host, outcome: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error' });
        metrics.upstreamLatency.observe(Date.now() - startedAt, { host });
        if (attempt < this.opts.maxRetries) await sleep(backoffMs(attempt));
      } finally {
        this.#releaseSlot(host);
      }
    }

    // Failure path: serve a stale copy if we have one that is not too old. A frozen
    // CPI print from this morning is better than a broken retirement projection.
    const staleWindow = init.staleIfErrorMs ?? 24 * 60 * 60 * 1000;
    if (cached && now - cached.storedAt <= staleWindow) {
      metrics.cacheHits.inc({ result: 'stale', host });
      return {
        text: cached.value,
        status: 200,
        url,
        retrievedAt: new Date(cached.storedAt).toISOString(),
        stale: true,
        ageMs: now - cached.storedAt,
      };
    }

    throw lastError ?? new UpstreamError('unknown upstream failure', 502, url);
  }

  async getJson<T>(url: string, init?: Parameters<HttpClient['getText']>[1]): Promise<FetchResult & { json: T }> {
    const res = await this.getText(url, init);
    try {
      return { ...res, json: JSON.parse(res.text) as T };
    } catch {
      throw new UpstreamError(`expected JSON from ${new URL(url).host}`, 502, url);
    }
  }

  /** Operational snapshot for `GET /api/v1/data-sources` and dashboards. */
  health(): Array<{ host: string; state: BreakerState; failures: number }> {
    return [...this.#breakers.entries()].map(([host, b]) => ({ host, state: b.state, failures: b.failures }));
  }

  cacheStats(): { entries: number; bytes: number } {
    return this.cache.stats();
  }

  reset(): void {
    this.cache.clear();
    this.#breakers.clear();
    this.#slots.clear();
  }
}

/** Process-wide client. Tests construct their own to stay hermetic. */
export const http = new HttpClient();
