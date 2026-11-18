/**
 * taxTables.ts — versioned federal tax parameters, with the receipt attached.
 *
 * Design rule: **a tax year is a released artefact, not a live feed.**
 * Brackets change once a year by Treasury decision (a Revenue Procedure). Fetching
 * them at runtime would add a third-party dependency to the most legally sensitive
 * number in the product for no benefit. So each year is a frozen, reviewed record
 * that cites the Revenue Procedure, and adding a year is a code-reviewed change.
 *
 * The prototype this replaces hard-coded 2024 brackets while telling users the
 * year was 2024 and applying *single* brackets to head-of-household filers. Both
 * failures are structural: a single inline object has no version, no citation, and
 * no test that can catch the next omission. This module fixes that shape.
 *
 * Verified against: IRS Revenue Procedure 2025-32 (tax year 2026), as published
 * and independently tabulated by the Tax Foundation. Every value below is from
 * that procedure, not from memory.
 */

export type FilingStatus = 'single' | 'married' | 'head' | 'separate';

export interface Bracket {
  /** Upper bound of the band, in dollars of taxable income. `Infinity` for the top band. */
  upTo: number;
  rate: number;
}

export interface TaxYearTable {
  year: number;
  /** Primary legal citation. */
  citation: string;
  citationUrl: string;
  /** Secondary human-readable tabulation used to cross-check transcription. */
  crossCheckUrl: string;
  retrievedAt: string;
  standardDeduction: Record<FilingStatus, number>;
  /** Additional standard deduction for a taxpayer aged 65+. Per qualifying spouse when joint. */
  additionalStandardDeduction65: Record<FilingStatus, number>;
  /** OBBBA senior deduction: per qualifying individual aged 65+, phased out by MAGI. */
  seniorDeduction: {
    perPerson: number;
    phaseoutStart: Record<'single' | 'married', number>;
    phaseoutRate: number;
  };
  brackets: Record<Exclude<FilingStatus, 'separate'>, Bracket[]>;
  longTermCapitalGains: Record<Exclude<FilingStatus, 'separate'>, Bracket[]>;
  niit: {
    /** Statutory, not inflation-indexed — unchanged since 2013. */
    threshold: Record<'single' | 'married' | 'head', number>;
    rate: number;
  };
  alternativeMinimumTax: {
    exemption: Record<'single' | 'married', number>;
    phaseoutStart: Record<'single' | 'married', number>;
    rate28Threshold: number;
  };
  childTaxCredit: { perChild: number; refundableMax: number };
  notes: string[];
}

/**
 * Tax year 2026 — the year the platform is being launched into.
 *
 * Head-of-household quirk worth knowing: the 22% band ends at the same $105,700 as
 * single, and the 24% band ends at $201,750 — five dollars *below* the single
 * filer's $201,775. That asymmetry is real in Rev. Proc. 2025-32 and is the kind
 * of thing a hand-typed table gets wrong, which is why the cross-check test pins it.
 */
export const TAX_YEAR_2026: TaxYearTable = {
  year: 2026,
  citation: 'IRS Revenue Procedure 2025-32 — 2026 inflation adjustments',
  citationUrl: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
  crossCheckUrl: 'https://taxfoundation.org/data/all/federal/2026-tax-brackets/',
  retrievedAt: '2026-11-08T00:00:00.000Z',
  standardDeduction: { single: 16_100, married: 32_200, head: 24_150, separate: 16_100 },
  additionalStandardDeduction65: { single: 2_050, married: 1_650, head: 2_050, separate: 1_650 },
  seniorDeduction: {
    perPerson: 6_000,
    phaseoutStart: { single: 75_000, married: 150_000 },
    phaseoutRate: 0.06,
  },
  brackets: {
    single: [
      { upTo: 12_400, rate: 0.1 },
      { upTo: 50_400, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_775, rate: 0.24 },
      { upTo: 256_225, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    married: [
      { upTo: 24_800, rate: 0.1 },
      { upTo: 100_800, rate: 0.12 },
      { upTo: 211_400, rate: 0.22 },
      { upTo: 403_550, rate: 0.24 },
      { upTo: 512_450, rate: 0.32 },
      { upTo: 768_700, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    head: [
      { upTo: 17_700, rate: 0.1 },
      { upTo: 67_450, rate: 0.12 },
      { upTo: 105_700, rate: 0.22 },
      { upTo: 201_750, rate: 0.24 },
      { upTo: 256_200, rate: 0.32 },
      { upTo: 640_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
  longTermCapitalGains: {
    single: [
      { upTo: 49_450, rate: 0 },
      { upTo: 545_500, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
    married: [
      { upTo: 98_900, rate: 0 },
      { upTo: 613_700, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
    head: [
      { upTo: 66_200, rate: 0 },
      { upTo: 579_600, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
  },
  niit: {
    threshold: { single: 200_000, married: 250_000, head: 200_000 },
    rate: 0.038,
  },
  alternativeMinimumTax: {
    exemption: { single: 90_100, married: 140_200 },
    phaseoutStart: { single: 500_000, married: 1_000_000 },
    rate28Threshold: 244_500,
  },
  childTaxCredit: { perChild: 2_200, refundableMax: 1_700 },
  notes: [
    'OBBBA (July 2025) made the TCJA individual rate structure permanent and applied a 4% inflation adjustment to the 10% and 12% band ceilings and 2.3% to higher bands.',
    'The $6,000 senior deduction phases out at 6% of MAGI above $75,000 single / $150,000 joint and is available for 2025-2028 only.',
    'NIIT thresholds are statutory and have never been indexed; they are the same for 2013 and 2026.',
    'State income tax is deliberately out of scope here. Do not present a total tax figure as if it included state tax.',
    'Tax year 2027 parameters were released separately (Rev. Proc. 2026-xx) and are not yet represented; the engine refuses unknown years rather than guessing.',
  ],
};


/**
 * Tax year 2025 — needed because households and advisors routinely model a prior
 * year, and because a platform that can only answer for "this year" cannot
 * back-test a plan.
 *
 * Verified against IRS Revenue Procedure 2024-40, with the standard deduction
 * reflecting the OBBBA expansion as published in Publication 17 (2025): $15,750
 * single / $31,500 joint / $23,625 head of household — higher than the
 * pre-OBBBA 2025 figures still quoted by many calculators.
 */
export const TAX_YEAR_2025: TaxYearTable = {
  year: 2025,
  citation: 'IRS Revenue Procedure 2024-40 (2025 inflation adjustments), with OBBBA standard deduction per Publication 17 (2025)',
  citationUrl: 'https://www.irs.gov/pub/irs-drop/rp-24-40.pdf',
  crossCheckUrl: 'https://taxfoundation.org/data/all/federal/2025-tax-brackets/',
  retrievedAt: '2026-11-08T00:00:00.000Z',
  standardDeduction: { single: 15_750, married: 31_500, head: 23_625, separate: 15_750 },
  additionalStandardDeduction65: { single: 2_000, married: 1_600, head: 2_000, separate: 1_600 },
  seniorDeduction: {
    perPerson: 6_000,
    phaseoutStart: { single: 75_000, married: 150_000 },
    phaseoutRate: 0.06,
  },
  brackets: {
    single: [
      { upTo: 11_925, rate: 0.1 },
      { upTo: 48_475, rate: 0.12 },
      { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 },
      { upTo: 250_525, rate: 0.32 },
      { upTo: 626_350, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    married: [
      { upTo: 23_850, rate: 0.1 },
      { upTo: 96_950, rate: 0.12 },
      { upTo: 206_700, rate: 0.22 },
      { upTo: 394_600, rate: 0.24 },
      { upTo: 501_050, rate: 0.32 },
      { upTo: 751_600, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
    head: [
      { upTo: 17_000, rate: 0.1 },
      { upTo: 64_850, rate: 0.12 },
      { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 },
      { upTo: 250_500, rate: 0.32 },
      { upTo: 626_350, rate: 0.35 },
      { upTo: Infinity, rate: 0.37 },
    ],
  },
  longTermCapitalGains: {
    single: [
      { upTo: 48_350, rate: 0 },
      { upTo: 533_400, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
    married: [
      { upTo: 96_700, rate: 0 },
      { upTo: 600_050, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
    head: [
      { upTo: 64_750, rate: 0 },
      { upTo: 566_700, rate: 0.15 },
      { upTo: Infinity, rate: 0.2 },
    ],
  },
  niit: { threshold: { single: 200_000, married: 250_000, head: 200_000 }, rate: 0.038 },
  alternativeMinimumTax: {
    exemption: { single: 88_100, married: 137_000 },
    phaseoutStart: { single: 626_350, married: 1_252_700 },
    rate28Threshold: 239_100,
  },
  childTaxCredit: { perChild: 2_200, refundableMax: 1_700 },
  notes: [
    'The 2025 standard deduction reflects the OBBBA increase; pre-OBBBA tables circulating online show $15,000 / $30,000 / $22,500 and are now wrong.',
    'The $6,000 senior deduction is available for 2025-2028 and phases out at 6% of MAGI above $75,000 single / $150,000 joint.',
    'NIIT thresholds are statutory and unindexed, identical to 2026.',
    'State income tax is out of scope.',
  ],
};

const TABLES: Record<number, TaxYearTable> = { 2025: TAX_YEAR_2025, 2026: TAX_YEAR_2026 };

export const SUPPORTED_TAX_YEARS = Object.keys(TABLES).map(Number).sort();

export function getTaxTable(year: number): TaxYearTable {
  const table = TABLES[year];
  if (!table) {
    throw new RangeError(
      `No federal tax table for ${year}. Supported: ${SUPPORTED_TAX_YEARS.join(', ')}. ` +
        'Falling back to another year would silently produce a wrong tax number.',
    );
  }
  return table;
}

export const LATEST_TAX_YEAR = Math.max(...SUPPORTED_TAX_YEARS);
