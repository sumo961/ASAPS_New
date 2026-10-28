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
    // Never the namebox (the importer gives it the frame role too) or a
    // full-screen overlay (role screen-overlay, not textbox-frame).
    frame: named('textbox-frame', 'textbox') ?? byId(theme.textBox?.frameAssetId)
      ?? graphics.find((g) => g.role === 'textbox-frame' && stem(g.filename).includes('textbox')),
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

/**
 * The project's copies of a theme's pictures and fonts, found by their bytes
 * (2026-10-28: deleting a theme left its copies in the project — 34 of 39
 * theme files there unused). A copy carries no mark of where it came from
 * once saved, but it is byte for byte the theme's file, so nothing the
 * author added themselves is taken for one.
 */
export async function findThemeCopies(
  themeId: string,
  library: ThemeLibrary,
  projectAssets: Asset[],
  readProjectAsset: (asset: Asset) => Promise<Blob | null> = async (a) => (a.url ? (await fetch(a.url)).blob() : null),
): Promise<Asset[]> {
  const theme = await library.getResolvedTheme(themeId);
  if (!theme) return [];
  const refs = [...(theme.assets?.uiGraphics ?? []), ...(theme.assets?.fonts ?? [])];
  const themeFiles: Blob[] = [];
  for (const ref of refs) {
    const blob = await library.loadThemeAsset(ref.id);
    if (blob) themeFiles.push(blob);
  }
  const bytes = async (b: Blob): Promise<Uint8Array> => {
    if (typeof b.arrayBuffer === 'function') return new Uint8Array(await b.arrayBuffer());
    return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(b);
    }));
  };
  const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
  const copies: Asset[] = [];
  for (const candidate of projectAssets) {
    const matches = themeFiles.filter((f) => f.size === candidate.size);
    if (matches.length === 0) continue;
    const blob = await readProjectAsset(candidate);
    if (!blob) continue;
    const mine = await bytes(blob);
    for (const f of matches) {
      if (same(mine, await bytes(f))) { copies.push(candidate); break; }
    }
  }
  return copies;
}

/** Project assets the current settings use: the Text Box pictures and the fonts named in Fonts. */
export function assetsInUseBySettings(settings: GlobalSettings, projectAssets: Asset[]): Set<string> {
  const used = new Set<string>();
  const g = settings.themeGraphics;
  for (const id of [g?.textboxFrameAssetId, g?.buttonAssetId, g?.buttonHoverAssetId]) if (id) used.add(id);
  const families = new Set(
    [settings.fonts?.titleFont, settings.fonts?.textFont, settings.fonts?.btnFont, settings.fonts?.buttonFont]
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.toLowerCase()),
  );
  for (const a of projectAssets) if (a.type === 'font' && families.has(stem(a.name))) used.add(a.id);
  return used;
}

/**
 * Settings after these project assets are gone: Text Box pictures that were
 * among them are dropped, font settings that named one of the fonts go back
 * to `defaultFonts`.
 */
export function settingsWithoutAssets(settings: GlobalSettings, removed: Asset[], defaultFonts: GlobalSettings['fonts']): GlobalSettings {
  const ids = new Set(removed.map((a) => a.id));
  const families = new Set(removed.filter((a) => a.type === 'font').map((a) => stem(a.name)));
  let next = settings;
  const g = settings.themeGraphics;
  if (g && [g.textboxFrameAssetId, g.buttonAssetId, g.buttonHoverAssetId].some((id) => id && ids.has(id))) {
    const kept = { ...g };
    if (kept.textboxFrameAssetId && ids.has(kept.textboxFrameAssetId)) delete kept.textboxFrameAssetId;
    if (kept.buttonAssetId && ids.has(kept.buttonAssetId)) delete kept.buttonAssetId;
    if (kept.buttonHoverAssetId && ids.has(kept.buttonHoverAssetId)) delete kept.buttonHoverAssetId;
    const { themeGraphics: _dropped, ...rest } = next;
    next = (kept.textboxFrameAssetId || kept.buttonAssetId || kept.buttonHoverAssetId)
      ? { ...rest, themeGraphics: kept } as GlobalSettings
      : rest as GlobalSettings;
  }
  if (families.size > 0 && next.fonts) {
    const fonts = { ...next.fonts };
    const reset = <K extends 'titleFont' | 'textFont' | 'btnFont' | 'buttonFont'>(key: K) => {
      const v = fonts[key];
      if (typeof v === 'string' && families.has(v.toLowerCase())) (fonts as Record<string, unknown>)[key] = defaultFonts?.[key];
    };
    reset('titleFont'); reset('textFont'); reset('btnFont'); reset('buttonFont');
    next = { ...next, fonts };
  }
  return next;
}
