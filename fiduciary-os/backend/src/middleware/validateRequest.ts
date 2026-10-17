import type { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from './errorHandler';

export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => `${err.type}: ${err.msg}`).join(', ');
    next(new AppError(400, `Validation error: ${errorMessages}`));
    return;
  }
  
  next();
}
