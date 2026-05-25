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

    // Capture each baked location with its rect (we need the rect later
    // for hotspot translation, not just the (x, y) used for slotIntent
    // anchor inference). `kind` distinguishes hotspots / buttons from
    // plain text elements so we know what to translate. We keep the
    // raw `record` for kinds we DON'T clear (characters, props) so we
    // can put them back on the next locations map with added percent
    // fields — they're free-positioned avatars, not slot content, and
    // wiping them would leave responsive beats without any character
    // sprites at all.
    type BakedLoc = {
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      kind?: string;
      record: any;
    };
    const baked: BakedLoc[] = [];
    const existingLocs: any = beat.locations;
    // DIAG-MIG-1 — input to migrator per beat. Helps confirm whether the
    // locations Map arrives at migration with all kinds (hotspot/dialog
    // etc) or already stripped, and whether the shape is Map vs Array.
    const _diagInputKind = existingLocs instanceof Map ? 'Map' : Array.isArray(existingLocs) ? 'Array' : typeof existingLocs;
    const _diagInputSize = existingLocs instanceof Map
      ? existingLocs.size
      : Array.isArray(existingLocs) ? existingLocs.length : 0;
    const _diagInputKinds: string[] = [];
    if (existingLocs instanceof Map) {
      existingLocs.forEach((v: any) => _diagInputKinds.push(`${v?.kind}:${v?.name}`));
    } else if (Array.isArray(existingLocs)) {
      existingLocs.forEach((v: any) => _diagInputKinds.push(`${v?.kind}:${v?.name}`));
    }
    console.log(`[migrator IN  ${(beat as any).id} ${beat.type}] locations shape=${_diagInputKind} size=${_diagInputSize}`, _diagInputKinds);
    if (existingLocs instanceof Map) {
      existingLocs.forEach((v: any, k: any) => {
        if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
          baked.push({
            name: String(k ?? v.name ?? ''),
            x: v.x,
            y: v.y,
            width: typeof v.width === 'number' ? v.width : 0,
            height: typeof v.height === 'number' ? v.height : 0,
            kind: v.kind,
            record: v,
          });
        }
      });
    } else if (Array.isArray(existingLocs)) {
      // DIAG-MIG-2 — Array fallback. The migrator was Map-only; if the
      // load path leaves locations as an Array, baked stayed empty and
      // every hotspot/animation-percent enrichment was silently skipped.
      existingLocs.forEach((v: any) => {
        if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
          baked.push({
            name: String(v.name ?? ''),
            x: v.x,
            y: v.y,
            width: typeof v.width === 'number' ? v.width : 0,
            height: typeof v.height === 'number' ? v.height : 0,
            kind: v.kind,
            record: v,
          });
        }
      });
    }
    console.log(`[migrator BAK ${(beat as any).id}] baked=${baked.length}`, baked.map(b => `${b.kind}:${b.name}(${b.x},${b.y},${b.width}x${b.height})`));

    // Build a slotIntent map keyed by slot name, with per-slot
    // anchor preset inferred from the matching baked element. Title
    // slots also get preferredLines from text length.
    const slotIntent: Record<string, any> = { ...(beat as any).slotIntent };
    // Beat instances store their params as discrete fields (this.choices,
    // this.question, this.animations, etc.); `beat.parameters` is not a
    // backing field — it's surfaced via `getParameters()`. Reading the
    // non-existent property silently returned `{}` and the entire
    // choice.hotspot / animation-percent enrichment path no-op'd.
    const baseParams: Record<string, any> =
      typeof (beat as any).getParameters === 'function'
        ? ((beat as any).getParameters() ?? {})
        : ((beat as any).parameters ?? {});
    const params: Record<string, any> = { ...baseParams };
    console.log(`[migrator PRM ${(beat as any).id}] params keys=${Object.keys(params).join(',')} choices.len=${params.choices?.length ?? '-'} anims.len=${params.animations?.length ?? '-'}`);
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

    // Animation translation. Two cases need handling:
    //
    //  (a) elementId matches a slot: write a SlotPath into
    //      beat.slotAnimations[slot].enter so the responsive
    //      SlotFlowView drives the slot wrapper through the waypoints.
    //  (b) elementId DOESN'T match a slot — it's a free-positioned
    //      element (a character sprite, a prop). For those we just
    //      enrich the existing AnimationPath waypoints with
    //      xPercent / yPercent so the engine can scale them against
    //      the current stage at runtime. The path itself stays under
    //      parameters.animations where the editor + engine already
    //      look for it; the percent fields make it layout-agnostic.
    //
    // Authored animations live under `beat.parameters.animations` in
    // the legacy editor; the previous migrator looked at the
    // (always-empty) `beat.animations` top-level field and silently
    // dropped every author-edited path.
    const slotAnimations: Record<string, any> = { ...((beat as any).slotAnimations ?? {}) };
    const legacyAnimations: any[] = Array.isArray(params?.animations)
      ? params.animations
      : Array.isArray((beat as any).animations) ? (beat as any).animations : [];
    let translatedAnims = 0;
    let enrichedPathAnims = 0;
    const enrichedParamAnimations: any[] = [];
    for (const anim of legacyAnimations) {
      const elementId = anim?.elementId;
      const waypoints = Array.isArray(anim?.waypoints) ? anim.waypoints : [];
      if (!elementId || waypoints.length === 0) {
        enrichedParamAnimations.push(anim);
        continue;
      }
      // Try to map elementId → slot. If found, translate to slotAnimations.
      const slot = slots.find(s => s.name === elementId)
        ?? slots.find(s => s.source === elementId);
      if (slot) {
        const slotWaypoints = waypoints.map((wp: any) => {
          const x = typeof wp?.x === 'number' ? wp.x : 0;
          const y = typeof wp?.y === 'number' ? wp.y : 0;
          return {
            anchor: { h: 'left', v: 'top' },
            dxPercent: (x / stage.w) * 100,
            dyPercent: (y / stage.h) * 100,
            easing: typeof wp?.easing === 'string' ? wp.easing : undefined,
          };
        });
        const entry = { ...(slotAnimations[slot.name] ?? {}) };
        entry.enter = {
          preset: 'path',
          duration: typeof anim?.duration === 'number' ? anim.duration : 1000,
          easing: typeof anim?.easing === 'string' ? anim.easing : undefined,
          path: {
            type: anim?.type === 'bezier' ? 'bezier' : 'linear',
            loop: !!anim?.loop,
            waypoints: slotWaypoints,
          },
        };
        slotAnimations[slot.name] = entry;
        translatedAnims++;
        // Slot-translated animations are also kept on parameters.animations
        // (enriched with percent) so a future round-trip through the
        // editor can still find them in their canonical form.
      }

      // Always enrich the waypoint pixel coords with percent so the
      // responsive AnimationEngine can scale them against any stage.
      const enrichedWaypoints = waypoints.map((wp: any) => {
        const x = typeof wp?.x === 'number' ? wp.x : 0;
        const y = typeof wp?.y === 'number' ? wp.y : 0;
        const next: any = {
          ...wp,
          xPercent: (x / stage.w) * 100,
          yPercent: (y / stage.h) * 100,
        };
        // Bezier control points also get percent siblings so curves
        // bend the same way at any viewport.
        if (wp.controlPoint1 && typeof wp.controlPoint1.x === 'number') {
          next.controlPoint1 = {
            ...wp.controlPoint1,
            xPercent: (wp.controlPoint1.x / stage.w) * 100,
            yPercent: (wp.controlPoint1.y / stage.h) * 100,
          };
        }
        if (wp.controlPoint2 && typeof wp.controlPoint2.x === 'number') {
          next.controlPoint2 = {
            ...wp.controlPoint2,
            xPercent: (wp.controlPoint2.x / stage.w) * 100,
            yPercent: (wp.controlPoint2.y / stage.h) * 100,
          };
        }
        return next;
      });
      enrichedParamAnimations.push({ ...anim, waypoints: enrichedWaypoints });
      enrichedPathAnims++;
    }

    // Pixel-rect hotspots on baked locations → normalized 0..1 on the
    // spatial image rect (approximated as the stage rect; close enough
    // when the spatial image is aspect-matched to the project canvas).
    // For each choice (movementChoice / dialogTree / pickProp) that
    // references a hotspot location by `locationName`, copy the rect
    // onto `choice.hotspot` as { x, y, width, height } in 0..1.
    let translatedHotspots = 0;
    const nextParams: any = { ...params };
    // Find the hotspot location for a choice, mirroring the fallback
    // chain fixed-mode renders use: explicit `locationName` first, then
    // `location` (legacy), then by matching `choice.text` against
    // `location.name` (the implicit convention an author falls into
    // when they don't wire locationName explicitly). Returns the
    // baked location, or undefined when none match.
    const findChoiceHotspotLoc = (c: any): BakedLoc | undefined => {
      const explicit = c?.locationName ?? c?.location;
      if (explicit) {
        const found = baked.find(b => b.name === explicit);
        if (found) return found;
      }
      if (typeof c?.text === 'string') {
        return baked.find(b => b.name === c.text && b.kind === 'hotspot');
      }
      return undefined;
    };
    const transferHotspots = (key: 'choices' | 'props') => {
      const arr = Array.isArray(params?.[key]) ? params[key] : null;
      if (!arr) return;
      const nextArr = arr.map((c: any) => {
        if (c?.hotspot) {
          console.log(`[migrator HTSPT ${(beat as any).id} ${key}] choice "${c?.text}" already has hotspot → preserve`);
          return c;
        }
        const loc = findChoiceHotspotLoc(c);
        console.log(`[migrator HTSPT ${(beat as any).id} ${key}] choice "${c?.text}" locName="${c?.locationName ?? c?.location ?? '<none>'}" → loc=${loc ? `${loc.kind}:${loc.name}(${loc.x},${loc.y},${loc.width}x${loc.height})` : 'NO MATCH'}`);
        if (!loc || !loc.width || !loc.height) return c;
        translatedHotspots++;
        return {
          ...c,
          hotspot: {
            x: loc.x / stage.w,
            y: loc.y / stage.h,
            width: loc.width / stage.w,
            height: loc.height / stage.h,
            // Preserve the authored shape (rect / ellipse) when set on
            // the location; defaults to rect when omitted.
            ...(loc.record?.shape ? { shape: loc.record.shape } : {}),
          },
        };
      });
      nextParams[key] = nextArr;
    };
    transferHotspots('choices');
    transferHotspots('props');
    // dialogTree choices live one level deeper, under parameters.dialogTree.choices
    if (params?.dialogTree?.choices && Array.isArray(params.dialogTree.choices)) {
      const nextDialogChoices = params.dialogTree.choices.map((c: any) => {
        if (c?.hotspot) return c;
        const loc = findChoiceHotspotLoc(c);
        if (!loc || !loc.width || !loc.height) return c;
        translatedHotspots++;
        return {
          ...c,
          hotspot: {
            x: loc.x / stage.w,
            y: loc.y / stage.h,
            width: loc.width / stage.w,
            height: loc.height / stage.h,
            ...(loc.record?.shape ? { shape: loc.record.shape } : {}),
          },
        };
      });
      nextParams.dialogTree = { ...params.dialogTree, choices: nextDialogChoices };
    }

    // Write the enriched animations back to parameters so the
    // responsive AnimationEngine + a future editor can find them in
    // the canonical place (with percent siblings).
    if (enrichedParamAnimations.length > 0) {
      nextParams.animations = enrichedParamAnimations;
    }

    // Preserve free-positioned avatar / prop locations across the
    // migration — they have no slot equivalent, so wiping them would
    // delete every character sprite on the beat. We DO add xPercent /
    // yPercent fields so their position scales with the stage in
    // responsive mode. Slot-equivalent kinds (text, button, dialog,
    // hotspot used purely as click target, etc.) are still cleared so
    // the responsive layout owns positioning for them.
    const PRESERVED_KINDS = new Set(['character', 'prop']);
    const preservedLocs = new Map<string, any>();
    let preservedCount = 0;
    for (const loc of baked) {
      if (!PRESERVED_KINDS.has(loc.kind ?? '')) continue;
      const enriched = {
        ...loc.record,
        xPercent: (loc.x / stage.w) * 100,
        yPercent: (loc.y / stage.h) * 100,
        widthPercent: loc.width ? (loc.width / stage.w) * 100 : undefined,
        heightPercent: loc.height ? (loc.height / stage.h) * 100 : undefined,
      };
      preservedLocs.set(loc.name, enriched);
      preservedCount++;
    }

    const next: any = { ...beat, parameters: nextParams };
    next.locations = preservedLocs;
    console.log(`[migrator OUT ${(beat as any).id}] kept=${preservedCount} hotspots=${translatedHotspots} animsWp0Pct=${typeof nextParams?.animations?.[0]?.waypoints?.[0]?.xPercent === 'number'} choicesWithHotspot=${(nextParams?.choices ?? []).filter((c: any) => !!c.hotspot).length}`);
    if (Object.keys(slotIntent).length > 0) {
      next.slotIntent = slotIntent;
    }
    if (Object.keys(slotAnimations).length > 0) {
      next.slotAnimations = slotAnimations;
    }

    const clearedCount = baked.length - preservedCount;
    const parts: string[] = [];
    if (clearedCount > 0) {
      parts.push(`cleared ${clearedCount} baked position${clearedCount === 1 ? '' : 's'}, inferred slotIntent`);
    } else if (baked.length === 0) {
      parts.push('already empty — flag now consistent');
    } else {
      parts.push('flag now consistent');
    }
    if (preservedCount > 0) {
      parts.push(`kept ${preservedCount} character/prop location${preservedCount === 1 ? '' : 's'} with percent fields`);
    }
    if (translatedAnims > 0) {
      parts.push(`translated ${translatedAnims} slot path animation${translatedAnims === 1 ? '' : 's'}`);
    }
    if (enrichedPathAnims > 0) {
      parts.push(`enriched ${enrichedPathAnims} character path animation${enrichedPathAnims === 1 ? '' : 's'}`);
    }
    if (translatedHotspots > 0) {
      parts.push(`normalized ${translatedHotspots} hotspot${translatedHotspots === 1 ? '' : 's'}`);
    }
    summary.push({
      beatId: (beat as any).id,
      beatType: beat.type,
      beatName: (beat as any).name,
      detail: parts.join(', '),
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
