import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { financialInputs, projectPlan } from '../services/financial-plan';

const router = Router();
const write = z.object({ version: z.number().int().min(0), inputs: financialInputs }).strict();
function serialize(plan: { id: string; inputs: string; version: number; updatedAt: Date }) {
  const inputs = financialInputs.parse(JSON.parse(plan.inputs));
  return {
    id: plan.id,
    version: plan.version,
    updatedAt: plan.updatedAt,
    inputs,
    projection: projectPlan(inputs),
  };
}
router.use(authenticateToken);
router.get('/', async (req, res, next) => {
  try {
    const plan = await prisma.financialPlan.findUnique({ where: { userId: req.user!.userId } });
    res.json(plan ? serialize(plan) : null);
  } catch (err) {
    next(err);
  }
});
router.put('/', async (req, res, next) => {
  const parsed = write.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(
        400,
        'Invalid plan. Check amounts, date, rates, horizon and source; unknown fields are not accepted.'
      )
    );
    return;
  }
  const { version, inputs } = parsed.data;
  // Reject unsupported arithmetic before any database write.
  try {
    projectPlan(inputs);
  } catch {
    next(new AppError(400, 'Projection exceeds supported range. Reduce amounts, rate or horizon.'));
    return;
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.financialPlan.findUnique({ where: { userId: req.user!.userId } });
      if (!existing) {
        if (version !== 0) throw new AppError(409, 'Plan changed. Reload before saving.');
        return tx.financialPlan.create({
          data: { userId: req.user!.userId, inputs: JSON.stringify(inputs) },
        });
      }
      const updated = await tx.financialPlan.updateMany({
        where: { id: existing.id, userId: req.user!.userId, version },
        data: { inputs: JSON.stringify(inputs), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new AppError(409, 'Plan changed. Reload before saving.');
      return tx.financialPlan.findUniqueOrThrow({ where: { id: existing.id } });
    });
    res.json(serialize(result));
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      next(new AppError(409, 'Plan changed. Reload before saving.'));
      return;
    }
    next(err);
  }
});
export { router as financialPlanRouter };
