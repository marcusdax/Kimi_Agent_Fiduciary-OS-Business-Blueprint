/**
 * tax.ts - versioned federal income tax tables for the illustrative tax calculator.
 *
 * A tax year is a released artefact: each table cites its source and is added by reviewed change.
 * 2026 matches IRS Revenue Procedure 2025-32 (the same values trust-core cross-checks against the
 * Tax Foundation tabulation). 2024 is kept so the earlier behaviour can be reproduced. This is
 * federal ordinary income tax only: no state tax, credits, AMT or capital-gains stacking.
 */
export type FilingStatus = 'single' | 'married' | 'head';
export type Band = [upTo: number, rate: number];

export interface TaxYearTable {
  year: number;
  citation: string;
  standardDeduction: Record<FilingStatus, number>;
  brackets: Record<FilingStatus, Band[]>;
}

export const TAX_TABLES: Record<number, TaxYearTable> = {
  2024: {
    year: 2024,
    citation: 'IRS Revenue Procedure 2023-34',
    standardDeduction: { single: 14600, married: 29200, head: 21900 },
    brackets: {
      single: [[11600, 0.1], [47150, 0.12], [100525, 0.22], [191950, 0.24], [243725, 0.32], [609350, 0.35], [Infinity, 0.37]],
      married: [[23200, 0.1], [94300, 0.12], [201050, 0.22], [383900, 0.24], [487450, 0.32], [731200, 0.35], [Infinity, 0.37]],
      head: [[16550, 0.1], [63100, 0.12], [100500, 0.22], [191950, 0.24], [243700, 0.32], [609350, 0.35], [Infinity, 0.37]],
    },
  },
  2026: {
    year: 2026,
    citation: 'IRS Revenue Procedure 2025-32 (as tabulated by the Tax Foundation); confirm against the IRS release before client use',
    standardDeduction: { single: 16100, married: 32200, head: 24150 },
    brackets: {
      single: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
      married: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
      head: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
    },
  },
};

export const DEFAULT_TAX_YEAR = 2026;
export const SUPPORTED_TAX_YEARS = Object.keys(TAX_TABLES).map(Number);

export function incomeTax(year: number, status: FilingStatus, grossIncome: number): { tax: number; marginalRate: number } {
  const table = TAX_TABLES[year];
  if (!table) throw new RangeError(`tax year ${year} is not supported (have ${SUPPORTED_TAX_YEARS.join(', ')})`);
  let remaining = Math.max(0, grossIncome - table.standardDeduction[status]);
  let tax = 0;
  let prev = 0;
  let marginalRate = 0;
  for (const [limit, rate] of table.brackets[status]) {
    const band = Math.min(remaining, limit - prev);
    if (band > 0) {
      tax += band * rate;
      marginalRate = rate;
    }
    remaining -= band;
    prev = limit;
    if (remaining <= 0) break;
  }
  return { tax, marginalRate };
}
