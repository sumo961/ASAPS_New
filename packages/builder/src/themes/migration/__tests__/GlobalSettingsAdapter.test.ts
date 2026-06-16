/**
 * Tests for GlobalSettingsAdapter — bidirectional GlobalSettings ↔
 * ThemeDefinition conversion plus theme-override merge/extract. Pure
 * transforms (only uuid is non-deterministic, and we pass an explicit id).
 */
import { describe, it, expect } from 'vitest';
import {
  globalSettingsToTheme,
  themeToGlobalSettings,
  applyThemeOverrides,
  extractThemeOverrides,
} from '../GlobalSettingsAdapter';

const settings = (over: any = {}) =>
  ({
    colors: {
      pcolor: '#3b82f6',
      palpha: 100,
      nonpcolor: '#16213e',
      nonpalpha: 90,
      ptextcolor: '',
      nonptextcolor: '#ffffff',
      bgColor: '#101010',
      textBoxBorder: '#4a90d9',
    },
    fonts: { titleFont: 'Georgia', textFont: 'Arial', btnFont: 'Verdana', fontSize: { title: 32, text: 16, button: 14 } },
    textbox: { borderWidth: 2, radius: 12, padding: 10, opacity: 95, position: 'bottom', hideTitleTextBox: false, boxVisibility: 'all' },
    textEffects: { animation: 'none', typewriterSpeed: 30, fadeInDuration: 300 },
    hotspots: { visible: true, labels: true, highlightColor: '#ffff00', opacity: 80, showInPreview: true, labelDisplay: 'hover' },
    ...over,
  }) as any;

describe('globalSettingsToTheme', () => {
  it('maps colors, alpha, and meta', () => {
    const t = globalSettingsToTheme(settings(), 'My Theme', 'theme-1');
    expect(t.meta).toMatchObject({ id: 'theme-1', name: 'My Theme', tags: ['converted'] });
    expect(t.colors.primary).toEqual({ hex: '#3b82f6', alpha: 1 }); // palpha 100 → 1
    expect(t.colors.background.hex).toBe('#101010');
    expect(t.colors.border.hex).toBe('#4a90d9');
  });

  it('auto-derives button text color by contrast when ptextcolor is unset', () => {
    expect(globalSettingsToTheme(settings({ colors: { ...settings().colors, pcolor: '#000000', ptextcolor: '' } })).colors.buttonText.hex).toBe('#ffffff');
    expect(globalSettingsToTheme(settings({ colors: { ...settings().colors, pcolor: '#ffffff', ptextcolor: '' } })).colors.buttonText.hex).toBe('#000000');
  });

  it('uses an explicit ptextcolor when provided', () => {
    const t = globalSettingsToTheme(settings({ colors: { ...settings().colors, ptextcolor: '#ff0000' } }));
    expect(t.colors.buttonText.hex).toBe('#ff0000');
  });

  it('maps fonts (with serif/sans defaults when unset)', () => {
    const t = globalSettingsToTheme(settings());
    expect(t.fonts.title).toMatchObject({ family: 'Georgia', size: 32 });
    expect(t.fonts.body).toMatchObject({ family: 'Arial', size: 16 });

    const d = globalSettingsToTheme(settings({ fonts: { ...settings().fonts, titleFont: '', textFont: '' } }));
    expect(d.fonts.title.family).toBe('serif');
    expect(d.fonts.body.family).toBe('sans-serif');
  });

  it('converts textbox opacity 0-100 → 0-1 and keeps geometry/position', () => {
    const t = globalSettingsToTheme(settings());
    expect(t.textBox.opacity).toBeCloseTo(0.95);
    expect(t.textBox).toMatchObject({ borderRadius: 12, padding: 10, borderWidth: 2, position: 'bottom', hideTitleTextBox: false });
  });
});

describe('round-trip settings → theme → settings', () => {
  it('preserves the load-bearing fields', () => {
    const orig = settings();
    const back = themeToGlobalSettings(globalSettingsToTheme(orig));
    expect(back.colors.bgColor).toBe('#101010');
    expect(back.colors.pcolor).toBe('#3b82f6'); // via buttonNormal
    expect(back.fonts.titleFont).toBe('Georgia');
    expect(back.fonts.fontSize).toEqual({ title: 32, text: 16, button: 14 });
    expect(back.textbox).toMatchObject({ radius: 12, padding: 10, borderWidth: 2, opacity: 95 });
  });
});

describe('applyThemeOverrides', () => {
  it('shallow-merges each section over the base', () => {
    const base = globalSettingsToTheme(settings(), 'base', 'b');
    const merged = applyThemeOverrides(base, { colors: { ...base.colors, primary: { hex: '#ff00ff' } } });
    expect(merged.colors.primary.hex).toBe('#ff00ff'); // overridden
    expect(merged.colors.background.hex).toBe(base.colors.background.hex); // untouched
    expect(merged.button).toEqual(base.button); // section not overridden
  });
});

describe('extractThemeOverrides', () => {
  it('returns undefined when settings match the base theme', () => {
    const s = settings();
    const base = globalSettingsToTheme(s, 'base', 'b');
    expect(extractThemeOverrides(base, s)).toBeUndefined();
  });

  it('returns color overrides when settings differ from the base', () => {
    const base = globalSettingsToTheme(settings(), 'base', 'b');
    const changed = settings({ colors: { ...settings().colors, bgColor: '#abcdef' } });
    const overrides = extractThemeOverrides(base, changed);
    expect(overrides).toBeDefined();
    expect(overrides!.colors).toBeDefined();
  });
});
