import { describe, it, expect } from 'vitest';
import { convertGlobalSettingsToTheme, normalizeGlobalSettings } from '../themeConverter';

describe('normalizeGlobalSettings', () => {
  it('fills every missing section for a partial globalSettings', () => {
    const n = normalizeGlobalSettings({ project: {}, debug: {} } as any);
    expect(n.colors.pcolor).toBe('#ffffff');
    expect(n.colors.bgColor).toBe('#1a1a2e');
    expect(n.fonts.titleFont).toBeTruthy();
    expect(n.fonts.fontSize.title).toBe(32);
    expect(n.textbox).toBeTruthy();
    expect(n.textEffects).toBeTruthy();
    expect(n.hotspots).toBeTruthy();
  });

  it('preserves valid values that were present', () => {
    const n = normalizeGlobalSettings({ colors: { bgColor: '#000000' } } as any);
    expect(n.colors.bgColor).toBe('#000000'); // kept
    expect(n.colors.pcolor).toBe('#ffffff');  // filled
  });

  it('handles null/undefined', () => {
    expect(() => normalizeGlobalSettings(undefined)).not.toThrow();
    expect(normalizeGlobalSettings(null).colors.pcolor).toBe('#ffffff');
  });
});

describe('convertGlobalSettingsToTheme', () => {
  // Regression: an imported project whose globalSettings was only
  // { project, debug } (no colors/textbox/fonts/…) crashed the whole preview
  // at `settings.colors.ptextcolor`.
  it('does not crash on a minimal/partial globalSettings', () => {
    const partial = { project: {}, debug: {} } as any;
    expect(() => convertGlobalSettingsToTheme(partial)).not.toThrow();

    const theme = convertGlobalSettingsToTheme(partial);
    expect(theme.backgroundColor).toBe('#1a1a2e'); // default bg
    expect(theme.button.backgroundColor).toBe('#ffffff'); // default pcolor
    // getContrastColor / getFontFamily did not crash on undefined:
    expect(typeof theme.button.textColor).toBe('string');
    expect(theme.fonts.titleFont).toBeTruthy();
  });

  it('does not crash on an empty object', () => {
    expect(() => convertGlobalSettingsToTheme({} as any)).not.toThrow();
  });

  it('honours provided colors/fonts over the defaults', () => {
    const s = {
      colors: { pcolor: '#000000', nonpcolor: '#111111', bgColor: '#222222', ptextcolor: '#ff0000' },
      fonts: { titleFont: 'Georgia' },
    } as any;
    const theme = convertGlobalSettingsToTheme(s);
    expect(theme.backgroundColor).toBe('#222222');
    expect(theme.button.backgroundColor).toBe('#000000');
    expect(theme.button.textColor).toBe('#ff0000'); // explicit ptextcolor wins over auto-contrast
  });
});
