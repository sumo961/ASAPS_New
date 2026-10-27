/**
 * A Ren'Py theme's pictures and fonts kept in the project (2026-10-27: the
 * Preview drew the theme's frame, the responsive editor didn't, the Preview
 * window lacked its fonts, exports had none of it).
 */
import { describe, it, expect } from 'vitest';
import { pickThemeGraphics, planThemeCopy, themeGraphicUrls, type ThemeLibrary } from '../themeGraphics';

const g = (id: string, role: string, filename: string) => ({ id, role, filename, mimeType: 'image/png' });

const kit: any = {
  meta: { id: 'kit', name: 'Elegant GUI kit' },
  textBox: { frameAssetId: 'tb1' },
  button: { backgroundImageId: 'check', hoverBackgroundImageId: 'hov', layout: { spacing: 23 } },
  assets: {
    uiGraphics: [
      g('tb1', 'textbox-frame', 'textbox.png'),
      g('name', 'textbox-frame', 'namebox.png'),
      g('check', 'button-normal', 'check_foreground.png'),
      g('quick', 'button-normal', 'quick_idle_background.png'),
      g('choice', 'button-normal', 'choice_idle_background.png'),
      g('hov', 'button-hover', 'hover_background.png'),
      g('choiceHover', 'button-hover', 'choice_hover_background.png'),
    ],
    fonts: [
      { id: 'f1', role: 'title-font', filename: 'QueenSerif.otf', mimeType: 'font/otf', fontFamily: 'Queen Serif' },
      { id: 'f2', role: 'dialog-font', filename: 'MagnisaSans.otf', mimeType: 'font/otf', fontFamily: 'Magnisa Sans' },
    ],
  },
};

const library = (themes: Record<string, any>): ThemeLibrary => ({
  getResolvedTheme: async (id) => themes[id] ?? null,
  loadThemeAsset: async (id) => new Blob([`bytes of ${id}`], { type: 'application/octet-stream' }),
});

describe('pickThemeGraphics', () => {
  it('takes the story text box and the choice buttons, not the check boxes', () => {
    const p = pickThemeGraphics(kit);
    expect(p.frame?.filename).toBe('textbox.png');
    expect(p.button?.filename).toBe('choice_idle_background.png');
    expect(p.hover?.filename).toBe('choice_hover_background.png');
  });
});

describe('planThemeCopy', () => {
  it('copies the pictures and fonts once, fonts named after their family', async () => {
    const plan = (await planThemeCopy('kit', library({ kit }), []))!;
    expect(plan.newAssets.map((a) => a.name)).toEqual([
      'textbox.png', 'choice_idle_background.png', 'choice_hover_background.png', 'Queen Serif.otf', 'Magnisa Sans.otf',
    ]);
    const byName = Object.fromEntries(plan.newAssets.map((a) => [a.name, a]));
    expect(plan.themeGraphics).toEqual({
      fromThemeId: 'kit',
      textboxFrameAssetId: byName['textbox.png'].id,
      buttonAssetId: byName['choice_idle_background.png'].id,
      buttonHoverAssetId: byName['choice_hover_background.png'].id,
      buttonSpacing: 23,
    });
    expect(byName['Queen Serif.otf'].type).toBe('font');
  });

  it('uses what the project already has', async () => {
    const first = (await planThemeCopy('kit', library({ kit }), []))!;
    const again = (await planThemeCopy('kit', library({ kit }), first.newAssets))!;
    expect(again.newAssets).toEqual([]);
    expect(again.themeGraphics?.textboxFrameAssetId).toBe(first.themeGraphics?.textboxFrameAssetId);
  });

  it('a theme without pictures or fonts gives none; one not installed here gives no plan', async () => {
    const plain = { meta: { id: 'builtin-ink-and-brass', name: 'Ink & Brass' }, textBox: {}, button: {} };
    expect(await planThemeCopy('builtin-ink-and-brass', library({ 'builtin-ink-and-brass': plain }), [])).toEqual({ newAssets: [], themeGraphics: undefined });
    expect(await planThemeCopy('elsewhere', library({}), [])).toBeNull();
  });
});

describe('themeGraphicUrls', () => {
  it('resolves the project pictures', () => {
    const urls = themeGraphicUrls({ themeGraphics: { textboxFrameAssetId: 'a1', buttonSpacing: 23 } } as any, [{ id: 'a1', url: 'blob:frame' } as any]);
    expect(urls?.textboxFrame).toBe('blob:frame');
    expect(urls?.buttonNormal).toBeUndefined();
    expect(urls?.buttonLayout).toEqual({ spacing: 23 });
    expect(themeGraphicUrls({} as any, [])).toBeNull();
  });
});
