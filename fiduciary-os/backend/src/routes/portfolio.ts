import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Get portfolio
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: req.user!.userId },
      include: {
        holdings: true,
      },
    });

    if (!portfolio) {
      return res.json({
        userId: req.user!.userId,
        totalValue: 0,
        holdings: [],
      });
    }

    res.json(portfolio);
  } catch (error) {
    next(error);
  }
});

// Create or update portfolio
router.put(
  '/',
  authenticateToken,
  [
    body('totalValue').optional().isFloat({ min: 0 }),
    body('holdings').optional().isArray(),
    validateRequest,
  ],
  async (req, res, next) => {
    try {
      const { totalValue, holdings } = req.body;

      const portfolio = await prisma.portfolio.upsert({
        where: { userId: req.user!.userId },
        update: { totalValue },
        create: {
          userId: req.user!.userId,
          totalValue: totalValue || 0,
        },
      });

      // Update holdings if provided
      if (holdings && Array.isArray(holdings)) {
        // Delete existing holdings
        await prisma.holding.deleteMany({
          where: { portfolioId: portfolio.id },
        });

        // Create new holdings
        await prisma.holding.createMany({
          data: holdings.map((h: { symbol: string; quantity: number; avgCost?: number }) => ({
            portfolioId: portfolio.id,
            symbol: h.symbol,
            quantity: h.quantity,
            avgCost: h.avgCost || 0,
          })),
        });
      }

      const updatedPortfolio = await prisma.portfolio.findUnique({
        where: { id: portfolio.id },
        include: { holdings: true },
      });

      res.json(updatedPortfolio);
    } catch (error) {
      next(error);
    }
  }
);

// Add holding
router.post(
  '/holdings',
  authenticateToken,
  [
    body('symbol').notEmpty().trim(),
    body('quantity').isFloat({ min: 0 }),
    body('avgCost').optional().isFloat({ min: 0 }),
    validateRequest,
  ],
  async (req, res, next) => {
    try {
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!portfolio) {
        throw new AppError(404, 'Portfolio not found');
      }

      const { symbol, quantity, avgCost } = req.body;

      const holding = await prisma.holding.create({
        data: {
          portfolioId: portfolio.id,
          symbol,
          quantity,
          avgCost: avgCost || 0,
        },
      });

      res.status(201).json(holding);
    } catch (error) {
      next(error);
    }
  }
);

// Delete holding
router.delete('/holdings/:id', authenticateToken, async (req, res, next) => {
  try {
    await prisma.holding.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Holding deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { router as portfolioRouter };
