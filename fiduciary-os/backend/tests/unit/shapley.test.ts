import {
  DEFAULT_FOUR_FACTORS,
  computeFourFactorShapley,
  normalizeShapBasisPoints,
} from '../../src/services/shapleyService';

describe('Exact 4-Factor Shapley Attribution Service', () => {
  it('evaluates all 16 coalitions and sums strictly to 10,000 bps with zero additivity error', () => {
    const result = computeFourFactorShapley({
      savingsRateContrib: 0.373,
      employerMatchContrib: 0.181,
      lowFeeIndexBenefit: 0.229,
      taxDeferralCompounding: 0.144,
    });

    expect(result.coalitionsEvaluated).toBe(16);
    expect(result.sumBps).toBe(10000);
    expect(result.additivityError).toBe(0);
    expect(result.efficiencyError).toBeLessThan(1e-12);
    expect(Object.values(result.basisPoints).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('satisfies the symmetry axiom for identical factor weights', () => {
    const result = computeFourFactorShapley({
      savingsRateContrib: 0.25,
      employerMatchContrib: 0.25,
      lowFeeIndexBenefit: 0.25,
      taxDeferralCompounding: 0.25,
      synergyWeight: 0.3,
    });

    expect(result.basisPoints.savings_rate_contrib).toBe(2500);
    expect(result.basisPoints.employer_match_contrib).toBe(2500);
    expect(result.basisPoints.low_fee_index_benefit).toBe(2500);
    expect(result.basisPoints.tax_deferral_compounding).toBe(2500);
    expect(result.sumBps).toBe(10000);
  });

  it('satisfies the dummy player axiom (zero-weight player receives zero attribution)', () => {
    const result = computeFourFactorShapley({
      savingsRateContrib: 0.6,
      employerMatchContrib: 0,
      lowFeeIndexBenefit: 0.4,
      taxDeferralCompounding: 0,
      synergyWeight: 0.5,
    });

    expect(result.rawValues.employer_match_contrib).toBe(0);
    expect(result.rawValues.tax_deferral_compounding).toBe(0);
    expect(result.basisPoints.employer_match_contrib).toBe(0);
    expect(result.basisPoints.tax_deferral_compounding).toBe(0);
    expect(result.sumBps).toBe(10000);
    expect(result.additivityError).toBe(0);
  });

  it('satisfies efficiency under positive pairwise synergy (sum of Shapley values === v(N))', () => {
    const result = computeFourFactorShapley({
      savingsRateContrib: 0.45,
      employerMatchContrib: 0.2,
      lowFeeIndexBenefit: 0.25,
      taxDeferralCompounding: 0.1,
      synergyWeight: 0.35,
    });

    const sumPhi = Object.values(result.rawValues).reduce((a, b) => a + b, 0);
    expect(Math.abs(sumPhi - result.grandCoalitionValue)).toBeLessThan(1e-12);
    expect(result.grandCoalitionValue).toBeGreaterThan(1.0);
    expect(result.sumBps).toBe(10000);
    expect(result.additivityError).toBe(0);
  });

  it('falls back cleanly on zero or empty inputs', () => {
    const fallback = normalizeShapBasisPoints({ a: 0, b: 0, c: 0 });
    expect(Object.values(fallback).reduce((a, b) => a + b, 0)).toBe(10000);

    const defaults = computeFourFactorShapley();
    expect(defaults.rawValues.savings_rate_contrib).toBeCloseTo(DEFAULT_FOUR_FACTORS.savings_rate_contrib, 12);
    expect(defaults.sumBps).toBe(10000);
  });

  it('is strictly deterministic across repeated invocations including tie-breaking', () => {
    const input = {
      savingsRateContrib: 1,
      employerMatchContrib: 1,
      lowFeeIndexBenefit: 1,
      taxDeferralCompounding: 0,
    };
    const a = computeFourFactorShapley(input);
    const b = computeFourFactorShapley(input);

    expect(a.basisPoints).toEqual(b.basisPoints);
    expect(a.sumBps).toBe(10000);
    expect(a.additivityError).toBe(0);
  });
});
