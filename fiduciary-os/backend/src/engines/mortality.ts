/**
 * mortality.ts - survival probabilities from the SSA period life table (public domain).
 * The table is a versioned artefact with a citation, refreshed by a reviewed change, not a live feed.
 */
import table from '../data/ssa-period-life-table-2023.json';

export type Sex = 'male' | 'female';

export const MORTALITY_SOURCE = {
  id: table.id,
  title: table.title,
  sourceUrl: table.sourceUrl,
  license: table.license,
  retrievedAt: table.retrievedAt,
} as const;

const AGE_START: number = table.ageStart;
const qxSeries = table.qx as Record<Sex, number[]>;

function qx(age: number, sex: Sex): number {
  const series = qxSeries[sex];
  if (age < AGE_START) return series[0] ?? 1;
  const idx = age - AGE_START;
  return idx >= series.length ? 1 : (series[idx] ?? 1);
}

/** Probability of being alive `years` years after `fromAge` (period table: no future improvement). */
export function survival(fromAge: number, years: number, sex: Sex): number {
  let s = 1;
  for (let k = 0; k < years; k++) {
    s *= 1 - qx(Math.floor(fromAge) + k, sex);
    if (s <= 0) return 0;
  }
  return s;
}

/** Curtate expected additional years of life. */
export function lifeExpectancy(age: number, sex: Sex): number {
  let total = 0;
  for (let t = 1; t <= 120; t++) total += survival(age, t, sex);
  return total;
}
