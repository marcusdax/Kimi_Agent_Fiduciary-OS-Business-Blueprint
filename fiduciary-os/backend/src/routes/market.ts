import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { param } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import {
  getRealTimeQuote,
  getBatchQuotes,
  getPortfolioAnalytics,
  getInsuranceIllustrations,
} from '../services/unifiedAiService';
import { combineSources } from '../utils/dataSource';
import { prisma } from '../config/database';

const router = Router();

// =============================================================================
// MARKET DATA ENDPOINTS
// =============================================================================

// Get real-time quote for a symbol
router.get(
  '/quote/:symbol',
  authenticateToken,
  [
    param('symbol').isString().trim().toUpperCase().isLength({ min: 1, max: 10 }),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { symbol } = req.params;
      const quote = await getRealTimeQuote(symbol);

      if (!quote) {
        throw new AppError(404, `Quote not found for symbol: ${symbol}`);
      }

      res.json({
        success: true,
        data: quote,
        meta: { source: quote.source },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get batch quotes for multiple symbols
router.post(
  '/batch-quotes',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { symbols } = req.body;

      if (!Array.isArray(symbols) || symbols.length === 0) {
        throw new AppError(400, 'Symbols array is required');
      }

      if (symbols.length > 50) {
        throw new AppError(400, 'Maximum 50 symbols per request');
      }

      const quotes = await getBatchQuotes(symbols.map((s: string) => s.toUpperCase()));

      res.json({
        success: true,
        data: quotes,
        meta: {
          count: quotes.length,
          source: combineSources(quotes.map(q => q.source)),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// PORTFOLIO ANALYTICS ENDPOINTS
// =============================================================================

// Get portfolio analytics for current user
router.get(
  '/portfolio-analytics',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(401, 'Authentication required');
      }

      // Fetch user's portfolio with holdings
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId },
        include: {
          holdings: true,
        },
      });

      if (!portfolio) {
        throw new AppError(404, 'Portfolio not found');
      }

      const analytics = await getPortfolioAnalytics(portfolio.holdings);

      res.json({
        success: true,
        data: analytics,
        meta: { source: analytics.source },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get portfolio analytics for specific holdings
router.post(
  '/portfolio-analytics',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { holdings } = req.body;

      if (!Array.isArray(holdings) || holdings.length === 0) {
        throw new AppError(400, 'Holdings array is required');
      }

      const analytics = await getPortfolioAnalytics(holdings);

      res.json({
        success: true,
        data: analytics,
        meta: { source: analytics.source },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// INSURANCE QUOTES ENDPOINTS
// =============================================================================

// Illustrative term-life premium estimates. NOT quotes: no carrier integration exists,
// carriers are anonymised, and every response carries a disclaimer the client must show.
router.post(
  '/insurance/quotes',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        age,
        gender,
        healthClass,
        coverageAmount,
        termLength,
        tobacco,
      } = req.body;

      // Validate required fields
      if (!age || !gender || !coverageAmount || !termLength) {
        throw new AppError(400, 'Missing required fields: age, gender, coverageAmount, termLength');
      }

      if (age < 18 || age > 85) {
        throw new AppError(400, 'Age must be between 18 and 85');
      }

      if (!['male', 'female'].includes(gender)) {
        throw new AppError(400, 'Gender must be male or female');
      }

      if (![100000, 250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000].includes(coverageAmount)) {
        throw new AppError(400, 'Invalid coverage amount');
      }

      if (![10, 15, 20, 30].includes(termLength)) {
        throw new AppError(400, 'Term length must be 10, 15, 20, or 30 years');
      }

      const { illustrations, source, disclaimer } = getInsuranceIllustrations(
        age,
        gender as 'male' | 'female',
        healthClass || 'preferred',
        coverageAmount,
        termLength as 10 | 15 | 20 | 30,
        tobacco || false
      );

      res.json({
        success: true,
        data: illustrations,
        disclaimer,
        meta: {
          source,
          params: {
            age,
            gender,
            healthClass: healthClass || 'preferred',
            coverageAmount,
            termLength,
            tobacco: tobacco || false,
          },
          illustrationCount: illustrations.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get insurance coverage recommendations
router.post(
  '/insurance/recommendations',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { income, dependents, debts, existingCoverage } = req.body;

      if (!income) {
        throw new AppError(400, 'Annual income is required');
      }

      // DIME method calculation
      const debtNeeds = debts || 0;
      const incomeNeeds = income * 10; // 10x income rule
      const mortgageNeeds = 0; // Would need actual mortgage data
      const educationNeeds = (dependents || 0) * 100000;
      
      const totalNeeds = debtNeeds + incomeNeeds + mortgageNeeds + educationNeeds;
      const estimatedNeed = Math.ceil(totalNeeds / 100000) * 100000;
      const coverageGap = Math.max(0, estimatedNeed - (existingCoverage || 0));

      res.json({
        success: true,
        disclaimer:
          'Rule-of-thumb estimate (10x income plus debts and $100,000 per dependent for education). ' +
          'It is not a recommendation to buy insurance; needs depend on your full situation.',
        data: {
          estimatedNeed,
          coverageGap,
          breakdown: {
            incomeReplacement: incomeNeeds,
            debtPayoff: debtNeeds,
            educationFund: educationNeeds,
          },
          existingCoverage: existingCoverage || 0,
          method: 'DIME rule of thumb (debt, income, mortgage, education); mortgage not yet included',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// MARKET SUMMARY ENDPOINTS
// =============================================================================

// Get market summary (major indices)
router.get(
  '/market-summary',
  authenticateToken,
  async (_req, res, next) => {
    try {
      const indices = ['SPY', 'QQQ', 'DIA', 'IWM'];
      const quotes = await Promise.all(
        indices.map(symbol => getRealTimeQuote(symbol))
      );

      const summary = {
        indices: quotes.filter(Boolean).map(q => ({
          symbol: q!.symbol,
          name: getIndexName(q!.symbol),
          price: q!.price,
          change: q!.change,
          changePercent: q!.changePercent,
        })),
        marketStatus: getMarketStatus(),
        lastUpdated: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: summary,
        meta: { source: combineSources(quotes.filter(Boolean).map(q => q!.source)) },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// HELPERS
// =============================================================================

function getIndexName(symbol: string): string {
  const names: Record<string, string> = {
    'SPY': 'S&P 500',
    'QQQ': 'NASDAQ-100',
    'DIA': 'Dow Jones Industrial Average',
    'IWM': 'Russell 2000',
  };
  return names[symbol] || symbol;
}

function getMarketStatus(): {
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
} {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Market hours: 9:30 AM - 4:00 PM ET (simplified, assumes server is ET)
  const marketOpen = 9 * 60 + 30; // 570 minutes
  const marketClose = 16 * 60; // 960 minutes

  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  const isOpen = isWeekday && isMarketHours;

  // Calculate next open/close
  let nextOpen = new Date(now);
  let nextClose = new Date(now);

  if (isOpen) {
    nextOpen = now;
    nextClose.setHours(16, 0, 0, 0);
  } else if (timeInMinutes < marketOpen && isWeekday) {
    nextOpen.setHours(9, 30, 0, 0);
    nextClose.setHours(16, 0, 0, 0);
  } else {
    // Next business day
    const daysUntilOpen = day === 5 ? 3 : day === 6 ? 2 : 1;
    nextOpen.setDate(now.getDate() + daysUntilOpen);
    nextOpen.setHours(9, 30, 0, 0);
    nextClose.setDate(now.getDate() + daysUntilOpen);
    nextClose.setHours(16, 0, 0, 0);
  }

  return {
    isOpen,
    nextOpen: nextOpen.toISOString(),
    nextClose: nextClose.toISOString(),
  };
}

export { router as marketRouter };
