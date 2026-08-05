import { describe, it, expect } from 'vitest';
import { convertGlobalSettingsToTheme, normalizeGlobalSettings } from '../themeConverter';

describe('normalizeGlobalSettings', () => {
  it('fills every missing section for a partial globalSettings (Ink & Brass defaults)', () => {
    const n = normalizeGlobalSettings({ project: {}, debug: {} } as any);
    expect(n.colors.pcolor).toBe('#d9a441');
    expect(n.colors.bgColor).toBe('#14161f');
    expect(n.fonts.titleFont).toBeTruthy();
    expect(n.fonts.fontSize.title).toBe(40);
    expect(n.textbox).toBeTruthy();
    expect(n.textEffects).toBeTruthy();
    expect(n.hotspots).toBeTruthy();
  });

  it('preserves valid values that were present', () => {
    const n = normalizeGlobalSettings({ colors: { bgColor: '#000000' } } as any);
    expect(n.colors.bgColor).toBe('#000000'); // kept
    expect(n.colors.pcolor).toBe('#d9a441');  // filled
  });

  it('seeds pill buttons + speaker label ONLY for projects with no authored appearance', () => {
    // Brand-new project (no textbox, no colors): full default look
    const fresh = normalizeGlobalSettings({ project: {} } as any);
    expect((fresh.textbox as any).buttonRadius).toBe(999);
    expect((fresh as any).speakerDisplay?.nameStyle).toBe('label');
    // Legacy project WITH authored textbox/colors: no pills forced, no label popped
    const legacy = normalizeGlobalSettings({
      colors: { pcolor: '#ffffff' },
      textbox: { radius: 8, padding: 20, borderWidth: 2, opacity: 90 },
    } as any);
    expect((legacy.textbox as any).buttonRadius).toBeUndefined();
    expect((legacy as any).speakerDisplay).toBeUndefined();
  });

  it('handles null/undefined', () => {
    expect(() => normalizeGlobalSettings(undefined)).not.toThrow();
    expect(normalizeGlobalSettings(null).colors.pcolor).toBe('#d9a441');
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
    expect(theme.backgroundColor).toBe('#14161f'); // default bg (Ink & Brass)
    expect(theme.button.backgroundColor).toBe('#d9a441'); // default pcolor
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
