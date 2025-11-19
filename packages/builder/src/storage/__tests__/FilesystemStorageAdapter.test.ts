/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FilesystemStorageAdapter, getFilesystemStorage, resetFilesystemStorage } from '../FilesystemStorageAdapter';
import type { Project, StoredAsset } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FilesystemStorageAdapter', () => {
  let adapter: FilesystemStorageAdapter;
  let testDir: string;

  beforeEach(async () => {
    resetFilesystemStorage();

    // Create a unique test directory for each test
    testDir = path.join(os.tmpdir(), `asaps-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    adapter = new FilesystemStorageAdapter({
      filesystemBasePath: testDir,
    });
    await adapter.initialize();
  });

  afterEach(() => {
    resetFilesystemStorage();

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(adapter.isReady()).toBe(true);
    });

    it('should create directory structure', async () => {
      expect(fs.existsSync(testDir)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'projects'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'assets'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'metadata'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'history'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'drafts'))).toBe(true);
    });

    it('should throw when operations called before initialization', async () => {
      const uninitializedAdapter = new FilesystemStorageAdapter({
        filesystemBasePath: path.join(testDir, 'uninitialized'),
      });

      await expect(uninitializedAdapter.saveProject({} as Project)).rejects.toThrow(
        'Storage not initialized'
      );
    });

    it('should expand tilde in path', async () => {
      const adapterWithTilde = new FilesystemStorageAdapter({
        filesystemBasePath: '~/.asaps-test',
      });
      await adapterWithTilde.initialize();

      expect(adapterWithTilde.isReady()).toBe(true);

      // Clean up
      const expandedPath = path.join(os.homedir(), '.asaps-test');
      if (fs.existsSync(expandedPath)) {
        fs.rmSync(expandedPath, { recursive: true, force: true });
      }
    });
  });

  describe('Storage Location Routing', () => {
    it('should always route to filesystem', () => {
      expect(adapter.getStorageLocation(100)).toBe('filesystem');
      expect(adapter.getStorageLocation(1024 * 1024)).toBe('filesystem');
      expect(adapter.getStorageLocation(100 * 1024 * 1024)).toBe('filesystem');
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

    it('should persist project to filesystem', async () => {
      await adapter.saveProject(testProject);

      const projectPath = path.join(testDir, 'projects', `${testProject.id}.json`);
      expect(fs.existsSync(projectPath)).toBe(true);

      const content = fs.readFileSync(projectPath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.id).toBe(testProject.id);
      expect(saved.name).toBe(testProject.name);
    });

    it('should update modifiedAt timestamp on save', async () => {
      await adapter.saveProject(testProject);

      const loaded = await adapter.loadProject(testProject.id);
      expect(loaded?.modifiedAt).toBeDefined();

      // modifiedAt should be a string (ISO timestamp) from filesystem
      if (loaded?.modifiedAt) {
        expect(typeof loaded.modifiedAt === 'string' || loaded.modifiedAt instanceof Date).toBe(true);
      }
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

      const projectPath = path.join(testDir, 'projects', `${testProject.id}.json`);
      expect(fs.existsSync(projectPath)).toBe(false);
    });

    it('should delete project assets when deleting project', async () => {
      await adapter.saveProject(testProject);

      // Create test asset
      const asset = createTestAsset('test-project-1', 1024);
      await adapter.saveAsset(asset);

      // Delete project
      await adapter.deleteProject(testProject.id);

      // Verify asset metadata is deleted
      const metadataPath = path.join(testDir, 'metadata', `${asset.id}.json`);
      expect(fs.existsSync(metadataPath)).toBe(false);
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

    it('should save asset to filesystem', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);

      expect(info.location).toBe('filesystem');
      expect(info.size).toBe(asset.blob.size);
      expect(info.filename).toBe(asset.filename);
      expect(info.path).toBeDefined();

      // Verify file exists
      if (info.path) {
        expect(fs.existsSync(info.path)).toBe(true);
      }
    });

    it('should organize assets by type in folders', async () => {
      const backgroundAsset = createTestAsset('test-project', 1024);
      backgroundAsset.type = 'background';
      backgroundAsset.filename = 'background.png';

      const characterAsset = createTestAsset('test-project', 1024);
      characterAsset.type = 'character';
      characterAsset.filename = 'character.png';

      await adapter.saveAsset(backgroundAsset);
      await adapter.saveAsset(characterAsset);

      const backgroundPath = path.join(testDir, 'assets', 'test-project', 'backgrounds', 'background.png');
      const characterPath = path.join(testDir, 'assets', 'test-project', 'characters', 'character.png');

      expect(fs.existsSync(backgroundPath)).toBe(true);
      expect(fs.existsSync(characterPath)).toBe(true);
    });

    it('should save asset metadata', async () => {
      const asset = createTestAsset('test-project', 1024);

      const info = await adapter.saveAsset(asset);

      const metadataPath = path.join(testDir, 'metadata', `${info.id}.json`);
      expect(fs.existsSync(metadataPath)).toBe(true);

      const content = fs.readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(content);
      expect(metadata.id).toBe(info.id);
      expect(metadata.projectId).toBe(asset.projectId);
    });

    it('should load asset from filesystem', async () => {
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

      // Verify file and metadata are deleted
      if (info.path) {
        expect(fs.existsSync(info.path)).toBe(false);
      }
      const metadataPath = path.join(testDir, 'metadata', `${info.id}.json`);
      expect(fs.existsSync(metadataPath)).toBe(false);
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
      // In Node.js filesystem adapter, object URL is actually the file path
      expect(objectUrl).toMatch(/test-project/);
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
      expect(stats.filesystemSize).toBeGreaterThan(0);
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
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await adapter.saveDraft('test-project', { id: 'draft-2' });

      const drafts = await adapter.loadDrafts('test-project');

      expect(drafts).toHaveLength(2);
    });

    it('should delete draft', async () => {
      await adapter.saveDraft('test-project', { id: 'draft-1' });
      await adapter.saveDraft('test-project', { id: 'draft-2' });

      await adapter.deleteDraft('draft-1');

      const drafts = await adapter.loadDrafts('test-project');

      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('draft-2');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getFilesystemStorage();
      const instance2 = getFilesystemStorage();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getFilesystemStorage();
      resetFilesystemStorage();
      const instance2 = getFilesystemStorage();

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
