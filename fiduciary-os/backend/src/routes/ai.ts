import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import { AppError } from '../middleware/errorHandler';
import { generateAIInsight } from '../services/aiService';

const router = Router();

// Generate AI insight for profile
router.post(
  '/profile-insight',
  authenticateToken,
  [
    body('profile').isObject(),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const { profile } = req.body;
      const insight = await generateAIInsight('profile', profile);

      res.json({ insight });
    } catch (error) {
      next(error);
    }
  }
);

// Generate AI insight for portfolio
router.post(
  '/portfolio-insight',
  authenticateToken,
  [
    body('portfolio').isObject(),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const { portfolio } = req.body;
      const insight = await generateAIInsight('portfolio', portfolio);

      res.json({ insight });
    } catch (error) {
      next(error);
    }
  }
);

// Generate AI insight for retirement
router.post(
  '/retirement-insight',
  authenticateToken,
  [
    body('config').isObject(),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const { config } = req.body;
      const insight = await generateAIInsight('retirement', config);

      res.json({ insight });
    } catch (error) {
      next(error);
    }
  }
);

// Generate comprehensive symphony playbook
router.post(
  '/symphony-playbook',
  authenticateToken,
  [
    body('profile').isObject(),
    body('dnaScore').isObject(),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.ENABLE_AI_INSIGHTS !== 'true') {
        throw new AppError(503, 'AI insights are currently disabled');
      }

      const { profile, dnaScore } = req.body;
      const insight = await generateAIInsight('symphony', { profile, dnaScore });

      res.json({ insight });
    } catch (error) {
      next(error);
    }
  }
);

export { router as aiRouter };
