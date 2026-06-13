/**
 * Tests for the two thin PersistenceAdapter wrappers:
 *   - IndexedDBAdapter: delegates straight to StorageManager
 *   - ZipAdapter: wraps projectZipManager import/export + StorageManager
 *
 * Both just translate the StorageResult / import-result shapes into the
 * adapter contract (return-the-project or throw). StorageManager and the
 * zip manager are mocked so we test the translation/branching only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../StorageManager', () => ({ getStorageManager: vi.fn() }));
vi.mock('../../../utils/projectZipManager', () => ({
  importProjectFromZip: vi.fn(),
  exportProjectAsZip: vi.fn(),
}));

import { IndexedDBAdapter } from '../IndexedDBAdapter';
import { ZipAdapter } from '../ZipAdapter';
import { getStorageManager } from '../../StorageManager';
import { importProjectFromZip } from '../../../utils/projectZipManager';

const project = (id = 'p1') => ({ id, name: 'Proj', version: '1.0.0' }) as any;

/** Build a StorageManager mock with the given method stubs. */
function mockStorage(impl: Record<string, any>) {
  (getStorageManager as any).mockReturnValue(impl);
  return impl;
}

afterEach(() => {
  vi.clearAllMocks();
  if ((globalThis as any).window) delete (globalThis as any).window.electronAPI;
});

describe('IndexedDBAdapter', () => {
  it('reports its type and that granular save is unsupported', () => {
    const a = new IndexedDBAdapter();
    expect(a.type).toBe('indexeddb');
    expect(a.supportsGranularSave()).toBe(false);
  });

  describe('openProject', () => {
    it('returns the project when StorageManager finds it', async () => {
      mockStorage({ getProject: vi.fn().mockResolvedValue({ success: true, data: project('px') }) });
      const a = new IndexedDBAdapter();
      expect(await a.openProject('px')).toMatchObject({ id: 'px' });
    });

    it('throws when the project is not found', async () => {
      mockStorage({ getProject: vi.fn().mockResolvedValue({ success: false }) });
      const a = new IndexedDBAdapter();
      await expect(a.openProject('ghost')).rejects.toThrow(/not found in IndexedDB: ghost/);
    });

    it('throws when success is true but data is missing', async () => {
      mockStorage({ getProject: vi.fn().mockResolvedValue({ success: true, data: null }) });
      const a = new IndexedDBAdapter();
      await expect(a.openProject('p1')).rejects.toThrow(/not found in IndexedDB/);
    });
  });

  describe('saveProject', () => {
    it('delegates to StorageManager.updateProject on success', async () => {
      const update = vi.fn().mockResolvedValue({ success: true, data: project() });
      mockStorage({ updateProject: update });
      const a = new IndexedDBAdapter();
      await a.saveProject(project());
      expect(update).toHaveBeenCalledOnce();
    });

    it('throws the underlying error when the save fails', async () => {
      mockStorage({ updateProject: vi.fn().mockResolvedValue({ success: false, error: new Error('disk full') }) });
      const a = new IndexedDBAdapter();
      await expect(a.saveProject(project())).rejects.toThrow('disk full');
    });

    it('throws a generic error when the failure carries no error object', async () => {
      mockStorage({ updateProject: vi.fn().mockResolvedValue({ success: false }) });
      const a = new IndexedDBAdapter();
      await expect(a.saveProject(project())).rejects.toThrow(/Failed to save project to IndexedDB/);
    });
  });
});

describe('ZipAdapter', () => {
  beforeEach(() => {
    if (typeof globalThis.window === 'undefined') (globalThis as any).window = globalThis;
  });

  it('reports its type and that granular save is unsupported', () => {
    const a = new ZipAdapter();
    expect(a.type).toBe('zip');
    expect(a.supportsGranularSave()).toBe(false);
  });

  describe('openProject', () => {
    it('throws when the Electron filesystem API is unavailable', async () => {
      (globalThis as any).window.electronAPI = undefined;
      const a = new ZipAdapter();
      await expect(a.openProject('/x/proj.asaps.zip')).rejects.toThrow(/requires Electron filesystem API/);
    });

    it('imports the zip and returns the freshly-imported project', async () => {
      (globalThis as any).window.electronAPI = { fs: { readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2])) } };
      (importProjectFromZip as any).mockResolvedValue({ success: true, projectId: 'imp1' });
      mockStorage({ getProject: vi.fn().mockResolvedValue({ success: true, data: project('imp1') }) });

      const a = new ZipAdapter();
      const result = await a.openProject('/path/to/My Project.asaps.zip');
      expect(result).toMatchObject({ id: 'imp1' });
      // generateNewId:false is the contract (preserve ids on import)
      expect(importProjectFromZip).toHaveBeenCalledWith(expect.any(File), { generateNewId: false });
    });

    it('on a conflict, opens and returns the already-existing project', async () => {
      (globalThis as any).window.electronAPI = { fs: { readFile: vi.fn().mockResolvedValue(new Uint8Array([1])) } };
      (importProjectFromZip as any).mockResolvedValue({
        success: false,
        conflict: { existingProjectId: 'exists1' },
      });
      const getProject = vi.fn().mockResolvedValue({ success: true, data: project('exists1') });
      mockStorage({ getProject });

      const a = new ZipAdapter();
      const result = await a.openProject('/x/dup.asaps.zip');
      expect(result).toMatchObject({ id: 'exists1' });
      expect(getProject).toHaveBeenCalledWith('exists1');
    });

    it('throws the import error when it fails without a conflict', async () => {
      (globalThis as any).window.electronAPI = { fs: { readFile: vi.fn().mockResolvedValue(new Uint8Array([1])) } };
      (importProjectFromZip as any).mockResolvedValue({ success: false, error: 'corrupt archive' });
      mockStorage({});

      const a = new ZipAdapter();
      await expect(a.openProject('/x/bad.asaps.zip')).rejects.toThrow('corrupt archive');
    });

    it('throws when import succeeds but the project cannot be retrieved', async () => {
      (globalThis as any).window.electronAPI = { fs: { readFile: vi.fn().mockResolvedValue(new Uint8Array([1])) } };
      (importProjectFromZip as any).mockResolvedValue({ success: true, projectId: 'imp2' });
      mockStorage({ getProject: vi.fn().mockResolvedValue({ success: false }) });

      const a = new ZipAdapter();
      await expect(a.openProject('/x/p.asaps.zip')).rejects.toThrow(/Failed to retrieve imported project/);
    });
  });

  describe('saveProject', () => {
    it('persists to IndexedDB via StorageManager.updateProject', async () => {
      const update = vi.fn().mockResolvedValue({ success: true });
      mockStorage({ updateProject: update });
      const a = new ZipAdapter();
      await a.saveProject(project());
      expect(update).toHaveBeenCalledOnce();
    });
  });
});
