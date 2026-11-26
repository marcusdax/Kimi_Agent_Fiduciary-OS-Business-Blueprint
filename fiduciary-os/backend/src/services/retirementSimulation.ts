/**
 * retirementSimulation.ts — Sprint 2 Real Retirement Monte Carlo & Guardrail Engine.
 *
 * Replaces hard-coded threshold heuristics with a reproducible, seeded 500-path
 * stochastic simulation incorporating:
 *  - Blended equity/bond expected return & volatility
 *  - Annual inflation compounding (default 2.5%)
 *  - Guaranteed monthly income floor (Social Security / pension / annuity)
 *  - Guyton-Klinger style spending guardrails (-10% temporary trim on >15% drawdown)
 *  - Year-1 Sequence-of-Returns shock stress testing
 *
 * Every output carries explicit assumptions and illustrative disclosures.
 */

export interface RetirementSimInput {
  currentAge: number;
  retirementAge: number;
  endAge?: number;
  currentPortfolio: number;
  annualContribution: number;
  monthlyRetirementSpend: number;
  guaranteedMonthlyIncome?: number;
  equityWeight: number; // 0 to 100
  inflationRate?: number; // e.g. 0.025
  yearOneShockPct?: number; // 0, 15, 25
  guardrailsEnabled?: boolean;
  paths?: number;
  seed?: number;
}

export interface AgePercentileRow {
  age: number;
  yearOffset: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

export interface RetirementSimResult {
  engineVersion: string;
  pathsSimulated: number;
  successRate: number;
  medianTerminalWealth: number;
  p10TerminalWealth: number;
  depletionRiskPct: number;
  guardrailsActive: boolean;
  rows: AgePercentileRow[];
  assumptions: {
    blendedNominalReturnPct: number;
    blendedVolatilityPct: number;
    inflationPct: number;
    guaranteedMonthlyIncome: number;
    yearOneShockPct: number;
  };
  source: 'illustrative-simulation';
  illustrative: true;
  disclaimer: string;
}

// Deterministic Mulberry32 PRNG for reproducible simulation paths
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMuller(rand: () => number): number {
  const u1 = Math.max(1e-12, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Math.round(sorted[idx]);
}

export function runRetirementSimulation(input: RetirementSimInput): RetirementSimResult {
  const currentAge = Math.max(20, Math.min(85, Math.round(input.currentAge)));
  const retirementAge = Math.max(currentAge, Math.min(85, Math.round(input.retirementAge)));
  const endAge = Math.max(retirementAge + 5, Math.min(100, Math.round(input.endAge ?? 92)));
  const years = endAge - currentAge;
  const paths = Math.max(100, Math.min(2000, Math.round(input.paths ?? 500)));
  const eq = Math.max(0, Math.min(100, input.equityWeight)) / 100;
  const inflation = input.inflationRate ?? 0.025;
  const guaranteedMonthly = input.guaranteedMonthlyIncome ?? Math.round(input.monthlyRetirementSpend * 0.42);
  const shockPct = Math.max(0, Math.min(50, input.yearOneShockPct ?? 0));
  const guardrails = input.guardrailsEnabled ?? true;

  // Capital market assumptions (illustrative educational baselines)
  const expectedReturn = 0.038 + eq * 0.044; // 3.8% bond -> 8.2% all-equity nominal
  const volatility = 0.055 + eq * 0.115; // 5.5% bond -> 17.0% all-equity std dev

  const rand = mulberry32(input.seed ?? 20261126);
  const snapshotsByYear: number[][] = Array.from({ length: years + 1 }, () => []);
  let survivedCount = 0;

  for (let p = 0; p < paths; p++) {
    let bal = Math.max(0, input.currentPortfolio);
    let peak = bal;
    let depleted = false;
    snapshotsByYear[0].push(bal);

    for (let y = 1; y <= years; y++) {
      const age = currentAge + y;
      const z = boxMuller(rand);
      let annualReturn = expectedReturn - 0.5 * volatility * volatility + volatility * z;
      annualReturn = Math.exp(annualReturn) - 1;

      // Apply Year-1 retirement sequence shock if requested
      if (shockPct > 0 && age === retirementAge + 1) {
        annualReturn = -shockPct / 100;
      }

      if (age <= retirementAge) {
        bal = Math.max(0, bal * (1 + annualReturn) + Math.max(0, input.annualContribution));
        peak = Math.max(peak, bal);
      } else {
        const inflationFactor = Math.pow(1 + inflation, y);
        const netAnnualNeed = Math.max(0, (input.monthlyRetirementSpend - guaranteedMonthly) * 12) * inflationFactor;
        const drawdown = peak > 0 ? (peak - bal) / peak : 0;
        const spendMultiplier = guardrails && drawdown > 0.15 ? 0.9 : 1.0;
        bal = bal * (1 + annualReturn) - netAnnualNeed * spendMultiplier;
        if (bal <= 0) {
          bal = 0;
          depleted = true;
        }
        peak = Math.max(peak, bal);
      }

      snapshotsByYear[y].push(bal);
    }

    if (!depleted && bal > 0) survivedCount++;
  }

  // Build milestone rows (every 5 years + exact endAge)
  const milestoneOffsets: number[] = [];
  for (let y = 0; y <= years; y += 5) milestoneOffsets.push(y);
  if (milestoneOffsets[milestoneOffsets.length - 1] !== years) milestoneOffsets.push(years);

  const rows: AgePercentileRow[] = milestoneOffsets.map((y) => {
    const sorted = [...snapshotsByYear[y]].sort((a, b) => a - b);
    return {
      age: currentAge + y,
      yearOffset: y,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    };
  });

  const finalRow = rows[rows.length - 1];
  const successRate = Math.round((survivedCount / paths) * 100);

  return {
    engineVersion: 'fiduciary-mc-guardrail@1.1.0',
    pathsSimulated: paths,
    successRate,
    medianTerminalWealth: finalRow.median,
    p10TerminalWealth: finalRow.p10,
    depletionRiskPct: 100 - successRate,
    guardrailsActive: guardrails,
    rows,
    assumptions: {
      blendedNominalReturnPct: Number((expectedReturn * 100).toFixed(2)),
      blendedVolatilityPct: Number((volatility * 100).toFixed(2)),
      inflationPct: Number((inflation * 100).toFixed(2)),
      guaranteedMonthlyIncome: guaranteedMonthly,
      yearOneShockPct: shockPct,
    },
    source: 'illustrative-simulation',
    illustrative: true,
    disclaimer:
      'Illustrative Monte Carlo simulation using assumed capital-market parameters and simplified guardrails. Not a guarantee of future performance or individualized investment advice.',
  };
}
