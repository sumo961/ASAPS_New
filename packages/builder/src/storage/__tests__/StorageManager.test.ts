/**
 * Tests for StorageManager — the IndexedDB CRUD layer behind projects,
 * assets, command history, and auto-save drafts. Runs against
 * fake-indexeddb (loaded globally in src/test/setup.ts), so these are
 * real round-trips through idb, not mocks.
 *
 * Each test gets a fresh database: beforeEach creates + inits a manager,
 * afterEach closes it and deletes the named DB so state never leaks
 * between cases.
 *
 * Coverage focus:
 *   - the StorageResult<T> success/failure contract (errors are returned,
 *     not thrown — every method wraps in try/catch)
 *   - deleteProject's cascade across assets/history/drafts
 *   - listProjects sort/filter/paginate branches
 *   - listAssets index-selection branches (project / type / compound)
 *   - getHistory's empty-default synthesis
 *   - draft latest/list ordering + cleanupOldDrafts retention
 *   - the module singleton (get/reset)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  StorageManager,
  getStorageManager,
  resetStorageManager,
} from '../StorageManager';
import { deleteDatabase } from '../schema';
import type {
  Project,
  StoredAsset,
  CommandHistory,
  AutoSaveDraft,
  AssetType,
} from '../types';

// ---- fixture factories ----------------------------------------------------
// IndexedDB stores structured clones without schema validation, so the
// fixtures only need the fields the manager reads/indexes. Cast through
// the real types to stay honest about shape.

let seq = 0;
const uid = (prefix: string) => `${prefix}_${seq++}`;

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

function makeAsset(over: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: uid('asset'),
    projectId: 'proj_x',
    type: 'image' as AssetType,
    filename: 'pic.png',
    mimeType: 'image/png',
    size: 1024,
    blob: new Blob(['x'], { type: 'image/png' }),
    uploadedAt: new Date(),
    ...over,
  } as StoredAsset;
}

function makeDraft(projectId: string, createdAt: Date): AutoSaveDraft {
  return {
    id: `${projectId}_${createdAt.getTime()}_${seq++}`,
    projectId,
    projectSnapshot: { name: 'snap' },
    createdAt,
    isManual: false,
  };
}

let mgr: StorageManager;

beforeEach(async () => {
  mgr = new StorageManager();
  await mgr.init();
});

afterEach(async () => {
  await mgr.close();
  await deleteDatabase();
});

// ---------------------------------------------------------------------------

describe('init / getDb lifecycle', () => {
  it('init() is idempotent (second call is a no-op, does not throw)', async () => {
    await expect(mgr.init()).resolves.toBeUndefined();
  });

  it('operations auto-initialize the db when called on a fresh (un-init) manager', async () => {
    const fresh = new StorageManager();
    // No explicit init() — createProject should init() under the hood.
    const res = await fresh.createProject(makeProject());
    expect(res.success).toBe(true);
    await fresh.close();
  });

  it('close() is safe to call when already closed', async () => {
    await mgr.close();
    await expect(mgr.close()).resolves.toBeUndefined();
    // re-init for the afterEach close/delete
    await mgr.init();
  });
});

describe('Project operations', () => {
  it('createProject then getProject round-trips', async () => {
    const p = makeProject({ name: 'My Story' });
    const created = await mgr.createProject(p);
    expect(created.success).toBe(true);

    const got = await mgr.getProject(p.id);
    expect(got.success).toBe(true);
    expect(got.data?.name).toBe('My Story');
  });

  it('getProject on a missing id fails with "Project not found"', async () => {
    const got = await mgr.getProject('does-not-exist');
    expect(got.success).toBe(false);
    expect(got.error?.message).toMatch(/not found/i);
  });

  it('createProject on a duplicate id returns a failure result (not a throw)', async () => {
    const p = makeProject();
    await mgr.createProject(p);
    const dup = await mgr.createProject(p); // db.add rejects on existing key
    expect(dup.success).toBe(false);
    // idb surfaces a ConstraintError DOMException (not a true Error
    // subclass in jsdom) — the contract is just "error is populated".
    expect(dup.error).toBeDefined();
    expect(dup.error?.name).toBe('ConstraintError');
  });

  it('updateProject bumps modifiedAt', async () => {
    const p = makeProject({ modifiedAt: new Date('2000-01-01') });
    await mgr.createProject(p);

    const res = await mgr.updateProject(p);
    expect(res.success).toBe(true);
    expect(res.data!.modifiedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
  });

  it('projectExists reflects presence', async () => {
    const p = makeProject();
    expect(await mgr.projectExists(p.id)).toBe(false);
    await mgr.createProject(p);
    expect(await mgr.projectExists(p.id)).toBe(true);
  });

  describe('deleteProject cascade', () => {
    it('removes the project and its assets, history, and drafts', async () => {
      const p = makeProject();
      await mgr.createProject(p);
      await mgr.createAsset(makeAsset({ projectId: p.id }));
      await mgr.saveHistory({ projectId: p.id, commands: [], currentIndex: -1, lastUpdated: new Date() });
      await mgr.saveDraft(makeDraft(p.id, new Date()));

      const del = await mgr.deleteProject(p.id);
      expect(del.success).toBe(true);

      expect(await mgr.projectExists(p.id)).toBe(false);
      expect((await mgr.listAssets({ projectId: p.id })).data).toEqual([]);
      // history default-synthesizes when absent → empty commands
      expect((await mgr.getHistory(p.id)).data?.commands).toEqual([]);
      expect((await mgr.listDrafts(p.id)).data).toEqual([]);
    });

    it('leaves OTHER projects\' data intact', async () => {
      const keep = makeProject();
      const drop = makeProject();
      await mgr.createProject(keep);
      await mgr.createProject(drop);
      await mgr.createAsset(makeAsset({ projectId: keep.id }));

      await mgr.deleteProject(drop.id);

      expect(await mgr.projectExists(keep.id)).toBe(true);
      expect((await mgr.listAssets({ projectId: keep.id })).data?.length).toBe(1);
    });
  });

  describe('listProjects', () => {
    beforeEach(async () => {
      await mgr.createProject(makeProject({ name: 'Alpha', createdAt: new Date('2021-01-01'), modifiedAt: new Date('2021-03-01') }));
      await mgr.createProject(makeProject({ name: 'Beta', createdAt: new Date('2021-02-01'), modifiedAt: new Date('2021-01-01') }));
      await mgr.createProject(makeProject({ name: 'Gamma', createdAt: new Date('2021-03-01'), modifiedAt: new Date('2021-02-01') }));
    });

    it('lists all projects with no query', async () => {
      const res = await mgr.listProjects();
      expect(res.data?.length).toBe(3);
    });

    it('sortBy "name" returns name-ascending order', async () => {
      const res = await mgr.listProjects({ sortBy: 'name' });
      expect(res.data?.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('sortBy "created" orders by createdAt index', async () => {
      const res = await mgr.listProjects({ sortBy: 'created' });
      expect(res.data?.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('sortBy "modified" orders by modifiedAt index', async () => {
      const res = await mgr.listProjects({ sortBy: 'modified' });
      // modifiedAt asc: Beta(Jan) Gamma(Feb) Alpha(Mar)
      expect(res.data?.map((p) => p.name)).toEqual(['Beta', 'Gamma', 'Alpha']);
    });

    it('sortDirection "desc" reverses the result', async () => {
      const res = await mgr.listProjects({ sortBy: 'name', sortDirection: 'desc' });
      expect(res.data?.map((p) => p.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('nameFilter matches case-insensitively', async () => {
      const res = await mgr.listProjects({ nameFilter: 'eta' });
      expect(res.data?.map((p) => p.name)).toEqual(['Beta']);
    });

    it('offset + limit paginate', async () => {
      const res = await mgr.listProjects({ sortBy: 'name', offset: 1, limit: 1 });
      expect(res.data?.map((p) => p.name)).toEqual(['Beta']);
    });
  });
});

describe('Asset operations', () => {
  it('create / get / update / delete round-trip', async () => {
    const a = makeAsset();
    expect((await mgr.createAsset(a)).success).toBe(true);
    expect((await mgr.getAsset(a.id)).data?.filename).toBe('pic.png');

    const upd = await mgr.updateAsset(a);
    expect(upd.success).toBe(true);
    expect(upd.data?.lastUsedAt).toBeInstanceOf(Date);

    expect((await mgr.deleteAsset(a.id)).success).toBe(true);
    expect((await mgr.getAsset(a.id)).success).toBe(false);
  });

  it('getAsset on missing id fails with "Asset not found"', async () => {
    const res = await mgr.getAsset('nope');
    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/not found/i);
  });

  describe('listAssets index branches', () => {
    beforeEach(async () => {
      await mgr.createAsset(makeAsset({ projectId: 'p1', type: 'image' }));
      await mgr.createAsset(makeAsset({ projectId: 'p1', type: 'audio' }));
      await mgr.createAsset(makeAsset({ projectId: 'p2', type: 'image' }));
    });

    it('no filter → all assets', async () => {
      expect((await mgr.listAssets()).data?.length).toBe(3);
    });

    it('by projectId', async () => {
      expect((await mgr.listAssets({ projectId: 'p1' })).data?.length).toBe(2);
    });

    it('by type', async () => {
      expect((await mgr.listAssets({ type: 'image' })).data?.length).toBe(2);
    });

    it('by compound projectId + type', async () => {
      const res = await mgr.listAssets({ projectId: 'p1', type: 'audio' });
      expect(res.data?.length).toBe(1);
      expect(res.data?.[0].type).toBe('audio');
    });

    it('honors limit', async () => {
      expect((await mgr.listAssets({ limit: 2 })).data?.length).toBe(2);
    });
  });

  it('deleteProjectAssets removes only that project\'s assets', async () => {
    await mgr.createAsset(makeAsset({ projectId: 'p1' }));
    await mgr.createAsset(makeAsset({ projectId: 'p1' }));
    await mgr.createAsset(makeAsset({ projectId: 'p2' }));

    await mgr.deleteProjectAssets('p1');
    expect((await mgr.listAssets({ projectId: 'p1' })).data).toEqual([]);
    expect((await mgr.listAssets({ projectId: 'p2' })).data?.length).toBe(1);
  });

  it('getProjectAssets returns v1 assets when present', async () => {
    await mgr.createAsset(makeAsset({ projectId: 'pA' }));
    const res = await mgr.getProjectAssets('pA');
    expect(res.success).toBe(true);
    expect(res.data?.length).toBe(1);
  });
});

describe('Command history operations', () => {
  it('saveHistory then getHistory round-trips', async () => {
    const h: CommandHistory = { projectId: 'p1', commands: [], currentIndex: 5, lastUpdated: new Date() };
    await mgr.saveHistory(h);
    const got = await mgr.getHistory('p1');
    expect(got.data?.currentIndex).toBe(5);
  });

  it('getHistory synthesizes an empty history when none stored', async () => {
    const got = await mgr.getHistory('never-saved');
    expect(got.success).toBe(true);
    expect(got.data?.commands).toEqual([]);
    expect(got.data?.currentIndex).toBe(-1);
  });

  it('clearHistory removes the record (back to empty default)', async () => {
    await mgr.saveHistory({ projectId: 'p1', commands: [], currentIndex: 2, lastUpdated: new Date() });
    await mgr.clearHistory('p1');
    expect((await mgr.getHistory('p1')).data?.currentIndex).toBe(-1);
  });
});

describe('Auto-save draft operations', () => {
  it('saveDraft then getLatestDraft returns the newest by createdAt', async () => {
    await mgr.saveDraft(makeDraft('p1', new Date('2021-01-01')));
    await mgr.saveDraft(makeDraft('p1', new Date('2021-06-01')));
    await mgr.saveDraft(makeDraft('p1', new Date('2021-03-01')));

    const latest = await mgr.getLatestDraft('p1');
    expect(latest.success).toBe(true);
    expect(latest.data?.createdAt).toEqual(new Date('2021-06-01'));
  });

  it('getLatestDraft fails when the project has no drafts', async () => {
    const res = await mgr.getLatestDraft('empty');
    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/no drafts/i);
  });

  it('listDrafts returns newest-first', async () => {
    await mgr.saveDraft(makeDraft('p1', new Date('2021-01-01')));
    await mgr.saveDraft(makeDraft('p1', new Date('2021-02-01')));
    const res = await mgr.listDrafts('p1');
    const times = res.data!.map((d) => d.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('deleteDraft removes a single draft', async () => {
    const d = makeDraft('p1', new Date());
    await mgr.saveDraft(d);
    await mgr.deleteDraft(d.id);
    expect((await mgr.listDrafts('p1')).data).toEqual([]);
  });

  it('deleteProjectDrafts removes only that project\'s drafts', async () => {
    await mgr.saveDraft(makeDraft('p1', new Date()));
    await mgr.saveDraft(makeDraft('p2', new Date()));
    await mgr.deleteProjectDrafts('p1');
    expect((await mgr.listDrafts('p1')).data).toEqual([]);
    expect((await mgr.listDrafts('p2')).data?.length).toBe(1);
  });

  describe('cleanupOldDrafts', () => {
    it('keeps only the newest N drafts and reports how many were deleted', async () => {
      for (let i = 0; i < 5; i++) {
        await mgr.saveDraft(makeDraft('p1', new Date(2021, 0, i + 1)));
      }
      const res = await mgr.cleanupOldDrafts('p1', 2);
      expect(res.success).toBe(true);
      expect(res.data).toBe(3); // 5 - 2 kept
      expect((await mgr.listDrafts('p1')).data?.length).toBe(2);
    });

    it('is a no-op when drafts count is at or below keepCount', async () => {
      await mgr.saveDraft(makeDraft('p1', new Date()));
      const res = await mgr.cleanupOldDrafts('p1', 10);
      expect(res.data).toBe(0);
    });
  });
});

describe('Utility', () => {
  it('getStats counts projects, assets, drafts and sums asset size', async () => {
    await mgr.createProject(makeProject());
    await mgr.createAsset(makeAsset({ size: 100 }));
    await mgr.createAsset(makeAsset({ size: 250 }));
    await mgr.saveDraft(makeDraft('p1', new Date()));

    const stats = await mgr.getStats();
    expect(stats.success).toBe(true);
    expect(stats.data?.projectCount).toBe(1);
    expect(stats.data?.assetCount).toBe(2);
    expect(stats.data?.totalAssetSize).toBe(350);
    expect(stats.data?.draftCount).toBe(1);
  });

  it('clearAll empties every store', async () => {
    await mgr.createProject(makeProject());
    await mgr.createAsset(makeAsset());
    await mgr.saveDraft(makeDraft('p1', new Date()));

    await mgr.clearAll();
    const stats = await mgr.getStats();
    expect(stats.data).toMatchObject({ projectCount: 0, assetCount: 0, draftCount: 0, totalAssetSize: 0 });
  });
});

describe('module singleton', () => {
  afterEach(() => resetStorageManager());

  it('getStorageManager returns the same instance across calls', () => {
    const a = getStorageManager();
    const b = getStorageManager();
    expect(a).toBe(b);
  });

  it('resetStorageManager clears the singleton so a new instance is created', () => {
    const a = getStorageManager();
    resetStorageManager();
    const b = getStorageManager();
    expect(a).not.toBe(b);
  });
});
