import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

// Get all documents
router.get('/', authenticateToken, async (req, res, next) => {
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
router.get('/:id', authenticateToken, async (req, res, next) => {
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

// Upload document (placeholder - would integrate with S3/MinIO)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    // TODO: Implement actual file upload to S3/MinIO
    // For now, just create a placeholder record
    const document = await prisma.document.create({
      data: {
        userId: req.user!.userId,
        name: req.body.name || 'unnamed.pdf',
        type: req.body.type || 'application/pdf',
        size: req.body.size || 0,
        path: '/placeholder/path',
        encrypted: true,
      },
    });

    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res, next) => {
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

    // TODO: Delete from S3/MinIO

    await prisma.document.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { router as documentsRouter };
