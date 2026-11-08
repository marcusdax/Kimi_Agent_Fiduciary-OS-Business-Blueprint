import { hash, compare } from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body } from 'express-validator';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';
import { startSession, rotateSession } from '../services/sessions';
import { logger } from '../utils/logger';

const router = Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .custom((value: string) => Buffer.byteLength(value, 'utf8') <= 72),
    body('name').trim().notEmpty().isLength({ max: 100 }),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppError(409, 'User already exists');
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
      const hashedPassword = await hash(password, saltRounds);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'client',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      // Generate tokens
      const tokens = await startSession(user.id);

      logger.info('User registered');

      res.status(201).json({
        user,
        ...tokens,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty(), validateRequest],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        throw new AppError(401, 'Invalid credentials');
      }

      // Verify password
      const isValidPassword = await compare(password, user.password);

      if (!isValidPassword) {
        throw new AppError(401, 'Invalid credentials');
      }

      // Generate tokens
      const tokens = await startSession(user.id);

      logger.info('User logged in');

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        ...tokens,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Refresh tokens are one-use credentials; reuse revokes the complete session family.
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await rotateSession(req.body.refreshToken));
  } catch (error) {
    next(error);
  }
});
router.post(
  '/logout',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.authSession.updateMany({
        where: { id: req.user!.sessionId, userId: req.user!.userId },
        data: { revokedAt: new Date() },
      });
      res.json({ message: 'Session revoked' });
    } catch (error) {
      next(error);
    }
  }
);
router.post(
  '/logout-all',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.authSession.updateMany({
        where: { userId: req.user!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      res.json({ message: 'All sessions revoked' });
    } catch (error) {
      next(error);
    }
  }
);
// Delivery and MFA are deliberately unconfigured, never simulated or logged.
router.post(
  ['/password-reset', '/verify-email', '/mfa/enroll'],
  (_req: Request, _res: Response, next: NextFunction) =>
    next(new AppError(503, 'Identity recovery or MFA provider is not configured'))
);
export { router as authRouter };
