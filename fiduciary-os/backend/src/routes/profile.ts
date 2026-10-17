import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Get profile
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!profile) {
      // Return default profile
      return res.json({
        userId: req.user!.userId,
        age: 45,
        retirementAge: 65,
        filingStatus: 'married',
        stateTaxRate: 0,
        employmentStatus: 'employed',
        annualIncome: 150000,
        investableAssets: 500000,
        monthlyExpenses: 6000,
        retirementSavings: 300000,
        primaryGoal: 'retire',
        riskTolerance: 3,
        investmentStyle: 'active',
        cryptoAllocation: 5,
        notes: '',
      });
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

// Create or update profile
router.put(
  '/',
  authenticateToken,
  [
    body('age').optional().isInt({ min: 18, max: 100 }),
    body('retirementAge').optional().isInt({ min: 50, max: 85 }),
    body('filingStatus').optional().isIn(['single', 'married', 'head']),
    body('stateTaxRate').optional().isInt({ min: 0, max: 20 }),
    body('employmentStatus').optional().isIn(['employed', 'self', 'retired', 'semi']),
    body('annualIncome').optional().isInt({ min: 0 }),
    body('investableAssets').optional().isInt({ min: 0 }),
    body('monthlyExpenses').optional().isInt({ min: 0 }),
    body('retirementSavings').optional().isInt({ min: 0 }),
    body('primaryGoal').optional().isIn(['retire', 'grow', 'protect', 'income', 'legacy']),
    body('riskTolerance').optional().isInt({ min: 1, max: 5 }),
    body('investmentStyle').optional().isIn(['passive', 'active', 'dividend', 'growth']),
    body('cryptoAllocation').optional().isInt({ min: 0, max: 100 }),
    body('notes').optional().isString(),
    validateRequest,
  ],
  async (req, res, next) => {
    try {
      const profile = await prisma.profile.upsert({
        where: { userId: req.user!.userId },
        update: req.body,
        create: {
          userId: req.user!.userId,
          ...req.body,
        },
      });

      res.json(profile);
    } catch (error) {
      next(error);
    }
  }
);

// Delete profile
router.delete('/', authenticateToken, async (req, res, next) => {
  try {
    await prisma.profile.delete({
      where: { userId: req.user!.userId },
    });

    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { router as profileRouter };
