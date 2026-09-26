/**
 * A project's layout mode — one rule for the builder and the exported player.
 *
 * `project.layoutMode` in the settings is authoritative once an author has
 * picked. Projects saved before the flag existed are inferred: any beat with
 * baked, author-positioned `locations` means 'fixed', otherwise 'responsive'.
 * The exported player must reach the same answer as the Preview Window, or a
 * story previews one way and publishes another.
 */

export type LayoutMode = 'fixed' | 'responsive';

export interface LayoutModeBeat {
  locations?: Map<string, unknown> | Record<string, unknown> | unknown[];
}

/** Inference rule for projects without an explicit layoutMode. */
export function inferLayoutMode(beats?: ReadonlyArray<LayoutModeBeat> | null): LayoutMode {
  if (!beats || beats.length === 0) return 'responsive';
  const anyBaked = beats.some((b) => {
    const locs = b.locations;
    if (!locs) return false;
    if (locs instanceof Map) return locs.size > 0;
    if (Array.isArray(locs)) return locs.length > 0;
    if (typeof locs === 'object') return Object.keys(locs as object).length > 0;
    return false;
  });
  return anyBaked ? 'fixed' : 'responsive';
}

/** The explicit mode when set, else the inferred one. */
export function resolveProjectLayoutMode(
  explicit: unknown,
  beats?: ReadonlyArray<LayoutModeBeat> | null,
): LayoutMode {
  if (explicit === 'fixed' || explicit === 'responsive') return explicit;
  return inferLayoutMode(beats);
}
