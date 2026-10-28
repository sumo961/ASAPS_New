/**
 * Theme archives in RAR or 7z become a ZIP the importer reads. The archive is
 * unpacked by libarchive's Node build here (the app uses its browser worker);
 * kit.7z holds Kit/textbox.png and Kit/Button/choice_idle_background.png.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';

vi.mock('../libarchiveWorker?worker&url', () => ({ default: 'worker.js' }));
vi.mock('libarchive.js/dist/libarchive.wasm?url', () => ({ default: 'libarchive.wasm' }));

import { archiveToZip, type ArchiveOpener } from '../archiveToZip';
import { extractRenpyAssets } from '@asaps/core';

const openWithNodeLibarchive: ArchiveOpener = async (archive) => {
  // @ts-expect-error — libarchive's Node build ships without types
  const { Archive } = await import('libarchive.js/dist/libarchive-node.mjs');
  // Its worker path is a URL pathname, not decoded — it breaks on folders
  // with spaces ("Mobile Documents"); keep its options, decode the path.
  const { Worker } = await import('node:worker_threads');
  const { fileURLToPath } = await import('node:url');
  const workerPath = fileURLToPath(new URL('worker-bundle-node.mjs', import.meta.resolve('libarchive.js/dist/libarchive-node.mjs')));
  Archive.init({ ...Archive._options, getWorker: () => new Worker(workerPath) });
  // Node's own File in and out (jsdom's has no arrayBuffer for the worker).
  const { File: NodeFile } = await import('node:buffer');
  const opened = await Archive.open(new NodeFile([await readAsBytes(archive)], archive.name));
  await opened.extractFiles();
  const raw: Array<{ file: File; path: string }> = await opened.getFilesArray();
  const entries = await Promise.all(raw.map(async ({ path, file }) => ({ path, file: new File([await readAsBytes(file)], file.name) })));
  return { encrypted: false, entries };
};

const readAsBytes = (blob: Blob) => new Promise<Uint8Array>((done) => {
  const reader = new FileReader();
  reader.onload = () => done(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});

const kit7z = () => new File([readFileSync(resolve(__dirname, 'fixtures/kit.7z'))], 'Night Kit.7z');

describe('archiveToZip', () => {
  it('leaves a ZIP as it is', async () => {
    const zip = new File(['PK'], 'kit.zip', { type: 'application/zip' });
    expect(await archiveToZip(zip, async () => { throw new Error('not called'); })).toBe(zip);
  });

  it('packs a 7z into a ZIP with the same files and folders', async () => {
    const zipFile = await archiveToZip(kit7z(), openWithNodeLibarchive);
    expect(zipFile.name).toBe('Night Kit.zip');
    const names = Object.keys((await JSZip.loadAsync(await readAsBytes(zipFile))).files).filter((n) => !n.endsWith('/'));
    expect(names.sort()).toEqual(['Kit/Button/choice_idle_background.png', 'Kit/textbox.png']);
  });

  it('the importer finds the frame and the choice buttons in it', async () => {
    const zipFile = await archiveToZip(kit7z(), openWithNodeLibarchive);
    const bundle = await extractRenpyAssets(await readAsBytes(zipFile) as unknown as Blob);
    expect(bundle.nothingUsable).toBeUndefined();
    expect(bundle.uiGraphics.find((g) => g.filename === 'textbox.png')?.role).toBe('textbox');
  });

  it('says so when an archive is password-protected or cannot be unpacked', async () => {
    const rar = new File(['x'], 'kit.rar');
    await expect(archiveToZip(rar, async () => ({ encrypted: true, entries: [] }))).rejects.toThrow(/password-protected/);
    await expect(archiveToZip(rar, async () => { throw new Error('bad header'); })).rejects.toThrow(/could not be unpacked \(bad header\)/);
    await expect(archiveToZip(new File(['x'], 'kit.tar'))).rejects.toThrow(/not a ZIP, RAR or 7z/);
  });
});
