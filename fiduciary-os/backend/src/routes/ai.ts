import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { generateAIInsight, type InsightType } from '../services/aiService';
import { deliverAiOutput, WITHHELD_TEXT } from '../services/aiGateway';

const router = Router();

/**
 * Every /ai response has the shape:
 *   { insight, disclosure, notARecommendation, source, policyVersion, guardrail, interactionId }
 * Clients must display `disclosure` alongside `insight`.
 */
function insightRoute(type: InsightType, endpoint: string, pick: (req: Request) => unknown) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const result = await generateAIInsight(type, pick(req));
      const { output, envelope } = await deliverAiOutput({
        userId: req.user?.userId,
        endpoint,
        provider: 'anthropic',
        model: result.model,
        source: result.source,
        prompt: result.prompt,
        output: result.text,
        texts: text => [text],
        withheld: () => WITHHELD_TEXT,
      });

      res.json({ insight: output, ...envelope });
    } catch (error) {
      next(error);
    }
  };
}

router.post(
  '/profile-insight',
  authenticateToken,
  [body('profile').isObject(), validateRequest],
  insightRoute('profile', '/ai/profile-insight', req => req.body.profile)
);

router.post(
  '/portfolio-insight',
  authenticateToken,
  [body('portfolio').isObject(), validateRequest],
  insightRoute('portfolio', '/ai/portfolio-insight', req => req.body.portfolio)
);

router.post(
  '/retirement-insight',
  authenticateToken,
  [body('config').isObject(), validateRequest],
  insightRoute('retirement', '/ai/retirement-insight', req => req.body.config)
);

router.post(
  '/symphony-playbook',
  authenticateToken,
  [body('profile').isObject(), body('dnaScore').isObject(), validateRequest],
  insightRoute('symphony', '/ai/symphony-playbook', req => ({
    profile: req.body.profile,
    dnaScore: req.body.dnaScore,
  }))
);

export { router as aiRouter };
