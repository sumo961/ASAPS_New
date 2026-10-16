/**
 * Large assets (≥ 5 MB, e.g. a WAV sound) on the desktop app go to the
 * filesystem cache. The renderer has no Node globals, and the write used
 * Buffer.from — it threw, the add fell back to on-screen only, and the
 * sound was gone after reopening (and never reached the project folder or
 * git). This runs that path the way Electron does: no Buffer.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { HybridStorageAdapter, resetStorageAdapter } from '../HybridStorageAdapter';
import { deleteDatabase } from '../schema';
import type { StoredAsset } from '../types';
import { Blob as NodeBlob } from 'node:buffer';

describe('large asset on the desktop app', () => {
  const files = new Map<string, Uint8Array>();
  let adapter: HybridStorageAdapter | null = null;
  const realBuffer = (globalThis as any).Buffer;

  afterEach(async () => {
    (globalThis as any).Buffer = realBuffer;
    delete (window as any).electronAPI;
    (adapter as any)?.db?.close();
    await deleteDatabase();
    resetStorageAdapter();
    files.clear();
  });

  it('stores a 6 MB WAV and gives it back after reopening, without Node Buffer', async () => {
    (window as any).electronAPI = {
      app: { getPath: async () => '/home/qa' },
      fs: {
        exists: async (p: string) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')),
        mkdir: async () => {},
        writeFile: async (p: string, data: any) => {
          if (!(data instanceof Uint8Array)) throw new Error('expected bytes');
          files.set(p, data);
        },
        readFile: async (p: string) => {
          const d = files.get(p);
          if (!d) throw new Error('ENOENT ' + p);
          return d;
        },
        unlink: async (p: string) => { files.delete(p); },
      },
    };
    // As in the Electron renderer, app code has no Node Buffer. (jsdom's own
    // Blob needs it, so only the adapter's calls are refused.)
    (globalThis as any).Buffer = new Proxy(realBuffer, {
      get(target, prop, receiver) {
        // Direct callers only: the frame right after this trap.
        const caller = (new Error().stack || '').split('\n')[2] || '';
        if (/HybridStorageAdapter\.ts/.test(caller)) {
          throw new ReferenceError('Buffer is not defined');
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    adapter = new HybridStorageAdapter();
    await adapter.initialize();
    const bytes = new Uint8Array(6 * 1024 * 1024);
    bytes[0] = 82; // 'R'
    // Node's Blob: jsdom's has no arrayBuffer().
    const blob = new NodeBlob([bytes], { type: 'audio/wav' }) as unknown as Blob;
    const asset: StoredAsset = {
      id: 'asset_wav', projectId: 'proj_sound', type: 'audio', filename: 'rain.wav',
      mimeType: 'audio/wav', size: blob.size, blob, uploadedAt: new Date(),
    } as StoredAsset;

    const info = await adapter.saveAsset(asset);
    expect(info.location).toBe('filesystem');

    // "Reopen": a fresh adapter on the same database and files.
    (adapter as any).db?.close();
    adapter = new HybridStorageAdapter();
    await adapter.initialize();
    const result = await adapter.getProjectAssets('proj_sound');
    expect(result.success).toBe(true);
    const back = result.data!.find((a) => a.id === 'asset_wav')!;
    expect(back.type).toBe('audio');
    expect(back.blob.size).toBe(6 * 1024 * 1024);
    expect(back.blob.type).toBe('audio/wav');
  });
});
