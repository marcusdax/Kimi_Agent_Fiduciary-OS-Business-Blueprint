import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, mulberry32, toAnnualRealReturns } from '../../src/engines/montecarlo.ts';
import { bootstrapDiscountFactors, discountFactorAt, priceAnnuity } from '../../src/engines/annuity.ts';
import { lifeExpectancy, survivalProbability } from '../../src/engines/mortality.ts';
import type { YieldCurveRow } from '../../src/sources/treasury.ts';

// A synthetic but realistically-shaped return series: 40 years, ~7% real mean,
// ~16% volatility, with two genuine drawdowns. Deterministic, so the tests are
// about the engine, not about the market.
const SERIES = (() => {
  const rng = mulberry32(42);
  const out: number[] = [];
  for (let i = 0; i < 40; i++) out.push(0.07 + (rng() - 0.5) * 0.32);
  out[8] = -0.37;
  out[9] = -0.12;
  out[27] = -0.35;
  out[28] = -0.09;
  return out;
})();

const BASE_INPUT = {
  currentAge: 55,
  retirementAge: 65,
  planToAge: 95,
  portfolio: 1_200_000,
  annualContribution: 25_000,
  annualSpending: 90_000,
  socialSecurity: 36_000,
  socialSecurityStartAge: 67,
  pension: 0,
  equityWeight: 0.6,
  feeRate: 0.0075,
  trials: 400,
  seed: 20261108,
};

describe('Monte Carlo retirement engine', () => {
  test('is reproducible for a given seed', () => {
    const a = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 });
    const b = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 });
    assert.equal(a.value.successRate, b.value.successRate);
    assert.deepEqual(a.value.percentilePaths, b.value.percentilePaths);
  });

  test('different seeds move the answer, but not wildly', () => {
    const a = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    const b = simulate({ ...BASE_INPUT, seed: 7 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    assert.ok(Math.abs(a.successRate - b.successRate) < 0.12, `seed sensitivity too high: ${a.successRate} vs ${b.successRate}`);
  });

  test('more spending never increases the success rate', () => {
    const low = simulate({ ...BASE_INPUT, annualSpending: 50_000 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    const high = simulate({ ...BASE_INPUT, annualSpending: 160_000 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    assert.ok(low.successRate > high.successRate, `${low.successRate} should exceed ${high.successRate}`);
    assert.ok(high.successRate < 0.5);
  });

  test('a bigger portfolio improves the outcome', () => {
    const small = simulate({ ...BASE_INPUT, portfolio: 500_000 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    const large = simulate({ ...BASE_INPUT, portfolio: 3_000_000 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    assert.ok(large.successRate > small.successRate);
  });

  test('higher fees reduce the success rate, all else equal', () => {
    const cheap = simulate({ ...BASE_INPUT, feeRate: 0.001 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    const dear = simulate({ ...BASE_INPUT, feeRate: 0.025 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    assert.ok(cheap.successRate > dear.successRate, `${cheap.successRate} should exceed ${dear.successRate}`);
  });

  test('a higher bond yield (better real rates) improves outcomes', () => {
    const low = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: -0.01, blockYears: 5 }).value;
    const high = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.03, blockYears: 5 }).value;
    assert.ok(high.successRate >= low.successRate);
  });

  test('the 90%-success sustainable spending is below current spending for a fragile plan', () => {
    const fragile = simulate({ ...BASE_INPUT, annualSpending: 160_000 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    assert.ok(fragile.sustainableSpending90 < 160_000, `expected a lower sustainable figure, got ${fragile.sustainableSpending90}`);
    assert.ok(fragile.sustainableSpending90 > 0);
  });

  test('percentile paths are monotonic p10 <= p50 <= p90 at every age', () => {
    const r = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }).value;
    for (const row of r.percentilePaths) {
      assert.ok(row.p10 <= row.p50, `p10 > p50 at ${row.age}`);
      assert.ok(row.p50 <= row.p90, `p50 > p90 at ${row.age}`);
    }
  });

  test('the result carries caveats and a reproducibility statement', () => {
    const d = simulate(BASE_INPUT, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 });
    assert.ok(d.value.caveats.length >= 4);
    assert.match(d.provenance.method, /seed 20261108/);
    assert.match(d.provenance.method, /block bootstrap/i);
  });

  test('rejects inputs that cannot produce a meaningful answer', () => {
    assert.throws(() => simulate({ ...BASE_INPUT, retirementAge: 50 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }), /retirementAge/);
    assert.throws(() => simulate({ ...BASE_INPUT, trials: 10 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }), /trials/);
    assert.throws(() => simulate({ ...BASE_INPUT, equityWeight: 1.4 }, { equityRealReturns: SERIES, bondRealYield: 0.02, blockYears: 5 }), /equityWeight/);
    assert.throws(() => simulate(BASE_INPUT, { equityRealReturns: [0.1, 0.2], bondRealYield: 0.02, blockYears: 5 }), /years of real returns/);
  });
});

describe('real-return calibration maths', () => {
  test('deflates nominal index growth by CPI', () => {
    const prices = [
      { date: '2020-12-31', value: 100 },
      { date: '2021-12-31', value: 110 },
    ];
    const cpi = [
      { date: '2020-12-31', value: 260 },
      { date: '2021-12-31', value: 273 },
    ];
    const { realReturns } = toAnnualRealReturns(prices, cpi);
    // nominal 10%, inflation 5% -> real ~4.76%
    assert.equal(realReturns.length, 1);
    assert.ok(Math.abs((realReturns[0] as number) - 0.047619) < 1e-5);
  });

  test('uses the last observation within a year, dropping intra-year noise', () => {
    const prices = [
      { date: '2020-01-15', value: 50 },
      { date: '2020-12-31', value: 100 },
      { date: '2021-12-31', value: 120 },
    ];
    const cpi = [
      { date: '2020-12-31', value: 100 },
      { date: '2021-12-31', value: 100 },
    ];
    const { realReturns } = toAnnualRealReturns(prices, cpi);
    assert.ok(Math.abs((realReturns[0] as number) - 0.2) < 1e-9);
  });
});

describe('annuity pricing', () => {
  const curve: YieldCurveRow = {
    date: '2026-11-06',
    yields: { '1 Yr': 3.95, '2 Yr': 3.8, '3 Yr': 3.75, '5 Yr': 3.9, '7 Yr': 4.05, '10 Yr': 4.12, '20 Yr': 4.7, '30 Yr': 4.68 },
  };

  test('bootstraps a monotonically decreasing discount curve', () => {
    const dfs = bootstrapDiscountFactors(curve);
    assert.ok(dfs.length >= 6);
    for (let i = 1; i < dfs.length; i++) {
      assert.ok((dfs[i]?.df ?? 0) < (dfs[i - 1]?.df ?? 1), 'DF must decrease with maturity when yields are positive');
    }
  });

  test('interpolates discount factors between tenors', () => {
    const dfs = bootstrapDiscountFactors(curve);
    const four = discountFactorAt(dfs, 4);
    const three = discountFactorAt(dfs, 3);
    const five = discountFactorAt(dfs, 5);
    assert.ok(three > four && four > five);
  });

  test('older annuitants get a higher payout rate because the expected payment period is shorter', () => {
    const young = priceAnnuity({ principal: 500_000, startAge: 60, deferralYears: 0, sex: 'male' }, curve).value;
    const old = priceAnnuity({ principal: 500_000, startAge: 80, deferralYears: 0, sex: 'male' }, curve).value;
    assert.ok(old.payoutRate > young.payoutRate, `${old.payoutRate} should exceed ${young.payoutRate}`);
  });

  test('females get a lower payout rate at the same age (longer life expectancy)', () => {
    const male = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    const female = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'female' }, curve).value;
    assert.ok(female.payoutRate < male.payoutRate);
  });

  test('higher interest rates produce a higher payout rate', () => {
    const lowCurve: YieldCurveRow = { date: '2026-11-06', yields: { '1 Yr': 0.5, '2 Yr': 0.5, '3 Yr': 0.5, '5 Yr': 0.5, '7 Yr': 0.5, '10 Yr': 0.5, '20 Yr': 0.6, '30 Yr': 0.6 } };
    const highCurve: YieldCurveRow = { date: '2026-11-06', yields: { '1 Yr': 6, '2 Yr': 6, '3 Yr': 6, '5 Yr': 6, '7 Yr': 6, '10 Yr': 6, '20 Yr': 6, '30 Yr': 6 } };
    const low = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, lowCurve).value;
    const high = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, highCurve).value;
    assert.ok(high.payoutRate > low.payoutRate);
  });

  test('a joint-and-50%-survivor benefit lowers the payout versus life-only', () => {
    const lifeOnly = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    const joint = priceAnnuity(
      { principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male', jointAge: 63, jointSex: 'female', survivorBenefit: 0.5 },
      curve,
    ).value;
    assert.ok(joint.payoutRate < lifeOnly.payoutRate);
  });

  test('a 2% COLA reduces the initial payout but not the expected present value framing', () => {
    const level = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    const cola = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male', colaRate: 0.02 }, curve).value;
    assert.ok(cola.payoutRate < level.payoutRate);
    assert.equal(cola.colaRate, 0.02);
  });

  test('deferral raises the income because the premium accumulates', () => {
    const immediate = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    const deferred = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 10, sex: 'male' }, curve).value;
    assert.ok(deferred.annualIncome > immediate.annualIncome);
  });

  test('a load reduces the payout proportionally', () => {
    const clean = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    const loaded = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male', loadRate: 0.1 }, curve).value;
    assert.ok(Math.abs(loaded.annualIncome / clean.annualIncome - 0.9) < 0.01);
  });

  test('a payout rate of roughly 7-9% at 65 is in the plausible actuarial range', () => {
    const r = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve).value;
    assert.ok(r.payoutRate > 0.055 && r.payoutRate < 0.1, `implausible payout rate ${r.payoutRate}`);
  });

  test('is labelled as a model, not a carrier quote', () => {
    const d = priceAnnuity({ principal: 500_000, startAge: 65, deferralYears: 0, sex: 'male' }, curve);
    assert.match(d.provenance.method, /Excludes insurer expenses/);
    assert.equal(d.provenance.sourceKind, 'derived');
  });

  test('rejects impossible ages and principals', () => {
    assert.throws(() => priceAnnuity({ principal: 0, startAge: 65, deferralYears: 0, sex: 'male' }, curve), /principal/);
    assert.throws(() => priceAnnuity({ principal: 100_000, startAge: 30, deferralYears: 0, sex: 'male' }, curve), /startAge/);
  });
});

describe('mortality table', () => {
  test('survival is monotonic and starts at 1', () => {
    assert.equal(survivalProbability(65, 65, 'male'), 1);
    let previous = 1;
    for (let age = 66; age <= 100; age++) {
      const s = survivalProbability(65, age, 'male');
      assert.ok(s <= previous, `survival increased at ${age}`);
      previous = s;
    }
  });

  test('female life expectancy exceeds male at every tested age', () => {
    for (const age of [55, 65, 75, 85]) {
      assert.ok(lifeExpectancy(age, 'female') > lifeExpectancy(age, 'male'), `age ${age}`);
    }
  });

  test('life expectancy at 65 lands near the published SSA figure (~20 years for a male)', () => {
    const e = lifeExpectancy(65, 'male');
    assert.ok(e > 17 && e < 22, `implausible male life expectancy at 65: ${e}`);
  });

  test('survival beyond 119 is zero rather than extrapolated', () => {
    assert.equal(survivalProbability(100, 130, 'male'), 0);
  });
});
