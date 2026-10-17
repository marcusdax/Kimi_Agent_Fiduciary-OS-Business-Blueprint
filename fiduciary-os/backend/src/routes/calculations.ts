import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Annuity calculation
router.post(
  '/annuity',
  authenticateToken,
  [
    body('principal').isFloat({ min: 0 }),
    body('deferralPeriod').isInt({ min: 0 }),
    body('startAge').isInt({ min: 45, max: 80 }),
    body('productType').isIn(['fixed', 'indexed', 'variable', 'immediate']),
    body('jointLife').isIn(['no', 'yes', 'reduced']),
    body('colaRider').isIn(['0', '2', '3', 'cpi']),
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { principal, deferralPeriod, productType, jointLife, colaRider } = req.body;

    const rates: Record<string, number> = {
      fixed: 0.055,
      indexed: 0.065,
      variable: 0.06,
      immediate: 0.06,
    };

    let rate = rates[productType] || 0.055;
    let multiplier = 1 + deferralPeriod * 0.015;

    if (jointLife === 'yes') multiplier *= 0.85;
    else if (jointLife === 'reduced') multiplier *= 0.9;

    let annual = principal * rate * multiplier;

    if (colaRider !== '0' && colaRider !== 'cpi') {
      annual *= 1 - parseFloat(colaRider) * 0.08;
    }

    const monthly = Math.floor(annual / 12);

    res.json({
      monthlyIncome: monthly,
      annualIncome: annual,
      yieldRate: rate * 100,
      tenYearTotal: monthly * 120,
    });
  }
);

// Life insurance calculation
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
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { currentAge, annualIncome, existingCoverage, term, healthClass, gender, tobacco } =
      req.body;

    const needed = annualIncome * 10000;
    const gap = Math.max(0, needed - existingCoverage * 1000);

    const ageFactor = 1 + ((currentAge - 40) * 0.03);
    const healthFactors: Record<string, number> = { pp: 0.8, p: 1.0, sp: 1.2, s: 1.5 };
    const healthFactor = healthFactors[healthClass] || 1.0;
    const genderFactor = gender === 'f' ? 0.9 : 1.0;
    const tobaccoFactor = tobacco === 'y' ? 2.5 : 1.0;
    const termFactor = term === 'perm' ? 10 : parseInt(term) / 20;

    const baseRate = 0.2;
    const monthly = (gap || needed) / 1000 * baseRate * ageFactor * healthFactor * genderFactor * tobaccoFactor * termFactor;

    const years = term === 'perm' ? 50 : parseInt(term);

    res.json({
      protectionGap: gap,
      monthlyPremium: Math.floor(monthly),
      lifetimeCost: Math.floor(monthly * 12 * years),
    });
  }
);

// Retirement calculation
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
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { portfolioValue, monthlySpending, socialSecurity, pension, strategy } = req.body;

    const netSpend = monthlySpending - socialSecurity - pension;
    const withdrawalRate = (netSpend * 12) / portfolioValue * 100;

    let successProbability = 0;
    if (strategy === '4pct') {
      successProbability = withdrawalRate <= 4 ? 95 : withdrawalRate <= 5 ? 75 : 45;
    } else if (strategy === 'dynamic') {
      successProbability = withdrawalRate <= 5 ? 90 : 70;
    } else {
      successProbability = 92;
    }

    if (withdrawalRate > 4) successProbability = Math.max(0, successProbability - 10);

    const withdrawalRates: Record<string, number> = {
      '4pct': 0.04,
      dynamic: 0.05,
      guardrails: 0.045,
      annuity: 0.04,
    };

    const sustainableMonthly = portfolioValue * (withdrawalRates[strategy] || 0.04) / 12 + socialSecurity + pension;

    const years = 30;
    const shortfall = withdrawalRate > 5 ? Math.max(0, netSpend * 12 * years - portfolioValue) : 0;

    res.json({
      successProbability,
      withdrawalRate,
      sustainableMonthly,
      projectedShortfall: shortfall,
    });
  }
);

// Tax calculation
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
    validateRequest,
  ],
  async (req: Request, res: Response) => {
    const { filingStatus, annualIncome, contribution401k, rothConversion, capitalLossHarvest, hsaContribution, qcdAmount } = req.body;

    const standardDeductions: Record<string, number> = {
      single: 15000,
      married: 30000,
      head: 22500,
    };

    const standardDeduction = standardDeductions[filingStatus] || 15000;

    const brackets: Record<string, [number, number][]> = {
      single: [
        [11600, 0.1],
        [47150, 0.12],
        [100525, 0.22],
        [191950, 0.24],
        [243725, 0.32],
        [609350, 0.35],
        [Infinity, 0.37],
      ],
      married: [
        [23200, 0.1],
        [94300, 0.12],
        [201050, 0.22],
        [383900, 0.24],
        [487450, 0.32],
        [731200, 0.35],
        [Infinity, 0.37],
      ],
      head: [
        [11600, 0.1],
        [47150, 0.12],
        [100525, 0.22],
        [191950, 0.24],
        [243725, 0.32],
        [609350, 0.35],
        [Infinity, 0.37],
      ],
    };

    function computeTax(income: number): { tax: number; marginalRate: number } {
      let remaining = Math.max(0, income - standardDeduction);
      let tax = 0;
      let prevLimit = 0;
      let marginalRate = 0;

      for (const [limit, rate] of brackets[filingStatus] || brackets.single) {
        const band = Math.min(remaining, limit - prevLimit);
        if (band > 0) {
          tax += band * rate;
          marginalRate = rate;
        }
        remaining -= band;
        prevLimit = limit;
        if (remaining <= 0) break;
      }

      return { tax, marginalRate };
    }

    const baseResult = computeTax(annualIncome);
    const adjustedIncome = Math.max(0, annualIncome - contribution401k - hsaContribution - capitalLossHarvest - qcdAmount);
    const afterResult = computeTax(adjustedIncome + rothConversion);
    const savings = Math.max(0, baseResult.tax - afterResult.tax);

    res.json({
      taxableIncome: adjustedIncome,
      marginalRate: baseResult.marginalRate * 100,
      effectiveRate: annualIncome > 0 ? (baseResult.tax / annualIncome) * 100 : 0,
      estimatedLiability: baseResult.tax,
      taxAfterStrategy: afterResult.tax,
      totalSavings: savings,
      niitApplies: annualIncome > 250000,
    });
  }
);

export { router as calculationsRouter };
