/**
 * routes/privacy.ts — GDPR/CCPA Privacy & WORM Provenance Verification API (/api/v1/privacy/*).
 *
 *  - POST /export            — invokes PostgreSQL export_user_data(user_id)
 *  - POST /soft-delete       — requires { confirmation: 'CONFIRM_SOFT_DELETE' }, invokes soft_delete_user(user_id)
 *  - GET  /provenance/verify — advisor/admin chain verification over provenance_records
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { verifyProvenanceChain } from '../services/crmService';

const router = Router();
router.use(authenticateToken);

const softDeleteSchema = z.object({
  confirmation: z.literal('CONFIRM_SOFT_DELETE'),
});

router.post('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const rows = await prisma.$queryRawUnsafe<Array<{ export_user_data: Record<string, unknown> }>>(
      `SELECT export_user_data($1) AS export_user_data`,
      req.user.userId
    );
    const bundle = rows[0]?.export_user_data;
    if (!bundle) {
      throw new AppError(500, 'Failed to export user data');
    }
    res.json({ export: bundle });
  } catch (err) {
    next(err);
  }
});

router.post('/soft-delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const parsed = softDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "confirmation must equal 'CONFIRM_SOFT_DELETE'");
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ soft_delete_user: Record<string, unknown> }>>(
      `SELECT soft_delete_user($1) AS soft_delete_user`,
      req.user.userId
    );
    const summary = rows[0]?.soft_delete_user;
    if (!summary) {
      throw new AppError(500, 'Failed to soft-delete user');
    }
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/provenance/verify',
  requireRole('advisor', 'admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const verification = await verifyProvenanceChain();
      res.json(verification);
    } catch (err) {
      next(err);
    }
  }
);

export { router as privacyRouter };
