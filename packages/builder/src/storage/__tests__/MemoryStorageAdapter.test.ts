import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStorageAdapter, getMemoryStorage, resetMemoryStorage } from '../MemoryStorageAdapter';
import type { Project, StoredAsset } from '../types';

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(async () => {
    resetMemoryStorage();
    adapter = new MemoryStorageAdapter();
    await adapter.initialize();

    // Mock URL.createObjectURL for jsdom environment
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = vi.fn((blob: Blob) => `blob:${Math.random()}`);
    }
  });

  afterEach(() => {
    resetMemoryStorage();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('should throw when operations called before initialization', async () => {
      const uninitializedAdapter = new MemoryStorageAdapter();

      await expect(uninitializedAdapter.saveProject({} as Project)).rejects.toThrow(
        'Storage not initialized'
      );
    });
  });

  describe('Storage Location Routing', () => {
    it('should always return indexeddb location', () => {
      // Memory adapter uses indexeddb as location for compatibility
      expect(adapter.getStorageLocation(100)).toBe('indexeddb');
      expect(adapter.getStorageLocation(1024 * 1024)).toBe('indexeddb');
      expect(adapter.getStorageLocation(100 * 1024 * 1024)).toBe('indexeddb');
    });
  });

  describe('Project Operations', () => {
    const testProject: Project = {
      id: 'test-project-1',
      name: 'Test Project',
      description: 'A test project',
      version: '1.0.0',
      createdAt: new Date(),
      modifiedAt: new Date(),
      metadata: {},
      rootBeatId: 'start',
      beats: [],
      connections: [],
    };

    it('should save and load project', async () => {
      await adapter.saveProject(testProject);

      const loaded = await adapter.loadProject(testProject.id);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(testProject.id);
      expect(loaded?.name).toBe(testProject.name);
      expect(loaded?.description).toBe(testProject.description);
    });

    it('should store project in memory', async () => {
      await adapter.saveProject(testProject);

      const loaded = await adapter.loadProject(testProject.id);
      expect(loaded).toEqual(expect.objectContaining({
        id: testProject.id,
        name: testProject.name,
        description: testProject.description,
      }));
    });

    it('should update modifiedAt timestamp on save', async () => {
      const originalModifiedAt = testProject.modifiedAt;

      await adapter.saveProject(testProject);

      const loaded = await adapter.loadProject(testProject.id);
      expect(loaded?.modifiedAt).toBeDefined();

      // modifiedAt should be a Date object
      expect(loaded?.modifiedAt instanceof Date).toBe(true);
    });

    it('should return null for non-existent project', async () => {
      const loaded = await adapter.loadProject('non-existent');
      expect(loaded).toBeNull();
    });

    it('should list all projects', async () => {
      await adapter.saveProject(testProject);
      await adapter.saveProject({
        ...testProject,
        id: 'test-project-2',
        name: 'Test Project 2',
      });

      const projects = await adapter.listProjects();

      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.id)).toContain('test-project-1');
      expect(projects.map((p) => p.id)).toContain('test-project-2');
    });

    it('should delete project and associated data', async () => {
      await adapter.saveProject(testProject);

      await adapter.deleteProject(testProject.id);

      const loaded = await adapter.loadProject(testProject.id);
      expect(loaded).toBeNull();
    });

    it('should delete project assets when deleting project', async () => {
      await adapter.saveProject(testProject);

      // Create test asset
      const asset = createTestAsset('test-project-1', 1024);
      await adapter.saveAsset(asset);

      // Delete project
      await adapter.deleteProject(testProject.id);

      // Verify asset is deleted
      const loadedAsset = await adapter.loadAsset(asset.id);
      expect(loadedAsset).toBeNull();
    });

    it('should delete project history and drafts when deleting project', async () => {
      await adapter.saveProject(testProject);
      await adapter.saveHistory(testProject.id, { test: 'history' });
      await adapter.saveDraft(testProject.id, { test: 'draft' });

      await adapter.deleteProject(testProject.id);

      const history = await adapter.loadHistory(testProject.id);
      const drafts = await adapter.loadDrafts(testProject.id);

      expect(history).toBeNull();
      expect(drafts).toHaveLength(0);
    });
  });

  describe('Asset Operations', () => {
    const createTestAsset = (projectId: string, size: number): StoredAsset => {
      const buffer = new ArrayBuffer(size);
      const blob = new Blob([buffer], { type: 'image/png' });

      return {
        id: `asset-${Date.now()}-${Math.random()}`,
        projectId,
        blob,
        filename: 'test-asset.png',
        mimeType: 'image/png',
        type: 'background' as const,
        size: blob.size,
        uploadedAt: new Date(),
      };
    };

    it('should save asset to memory', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);

      expect(info.location).toBe('indexeddb');
      expect(info.size).toBe(asset.blob.size);
      expect(info.filename).toBe(asset.filename);
      expect(info.projectId).toBe(asset.projectId);
      expect(info.uploadedAt).toBeDefined();
    });

    it('should load asset from memory', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);
      const loaded = await adapter.loadAsset(info.id);

      expect(loaded).toBeDefined();
      expect(loaded?.size).toBe(asset.blob.size);
    });

    it('should return null for non-existent asset', async () => {
      const loaded = await adapter.loadAsset('non-existent');
      expect(loaded).toBeNull();
    });

    it('should load asset info', async () => {
      const asset = createTestAsset('test-project', 1024);

      const saved = await adapter.saveAsset(asset);
      const info = await adapter.loadAssetInfo(saved.id);

      expect(info).toBeDefined();
      expect(info?.id).toBe(saved.id);
      expect(info?.size).toBe(saved.size);
      expect(info?.projectId).toBe(asset.projectId);
    });

    it('should list assets for project', async () => {
      const asset1 = createTestAsset('test-project', 1024);
      const asset2 = createTestAsset('test-project', 2048);
      const asset3 = createTestAsset('other-project', 1024);

      await adapter.saveAsset(asset1);
      await adapter.saveAsset(asset2);
      await adapter.saveAsset(asset3);

      const assets = await adapter.listAssets('test-project');

      expect(assets).toHaveLength(2);
      expect(assets.every(a => a.projectId === 'test-project')).toBe(true);
    });

    it('should delete asset', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);
      await adapter.deleteAsset(info.id);

      const loaded = await adapter.loadAsset(info.id);
      expect(loaded).toBeNull();

      const loadedInfo = await adapter.loadAssetInfo(info.id);
      expect(loadedInfo).toBeNull();
    });

    it('should delete all project assets', async () => {
      const asset1 = createTestAsset('test-project', 1024);
      const asset2 = createTestAsset('test-project', 2048);

      const info1 = await adapter.saveAsset(asset1);
      const info2 = await adapter.saveAsset(asset2);

      await adapter.deleteProjectAssets('test-project');

      const loaded1 = await adapter.loadAsset(info1.id);
      const loaded2 = await adapter.loadAsset(info2.id);

      expect(loaded1).toBeNull();
      expect(loaded2).toBeNull();
    });

    it('should get asset as data URL', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);
      const dataUrl = await adapter.getAssetDataURL(info.id);

      expect(dataUrl).toBeDefined();
      expect(dataUrl).toMatch(/^data:/);
    });

    it('should get asset as object URL', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);
      const objectUrl = await adapter.getAssetObjectURL(info.id);

      expect(objectUrl).toBeDefined();
      expect(objectUrl).toMatch(/^blob:/);
    });

    it('should return null for non-existent asset data URL', async () => {
      const dataUrl = await adapter.getAssetDataURL('non-existent');
      expect(dataUrl).toBeNull();
    });

    it('should return null for non-existent asset object URL', async () => {
      const objectUrl = await adapter.getAssetObjectURL('non-existent');
      expect(objectUrl).toBeNull();
    });
  });

  describe('Storage Management', () => {
    it('should get storage stats', async () => {
      const project: Project = {
        id: 'test-project',
        name: 'Test',
        description: '',
        version: '1.0.0',
        createdAt: new Date(),
        modifiedAt: new Date(),
        metadata: {},
        rootBeatId: 'start',
        beats: [],
        connections: [],
      };
      await adapter.saveProject(project);

      const asset = createTestAsset('test-project', 1024);
      await adapter.saveAsset(asset);

      const stats = await adapter.getStorageStats();

      expect(stats.totalProjects).toBe(1);
      expect(stats.totalAssets).toBe(1);
      expect(stats.indexedDBSize).toBeGreaterThan(0);
      expect(stats.filesystemSize).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });

    it('should cleanup orphaned assets', async () => {
      // Create asset without project
      const asset = createTestAsset('orphaned-project', 1024);
      await adapter.saveAsset(asset);

      const removed = await adapter.cleanupOrphanedAssets();

      expect(removed).toBe(1);

      const loaded = await adapter.loadAsset(asset.id);
      expect(loaded).toBeNull();
    });

    it('should not delete assets with valid projects', async () => {
      const project: Project = {
        id: 'valid-project',
        name: 'Valid',
        description: '',
        version: '1.0.0',
        createdAt: new Date(),
        modifiedAt: new Date(),
        metadata: {},
        rootBeatId: 'start',
        beats: [],
        connections: [],
      };
      await adapter.saveProject(project);

      const asset = createTestAsset('valid-project', 1024);
      await adapter.saveAsset(asset);

      const removed = await adapter.cleanupOrphanedAssets();

      expect(removed).toBe(0);

      const loaded = await adapter.loadAsset(asset.id);
      expect(loaded).toBeDefined();
    });

    it('should clear cache (no-op)', async () => {
      await expect(adapter.clearCache()).resolves.toBeUndefined();
    });

    it('should compact (no-op)', async () => {
      await expect(adapter.compact()).resolves.toBeUndefined();
    });
  });

  describe('History & Drafts', () => {
    const testHistory = {
      past: [{ type: 'test', timestamp: Date.now() }],
      future: [],
    };

    it('should save and load history', async () => {
      await adapter.saveHistory('test-project', testHistory);

      const loaded = await adapter.loadHistory('test-project');

      expect(loaded).toBeDefined();
      expect(loaded.past).toHaveLength(1);
      expect(loaded.past[0].type).toBe('test');
    });

    it('should return null for non-existent history', async () => {
      const loaded = await adapter.loadHistory('non-existent');
      expect(loaded).toBeNull();
    });

    it('should save and load drafts', async () => {
      const draft = {
        id: 'draft-1',
        content: 'test content',
      };

      await adapter.saveDraft('test-project', draft);

      const drafts = await adapter.loadDrafts('test-project');

      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('draft-1');
      expect(drafts[0].timestamp).toBeDefined();
    });

    it('should append drafts without overwriting', async () => {
      await adapter.saveDraft('test-project', { id: 'draft-1' });
      await adapter.saveDraft('test-project', { id: 'draft-2' });

      const drafts = await adapter.loadDrafts('test-project');

      expect(drafts).toHaveLength(2);
    });

    it('should delete draft by ID', async () => {
      await adapter.saveDraft('test-project', { id: 'draft-1' });
      await adapter.saveDraft('test-project', { id: 'draft-2' });

      await adapter.deleteDraft('draft-1');

      const drafts = await adapter.loadDrafts('test-project');

      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('draft-2');
    });

    it('should handle deleting non-existent draft', async () => {
      await adapter.saveDraft('test-project', { id: 'draft-1' });

      await adapter.deleteDraft('non-existent');

      const drafts = await adapter.loadDrafts('test-project');
      expect(drafts).toHaveLength(1);
    });
  });

  describe('Memory Persistence', () => {
    it('should lose all data when instance is reset', async () => {
      const project: Project = {
        id: 'test-project',
        name: 'Test',
        description: '',
        version: '1.0.0',
        createdAt: new Date(),
        modifiedAt: new Date(),
        metadata: {},
        rootBeatId: 'start',
        beats: [],
        connections: [],
      };
      await adapter.saveProject(project);

      // Reset and create new instance
      resetMemoryStorage();
      const newAdapter = new MemoryStorageAdapter();
      await newAdapter.initialize();

      // Data should be lost
      const loaded = await newAdapter.loadProject(project.id);
      expect(loaded).toBeNull();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getMemoryStorage();
      const instance2 = getMemoryStorage();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getMemoryStorage();
      resetMemoryStorage();
      const instance2 = getMemoryStorage();

      expect(instance1).not.toBe(instance2);
    });
  });
});

// Helper function
function createTestAsset(projectId: string, size: number): StoredAsset {
  const buffer = new ArrayBuffer(size);
  const blob = new Blob([buffer], { type: 'image/png' });

  return {
    id: `asset-${Date.now()}-${Math.random()}`,
    projectId,
    blob,
    filename: 'test-asset.png',
    mimeType: 'image/png',
    type: 'background' as const,
    size: blob.size,
    uploadedAt: new Date(),
  };
}
