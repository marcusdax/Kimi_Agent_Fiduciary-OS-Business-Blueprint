import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../config/database';

const router = Router();

// List saved workspace records (optionally filtered by ?category=willtrust|symphony|tenant)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const records = await prisma.workspaceState.findMany({
      where: category ? { category } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ count: records.length, records });
  } catch (err) {
    next(err);
  }
});

// Fetch a single saved record by scopeKey
router.get('/:scopeKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await prisma.workspaceState.findUnique({
      where: { scopeKey: req.params.scopeKey },
    });
    if (!record) {
      res.status(404).json({ error: 'Workspace state not found' });
      return;
    }
    res.json({ record });
  } catch (err) {
    next(err);
  }
});

// Upsert a workspace record into PostgreSQL
router.put('/:scopeKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scopeKey = req.params.scopeKey.trim();
    if (!scopeKey || scopeKey.length > 120) {
      res.status(400).json({ error: 'Valid scopeKey is required' });
      return;
    }
    const category = typeof req.body?.category === 'string' ? req.body.category : 'general';
    const label = typeof req.body?.label === 'string' ? req.body.label : scopeKey;
    const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};

    const record = await prisma.workspaceState.upsert({
      where: { scopeKey },
      update: { category, label, payload },
      create: { scopeKey, category, label, payload },
    });
    res.json({ saved: true, record });
  } catch (err) {
    next(err);
  }
});

export { router as workspaceStateRouter };
