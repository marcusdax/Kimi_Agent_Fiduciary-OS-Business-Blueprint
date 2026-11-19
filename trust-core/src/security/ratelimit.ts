/**
 * security/ratelimit.ts — token bucket, per subject and per route group.
 *
 * Gap 3. Two different limits are needed and conflating them is the usual bug:
 *
 *  - **Client fairness** — one caller must not consume the service.
 *  - **Upstream protection** — SEC asks for ≤10 req/s; CoinGecko's free tier is
 *    strict. A client loop that looks fine to us can get the whole platform
 *    blocked by a provider, so per-provider budgets are enforced separately in
 *    `HttpClient` (see `ProviderBudget`).
 *
 * Token bucket over fixed windows: it tolerates a burst (a user opening a
 * dashboard) without allowing sustained abuse, and it does not have the boundary
 * thundering-herd problem of a fixed window.
 */
export interface BucketConfig {
  /** Sustained rate, tokens per second. */
  ratePerSecond: number;
  /** Maximum burst. Defaults to one second's worth. */
  burst?: number;
}

export interface Decision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next token, when denied. 0 when allowed. */
  retryAfterSeconds: number;
  limit: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #configs: Record<string, BucketConfig>;
  readonly #defaults: BucketConfig;
  readonly #maxKeys: number;

  constructor(configs: Record<string, BucketConfig>, defaults: BucketConfig = { ratePerSecond: 20, burst: 40 }, maxKeys = 10_000) {
    this.#configs = configs;
    this.#defaults = defaults;
    this.#maxKeys = maxKeys;
  }

  #config(group: string): BucketConfig {
    return this.#configs[group] ?? this.#defaults;
  }

  check(key: string, group = 'default', cost = 1, now = Date.now()): Decision {
    const config = this.#config(group);
    const burst = config.burst ?? Math.max(1, Math.ceil(config.ratePerSecond));

    if (this.#buckets.size >= this.#maxKeys && !this.#buckets.has(key)) {
      // Bounded memory: drop the least recently refilled entry rather than grow.
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, b] of this.#buckets) {
        if (b.lastRefillMs < oldest) {
          oldest = b.lastRefillMs;
          oldestKey = k;
        }
      }
      if (oldestKey) this.#buckets.delete(oldestKey);
    }

    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = { tokens: burst, lastRefillMs: now };
      this.#buckets.set(key, bucket);
    }

    const elapsedSeconds = Math.max(0, (now - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(burst, bucket.tokens + elapsedSeconds * config.ratePerSecond);
    bucket.lastRefillMs = now;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0, limit: burst };
    }

    const deficit = cost - bucket.tokens;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(deficit / config.ratePerSecond),
      limit: burst,
    };
  }

  reset(): void {
    this.#buckets.clear();
  }
}

/**
 * Concurrency budget for a single upstream provider. This is what stops a burst of
 * user requests from becoming a burst of SEC requests.
 */
export class ProviderBudget {
  readonly #inFlight = new Map<string, number>();
  readonly #limits: Record<string, number>;

  constructor(limits: Record<string, number>) {
    this.#limits = limits;
  }

  get(provider: string): number {
    return this.#limits[provider] ?? 8;
  }

  tryAcquire(provider: string): boolean {
    const current = this.#inFlight.get(provider) ?? 0;
    if (current >= this.get(provider)) return false;
    this.#inFlight.set(provider, current + 1);
    return true;
  }

  release(provider: string): void {
    const current = this.#inFlight.get(provider) ?? 0;
    this.#inFlight.set(provider, Math.max(0, current - 1));
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.#inFlight);
  }
}

export const defaultLimiter = (): RateLimiter => {
  // Test and load-test environments need headroom; production keeps the defaults.
  const m = Number(process.env.RATE_LIMIT_MULTIPLIER ?? '1');
  const scale = Number.isFinite(m) && m > 0 ? m : 1;
  const cfg = (rate: number, burst: number) => ({ ratePerSecond: rate * scale, burst: Math.ceil(burst * scale) });
  return new RateLimiter(
    {
      // Deterministic maths is cheap; allow a burst if a dashboard loads.
      calc: cfg(10, 30),
      // Live-calibrated endpoints hit providers. Tighter.
      live: cfg(2, 6),
      // Ledger writes are the sensitive path.
      ledger: cfg(5, 20),
      // Disclosure Watch fans out to SEC per holding.
      watch: cfg(0.5, 3),
      auth: cfg(1, 5),
    },
    cfg(10, 20),
  );
};
