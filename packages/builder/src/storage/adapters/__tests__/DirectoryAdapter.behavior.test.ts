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

// A realistic app version (tests otherwise run as 0.0.0, older than any project).
vi.mock('../../../utils/appVersion', async (importOriginal) => {
  const real: any = await importOriginal();
  class NewerProjectError extends Error { constructor(public savedWith: string) { super(`saved with v${savedWith}`); this.name = 'NewerProjectError'; } }
  return { ...real, APP_VERSION: '0.9.130', NewerProjectError };
});

import { DirectoryAdapter, isElectronWithFS } from '../DirectoryAdapter';
import { serializeToDirectory } from '@asaps/core';

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

describe('project.json stamps (group report 2026-10-21)', () => {
  const project = (modifiedAt: string, name = 'Story') => ({
    id: 'p1', name, createdAt: new Date('2026-10-01'), modifiedAt: new Date(modifiedAt), version: '1.0.0',
    settings: {}, assetIds: [],
    story: { metadata: { firstBeatId: 'b1' }, beats: [{ id: 'b1', type: 'infoText', name: 'B', parameters: {}, connections: [] }], clusters: [], containerBeatPositions: [] },
  }) as any;

  it('saveProject leaves project.json alone when only its stamps would change', async () => {
    const a = adapterAt('/proj');
    const meta = (over: any) => ({ files: [{ path: 'project.json', content: JSON.stringify({ _format: '1.0', id: 'p1', name: 'Story', modifiedAt: '2026-10-20T10:00:00Z', savedWith: '0.9.125', ...over }) }], assetFiles: [] });
    const serialize = vi.mocked(serializeToDirectory);
    serialize.mockReturnValueOnce(meta({}) as any);
    await a.saveProject(project('2026-10-20T10:00:00Z'));
    const first = fakeFs.files.get('/proj/project.json');
    serialize.mockReturnValueOnce(meta({ modifiedAt: '2026-10-21T10:00:00Z' }) as any);
    await a.saveProject(project('2026-10-21T10:00:00Z'));
    expect(fakeFs.files.get('/proj/project.json')).toBe(first);
    // A newer ASAPS stamps the project once (an older copy can then warn) …
    serialize.mockReturnValueOnce(meta({ modifiedAt: '2026-10-21T10:30:00Z', savedWith: '0.9.127' }) as any);
    await a.saveProject(project('2026-10-21T10:30:00Z'));
    const stamped = fakeFs.files.get('/proj/project.json');
    expect(JSON.parse(stamped as string).savedWith).toBe('0.9.127');
    // … and then leaves it alone again.
    serialize.mockReturnValueOnce(meta({ modifiedAt: '2026-10-21T10:40:00Z', savedWith: '0.9.127' }) as any);
    await a.saveProject(project('2026-10-21T10:40:00Z'));
    expect(fakeFs.files.get('/proj/project.json')).toBe(stamped);
    // An older ASAPS writing a real change keeps the newer stamp.
    serialize.mockReturnValueOnce(meta({ name: 'Older rename', modifiedAt: '2026-10-21T10:50:00Z', savedWith: '0.9.120' }) as any);
    await a.saveProject(project('2026-10-21T10:50:00Z', 'Older rename'));
    expect(JSON.parse(fakeFs.files.get('/proj/project.json') as string)).toMatchObject({ name: 'Older rename', savedWith: '0.9.127' });
    serialize.mockReturnValueOnce(meta({ name: 'Renamed', modifiedAt: '2026-10-21T11:00:00Z' }) as any);
    await a.saveProject(project('2026-10-21T11:00:00Z', 'Renamed'));
    expect(JSON.parse(fakeFs.files.get('/proj/project.json') as string).name).toBe('Renamed');
  });

  it('refuses to write a project a newer ASAPS saved (strict, 2026-10-21)', async () => {
    const a = adapterAt('/proj');
    const before = JSON.stringify({ _format: '1.0', id: 'p1', name: 'Story', savedWith: '0.9.200' });
    fakeFs.files.set('/proj/project.json', before);
    await expect(a.saveProject(project('2026-10-21T12:00:00Z'))).rejects.toThrow(/0\.9\.200/);
    await expect(a.saveProjectMeta({ name: 'X' })).rejects.toThrow(/0\.9\.200/);
    await expect(a.saveBeat({ id: 'b', type: 'infoText' } as any)).rejects.toThrow(/0\.9\.200/);
    expect(fakeFs.files.get('/proj/project.json')).toBe(before);
  });

  it('saveProjectMeta writes nothing when nothing but the stamp would change', async () => {
    const a = adapterAt('/proj');
    const before = JSON.stringify({ _format: '1.0', name: 'Same', modifiedAt: '2026-10-20T10:00:00.000Z' });
    fakeFs.files.set('/proj/project.json', before);
    await a.saveProjectMeta({ name: 'Same' });
    expect(fakeFs.files.get('/proj/project.json')).toBe(before);
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

  it('maps changed file paths to "modified" events and the disposer unwatches', async () => {
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

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith([
      { path: 'a.json', type: 'modified' },
      { path: 'b.json', type: 'modified' },
    ]);

    stop();
    expect(unwatch).toHaveBeenCalledOnce();
  });
});

// A Windows student got "files changed outside ASAPS … and 70 more" on
// every save while nothing else touched the folder (2026-10-27).
describe('own writes are not outside changes', () => {
  const files = (content: Record<string, string>) => ({
    files: Object.entries(content).map(([path, c]) => ({ path, content: c })), assetFiles: [],
  });
  const project = { id: 'p1', name: 'S', settings: {}, assetIds: [], story: { metadata: {}, beats: [] } } as any;

  function watching(a: DirectoryAdapter) {
    let report: (f: string[]) => void = () => {};
    fakeFs.watchDir.mockImplementation((_p: string, cb: (f: string[]) => void) => { report = cb; return vi.fn(); });
    const onChange = vi.fn();
    a.watchForChanges(onChange);
    return { onChange, report: (f: string[]) => report(f) };
  }

  it('a save leaves files that already say the same untouched', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set('/proj/settings.json', '{"a":1}');
    vi.mocked(serializeToDirectory).mockReturnValueOnce(files({ 'settings.json': '{"a":1}', 'theme.json': '{"t":1}' }) as any);
    await a.saveProject(project);
    const written = fakeFs.writeFile.mock.calls.map((c) => c[0]);
    expect(written).toEqual(['/proj/theme.json']);
  });

  it('the watcher drops our own writes, however late they come back, and reports real edits', async () => {
    const a = adapterAt('C:\\Users\\s\\proj');
    vi.mocked(serializeToDirectory).mockReturnValueOnce(files({ 'settings.json': '{"a":1}', 'characters/_index.json': '[]' }) as any);
    await a.saveProject(project);
    const { onChange, report } = watching(a);

    report(['settings.json', 'characters\\_index.json']);
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).not.toHaveBeenCalled();

    fakeFs.files.set('C:\\Users\\s\\proj\\characters\\_index.json', '[{"id":"c"}]');
    report(['settings.json', 'characters\\_index.json', 'clusters/x/new.json']);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].map((e: any) => e.path)).toEqual(['characters/_index.json', 'clusters/x/new.json']);
  });

  it('a beat file we deleted is ours; one deleted by someone else is not', async () => {
    const a = adapterAt('/proj');
    fakeFs.files.set('/proj/clusters/_unclustered/b1.infoText.json', '{}');
    fakeFs.files.set('/proj/settings.json', '{}');
    await a.deleteBeat('b1', 'infoText');
    await a.saveSettings({} as any);
    const { onChange, report } = watching(a);
    report(['clusters/_unclustered/b1.infoText.json']);
    await new Promise((r) => setTimeout(r, 0));
    expect(onChange).not.toHaveBeenCalled();
    fakeFs.files.delete('/proj/settings.json');
    report(['settings.json']);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});

// A copied project folder keeps its original's id; opening it gives it its own.
describe('DirectoryAdapter — project id of a folder', () => {
  it('reads the id from a folder project.json, null when missing or unreadable', async () => {
    fakeFs.files.set('/a/project.json', JSON.stringify({ _format: '1.0', id: 'p-1', name: 'A' }));
    fakeFs.files.set('/bad/project.json', '{ not json');
    const a = new DirectoryAdapter();
    expect(await a.readFolderProjectId('/a')).toBe('p-1');
    expect(await a.readFolderProjectId('/bad')).toBeNull();
    expect(await a.readFolderProjectId('/none')).toBeNull();
  });

  it('assignProjectId rewrites only the id in the open folder', async () => {
    fakeFs.files.set('/copy/project.json', JSON.stringify({ _format: '1.0', id: 'p-1', name: 'A', firstBeatId: '0' }));
    await adapterAt('/copy').assignProjectId('p-2');
    expect(JSON.parse(fakeFs.files.get('/copy/project.json') as string)).toEqual({ _format: '1.0', id: 'p-2', name: 'A', firstBeatId: '0' });
    await adapterAt('/copy').assignProjectId('p-3', 'A 2');
    expect(JSON.parse(fakeFs.files.get('/copy/project.json') as string)).toMatchObject({ id: 'p-3', name: 'A 2' });
  });
});

// NarrativDesign (2026-10-20): a merge committed with its conflict markers
// still in. Such a folder must not open (and then be saved over).
describe('DirectoryAdapter — conflict markers', () => {
  it('finds JSON files with Git conflict markers, skipping assets and dot-files', async () => {
    const tree: Record<string, any[]> = {
      '/p': [
        { name: 'project.json', isDirectory: () => false },
        { name: '.asaps-editing.json', isDirectory: () => false },
        { name: 'clusters', isDirectory: () => true },
        { name: 'assets', isDirectory: () => true },
      ],
      '/p/clusters': [{ name: '_unclustered', isDirectory: () => true }],
      '/p/clusters/_unclustered': [
        { name: 'infoText_beat_41.json', isDirectory: () => false },
        { name: 'infoText_beat_42.json', isDirectory: () => false },
      ],
    };
    fakeFs.setReadDir((p: string) => tree[p] || []);
    fakeFs.files.set('/p/project.json', '{\n<<<<<<< HEAD\n  "a": 1,\n=======\n  "a": 2,\n>>>>>>> df0cea8\n}');
    fakeFs.files.set('/p/.asaps-editing.json', '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> x');
    fakeFs.files.set('/p/clusters/_unclustered/infoText_beat_41.json', '{"text": "<<<<<<< not at line start"}');
    fakeFs.files.set('/p/clusters/_unclustered/infoText_beat_42.json', '{\n>>>>>>> theirs\n}');
    expect(await new DirectoryAdapter().findConflictMarkers('/p')).toEqual(['project.json', 'clusters/_unclustered/infoText_beat_42.json']);
  });
});
