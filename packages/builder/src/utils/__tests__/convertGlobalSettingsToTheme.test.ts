/**
 * Tests for convertGlobalSettingsToTheme — translates the builder's
 * GlobalSettings (the authoring surface) to RenderThemeSettings
 * (the renderer's typed contract). Runs on every project load + on
 * every settings change in the editor, so wrong values cascade as
 * stylesheet flips across every beat.
 *
 * The normalizeSpeakerDisplay migration sub-function already has its
 * own test file (normalizeSpeakerDisplay.test.ts); this file focuses
 * on the rest of the converter:
 *   - color fallbacks (button background → buttonBg | buttonBgColor
 *     | pcolor; text color → explicit | auto-calculated via contrast)
 *   - opacity normalization (decimal-vs-percentage detection + clamp)
 *   - font family resolution (built-in map + quote-wrapping for
 *     spaced custom names + passthrough for full CSS stacks)
 *   - hotspot defaults (opacity divides by 100, visible/labels
 *     default to true)
 *   - hotspot ?? guards keep explicit false/0 values
 *   - typing-effects passthrough
 */
import { describe, it, expect } from 'vitest';
import { convertGlobalSettingsToTheme } from '../themeConverter';

/** Minimal settings factory — only the fields we care about per test. */
function makeSettings(overrides: any = {}): any {
  return {
    colors: {
      bgColor: '#000000',
      pcolor: '#1a1a2e',
      nonpcolor: '#0f3460',
      ptextcolor: '',
      nonptextcolor: '',
      textBoxBorder: '#444',
      ...overrides.colors,
    },
    textbox: {
      borderWidth: 2,
      radius: 8,
      padding: 10,
      opacity: 80,
      hideTitleTextBox: false,
      ...overrides.textbox,
    },
    fonts: {
      titleFont: 'Arial',
      textFont: 'Arial',
      btnFont: 'Arial',
      fontSize: { title: 32, text: 16, button: 18 },
      ...overrides.fonts,
    },
    textEffects: {
      animation: 'none',
      typewriterSpeed: 50,
      fadeInDuration: 200,
      ...overrides.textEffects,
    },
    hotspots: {
      ...overrides.hotspots,
    },
    speakerDisplay: overrides.speakerDisplay,
    ...overrides.rest,
  };
}

describe('convertGlobalSettingsToTheme', () => {
  describe('color fallbacks', () => {
    it('button background prefers buttonBg over buttonBgColor over pcolor', () => {
      // Three-tier precedence per the source. Authors who set
      // buttonBg explicitly (newest field) get that.
      const withButtonBg = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#000', buttonBg: '#aaa', buttonBgColor: '#bbb' },
      }));
      expect(withButtonBg.button.backgroundColor).toBe('#aaa');

      // buttonBg missing → falls to buttonBgColor.
      const withColor = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#000', buttonBgColor: '#bbb' },
      }));
      expect(withColor.button.backgroundColor).toBe('#bbb');

      // Both missing → falls to pcolor (the legacy single color).
      const fallback = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#cccccc' },
      }));
      expect(fallback.button.backgroundColor).toBe('#cccccc');
    });

    it('button hover lightens the resolved button color', () => {
      // Hover state is computed at conversion time so the renderer
      // doesn't need a hovered-color authoring field.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#404040' },
      }));
      const hover = theme.button.hoverBackgroundColor;
      // Hover should be lighter than the source — first hex pair
      // higher than 0x40.
      expect(hover.toLowerCase()).not.toBe('#404040');
      expect(parseInt(hover.slice(1, 3), 16)).toBeGreaterThan(0x40);
    });

    it('button text color uses explicit ptextcolor when set', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#000', ptextcolor: '#ff00ff' },
      }));
      expect(theme.button.textColor).toBe('#ff00ff');
    });

    it('button text color auto-calculates contrast on a dark button', () => {
      // pcolor #000 is dark → contrast text should be white.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#000000', ptextcolor: '' },
      }));
      expect(theme.button.textColor).toBe('#ffffff');
    });

    it('button text color auto-calculates contrast on a light button', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        colors: { pcolor: '#ffffff', ptextcolor: '' },
      }));
      expect(theme.button.textColor).toBe('#000000');
    });

    it('NPC text color uses explicit nonptextcolor or contrast fallback', () => {
      const explicit = convertGlobalSettingsToTheme(makeSettings({
        colors: { nonpcolor: '#000', nonptextcolor: '#abcdef' },
      }));
      expect(explicit.colors.textColor).toBe('#abcdef');

      const auto = convertGlobalSettingsToTheme(makeSettings({
        colors: { nonpcolor: '#ffffff', nonptextcolor: '' },
      }));
      expect(auto.colors.textColor).toBe('#000000');
    });
  });

  describe('opacity normalization', () => {
    it('passes percentage values 1..100 through', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        textbox: { opacity: 75 },
      }));
      expect(theme.textBox.opacity).toBe(75);
    });

    it('treats values ≤ 1 as decimal and converts to percentage', () => {
      // Legacy bug: some old projects stored opacity as 0.0..1.0
      // (decimal) instead of 0..100 (percentage). The normalizer
      // detects this and converts so the renderer's expectation
      // (percentage) is always met.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        textbox: { opacity: 0.5 },
      }));
      expect(theme.textBox.opacity).toBe(50);
    });

    it('treats 1.0 as decimal → 100%', () => {
      // 1.0 is unambiguous — almost certainly decimal.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        textbox: { opacity: 1 },
      }));
      expect(theme.textBox.opacity).toBe(100);
    });

    it('clamps values above 100 to 100', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        textbox: { opacity: 150 },
      }));
      expect(theme.textBox.opacity).toBe(100);
    });
  });

  describe('font family resolution', () => {
    it('maps a built-in name to its full CSS stack', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        fonts: { titleFont: 'Georgia' },
      }));
      expect(theme.fonts.titleFont).toBe('Georgia, serif');
    });

    it('quote-wraps a custom name with spaces', () => {
      // CSS requires quoting font names with spaces in font-family.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        fonts: { titleFont: 'Custom Display Font' },
      }));
      expect(theme.fonts.titleFont).toBe("'Custom Display Font', sans-serif");
    });

    it('passes through a name that already looks like a CSS font stack', () => {
      // A name containing a comma OR ending with a generic family
      // is assumed to already be a full stack — don't double-wrap.
      const withComma = convertGlobalSettingsToTheme(makeSettings({
        fonts: { titleFont: 'Helvetica Neue, Arial, sans-serif' },
      }));
      expect(withComma.fonts.titleFont).toBe('Helvetica Neue, Arial, sans-serif');

      const withGeneric = convertGlobalSettingsToTheme(makeSettings({
        fonts: { titleFont: 'Lato sans-serif' },
      }));
      expect(withGeneric.fonts.titleFont).toBe('Lato sans-serif');
    });

    it('passes a single-word custom name through unchanged', () => {
      // No spaces → not unsafe for CSS without quotes.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        fonts: { titleFont: 'Inter' },
      }));
      expect(theme.fonts.titleFont).toBe('Inter');
    });

    it('button font falls through btnFont → buttonFont → "Arial"', () => {
      // btnFont (legacy) wins.
      const a = convertGlobalSettingsToTheme(makeSettings({
        fonts: { btnFont: 'Verdana', buttonFont: 'Comic Sans MS' },
      }));
      expect(a.fonts.buttonFont).toBe('Verdana, sans-serif');

      // No btnFont → buttonFont.
      const b = convertGlobalSettingsToTheme(makeSettings({
        fonts: { btnFont: undefined, buttonFont: 'Comic Sans MS' },
      }));
      expect(b.fonts.buttonFont).toBe('Comic Sans MS, cursive');

      // Neither → Arial default.
      const c = convertGlobalSettingsToTheme(makeSettings({
        fonts: { btnFont: undefined, buttonFont: undefined },
      }));
      expect(c.fonts.buttonFont).toBe('Arial, sans-serif');
    });
  });

  describe('hotspot config', () => {
    it('opacity divides by 100 (renderer expects 0..1)', () => {
      // Per the inline comment: stored 0..100 (percent) but rendered
      // 0..1 (CSS alpha). Conversion happens here.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        hotspots: { opacity: 50 },
      }));
      expect(theme.hotspot.opacity).toBe(0.5);
    });

    it('opacity 0 stays at 0 (explicit ?? guard)', () => {
      // Authors wanting invisible hotspots set opacity:0. A || guard
      // would silently flip back to the default 30%.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        hotspots: { opacity: 0 },
      }));
      expect(theme.hotspot.opacity).toBe(0);
    });

    it('defaults to 0.3 opacity when not configured', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({ hotspots: {} }));
      expect(theme.hotspot.opacity).toBe(0.3);
    });

    it('defaults visible to true', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({ hotspots: {} }));
      expect(theme.hotspot.visible).toBe(true);
    });

    it('respects explicit visible:false (?? not || guard)', () => {
      // Setting visible:false is the "hide all hotspots in preview"
      // workflow — must stick.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        hotspots: { visible: false },
      }));
      expect(theme.hotspot.visible).toBe(false);
    });

    it('defaults highlightColor to yellow #ffff00', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({ hotspots: {} }));
      expect(theme.hotspot.highlightColor).toBe('#ffff00');
    });

    it('uses configured highlightColor when set', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        hotspots: { highlightColor: '#ff0080' },
      }));
      expect(theme.hotspot.highlightColor).toBe('#ff0080');
    });

    it('defaults showLabels/labelDisplay to safe values', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({ hotspots: {} }));
      expect(theme.hotspot.showLabels).toBe(true);
      expect(theme.hotspot.labelDisplay).toBe('hover');
      expect(theme.hotspot.showInPreview).toBe('visible');
    });
  });

  describe('text effects', () => {
    it('passes through animation / speed / fade duration', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({
        textEffects: {
          animation: 'typewriter',
          typewriterSpeed: 30,
          fadeInDuration: 500,
        },
      }));
      expect(theme.textEffects.animation).toBe('typewriter');
      expect(theme.textEffects.typewriterSpeed).toBe(30);
      expect(theme.textEffects.fadeInDuration).toBe(500);
    });
  });

  describe('speakerDisplay integration', () => {
    it('passes through to the migration when set', () => {
      // We only verify the conversion doesn't drop it — the
      // migration's own behavior is covered in
      // normalizeSpeakerDisplay.test.ts.
      const theme = convertGlobalSettingsToTheme(makeSettings({
        speakerDisplay: { nameStyle: 'label', namePosition: 'right' },
      }));
      expect(theme.speakerDisplay).toBeDefined();
      expect((theme.speakerDisplay as any).namePosition).toBe('right');
    });

    it('emits undefined speakerDisplay when settings omit it', () => {
      const theme = convertGlobalSettingsToTheme(makeSettings({ rest: {} }));
      expect(theme.speakerDisplay).toBeUndefined();
    });
  });
});
