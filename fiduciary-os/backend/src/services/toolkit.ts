import { z } from 'zod';

export type Field = {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};
const money = (key: string, label: string): Field => ({
  key,
  label: `${label} (USD)`,
  min: 0,
  max: 1000000000,
  step: 0.01,
});
const number = (key: string, label: string, min: number, max: number, step = 1): Field => ({
  key,
  label,
  min,
  max,
  step,
});
const choice = (key: string, label: string, options: string[]): Field => ({ key, label, options });
export const catalog = {
  profile: {
    title: 'Profile & goals',
    note: 'User-entered planning facts; no AI score or recommended allocation.',
    fields: [
      number('age', 'Current age', 18, 100),
      number('retirementAge', 'Target retirement age', 18, 110),
      money('income', 'Annual income'),
      money('spending', 'Monthly spending'),
      money('liquid', 'Liquid savings'),
      choice('goal', 'Primary goal', ['retirement', 'growth', 'protection', 'income', 'legacy']),
    ],
  },
  annuity: {
    title: 'Annuity navigator',
    note: 'Finite term-certain mathematical payout, not a carrier quote, life-contingent benefit, guarantee or product recommendation. Enter your own rate.',
    fields: [
      money('principal', 'Principal'),
      number('rate', 'Assumed effective annual rate (%)', 0, 15, 0.01),
      number('deferral', 'Deferral years', 0, 30),
      number('years', 'Payout term years', 1, 50),
    ],
  },
  life: {
    title: 'Life insurance needs',
    note: 'Undiscounted needs gap, not underwriting, policy selection or premium quote. Health/gender/tobacco pricing requires a consented insurer integration.',
    fields: [
      money('income', 'Annual income to replace'),
      number('years', 'Replacement years', 1, 50),
      money('debt', 'Debts'),
      money('education', 'Education needs'),
      money('assets', 'Available assets'),
      money('coverage', 'Existing coverage'),
    ],
  },
  investment: {
    title: 'Investment X-Ray',
    note: 'Constant nominal contributions at year end; growth before annual asset fee. Assumptions, not live returns. No tax or efficient-frontier inference.',
    fields: [
      money('principal', 'Starting investments'),
      money('contribution', 'Annual contribution'),
      number('rate', 'Assumed annual return (%)', -50, 20, 0.01),
      number('fee', 'Annual asset fee (%)', 0, 5, 0.01),
      number('years', 'Horizon years', 1, 60),
      number('equity', 'Equity allocation (%)', 0, 100),
      number('international', 'International share of equities (%)', 0, 100),
    ],
  },
  retirement: {
    title: 'Retirement income',
    note: 'Deterministic annual depletion scenario; no Monte Carlo success rate, historical backtest, RMD, survivor or Social Security entitlement calculation. Enter benefits already estimated by SSA/pension provider.',
    fields: [
      money('principal', 'Retirement assets'),
      money('spending', 'Monthly spending'),
      money('social', 'Monthly Social Security estimate'),
      money('pension', 'Monthly pension'),
      number('rate', 'Assumed annual return (%)', -50, 20, 0.01),
      number('fee', 'Annual asset fee (%)', 0, 5, 0.01),
      number('inflation', 'Annual spending inflation (%)', 0, 15, 0.01),
      number('years', 'Retirement years', 1, 60),
    ],
  },
  tax: {
    title: '2026 federal tax schedule',
    note: 'Rev. Proc. 2025-32 ordinary-income schedule illustration for under-65 single/joint filers using basic standard deduction only. Not a return or current-law certification: excludes credits, payroll/state tax, AMT, NIIT, capital gains, Social Security, age/blind deductions and contribution eligibility.',
    fields: [
      choice('filing', 'Filing status', ['single', 'joint']),
      money('income', 'Ordinary income before conversion'),
      money('conversion', 'Additional taxable Roth conversion'),
    ],
  },
  risk: {
    title: 'Risk stress test',
    note: 'User-defined one-period shock, not a historical replay, recovery forecast, beta, Sharpe ratio or VaR. Shocks do not model correlations.',
    fields: [
      money('equities', 'Equities'),
      money('bonds', 'Bonds'),
      money('cash', 'Cash'),
      money('crypto', 'Digital assets'),
      number('equityShock', 'Equity shock (%)', -100, 100),
      number('bondShock', 'Bond shock (%)', -100, 100),
      number('cryptoShock', 'Digital asset shock (%)', -100, 100),
    ],
  },
  estate: {
    title: 'Estate liquidity',
    note: 'Inventory and immediate liquidity gap only; no estate tax, gifting eligibility, probate determination or legal advice.',
    fields: [
      money('assets', 'Total assets'),
      money('debts', 'Debts'),
      money('liquid', 'Available liquid assets'),
      money('needs', 'Immediate settlement cash needs'),
    ],
  },
  willtrust: {
    title: 'Will & trust preparation',
    note: 'Attorney discussion checklist only, not legal documents, structure selection or execution. No signing, notarization, trust funding or legal-sufficiency claim.',
    fields: [
      choice('will', 'Will reviewed with attorney', ['not reviewed', 'reviewed']),
      choice('beneficiaries', 'Beneficiary designations reviewed', ['not reviewed', 'reviewed']),
      choice('fiduciaries', 'Executor/trustee discussion completed', ['not reviewed', 'reviewed']),
      choice('funding', 'Trust funding reviewed with attorney', ['not reviewed', 'reviewed']),
    ],
  },
  crypto: {
    title: 'Digital assets holdings',
    note: 'Manual units/cost basis, not connected accounts. CoinGecko observations are separate, attributed and timestamped; no buy ratings, targets or legal-status claims.',
    fields: ['BTC', 'ETH', 'XRP', 'SOL', 'ADA'].flatMap(symbol => [
      number(symbol, `${symbol} units`, 0, 100000000, 0.00000001),
      money(`${symbol}Cost`, `${symbol} total cost basis`),
    ]),
  },
};
export type ToolKind = keyof typeof catalog;
export const kinds = Object.keys(catalog) as ToolKind[];
export const kindSchema = z.enum(kinds as [ToolKind, ...ToolKind[]]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    v =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= new Date().toISOString().slice(0, 10)
  );
export function inputSchema(kind: ToolKind) {
  const shape: Record<string, z.ZodType> = {
    source: z.string().trim().min(1).max(120),
    asOfDate: date,
  };
  for (const field of catalog[kind].fields as Field[])
    shape[field.key] = field.options
      ? z.enum(field.options as [string, ...string[]])
      : z
          .number()
          .finite()
          .min(field.min!)
          .max(field.max!)
          .refine(v =>
            field.step === 1
              ? Number.isInteger(v)
              : field.step === 0.01
                ? Math.abs(v * 100 - Math.round(v * 100)) < 0.00001
                : true
          );
  return z.object(shape).strict();
}
const round = (n: number) => {
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new Error('Result outside supported range');
  return Math.round(n * 100) / 100;
};
export function scheduleTax(income: number, joint: boolean) {
  const caps = joint
    ? [24800, 100800, 211400, 403550, 512450, 768700]
    : [12400, 50400, 105700, 201775, 256225, 640600];
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  const taxable = Math.max(0, income - (joint ? 32200 : 16100));
  let tax = 0,
    prev = 0,
    marginal = 0;
  for (let i = 0; i < rates.length; i++) {
    const amount = Math.max(0, Math.min(taxable, caps[i] ?? Infinity) - prev);
    tax += amount * rates[i];
    if (amount > 0) marginal = rates[i];
    prev = caps[i];
  }
  return { taxable, tax: round(tax), marginal: marginal * 100 };
}
export function calculate(kind: ToolKind, values: unknown) {
  const data = inputSchema(kind).parse(values);
  const n = (key: string) => Number(data[key]);
  const metrics: { label: string; value: number; unit: string }[] = [];
  const rows: { year: number; balance: number; comparison?: number; unfunded?: number }[] = [];
  const metric = (label: string, value: number, unit = 'USD') =>
    metrics.push({ label, value: round(value), unit });
  if (kind === 'profile') {
    if (n('retirementAge') < n('age'))
      throw new Error('Target retirement age cannot precede current age');
    metric('Years to target', n('retirementAge') - n('age'), 'years');
    metric('Annual cash-flow surplus', n('income') - n('spending') * 12);
    if (n('spending') > 0) metric('Liquid spending runway', n('liquid') / n('spending'), 'months');
  }
  if (kind === 'annuity') {
    const balance = n('principal') * (1 + n('rate') / 100) ** n('deferral');
    const rate = (1 + n('rate') / 100) ** (1 / 12) - 1;
    const months = n('years') * 12;
    const payment = rate === 0 ? balance / months : (balance * rate) / (1 - (1 + rate) ** -months);
    metric('Deferred principal', balance);
    metric('Monthly term-certain payout', payment);
    let b = balance;
    rows.push({ year: 0, balance: round(b) });
    for (let year = 1; year <= n('years'); year++) {
      for (let m = 0; m < 12; m++) b = Math.max(0, b * (1 + rate) - payment);
      rows.push({ year, balance: round(b) });
    }
  }
  if (kind === 'life') {
    const needs = n('income') * n('years') + n('debt') + n('education');
    metric('Gross needs', needs);
    metric('Unfunded coverage gap', Math.max(0, needs - n('assets') - n('coverage')));
  }
  if (kind === 'investment' || kind === 'retirement') {
    let b = n('principal'),
      baseline = b,
      gap = 0;
    rows.push({ year: 0, balance: round(b), comparison: round(baseline), unfunded: 0 });
    for (let year = 1; year <= n('years'); year++) {
      const flow =
        kind === 'investment'
          ? n('contribution')
          : (n('social') +
              n('pension') -
              n('spending') * (1 + n('inflation') / 100) ** (year - 1)) *
            12;
      const after = b * (1 + n('rate') / 100) * (1 - n('fee') / 100) + flow;
      gap += Math.max(0, -after);
      b = Math.max(0, after);
      baseline = Math.max(0, baseline * (1 + n('rate') / 100) + flow);
      rows.push({ year, balance: round(b), comparison: round(baseline), unfunded: round(gap) });
    }
    metric('Ending assets after fees', b);
    metric('Ending assets without fees', baseline);
    if (kind === 'investment') {
      metric('Ending fee drag', baseline - b);
      metric(
        'Domestic equities',
        ((n('principal') * n('equity')) / 100) * (1 - n('international') / 100)
      );
      metric(
        'International equities',
        (((n('principal') * n('equity')) / 100) * n('international')) / 100
      );
      metric('Other assets', n('principal') * (1 - n('equity') / 100));
    } else metric('Cumulative unfunded spending', gap);
  }
  if (kind === 'tax') {
    const before = scheduleTax(n('income'), data.filing === 'joint');
    const after = scheduleTax(n('income') + n('conversion'), data.filing === 'joint');
    metric('Taxable ordinary income after conversion', after.taxable);
    metric('Schedule tax before conversion', before.tax);
    metric('Schedule tax after conversion', after.tax);
    metric('Incremental conversion tax', after.tax - before.tax);
    metric('Marginal schedule rate', after.marginal, '%');
  }
  if (kind === 'risk') {
    const before = n('equities') + n('bonds') + n('cash') + n('crypto');
    const after =
      n('equities') * (1 + n('equityShock') / 100) +
      n('bonds') * (1 + n('bondShock') / 100) +
      n('cash') +
      n('crypto') * (1 + n('cryptoShock') / 100);
    metric('Starting assets', before);
    metric('Stressed assets', after);
    metric('Dollar impact', after - before);
    rows.push({ year: 0, balance: round(before) }, { year: 1, balance: round(after) });
  }
  if (kind === 'estate') {
    if (n('liquid') > n('assets')) throw new Error('Liquid assets cannot exceed total assets');
    metric('Net inventory', n('assets') - n('debts'));
    metric('Immediate liquidity shortfall', Math.max(0, n('needs') - n('liquid')));
  }
  if (kind === 'willtrust')
    metric(
      'Discussion topics reviewed',
      ['will', 'beneficiaries', 'fiduciaries', 'funding'].filter(k => data[k] === 'reviewed')
        .length,
      'of 4'
    );
  if (kind === 'crypto')
    metric(
      'Entered total cost basis',
      ['BTC', 'ETH', 'XRP', 'SOL', 'ADA'].reduce((sum, symbol) => sum + n(`${symbol}Cost`), 0)
    );
  return { methodVersion: 'blueprint-educational-v1', notice: catalog[kind].note, metrics, rows };
}
