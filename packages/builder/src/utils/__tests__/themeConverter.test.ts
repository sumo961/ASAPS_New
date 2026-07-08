import { describe, it, expect } from 'vitest';
import { convertGlobalSettingsToTheme } from '../themeConverter';

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
