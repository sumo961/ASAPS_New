import { describe, it, expect, vi, afterEach } from 'vitest';
import { fontFamilyFromAssetFilename, registerFontAsset } from '../src/utils/customFonts';

describe('custom fonts in exported stories', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers the family name the builder offered', () => {
    expect(fontFamilyFromAssetFilename('fonts/asset_17_ab_Windows Regular.ttf', 'asset_17_ab')).toBe('Windows Regular');
    expect(fontFamilyFromAssetFilename('Plain.otf', '')).toBe('Plain');
  });

  it('registers the font file with the document under that name', async () => {
    const added: any[] = [];
    class FakeFontFace {
      constructor(public family: string, public source: ArrayBuffer) {}
      load() { return Promise.resolve(this); }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('document', { fonts: { add: (f: any) => added.push(f) } });

    const ok = await registerFontAsset('Windows Regular', new Blob([new Uint8Array([0, 1, 0, 0])]));
    expect(ok).toBe(true);
    expect(added[0].family).toBe('Windows Regular');
  });
});
