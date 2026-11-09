/**
 * retirement.ts - historical-cycle retirement test (method after cFIREsim, Apache-2.0).
 *
 * For every historical start year the portfolio is run through the real (after-inflation)
 * returns that followed, under a withdrawal rule. The share of start years that never run out is
 * reported, with the worst window named. Windows overlap and 1928-2024 gives a small sample, so
 * this describes what history did, not a forecast or a probability.
 */
import data from '../data/historical-returns.json';
import { priceAnnuity } from './annuity';

export type Strategy = 'fixed' | 'dynamic' | 'guardrails' | 'annuity';

export interface RetirementInput {
  portfolio: number;
  /** First-year spending that must come from the portfolio, in today's dollars. */
  annualNetSpending: number;
  horizonYears: number;
  stockShare: number; // 0..1
  strategy: Strategy;
  retirementAge?: number;
}

export interface RetirementResult {
  windows: number;
  successRatePct: number;
  worstStartYear: number;
  worstEndingReal: number;
  medianEndingReal: number;
  p10EndingReal: number;
  p90EndingReal: number;
  unfundedInWorstWindow: number;
  method: string;
  assumptions: string[];
}

const ROWS = data.rows as number[][];
export const HISTORY_YEARS = { first: ROWS[0][0], last: ROWS[ROWS.length - 1][0] };

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

interface WindowOutcome { ok: boolean; ending: number; unfunded: number }

function runWindow(i0: number, input: RetirementInput): WindowOutcome {
  const { horizonYears, stockShare, strategy } = input;
  let balance = input.portfolio;
  let annuityReal0 = 0;
  let cumInflation = 1;
  if (strategy === 'annuity') {
    // Put 30% of the portfolio into a life income annuity (fair value, 4.5%, no COLA), paid in nominal dollars.
    const spend = Math.min(input.portfolio * 0.3, input.portfolio);
    const age = input.retirementAge ?? 65;
    const m = priceAnnuity({ premium: spend, purchaseAge: age, deferralYears: 0, sex: 'male', discountRate: 0.045, colaRate: 0 });
    const f = priceAnnuity({ premium: spend, purchaseAge: age, deferralYears: 0, sex: 'female', discountRate: 0.045, colaRate: 0 });
    annuityReal0 = (m.annualIncome + f.annualIncome) / 2;
    balance -= spend;
  }
  const w0 = input.annualNetSpending;
  const rate0 = input.portfolio > 0 ? w0 / input.portfolio : 0;
  let w = w0;
  let unfunded = 0;
  let failed = false;
  for (let t = 0; t < horizonYears; t++) {
    const [, stock, bond, infl] = ROWS[i0 + t];
    if (t > 0) cumInflation *= 1 + ROWS[i0 + t - 1][3] / 100;
    if (strategy === 'dynamic' && balance > 0) {
      w = Math.min(w * 1.1, Math.max(w * 0.9, rate0 * balance));
    } else if (strategy === 'guardrails' && balance > 0) {
      const current = w / balance;
      if (current > rate0 * 1.2) w *= 0.9;
      else if (current < rate0 * 0.8) w *= 1.1;
    }
    const income = strategy === 'annuity' ? annuityReal0 / cumInflation : 0;
    const need = Math.max(0, w - income);
    if (balance >= need) balance -= need;
    else { unfunded += need - balance; balance = 0; failed = true; }
    const nominal = stockShare * (stock / 100) + (1 - stockShare) * (bond / 100);
    balance *= (1 + nominal) / (1 + infl / 100);
  }
  return { ok: !failed, ending: balance, unfunded };
}

export function runRetirement(input: RetirementInput): RetirementResult {
  const { horizonYears } = input;
  if (!(input.portfolio > 0)) throw new RangeError('portfolio must be positive');
  if (!(input.annualNetSpending >= 0)) throw new RangeError('spending cannot be negative');
  if (!Number.isInteger(horizonYears) || horizonYears < 5 || horizonYears > 60) throw new RangeError('horizonYears must be 5 to 60');
  if (input.stockShare < 0 || input.stockShare > 1) throw new RangeError('stockShare must be between 0 and 1');
  const starts = ROWS.length - horizonYears + 1;
  if (starts < 10) throw new RangeError('horizon too long for the history available');

  const outcomes: Array<WindowOutcome & { start: number }> = [];
  for (let i = 0; i < starts; i++) outcomes.push({ ...runWindow(i, input), start: ROWS[i][0] });
  const ok = outcomes.filter((o) => o.ok).length;
  const endings = outcomes.map((o) => o.ending).sort((a, b) => a - b);
  const worst = outcomes.reduce((a, b) => (b.ending < a.ending || (b.ending === a.ending && b.unfunded > a.unfunded) ? b : a));
  return {
    windows: outcomes.length,
    successRatePct: (ok / outcomes.length) * 100,
    worstStartYear: worst.start,
    worstEndingReal: worst.ending,
    medianEndingReal: percentile(endings, 0.5),
    p10EndingReal: percentile(endings, 0.1),
    p90EndingReal: percentile(endings, 0.9),
    unfundedInWorstWindow: worst.unfunded,
    method: `Historical-cycle replay: ${outcomes.length} overlapping ${horizonYears}-year windows, ${HISTORY_YEARS.first}-${HISTORY_YEARS.last}. Describes what history did; it is not a forecast or a probability.`,
    assumptions: [
      'US stocks (S&P 500 total return) and 10-year Treasury bonds, rebalanced yearly; no fees or taxes.',
      `Stock share ${Math.round(input.stockShare * 100)}%. All figures are in real (after-inflation) dollars.`,
      `Withdrawal rule: ${input.strategy}.`,
      'Social Security and pensions are assumed to keep pace with inflation and are already netted out of spending.',
      `Data: ${data.source}.`,
    ],
  };
}

/** Highest first-year net spending that still passes at least `targetPct` of historical windows. */
export function sustainableSpending(base: Omit<RetirementInput, 'annualNetSpending'>, targetPct = 90): number {
  let lo = 0;
  let hi = base.portfolio * 0.2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const r = runRetirement({ ...base, annualNetSpending: mid });
    if (r.successRatePct >= targetPct) lo = mid; else hi = mid;
  }
  return lo;
}
