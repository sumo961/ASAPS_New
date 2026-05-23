/**
 * Phase 1 — bidirectional migration between project layoutMode values.
 *
 * Both migrators are PURE — they produce a new beats array and a
 * change summary; the caller is responsible for committing the result
 * via the normal undoable command path. This keeps the migration
 * testable in isolation and re-runnable for preview.
 *
 *  Fixed → Responsive
 *    For each beat:
 *      - Clear `beat.locations` (the absolute path won't be taken).
 *      - If the beat type declares slots / a spatial layer in the
 *        schema, infer slotIntent anchors for each authored element
 *        from its previous quadrant on the stage. Title slots also
 *        get a preferredLines hint derived from the observed text
 *        wrap (small heuristic — 1 line for short headings, 2 for
 *        longer).
 *      - Hotspots on choices / props / dialog-choices are preserved
 *        as-is — they're already normalized 0–1 to the spatial layer
 *        and survive the migration verbatim.
 *
 *  Responsive → Fixed
 *    For each beat:
 *      - If `beat.locations` is empty AND the beat type is visible,
 *        bake schema-default positions via `generateDefaultLocations`
 *        so the absolute renderer has something to draw.
 *      - slotIntent / slotAnimations / spatialAnimations are kept on
 *        the beat (no destructive removal) — they're inert in fixed
 *        mode and survive a future Fixed → Responsive round-trip.
 *
 * Per-beat changes are summarised so the migrator UI can show a
 * preview before commit. `applied` is the new beats array; `summary`
 * is an array of human-readable lines, one per affected beat. The
 * caller wraps the apply in a single undo step.
 */

import type { Beat } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

export interface MigrationLine {
  beatId: string;
  beatType: string;
  beatName?: string;
  /** Short human-readable description of what changed for this beat. */
  detail: string;
}

export interface MigrationResult {
  applied: Beat[];
  summary: MigrationLine[];
}

const VISIBLE_BEAT_TYPES = new Set([
  'titleScreen', 'infoText', 'durScreen', 'endScreen',
  'movementChoice', 'pickProp', 'dialogTree',
  'videoBeat', 'panorama', 'hyperText', 'keypad', 'inputText',
  'aiInfoText', 'aiDialogTree', 'aiSummary', 'aiDurScreen', 'onlineContent',
]);

function beatDef(beatType: string): any {
  return (beatDefinitions as any).beatTypes?.[beatType];
}

function getStageSize(projectWidth: number, projectHeight: number): { w: number; h: number } {
  return { w: projectWidth || 1024, h: projectHeight || 768 };
}

/**
 * Infer a slot anchor from a pixel position on the stage.
 * Maps a bounding box's center to an h/v anchor preset.
 */
function inferAnchor(
  loc: { x: number; y: number; width?: number; height?: number },
  stage: { w: number; h: number }
): { h: 'left' | 'center' | 'right'; v: 'top' | 'center' | 'bottom' } {
  const cx = loc.x + (loc.width ?? 0) / 2;
  const cy = loc.y + (loc.height ?? 0) / 2;
  const h: 'left' | 'center' | 'right' =
    cx < stage.w * 0.33 ? 'left' :
    cx > stage.w * 0.66 ? 'right' :
    'center';
  const v: 'top' | 'center' | 'bottom' =
    cy < stage.h * 0.33 ? 'top' :
    cy > stage.h * 0.66 ? 'bottom' :
    'center';
  return { h, v };
}

/** Heuristic for a title slot's preferred line count from its text. */
function inferPreferredLines(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const len = text.length;
  if (len <= 24) return 1;
  if (len <= 60) return 2;
  return 3;
}

/* -------- Fixed → Responsive ------------------------------------- */

export function migrateFixedToResponsive(
  beats: ReadonlyArray<Beat>,
  projectWidth: number = 1024,
  projectHeight: number = 768
): MigrationResult {
  const stage = getStageSize(projectWidth, projectHeight);
  const summary: MigrationLine[] = [];
  const applied: Beat[] = beats.map(beat => {
    if (!VISIBLE_BEAT_TYPES.has(beat.type)) return beat;
    const def = beatDef(beat.type);
    const hasResponsiveContract =
      def?.layoutMode === 'slot' || def?.layoutMode === 'spatial' || !!def?.spatialLayer;
    if (!hasResponsiveContract) return beat;

    const baked: Array<{ name: string; x: number; y: number; width?: number; height?: number }> = [];
    const existingLocs = beat.locations;
    if (existingLocs instanceof Map) {
      existingLocs.forEach((v: any, k: any) => {
        if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
          baked.push({ name: String(k ?? v.name ?? ''), x: v.x, y: v.y, width: v.width, height: v.height });
        }
      });
    }

    // Build a slotIntent map keyed by slot name, with per-slot
    // anchor preset inferred from the matching baked element. Title
    // slots also get preferredLines from text length.
    const slotIntent: Record<string, any> = { ...(beat as any).slotIntent };
    const params = (beat as any).parameters ?? {};
    const slots: Array<{ name: string; role: string; source?: string }> = Array.isArray(def?.slots) ? def.slots : [];
    for (const slot of slots) {
      // Match by the slot's name first, else by slot.source which
      // often equals the location name in the legacy schema.
      const match = baked.find(b => b.name === slot.name)
        ?? baked.find(b => slot.source && b.name === slot.source);
      const anchor = match ? inferAnchor(match, stage) : null;
      const entry: Record<string, any> = { ...(slotIntent[slot.name] ?? {}) };
      if (anchor) {
        entry.anchor = { ...entry.anchor, h: anchor.h, v: anchor.v };
      }
      if (slot.role === 'title') {
        const textKey = slot.source ?? slot.name;
        const pl = inferPreferredLines(params?.[textKey]);
        if (pl != null && entry.preferredLines == null) entry.preferredLines = pl;
      }
      if (Object.keys(entry).length > 0) {
        slotIntent[slot.name] = entry;
      }
    }

    const next: any = { ...beat };
    next.locations = new Map();
    if (Object.keys(slotIntent).length > 0) {
      next.slotIntent = slotIntent;
    }

    summary.push({
      beatId: (beat as any).id,
      beatType: beat.type,
      beatName: (beat as any).name,
      detail: baked.length > 0
        ? `cleared ${baked.length} baked position${baked.length === 1 ? '' : 's'}, inferred slotIntent`
        : 'already empty — flag now consistent',
    });
    return next as Beat;
  });
  return { applied, summary };
}

/* -------- Responsive → Fixed ------------------------------------- */

/**
 * Schema-default location baking. The actual location generator lives
 * in SchemaLocationInitializer; the migrator imports lazily to avoid
 * a circular dependency with the UI side at load time.
 */
type DefaultLocationsGenerator = (
  beat: Beat,
  params: any,
  stage: { width: number; height: number }
) => Array<any>;

export function migrateResponsiveToFixed(
  beats: ReadonlyArray<Beat>,
  generateDefaultLocations: DefaultLocationsGenerator,
  projectWidth: number = 1024,
  projectHeight: number = 768
): MigrationResult {
  const summary: MigrationLine[] = [];
  const applied: Beat[] = beats.map(beat => {
    if (!VISIBLE_BEAT_TYPES.has(beat.type)) return beat;
    const existing = (beat as any).locations;
    const empty =
      !existing ||
      (existing instanceof Map && existing.size === 0) ||
      (Array.isArray(existing) && existing.length === 0);
    if (!empty) {
      // Author had baked positions already (truly fixed beat). Leave
      // it alone — no double-bake.
      return beat;
    }
    const params = (beat as any).parameters ?? {};
    let elements: any[] = [];
    try {
      elements = generateDefaultLocations(
        beat,
        params,
        { width: projectWidth || 1024, height: projectHeight || 768 }
      );
    } catch (err) {
      console.warn(`[layoutMigrator] generateDefaultLocations failed for ${beat.type}`, err);
      return beat;
    }
    if (!Array.isArray(elements) || elements.length === 0) return beat;
    const next: any = { ...beat };
    next.locations = new Map<string, any>();
    for (const el of elements) {
      if (el?.name) next.locations.set(el.name, el);
    }
    summary.push({
      beatId: (beat as any).id,
      beatType: beat.type,
      beatName: (beat as any).name,
      detail: `baked ${elements.length} schema-default position${elements.length === 1 ? '' : 's'}`,
    });
    return next as Beat;
  });
  return { applied, summary };
}
