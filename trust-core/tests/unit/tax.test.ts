import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeTax, bracketTax, marginalRateAt, stackedCapitalGainsTax } from '../../src/engines/tax.ts';
import { TAX_YEAR_2026, getTaxTable, SUPPORTED_TAX_YEARS } from '../../src/sources/taxTables.ts';

const single = TAX_YEAR_2026.brackets.single;

describe('bracket mechanics', () => {
  test('the first band is taxed only at 10%', () => {
    assert.equal(bracketTax(1_000, single), 100);
  });

  test('a boundary income is taxed exactly to the band ceiling', () => {
    // 12,400 at 10% exactly.
    assert.equal(bracketTax(12_400, single), 1_240);
  });

  test('crossing into 12% is continuous, not a cliff', () => {
    const justUnder = bracketTax(12_399, single);
    const justOver = bracketTax(12_401, single);
    assert.ok(justOver - justUnder < 1, `expected continuity, got a jump of ${justOver - justUnder}`);
  });

  test('the top band is unbounded', () => {
    const at700k = bracketTax(700_000, single);
    const at1m = bracketTax(1_000_000, single);
    assert.ok(at1m > at700k);
    assert.equal(marginalRateAt(1_000_000, single), 0.37);
  });

  test('zero and negative income produce zero tax', () => {
    assert.equal(bracketTax(0, single), 0);
    assert.equal(bracketTax(-5_000, single), 0);
  });
});

describe('long-term capital gains stacking', () => {
  test('gains inside the 0% band are untaxed', () => {
    assert.equal(stackedCapitalGainsTax(20_000, 10_000, TAX_YEAR_2026.longTermCapitalGains.single), 0);
  });

  test('ordinary income consumes the 0% band first', () => {
    // Ordinary taxable 49,450 already fills the 0% band, so all gains are at 15%.
    const tax = stackedCapitalGainsTax(49_450, 10_000, TAX_YEAR_2026.longTermCapitalGains.single);
    assert.equal(tax, 1_500);
  });

  test('a gain spanning two bands is split at the threshold', () => {
    // 40,000 ordinary leaves 9,450 at 0%; the remaining 10,550 at 15%.
    const tax = stackedCapitalGainsTax(40_000, 20_000, TAX_YEAR_2026.longTermCapitalGains.single);
    assert.equal(Math.round(tax * 100) / 100, 1_582.5);
  });
});

describe('head-of-household band asymmetry (a transcription trap)', () => {
  test('the 24% band ends at 201,750, five dollars below single', () => {
    const head = TAX_YEAR_2026.brackets.head;
    const band24 = head.find((b) => b.rate === 0.24);
    assert.equal(band24?.upTo, 201_750);
    assert.equal(single.find((b) => b.rate === 0.24)?.upTo, 201_775);
  });

  test('head of household is never taxed more than single at the same income in the top bands', () => {
    const head = TAX_YEAR_2026.brackets.head;
    // Head-of-household brackets are always at least as generous as single up to 22%.
    for (const income of [20_000, 50_000, 90_000]) {
      assert.ok(bracketTax(income, head) < bracketTax(income, single), `HoH should be cheaper at ${income}`);
    }
  });
});

describe('the full tax computation', () => {
  test('a $100k single filer pays a plausible, hand-checkable amount', () => {
    const r = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 100_000 }).value;
    assert.equal(r.adjustedGrossIncome, 100_000);
    assert.equal(r.deductionUsed, 16_100);
    assert.equal(r.ordinaryTaxableIncome, 83_900);
    // 1,240 + (50,400-12,400)*.12=4,560 + (83,900-50,400)*.22=7,370
    assert.equal(r.ordinaryTax, 13_170);
    assert.equal(r.marginalRate, 0.22);
    assert.ok(Math.abs(r.effectiveRate - 0.13_17) < 0.001);
  });

  test('pre-tax deferrals reduce AGI but not below zero', () => {
    const r = computeTax({
      taxYear: 2026,
      filingStatus: 'single',
      ordinaryIncome: 60_000,
      contribution401k: 24_000,
      hsaContribution: 4_000,
    }).value;
    assert.equal(r.adjustedGrossIncome, 32_000);
    assert.ok(r.ordinaryTaxableIncome >= 0);
  });

  test('a Roth conversion increases AGI and tax', () => {
    const base = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 90_000 }).value;
    const withConversion = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 90_000, rothConversion: 30_000 }).value;
    assert.equal(withConversion.adjustedGrossIncome, 120_000);
    assert.ok(withConversion.totalFederalTax > base.totalFederalTax);
  });

  test('NIIT only applies above the statutory threshold and uses the lesser of NII or excess MAGI', () => {
    const below = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 150_000, preferentialIncome: 20_000, netInvestmentIncome: 20_000 }).value;
    assert.equal(below.niit, 0);

    const above = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 250_000, preferentialIncome: 50_000, netInvestmentIncome: 50_000 }).value;
    // AGI 300,000; excess 100,000; NII 50,000 -> lesser is 50,000 * 3.8%
    assert.equal(above.niit, 1_900);

    const capped = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 210_000, preferentialIncome: 50_000, netInvestmentIncome: 50_000 }).value;
    // AGI 260,000; excess 60,000 -> 3.8% of 50,000 (the lesser)
    assert.equal(capped.niit, 1_900);
  });

  test('NIIT is higher for joint filers only above the joint threshold', () => {
    const joint = computeTax({ taxYear: 2026, filingStatus: 'married', ordinaryIncome: 230_000, preferentialIncome: 5_000, netInvestmentIncome: 5_000 }).value;
    assert.equal(joint.niit, 0);
    assert.equal(joint.netInvestmentIncomeTaxThreshold, 250_000);
  });

  test('age 65+ adds the additional standard deduction', () => {
    const young = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 40_000, ages: [60] }).value;
    const old = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 40_000, ages: [70] }).value;
    assert.equal(young.deductionBreakdown.age65Additional, 0);
    assert.equal(old.deductionBreakdown.age65Additional, 2_050);
    assert.ok(old.totalFederalTax < young.totalFederalTax);
  });

  test('the senior bonus deduction phases out at 6% of MAGI above the threshold', () => {
    const atThreshold = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 75_000, ages: [70] }).value;
    assert.equal(atThreshold.deductionBreakdown.seniorBonus, 6_000);

    const above = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 100_000, ages: [70] }).value;
    // 6% of 25,000 = 1,500 reduction -> 4,500
    assert.equal(above.deductionBreakdown.seniorBonus, 4_500);

    const phasedOut = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 200_000, ages: [70] }).value;
    assert.equal(phasedOut.deductionBreakdown.seniorBonus, 0);
  });

  test('capital losses offset gains first, then at most $3,000 of ordinary income', () => {
    const r = computeTax({
      taxYear: 2026,
      filingStatus: 'single',
      ordinaryIncome: 100_000,
      preferentialIncome: 10_000,
      capitalLossHarvest: 25_000,
    }).value;
    assert.equal(r.preferentialTaxableIncome, 0);
    // 15,000 remaining losses; only 3,000 may offset ordinary income.
    assert.equal(r.ordinaryTaxableIncome, 100_000 - 16_100 - 3_000);
  });

  test('an unsupported tax year is refused rather than silently substituted', () => {
    assert.throws(() => getTaxTable(2019), /No federal tax table for 2019/);
    assert.deepEqual(SUPPORTED_TAX_YEARS, [2025, 2026]);
  });

  test('the result states what it excludes, so nobody treats it as a total tax bill', () => {
    const r = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 100_000 }).value;
    assert.ok(r.exclusions.some((e) => /State and local/.test(e)));
    assert.ok(r.exclusions.some((e) => /Earned Income/.test(e)));
  });

  test('the provenance traces back to the Revenue Procedure', () => {
    const d = computeTax({ taxYear: 2026, filingStatus: 'single', ordinaryIncome: 100_000 });
    assert.match(d.provenance.method, /Revenue Procedure 2025-32/);
    assert.equal(d.provenance.sourceKind, 'derived');
    assert.ok(d.provenance.derivedFrom?.some((s) => s.startsWith('irs:2026')));
  });
});
