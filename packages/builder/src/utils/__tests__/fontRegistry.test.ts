/**
 * Tests for fontRegistry — manages built-in + custom + theme + Noto
 * fonts. Touches the DOM (creates a <style> element and appends
 * @font-face rules); tested under jsdom.
 *
 * Coverage focus:
 *   - BUILTIN_FONTS shape (every entry has the required fields)
 *   - fontAssetsToDefinitions filters non-font assets + strips
 *     extensions from displayName
 *   - getAllFonts unions built-ins + customs; auto-loads
 *     unloaded customs
 *   - getFontFamily resolution precedence (builtin > custom >
 *     pass-through)
 *   - loadCustomFont format detection from URL extension
 *   - loadCustomFont dedup (won't double-add @font-face for the
 *     same font id)
 *   - loadCustomFont skips non-custom and url-less fonts
 *   - loadThemeFont uses URL.createObjectURL + format detection
 *     from filename
 *   - loadNotoFonts dedup + URL construction (Google Fonts CDN
 *     with encoded family names)
 *   - clearCustomFonts wipes the style element AND the loaded set
 *   - isThemeFontLoaded / isNotoFontLoaded / getLoadedNotoFonts
 *     accessors
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BUILTIN_FONTS,
  loadCustomFont,
  fontAssetsToDefinitions,
  getAllFonts,
  getFontFamily,
  preloadFonts,
  clearCustomFonts,
  loadThemeFont,
  isThemeFontLoaded,
  loadNotoFonts,
  isNotoFontLoaded,
  getLoadedNotoFonts,
} from '../fontRegistry';

beforeEach(() => {
  // Clear the loaded-fonts set + reset style content. We do NOT
  // remove the style elements themselves: fontRegistry caches the
  // <style> reference at module scope, and removing the DOM node
  // leaves the cache stale (subsequent appends silently target a
  // detached element).
  clearCustomFonts();
  const noto = document.getElementById('asaps-noto-fonts');
  if (noto) noto.textContent = '';
  // Silence the load-confirmation logs.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('BUILTIN_FONTS', () => {
  it('has every entry tagged type:"builtin"', () => {
    expect(BUILTIN_FONTS.every(f => f.type === 'builtin')).toBe(true);
  });

  it('every entry has required fields (id / displayName / fontFamily)', () => {
    for (const f of BUILTIN_FONTS) {
      expect(f.id).toBeTruthy();
      expect(f.displayName).toBeTruthy();
      expect(f.fontFamily).toBeTruthy();
      // CSS font-family values must include at least one comma to
      // be safe across font-loading failures.
      expect(f.fontFamily).toContain(',');
    }
  });

  it('every id is unique', () => {
    // Duplicate ids would silently shadow each other in the UI
    // font picker.
    const ids = BUILTIN_FONTS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('fontAssetsToDefinitions', () => {
  it('filters out non-font assets', () => {
    const assets = [
      { id: 'i1', type: 'image', name: 'cover.png', url: '/cover.png' },
      { id: 'f1', type: 'font', name: 'Custom.ttf', url: '/Custom.ttf' },
      { id: 'a1', type: 'audio', name: 'theme.mp3', url: '/theme.mp3' },
    ] as any;
    const result = fontAssetsToDefinitions(assets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom-f1');
  });

  it('strips the file extension from displayName', () => {
    // displayName drives the UI label AND the CSS font-family
    // value. ".ttf" suffix would leak into the picker as a typo.
    const assets = [
      { id: 'f1', type: 'font', name: 'Inter-Regular.ttf', url: '/x.ttf' },
      { id: 'f2', type: 'font', name: 'CustomDisplay.woff2', url: '/y.woff2' },
    ] as any;
    const result = fontAssetsToDefinitions(assets);
    expect(result[0].displayName).toBe('Inter-Regular');
    expect(result[1].displayName).toBe('CustomDisplay');
  });

  it('prefixes the id with custom-', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'x.ttf', url: '/x.ttf' },
    ] as any;
    expect(fontAssetsToDefinitions(assets)[0].id).toBe('custom-f1');
  });

  it('wraps displayName with single quotes for the CSS font-family value', () => {
    // Custom font names commonly contain hyphens or numbers;
    // wrapping in quotes is the safe CSS form.
    const assets = [
      { id: 'f1', type: 'font', name: 'My Display Font.ttf', url: '/x.ttf' },
    ] as any;
    const result = fontAssetsToDefinitions(assets);
    expect(result[0].fontFamily).toBe("'My Display Font', sans-serif");
  });
});

describe('loadCustomFont', () => {
  it('appends a @font-face rule with the correct format for .ttf', () => {
    loadCustomFont({
      id: 'c1', displayName: 'Custom', fontFamily: "'Custom'",
      type: 'custom', url: '/fonts/custom.ttf',
    });
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain("font-family: 'Custom'");
    expect(styleEl.textContent).toContain("format('truetype')");
  });

  it('detects woff2 format from URL', () => {
    loadCustomFont({
      id: 'c2', displayName: 'X', fontFamily: "'X'", type: 'custom',
      url: '/fonts/x.woff2',
    });
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain("format('woff2')");
  });

  it('detects woff format', () => {
    loadCustomFont({
      id: 'c3', displayName: 'X', fontFamily: "'X'", type: 'custom',
      url: '/fonts/x.woff',
    });
    expect(document.getElementById('asaps-custom-fonts')!.textContent)
      .toContain("format('woff')");
  });

  it('detects opentype format from .otf', () => {
    loadCustomFont({
      id: 'c4', displayName: 'X', fontFamily: "'X'", type: 'custom',
      url: '/fonts/x.otf',
    });
    expect(document.getElementById('asaps-custom-fonts')!.textContent)
      .toContain("format('opentype')");
  });

  it('dedups by font id — second call is a no-op', () => {
    const font = {
      id: 'dedup', displayName: 'X', fontFamily: "'X'",
      type: 'custom' as const, url: '/x.ttf',
    };
    loadCustomFont(font);
    loadCustomFont(font);
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    // Two appends would double the @font-face occurrences.
    const matches = styleEl.textContent!.match(/@font-face/g) || [];
    expect(matches.length).toBe(1);
  });

  it('skips non-custom fonts', () => {
    const styleEl = document.getElementById('asaps-custom-fonts');
    const before = styleEl?.textContent || '';
    loadCustomFont({
      id: 'b1', displayName: 'Arial', fontFamily: 'Arial', type: 'builtin',
    });
    const after = styleEl?.textContent || '';
    // Built-in input does not add any @font-face. The style
    // element may already exist from prior tests; what matters
    // is that we didn't append.
    expect(after).toBe(before);
  });

  it('skips custom fonts that have no URL', () => {
    const styleEl = document.getElementById('asaps-custom-fonts');
    const before = styleEl?.textContent || '';
    loadCustomFont({
      id: 'no-url', displayName: 'X', fontFamily: "'X'", type: 'custom',
      // no url
    });
    const after = styleEl?.textContent || '';
    expect(after).toBe(before);
  });
});

describe('getAllFonts', () => {
  it('returns built-ins first, customs second', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'Inter.ttf', url: '/Inter.ttf' },
    ] as any;
    const result = getAllFonts(assets);
    expect(result.length).toBe(BUILTIN_FONTS.length + 1);
    expect(result[0].type).toBe('builtin');
    expect(result[result.length - 1].id).toBe('custom-f1');
  });

  it('auto-loads custom fonts that have not been loaded', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'Inter.ttf', url: '/Inter.ttf' },
    ] as any;
    getAllFonts(assets);
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain('Inter');
  });

  it('does not re-load custom fonts on subsequent calls', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'Inter.ttf', url: '/Inter.ttf' },
    ] as any;
    getAllFonts(assets);
    getAllFonts(assets);
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    const matches = styleEl.textContent!.match(/@font-face/g) || [];
    expect(matches.length).toBe(1);
  });
});

describe('getFontFamily', () => {
  it('resolves a built-in font by displayName', () => {
    expect(getFontFamily('Arial')).toBe('Arial, sans-serif');
    expect(getFontFamily('Georgia')).toBe('Georgia, serif');
  });

  it('resolves a custom font by displayName (after assets are scanned)', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'Inter.ttf', url: '/Inter.ttf' },
    ] as any;
    const family = getFontFamily('Inter', assets);
    expect(family).toBe("'Inter', sans-serif");
  });

  it('falls back to the input value when neither built-in nor custom matches', () => {
    // The pass-through path lets the caller use full CSS stacks
    // ("Helvetica Neue, Arial, sans-serif") or single-word
    // already-CSS-safe names without round-tripping through the
    // registry.
    expect(getFontFamily('SomeUnknownName')).toBe('SomeUnknownName');
  });

  it('built-in match wins over custom with the same displayName', () => {
    // If the author uploads a custom font called "Arial", the
    // built-in mapping still wins (a custom Arial shouldn't
    // silently override the system default).
    const assets = [
      { id: 'f1', type: 'font', name: 'Arial.ttf', url: '/Arial.ttf' },
    ] as any;
    expect(getFontFamily('Arial', assets)).toBe('Arial, sans-serif');
  });
});

describe('preloadFonts', () => {
  it('loads every custom font in the assets list', () => {
    const assets = [
      { id: 'f1', type: 'font', name: 'A.ttf', url: '/A.ttf' },
      { id: 'f2', type: 'font', name: 'B.woff', url: '/B.woff' },
    ] as any;
    preloadFonts(assets);
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain('A');
    expect(styleEl.textContent).toContain('B');
  });

  it('skips non-font assets without crashing', () => {
    const assets = [
      { id: 'i1', type: 'image', name: 'cover.png', url: '/cover.png' },
    ] as any;
    expect(() => preloadFonts(assets)).not.toThrow();
  });
});

describe('clearCustomFonts', () => {
  it('empties the style element textContent', () => {
    loadCustomFont({
      id: 'c1', displayName: 'X', fontFamily: "'X'", type: 'custom',
      url: '/x.ttf',
    });
    clearCustomFonts();
    const styleEl = document.getElementById('asaps-custom-fonts');
    expect(styleEl?.textContent).toBe('');
  });

  it('resets the loaded set so the next load actually re-applies', () => {
    // After clear, a font with the same id can be loaded again
    // — otherwise the dedup set would silently prevent re-mount.
    const font = {
      id: 'c1', displayName: 'X', fontFamily: "'X'",
      type: 'custom' as const, url: '/x.ttf',
    };
    loadCustomFont(font);
    clearCustomFonts();
    loadCustomFont(font);
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain('@font-face');
  });
});

describe('loadThemeFont', () => {
  beforeEach(() => {
    // Stub URL.createObjectURL — jsdom doesn't implement it by
    // default, and we just need to verify the @font-face URL
    // is constructed from whatever it returns.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:fake-url'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an object URL and a @font-face rule', () => {
    const blob = new Blob(['fake font data']);
    loadThemeFont('MyThemeFont', blob, 'mytheme.woff2');
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    expect(styleEl.textContent).toContain("font-family: 'MyThemeFont'");
    expect(styleEl.textContent).toContain("blob:fake-url");
    expect(styleEl.textContent).toContain("format('woff2')");
  });

  it('detects woff format from filename', () => {
    loadThemeFont('F', new Blob([]), 'font.woff');
    expect(document.getElementById('asaps-custom-fonts')!.textContent)
      .toContain("format('woff')");
  });

  it('detects opentype format from .otf', () => {
    loadThemeFont('F', new Blob([]), 'font.otf');
    expect(document.getElementById('asaps-custom-fonts')!.textContent)
      .toContain("format('opentype')");
  });

  it('defaults to truetype when no recognized extension', () => {
    loadThemeFont('F', new Blob([]), 'font.bin');
    expect(document.getElementById('asaps-custom-fonts')!.textContent)
      .toContain("format('truetype')");
  });

  it('dedups by font-family — second call is a no-op', () => {
    loadThemeFont('SameFamily', new Blob([]), 'a.ttf');
    loadThemeFont('SameFamily', new Blob([]), 'b.woff2');
    const styleEl = document.getElementById('asaps-custom-fonts')!;
    const matches = styleEl.textContent!.match(/@font-face/g) || [];
    expect(matches.length).toBe(1);
  });

  it('isThemeFontLoaded returns true after load', () => {
    loadThemeFont('FamCheck', new Blob([]), 'x.ttf');
    expect(isThemeFontLoaded('FamCheck')).toBe(true);
  });

  it('isThemeFontLoaded returns false for never-loaded family', () => {
    expect(isThemeFontLoaded('NeverLoaded')).toBe(false);
  });
});

describe('loadNotoFonts', () => {
  // No per-describe beforeEach that removes #asaps-noto-fonts — the
  // module caches the style element reference, so removing it
  // leaves the cache stale. Each test uses a UNIQUE font name to
  // sidestep the also-cached loadedNotoFonts dedup set.

  it('appends @import url(...) to the Noto style element', () => {
    loadNotoFonts(['Noto Sans Arabic']);
    const styleEl = document.getElementById('asaps-noto-fonts');
    expect(styleEl?.textContent).toContain('@import url(');
    expect(styleEl?.textContent).toContain('Noto%20Sans%20Arabic');
  });

  it('uses Google Fonts CDN URL with weight 400;700', () => {
    loadNotoFonts(['Noto Sans Georgian']);
    const styleEl = document.getElementById('asaps-noto-fonts');
    // The wght@400;700 is the dual-weight import that covers
    // normal + bold for the script. Pin to flag accidental
    // weight-set changes.
    expect(styleEl?.textContent).toContain('fonts.googleapis.com');
    expect(styleEl?.textContent).toContain('wght@400;700');
  });

  it('isNotoFontLoaded returns true after loadNotoFonts', () => {
    loadNotoFonts(['Noto Sans Tamil']);
    expect(isNotoFontLoaded('Noto Sans Tamil')).toBe(true);
  });

  it('dedups across calls — second call with same name is a no-op', () => {
    loadNotoFonts(['Noto Sans Hebrew']);
    const before = document.getElementById('asaps-noto-fonts')?.textContent;
    loadNotoFonts(['Noto Sans Hebrew']);
    const after = document.getElementById('asaps-noto-fonts')?.textContent;
    expect(after).toBe(before);
  });

  it('getLoadedNotoFonts returns the loaded names', () => {
    loadNotoFonts(['Noto Sans Devanagari']);
    expect(getLoadedNotoFonts()).toContain('Noto Sans Devanagari');
  });

  it('early-returns when all requested fonts are already loaded', () => {
    loadNotoFonts(['Noto Sans Thai']);
    const beforeText = document.getElementById('asaps-noto-fonts')?.textContent;
    loadNotoFonts(['Noto Sans Thai']);  // all already loaded
    const afterText = document.getElementById('asaps-noto-fonts')?.textContent;
    expect(afterText).toBe(beforeText);
  });
});

