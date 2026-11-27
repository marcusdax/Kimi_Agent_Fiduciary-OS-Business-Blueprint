/**
 * routes/consent.ts — CAN-SPAM, TCPA, GDPR & CCPA Consent Ledger API (/api/v1/consent/*).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import * as consentService from '../services/consentService';

const router = Router();
router.use(authenticateToken);

const channelSchema = z.enum(['email', 'sms', 'voice']);
const statusSchema = z.enum(['opted_in', 'opted_out']);

const recordConsentSchema = z.object({
  householdId: z.string().uuid().nullable().optional(),
  channel: channelSchema,
  status: statusSchema,
  doubleOptInVerified: z.boolean().optional(),
  source: z.string().trim().min(1).max(120),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const channelParam = typeof req.query.channel === 'string' ? req.query.channel : undefined;
    let channel: consentService.ConsentChannel | undefined;
    if (channelParam !== undefined) {
      const parsed = channelSchema.safeParse(channelParam);
      if (!parsed.success) throw new AppError(400, 'Invalid channel: must be email, sms, or voice');
      channel = parsed.data;
    }

    const records = await consentService.listConsent(req.user.userId, channel);
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const parsed = recordConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      );
    }

    const record = await consentService.recordConsent({
      userId: req.user.userId,
      householdId: parsed.data.householdId ?? null,
      channel: parsed.data.channel,
      status: parsed.data.status,
      doubleOptInVerified: parsed.data.doubleOptInVerified ?? false,
      source: parsed.data.source,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json({ record });
  } catch (err) {
    next(err);
  }
});

router.get('/verify/:channel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Authentication required');
    const parsed = channelSchema.safeParse(req.params.channel);
    if (!parsed.success) {
      throw new AppError(400, 'Invalid channel: must be email, sms, or voice');
    }

    const result = await consentService.verifyOutboundConsent(req.user.userId, parsed.data);
    res.json({
      channel: parsed.data,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

export { router as consentRouter };
