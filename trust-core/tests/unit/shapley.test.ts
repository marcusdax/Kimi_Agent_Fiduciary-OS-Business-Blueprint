import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFourFactorShapley,
  normalizeShapBasisPoints,
} from '../../src/engines/shapley.ts';

test('computeFourFactorShapley evaluates all 16 coalitions and sums strictly to 10,000 bps', () => {
  const result = computeFourFactorShapley({
    savingsRateContrib: 0.373,
    employerMatchContrib: 0.181,
    lowFeeIndexBenefit: 0.229,
    taxDeferralCompounding: 0.144,
    synergyWeight: 0.25,
  });

  assert.equal(result.coalitionsEvaluated, 16);
  assert.equal(result.sumBps, 10000);
  assert.equal(result.additivityError, 0);
  assert.ok(result.efficiencyError < 1e-12);
});

test('computeFourFactorShapley satisfies symmetry and dummy-player axioms', () => {
  const symmetric = computeFourFactorShapley({
    savingsRateContrib: 0.25,
    employerMatchContrib: 0.25,
    lowFeeIndexBenefit: 0.25,
    taxDeferralCompounding: 0.25,
    synergyWeight: 0.4,
  });
  assert.equal(symmetric.basisPoints.savings_rate_contrib, 2500);
  assert.equal(symmetric.basisPoints.employer_match_contrib, 2500);
  assert.equal(symmetric.basisPoints.low_fee_index_benefit, 2500);
  assert.equal(symmetric.basisPoints.tax_deferral_compounding, 2500);

  const withDummy = computeFourFactorShapley({
    savingsRateContrib: 0.6,
    employerMatchContrib: 0,
    lowFeeIndexBenefit: 0.4,
    taxDeferralCompounding: 0,
    synergyWeight: 0.5,
  });
  assert.equal(withDummy.rawValues.employer_match_contrib, 0);
  assert.equal(withDummy.rawValues.tax_deferral_compounding, 0);
  assert.equal(withDummy.basisPoints.employer_match_contrib, 0);
  assert.equal(withDummy.basisPoints.tax_deferral_compounding, 0);
  assert.equal(withDummy.sumBps, 10000);
});

test('normalizeShapBasisPoints falls back cleanly on zero inputs and is deterministic', () => {
  const fallback = normalizeShapBasisPoints({ a: 0, b: 0 });
  const sum = Object.values(fallback).reduce((acc, v) => acc + v, 0);
  assert.equal(sum, 10000);

  const r1 = computeFourFactorShapley({ savingsRateContrib: 1, employerMatchContrib: 1, lowFeeIndexBenefit: 1, taxDeferralCompounding: 0 });
  const r2 = computeFourFactorShapley({ savingsRateContrib: 1, employerMatchContrib: 1, lowFeeIndexBenefit: 1, taxDeferralCompounding: 0 });
  assert.deepEqual(r1.basisPoints, r2.basisPoints);
  assert.equal(r1.sumBps, 10000);
});
