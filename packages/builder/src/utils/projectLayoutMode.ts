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
import { inferLayoutMode, resolveProjectLayoutMode, type LayoutMode, type LayoutModeBeat } from '@asaps/core';

// The rule itself lives in core so the exported player resolves the same mode.
export { inferLayoutMode, type LayoutMode };
export type BeatLike = LayoutModeBeat;

/** Resolve from explicit settings; falls back to inference if undefined. */
export function resolveLayoutMode(
  settings: GlobalSettings | undefined,
  beats?: ReadonlyArray<BeatLike> | null
): LayoutMode {
  return resolveProjectLayoutMode(settings?.project?.layoutMode, beats);
}

/** Human-readable label for UI. */
export function layoutModeLabel(mode: LayoutMode): string {
  return mode === 'responsive' ? 'Responsive layout' : 'Fixed canvas';
}
