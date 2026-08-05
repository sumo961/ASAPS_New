/**
 * Tests for the PLAYER's copy of convertGlobalSettingsToTheme — the one
 * exported stories actually run. It is a hand-maintained duplicate of the
 * builder's themeConverter, and it has already drifted once: font sizes
 * chosen in the builder never reached exports because this copy didn't map
 * fonts.fontSize.* → titleFontSize/textFontSize/buttonFontSize. These tests
 * pin the parts that have drifted or are new (v0.9.87 theme work) so the
 * two converters can't silently diverge on them again.
 */
import { describe, it, expect } from 'vitest';
import { convertGlobalSettingsToTheme } from '../src/PlayerEngine';

function makeSettings(overrides: any = {}): any {
  return {
    colors: {
      bgColor: '#14161f',
      pcolor: '#d9a441',
      nonpcolor: '#1b1f2b',
      ptextcolor: '',
      nonptextcolor: '',
      textBoxBorder: '#3d4356',
      ...overrides.colors,
    },
    textbox: {
      borderWidth: 1,
      radius: 14,
      padding: 22,
      opacity: 93,
      ...overrides.textbox,
    },
    fonts: {
      titleFont: 'Georgia',
      textFont: 'System',
      btnFont: 'System',
      fontSize: { title: 40, text: 19, button: 16 },
      ...overrides.fonts,
    },
    ...overrides.rest,
  };
}

describe('player convertGlobalSettingsToTheme (exported-story theme derivation)', () => {
  it('maps builder font sizes into the render theme (the drift bug)', () => {
    const theme = convertGlobalSettingsToTheme(makeSettings());
    expect(theme.fonts.titleFontSize).toBe(40);
    expect(theme.fonts.textFontSize).toBe(19);
    expect(theme.fonts.buttonFontSize).toBe(16);
  });

  it('survives legacy projects without fontSize (undefined, not crash)', () => {
    const settings = makeSettings();
    delete settings.fonts.fontSize;
    const theme = convertGlobalSettingsToTheme(settings);
    expect(theme.fonts.titleFontSize).toBeUndefined();
  });

  it('resolves the System font to the native UI stack', () => {
    const theme = convertGlobalSettingsToTheme(makeSettings());
    expect(theme.fonts.textFont).toContain('system-ui');
    expect(theme.fonts.titleFont).toBe('Georgia, serif');
  });

  it('buttonRadius overrides the shared radius; unset falls back (legacy)', () => {
    const pill = convertGlobalSettingsToTheme(makeSettings({
      textbox: { radius: 14, buttonRadius: 999 },
    }));
    expect(pill.button.borderRadius).toBe(999);
    expect(pill.textBox.borderRadius).toBe(14);

    const legacy = convertGlobalSettingsToTheme(makeSettings({ textbox: { radius: 8 } }));
    expect(legacy.button.borderRadius).toBe(8);
  });

  it('auto-derives contrasting button text on the brass default', () => {
    // #d9a441 is light → contrast calculation must yield dark text when
    // ptextcolor is left empty.
    const theme = convertGlobalSettingsToTheme(makeSettings());
    expect(theme.button.textColor).toBe('#000000');
  });
});
