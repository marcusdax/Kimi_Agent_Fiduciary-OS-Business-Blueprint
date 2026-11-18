/**
 * engines/montecarlo.ts — retirement sustainability from *real* historical returns.
 *
 * The prototype replaced this with:
 *
 *     if (withdrawalRate <= 4) successProbability = 95;
 *     else if (withdrawalRate <= 5) successProbability = 75;
 *     else successProbability = 45;
 *
 * That is not a projection; it is a lookup table wearing a percentage sign. Two
 * households with the same withdrawal rate but a 30-year and a 45-year horizon got
 * the same "95%", and asset allocation had no effect at all. This module replaces it
 * with a block-bootstrap Monte Carlo over the actual historical real return series,
 * so the output moves when the inputs move.
 *
 * Method choices, and why:
 *  - **Real dollars.** Returns are deflated by CPI-U, so every figure is in today's
 *    purchasing power and no nominal-inflation assumption is smuggled in.
 *  - **Block bootstrap, not a normal distribution.** Equity returns are fat-tailed
 *    and serially correlated; sampling 5-year blocks preserves both. Sampling i.i.d.
 *    normal returns would systematically understate sequence-of-returns risk, which
 *    is the exact risk a retiree faces.
 *  - **Seeded PRNG.** A projection must be reproducible: the same household, asked
 *    twice, must get the same answer, or an advisor cannot defend it.
 *  - **Deterministic bonds.** The bond leg earns the current 10-year real yield
 *    (DGS10 - T10YIE), held to maturity. That is a defensible expectation for a
 *    bond ladder and avoids pretending we can forecast a bond path.
 */
import { derive, type DataPoint } from '../provenance.ts';

/** Deterministic 32-bit PRNG (mulberry32). Same seed -> same path, always. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PricePoint {
  date: string;
  value: number | null;
}

/**
 * Convert a price-level series and a CPI series into annual real total-return-ish
 * observations. It is a price return, not a total return: we do not have dividend
 * data, so the result is deliberately conservative for equity (understates returns
 * by roughly the dividend yield). The method string says so.
 */
export function toAnnualRealReturns(
  prices: PricePoint[],
  cpi: PricePoint[],
): { years: number[]; realReturns: number[] } {
  const priceByYear = yearEnd(prices);
  const cpiByYear = yearEnd(cpi);
  const years = [...priceByYear.keys()].filter((y) => cpiByYear.has(y) && priceByYear.has(y - 1) && cpiByYear.has(y - 1)).sort((a, b) => a - b);

  const realReturns: number[] = [];
  for (const y of years) {
    const p0 = priceByYear.get(y - 1)!;
    const p1 = priceByYear.get(y)!;
    const c0 = cpiByYear.get(y - 1)!;
    const c1 = cpiByYear.get(y)!;
    if (p0 <= 0 || c0 <= 0) continue;
    const nominal = p1 / p0 - 1;
    const inflation = c1 / c0 - 1;
    realReturns.push((1 + nominal) / (1 + inflation) - 1);
  }
  return { years: years.slice(-realReturns.length), realReturns };
}

function yearEnd(series: PricePoint[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of series) {
    if (row.value === null || !Number.isFinite(row.value)) continue;
    const y = Number(row.date.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    out.set(y, row.value); // later rows overwrite: last observation in the year wins
  }
  return out;
}

export interface MonteCarloInput {
  currentAge: number;
  retirementAge: number;
  /** Plan-to age. 95 is a reasonable default; the SSA table runs to 119. */
  planToAge: number;
  /** Investable assets today, real dollars. */
  portfolio: number;
  /** Annual savings before retirement, real dollars. */
  annualContribution: number;
  /** Annual spending in retirement, real dollars, before Social Security. */
  annualSpending: number;
  /** Social Security benefit, real dollars per year. */
  socialSecurity: number;
  socialSecurityStartAge: number;
  /** Pension or other guaranteed income, real dollars per year. */
  pension: number;
  /** 0..1 share in equities. */
  equityWeight: number;
  /** All-in annual fee drag (advisory + fund), e.g. 0.0075. */
  feeRate: number;
  trials: number;
  seed: number;
}

export interface MonteCarloAssumptions {
  /** Historical annual *real* equity returns, e.g. Wilshire 5000 deflated by CPI-U. */
  equityRealReturns: number[];
  /** Current 10-year real yield as a decimal, e.g. 0.019 for 1.9%. */
  bondRealYield: number;
  /** Block length in years for the bootstrap. 5 preserves a typical cycle. */
  blockYears: number;
}

export interface MonteCarloResult {
  successRate: number;
  trials: number;
  medianTerminalWealth: number;
  p10TerminalWealth: number;
  p90TerminalWealth: number;
  /** Median age at which assets are exhausted among failing paths; null if < 5% fail. */
  medianRuinAge: number | null;
  /** Distribution of the year-1 sustainable withdrawal for a 90% success target. */
  sustainableSpending90: number;
  /** Percentile fan for charting: portfolio value at each age. */
  percentilePaths: Array<{ age: number; p10: number; p50: number; p90: number }>;
  assumptions: {
    equityMeanReal: number;
    equityStdReal: number;
    bondRealYield: number;
    equityWeight: number;
    blockYears: number;
    observedYears: number;
    firstObservationYear: number;
    lastObservationYear: number;
    feeRate: number;
  };
  caveats: string[];
}

export function simulate(input: MonteCarloInput, assumptions: MonteCarloAssumptions): DataPoint<MonteCarloResult> {
  const { equityRealReturns, bondRealYield, blockYears } = assumptions;
  if (equityRealReturns.length < blockYears * 2) {
    throw new Error(`need at least ${blockYears * 2} years of real returns, got ${equityRealReturns.length}`);
  }
  if (input.equityWeight < 0 || input.equityWeight > 1) throw new RangeError('equityWeight must be within [0,1]');
  if (input.retirementAge < input.currentAge) throw new RangeError('retirementAge cannot precede currentAge');
  if (input.planToAge <= input.retirementAge) throw new RangeError('planToAge must be after retirementAge');
  if (input.trials < 100) throw new RangeError('trials must be >= 100 for a stable estimate');

  const rng = mulberry32(input.seed);
  const yearsToRetire = input.retirementAge - input.currentAge;
  const totalYears = input.planToAge - input.currentAge;
  const mean = equityRealReturns.reduce((a, b) => a + b, 0) / equityRealReturns.length;
  const std = Math.sqrt(equityRealReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, equityRealReturns.length - 1));

  const terminal: number[] = [];
  const ruinAges: number[] = [];
  const pathsByAge: number[][] = Array.from({ length: totalYears + 1 }, () => []);

  for (let trial = 0; trial < input.trials; trial++) {
    let wealth = input.portfolio;
    const equityPath = bootstrapPath(rng, equityRealReturns, blockYears, totalYears);
    let ruinedAtAge: number | null = null;

    pathsByAge[0]!.push(wealth);

    for (let year = 0; year < totalYears; year++) {
      const age = input.currentAge + year;
      const eq = equityPath[year] ?? mean;
      const blended = input.equityWeight * eq + (1 - input.equityWeight) * bondRealYield;
      const netReturn = blended - input.feeRate;

      const contributing = age < input.retirementAge;
      if (contributing) {
        wealth = wealth * (1 + netReturn) + input.annualContribution;
      } else {
        const guaranteed =
          input.pension + (age >= input.socialSecurityStartAge ? input.socialSecurity : 0);
        const draw = Math.max(0, input.annualSpending - guaranteed);
        wealth = wealth * (1 + netReturn) - draw;
        if (wealth <= 0 && ruinedAtAge === null) {
          ruinedAtAge = age;
          wealth = 0;
        }
      }
      if (wealth < 0) wealth = 0;
      pathsByAge[year + 1]!.push(wealth);
    }

    terminal.push(wealth);
    if (ruinedAtAge !== null) ruinAges.push(ruinedAtAge);
  }

  terminal.sort((a, b) => a - b);
  const successRate = 1 - ruinAges.length / input.trials;

  const percentilePaths = pathsByAge
    .map((values, idx) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        age: input.currentAge + idx,
        p10: round0(quantile(sorted, 0.1)),
        p50: round0(quantile(sorted, 0.5)),
        p90: round0(quantile(sorted, 0.9)),
      };
    })
    .filter((_, idx) => idx % Math.max(1, Math.floor(percentilePathsStride(totalYears))) === 0 || idx === totalYears);

  const result: MonteCarloResult = {
    successRate,
    trials: input.trials,
    medianTerminalWealth: round0(quantile(terminal, 0.5)),
    p10TerminalWealth: round0(quantile(terminal, 0.1)),
    p90TerminalWealth: round0(quantile(terminal, 0.9)),
    medianRuinAge: ruinAges.length >= input.trials * 0.05 ? round0(median(ruinAges)) : null,
    sustainableSpending90: solveSustainableSpending(input, assumptions),
    percentilePaths,
    assumptions: {
      equityMeanReal: round4(mean),
      equityStdReal: round4(std),
      bondRealYield: round4(bondRealYield),
      equityWeight: input.equityWeight,
      blockYears,
      observedYears: equityRealReturns.length,
      firstObservationYear: 0,
      lastObservationYear: 0,
      feeRate: input.feeRate,
    },
    caveats: [
      'Equity returns are price returns (no dividends), so the equity assumption is conservative by roughly the dividend yield.',
      'Bonds are modelled as a held-to-maturity ladder earning the current 10-year real yield, not as a traded bond fund.',
      'The bootstrap resamples history; it cannot produce a regime that has not happened. Sequence risk is preserved within blocks, not across them.',
      'Deterministic taxes, healthcare shocks, long-term-care events and bequests are out of scope for this projection.',
    ],
  };

  return derive(
    result,
    [
      {
        source: 'fred:equity-index+CPIAUCSL',
        sourceKind: 'derived',
        sourceUrl: 'https://fred.stlouisfed.org/series/NASDAQCOM',
        retrievedAt: new Date().toISOString(),
        asOf: null,
        license: 'Public domain — Federal Reserve / BLS via FRED',
        method: `Block bootstrap (${blockYears}-year blocks) over ${equityRealReturns.length} annual real return observations; ` +
          `bond leg at the current 10-year real yield ${(bondRealYield * 100).toFixed(2)}%.`,
        staleAfterSeconds: 7 * 24 * 3600,
      },
    ],
    `Seeded Monte Carlo, ${input.trials} trials, seed ${input.seed}, ${blockYears}-year block bootstrap over ` +
      `${equityRealReturns.length} annual real return observations. Bond leg at the current 10-year real yield ` +
      `${(bondRealYield * 100).toFixed(2)}%. Reproducible given the same inputs and calibration.`,
  );
}

function percentilePathsStride(totalYears: number): number {
  return Math.max(1, Math.ceil(totalYears / 25));
}

function bootstrapPath(rng: () => number, series: number[], blockYears: number, length: number): number[] {
  const out: number[] = [];
  const maxStart = Math.max(0, series.length - blockYears);
  while (out.length < length) {
    const start = Math.floor(rng() * (maxStart + 1));
    for (let i = 0; i < blockYears && out.length < length; i++) {
      out.push(series[Math.min(series.length - 1, start + i)] as number);
    }
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sorted[base] as number;
  const hi = sorted[Math.min(base + 1, sorted.length - 1)] as number;
  return lo + rest * (hi - lo);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

/**
 * Bisection on spending to hit a 90% success target. This is the number advisors
 * actually quote, and deriving it from the simulation keeps it consistent with the
 * headline success rate (a lookup table cannot).
 */
function solveSustainableSpending(input: MonteCarloInput, assumptions: MonteCarloAssumptions): number {
  const target = 0.9;
  const successFor = (spending: number): number => {
    const rng = mulberry32(input.seed ^ 0x9e3779b9);
    const yearsToRetire = input.retirementAge - input.currentAge;
    const totalYears = input.planToAge - input.currentAge;
    let successes = 0;
    const trials = Math.max(200, Math.floor(input.trials / 2));
    for (let t = 0; t < trials; t++) {
      let wealth = input.portfolio;
      const path = bootstrapPath(rng, assumptions.equityRealReturns, assumptions.blockYears, totalYears);
      let alive = true;
      for (let y = 0; y < totalYears; y++) {
        const age = input.currentAge + y;
        const blended = input.equityWeight * (path[y] ?? 0) + (1 - input.equityWeight) * assumptions.bondRealYield;
        const net = blended - input.feeRate;
        if (age < input.retirementAge) wealth = wealth * (1 + net) + input.annualContribution;
        else {
          const guaranteed = input.pension + (age >= input.socialSecurityStartAge ? input.socialSecurity : 0);
          wealth = wealth * (1 + net) - Math.max(0, spending - guaranteed);
          if (wealth <= 0) { alive = false; break; }
        }
      }
      if (alive) successes++;
    }
    return successes / trials;
  };

  let lo = 0;
  let hi = Math.max(input.annualSpending * 2, input.portfolio / 10, 10_000);
  if (successFor(hi) >= target) return round0(hi);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (successFor(mid) >= target) lo = mid;
    else hi = mid;
  }
  return round0((lo + hi) / 2);
}

const round0 = (n: number) => Math.round(n);
const round4 = (n: number) => Math.round(n * 10000) / 10000;
