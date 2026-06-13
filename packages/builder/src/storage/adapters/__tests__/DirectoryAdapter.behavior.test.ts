/**
 * Behavior tests for DirectoryAdapter — the Electron filesystem persistence
 * backend for directory-format projects. The sibling
 * DirectoryAdapter.translations.test.ts covers the open/save translation
 * wiring; this file covers everything else:
 *   - path/electron guards (every op throws without a projectPath / fs API)
 *   - createReader's text decoding + listDir isDirectory normalization
 *   - granular saves: saveBeat, saveSettings, saveProjectMeta, saveAsset
 *   - deleteBeat / deleteAsset (manifest pruning + binary unlink)
 *   - readBeat disk search, watchForChanges wiring, simple accessors
 *
 * @asaps/core is mocked with minimal working implementations so the
 * adapter's own logic (path building, manifest read-modify-write, guard
 * order) is what's under test — not the serializer internals. The
 * filesystem is an in-memory Map fake exposed as window.electronAPI.fs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@asaps/core', () => ({
  // Pass-through / minimal serializer stand-ins
  serializeToDirectory: vi.fn(() => ({ files: [], assetFiles: [] })),
  deserializeFromDirectory: vi.fn(),
  isDirectoryProject: vi.fn().mockResolvedValue(true),
  deterministicStringify: vi.fn((o: any) => JSON.stringify(o)),
  serializeBeat: vi.fn((b: any) => b),
  serializeBeatFromJSON: vi.fn((b: any) => b),
  beatFilename: vi.fn((b: any) => `${b.id}.${b.type}.json`),
  setManifestEntry: vi.fn((m: any, e: any) => {
    m.assets[e.id] = e;
  }),
  parseManifest: vi.fn((s: string) => JSON.parse(s)),
  serializeManifest: vi.fn((m: any) => JSON.stringify(m)),
  getAssetFolder: vi.fn(() => 'images'),
  generateUniqueFilename: vi.fn((name: string) => name),
}));

import { DirectoryAdapter, isElectronWithFS } from '../DirectoryAdapter';

// ---- in-memory filesystem fake -------------------------------------------
function makeFakeFs() {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Set<string>();
  let readDirImpl: (p: string) => any[] = () => [];

  const fs = {
    files,
    dirs,
    setReadDir(fn: (p: string) => any[]) {
      readDirImpl = fn;
    },
    readFile: vi.fn(async (p: string) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p);
    }),
    writeFile: vi.fn(async (p: string, content: string | Uint8Array) => {
      files.set(p, content);
    }),
    exists: vi.fn(async (p: string) => files.has(p) || dirs.has(p)),
    mkdir: vi.fn(async (p: string) => {
      dirs.add(p);
    }),
    unlink: vi.fn(async (p: string) => {
      files.delete(p);
    }),
    readDir: vi.fn(async (p: string) => readDirImpl(p)),
    watchDir: vi.fn((_p: string, _cb: (f: string[]) => void) => vi.fn()),
  };
  return fs;
}

let fakeFs: ReturnType<typeof makeFakeFs>;

beforeEach(() => {
  fakeFs = makeFakeFs();
  if (typeof globalThis.window === 'undefined') (globalThis as any).window = globalThis;
  (globalThis as any).window.electronAPI = { fs: fakeFs };
});

afterEach(() => {
  delete (globalThis as any).window.electronAPI;
  vi.clearAllMocks();
});

function adapterAt(path = '/proj'): DirectoryAdapter {
  const a = new DirectoryAdapter();
  a.setProjectPath(path);
  return a;
}

// ---------------------------------------------------------------------------

describe('simple accessors', () => {
  it('type is "directory" and supportsGranularSave is true', () => {
    const a = new DirectoryAdapter();
    expect(a.type).toBe('directory');
    expect(a.supportsGranularSave()).toBe(true);
  });

  it('getProjectPath / setProjectPath round-trip; getManifest starts null', () => {
    const a = new DirectoryAdapter();
    expect(a.getProjectPath()).toBeNull();
    expect(a.getManifest()).toBeNull();
    a.setProjectPath('/somewhere');
    expect(a.getProjectPath()).toBe('/somewhere');
  });

  it('isElectronWithFS reflects presence of electronAPI.fs', () => {
    expect(isElectronWithFS()).toBe(true);
    delete (globalThis as any).window.electronAPI;
    expect(isElectronWithFS()).toBe(false);
  });
});

describe('guards', () => {
  it('every disk op rejects when no project path is set', async () => {
    const a = new DirectoryAdapter(); // no path
    await expect(a.saveBeat({ id: 'b', type: 't' } as any)).rejects.toThrow(/No project path/);
    await expect(a.deleteBeat('b', 't')).rejects.toThrow(/No project path/);
    await expect(a.saveSettings({} as any)).rejects.toThrow(/No project path/);
    await expect(a.saveProjectMeta({})).rejects.toThrow(/No project path/);
    await expect(a.saveAsset({ id: 'a' } as any)).rejects.toThrow(/No project path/);
    await expect(a.deleteAsset('a')).rejects.toThrow(/No project path/);
    await expect(a.readBeat('b')).rejects.toThrow(/No project path/);
    expect(() => a.watchForChanges(() => {})).toThrow(/No project path/);
  });

  it('saveBeat rejects when the Electron fs API is absent', async () => {
    const a = adapterAt();
    delete (globalThis as any).window.electronAPI;
    await expect(a.saveBeat({ id: 'b', type: 't' } as any)).rejects.toThrow(/Electron filesystem API/);
  });
});

describe('createReader', () => {
  it('throws when the Electron fs API is missing', () => {
    const a = adapterAt();
    delete (globalThis as any).window.electronAPI;
    expect(() => (a as any).createReader()).toThrow(/Electron filesystem API/);
  });

  it('readText decodes Uint8Array, ArrayBuffer, and string content', async () => {
    const a = adapterAt();
    const reader = (a as any).createReader();
    // Construct via the global Uint8Array (same realm the adapter's
    // `instanceof Uint8Array` check uses) — a TextEncoder result can be a
    // cross-realm typed array under vitest/jsdom and fail instanceof.
    const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"

    fakeFs.files.set('/u8', bytes);
    expect(await reader.readText('/u8')).toBe('hello');

    fakeFs.files.set('/ab', bytes.buffer as any);
    expect(await reader.readText('/ab')).toBe('hello');

    fakeFs.files.set('/str', 'plain' as any);
    expect(await reader.readText('/str')).toBe('plain');
  });

  it('listDir normalizes isDirectory whether it is a function or a boolean', async () => {
    const a = adapterAt();
    fakeFs.setReadDir(() => [
      { name: 'dirA', isDirectory: () => true },
      { name: 'fileB', isDirectory: false },
    ]);
    const reader = (a as any).createReader();
    const entries = await reader.listDir('/proj/whatever');
    expect(entries).toEqual([
      { name: 'dirA', isDirectory: true },
      { name: 'fileB', isDirectory: false },
    ]);
  });
});

describe('saveBeat', () => {
  it('writes an unclustered beat file with deterministic content', async () => {
    const a = adapterAt('/proj');
    await a.saveBeat({ id: 'b1', type: 'infoText', toJSON: () => ({ id: 'b1', type: 'infoText' }) } as any);

    const expectedPath = '/proj/clusters/_unclustered/b1.infoText.json';
    expect(fakeFs.files.has(expectedPath)).toBe(true);
    expect(fakeFs.mkdir).toHaveBeenCalledWith('/proj/clusters/_unclustered');
  });

  it('routes to a cluster directory resolved from clusters/_index.json', async () => {
    const a = adapterAt('/proj');
    // findClusterDir reads the index to map clusterId → slug
    fakeFs.files.set('/proj/clusters/_index.json', JSON.stringify({ clusters: [{ id: 'c9', slug: 'act-one' }] }));

    await a.saveBeat({ id: 'b2', type: 'dialogTree' } as any, 'c9');
    expect(fakeFs.files.has('/proj/clusters/act-one/b2.dialogTree.json')).toBe(true);
  });
});

describe('deleteBeat', () => {
  it('unlinks the beat file when it exists', async () => {
    const a = adapterAt('/proj');
    const path = '/proj/clusters/_unclustered/b1.infoText.json';
    fakeFs.files.set(path, '{}');
    await a.deleteBeat('b1', 'infoText');
    expect(fakeFs.files.has(path)).toBe(false);
  });

  it('is a no-op when the beat file is absent', async () => {
    const a = adapterAt('/proj');
    await a.deleteBeat('ghost', 'infoText');
    expect(fakeFs.unlink).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('merges over existing settings and nests under globalSettings', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set('/proj/settings.json', JSON.stringify({ projectSettings: { keep: 1 }, _format: '1.0' }));

    await a.saveSettings({ volume: 0.5 } as any);

    const written = JSON.parse(fakeFs.files.get('/proj/settings.json') as string);
    expect(written.projectSettings).toEqual({ keep: 1 }); // preserved
    expect(written.globalSettings).toEqual({ volume: 0.5 });
  });

  it('writes fresh settings when none exist yet', async () => {
    const a = adapterAt('/proj');
    await a.saveSettings({ volume: 1 } as any);
    const written = JSON.parse(fakeFs.files.get('/proj/settings.json') as string);
    expect(written.globalSettings).toEqual({ volume: 1 });
  });
});

describe('saveProjectMeta', () => {
  it('updates only the provided fields and stamps modifiedAt', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set('/proj/project.json', JSON.stringify({ name: 'Old', description: 'keep', other: 'x' }));

    await a.saveProjectMeta({ name: 'New' });

    const written = JSON.parse(fakeFs.files.get('/proj/project.json') as string);
    expect(written.name).toBe('New');
    expect(written.description).toBe('keep'); // untouched
    expect(written.other).toBe('x'); // preserved
    expect(typeof written.modifiedAt).toBe('string');
  });
});

describe('saveAsset', () => {
  it('writes the binary and a manifest entry with a unique filename', async () => {
    const a = adapterAt('/proj');
    const asset = {
      id: 'asset1',
      filename: 'bg.png',
      type: 'image',
      mimeType: 'image/png',
      size: 4,
      // jsdom's Blob lacks arrayBuffer(); use a blob-like the adapter can read.
      blob: { type: 'image/png', size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer },
      uploadedAt: new Date('2024-01-01'),
      metadata: {},
    };

    await a.saveAsset(asset as any);

    // binary written under assets/<folder>/<filename>
    expect(fakeFs.files.has('/proj/assets/images/bg.png')).toBe(true);
    // manifest written with the entry
    const manifest = JSON.parse(fakeFs.files.get('/proj/assets/_manifest.json') as string);
    expect(manifest.assets.asset1).toMatchObject({ id: 'asset1', filename: 'bg.png', folder: 'images' });
  });
});

describe('deleteAsset', () => {
  it('removes the binary and prunes the manifest entry', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set(
      '/proj/assets/_manifest.json',
      JSON.stringify({ _format: '1.0', assets: { asset1: { id: 'asset1', folder: 'images', filename: 'bg.png' } } }),
    );
    fakeFs.files.set('/proj/assets/images/bg.png', new Uint8Array([1]));

    await a.deleteAsset('asset1');

    expect(fakeFs.files.has('/proj/assets/images/bg.png')).toBe(false);
    const manifest = JSON.parse(fakeFs.files.get('/proj/assets/_manifest.json') as string);
    expect(manifest.assets.asset1).toBeUndefined();
  });

  it('is a no-op when the manifest does not exist', async () => {
    const a = adapterAt('/proj');
    await a.deleteAsset('asset1');
    expect(fakeFs.writeFile).not.toHaveBeenCalled();
  });

  it('is a no-op when the asset id is not in the manifest', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set('/proj/assets/_manifest.json', JSON.stringify({ _format: '1.0', assets: {} }));
    await a.deleteAsset('missing');
    expect(fakeFs.unlink).not.toHaveBeenCalled();
  });
});

describe('readBeat', () => {
  it('searches cluster dirs and returns the beat data without _format', async () => {
    const a = adapterAt('/proj');
    fakeFs.dirs.add('/proj/clusters');
    fakeFs.setReadDir((p: string) => {
      if (p === '/proj/clusters') return [{ name: 'act-one', isDirectory: () => true }];
      if (p === '/proj/clusters/act-one') return [{ name: 'b1.infoText.json', isDirectory: () => false }];
      return [];
    });
    fakeFs.files.set('/proj/clusters/act-one/b1.infoText.json', JSON.stringify({ _format: '1.0', id: 'b1', type: 'infoText', text: 'hi' }));

    const beat = await a.readBeat('b1');
    expect(beat).toEqual({ id: 'b1', type: 'infoText', text: 'hi' });
    expect(beat._format).toBeUndefined();
  });

  it('returns null when the clusters directory is absent', async () => {
    const a = adapterAt('/proj');
    expect(await a.readBeat('b1')).toBeNull();
  });
});

describe('watchForChanges', () => {
  it('returns a no-op disposer when watchDir is unavailable', () => {
    const a = adapterAt('/proj');
    (globalThis as any).window.electronAPI = { fs: { ...fakeFs, watchDir: undefined } };
    const stop = a.watchForChanges(() => {});
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('maps changed file paths to "modified" events and the disposer unwatches', () => {
    const a = adapterAt('/proj');
    const unwatch = vi.fn();
    let captured: ((f: string[]) => void) | null = null;
    fakeFs.watchDir.mockImplementation((_p: string, cb: (f: string[]) => void) => {
      captured = cb;
      return unwatch;
    });
    const onChange = vi.fn();

    const stop = a.watchForChanges(onChange);
    captured!(['a.json', 'b.json']);

    expect(onChange).toHaveBeenCalledWith([
      { path: 'a.json', type: 'modified' },
      { path: 'b.json', type: 'modified' },
    ]);

    stop();
    expect(unwatch).toHaveBeenCalledOnce();
  });
});
