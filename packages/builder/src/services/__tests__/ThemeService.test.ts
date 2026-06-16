/**
 * Tests for ThemeService — theme CRUD, asset storage, inheritance resolution,
 * and recency tracking. Runs against the real idb schema backed by
 * fake-indexeddb (global in the builder test setup); each test starts from a
 * freshly deleted database so the singleton/connection state can't leak.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeService } from '../ThemeService';
import { deleteDatabase } from '../../storage/schema';

const theme = (id: string, over: any = {}) =>
  ({
    meta: { id, name: `Theme ${id}`, ...(over.meta || {}) },
    colors: { primary: { hex: '#111111' }, background: { hex: '#000000' }, ...(over.colors || {}) },
    fonts: { body: { family: 'Arial' } },
    textBox: { padding: 10 },
    button: { radius: 4 },
    hotspot: { opacity: 1 },
    effects: { animation: 'none' },
    ...over,
  }) as any;

let svc: ThemeService;
beforeEach(async () => {
  await deleteDatabase();
  svc = new ThemeService();
  await svc.initialize();
});

// Release the connection so the next beforeEach's deleteDatabase() doesn't
// block on an open upgrade (idb fires "blocked" and the run would hang).
afterEach(() => {
  svc.close();
});

describe('getStorageLocation', () => {
  it('routes small assets to indexeddb and large ones to cache-api', () => {
    expect(svc.getStorageLocation(1024)).toBe('indexeddb');
    expect(svc.getStorageLocation(10 * 1024 * 1024)).toBe('cache-api');
  });

  it('honors a custom sizeThreshold', () => {
    const small = new ThemeService({ sizeThreshold: 100 });
    expect(small.getStorageLocation(50)).toBe('indexeddb');
    expect(small.getStorageLocation(150)).toBe('cache-api');
  });
});

describe('CRUD', () => {
  it('creates a theme, assigns the id, and reads it back', async () => {
    const id = await svc.createTheme(theme('t1'));
    expect(id).toBe('t1');
    const got = await svc.getTheme('t1');
    expect(got?.definition.meta.name).toBe('Theme t1');
    expect(got?.source).toBe('custom');
    expect(got?.readOnly).toBe(false);
    expect(got?.definition.meta.modifiedAt).toBeTruthy();
  });

  it('generates an id when the definition has none', async () => {
    const id = await svc.createTheme(theme('', { meta: { id: '', name: 'Anon' } }));
    expect(id).toBeTruthy();
    expect(await svc.getTheme(id)).not.toBeNull();
  });

  it('lists all themes and filters by source', async () => {
    await svc.createTheme(theme('a'), 'custom');
    await svc.createTheme(theme('b'), 'imported');
    expect((await svc.listThemes()).map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect((await svc.listThemesBySource('imported')).map((t) => t.id)).toEqual(['b']);
    expect(await svc.listThemesBySource('custom')).toHaveLength(1);
  });

  it('updates a theme and preserves the id', async () => {
    await svc.createTheme(theme('t1'));
    await svc.updateTheme('t1', { meta: { id: 'ignored', name: 'Renamed' } as any });
    const got = await svc.getTheme('t1');
    expect(got?.id).toBe('t1');
    expect(got?.definition.meta.id).toBe('t1');
    expect(got?.definition.meta.name).toBe('Renamed');
  });

  it('throws when updating a missing theme', async () => {
    await expect(svc.updateTheme('nope', {})).rejects.toThrow(/not found/i);
  });

  it('deletes a theme', async () => {
    await svc.createTheme(theme('t1'));
    await svc.deleteTheme('t1');
    expect(await svc.getTheme('t1')).toBeNull();
  });

  it('deleting a missing theme is a no-op (no throw)', async () => {
    await expect(svc.deleteTheme('ghost')).resolves.toBeUndefined();
  });
});

describe('read-only (built-in) protection', () => {
  beforeEach(async () => {
    await svc.registerBuiltInThemes([theme('builtin')]);
  });

  it('registers built-in themes as read-only', async () => {
    const got = await svc.getTheme('builtin');
    expect(got?.source).toBe('built-in');
    expect(got?.readOnly).toBe(true);
  });

  it('refuses to update or delete a read-only theme', async () => {
    await expect(svc.updateTheme('builtin', { meta: { name: 'x' } as any })).rejects.toThrow(/read-only/i);
    await expect(svc.deleteTheme('builtin')).rejects.toThrow(/read-only/i);
  });

  it('preserves existing assetIds when re-registering', async () => {
    const blob = new Blob(['x'], { type: 'text/plain' });
    await svc.saveThemeAsset('builtin', blob, 'a.txt', 'uiGraphic' as any);
    await svc.registerBuiltInThemes([theme('builtin', { meta: { id: 'builtin', name: 'v2' } })]);
    const got = await svc.getTheme('builtin');
    expect(got?.definition.meta.name).toBe('v2');
    expect(got?.assetIds).toHaveLength(1);
  });
});

describe('inheritance resolution', () => {
  it('merges parent into child (child wins) via getResolvedTheme', async () => {
    await svc.createTheme(theme('parent', { colors: { primary: { hex: '#ff0000' }, background: { hex: '#0000ff' } } }));
    await svc.createTheme(
      theme('child', { meta: { id: 'child', name: 'Child', extends: 'parent' }, colors: { primary: { hex: '#00ff00' } } }),
    );
    const resolved = await svc.getResolvedTheme('child');
    expect(resolved?.colors.primary.hex).toBe('#00ff00'); // child override
    expect(resolved?.colors.background.hex).toBe('#0000ff'); // inherited from parent
  });

  it('returns the theme as-is when it does not extend anything', async () => {
    await svc.createTheme(theme('solo'));
    const resolved = await svc.getResolvedTheme('solo');
    expect(resolved?.meta.id).toBe('solo');
  });

  it('returns null for a missing theme', async () => {
    expect(await svc.getResolvedTheme('missing')).toBeNull();
  });

  it('falls back to the child when the parent is missing', async () => {
    await svc.createTheme(theme('orphan', { meta: { id: 'orphan', name: 'Orphan', extends: 'gone' } }));
    const resolved = await svc.getResolvedTheme('orphan');
    expect(resolved?.meta.id).toBe('orphan');
  });
});

describe('asset operations', () => {
  beforeEach(async () => {
    await svc.createTheme(theme('t1'));
  });

  it('saves an asset, links it to the theme, and loads it back', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const assetId = await svc.saveThemeAsset('t1', blob, 'hello.txt', 'uiGraphic' as any, 'other');

    const info = await svc.getThemeAssetInfo(assetId);
    expect(info).toMatchObject({ themeId: 't1', filename: 'hello.txt', location: 'indexeddb' });

    const loaded = await svc.loadThemeAsset(assetId);
    expect(loaded).not.toBeNull();

    const theme = await svc.getTheme('t1');
    expect(theme?.assetIds).toContain(assetId);
  });

  it('lists assets for a theme', async () => {
    await svc.saveThemeAsset('t1', new Blob(['a']), 'a.txt', 'uiGraphic' as any);
    await svc.saveThemeAsset('t1', new Blob(['b']), 'b.txt', 'uiGraphic' as any);
    expect(await svc.listThemeAssets('t1')).toHaveLength(2);
  });

  it('deletes a single asset and unlinks it from the theme', async () => {
    const id = await svc.saveThemeAsset('t1', new Blob(['a']), 'a.txt', 'uiGraphic' as any);
    await svc.deleteThemeAsset(id);
    expect(await svc.loadThemeAsset(id)).toBeNull();
    expect(await svc.getThemeAssetInfo(id)).toBeNull();
    expect((await svc.getTheme('t1'))?.assetIds).not.toContain(id);
  });

  it('cascade-deletes assets when the theme is deleted', async () => {
    const id = await svc.saveThemeAsset('t1', new Blob(['a']), 'a.txt', 'uiGraphic' as any);
    await svc.deleteTheme('t1');
    expect(await svc.loadThemeAsset(id)).toBeNull();
    expect(await svc.listThemeAssets('t1')).toHaveLength(0);
  });

  it('returns null when loading a missing asset', async () => {
    expect(await svc.loadThemeAsset('nope')).toBeNull();
    expect(await svc.getThemeAssetInfo('nope')).toBeNull();
  });
});

describe('recency', () => {
  it('tracks lastUsedAt and returns used themes sorted descending', async () => {
    await svc.createTheme(theme('old'));
    await svc.createTheme(theme('new'));
    await svc.markThemeUsed('old');
    await svc.markThemeUsed('new');

    const recent = await svc.getRecentThemes(5);
    expect(recent.map((t) => t.id).sort()).toEqual(['new', 'old']);
    // every returned theme carries a timestamp, in non-increasing order
    expect(recent.every((t) => t.lastUsedAt)).toBe(true);
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1].lastUsedAt! >= recent[i].lastUsedAt!).toBe(true);
    }
  });

  it('excludes never-used themes and honors the limit', async () => {
    await svc.createTheme(theme('a'));
    await svc.createTheme(theme('b'));
    await svc.createTheme(theme('c'));
    await svc.markThemeUsed('a');
    await svc.markThemeUsed('b');
    const recent = await svc.getRecentThemes(1);
    expect(recent).toHaveLength(1);
    expect(['a', 'b']).toContain(recent[0].id);
  });

  it('markThemeUsed on a missing theme is a no-op', async () => {
    await expect(svc.markThemeUsed('ghost')).resolves.toBeUndefined();
  });
});
