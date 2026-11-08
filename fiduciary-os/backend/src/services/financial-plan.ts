import { z } from 'zod';

const cents = z.number().int().min(0).max(1e12);
export const financialInputs = z
  .object({
    name: z.string().trim().min(1).max(100),
    asOf: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
        'Use a valid calendar date'
      ),
    source: z.string().trim().min(3).max(300),
    balances: z.object({ cash: cents, bonds: cents, equities: cents, other: cents }).strict(),
    monthlyIncomeCents: cents,
    monthlySpendingCents: cents,
    annualReturnBps: z.number().int().min(-9000).max(2000),
    annualFeeBps: z.number().int().min(0).max(1000),
    annualInflationBps: z.number().int().min(0).max(2000),
    years: z.number().int().min(1).max(60),
  })
  .strict();
export type FinancialInputs = z.infer<typeof financialInputs>;

// Monthly end-of-period cash flow, effective annual growth/fee/inflation rates.
// Balances never become negative: unmet spending is recorded as an unfunded gap.
export function projectPlan(raw: FinancialInputs) {
  const input = financialInputs.parse(raw);
  const initialCents = Object.values(input.balances).reduce((a, b) => a + b, 0);
  const growth = Math.pow(1 + input.annualReturnBps / 10000, 1 / 12);
  const feeFactor = Math.pow(1 - input.annualFeeBps / 10000, 1 / 12);
  const inflation = Math.pow(1 + input.annualInflationBps / 10000, 1 / 12);
  let balance = initialCents;
  let fees = 0;
  let unfunded = 0;
  let depletionMonth: number | null = null;
  const rows = [
    {
      year: 0,
      nominalCents: initialCents,
      realCents: initialCents,
      cumulativeFeesCents: 0,
      cumulativeUnfundedCents: 0,
    },
  ];
  for (let month = 1; month <= input.years * 12; month++) {
    const grown = balance * growth;
    fees += grown * (1 - feeFactor);
    const available = grown * feeFactor + input.monthlyIncomeCents;
    if (available < input.monthlySpendingCents) {
      unfunded += input.monthlySpendingCents - available;
      if (depletionMonth === null) depletionMonth = month;
    }
    balance = Math.max(0, available - input.monthlySpendingCents);
    if (!Number.isFinite(balance) || balance > Number.MAX_SAFE_INTEGER / 2)
      throw new Error('Projection exceeds supported monetary range; reduce inputs or horizon');
    if (month % 12 === 0)
      rows.push({
        year: month / 12,
        nominalCents: Math.round(balance),
        realCents: Math.round(balance / Math.pow(inflation, month)),
        cumulativeFeesCents: Math.round(fees),
        cumulativeUnfundedCents: Math.round(unfunded),
      });
  }
  return {
    methodVersion: 'monthly-cashflow-v1',
    currency: 'USD',
    inputSource: 'manual' as const,
    assumptions:
      'Constant nominal income and spending; effective annual return and percentage asset fee applied monthly before end-of-month cash flow. Inflation deflates balances only. No tax, market-price feed, probability, or investment recommendation.',
    initialCents,
    monthlySurplusCents: input.monthlyIncomeCents - input.monthlySpendingCents,
    depletionMonth,
    rows,
  };
}
