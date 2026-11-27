/**
 * engines/shapley.ts — Exact 4-factor cooperative-game Shapley attribution engine.
 *
 * Enumerates all 2^4 = 16 coalitions with optional pairwise synergy and allocates
 * exact 10,000-bps integer basis points via Largest Remainder (Hamilton) rounding.
 */

export const DEFAULT_FOUR_FACTORS = {
  savings_rate_contrib: 0.38,
  employer_match_contrib: 0.18,
  low_fee_index_benefit: 0.24,
  tax_deferral_compounding: 0.20,
} as const;

export type FourFactorKey = keyof typeof DEFAULT_FOUR_FACTORS;

const FACTORIALS = [1, 1, 2, 6, 24] as const;

export interface FourFactorShapleyInput {
  savingsRateContrib?: number;
  employerMatchContrib?: number;
  lowFeeIndexBenefit?: number;
  taxDeferralCompounding?: number;
  synergyWeight?: number;
}

export interface FourFactorShapleyResult {
  rawValues: Record<FourFactorKey, number>;
  basisPoints: Record<string, number>;
  sumBps: number;
  additivityError: number;
  grandCoalitionValue: number;
  efficiencyError: number;
  synergyWeight: number;
  coalitionsEvaluated: number;
}

export function normalizeShapBasisPoints(raw: Record<string, number>): Record<string, number> {
  const entries = Object.entries(raw)
    .filter(([, v]) => Number.isFinite(v) && v >= 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (entries.length === 0 || total <= 0) {
    return {
      savings_rate_contrib: 3800,
      employer_match_contrib: 1800,
      low_fee_index_benefit: 2400,
      tax_deferral_compounding: 2000,
    };
  }

  const floored = entries.map(([k, v]) => {
    const exact = (v / total) * 10000;
    const val = Math.floor(exact);
    return { k, val, rem: exact - val };
  });

  const remainder = 10000 - floored.reduce((s, item) => s + item.val, 0);
  floored.sort((a, b) => {
    const diff = b.rem - a.rem;
    if (Math.abs(diff) > 1e-12) return diff;
    return a.k.localeCompare(b.k);
  });

  for (let i = 0; i < remainder; i++) {
    const target = floored[i % floored.length];
    if (target) target.val += 1;
  }

  const out: Record<string, number> = {};
  for (const item of floored.sort((a, b) => a.k.localeCompare(b.k))) {
    out[item.k] = item.val;
  }
  return out;
}

export function computeFourFactorShapley(input: FourFactorShapleyInput = {}): FourFactorShapleyResult {
  const weights: [number, number, number, number] = [
    sanitizeWeight(input.savingsRateContrib, DEFAULT_FOUR_FACTORS.savings_rate_contrib),
    sanitizeWeight(input.employerMatchContrib, DEFAULT_FOUR_FACTORS.employer_match_contrib),
    sanitizeWeight(input.lowFeeIndexBenefit, DEFAULT_FOUR_FACTORS.low_fee_index_benefit),
    sanitizeWeight(input.taxDeferralCompounding, DEFAULT_FOUR_FACTORS.tax_deferral_compounding),
  ];

  const synergyWeight =
    typeof input.synergyWeight === 'number' && Number.isFinite(input.synergyWeight) && input.synergyWeight >= 0
      ? input.synergyWeight
      : 0;

  const n = 4;
  const coalitionCount = 1 << n;
  const coalitionValues = new Float64Array(coalitionCount);

  for (let mask = 1; mask < coalitionCount; mask++) {
    let linear = 0;
    let synergy = 0;
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const wi = weights[i] ?? 0;
      linear += wi;
      if (synergyWeight > 0) {
        for (let j = i + 1; j < n; j++) {
          if ((mask & (1 << j)) !== 0) {
            const wj = weights[j] ?? 0;
            synergy += Math.sqrt(wi * wj);
          }
        }
      }
    }
    coalitionValues[mask] = linear + synergyWeight * synergy;
  }

  const phi: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    let sum = 0;
    for (let mask = 0; mask < coalitionCount; mask++) {
      if ((mask & bit) !== 0) continue;
      const size = popcount4(mask);
      const num = (FACTORIALS[size] ?? 1) * (FACTORIALS[n - size - 1] ?? 1);
      const weight = num / FACTORIALS[n];
      const marginal = (coalitionValues[mask | bit] ?? 0) - (coalitionValues[mask] ?? 0);
      sum += weight * marginal;
    }
    phi[i] = sum;
  }

  const rawValues: Record<FourFactorKey, number> = {
    savings_rate_contrib: phi[0],
    employer_match_contrib: phi[1],
    low_fee_index_benefit: phi[2],
    tax_deferral_compounding: phi[3],
  };

  const grandCoalitionValue = coalitionValues[coalitionCount - 1] ?? 0;
  const phiSum = phi[0] + phi[1] + phi[2] + phi[3];
  const efficiencyError = Math.abs(phiSum - grandCoalitionValue);

  const basisPoints = normalizeShapBasisPoints(rawValues);
  const sumBps = Object.values(basisPoints).reduce((acc, v) => acc + v, 0);
  const additivityError = Math.abs(sumBps - 10000);

  return {
    rawValues,
    basisPoints,
    sumBps,
    additivityError,
    grandCoalitionValue,
    efficiencyError,
    synergyWeight,
    coalitionsEvaluated: coalitionCount,
  };
}

function sanitizeWeight(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function popcount4(mask: number): number {
  let count = 0;
  let m = mask;
  while (m > 0) {
    count += m & 1;
    m >>= 1;
  }
  return count;
}
