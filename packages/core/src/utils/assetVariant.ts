/**
 * assetVariant — iOS-style multi-resource asset variants.
 *
 * An author can attach OTHER assets in the project to a base asset as
 * orientation- or device-class-specific variants. The runtime
 * resolves the best match for the current viewport context before
 * rendering — matching iOS asset catalogs' fallback discipline:
 *
 *   exact match (orientation + deviceClass) > one-axis match > base
 *
 * Variants are STORED as `{ assetId, orientation?, deviceClass? }`,
 * pointing back into the same project's asset list. The base asset is
 * always present and renders unchanged when no variant matches.
 *
 * Why a separate type instead of mirroring Hotspot's `portrait?`
 * shape: assets compose across TWO axes, not one. A portrait-phone
 * crop is a different file from a portrait-tablet crop. Flattening
 * "two-axis match" into nested objects would force a sparse 2-D
 * matrix on every asset; an array of variants is the natural shape
 * authors actually fill (only the ones they need).
 */

export type AssetOrientation = 'portrait' | 'landscape';
export type AssetDeviceClass = 'phone' | 'tablet' | 'desktop';

export interface AssetVariant {
  /** Points to another asset in the same project. */
  assetId: string;
  /** If set, this variant only applies to that orientation. */
  orientation?: AssetOrientation;
  /** If set, this variant only applies to that device class. */
  deviceClass?: AssetDeviceClass;
}

/** Runtime context for variant resolution. */
export interface AssetVariantContext {
  orientation: AssetOrientation;
  deviceClass: AssetDeviceClass;
}

/**
 * Pick the best-matching variant for the given context.
 *
 *  - A variant is a CANDIDATE only if every constraint it specifies
 *    is satisfied (a portrait variant in landscape is skipped, a
 *    phone variant on a tablet is skipped).
 *  - Among candidates, the most SPECIFIC wins: 2 matched constraints
 *    beats 1; ties go to the first declared (stable for re-renders).
 *  - Returns `null` when no candidate matches — caller renders the
 *    base asset (the fallback).
 *
 * Defensive: tolerates undefined / non-array `variants`. Returns null
 * rather than throwing if the data is shaped wrong.
 */
export function resolveAssetVariant(
  variants: ReadonlyArray<AssetVariant> | undefined,
  ctx: AssetVariantContext
): AssetVariant | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  let best: AssetVariant | null = null;
  let bestScore = -1;
  for (const v of variants) {
    if (!v || typeof v.assetId !== 'string') continue;
    // Disqualify on contradicting constraint.
    if (v.orientation && v.orientation !== ctx.orientation) continue;
    if (v.deviceClass && v.deviceClass !== ctx.deviceClass) continue;
    // Score = count of matched constraints. A constraint-free variant
    // gets 0 — still a valid catch-all, but never beats a specific match.
    let score = 0;
    if (v.orientation === ctx.orientation) score += 1;
    if (v.deviceClass === ctx.deviceClass) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/**
 * Detect the device class from a stage width. Thresholds are
 * narrative-driven, not pixel-perfect — slot mode is already
 * width-responsive, so this is only used to pick a different
 * SOURCE FILE, not to flip layouts.
 *
 *   < 640    → phone
 *   < 1100   → tablet
 *   >= 1100  → desktop
 *
 * Matches the boundaries already used by SLOT_PREVIEW_VIEWPORTS in
 * the Visual Editor (Phone 390, Tablet 768, Desktop 1440), so the
 * editor's preview presets map cleanly to runtime device classes.
 */
export function detectDeviceClass(stageWidth: number): AssetDeviceClass {
  if (stageWidth < 640) return 'phone';
  if (stageWidth < 1100) return 'tablet';
  return 'desktop';
}

/** Detect orientation from container dimensions. */
export function detectOrientation(
  width: number,
  height: number
): AssetOrientation {
  return height > width ? 'portrait' : 'landscape';
}
