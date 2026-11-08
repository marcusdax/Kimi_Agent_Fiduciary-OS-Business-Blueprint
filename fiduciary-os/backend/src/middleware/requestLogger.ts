import { randomUUID } from 'crypto';

import type { Request, Response, NextFunction } from 'express';

import { logger } from '../utils/logger';
const totals = { requests: 0, serverErrors: 0, totalDurationMs: 0, maxDurationMs: 0 };
export function operationalMetrics() {
  return { ...totals };
}
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now(),
    requestId = randomUUID();
  res.locals.requestId = requestId;
  res.set('X-Request-ID', requestId);
  const group =
    [
      'auth',
      'tools',
      'financial-plan',
      'planning',
      'documents',
      'profile',
      'portfolio',
      'users',
      'calculations',
      'market',
      'crypto',
      'ai',
      'ai-v2',
    ].find(p => req.path === `/api/v1/${p}` || req.path.startsWith(`/api/v1/${p}/`)) ?? 'other';
  res.on('finish', () => {
    const durationMs = Math.max(0, Date.now() - start);
    totals.requests++;
    totals.serverErrors += res.statusCode >= 500 ? 1 : 0;
    totals.totalDurationMs += durationMs;
    totals.maxDurationMs = Math.max(totals.maxDurationMs, durationMs);
    logger.info('HTTP response', {
      requestId,
      group,
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method)
        ? req.method
        : 'OTHER',
      status: res.statusCode,
      durationMs,
    });
  });
  next();
}
