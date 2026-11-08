/**
 * engines/tax.ts — deterministic federal income tax, from the versioned table.
 *
 * Scope discipline is the point of this file. It computes *federal individual
 * income tax* for a modelled household, and it refuses to compute anything it
 * cannot do correctly:
 *
 *   - No state tax. (Asked for it? It says so instead of pretending.)
 *   - No EITC / CTC / education credits in the headline number, because a partial
 *     credit calc is worse than none: it looks authoritative and is wrong for the
 *     households that need it most. `childTaxCredit` is returned separately and
 *     clearly labelled as a gross, pre-phaseout amount.
 *   - No "estimated taxes owed" framing without saying what is excluded.
 *
 * What it *does* do properly, because these are the levers advisors actually pull:
 *   - ordinary brackets with the correct standard deduction per filing status
 *   - age-65 additional standard deduction and the OBBBA senior deduction with its
 *     MAGI phaseout
 *   - long-term capital gains stacked on top of ordinary income (0/15/20%)
 *   - the 3.8% net investment income tax with its statutory thresholds
 *   - marginal *and* effective rate, computed where they are actually defined
 */
import { getTaxTable, type FilingStatus, type TaxYearTable, type Bracket } from '../sources/taxTables.ts';
import { derive, userInput, type DataPoint } from '../provenance.ts';

export interface TaxInput {
  taxYear: number;
  filingStatus: FilingStatus;
  /** W-2 wages, self-employment profit, interest, non-qualified dividends, IRA withdrawals. */
  ordinaryIncome: number;
  /** Long-term capital gains plus qualified dividends. */
  preferentialIncome?: number;
  /** Pre-tax 401(k)/403(b) deferral. Reduces ordinary income, not the contribution itself. */
  contribution401k?: number;
  /** Roth conversion: adds to ordinary income in the conversion year. */
  rothConversion?: number;
  /** Realised capital losses used to offset gains (and up to $3,000 of ordinary income). */
  capitalLossHarvest?: number;
  /** HSA contribution via payroll (pre-tax). */
  hsaContribution?: number;
  /** Qualified charitable distribution from an IRA: excluded from income, not a deduction. */
  qcdAmount?: number;
  /** Ages of the taxpayer and, if joint, the spouse. Drives the 65+ deductions. */
  ages?: number[];
  /** Number of qualifying children, used only for the separately reported CTC. */
  qualifyingChildren?: number;
  /** Net investment income for NIIT. Defaults to `preferentialIncome` when omitted. */
  netInvestmentIncome?: number;
}

export interface TaxResult {
  taxYear: number;
  filingStatus: FilingStatus;
  adjustedGrossIncome: number;
  deductionUsed: number;
  deductionBreakdown: {
    standard: number;
    age65Additional: number;
    seniorBonus: number;
  };
  taxableIncome: number;
  ordinaryTaxableIncome: number;
  preferentialTaxableIncome: number;
  ordinaryTax: number;
  capitalGainsTax: number;
  niit: number;
  totalFederalTax: number;
  /** The rate on the next dollar of ordinary income. */
  marginalRate: number;
  /** Total federal tax over AGI. Not the same thing as marginal — clients conflate them. */
  effectiveRate: number;
  /** Gross, pre-phaseout. Reported separately on purpose. */
  childTaxCreditGross: number;
  netInvestmentIncomeTaxThreshold: number;
  /** Plain-language list of what is NOT in this number. Surfaced in the API response. */
  exclusions: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const safe = (n: number | undefined) => (Number.isFinite(n) ? Math.max(0, n as number) : 0);

/** Progressive tax inside a bracket table, for an amount already net of deductions. */
export function bracketTax(amount: number, brackets: Bracket[]): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const band of brackets) {
    if (amount <= lower) break;
    const slice = Math.min(amount, band.upTo) - lower;
    if (slice > 0) tax += slice * band.rate;
    lower = band.upTo;
  }
  return tax;
}

/** The rate that applies to the next dollar of the given amount. */
export function marginalRateAt(amount: number, brackets: Bracket[]): number {
  let lower = 0;
  for (const band of brackets) {
    if (amount <= band.upTo && amount >= lower) return band.rate;
    lower = band.upTo;
  }
  return brackets[brackets.length - 1]?.rate ?? 0;
}

/**
 * Tax on preferential income that sits *on top of* ordinary taxable income.
 * The 0% bracket is consumed by ordinary income first — this is the single most
 * commonly botched part of a retail "capital gains calculator".
 */
export function stackedCapitalGainsTax(ordinaryTaxable: number, preferential: number, brackets: Bracket[]): number {
  if (preferential <= 0) return 0;
  const start = Math.max(0, ordinaryTaxable);
  const end = start + preferential;
  let tax = 0;
  let lower = 0;
  for (const band of brackets) {
    const segStart = Math.max(start, lower);
    const segEnd = Math.min(end, band.upTo);
    if (segEnd > segStart) tax += (segEnd - segStart) * band.rate;
    lower = band.upTo;
    if (lower >= end) break;
  }
  return tax;
}

function deductionFor(
  table: TaxYearTable,
  status: FilingStatus,
  ages: number[],
  magi: number,
): { total: number; standard: number; age65Additional: number; seniorBonus: number } {
  const standard = table.standardDeduction[status];
  const over65 = ages.filter((a) => a >= 65).length;
  const perPersonAdditional = table.additionalStandardDeduction65[status];
  const age65Additional = over65 * perPersonAdditional;

  // OBBBA senior deduction: $6,000 per qualifying individual 65+, reduced by 6% of
  // MAGI above the threshold, floored at zero, and applied per person.
  const joint = status === 'married';
  const start = joint ? table.seniorDeduction.phaseoutStart.married : table.seniorDeduction.phaseoutStart.single;
  const excess = Math.max(0, magi - start);
  const reductionPerPerson = excess * table.seniorDeduction.phaseoutRate;
  const seniorPerPerson = Math.max(0, table.seniorDeduction.perPerson - reductionPerPerson);
  const seniorBonus = over65 * seniorPerPerson;

  return { total: standard + age65Additional + seniorBonus, standard, age65Additional, seniorBonus };
}

export function computeTax(input: TaxInput): DataPoint<TaxResult> {
  const table = getTaxTable(input.taxYear);
  const status = input.filingStatus;
  if (!status || !(status in table.brackets || status === 'separate')) {
    throw new RangeError(`unknown filingStatus "${String(status)}"; expected single, married, head or separate`);
  }
  const ages = input.ages && input.ages.length > 0 ? input.ages : [40];

  const grossOrdinary = safe(input.ordinaryIncome) + safe(input.rothConversion);
  const preTaxDeferrals = safe(input.contribution401k) + safe(input.hsaContribution);
  const qcd = safe(input.qcdAmount);
  const losses = safe(input.capitalLossHarvest);

  // Capital losses first offset preferential income, then up to $3,000 of ordinary
  // income per year. Anything beyond that carries forward and is NOT deducted here.
  const preferentialGross = safe(input.preferentialIncome);
  const gainOffset = Math.min(losses, preferentialGross);
  const preferentialNet = Math.max(0, preferentialGross - gainOffset);

  const ordinaryBase = Math.max(0, grossOrdinary - preTaxDeferrals - qcd);
  // AGI includes preferential income: this matters for NIIT, for every MAGI-based
  // phaseout, and for the senior deduction below.
  const agi = ordinaryBase + preferentialNet;
  const deduction = deductionFor(table, status, ages, agi);

  // The standard deduction offsets ordinary income first, and preferential income
  // only takes what is left. Getting this order wrong silently understates the
  // capital gains tax of every household with mostly-gain income.
  const ordinaryAfterDeduction = Math.max(0, ordinaryBase - deduction.total);
  const preferential = Math.max(0, agi - deduction.total - ordinaryAfterDeduction);
  // A capital loss carryforward offsets ordinary income, so it reduces total taxable
  // income rather than reclassifying ordinary income as preferential.
  const ordinaryLossOffset = Math.min(Math.max(0, losses - gainOffset), 3_000);
  const ordinaryTaxable = Math.max(0, ordinaryAfterDeduction - ordinaryLossOffset);
  const totalTaxable = ordinaryTaxable + preferential;

  const ordinaryTax = bracketTax(ordinaryTaxable, table.brackets[status === 'separate' ? 'single' : status]);
  const capitalGainsTax = stackedCapitalGainsTax(
    ordinaryTaxable,
    preferential,
    table.longTermCapitalGains[status === 'separate' ? 'single' : status],
  );

  const niitKey = status === 'married' ? 'married' : status === 'head' ? 'head' : 'single';
  const niitThreshold = table.niit.threshold[niitKey];
  const nii = safe(input.netInvestmentIncome ?? input.preferentialIncome);
  const niit = Math.max(0, Math.min(nii, Math.max(0, agi - niitThreshold))) * table.niit.rate;

  const totalFederalTax = ordinaryTax + capitalGainsTax + niit;
  const childTaxCreditGross = safe(input.qualifyingChildren) * table.childTaxCredit.perChild;

  const result: TaxResult = {
    taxYear: input.taxYear,
    filingStatus: status,
    adjustedGrossIncome: round2(agi),
    deductionUsed: round2(deduction.total),
    deductionBreakdown: {
      standard: deduction.standard,
      age65Additional: deduction.age65Additional,
      seniorBonus: round2(deduction.seniorBonus),
    },
    taxableIncome: round2(totalTaxable),
    ordinaryTaxableIncome: round2(ordinaryTaxable),
    preferentialTaxableIncome: round2(preferential),
    ordinaryTax: round2(ordinaryTax),
    capitalGainsTax: round2(capitalGainsTax),
    niit: round2(niit),
    totalFederalTax: round2(totalFederalTax),
    marginalRate: marginalRateAt(ordinaryTaxable, table.brackets[status === 'separate' ? 'single' : status]),
    effectiveRate: agi > 0 ? totalFederalTax / agi : 0,
    childTaxCreditGross,
    netInvestmentIncomeTaxThreshold: niitThreshold,
    exclusions: [
      'State and local income tax',
      'Earned Income Tax Credit, Child and Dependent Care Credit, education credits',
      'Itemised deductions (this uses the standard deduction only)',
      'Alternative Minimum Tax top-up',
      'Self-employment tax; Social Security and Medicare withholding',
      'Capital loss carryforwards beyond the $3,000 annual ordinary-income offset',
    ],
  };

  if (childTaxCreditGross > 0) {
    result.exclusions.push(
      `Child Tax Credit is reported gross (${childTaxCreditGross}); phaseout at higher income is not applied`,
    );
  }

  return derive(
    result,
    [
      {
        source: `irs:${table.year}:rev-proc`,
        sourceKind: 'bundled-official',
        sourceUrl: table.citationUrl,
        retrievedAt: table.retrievedAt,
        asOf: `${table.year}-12-31`,
        license: 'Public domain — US Government work (IRS Revenue Procedure)',
        method: `${table.citation}; cross-checked against ${table.crossCheckUrl}`,
        staleAfterSeconds: 365 * 24 * 3600,
      },
      userInput('annual income and elected strategies'),
    ],
    `${table.citation}. Federal income tax for tax year ${table.year}: ordinary brackets after the standard ` +
      'deduction, age-65 and OBBBA senior deductions, capital gains stacked on ordinary income, and NIIT.',
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convenience wrapper used by the HTTP layer's strategy-comparison endpoint. */
export function compareStrategies(base: TaxInput, strategies: Array<Partial<TaxInput>>): Array<{ strategy: Partial<TaxInput>; result: TaxResult; delta: number }> {
  const baseline = computeTax(base).value;
  return strategies.map((s) => {
    const result = computeTax({ ...base, ...s }).value;
    return { strategy: s, result, delta: round2(baseline.totalFederalTax - result.totalFederalTax) };
  });
}
