/**
 * engines/annuity.ts — annuity payout factors from a real discount curve and real
 * mortality, replacing a hard-coded multiplier.
 *
 * The prototype it replaces did this:
 *
 *     rate = 0.055 (or 0.065 "indexed"...)  *  (1 + deferralYears * 0.015)
 *
 * Those numbers respond to nothing. They are not derived from interest rates, from
 * age, or from mortality — which means the same 65-year-old and 80-year-old get
 * identical quotes, and the quote does not move when the 10-year Treasury moves
 * 200bp. For a product whose promise is "a clear answer", that is the failure mode
 * that matters most: it is confidently wrong.
 *
 * This engine is an actuarial present value:
 *
 *     annuity factor A(x) = SUM_t  DF(t) * S(x, x+t)
 *     payout rate         = 1 / A(x)
 *
 * where DF(t) is the Treasury discount factor and S is SSA survival. It is still a
 * model — no insurer expenses, no lapses, no credit spread, no commissions — so the
 * output says exactly that, and returns the load-free "money's worth" rate rather
 * than pretending to be a carrier quote.
 */
import { derive, type DataPoint } from '../provenance.ts';
import type { CurveTenor, YieldCurveRow } from '../sources/treasury.ts';
import { survivalProbability, lifeExpectancy, type Sex } from './mortality.ts';

/** Maturity ladder we can read straight off the Treasury par curve, in years. */
const TENOR_YEARS: Array<[CurveTenor, number]> = [
  ['1 Yr', 1],
  ['2 Yr', 2],
  ['3 Yr', 3],
  ['5 Yr', 5],
  ['7 Yr', 7],
  ['10 Yr', 10],
  ['20 Yr', 20],
  ['30 Yr', 30],
];

/**
 * Bootstrap discount factors from a par yield curve.
 *
 * A par bond's coupon equals its yield, so its price is 100 by construction:
 *     1 = y_n * SUM_{k=1..n} DF_k + DF_n
 * which rearranges to the recursion below. This is the standard, correct way to
 * turn Treasury par yields into the discount factors an annuity present value needs.
 */
export function bootstrapDiscountFactors(row: YieldCurveRow): Array<{ t: number; df: number; zeroRate: number }> {
  const points = TENOR_YEARS.map(([tenor, t]) => ({ t, y: row.yields[tenor] })).filter(
    (p): p is { t: number; y: number } => typeof p.y === 'number',
  );
  if (points.length === 0) throw new Error('yield curve has no usable tenors for bootstrapping');

  const out: Array<{ t: number; df: number; zeroRate: number }> = [];

  // A par bond yields its coupon and prices at 100, so for annual coupons:
  //     1 = c * SUM_{k=1..t-1} DF_k + (1 + c) * DF_t
  // which inverts to DF_t = (1 - c * SUM_{k=1..t-1} DF_k) / (1 + c).
  // Years the ladder does not quote are filled by interpolation against points
  // already bootstrapped. Iterating outward keeps every DF strictly decreasing
  // while yields are positive, which a closed-form exponential guess does not
  // guarantee (and a non-monotonic curve produces nonsense annuity factors).
  for (const { t, y } of points) {
    const coupon = y / 100;
    let couponDiscountSum = 0;
    for (let k = 1; k < t; k++) couponDiscountSum += interpolateDf(out, k);
    const df = (1 - coupon * couponDiscountSum) / (1 + coupon);
    if (!(df > 0) || df >= 1) {
      throw new Error(`bootstrap produced an invalid discount factor ${df} at ${t}y — curve is not arbitrage-free`);
    }
    out.push({ t, df, zeroRate: (Math.pow(1 / df, 1 / t) - 1) * 100 });
  }
  return out;
}

/** Log-linear interpolation across the discount factors already bootstrapped. */
function interpolateDf(curve: Array<{ t: number; df: number }>, t: number): number {
  const first = curve[0];
  if (!first) return 1;
  if (t <= first.t) return Math.pow(first.df, t / first.t);
  for (let i = 1; i < curve.length; i++) {
    const lo = curve[i - 1]!;
    const hi = curve[i]!;
    if (t <= hi.t) {
      const w = (t - lo.t) / (hi.t - lo.t);
      return Math.exp(Math.log(lo.df) * (1 - w) + Math.log(hi.df) * w);
    }
  }
  const last = curve[curve.length - 1]!;
  return Math.pow(last.df, t / last.t);
}

/** Linear interpolation of discount factors, flat extrapolation past the last tenor. */
export function discountFactorAt(curve: Array<{ t: number; df: number }>, t: number): number {
  if (t <= 0) return 1;
  const first = curve[0];
  if (!first) throw new Error('empty discount curve');
  if (t <= first.t) return Math.pow(first.df, t / first.t);
  for (let i = 1; i < curve.length; i++) {
    const lo = curve[i - 1]!;
    const hi = curve[i]!;
    if (t <= hi.t) {
      const w = (t - lo.t) / (hi.t - lo.t);
      return Math.exp(Math.log(lo.df) * (1 - w) + Math.log(hi.df) * w);
    }
  }
  const last = curve[curve.length - 1]!;
  // Flat forward past the last observed point; conservative and stated in the method.
  const forward = Math.pow(last.df, 1 / last.t);
  return Math.pow(forward, t);
}

export interface AnnuityInput {
  principal: number;
  /** Age at the income start date. */
  startAge: number;
  /** Years between purchase and first payment. Premium is accumulated at the curve. */
  deferralYears: number;
  sex: Sex;
  /** 1.0 = life only; 0.5 = 50% to survivor; 0.667 / 1.0 likewise. */
  survivorBenefit?: number;
  jointAge?: number;
  jointSex?: Sex;
  /** Cost-of-living adjustment as a level annual increase, e.g. 0.02 for 2%. */
  colaRate?: number;
  /** Annual expense/commission load to show alongside the money's-worth rate. */
  loadRate?: number;
  /** Cash refund on early death: return unrecovered premium, roughly worth this much. */
  cashRefund?: boolean;
}

export interface AnnuityResult {
  startAge: number;
  /** Level annual income in the first year, before any COLA. */
  annualIncome: number;
  monthlyIncome: number;
  /** Annual income / premium. The number a client actually compares. */
  payoutRate: number;
  /** Present value factor per dollar of annual income (the annuity factor). */
  annuityFactor: number;
  expectedPayoutYears: number;
  /** Total nominal dollars paid if the insured lives to life expectancy. */
  expectedTotalNominal: number;
  /** Internal rate implied by the money's-worth calc, i.e. the curve's level equivalent. */
  equivalentLevelRate: number;
  discountCurveUsed: Array<{ t: number; zeroRate: number }>;
  survivorBenefit: number;
  colaRate: number;
  loadRate: number;
}

/**
 * Build the income stream and price it.
 *
 * Payment convention: annual in arrears for the maths, then converted to a monthly
 * figure by dividing by 12 and applying the standard 1/12 timing adjustment. The
 * monthly number is therefore a level-monthly equivalent, not a 12x annual quote.
 */
export function priceAnnuity(input: AnnuityInput, curveRow: YieldCurveRow): DataPoint<AnnuityResult> {
  const { principal, startAge, deferralYears, sex } = input;
  if (principal <= 0) throw new RangeError('principal must be positive');
  if (startAge < 40 || startAge > 95) throw new RangeError('startAge must be between 40 and 95');
  if (deferralYears < 0 || deferralYears > 40) throw new RangeError('deferralYears must be between 0 and 40');

  const discountCurve = bootstrapDiscountFactors(curveRow);
  const survivorBenefit = input.survivorBenefit ?? 1;
  const colaRate = input.colaRate ?? 0;
  const loadRate = input.loadRate ?? 0;
  const joint = input.jointAge !== undefined && input.jointSex !== undefined;

  const maxT = 120 - startAge;
  let factor = 0;
  let expectedNominal = 0;
  let expectedYears = 0;
  let lastSurvival = 1;

  for (let t = 1; t <= maxT; t++) {
    const age = startAge + t - 1;
    let survival: number;
    if (joint) {
      const a = survivalProbability(startAge, startAge + t - 1, sex);
      const b = survivalProbability(input.jointAge!, input.jointAge! + t - 1, input.jointSex!);
      const both = a * b;
      const exactlyOne = a * (1 - b) + (1 - a) * b;
      survival = both + survivorBenefit * exactlyOne;
    } else {
      survival = survivalProbability(startAge, startAge + t - 1, sex);
    }

    const payment = Math.pow(1 + colaRate, t - 1);
    const df = discountFactorAt(discountCurve, t + deferralYears);
    factor += df * survival * payment;
    expectedNominal += survival * payment;
    expectedYears += survival;
    if (survival < 1e-9 && lastSurvival < 1e-9) break;
    lastSurvival = survival;
  }

  if (factor <= 0) throw new Error('annuity factor collapsed — check curve and ages');

  // Deferral: the premium compounds at the curve until income starts, so the
  // payable income is scaled by the accumulated value of the premium.
  const accumulation = discountFactorAt(discountCurve, deferralYears) > 0 ? 1 / discountFactorAt(discountCurve, deferralYears) : 1;
  const effectivePrincipal = principal * (deferralYears > 0 ? accumulation : 1);
  const loadedPrincipal = effectivePrincipal * (1 - loadRate);

  const annualIncome = loadedPrincipal / factor;
  const monthly = annualIncome / 12;

  // Level-equivalent rate: the single rate r at which a level annuity of the same
  // duration would have the same factor. Useful for comparing against a quote.
  const levelRate = equivalentLevelRate(factor, Math.max(1, expectedYears));

  const result: AnnuityResult = {
    startAge,
    annualIncome: round2(annualIncome),
    monthlyIncome: round2(monthly),
    // Kept at four decimals: a payout rate is a ratio, and rounding it to two
    // decimals collapses, for example, 7.34% and 6.89% into the same "0.07".
    payoutRate: round4(annualIncome / principal),
    annuityFactor: round4(factor),
    expectedPayoutYears: round2(expectedYears),
    expectedTotalNominal: round2(expectedNominal * annualIncome),
    equivalentLevelRate: round4(levelRate),
    discountCurveUsed: discountCurve.map((d) => ({ t: d.t, zeroRate: round4(d.zeroRate) })),
    survivorBenefit,
    colaRate,
    loadRate,
  };

  return derive(
    result,
    [
      {
        source: `treasury:par_yield_curve:${curveRow.date}`,
        sourceKind: 'bundled-official',
        sourceUrl: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve',
        retrievedAt: new Date().toISOString(),
        asOf: curveRow.date,
        license: 'Public domain — US Department of the Treasury',
        method: 'Daily par yield curve, bootstrapped to discount factors.',
        staleAfterSeconds: 24 * 3600,
      },
      {
        source: 'ssa:period-life-table:2023',
        sourceKind: 'bundled-official',
        sourceUrl: 'https://www.ssa.gov/oact/STATS/table4c6.html',
        retrievedAt: '2026-11-08T00:00:00.000Z',
        asOf: '2023-12-31',
        license: 'Public domain — US Government work',
        method: 'SSA period life table qx, period (not cohort) basis.',
        staleAfterSeconds: 365 * 24 * 3600,
      },
    ],
    'Actuarial present value: sum over policy years of Treasury discount factor times SSA survival probability, ' +
      'with optional COLA, survivor benefit and expense load. Excludes insurer expenses, lapses, credit spread and commissions.',
  );
}

function equivalentLevelRate(factor: number, years: number): number {
  // Solve  factor = (1 - (1+r)^-years) / r  for r, by bisection on [1e-6, 0.5].
  let lo = 1e-6;
  let hi = 0.5;
  const f = (r: number) => (1 - Math.pow(1 + r, -years)) / r;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > factor) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export { lifeExpectancy };
