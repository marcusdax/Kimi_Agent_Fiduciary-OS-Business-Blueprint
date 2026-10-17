import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { generateKimiInsight, getRealTimeQuote, type KimiInsightType } from '../services/unifiedAiService';
import { deliverAiOutput, WITHHELD_TEXT } from '../services/aiGateway';
import { combineSources, type DataSource } from '../utils/dataSource';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// =============================================================================
// ENHANCED AI ENDPOINTS (Moonshot Kimi)
// Every response: { success, data, disclosure, notARecommendation, source,
//                   policyVersion, guardrail, interactionId, meta }
// Clients must display `disclosure` alongside the insight.
// =============================================================================

function requireAiEnabled(): void {
  if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
    throw new AppError(503, 'AI insights are currently disabled');
  }
}

async function sendKimiInsight(
  req: Request,
  res: Response,
  endpoint: string,
  type: KimiInsightType,
  input: unknown,
  extra: Record<string, unknown> = {},
  options: { useThinking?: boolean; inputSource?: DataSource } = {}
): Promise<void> {
  const result = await generateKimiInsight(type, input, { useThinking: options.useThinking });
  const source = combineSources([result.source, options.inputSource ?? 'live']);

  const { output, envelope } = await deliverAiOutput({
    userId: req.user?.userId,
    endpoint,
    provider: 'moonshot',
    model: result.model,
    source,
    prompt: result.prompt,
    output: result.insight,
    texts: i => [i.insight, i.reasoning, ...i.actionItems],
    withheld: () => ({ insight: WITHHELD_TEXT, confidence: null, actionItems: [], riskLevel: null }),
  });

  res.json({
    success: true,
    data: { ...output, ...extra },
    ...envelope,
    meta: {
      model: result.model,
      provider: 'Moonshot AI',
      timestamp: new Date().toISOString(),
    },
  });
}

router.post(
  '/insight',
  authenticateToken,
  [
    body('type').isIn(['profile', 'portfolio', 'retirement', 'symphony', 'market']),
    body('data').isObject(),
    body('useThinking').optional().isBoolean(),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAiEnabled();
      const { type, data, useThinking } = req.body;
      logger.info(`Generating Kimi AI insight for user ${req.user?.userId}, type: ${type}`);
      await sendKimiInsight(req, res, '/ai-v2/insight', type, data, {}, { useThinking });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/profile-insight',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAiEnabled();
      const userId = req.user?.userId;
      if (!userId) throw new AppError(401, 'Authentication required');

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true, portfolio: { include: { holdings: true } } },
      });
      if (!user) throw new AppError(404, 'User not found');

      // No name or email: identifiers never leave for a third-party model.
      const profileData = {
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
        dnaScore: calculateFinancialDNAScore(user.profile, user.portfolio),
      };

      await sendKimiInsight(req, res, '/ai-v2/profile-insight', 'profile', profileData, { profile: profileData });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/portfolio-insight',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAiEnabled();
      const userId = req.user?.userId;
      if (!userId) throw new AppError(401, 'Authentication required');

      const portfolio = await prisma.portfolio.findUnique({
        where: { userId },
        include: { holdings: true },
      });
      if (!portfolio) throw new AppError(404, 'Portfolio not found');

      const portfolioData = {
        totalValue: portfolio.totalValue,
        holdings: portfolio.holdings.map(h => ({ symbol: h.symbol, quantity: h.quantity, avgCost: h.avgCost })),
      };

      await sendKimiInsight(req, res, '/ai-v2/portfolio-insight', 'portfolio', portfolioData, {
        portfolio: portfolioData,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/symphony-playbook',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAiEnabled();
      const userId = req.user?.userId;
      if (!userId) throw new AppError(401, 'Authentication required');

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true, portfolio: { include: { holdings: true } } },
      });
      if (!user) throw new AppError(404, 'User not found');

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
          holdings: user.portfolio?.holdings.map(h => ({ symbol: h.symbol, quantity: h.quantity, avgCost: h.avgCost })),
        },
        dnaScore: calculateFinancialDNAScore(user.profile, user.portfolio),
      };

      await sendKimiInsight(
        req,
        res,
        '/ai-v2/symphony-playbook',
        'symphony',
        symphonyData,
        { symphony: symphonyData },
        { useThinking: true }
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/market-insight',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAiEnabled();

      // Real index quotes (or labelled mock values outside production), never invented figures.
      const indices = [
        { symbol: 'SPY', name: 'S&P 500 (SPY)' },
        { symbol: 'QQQ', name: 'NASDAQ-100 (QQQ)' },
        { symbol: 'DIA', name: 'Dow Jones Industrial Average (DIA)' },
      ];
      const quotes = await Promise.all(indices.map(i => getRealTimeQuote(i.symbol)));
      const available = indices
        .map((i, n) => ({ ...i, quote: quotes[n] }))
        .filter(i => i.quote !== null);

      if (available.length === 0) {
        throw new AppError(503, 'Market data is temporarily unavailable');
      }

      const marketData = {
        asOf: new Date().toISOString(),
        indices: available.map(i => ({ symbol: i.symbol, name: i.name, changePercent: i.quote!.changePercent })),
      };

      await sendKimiInsight(
        req,
        res,
        '/ai-v2/market-insight',
        'market',
        marketData,
        { market: marketData },
        { inputSource: combineSources(available.map(i => i.quote!.source)) }
      );
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateFinancialDNAScore(profile: any, portfolio: any): number {
  let score = 50; // Base score

  if (!profile) return score;

  // Retirement savings rate
  const age = profile.age || 45;
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
