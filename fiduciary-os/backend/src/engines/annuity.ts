/**
 * annuity.ts - actuarial pricing of an income annuity from first principles.
 *
 * income x sum over payment years of ( v^t x P(payment is made) x COLA^(t - start) ) = premium x (1 - load)
 *
 * It is a fair-value illustration: no carrier margin, no surrender terms, no credit risk, no quote.
 * The discount rate is an input and defaults to a placeholder, because a real rate must come from
 * a dated source (the Treasury curve in trust-core) and a licensed quoting partner.
 */
import { pmt } from './timeValue';
import { lifeExpectancy, survival, type Sex } from './mortality';

export interface AnnuityInput {
  premium: number;
  purchaseAge: number;
  deferralYears: number;
  sex: Sex;
  /** Annual discount rate, e.g. 0.045. */
  discountRate: number;
  /** Annual cost-of-living growth applied to income once payments start. */
  colaRate: number;
  /** Joint life: survivor continues at this share of income (0 to 1). Omit for single life. */
  joint?: { age: number; sex: Sex; survivorShare: number };
  /** Fraction of premium kept by the insurer, default 0. */
  loadShare?: number;
}

export interface AnnuityResult {
  annualIncome: number;
  monthlyIncome: number;
  payoutRatePct: number;
  incomeStartAge: number;
  lifeExpectancyAtPurchase: number;
  probabilityAlive: { age75?: number; age85: number; age90: number };
  breakEvenAge: number | null;
  /** What the same premium would pay as a 20-year term-certain with no mortality, for contrast. */
  termCertain20YearMonthly: number;
  assumptions: string[];
}

const MAX_YEARS = 70;
const MONTHLY_ADJUSTMENT = 11 / 24; // ä(12) is approximately ä(1) - 11/24

export function priceAnnuity(input: AnnuityInput): AnnuityResult {
  const { premium, purchaseAge, deferralYears, sex, discountRate, colaRate, joint } = input;
  if (!(premium > 0)) throw new RangeError('premium must be positive');
  if (!(discountRate > -0.5 && discountRate < 0.5)) throw new RangeError('discountRate out of range');
  const load = input.loadShare ?? 0;
  const v = 1 / (1 + discountRate);

  const paid = (t: number): number => {
    const a = survival(purchaseAge, t, sex);
    if (!joint) return a;
    const b = survival(joint.age, t, joint.sex);
    const both = a * b;
    const exactlyOne = a * (1 - b) + b * (1 - a);
    return both + joint.survivorShare * exactlyOne;
  };

  let factor = 0;
  for (let t = deferralYears; t < MAX_YEARS; t++) {
    factor += Math.pow(v, t) * paid(t) * Math.pow(1 + colaRate, t - deferralYears);
  }
  const firstPaymentWeight = Math.pow(v, deferralYears) * paid(deferralYears);
  const monthlyFactor = factor - MONTHLY_ADJUSTMENT * firstPaymentWeight;
  if (!(monthlyFactor > 0)) throw new RangeError('annuity factor is not positive for these inputs');

  const net = premium * (1 - load);
  const annualIncome = net / monthlyFactor;

  let cumulative = 0;
  let breakEvenAge: number | null = null;
  for (let t = deferralYears; t < MAX_YEARS && breakEvenAge === null; t++) {
    cumulative += annualIncome * Math.pow(1 + colaRate, t - deferralYears);
    if (cumulative >= premium) breakEvenAge = purchaseAge + t + 1;
  }

  const alive = (age: number): number => (age > purchaseAge ? survival(purchaseAge, age - purchaseAge, sex) : 1);
  const assumptions = [
    `Mortality: SSA period life table 2023 (${sex}); no future longevity improvement.`,
    `Discount rate ${(discountRate * 100).toFixed(2)}% is an input, not a market quote.`,
    `Income grows ${(colaRate * 100).toFixed(1)}% a year after it starts.`,
    joint ? `Joint life, survivor receives ${Math.round(joint.survivorShare * 100)}%; spouse age ${joint.age}, ${joint.sex}.` : 'Single life.',
    'No carrier margin, fees, surrender terms or credit risk. Real quotes will differ, usually lower.',
  ];

  return {
    annualIncome,
    monthlyIncome: annualIncome / 12,
    payoutRatePct: (annualIncome / premium) * 100,
    incomeStartAge: purchaseAge + deferralYears,
    lifeExpectancyAtPurchase: lifeExpectancy(purchaseAge, sex),
    probabilityAlive: { age75: alive(75), age85: alive(85), age90: alive(90) },
    breakEvenAge,
    termCertain20YearMonthly: -pmt(discountRate / 12, 240, premium),
    assumptions,
  };
}
