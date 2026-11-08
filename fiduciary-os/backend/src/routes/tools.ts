import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { observations } from '../services/observations';
import { calculate, catalog, kindSchema, inputSchema, ToolKind } from '../services/toolkit';
const router = Router();
router.use(authenticateToken);
router.use(rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false }));
function serialize(p: {
  id: string;
  kind: string;
  inputs: string;
  version: number;
  updatedAt: Date;
}) {
  const inputs = JSON.parse(p.inputs);
  return {
    id: p.id,
    kind: p.kind,
    version: p.version,
    updatedAt: p.updatedAt,
    inputs,
    result: calculate(p.kind as ToolKind, inputs),
  };
}
router.get('/catalog', (_req, res) => res.json(catalog));
router.get('/observations', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    res.json(await observations());
  } catch (error) {
    next(error);
  }
});
router.get('/scenarios', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    res.json(
      (await prisma.toolScenario.findMany({ where: { userId: req.user!.userId } })).map(serialize)
    );
  } catch (error) {
    next(error);
  }
});
router.put('/scenarios/:kind', async (req, res, next) => {
  const kind = kindSchema.safeParse(req.params.kind);
  const body = z
    .object({ version: z.number().int().min(0).max(2147483646), inputs: z.unknown() })
    .strict()
    .safeParse(req.body);
  if (!kind.success || !body.success) {
    next(new AppError(400, 'Invalid tool or expected version.'));
    return;
  }
  const scenario = inputSchema(kind.data).safeParse(body.data.inputs);
  if (!scenario.success) { next(new AppError(400, 'Invalid scenario fields, source or date.')); return; }
  try {
    calculate(kind.data, scenario.data);
  } catch {
    next(
      new AppError(
        400,
        'Invalid scenario. Check required fields, ranges, date, source and method restrictions.'
      )
    );
    return;
  }
  try {
    const userId = req.user!.userId;
    const saved = await prisma.$transaction(async tx => {
      const existing = await tx.toolScenario.findUnique({
        where: { userId_kind: { userId, kind: kind.data } },
      });
      if (!existing) {
        if (body.data.version !== 0)
          throw new AppError(409, 'Scenario changed. Reload before saving.');
        return tx.toolScenario.create({
          data: { userId, kind: kind.data, inputs: JSON.stringify(scenario.data) },
        });
      }
      const updated = await tx.toolScenario.updateMany({
        where: { id: existing.id, userId, version: body.data.version },
        data: { inputs: JSON.stringify(scenario.data), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new AppError(409, 'Scenario changed. Reload before saving.');
      return tx.toolScenario.findUniqueOrThrow({ where: { id: existing.id } });
    });
    res.json(serialize(saved));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002')
      next(new AppError(409, 'Scenario changed. Reload before saving.'));
    else next(error);
  }
});
export { router as toolsRouter };
