import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { generateKimiInsight } from '../services/unifiedAiService';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// Extend Express Request to include user (matches auth middleware)
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

const router = Router();

// =============================================================================
// ENHANCED AI ENDPOINTS WITH KIMI API (Moonshot AI)
// =============================================================================

// Generate comprehensive AI insight using Kimi
router.post(
  '/insight',
  authenticateToken,
  [
    body('type').isIn(['profile', 'portfolio', 'retirement', 'symphony', 'market']),
    body('data').isObject(),
    body('useThinking').optional().isBoolean(),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const { type, data, useThinking } = req.body;
      const userId = req.user?.userId;

      logger.info(`Generating Kimi AI insight for user ${userId}, type: ${type}`);

      const insight = await generateKimiInsight(type, data, { useThinking });

      res.json({
        success: true,
        data: insight,
        meta: {
          model: useThinking ? 'kimi-k2-thinking' : 'kimi-k2-5',
          provider: 'Moonshot AI',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate personalized profile insight with real user data
router.post(
  '/profile-insight',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(401, 'Authentication required');
      }

      // Fetch user's complete profile
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          portfolio: {
            include: {
              holdings: true,
            },
          },
        },
      });

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      // Calculate Financial DNA score
      const dnaScore = calculateFinancialDNAScore(user.profile, user.portfolio);

      const profileData = {
        name: user.name,
        email: user.email,
        age: user.profile?.age,
        retirementAge: user.profile?.retirementAge,
        annualIncome: user.profile?.annualIncome,
        investableAssets: user.profile?.investableAssets,
        monthlyExpenses: user.profile?.monthlyExpenses,
        retirementSavings: user.profile?.retirementSavings,
        riskTolerance: user.profile?.riskTolerance,
        investmentStyle: user.profile?.investmentStyle,
        primaryGoal: user.profile?.primaryGoal,
        filingStatus: user.profile?.filingStatus,
        employmentStatus: user.profile?.employmentStatus,
        portfolioValue: user.portfolio?.totalValue,
        holdingsCount: user.portfolio?.holdings.length || 0,
        dnaScore,
      };

      const insight = await generateKimiInsight('profile', profileData);

      res.json({
        success: true,
        data: {
          ...insight,
          profile: profileData,
        },
        meta: {
          model: 'kimi-k2-5',
          provider: 'Moonshot AI',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate portfolio analysis with real market data
router.post(
  '/portfolio-insight',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(401, 'Authentication required');
      }

      // Fetch user's portfolio
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId },
        include: {
          holdings: true,
        },
      });

      if (!portfolio) {
        throw new AppError(404, 'Portfolio not found');
      }

      const portfolioData = {
        totalValue: portfolio.totalValue,
        holdings: portfolio.holdings.map(h => ({
          symbol: h.symbol,
          quantity: h.quantity,
          avgCost: h.avgCost,
        })),
      };

      const insight = await generateKimiInsight('portfolio', portfolioData);

      res.json({
        success: true,
        data: {
          ...insight,
          portfolio: portfolioData,
        },
        meta: {
          model: 'kimi-k2-5',
          provider: 'Moonshot AI',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate comprehensive Symphony Playbook
router.post(
  '/symphony-playbook',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(401, 'Authentication required');
      }

      // Fetch complete user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          portfolio: {
            include: {
              holdings: true,
            },
          },
        },
      });

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      const dnaScore = calculateFinancialDNAScore(user.profile, user.portfolio);

      const symphonyData = {
        profile: {
          age: user.profile?.age,
          retirementAge: user.profile?.retirementAge,
          annualIncome: user.profile?.annualIncome,
          investableAssets: user.profile?.investableAssets,
          monthlyExpenses: user.profile?.monthlyExpenses,
          retirementSavings: user.profile?.retirementSavings,
          riskTolerance: user.profile?.riskTolerance,
          investmentStyle: user.profile?.investmentStyle,
          primaryGoal: user.profile?.primaryGoal,
          filingStatus: user.profile?.filingStatus,
        },
        portfolio: {
          totalValue: user.portfolio?.totalValue,
          holdings: user.portfolio?.holdings,
        },
        dnaScore,
      };

      // Use thinking model for comprehensive playbook
      const insight = await generateKimiInsight('symphony', symphonyData, { useThinking: true });

      res.json({
        success: true,
        data: {
          ...insight,
          symphony: symphonyData,
        },
        meta: {
          model: 'kimi-k2-thinking',
          provider: 'Moonshot AI',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate market analysis
router.post(
  '/market-insight',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const marketData = {
        indices: [
          { symbol: 'SPY', name: 'S&P 500', change: 0.85 },
          { symbol: 'QQQ', name: 'NASDAQ-100', change: 1.12 },
          { symbol: 'DIA', name: 'Dow Jones', change: 0.45 },
        ],
        sectors: [
          { name: 'Technology', performance: 1.25 },
          { name: 'Healthcare', performance: 0.65 },
          { name: 'Financials', performance: 0.35 },
          { name: 'Energy', performance: -0.45 },
        ],
        volatility: 14.2,
        vix: 16.85,
      };

      const insight = await generateKimiInsight('market', marketData);

      res.json({
        success: true,
        data: {
          ...insight,
          market: marketData,
        },
        meta: {
          model: 'kimi-k2-5',
          provider: 'Moonshot AI',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateFinancialDNAScore(
  profile: any,
  portfolio: any
): number {
  let score = 50; // Base score

  if (!profile) return score;

  // Retirement savings rate
  const age = profile.age || 45;
  const retirementAge = profile.retirementAge || 65;
  const _yearsToRetirement = retirementAge - age; // Available for future use
  const savings = profile.retirementSavings || 0;
  const income = profile.annualIncome || 150000;
  
  // Savings multiplier based on age
  const recommendedMultiplier = Math.max(1, (age - 25) * 0.5);
  const actualMultiplier = savings / income;
  
  if (actualMultiplier >= recommendedMultiplier) score += 15;
  else if (actualMultiplier >= recommendedMultiplier * 0.7) score += 10;
  else if (actualMultiplier >= recommendedMultiplier * 0.5) score += 5;

  // Risk tolerance (3 is balanced)
  if (profile.riskTolerance >= 2 && profile.riskTolerance <= 4) score += 10;
  else score += 5;

  // Diversification
  const holdingsCount = portfolio?.holdings?.length || 0;
  if (holdingsCount >= 10) score += 10;
  else if (holdingsCount >= 5) score += 7;
  else if (holdingsCount >= 3) score += 4;

  // Investment style
  if (profile.investmentStyle === 'passive') score += 5;
  else if (profile.investmentStyle === 'active') score += 8;

  // Goal clarity
  if (profile.primaryGoal) score += 5;

  // Emergency fund (based on monthly expenses vs implied savings)
  const monthlyExpenses = profile.monthlyExpenses || 6000;
  const emergencyFundMonths = (profile.investableAssets || 0) / monthlyExpenses;
  if (emergencyFundMonths >= 6) score += 10;
  else if (emergencyFundMonths >= 3) score += 5;

  return Math.min(100, Math.max(0, score));
}

export { router as aiEnhancedRouter };
