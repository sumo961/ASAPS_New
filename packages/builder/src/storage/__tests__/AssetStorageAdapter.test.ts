/**
 * Tests for AssetStorageAdapter — the bridge between the UI `Asset` type
 * (blob URLs, File objects) and the persistence `StoredAsset` type (blobs +
 * metadata). Pure conversion logic, so these are fast and deterministic.
 *
 * Notable behaviors pinned:
 *   - filename synthesis (append an extension only when the name lacks one)
 *   - mime-type resolution (blob.type, else guessed from the name)
 *   - the Phase 3.3 `variants` round-trip: stored under metadata, lifted
 *     back to top-level Asset.variants ONLY when the array is non-empty
 *   - extractBlobFromAsset: File short-circuit vs fetch-the-blob-URL path
 *   - revoke helpers only touch blob: URLs and swallow errors
 *
 * Thumbnail note: generateThumbnail uses Image/canvas. jsdom has no canvas,
 * and a bare Image never fires onload, so we stub Image to fire onerror —
 * which assetToStored swallows (thumbnail simply stays unset). That keeps
 * the image branch from hanging while still exercising it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  assetToStored,
  storedToAsset,
  extractBlobFromAsset,
  assetsToStored,
  storedToAssets,
  revokeBlobUrls,
  revokeBlobUrl,
} from '../AssetStorageAdapter';
import type { Asset } from '../../components/assets/AssetManager';
import type { StoredAsset } from '../types';

const png = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: 'image/png' });

function uiAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'hero',
    type: 'image',
    url: 'blob:hero',
    size: 8,
    uploadedAt: new Date('2024-01-01'),
    ...over,
  };
}

function stored(over: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: 'a1',
    projectId: 'p1',
    type: 'image',
    filename: 'hero.png',
    mimeType: 'image/png',
    size: 8,
    blob: png(),
    uploadedAt: new Date('2024-01-01'),
    metadata: {},
    ...over,
  } as StoredAsset;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('assetToStored', () => {
  it('maps the UI type through to the storage type', async () => {
    const res = await assetToStored(uiAsset({ type: 'font' }), 'p1', new Blob(['x'], { type: 'font/ttf' }));
    expect(res.type).toBe('font');
    expect(res.projectId).toBe('p1');
  });

  it('appends an extension derived from the blob mime type when the name has none', async () => {
    const res = await assetToStored(uiAsset({ name: 'hero' }), 'p1', png());
    expect(res.filename).toBe('hero.png');
  });

  it('leaves the filename untouched when the name already has an extension', async () => {
    const res = await assetToStored(uiAsset({ name: 'hero.jpeg' }), 'p1', png());
    expect(res.filename).toBe('hero.jpeg');
  });

  it('uses blob.type for mimeType, falling back to a name-based guess when blank', async () => {
    const fromBlob = await assetToStored(uiAsset(), 'p1', png());
    expect(fromBlob.mimeType).toBe('image/png');

    const blank = await assetToStored(uiAsset({ name: 'tune.mp3' }), 'p1', new Blob(['x'], { type: '' }));
    expect(blank.mimeType).toBe('audio/mpeg'); // guessed from .mp3
  });

  it('records the blob size and copies uploadedAt', async () => {
    const res = await assetToStored(uiAsset(), 'p1', png(42));
    expect(res.size).toBe(42);
    expect(res.uploadedAt).toEqual(new Date('2024-01-01'));
  });

  it('folds subType / dimensions / duration / variants into metadata', async () => {
    // type 'video' (not 'image') so this avoids the thumbnail path while
    // still carrying dimensions/duration — the point here is metadata folding.
    const variants = [{ assetId: 'b1', orientation: 'portrait' } as any];
    const res = await assetToStored(
      uiAsset({ type: 'video', subType: 'background', dimensions: { width: 4, height: 4 }, duration: 3, variants }),
      'p1',
      new Blob(['x'], { type: 'video/mp4' }),
    );
    expect(res.metadata).toMatchObject({
      subType: 'background',
      dimensions: { width: 4, height: 4 },
      duration: 3,
      variants,
    });
  });

  it('omits the variants key from metadata when the asset has none', async () => {
    const res = await assetToStored(uiAsset(), 'p1', png());
    expect(res.metadata && 'variants' in res.metadata).toBe(false);
  });

  it('does NOT attempt a thumbnail for an image without dimensions (no hang, no thumbnail)', async () => {
    const res = await assetToStored(uiAsset({ type: 'image' }), 'p1', png());
    expect(res.thumbnail).toBeUndefined();
  });

  it('swallows thumbnail-generation failure for an image with dimensions', async () => {
    // Stub Image so .src setter triggers onerror → generateThumbnail
    // rejects → assetToStored catches and continues without a thumbnail.
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        this.onerror?.();
      }
    }
    vi.stubGlobal('Image', FakeImage as any);

    const res = await assetToStored(
      uiAsset({ type: 'image', dimensions: { width: 10, height: 10 } }),
      'p1',
      png(),
    );
    expect(res.thumbnail).toBeUndefined();
  });
});

describe('storedToAsset', () => {
  it('creates a blob URL and maps the storage type back to a UI type', () => {
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:made');
    const asset = storedToAsset(stored({ type: 'video', filename: 'clip.mp4' }));
    expect(spy).toHaveBeenCalledOnce();
    expect(asset.url).toBe('blob:made');
    expect(asset.type).toBe('video');
    expect(asset.name).toBe('clip.mp4');
  });

  it("maps the storage-only 'other' type to the UI 'image' default", () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    expect(storedToAsset(stored({ type: 'other' as any })).type).toBe('image');
  });

  it('lifts subType / dimensions / duration out of metadata', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const asset = storedToAsset(
      stored({ metadata: { subType: 'prop', dimensions: { width: 2, height: 2 }, duration: 5 } }),
    );
    expect(asset.subType).toBe('prop');
    expect(asset.dimensions).toEqual({ width: 2, height: 2 });
    expect(asset.duration).toBe(5);
  });

  it('lifts a non-empty variants array to the top level', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const variants = [{ assetId: 'b1' } as any];
    const asset = storedToAsset(stored({ metadata: { variants } }));
    expect(asset.variants).toEqual(variants);
  });

  it('omits variants when the stored array is empty', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const asset = storedToAsset(stored({ metadata: { variants: [] } }));
    expect('variants' in asset).toBe(false);
  });

  it('omits variants when metadata has none', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const asset = storedToAsset(stored({ metadata: {} }));
    expect('variants' in asset).toBe(false);
  });
});

describe('extractBlobFromAsset', () => {
  it('returns the File directly when present (no fetch)', async () => {
    const file = new File(['data'], 'hero.png', { type: 'image/png' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const blob = await extractBlobFromAsset(uiAsset({ file }));
    expect(blob).toBe(file);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches the blob URL when there is no File', async () => {
    const out = png();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(out) }));
    const blob = await extractBlobFromAsset(uiAsset({ url: 'blob:hero' }));
    expect(blob).toBe(out);
  });

  it('throws a descriptive error when the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Gone' }));
    await expect(extractBlobFromAsset(uiAsset({ name: 'ghost' }))).rejects.toThrow(/Could not extract blob.*ghost/);
  });

  it('throws when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(extractBlobFromAsset(uiAsset({ name: 'ghost' }))).rejects.toThrow(/Could not extract blob.*ghost/);
  });
});

describe('batch helpers', () => {
  it('assetsToStored converts every asset (using File blobs)', async () => {
    const a1 = uiAsset({ id: 'a1', name: 'one', file: new File(['1'], 'one.png', { type: 'image/png' }) });
    const a2 = uiAsset({ id: 'a2', name: 'two', file: new File(['2'], 'two.png', { type: 'image/png' }) });
    const res = await assetsToStored([a1, a2], 'pX');
    expect(res.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(res.every((r) => r.projectId === 'pX')).toBe(true);
  });

  it('storedToAssets converts every stored asset', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const res = storedToAssets([stored({ id: 'a1' }), stored({ id: 'a2' })]);
    expect(res.map((r) => r.id)).toEqual(['a1', 'a2']);
  });
});

describe('blob URL revocation', () => {
  it('revokeBlobUrl revokes only blob: URLs', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeBlobUrl('blob:abc');
    revokeBlobUrl('https://example.com/x.png');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('blob:abc');
  });

  it('revokeBlobUrl swallows errors from revokeObjectURL', () => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => revokeBlobUrl('blob:abc')).not.toThrow();
  });

  it('revokeBlobUrls revokes each blob: URL and skips the rest', () => {
    const spy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeBlobUrls([
      uiAsset({ url: 'blob:1' }),
      uiAsset({ url: 'http://x/y.png' }),
      uiAsset({ url: 'blob:2' }),
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
