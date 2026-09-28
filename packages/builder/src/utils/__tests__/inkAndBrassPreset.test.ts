import { describe, it, expect } from 'vitest';
import { INK_AND_BRASS_THEME, BUILT_IN_THEMES } from '@asaps/core';
import { normalizeGlobalSettings } from '../themeConverter';
import { themeToGlobalSettings } from '../../themes/migration/GlobalSettingsAdapter';

/** The theme-bearing parts of GlobalSettings. */
const look = (g: any) => JSON.parse(JSON.stringify({ colors: g.colors, fonts: g.fonts, textbox: g.textbox, theme: g.theme }));

describe('Ink & Brass preset', () => {
  it('is listed first among the built-in themes', () => {
    expect(BUILT_IN_THEMES[0].meta.id).toBe('builtin-ink-and-brass');
  });

  it('applying it gives exactly the new-project look', () => {
    const fresh = normalizeGlobalSettings(undefined) as any;
    const applied = themeToGlobalSettings(INK_AND_BRASS_THEME as any, fresh) as any;
    expect(look(applied)).toEqual(look(fresh));
  });

  it('applying it after another preset brings the default look back', () => {
    const fresh = normalizeGlobalSettings(undefined) as any;
    const twine = BUILT_IN_THEMES.find((t) => t.meta.id === 'builtin-twine')!;
    const back = themeToGlobalSettings(INK_AND_BRASS_THEME as any, themeToGlobalSettings(twine as any, fresh) as any) as any;
    expect(look(back)).toEqual(look(fresh));
  });
});
