import { Router } from 'express';
import { prisma } from '../auth/passport';
import { requireAuth } from './auth';

const router = Router();

// List user's projects
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        version: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ projects });
  } catch (error) {
    console.error('[Projects] List error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get single project
router.get('/:id', requireAuth, async (req: any, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { userId: req.user.id },
          { isPublic: true },
        ],
      },
      include: {
        assets: {
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
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    console.error('[Projects] Get error:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create project
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const { name, description, storyData, thumbnailUrl } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name required' });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        storyData: storyData || {},
        thumbnailUrl,
        userId: req.user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ project });
  } catch (error) {
    console.error('[Projects] Create error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', requireAuth, async (req: any, res) => {
  try {
    const { name, description, storyData, thumbnailUrl, isPublic } = req.body;

    // Check ownership
    const existing = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        storyData: storyData ?? existing.storyData,
        thumbnailUrl: thumbnailUrl ?? existing.thumbnailUrl,
        isPublic: isPublic ?? existing.isPublic,
        version: { increment: 1 },
      },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        version: true,
        isPublic: true,
        updatedAt: true,
      },
    });

    res.json({ project });
  } catch (error) {
    console.error('[Projects] Update error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    // Check ownership
    const existing = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project (cascades to assets)
    await prisma.project.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Projects] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Duplicate project
router.post('/:id/duplicate', requireAuth, async (req: any, res) => {
  try {
    const original = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { userId: req.user.id },
          { isPublic: true },
        ],
      },
      include: { assets: true },
    });

    if (!original) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await prisma.project.create({
      data: {
        name: `${original.name} (Copy)`,
        description: original.description,
        storyData: original.storyData ?? {},
        thumbnailUrl: original.thumbnailUrl,
        userId: req.user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        createdAt: true,
      },
    });

    res.status(201).json({ project });
  } catch (error) {
    console.error('[Projects] Duplicate error:', error);
    res.status(500).json({ error: 'Failed to duplicate project' });
  }
});

export { router as projectsRouter };
