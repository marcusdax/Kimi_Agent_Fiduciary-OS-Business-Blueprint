import type { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { prisma } from '../config/database';
import { verifySessionToken } from '../services/sessions';

import { AppError } from './errorHandler';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  tokenType?: 'access' | 'refresh';
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Access token required');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppError(500, 'JWT secret not configured');
    }

    const decoded = verifySessionToken(token);
    const session = await prisma.authSession.findUnique({ where: { id: decoded.sid as string } });
    if (
      !session ||
      session.userId !== decoded.userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new AppError(401, 'Session expired or revoked');

    // Refresh tokens are long-lived; they must never authorize API calls.
    if (decoded.tokenType !== 'access') {
      throw new AppError(401, 'Invalid token');
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new AppError(401, 'User not found');
    }

    req.user = {
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof JsonWebTokenError) {
      next(new AppError(401, 'Invalid token'));
      return;
    }
    if (error instanceof TokenExpiredError) {
      next(new AppError(401, 'Token expired'));
      return;
    }
    next(error);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'Insufficient permissions'));
      return;
    }

    next();
  };
}
