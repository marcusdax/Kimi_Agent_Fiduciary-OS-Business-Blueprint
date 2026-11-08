import type { Prisma, PlanningAction } from '@prisma/client';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticateToken);
export const planningStages = [
  'Gather information',
  'Analyze choices',
  'Ready for review',
  'Waiting for approval',
  'In progress',
  'Verified complete',
] as const;
const text = z.string().trim().min(1).max(4000);
const fields = z
  .object({
    title: text.max(160),
    outcome: text,
    owner: text.max(160),
    source: text,
    assumptions: text,
    alternatives: text,
    costs: text,
  })
  .strict();
const version = z.number().int().positive();
const step = z
  .object({
    version,
    stage: z.enum(planningStages),
    reviewNote: text.optional(),
    evidence: text.optional(),
  })
  .strict();
const consent = z
  .object({ version, confirmation: z.literal('AUTHORIZE_PLANNING_FOLLOW_THROUGH') })
  .strict();
const revision = z
  .object({
    version,
    reviewDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .strict();
const include = { events: { orderBy: { version: 'asc' as const } } };
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new AppError(400, 'Invalid planning request. Check required fields and version.');
  return result.data;
}
async function owned(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  expected: number
): Promise<PlanningAction> {
  const action = await tx.planningAction.findFirst({ where: { id, userId } });
  if (!action) throw new AppError(404, 'Planning action not found');
  if (action.version !== expected)
    throw new AppError(409, 'This action changed. Reload it before deciding.');
  return action;
}
async function record(
  tx: Prisma.TransactionClient,
  action: PlanningAction,
  actorId: string,
  type: string,
  details: unknown,
  data: Prisma.PlanningActionUpdateManyMutationInput
) {
  const nextVersion = action.version + 1;
  const changed = await tx.planningAction.updateMany({
    where: { id: action.id, userId: actorId, version: action.version },
    data: { ...data, version: nextVersion },
  });
  if (changed.count !== 1)
    throw new AppError(409, 'This action changed. Reload it before deciding.');
  await tx.planningEvent.create({
    data: {
      actionId: action.id,
      actorId,
      type,
      version: nextVersion,
      details: JSON.stringify(details),
    },
  });
  return tx.planningAction.findUniqueOrThrow({ where: { id: action.id }, include });
}
router.get('/actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(
      await prisma.planningAction.findMany({
        where: { userId: req.user!.userId },
        include,
        orderBy: { createdAt: 'asc' },
      })
    );
  } catch (error) {
    next(error);
  }
});
router.get('/actions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const action = await prisma.planningAction.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include,
    });
    if (!action) throw new AppError(404, 'Planning action not found');
    res.json(action);
  } catch (error) {
    next(error);
  }
});
router.post('/actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = parse(fields, req.body);
    const userId = req.user!.userId;
    const action = await prisma.planningAction.create({
      data: {
        ...data,
        userId,
        events: {
          create: {
            actorId: userId,
            type: 'created',
            version: 1,
            details: JSON.stringify({ scope: 'planning coordination only', fields: data }),
          },
        },
      },
      include,
    });
    res.status(201).json(action);
  } catch (error) {
    next(error);
  }
});
router.post('/actions/:id/transitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parse(step, req.body);
    const userId = req.user!.userId;
    const action = await prisma.$transaction(async tx => {
      const current = await owned(tx, req.params.id, userId, input.version);
      if (
        planningStages.indexOf(input.stage) !==
        planningStages.indexOf(current.stage as (typeof planningStages)[number]) + 1
      )
        throw new AppError(409, 'Review stages cannot be skipped or moved backwards.');
      if (input.stage === 'Waiting for approval' && !input.reviewNote)
        throw new AppError(
          400,
          'Record a review note before requesting approval. This is not professional sign-off.'
        );
      if (input.stage === 'In progress' && current.authorizedVersion !== current.version)
        throw new AppError(
          409,
          'Record explicit planning authorization separately before starting follow-through.'
        );
      if (input.stage === 'Verified complete' && !input.evidence)
        throw new AppError(400, 'Completion evidence is required.');
      return record(
        tx,
        current,
        userId,
        'stage_changed',
        {
          from: current.stage,
          to: input.stage,
          reviewNote: input.reviewNote,
          evidence: input.evidence,
          scope: 'planning only; no financial transaction authorized or executed',
        },
        {
          stage: input.stage,
          ...(input.stage === 'Verified complete' ? { completionEvidence: input.evidence } : {}),
        }
      );
    });
    res.json(action);
  } catch (error) {
    next(error);
  }
});
router.post(
  '/actions/:id/authorization',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(consent, req.body);
      const userId = req.user!.userId;
      const action = await prisma.$transaction(async tx => {
        const current = await owned(tx, req.params.id, userId, input.version);
        if (current.stage !== 'Waiting for approval')
          throw new AppError(
            409,
            'Planning authorization is only available while waiting for approval.'
          );
        return record(
          tx,
          current,
          userId,
          'planning_authorization_granted',
          {
            scope:
              'planning follow-through only; not a trade, transfer, purchase, or legal instrument',
            confirmation: input.confirmation,
            snapshot: {
              title: current.title,
              outcome: current.outcome,
              owner: current.owner,
              source: current.source,
              assumptions: current.assumptions,
              alternatives: current.alternatives,
              costs: current.costs,
            },
          },
          { authorizedVersion: current.version + 1 }
        );
      });
      res.json(action);
    } catch (error) {
      next(error);
    }
  }
);
router.post(
  '/actions/:id/revoke-authorization',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(z.object({ version }).strict(), req.body);
      const userId = req.user!.userId;
      const action = await prisma.$transaction(async tx => {
        const current = await owned(tx, req.params.id, userId, input.version);
        if (current.stage !== 'Waiting for approval' && current.stage !== 'In progress')
          throw new AppError(409, 'Only pending or in-progress follow-through can be paused.');
        return record(
          tx,
          current,
          userId,
          'planning_authorization_revoked',
          { scope: 'future planning follow-through paused; prior completed work is not reversed' },
          { authorizedVersion: null, stage: 'Waiting for approval' }
        );
      });
      res.json(action);
    } catch (error) {
      next(error);
    }
  }
);
router.patch(
  '/actions/:id/review-date',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = parse(revision, req.body);
      const userId = req.user!.userId;
      if (
        input.reviewDate &&
        (Number.isNaN(Date.parse(input.reviewDate + 'T00:00:00Z')) ||
          new Date(input.reviewDate + 'T00:00:00Z').toISOString().slice(0, 10) !== input.reviewDate)
      )
        throw new AppError(400, 'Invalid review date');
      const action = await prisma.$transaction(async tx => {
        const current = await owned(tx, req.params.id, userId, input.version);
        return record(
          tx,
          current,
          userId,
          'review_date_changed',
          { reviewDate: input.reviewDate, scheduled: false },
          {
            reviewDate: input.reviewDate,
            ...(current.authorizedVersion === current.version
              ? { authorizedVersion: current.version + 1 }
              : {}),
          }
        );
      });
      res.json(action);
    } catch (error) {
      next(error);
    }
  }
);
router.use(
  (error: Error & { code?: string }, _req: Request, _res: Response, next: NextFunction) => {
    if (error.code === 'P2034' || error.code === 'P2028')
      next(new AppError(409, 'Concurrent update detected. Reload before deciding.'));
    else next(error);
  }
);
export { router as planningRouter };
