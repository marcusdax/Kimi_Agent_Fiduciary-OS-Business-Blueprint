import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get all documents
router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        uploadedAt: true,
        encrypted: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json(documents);
  } catch (error) {
    next(error);
  }
});

// Get document by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Never create placeholder records or claim that unavailable storage encrypted a file.
router.post('/', authenticateToken, (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(503, 'Document vault storage is not configured; no file was stored'))
);
router.delete('/:id', authenticateToken, (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(503, 'Document vault storage is not configured; no file was deleted'))
);

export { router as documentsRouter };
