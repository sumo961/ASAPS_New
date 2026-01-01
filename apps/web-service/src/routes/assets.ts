import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { prisma } from '../auth/passport';
import { requireAuth } from './auth';
import { getStorageAdapter } from '../storage/adapter';

const router = Router();

// Configure multer for memory storage (will upload to cloud)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, audio, video, and fonts
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
      'video/mp4', 'video/webm', 'video/ogg',
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// Upload asset to project
router.post('/:projectId/upload', requireAuth as any, upload.single('file') as any, async (req: any, res: Response) => {
  try {
    const { projectId } = req.params;

    // Check project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user.id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate storage key
    const ext = req.file.originalname.split('.').pop() || '';
    const storageKey = `projects/${projectId}/assets/${uuid()}.${ext}`;

    // Upload to storage
    const storage = getStorageAdapter();
    const storageUrl = await storage.upload(storageKey, req.file.buffer, req.file.mimetype);

    // Get image dimensions if applicable
    let width: number | undefined;
    let height: number | undefined;

    if (req.file.mimetype.startsWith('image/')) {
      // Could use sharp here to get dimensions
      // For now, client can send dimensions
      width = req.body.width ? parseInt(req.body.width) : undefined;
      height = req.body.height ? parseInt(req.body.height) : undefined;
    }

    // Create asset record
    const asset = await prisma.asset.create({
      data: {
        projectId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageKey,
        storageUrl,
        width,
        height,
        duration: req.body.duration ? parseFloat(req.body.duration) : undefined,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        storageUrl: true,
        width: true,
        height: true,
        duration: true,
      },
    });

    res.status(201).json({ asset });
  } catch (error) {
    console.error('[Assets] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
});

// List project assets
router.get('/:projectId', requireAuth, async (req: any, res) => {
  try {
    const { projectId } = req.params;

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: req.user.id },
          { isPublic: true },
        ],
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const assets = await prisma.asset.findMany({
      where: { projectId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        storageUrl: true,
        width: true,
        height: true,
        duration: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ assets });
  } catch (error) {
    console.error('[Assets] List error:', error);
    res.status(500).json({ error: 'Failed to list assets' });
  }
});

// Delete asset
router.delete('/:projectId/:assetId', requireAuth, async (req: any, res) => {
  try {
    const { projectId, assetId } = req.params;

    // Check project ownership
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: req.user.id,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get asset
    const asset = await prisma.asset.findFirst({
      where: {
        id: assetId,
        projectId,
      },
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Delete from storage
    const storage = getStorageAdapter();
    await storage.delete(asset.storageKey);

    // Delete record
    await prisma.asset.delete({
      where: { id: assetId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Assets] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export { router as assetsRouter };
