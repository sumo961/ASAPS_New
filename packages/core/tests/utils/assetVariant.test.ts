/**
 * Tests for assetVariant — iOS-style asset variant resolution.
 *
 * Authors attach orientation- and device-class-specific files as
 * variants of a base asset; the runtime picks the best match for
 * the current viewport. The resolution rule mirrors iOS asset
 * catalogs: most specific match wins, ties go to first declared,
 * no match falls back to the base.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveAssetVariant,
  detectDeviceClass,
  detectOrientation,
  type AssetVariant,
  type AssetVariantContext,
} from '../../src/utils/assetVariant';

const phonePortrait: AssetVariantContext = { orientation: 'portrait', deviceClass: 'phone' };
const phoneLandscape: AssetVariantContext = { orientation: 'landscape', deviceClass: 'phone' };
const tabletPortrait: AssetVariantContext = { orientation: 'portrait', deviceClass: 'tablet' };
const desktopLandscape: AssetVariantContext = { orientation: 'landscape', deviceClass: 'desktop' };

describe('resolveAssetVariant', () => {
  describe('no candidates', () => {
    it('returns null for undefined variants', () => {
      expect(resolveAssetVariant(undefined, phonePortrait)).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(resolveAssetVariant([], phonePortrait)).toBeNull();
    });

    it('returns null when all variants disqualify', () => {
      const variants: AssetVariant[] = [
        { assetId: 'a', orientation: 'landscape' }, // wrong orientation
        { assetId: 'b', deviceClass: 'desktop' },   // wrong device class
      ];
      expect(resolveAssetVariant(variants, phonePortrait)).toBeNull();
    });
  });

  describe('most-specific wins', () => {
    it('picks the 2-axis match over the 1-axis match', () => {
      const exact: AssetVariant = { assetId: 'exact', orientation: 'portrait', deviceClass: 'phone' };
      const orientOnly: AssetVariant = { assetId: 'orient', orientation: 'portrait' };
      const deviceOnly: AssetVariant = { assetId: 'device', deviceClass: 'phone' };
      // Order shouldn't matter — specific wins regardless.
      expect(resolveAssetVariant([orientOnly, exact, deviceOnly], phonePortrait)).toBe(exact);
      expect(resolveAssetVariant([deviceOnly, orientOnly, exact], phonePortrait)).toBe(exact);
    });

    it('picks a 1-axis match over a no-axis (catch-all) variant', () => {
      const catchAll: AssetVariant = { assetId: 'any' };
      const orientOnly: AssetVariant = { assetId: 'orient', orientation: 'portrait' };
      expect(resolveAssetVariant([catchAll, orientOnly], phonePortrait)).toBe(orientOnly);
    });
  });

  describe('one-axis matches', () => {
    it('matches portrait-only variant in portrait context', () => {
      const v: AssetVariant = { assetId: 'p', orientation: 'portrait' };
      expect(resolveAssetVariant([v], phonePortrait)).toBe(v);
    });

    it('does not match portrait-only variant in landscape context', () => {
      const v: AssetVariant = { assetId: 'p', orientation: 'portrait' };
      expect(resolveAssetVariant([v], phoneLandscape)).toBeNull();
    });

    it('matches phone-only variant on phone, any orientation', () => {
      const v: AssetVariant = { assetId: 'phone', deviceClass: 'phone' };
      expect(resolveAssetVariant([v], phonePortrait)).toBe(v);
      expect(resolveAssetVariant([v], phoneLandscape)).toBe(v);
    });

    it('does not match phone-only variant on tablet', () => {
      const v: AssetVariant = { assetId: 'phone', deviceClass: 'phone' };
      expect(resolveAssetVariant([v], tabletPortrait)).toBeNull();
    });
  });

  describe('ties — first declared wins', () => {
    it('two equally-specific candidates — first wins', () => {
      // Both are 1-axis matches (orientation: portrait). The order in
      // the array decides — stable across re-renders.
      const first: AssetVariant = { assetId: 'first', orientation: 'portrait' };
      const second: AssetVariant = { assetId: 'second', orientation: 'portrait' };
      expect(resolveAssetVariant([first, second], phonePortrait)).toBe(first);
      expect(resolveAssetVariant([second, first], phonePortrait)).toBe(second);
    });
  });

  describe('defensive shape', () => {
    it('skips entries without an assetId', () => {
      const ok: AssetVariant = { assetId: 'ok', orientation: 'portrait' };
      const bad = { orientation: 'portrait' } as any;
      const variants: AssetVariant[] = [bad, ok];
      expect(resolveAssetVariant(variants, phonePortrait)).toBe(ok);
    });

    it('skips null entries in the array', () => {
      const variants: any[] = [null, undefined, { assetId: 'ok' }];
      expect(resolveAssetVariant(variants, phonePortrait)).toEqual({ assetId: 'ok' });
    });

    it('handles non-array input gracefully', () => {
      expect(resolveAssetVariant('nope' as any, phonePortrait)).toBeNull();
      expect(resolveAssetVariant({} as any, phonePortrait)).toBeNull();
    });
  });
});

describe('detectDeviceClass', () => {
  it('returns phone for widths < 640', () => {
    expect(detectDeviceClass(0)).toBe('phone');
    expect(detectDeviceClass(320)).toBe('phone');
    expect(detectDeviceClass(390)).toBe('phone');   // iPhone 14
    expect(detectDeviceClass(639)).toBe('phone');
  });

  it('returns tablet for widths 640..1099', () => {
    expect(detectDeviceClass(640)).toBe('tablet');
    expect(detectDeviceClass(768)).toBe('tablet');  // iPad portrait
    expect(detectDeviceClass(1024)).toBe('tablet'); // iPad landscape
    expect(detectDeviceClass(1099)).toBe('tablet');
  });

  it('returns desktop for widths >= 1100', () => {
    expect(detectDeviceClass(1100)).toBe('desktop');
    expect(detectDeviceClass(1440)).toBe('desktop'); // MBP 14"
    expect(detectDeviceClass(1920)).toBe('desktop'); // 1080p
    expect(detectDeviceClass(3840)).toBe('desktop'); // 4K
  });

  it('matches the VE preview viewport presets at boundaries', () => {
    // The doc comment cites Phone 390, Tablet 768, Desktop 1440 as
    // the editor preview presets. Each preset must map to its named
    // device class.
    expect(detectDeviceClass(390)).toBe('phone');
    expect(detectDeviceClass(768)).toBe('tablet');
    expect(detectDeviceClass(1440)).toBe('desktop');
  });
});

describe('detectOrientation', () => {
  it('returns portrait when height > width', () => {
    expect(detectOrientation(390, 844)).toBe('portrait');  // iPhone portrait
    expect(detectOrientation(100, 200)).toBe('portrait');
  });

  it('returns landscape when width >= height', () => {
    expect(detectOrientation(1920, 1080)).toBe('landscape'); // 16:9
    expect(detectOrientation(844, 390)).toBe('landscape');   // iPhone rotated
  });

  it('returns landscape for square (width === height)', () => {
    // Tie goes to landscape — explicit in the source (height > width).
    expect(detectOrientation(500, 500)).toBe('landscape');
  });
});
