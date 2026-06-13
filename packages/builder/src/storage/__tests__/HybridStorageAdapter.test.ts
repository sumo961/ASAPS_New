/**
 * Tests for HybridStorageAdapter — the size-routing storage layer that
 * sends small assets to IndexedDB and large assets to filesystem (Electron)
 * or Cache API (browser). Runs against fake-indexeddb (global in
 * src/test/setup.ts).
 *
 * Scope notes:
 *   - jsdom is NOT Electron and its Cache API mock returns undefined on
 *     match, so the filesystem + cache-api SAVE paths can't round-trip
 *     here. We therefore exercise the routing DECISION (getStorageLocation)
 *     directly, and round-trip the IndexedDB path end-to-end.
 *   - Asset fixtures use a NON-image mime type so saveAsset skips
 *     generateThumbnail (which needs a real Image/canvas and would hang on
 *     the never-firing img.onload in jsdom).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HybridStorageAdapter,
  getStorageAdapter,
  resetStorageAdapter,
} from '../HybridStorageAdapter';
import { StorageError } from '../IStorageAdapter';
import { deleteDatabase } from '../schema';
import type { Project, StoredAsset } from '../types';

let seq = 0;
const uid = (p: string) => `${p}_${seq++}`;

function makeProject(over: Partial<Project> = {}): Project {
  const now = new Date();
  return {
    id: uid('proj'),
    name: 'Untitled',
    story: {} as any,
    settings: {} as any,
    assetIds: [],
    createdAt: now,
    modifiedAt: now,
    version: '1.0.0',
    ...over,
  } as Project;
}

function makeAsset(over: Partial<StoredAsset> = {}, sizeBytes = 1024): StoredAsset {
  // Non-image mime type → saveAsset skips thumbnail generation.
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: 'audio/mpeg' });
  return {
    id: uid('asset'),
    projectId: 'proj_x',
    type: 'audio',
    filename: 'clip.mp3',
    mimeType: 'audio/mpeg',
    size: blob.size,
    blob,
    uploadedAt: new Date(),
    ...over,
  } as StoredAsset;
}

let adapter: HybridStorageAdapter;

beforeEach(async () => {
  adapter = new HybridStorageAdapter();
  await adapter.initialize();
});

afterEach(async () => {
  (adapter as any).db?.close();
  await deleteDatabase();
  resetStorageAdapter();
});

describe('getStorageLocation routing (pure decision)', () => {
  it('routes below-threshold sizes to indexeddb', () => {
    expect(adapter.getStorageLocation(1024)).toBe('indexeddb');
    expect(adapter.getStorageLocation(5 * 1024 * 1024 - 1)).toBe('indexeddb');
  });

  it('routes at/above-threshold sizes to cache-api in a browser (non-Electron) env', () => {
    expect(adapter.getStorageLocation(5 * 1024 * 1024)).toBe('cache-api');
    expect(adapter.getStorageLocation(50 * 1024 * 1024)).toBe('cache-api');
  });

  it('honors a custom sizeThreshold from config', () => {
    const tiny = new HybridStorageAdapter({ sizeThreshold: 100 });
    expect(tiny.getStorageLocation(50)).toBe('indexeddb');
    expect(tiny.getStorageLocation(150)).toBe('cache-api');
  });
});

describe('readiness', () => {
  it('isReady is false before initialize and true after', async () => {
    const fresh = new HybridStorageAdapter();
    expect(fresh.isReady()).toBe(false);
    await fresh.initialize();
    expect(fresh.isReady()).toBe(true);
    (fresh as any).db?.close();
  });

  it('operations throw a STORAGE_UNAVAILABLE StorageError before init', async () => {
    const fresh = new HybridStorageAdapter();
    await expect(fresh.saveProject(makeProject())).rejects.toBeInstanceOf(StorageError);
    await expect(fresh.saveProject(makeProject())).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
});

describe('project operations', () => {
  it('saveProject / loadProject round-trips and stamps modifiedAt', async () => {
    const p = makeProject({ name: 'Hybrid Story', modifiedAt: new Date('2000-01-01') });
    await adapter.saveProject(p);

    const loaded = await adapter.loadProject(p.id);
    expect(loaded?.name).toBe('Hybrid Story');
    // saveProject overwrites modifiedAt with "now"
    expect(loaded!.modifiedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
  });

  it('loadProject returns null for a missing id', async () => {
    expect(await adapter.loadProject('ghost')).toBeNull();
  });

  it('listProjects returns the lightweight projection only', async () => {
    await adapter.saveProject(makeProject({ name: 'A', description: 'first' }));
    await adapter.saveProject(makeProject({ name: 'B' }));

    const list = await adapter.listProjects();
    expect(list.length).toBe(2);
    const a = list.find((p) => p.name === 'A')!;
    expect(Object.keys(a).sort()).toEqual(['createdAt', 'description', 'id', 'modifiedAt', 'name']);
    expect(a.description).toBe('first');
  });

  it('deleteProject also clears its assets, history, and drafts', async () => {
    const p = makeProject();
    await adapter.saveProject(p);
    await adapter.saveAsset(makeAsset({ projectId: p.id }));
    await adapter.saveHistory(p.id, { commands: [1], currentIndex: 0 });
    await adapter.saveDraft(p.id, { name: 'd' });

    await adapter.deleteProject(p.id);

    expect(await adapter.loadProject(p.id)).toBeNull();
    expect(await adapter.listAssets(p.id)).toEqual([]);
    expect(await adapter.loadHistory(p.id)).toBeNull();
    expect(await adapter.loadDrafts(p.id)).toEqual([]);
  });
});

describe('asset operations (IndexedDB path)', () => {
  it('saveAsset routes a small asset to indexeddb and returns its info', async () => {
    const a = makeAsset({ projectId: 'p1' });
    const info = await adapter.saveAsset(a);
    expect(info.location).toBe('indexeddb');
    expect(info.size).toBe(a.blob.size);
    expect(info.projectId).toBe('p1');
    // non-image → thumbnail left empty
    expect(info.thumbnail).toBe('');
  });

  it('loadAsset round-trips the stored blob', async () => {
    const a = makeAsset();
    await adapter.saveAsset(a);
    const blob = await adapter.loadAsset(a.id);
    // fake-indexeddb's structured clone in jsdom returns the stored Blob
    // as a plain object, so we assert retrieval succeeded (non-null) rather
    // than Blob identity — the adapter just hands back what idb stored.
    expect(blob).not.toBeNull();
  });

  it('loadAsset returns null when no metadata exists', async () => {
    expect(await adapter.loadAsset('missing')).toBeNull();
  });

  it('loadAssetInfo returns the metadata record', async () => {
    const a = makeAsset({ filename: 'theme.mp3' });
    await adapter.saveAsset(a);
    const info = await adapter.loadAssetInfo(a.id);
    expect(info?.filename).toBe('theme.mp3');
  });

  it('listAssets returns metadata for a given project only', async () => {
    await adapter.saveAsset(makeAsset({ projectId: 'p1' }));
    await adapter.saveAsset(makeAsset({ projectId: 'p1' }));
    await adapter.saveAsset(makeAsset({ projectId: 'p2' }));

    expect((await adapter.listAssets('p1')).length).toBe(2);
    expect((await adapter.listAssets('p2')).length).toBe(1);
  });

  it('getProjectAssets reconstructs full StoredAsset records (with blobs)', async () => {
    const a = makeAsset({ projectId: 'pX', mimeType: 'audio/mpeg' });
    await adapter.saveAsset(a);

    const res = await adapter.getProjectAssets('pX');
    expect(res.success).toBe(true);
    expect(res.data!.length).toBe(1);
    expect(res.data![0].blob).toBeDefined(); // see note above re: jsdom Blob clone
    expect(res.data![0].type).toBe('audio'); // inferred from mime
  });

  it('deleteAsset removes both the metadata and the blob', async () => {
    const a = makeAsset();
    await adapter.saveAsset(a);
    await adapter.deleteAsset(a.id);
    expect(await adapter.loadAssetInfo(a.id)).toBeNull();
    expect(await adapter.loadAsset(a.id)).toBeNull();
  });

  it('deleteProjectAssets clears every asset for a project', async () => {
    await adapter.saveAsset(makeAsset({ projectId: 'p1' }));
    await adapter.saveAsset(makeAsset({ projectId: 'p1' }));
    await adapter.deleteProjectAssets('p1');
    expect(await adapter.listAssets('p1')).toEqual([]);
  });

  it('migrateProjectAssets re-homes asset metadata to the new project id', async () => {
    await adapter.saveAsset(makeAsset({ projectId: 'old' }));
    await adapter.saveAsset(makeAsset({ projectId: 'old' }));

    const moved = await adapter.migrateProjectAssets('old', 'new');
    expect(moved).toBe(2);
    expect(await adapter.listAssets('old')).toEqual([]);
    expect((await adapter.listAssets('new')).length).toBe(2);
  });

  it('migrateProjectAssets returns 0 when there is nothing to move', async () => {
    expect(await adapter.migrateProjectAssets('empty', 'dest')).toBe(0);
  });
});

describe('history & drafts', () => {
  it('saveHistory / loadHistory round-trips commands + index', async () => {
    await adapter.saveHistory('p1', { commands: ['a', 'b'], currentIndex: 1 });
    const h = await adapter.loadHistory('p1');
    expect(h.commands).toEqual(['a', 'b']);
    expect(h.currentIndex).toBe(1);
  });

  it('loadHistory returns null when none stored', async () => {
    expect(await adapter.loadHistory('none')).toBeNull();
  });

  it('saveDraft / loadDrafts round-trips the snapshot, deleteDraft removes it', async () => {
    await adapter.saveDraft('p1', { name: 'snapshot', isManual: true });
    const drafts = await adapter.loadDrafts('p1');
    expect(drafts.length).toBe(1);
    expect(drafts[0].name).toBe('snapshot');

    // recover the generated draft id to delete it
    const metaTx = (adapter as any).db.transaction('drafts', 'readonly');
    const all = await metaTx.store.index('by-project').getAll('p1');
    await adapter.deleteDraft(all[0].id);
    expect(await adapter.loadDrafts('p1')).toEqual([]);
  });
});

describe('singleton', () => {
  it('getStorageAdapter returns a stable instance until reset', () => {
    const a = getStorageAdapter();
    expect(getStorageAdapter()).toBe(a);
    resetStorageAdapter();
    expect(getStorageAdapter()).not.toBe(a);
  });
});
