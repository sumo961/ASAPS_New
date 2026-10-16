/**
 * Custom fonts shipped with an exported story.
 *
 * The builder offers a font asset under its file name without the extension
 * ("Windows Regular.ttf" → "Windows Regular"), and that name is what the
 * project settings store. The export packs the file as
 * "fonts/{assetId}_{originalName}.ext", so the player recovers the same
 * family name and registers the file under it.
 */

/** "fonts/asset_1_x9_Windows Regular.ttf" + "asset_1_x9" → "Windows Regular" */
export function fontFamilyFromAssetFilename(filename: string, assetId: string): string {
  const base = filename.split('/').pop() || filename;
  const withoutId = assetId && base.startsWith(`${assetId}_`) ? base.slice(assetId.length + 1) : base;
  return withoutId.replace(/\.[^.]+$/, '');
}

/** Register a font file with the document; false when it can't be used. */
export async function registerFontAsset(family: string, blob: Blob): Promise<boolean> {
  if (!family || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    return false;
  }
  try {
    const face = new FontFace(family, await blob.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (err) {
    console.warn(`[PlayerEngine] Could not load font "${family}":`, err);
    return false;
  }
}
