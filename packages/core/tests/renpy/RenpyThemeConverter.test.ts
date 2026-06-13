/**
 * Tests for RenpyThemeConverter — converts Ren'Py asset bundles
 * + gui.rpy data into ASAPS ThemeDefinitions. We focus on the
 * small pure helpers (estimateRenpyThemeSize, convertRenpyGuiToThemePreview)
 * and basic integration of convertRenpyToTheme with a minimal bundle.
 *
 * Coverage focus:
 *   - estimateRenpyThemeSize: counts fonts + graphics, computes
 *     rough storage estimate, flags hasTextbox + hasCustomFonts
 *   - convertRenpyToTheme: produces a valid ThemeDefinition shape
 *     from a minimal bundle; falls back gracefully on missing
 *     colors / fonts
 *   - convertRenpyGuiToThemePreview: returns a no-asset-references
 *     theme suitable for previewing without bundle files
 */
import { describe, it, expect } from 'vitest';
import {
  convertRenpyToTheme,
  convertRenpyGuiToThemePreview,
  estimateRenpyThemeSize,
} from '../../src/renpy/RenpyThemeConverter';
import type { RenpyAssetBundle } from '../../src/renpy/RenpyAssetExtractor';
import type { RenpyGuiData } from '../../src/renpy/RenpyGuiParser';

/** Minimal empty GUI data (only the required fields). */
function emptyGui(): RenpyGuiData {
  return {
    colors: {},
    fonts: {},
    title: {},
    textbox: {},
    namebox: {},
    button: {},
    choice: {},
    raw: {},
  } as any;
}

/** Minimal bundle for happy-path tests. */
function emptyBundle(): RenpyAssetBundle {
  return {
    fonts: [],
    uiGraphics: [],
    guiData: emptyGui(),
    metadata: {
      resolution: { width: 1920, height: 1080 },
    },
    structureType: 'flat',
  };
}

describe('estimateRenpyThemeSize', () => {
  it('zero counts for an empty bundle', () => {
    const result = estimateRenpyThemeSize(emptyBundle());
    expect(result.fontCount).toBe(0);
    expect(result.graphicCount).toBe(0);
    expect(result.estimatedStorageKB).toBe(0);
    expect(result.hasTextbox).toBe(false);
    expect(result.hasCustomFonts).toBe(false);
  });

  it('counts fonts', () => {
    const bundle = emptyBundle();
    (bundle.fonts as any) = [
      { filename: 'a.ttf', role: 'dialog-font', data: new Blob() },
      { filename: 'b.ttf', role: 'title-font', data: new Blob() },
    ];
    const result = estimateRenpyThemeSize(bundle);
    expect(result.fontCount).toBe(2);
    expect(result.hasCustomFonts).toBe(true);
  });

  it('counts graphics', () => {
    const bundle = emptyBundle();
    (bundle.uiGraphics as any) = [
      { filename: 'tb.png', role: 'textbox', data: new Blob() },
      { filename: 'btn.png', role: 'button', data: new Blob() },
    ];
    const result = estimateRenpyThemeSize(bundle);
    expect(result.graphicCount).toBe(2);
    expect(result.hasTextbox).toBe(true);
  });

  it('hasTextbox is false when no graphic has role:"textbox"', () => {
    const bundle = emptyBundle();
    (bundle.uiGraphics as any) = [
      { filename: 'btn.png', role: 'button', data: new Blob() },
    ];
    expect(estimateRenpyThemeSize(bundle).hasTextbox).toBe(false);
  });

  it('storage estimate scales linearly: fonts ~200KB, graphics ~50KB', () => {
    const bundle = emptyBundle();
    (bundle.fonts as any) = [
      { filename: 'a.ttf', role: 'dialog-font', data: new Blob() },
    ];
    (bundle.uiGraphics as any) = [
      { filename: 'tb.png', role: 'textbox', data: new Blob() },
      { filename: 'btn.png', role: 'button', data: new Blob() },
    ];
    // 1 * 200 + 2 * 50 = 300.
    expect(estimateRenpyThemeSize(bundle).estimatedStorageKB).toBe(300);
  });

  it('scales correctly for typical visual-novel bundle (3 fonts + 8 graphics)', () => {
    // Realistic counts for a Ren'Py game theme: a few fonts +
    // textbox + buttons + namebox + menu graphics.
    const bundle = emptyBundle();
    (bundle.fonts as any) = Array.from({ length: 3 }, (_, i) => ({
      filename: `f${i}.ttf`, role: 'dialog-font', data: new Blob(),
    }));
    (bundle.uiGraphics as any) = Array.from({ length: 8 }, (_, i) => ({
      filename: `g${i}.png`, role: 'button', data: new Blob(),
    }));
    // 3*200 + 8*50 = 1000 KB.
    expect(estimateRenpyThemeSize(bundle).estimatedStorageKB).toBe(1000);
  });
});

describe('convertRenpyToTheme', () => {
  it('produces a valid ThemeDefinition from an empty bundle', () => {
    const result = convertRenpyToTheme(emptyBundle(), {
      themeName: 'My VN Theme',
    });
    // Sanity — every required slot present.
    expect(result.theme.meta).toBeDefined();
    expect(result.theme.meta.name).toBe('My VN Theme');
    expect(result.theme.colors).toBeDefined();
    expect(result.theme.fonts).toBeDefined();
    expect(result.theme.fonts.title.family).toBeTruthy();
    expect(result.theme.fonts.body.family).toBeTruthy();
  });

  it('returns empty asset arrays when bundle has no fonts/graphics', () => {
    const result = convertRenpyToTheme(emptyBundle(), { themeName: 'X' });
    expect(result.fontAssets).toEqual([]);
    expect(result.graphicAssets).toEqual([]);
  });

  it('uses the configured themeName for meta.name', () => {
    const result = convertRenpyToTheme(emptyBundle(), {
      themeName: 'Custom Name 123',
    });
    expect(result.theme.meta.name).toBe('Custom Name 123');
  });

  it('uses author when provided', () => {
    const result = convertRenpyToTheme(emptyBundle(), {
      themeName: 'X',
      author: 'Alice',
    });
    expect(result.theme.meta.author).toBe('Alice');
  });

  it('falls back to sensible defaults when gui has no colors', () => {
    // The converter is best-effort; a Ren'Py project with sparse
    // gui.rpy should still produce a usable theme (the editor can
    // refine afterward).
    const result = convertRenpyToTheme(emptyBundle(), { themeName: 'X' });
    // primary text color shouldn't be empty / undefined.
    expect(result.theme.colors.primary.hex.length).toBeGreaterThan(0);
    expect(result.theme.colors.background.hex.length).toBeGreaterThan(0);
  });

  it('honors gui-provided text color', () => {
    const bundle = emptyBundle();
    bundle.guiData.colors.text = '#abcdef';
    const result = convertRenpyToTheme(bundle, { themeName: 'X' });
    expect(result.theme.colors.primary.hex).toBe('#abcdef');
  });

  it('honors gui-provided accent color', () => {
    const bundle = emptyBundle();
    bundle.guiData.colors.accent = '#ff0080';
    const result = convertRenpyToTheme(bundle, { themeName: 'X' });
    expect(result.theme.colors.accent.hex).toBe('#ff0080');
  });
});

describe('convertRenpyGuiToThemePreview', () => {
  it('produces a theme suitable for preview (no asset references)', () => {
    // The preview converter is used when the author is browsing
    // through a Ren'Py project's gui.rpy without actually
    // importing the assets. The returned theme must not
    // reference asset ids that don't exist.
    const theme = convertRenpyGuiToThemePreview(emptyGui(), 'Preview');
    expect(theme.assets).toBeUndefined();
    expect(theme.textBox.frameAssetId).toBeUndefined();
  });

  it('uses the supplied theme name', () => {
    const theme = convertRenpyGuiToThemePreview(emptyGui(), 'My Preview');
    expect(theme.meta.name).toBe('My Preview');
  });

  it('produces the same color palette as the full converter for the same gui input', () => {
    // Preview should be consistent with what the full import
    // would produce (minus the asset refs). Pin so a future
    // refactor doesn't make preview lie.
    const guiData = emptyGui();
    guiData.colors.accent = '#cc6600';
    const preview = convertRenpyGuiToThemePreview(guiData, 'X');
    const bundle = emptyBundle();
    bundle.guiData = guiData;
    const full = convertRenpyToTheme(bundle, { themeName: 'X' });
    expect(preview.colors.accent.hex).toBe(full.theme.colors.accent.hex);
  });
});
