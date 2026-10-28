/**
 * Saving a project folder leaves the files its manifest lists alone
 * (2026-10-28, Narrative-bullying group: end-screen pictures uploaded three
 * times under the same names; every first save after opening wrote all
 * assets again, named afresh — `_2`, `_3`, `_2_2` — overwriting other
 * pictures' files and filling Pending Changes with files nobody touched).
 * Uses the real serializer from @asaps/core.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectoryAdapter } from '../DirectoryAdapter';

const enc = (s: string) => new TextEncoder().encode(s);

function fakeFs() {
  const files = new Map<string, string | Uint8Array>();
  return {
    files,
    readFile: vi.fn(async (p: string) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p);
    }),
    writeFile: vi.fn(async (p: string, c: string | Uint8Array) => { files.set(p, c); }),
    exists: vi.fn(async (p: string) => files.has(p)),
    mkdir: vi.fn(async () => {}),
    unlink: vi.fn(async (p: string) => { files.delete(p); }),
    readDir: vi.fn(async () => []),
    watchDir: vi.fn(() => vi.fn()),
  };
}

let fs: ReturnType<typeof fakeFs>;
beforeEach(() => {
  fs = fakeFs();
  if (typeof globalThis.window === 'undefined') (globalThis as any).window = globalThis;
  (globalThis as any).window.electronAPI = { fs };
});
afterEach(() => {
  delete (globalThis as any).window.electronAPI;
});

const project = {
  id: 'p1', name: 'Story', createdAt: new Date('2026-10-01'), modifiedAt: new Date('2026-10-28'), version: '1.0.0',
  settings: {}, assetIds: [],
  story: { metadata: { firstBeatId: 'b1' }, beats: [{ id: 'b1', type: 'infoText', name: 'B', parameters: { backgroundImage: 'new' }, connections: [] }], clusters: [], containerBeatPositions: [] },
} as any;

const stored = (id: string, filename: string, bytes: string) => ({
  id, projectId: 'p1', filename, type: 'image', mimeType: 'image/png', size: bytes.length,
  blob: { size: bytes.length, arrayBuffer: async () => enc(bytes).buffer }, uploadedAt: new Date('2026-10-28'),
}) as any;

const entry = (id: string, filename: string, size: number) => ({ id, filename, folder: 'backgrounds', type: 'image', mimeType: 'image/png', size });

describe('saving a project folder', () => {
  it('keeps the files the manifest lists, even when several entries share one name', async () => {
    const manifest = {
      _format: '1.0',
      assets: {
        old: entry('old', 'End.png', 3),
        mid: entry('mid', 'End.png', 4),
        new: entry('new', 'End.png', 5),
        two: entry('two', 'End_2.png', 4),
      },
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    fs.files.set('/proj/assets/_manifest.json', manifestText);
    fs.files.set('/proj/assets/backgrounds/End.png', enc('NEWER'));
    fs.files.set('/proj/assets/backgrounds/End_2.png', enc('TWO!'));
    const a = new DirectoryAdapter();
    a.setProjectPath('/proj');

    // This computer's copies, listed in another order, some with older bytes.
    await a.saveProject(project, [stored('two', 'End_2.png', 'TWO!'), stored('old', 'End.png', 'OLD'), stored('mid', 'End.png', 'MIDL'), stored('new', 'End.png', 'NEWER')]);

    expect(new TextDecoder().decode(fs.files.get('/proj/assets/backgrounds/End.png') as Uint8Array)).toBe('NEWER');
    expect(new TextDecoder().decode(fs.files.get('/proj/assets/backgrounds/End_2.png') as Uint8Array)).toBe('TWO!');
    expect([...fs.files.keys()].filter((p) => p.includes('/assets/backgrounds/'))).toHaveLength(2);
    expect(fs.files.get('/proj/assets/_manifest.json')).toBe(manifestText);
  });

  it('gives a new upload a name no listed file uses, and puts back a listed file that is missing', async () => {
    fs.files.set('/proj/assets/_manifest.json', JSON.stringify({ _format: '1.0', assets: { a: entry('a', 'End.png', 4), b: entry('b', 'End_2.png', 4) } }));
    fs.files.set('/proj/assets/backgrounds/End.png', enc('AAAA'));
    const a = new DirectoryAdapter();
    a.setProjectPath('/proj');

    await a.saveProject(project, [stored('c', 'End.png', 'CCCC'), stored('a', 'End.png', 'AAAA'), stored('b', 'End_2.png', 'BBBB')]);

    const text = (p: string) => new TextDecoder().decode(fs.files.get(p) as Uint8Array);
    expect(text('/proj/assets/backgrounds/End.png')).toBe('AAAA');
    expect(text('/proj/assets/backgrounds/End_2.png')).toBe('BBBB');
    expect(text('/proj/assets/backgrounds/End_3.png')).toBe('CCCC');
    const saved = JSON.parse(fs.files.get('/proj/assets/_manifest.json') as string);
    expect(Object.fromEntries(Object.entries(saved.assets).map(([id, e]: any) => [id, e.filename]))).toEqual({ a: 'End.png', b: 'End_2.png', c: 'End_3.png' });
  });
});
