/**
 * A theme's pictures and fonts, kept in the project (2026-10-27).
 *
 * An imported Ren'Py theme brings a text-box frame, button pictures and
 * fonts. They used to live only in this computer's theme library, and the
 * project kept nothing but the theme's id — so each project, window and
 * computer showed what that id happened to find there: the Preview drew the
 * frame, the responsive editor didn't, the Preview window lacked the fonts,
 * exports and other computers had none of it.
 *
 * Now they are copied into the project once (ordinary pictures and fonts in
 * its assets) and `globalSettings.themeGraphics` names them. Every surface
 * reads them from the project.
 */
import type { ThemeAssetRef, ThemeDefinition } from '@asaps/core';
import type { Asset } from '../components/assets/AssetManager';
import type { GlobalSettings } from '../storage/types';
import type { ThemeAssetUrls } from '../hooks/useThemes';
import { newAssetId } from './updateFromCopy';

export type ThemeGraphics = NonNullable<GlobalSettings['themeGraphics']>;

/** What a theme library exposes here (ThemeService). */
export interface ThemeLibrary {
  getResolvedTheme(themeId: string): Promise<ThemeDefinition | null>;
  loadThemeAsset(assetId: string): Promise<Blob | null>;
}

const stem = (filename: string) => filename.replace(/\.[^/.]+$/, '').toLowerCase();

/**
 * The frame and button pictures of a theme. A Ren'Py kit offers several
 * per role (name box, check boxes, quick-menu buttons …); the ones a story
 * needs are named textbox / choice_idle_background / choice_hover_background.
 */
export function pickThemeGraphics(theme: ThemeDefinition): { frame?: ThemeAssetRef; button?: ThemeAssetRef; hover?: ThemeAssetRef } {
  const graphics = theme.assets?.uiGraphics ?? [];
  const byId = (id?: string) => (id ? graphics.find((g) => g.id === id) : undefined);
  const named = (role: string, ...names: string[]) => {
    for (const name of names) {
      const hit = graphics.find((g) => g.role === role && stem(g.filename) === name);
      if (hit) return hit;
    }
    return undefined;
  };
  return {
    frame: named('textbox-frame', 'textbox') ?? byId(theme.textBox?.frameAssetId) ?? graphics.find((g) => g.role === 'textbox-frame'),
    button: named('button-normal', 'choice_idle_background', 'idle_background') ?? byId(theme.button?.backgroundImageId),
    hover: named('button-hover', 'choice_hover_background', 'hover_background') ?? byId(theme.button?.hoverBackgroundImageId),
  };
}

/** The project's theme pictures as the URLs the renderers take. */
export function themeGraphicUrls(settings: GlobalSettings | null | undefined, assets: Asset[]): ThemeAssetUrls | null {
  const g = settings?.themeGraphics;
  if (!g) return null;
  const url = (id?: string) => (id ? assets.find((a) => a.id === id)?.url : undefined);
  return {
    fonts: new Map(),
    graphics: new Map(),
    textboxFrame: url(g.textboxFrameAssetId),
    buttonNormal: url(g.buttonAssetId),
    buttonHover: url(g.buttonHoverAssetId),
    ...(g.buttonSpacing !== undefined ? { buttonLayout: { spacing: g.buttonSpacing } } : {}),
  };
}

export interface ThemeCopyPlan {
  /** Pictures and fonts to add to the project. */
  newAssets: Asset[];
  /** What `globalSettings.themeGraphics` becomes; undefined: the theme has none. */
  themeGraphics: ThemeGraphics | undefined;
}

function asset(blob: Blob, name: string, type: Asset['type'], themeName: string): Asset {
  return {
    id: newAssetId(),
    name,
    type,
    ...(type === 'image' ? { subType: 'sprite' as const } : {}),
    url: URL.createObjectURL(blob),
    file: new File([blob], name, { type: blob.type }),
    size: blob.size,
    metadata: { fromTheme: themeName },
    uploadedAt: new Date(),
  };
}

/**
 * What it takes to keep `themeId`'s pictures and fonts in the project.
 * Null when that theme isn't in this computer's library (the project then
 * keeps what it has). Pictures and fonts the project already has (same
 * name and size) are used, not copied again.
 */
export async function planThemeCopy(themeId: string, library: ThemeLibrary, projectAssets: Asset[]): Promise<ThemeCopyPlan | null> {
  const theme = await library.getResolvedTheme(themeId);
  if (!theme) return null;
  const themeName = theme.meta?.name ?? themeId;
  const newAssets: Asset[] = [];
  const have = (name: string, size: number, type: Asset['type']) =>
    [...projectAssets, ...newAssets].find((a) => a.type === type && a.name === name && a.size === size);

  const copyPicture = async (ref?: ThemeAssetRef): Promise<string | undefined> => {
    if (!ref) return undefined;
    const blob = await library.loadThemeAsset(ref.id);
    if (!blob) return undefined;
    const existing = have(ref.filename, blob.size, 'image');
    if (existing) return existing.id;
    const added = asset(blob, ref.filename, 'image', themeName);
    newAssets.push(added);
    return added.id;
  };

  const picked = pickThemeGraphics(theme);
  const textboxFrameAssetId = await copyPicture(picked.frame);
  const buttonAssetId = await copyPicture(picked.button);
  const buttonHoverAssetId = await copyPicture(picked.hover);

  // Fonts: a project font is known by its file name without the extension,
  // so it is named after the family the settings use ("Queen Serif.otf").
  let fonts = 0;
  for (const ref of theme.assets?.fonts ?? []) {
    if (!ref.fontFamily) continue;
    const ext = ref.filename.match(/\.[^/.]+$/)?.[0] ?? '.ttf';
    const name = `${ref.fontFamily}${ext}`;
    const known = [...projectAssets, ...newAssets].some((a) => a.type === 'font' && stem(a.name) === ref.fontFamily!.toLowerCase());
    if (known) { fonts++; continue; }
    const blob = await library.loadThemeAsset(ref.id);
    if (!blob) continue;
    newAssets.push(asset(blob, name, 'font', themeName));
    fonts++;
  }

  const spacing = theme.button?.layout?.spacing;
  const hasAny = textboxFrameAssetId || buttonAssetId || buttonHoverAssetId || fonts > 0;
  return {
    newAssets,
    themeGraphics: hasAny
      ? {
          fromThemeId: themeId,
          ...(textboxFrameAssetId ? { textboxFrameAssetId } : {}),
          ...(buttonAssetId ? { buttonAssetId } : {}),
          ...(buttonHoverAssetId ? { buttonHoverAssetId } : {}),
          ...(spacing !== undefined ? { buttonSpacing: spacing } : {}),
        }
      : undefined,
  };
}
