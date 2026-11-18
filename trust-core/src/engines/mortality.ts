/**
 * mortality.ts — survival probabilities from the official SSA period life table.
 *
 * Why a shipped table instead of a live call: `ssa.gov` blocks automated clients
 * (verified: HTTP 403 for both browser and bot user agents, and it is fronted by
 * a bot manager that also rejects HEAD requests). A mortality table is also the
 * one input where a mid-year change would be *wrong* to pick up silently — the
 * Social Security Trustees publish a new period table once a year with the annual
 * report, and any advisory model citing it must be able to say which vintage it used.
 *
 * So the table is a versioned artefact with a citation, refreshed by a reviewed
 * code change, exactly like the tax tables. This is the correct treatment for
 * published statistical tables; treating them as a live feed is how models end up
 * quietly inconsistent between two runs of the same projection.
 */
import { point, type DataPoint, type Provenance } from '../provenance.ts';
import table from '../data/ssa-period-life-table-2023.json' with { type: 'json' };

export type Sex = 'male' | 'female';

export const MORTALITY_PROVENANCE: Provenance = {
  source: `ssa:period-life-table:${table.id}`,
  sourceKind: 'bundled-official',
  sourceUrl: table.sourceUrl,
  retrievedAt: table.retrievedAt,
  asOf: '2023-12-31',
  license: table.license,
  method: `${table.title}. qx values for exact ages ${table.ageStart}-${table.ageEnd} as published; no smoothing applied.`,
  staleAfterSeconds: 365 * 24 * 3600,
};

const AGE_START: number = table.ageStart;
const AGE_END: number = table.ageEnd;

function qx(age: number, sex: Sex): number {
  const series = table.qx[sex];
  if (age < AGE_START) return series[0] ?? 1;
  const idx = age - AGE_START;
  if (idx >= series.length) return 1;
  return series[idx] ?? 1;
}

/**
 * Survival probability from `fromAge` to `toAge` (i.e. being alive at the end of
 * `toAge - fromAge` policy years). Uses the life table's `qx`, so it is a *period*
 * table projection: it assumes today's age-specific mortality persists, which
 * understates longevity improvement. That bias is documented rather than hidden,
 * because it makes annuity payouts slightly conservative.
 */
export function survivalProbability(fromAge: number, toAge: number, sex: Sex): number {
  if (toAge <= fromAge) return 1;
  let s = 1;
  for (let age = fromAge; age < toAge; age++) {
    s *= 1 - qx(age, sex);
    if (s <= 0) return 0;
  }
  return s;
}

/** Expected additional years of life at `age`. */
export function lifeExpectancy(age: number, sex: Sex): number {
  let e = 0;
  let s = 1;
  for (let a = age; a < AGE_END + 1; a++) {
    const next = s * (1 - qx(a, sex));
    // Trapezoidal contribution: half a year for the year of death.
    e += (s + next) / 2;
    s = next;
    if (s < 1e-9) break;
  }
  return e;
}

export function survivalCurve(fromAge: number, sex: Sex, maxAge = AGE_END): DataPoint<Array<{ age: number; survival: number }>> {
  const rows: Array<{ age: number; survival: number }> = [];
  let s = 1;
  for (let age = fromAge; age <= maxAge; age++) {
    rows.push({ age, survival: s });
    s *= 1 - qx(age, sex);
  }
  return point(rows, MORTALITY_PROVENANCE);
}

/** Blend two lives by a weighting (e.g. 1.0 = single life, 0.5 = 50% joint survivor benefit). */
export function jointSurvival(fromAgeA: number, sexA: Sex, fromAgeB: number, sexB: Sex, survivorBenefit: number): (t: number) => number {
  return (t: number) => {
    const a = survivalProbability(fromAgeA, fromAgeA + t, sexA);
    const b = survivalProbability(fromAgeB, fromAgeB + t, sexB);
    // Both alive -> full benefit. One alive -> survivorBenefit fraction.
    const both = a * b;
    const exactlyOne = a * (1 - b) + (1 - a) * b;
    return both + survivorBenefit * exactlyOne;
  };
}
