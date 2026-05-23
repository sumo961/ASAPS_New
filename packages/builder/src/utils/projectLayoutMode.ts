/**
 * Phase 1 — project-level layout mode resolution.
 *
 * `projectSettings.project.layoutMode` is the source of truth once an
 * author has picked. For existing projects where the field is still
 * undefined (loaded before the flag existed), we infer:
 *
 *   - Any beat has baked author-positioned `locations[]` → 'fixed'.
 *   - Otherwise → 'responsive' (the project has been authored against
 *     the slot/spatial flow, or has only schema defaults and would
 *     reflow cleanly under the responsive renderer).
 *
 * The inference is conservative: only beats with NON-EMPTY locations
 * count as "fixed" intent. Schema-declared spatial/slot beats that
 * happen to have an empty locations Map after the recent
 * SchemaLocationInitializer skip-guard fix are correctly classified
 * as responsive.
 *
 * Callers should treat the resolved value as authoritative for both
 * editor gating (which controls to show) and runtime path selection
 * (which renderer to use). The inference fires once at load time;
 * after that, the author owns the value through the migrator UI.
 */

import type { GlobalSettings } from '../storage/types';

export type LayoutMode = 'fixed' | 'responsive';

export interface BeatLike {
  locations?: Map<string, unknown> | Record<string, unknown> | unknown[];
}

/** Resolve from explicit settings; falls back to inference if undefined. */
export function resolveLayoutMode(
  settings: GlobalSettings | undefined,
  beats?: ReadonlyArray<BeatLike> | null
): LayoutMode {
  const explicit = settings?.project?.layoutMode;
  if (explicit === 'fixed' || explicit === 'responsive') return explicit;
  return inferLayoutMode(beats);
}

/** Inference rule for legacy projects (undefined layoutMode). */
export function inferLayoutMode(
  beats?: ReadonlyArray<BeatLike> | null
): LayoutMode {
  if (!beats || beats.length === 0) return 'responsive';
  const anyBaked = beats.some(b => {
    const locs = b.locations;
    if (!locs) return false;
    if (locs instanceof Map) return locs.size > 0;
    if (Array.isArray(locs)) return locs.length > 0;
    if (typeof locs === 'object') return Object.keys(locs as object).length > 0;
    return false;
  });
  return anyBaked ? 'fixed' : 'responsive';
}

/** Human-readable label for UI. */
export function layoutModeLabel(mode: LayoutMode): string {
  return mode === 'responsive' ? 'Responsive layout' : 'Fixed canvas';
}
