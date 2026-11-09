import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { priceAnnuity } from '../engines/annuity';
import { runRetirement, sustainableSpending, type Strategy } from '../engines/retirement';
import { incomeTax, DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS, TAX_TABLES, type FilingStatus } from '../engines/tax';
import { pv } from '../engines/timeValue';

const router = Router();

// Calculators return illustrative estimates from documented methods (actuarial annuity pricing,
// historical-cycle retirement replay, time-value math via formulajs, versioned tax tables).
// Every response lists its assumptions and says it is not advice; clients must show both.
const CALCULATOR_DISCLAIMER =
  'Illustrative estimate from a documented method with stated assumptions. It is not a quote, ' +
  'offer, or recommendation, and it is not tax, insurance, or investment advice. Review any ' +
  'decision with a licensed professional.';

const illustrative = { source: 'illustrative' as const, illustrative: true, disclaimer: CALCULATOR_DISCLAIMER };

// Annuity: actuarial fair-value illustration (SSA mortality, discount rate as an input).
router.post(
  '/annuity',
  authenticateToken,
  [
    body('principal').isFloat({ min: 1000 }),
    body('deferralPeriod').isInt({ min: 0, max: 30 }),
    body('startAge').isInt({ min: 45, max: 80 }),
    body('productType').isIn(['fixed', 'indexed', 'variable', 'immediate']),
    body('jointLife').isIn(['no', 'yes', 'reduced']),
    body('colaRider').isIn(['0', '2', '3', 'cpi']),
    body('sex').optional().isIn(['male', 'female']),
    body('discountRate').optional().isFloat({ min: 0.005, max: 0.1 }),
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { principal, deferralPeriod, startAge, jointLife, colaRider } = req.body;
    const sex = req.body.sex === 'female' ? 'female' : 'male';
    const discountRate = req.body.discountRate !== undefined ? Number(req.body.discountRate) : 0.045;
    const colaRate = colaRider === 'cpi' ? 0.025 : Number(colaRider) / 100;
    const joint =
      jointLife === 'no'
        ? undefined
        : { age: Number(startAge), sex: sex === 'male' ? ('female' as const) : ('male' as const), survivorShare: jointLife === 'yes' ? 1 : 2 / 3 };

    const r = priceAnnuity({ premium: Number(principal), purchaseAge: Number(startAge), deferralYears: Number(deferralPeriod), sex, discountRate, colaRate, joint });
    let tenYear = 0;
    for (let t = 0; t < 10; t++) tenYear += r.annualIncome * Math.pow(1 + colaRate, t);

    res.json({
      monthlyIncome: Math.floor(r.monthlyIncome),
      annualIncome: r.annualIncome,
      yieldRate: r.payoutRatePct,
      tenYearTotal: Math.floor(tenYear),
      incomeStartAge: r.incomeStartAge,
      lifeExpectancyAtPurchase: r.lifeExpectancyAtPurchase,
      probabilityAlive: r.probabilityAlive,
      breakEvenAge: r.breakEvenAge,
      termCertain20YearMonthly: Math.floor(r.termCertain20YearMonthly),
      method: 'Actuarial present value with SSA 2023 period mortality; discount rate is an input.',
      assumptions: r.assumptions,
      productTypeNote: 'productType is accepted for compatibility; the math is product-neutral because no carrier rates are wired in.',
      ...illustrative,
    });
  }
);

// Life insurance: protection gap from income-replacement present value. No premium estimate.
router.post(
  '/life-insurance',
  authenticateToken,
  [
    body('currentAge').isInt({ min: 25, max: 70 }),
    body('annualIncome').isInt({ min: 30, max: 500 }),
    body('existingCoverage').isInt({ min: 0, max: 2000 }),
    body('term').isIn(['10', '20', '30', 'perm']),
    body('healthClass').isIn(['pp', 'p', 'sp', 's']),
    body('gender').isIn(['m', 'f']),
    body('tobacco').isIn(['n', 'y']),
    body('replacementPct').optional().isFloat({ min: 10, max: 100 }),
    body('discountRate').optional().isFloat({ min: 0.005, max: 0.1 }),
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { currentAge, annualIncome, existingCoverage, term } = req.body;
    const income = Number(annualIncome) * 1000;
    const replacement = (req.body.replacementPct !== undefined ? Number(req.body.replacementPct) : 70) / 100;
    const discount = req.body.discountRate !== undefined ? Number(req.body.discountRate) : 0.045;
    const growth = 0.03;
    const yearsToReplace = term === 'perm' ? Math.max(5, 67 - Number(currentAge)) : Math.min(Number(term), Math.max(5, 67 - Number(currentAge)));
    const realRate = (1 + discount) / (1 + growth) - 1;
    const needed = -pv(realRate, yearsToReplace, income * replacement, 0, 1);
    const ruleOfThumb = income * 10;
    const coverage = Number(existingCoverage) * 1000;

    res.json({
      protectionGap: Math.max(0, Math.round(needed - coverage)),
      incomeReplacementNeed: Math.round(needed),
      ruleOfThumb10x: Math.round(ruleOfThumb),
      yearsToReplace,
      monthlyPremium: null,
      lifetimeCost: null,
      premiumNote: 'No premium estimate: real premiums need a licensed quoting partner and current carrier rates. Health, gender and tobacco inputs are accepted but not used.',
      method: 'Present value of replacing part of income for the chosen years, in real dollars (formulajs PV). Debts, education and final costs are not included.',
      assumptions: [`Replace ${Math.round(replacement * 100)}% of income for ${yearsToReplace} years.`, `Discount ${(discount * 100).toFixed(1)}%, income growth ${(growth * 100).toFixed(1)}% a year (annuity-due).`, 'Existing coverage is subtracted in full.'],
      ...illustrative,
    });
  }
);

// Retirement: historical-cycle replay (not a probability, not a forecast).
router.post(
  '/retirement',
  authenticateToken,
  [
    body('portfolioValue').isFloat({ min: 100000 }),
    body('retirementAge').isInt({ min: 55, max: 75 }),
    body('monthlySpending').isFloat({ min: 2000 }),
    body('socialSecurity').isFloat({ min: 0 }),
    body('pension').isFloat({ min: 0 }),
    body('strategy').isIn(['4pct', 'dynamic', 'guardrails', 'annuity']),
    body('stockAllocation').optional().isInt({ min: 0, max: 100 }),
    body('horizonYears').optional().isInt({ min: 10, max: 50 }),
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { portfolioValue, monthlySpending, socialSecurity, pension, strategy, retirementAge } = req.body;
    const netSpendMonthly = Number(monthlySpending) - Number(socialSecurity) - Number(pension);
    const annualNet = Math.max(0, netSpendMonthly * 12);
    const stockShare = (req.body.stockAllocation !== undefined ? Number(req.body.stockAllocation) : 60) / 100;
    const horizonYears = req.body.horizonYears !== undefined ? Number(req.body.horizonYears) : 30;
    const rule: Strategy = strategy === '4pct' ? 'fixed' : (strategy as Strategy);
    const base = { portfolio: Number(portfolioValue), horizonYears, stockShare, strategy: rule, retirementAge: Number(retirementAge) };

    const result = runRetirement({ ...base, annualNetSpending: annualNet });
    const sustainableNet = sustainableSpending(base, 90);
    const withdrawalRate = (annualNet / Number(portfolioValue)) * 100;

    res.json({
      historicalSuccessRatePct: result.successRatePct,
      windowsTested: result.windows,
      worstStartYear: result.worstStartYear,
      withdrawalRate,
      sustainableMonthly: Math.round(sustainableNet / 12 + Number(socialSecurity) + Number(pension)),
      sustainableNote: 'Highest monthly spending (including Social Security and pension) that passed at least 90% of historical windows.',
      endingRealBalance: { p10: Math.round(result.p10EndingReal), median: Math.round(result.medianEndingReal), p90: Math.round(result.p90EndingReal), worst: Math.round(result.worstEndingReal) },
      unfundedInWorstWindow: Math.round(result.unfundedInWorstWindow),
      method: result.method,
      assumptions: result.assumptions,
      ...illustrative,
    });
  }
);

// Tax: federal ordinary income tax from versioned tables (2026 default, 2024 available).
router.post(
  '/tax',
  authenticateToken,
  [
    body('filingStatus').isIn(['single', 'married', 'head']),
    body('annualIncome').isFloat({ min: 0 }),
    body('contribution401k').isFloat({ min: 0 }),
    body('rothConversion').isFloat({ min: 0 }),
    body('capitalLossHarvest').isFloat({ min: 0 }),
    body('hsaContribution').isFloat({ min: 0 }),
    body('qcdAmount').isFloat({ min: 0 }),
    body('taxYear').optional().isIn(SUPPORTED_TAX_YEARS.map(String)),
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { filingStatus, annualIncome, contribution401k, rothConversion, capitalLossHarvest, hsaContribution, qcdAmount } = req.body;
    const year = req.body.taxYear !== undefined ? Number(req.body.taxYear) : DEFAULT_TAX_YEAR;
    const status = filingStatus as FilingStatus;

    const baseResult = incomeTax(year, status, Number(annualIncome));
    const adjustedIncome = Math.max(0, Number(annualIncome) - Number(contribution401k) - Number(hsaContribution) - Number(capitalLossHarvest) - Number(qcdAmount));
    const afterResult = incomeTax(year, status, adjustedIncome + Number(rothConversion));
    const savings = Math.max(0, baseResult.tax - afterResult.tax);

    res.json({
      taxableIncome: adjustedIncome,
      marginalRate: baseResult.marginalRate * 100,
      effectiveRate: Number(annualIncome) > 0 ? (baseResult.tax / Number(annualIncome)) * 100 : 0,
      estimatedLiability: baseResult.tax,
      taxAfterStrategy: afterResult.tax,
      totalSavings: savings,
      niitApplies: Number(annualIncome) > (status === 'married' ? 250000 : 200000),
      taxYearAssumed: year,
      tableCitation: TAX_TABLES[year].citation,
      method: 'Federal ordinary income tax only: standard deduction and bracket schedule for the chosen year. No state tax, credits, AMT or capital-gains stacking.',
      ...illustrative,
    });
  }
);

export { router as calculationsRouter };
