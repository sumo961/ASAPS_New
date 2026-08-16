/**
 * Tests for the built-in theme presets. These three themes
 * (Visual Novel, Twine, Point-and-Click) are the user's starting
 * library — Wrong IDs / missing fields silently break the editor's
 * theme picker.
 *
 * Coverage focus:
 *   - BUILT_IN_THEMES registry has the three expected themes
 *   - Each theme has the required meta + colors + fonts fields
 *   - Each theme has a unique meta.id matching its catalog entry
 *   - Color hex values are well-formed (#xxxxxx)
 *   - Alpha values in [0, 1]
 *   - Font sizes positive
 *   - getBuiltInTheme: lookup by id; undefined for unknown
 *   - getBuiltInThemeIds: matches BUILT_IN_THEMES.length
 *   - isBuiltInTheme: true for built-ins, false for custom ids
 */
import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_THEMES,
  VISUAL_NOVEL_THEME,
  TWINE_THEME,
  POINT_AND_CLICK_THEME,
  getBuiltInTheme,
  getBuiltInThemeIds,
  isBuiltInTheme,
  EDITORIAL_THEME,
  CINEMATIC_THEME,
  PLAYFUL_THEME,
  HIGH_CONTRAST_THEME,
} from '../../src/themes/presets';

describe('BUILT_IN_THEMES registry', () => {
  it('has exactly seven themes (three classics + four 12b look presets)', () => {
    expect(BUILT_IN_THEMES).toHaveLength(7);
  });

  it('contains every named theme export', () => {
    // Pin that the catalog matches the named exports — easy
    // to forget to add a new theme to BUILT_IN_THEMES.
    expect(BUILT_IN_THEMES).toContain(VISUAL_NOVEL_THEME);
    expect(BUILT_IN_THEMES).toContain(TWINE_THEME);
    expect(BUILT_IN_THEMES).toContain(POINT_AND_CLICK_THEME);
    expect(BUILT_IN_THEMES).toContain(EDITORIAL_THEME);
    expect(BUILT_IN_THEMES).toContain(CINEMATIC_THEME);
    expect(BUILT_IN_THEMES).toContain(PLAYFUL_THEME);
    expect(BUILT_IN_THEMES).toContain(HIGH_CONTRAST_THEME);
  });

  it('the accessible preset commits to what it promises', () => {
    // High Contrast is BUILT to WCAG rather than taste: nothing translucent,
    // no motion, larger type. These are the properties an accessibility
    // reviewer would check; a well-meaning restyle must not soften them.
    const t = HIGH_CONTRAST_THEME;
    const alphas = [
      ...Object.values(t.colors).map((c: any) => c.alpha),
      t.textBox.background.alpha, t.button.background.alpha,
    ];
    expect(alphas.every(a => a === 1)).toBe(true);
    expect(t.effects.textAnimation).toBe('none');
    expect(t.effects.sceneTransition).toBe('none');
    expect(t.fonts.body.size).toBeGreaterThanOrEqual(22);
    expect(t.button.transitionDuration).toBe(0);
  });

  it('Editorial is the light theme the catalog was missing', () => {
    // Every pre-12b builtin was dark. A light ground is a real capability —
    // museum/documentary stories read wrong on charcoal.
    const bg = parseInt(EDITORIAL_THEME.colors.background.hex.slice(1), 16);
    expect(bg).toBeGreaterThan(0xeeeeee);
  });

  it('every theme has a unique meta.id', () => {
    // Duplicate ids would silently shadow each other in the
    // theme picker dropdown.
    const ids = BUILT_IN_THEMES.map(t => t.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every meta.id starts with "builtin-" namespace', () => {
    // The "builtin-" prefix is how isBuiltInTheme distinguishes
    // these from user-created themes. Pin so the namespace doesn't
    // drift.
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.meta.id).toMatch(/^builtin-/);
    }
  });
});

describe('theme shape (required fields)', () => {
  it.each([
    ['VISUAL_NOVEL_THEME', VISUAL_NOVEL_THEME],
    ['TWINE_THEME', TWINE_THEME],
    ['POINT_AND_CLICK_THEME', POINT_AND_CLICK_THEME],
  ])('%s has required meta fields', (_name, theme) => {
    expect(theme.meta.id.length).toBeGreaterThan(0);
    expect(theme.meta.name.length).toBeGreaterThan(0);
    expect(theme.meta.version.length).toBeGreaterThan(0);
    expect(theme.meta.description.length).toBeGreaterThan(0);
    expect(theme.meta.author.length).toBeGreaterThan(0);
  });

  it.each([
    ['VISUAL_NOVEL_THEME', VISUAL_NOVEL_THEME],
    ['TWINE_THEME', TWINE_THEME],
    ['POINT_AND_CLICK_THEME', POINT_AND_CLICK_THEME],
  ])('%s has required color slots', (_name, theme) => {
    // These slots are referenced by the renderer; missing any
    // would render with undefined → CSS errors.
    for (const slot of ['primary', 'secondary', 'accent', 'background', 'surface',
                        'buttonNormal', 'buttonHover', 'buttonText', 'border']) {
      expect((theme.colors as any)[slot], `${slot}`).toBeDefined();
    }
  });

  it.each([
    ['VISUAL_NOVEL_THEME', VISUAL_NOVEL_THEME],
    ['TWINE_THEME', TWINE_THEME],
    ['POINT_AND_CLICK_THEME', POINT_AND_CLICK_THEME],
  ])('%s has the four required font slots', (_name, theme) => {
    // Per ThemeFonts type: title, body, button, dialog are required.
    // The optional `scale` multiplier isn't part of the per-slot
    // contract.
    for (const slot of ['title', 'body', 'button', 'dialog']) {
      const font = (theme.fonts as any)[slot];
      expect(font, slot).toBeDefined();
      expect(typeof font.family).toBe('string');
      expect(font.size).toBeGreaterThan(0);
    }
  });
});

describe('color validity', () => {
  for (const [name, theme] of [
    ['VISUAL_NOVEL_THEME', VISUAL_NOVEL_THEME],
    ['TWINE_THEME', TWINE_THEME],
    ['POINT_AND_CLICK_THEME', POINT_AND_CLICK_THEME],
  ] as const) {
    it(`${name}: every hex is a valid #rrggbb or CSS named color`, () => {
      // CSS won't parse malformed hex; pin so a typo is caught at
      // test time, not at render time. We allow CSS named colors
      // ("transparent") since the type doesn't forbid them and
      // TWINE_THEME uses 'transparent' for buttonNormal.
      const HEX_OR_NAMED = /^(#[0-9a-f]{3}([0-9a-f]{3})?|transparent|currentcolor)$/i;
      for (const [slot, color] of Object.entries(theme.colors)) {
        expect((color as any).hex, `${slot}`).toMatch(HEX_OR_NAMED);
      }
    });

    it(`${name}: every alpha (when present) is in [0, 1]`, () => {
      // alpha is optional per ThemeColor; defaults to 1.
      for (const [slot, color] of Object.entries(theme.colors)) {
        const alpha = (color as any).alpha;
        if (alpha === undefined) continue;
        expect(alpha, `${slot}`).toBeGreaterThanOrEqual(0);
        expect(alpha, `${slot}`).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('getBuiltInTheme', () => {
  it('returns the theme for a known id', () => {
    const theme = getBuiltInTheme(VISUAL_NOVEL_THEME.meta.id);
    expect(theme).toBe(VISUAL_NOVEL_THEME);
  });

  it('returns undefined for an unknown id', () => {
    expect(getBuiltInTheme('nonexistent-theme-id')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getBuiltInTheme('')).toBeUndefined();
  });

  it('finds every theme in BUILT_IN_THEMES by its id', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(getBuiltInTheme(theme.meta.id)).toBe(theme);
    }
  });
});

describe('getBuiltInThemeIds', () => {
  it('returns one id per BUILT_IN_THEMES entry', () => {
    expect(getBuiltInThemeIds().length).toBe(BUILT_IN_THEMES.length);
  });

  it('returns the meta.id of each theme in registry order', () => {
    expect(getBuiltInThemeIds()).toEqual(
      BUILT_IN_THEMES.map(t => t.meta.id),
    );
  });
});

describe('isBuiltInTheme', () => {
  it('returns true for every BUILT_IN_THEMES id', () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(isBuiltInTheme(theme.meta.id)).toBe(true);
    }
  });

  it('returns false for an unknown id', () => {
    expect(isBuiltInTheme('user-custom-theme')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isBuiltInTheme('')).toBe(false);
  });

  it('distinguishes "builtin-" prefixed customs from real builtins', () => {
    // A user-created theme that happens to start with "builtin-"
    // isn't actually built in. Pin via lookup not prefix matching.
    expect(isBuiltInTheme('builtin-but-actually-custom')).toBe(false);
  });
});
