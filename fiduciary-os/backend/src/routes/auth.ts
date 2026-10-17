import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validateRequest';
import { logger } from '../utils/logger';

const router = Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().notEmpty(),
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
      const hashedPassword = await bcrypt.hash(password, saltRounds);

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
      const tokens = generateTokens(user.id, user.email, user.role);

      logger.info(`User registered: ${email}`);

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
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    validateRequest,
  ],
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
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        throw new AppError(401, 'Invalid credentials');
      }

      // Generate tokens
      const tokens = generateTokens(user.id, user.email, user.role);

      logger.info(`User logged in: ${email}`);

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

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(401, 'Refresh token required');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppError(500, 'JWT secret not configured');
    }

    const decoded = jwt.verify(refreshToken, jwtSecret) as {
      userId: string;
      email: string;
      role: string;
      tokenType?: string;
    };

    // Only refresh tokens may mint new tokens; an access token cannot be replayed here.
    if (decoded.tokenType !== 'refresh') {
      throw new AppError(401, 'Invalid refresh token');
    }

    const tokens = generateTokens(decoded.userId, decoded.email, decoded.role);

    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  // In a more complex implementation, you might invalidate the token in Redis
  res.json({ message: 'Logged out successfully' });
});

function generateTokens(userId: string, email: string, role: string) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AppError(500, 'JWT secret not configured');
  }

  const accessToken = jwt.sign(
    { userId, email, role, tokenType: 'access' },
    jwtSecret,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  );

  const refreshToken = jwt.sign(
    { userId, email, role, tokenType: 'refresh' },
    jwtSecret,
    { expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '30d') as jwt.SignOptions['expiresIn'] }
  );

  return { accessToken, refreshToken };
}

export { router as authRouter };
