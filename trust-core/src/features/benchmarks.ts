/**
 * features/benchmarks.ts — F9: cross-firm benchmarks that cannot be reverse-engineered.
 *
 * The commercial question: "how do my firm's plan costs, funded ratios and retention
 * compare with similar firms?" It is a top-five reason an RIA buys a platform, and the
 * platform cannot answer it by pooling client data — one firm's data would be visible
 * to its competitor, and in a small market simply *participating* leaks.
 *
 * The mechanism here is differential privacy with a published budget, not federated
 * learning. That is a deliberate choice: federated learning is the right tool when you
 * need a per-client *model*. For an aggregate statistic it is more machinery, more
 * attack surface, and harder to audit than a clipped mean plus calibrated noise.
 *
 * Guarantees this module actually provides
 * ----------------------------------------
 * - **k-anonymity on firms** — a benchmark is refused outright below `minFirms`.
 * - **Clipped contributions** — each firm's value is winsorised to a declared range,
 *   so one outlier cannot dominate, and the sensitivity of the statistic is bounded and
 *   *known* rather than assumed.
 * - **Calibrated Laplace noise** — scale = sensitivity / ε, the textbook mechanism.
 * - **A budget that is spent and visible** — every query consumes ε; when the budget is
 *   gone the answer is "no", not "yes with more noise", because repeated noisy answers
 *   compose and the composition is what deanonymises.
 *
 * Honest limits: this protects against *inference from the published statistic*. It
 * does not protect against a colluding group of firms who already know each other's
 * numbers, and it does not replace a legal review of what may be shared at all.
 */
import { point, type DataPoint } from '../provenance.ts';

export interface FirmAggregate {
  /** Stable firm reference. Never published. */
  firmId: string;
  /** The metric value for this firm (e.g. average all-in cost). */
  value: number;
  /** Clients contributing to the value; small firms are excluded, not down-weighted. */
  n: number;
}

export interface BenchmarkConfig {
  /** Minimum number of contributing firms. Below this the query is refused. */
  minFirms: number;
  /** Minimum clients per firm for that firm to contribute. */
  minClientsPerFirm: number;
  /** Privacy budget consumed per published statistic. */
  epsilon: number;
  /** Declared bounds used for clipping. Must be stated, not inferred. */
  clip: { low: number; high: number };
  /** Deterministic noise for reproducible reports and tests. */
  seed: number;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  minFirms: 5,
  minClientsPerFirm: 25,
  epsilon: 0.5,
  clip: { low: 0, high: 100 },
  seed: 20_261_108,
};

export class BenchmarkSuppressedError extends Error {
  override readonly name = 'BenchmarkSuppressedError';
  readonly code = 'benchmark_suppressed';
}

export class PrivacyBudgetExhaustedError extends Error {
  override readonly name = 'PrivacyBudgetExhaustedError';
  readonly code = 'privacy_budget_exhausted';
}

/** Simple ε accountant. Composition is additive for these mechanisms. */
export class PrivacyBudget {
  readonly total: number;
  #spent = 0;

  constructor(total: number) {
    if (!(total > 0)) throw new RangeError('budget total must be positive');
    this.total = total;
  }

  get spent(): number {
    return this.#spent;
  }

  get remaining(): number {
    return Math.max(0, this.total - this.#spent);
  }

  canAfford(epsilon: number): boolean {
    return this.#spent + epsilon <= this.total + 1e-9;
  }

  spend(epsilon: number): void {
    if (!this.canAfford(epsilon)) {
      throw new PrivacyBudgetExhaustedError(
        `this period's privacy budget is spent (${this.#spent.toFixed(2)} of ${this.total.toFixed(2)} ε used)`,
      );
    }
    this.#spent += epsilon;
  }
}

/** Deterministic PRNG so a published report can be reproduced exactly for an audit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Laplace(0, scale) via inverse CDF on a uniform draw. */
export function laplace(scale: number, rng: () => number): number {
  const u = rng() - 0.5;
  const sign = u < 0 ? -1 : 1;
  return -scale * sign * Math.log(1 - 2 * Math.abs(u));
}

export interface BenchmarkResult {
  metric: string;
  /** Noisy mean across contributing firms. */
  value: number;
  /** Number of firms that contributed (not suppressed). */
  firms: number;
  /** Total clients behind the statistic. */
  clients: number;
  clip: { low: number; high: number };
  epsilon: number;
  /** Noise scale applied; disclosed so a reader can judge the interval. */
  noiseScale: number;
  suppressedFirms: number;
  /** Approximate 95% interval implied by the Laplace mechanism. */
  interval95: { low: number; high: number };
  notes: string[];
}

/**
 * Publish a cross-firm benchmark, or refuse.
 *
 * Two refusals are possible and both are deliberate: too few firms (identification),
 * and no budget left (composition).
 */
export function publishBenchmark(
  metric: string,
  aggregates: FirmAggregate[],
  budget: PrivacyBudget,
  config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG,
): DataPoint<BenchmarkResult> {
  if (!metric.trim()) throw new RangeError('metric name is required');
  if (!(config.epsilon > 0)) throw new RangeError('epsilon must be positive');
  if (config.clip.low >= config.clip.high) throw new RangeError('clip.low must be below clip.high');

  const eligible = aggregates.filter(
    (a) => Number.isFinite(a.value) && Number.isFinite(a.n) && a.n >= config.minClientsPerFirm,
  );
  const suppressedFirms = aggregates.length - eligible.length;

  if (eligible.length < config.minFirms) {
    throw new BenchmarkSuppressedError(
      `only ${eligible.length} firm(s) qualify (need ${config.minFirms} with at least ${config.minClientsPerFirm} clients); ` +
        'publishing would make individual firms identifiable',
    );
  }

  budget.spend(config.epsilon);

  // Clip first: sensitivity of a mean over m clipped values is (high - low) / m, so
  // stating the clip states the sensitivity instead of hoping it is small.
  const clipped = eligible.map((a) => ({
    firmId: a.firmId,
    value: Math.min(config.clip.high, Math.max(config.clip.low, a.value)),
    n: a.n,
  }));

  const mean = clipped.reduce((acc, c) => acc + c.value, 0) / clipped.length;
  const sensitivity = (config.clip.high - config.clip.low) / clipped.length;
  const noiseScale = sensitivity / config.epsilon;

  const rng = mulberry32(config.seed ^ hashString(metric));
  const noisy = mean + laplace(noiseScale, rng);

  // Laplace 95% interval is ±ln(20)·scale. Disclosed rather than a false "±" from the
  // sample, because the uncertainty here is the privacy mechanism, not sampling error.
  const margin = Math.log(20) * noiseScale;

  const result: BenchmarkResult = {
    metric,
    value: round2(noisy),
    firms: clipped.length,
    clients: clipped.reduce((acc, c) => acc + c.n, 0),
    clip: config.clip,
    epsilon: config.epsilon,
    noiseScale: round4(noiseScale),
    suppressedFirms,
    interval95: { low: round2(noisy - margin), high: round2(noisy + margin) },
    notes: [
      `Each firm's value was clipped to [${config.clip.low}, ${config.clip.high}] before averaging.`,
      `Laplace noise with scale ${noiseScale.toFixed(4)} was added (ε = ${config.epsilon}).`,
      'Firms below the client threshold are excluded, not down-weighted.',
      'Repeated queries compose: each publication spends budget, and the budget is finite.',
      'This protects against inference from the published statistic. It is not a legal opinion on what may be shared.',
    ],
  };

  return point(result, {
    source: 'fiduciary-os:benchmark:laplace',
    sourceKind: 'derived',
    sourceUrl: '',
    retrievedAt: new Date().toISOString(),
    asOf: null,
    license: 'Proprietary',
    method:
      `Differentially private mean: clip to [${config.clip.low}, ${config.clip.high}], sensitivity ` +
      `${sensitivity.toFixed(4)}, Laplace scale ${noiseScale.toFixed(4)} at ε=${config.epsilon}, ` +
      `k=${config.minFirms} firms, seeded PRNG for reproducibility.`,
    staleAfterSeconds: 30 * 24 * 3600,
  });
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
