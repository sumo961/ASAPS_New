/**
 * hudLayout — the single layout authority for screen-docked HUDs.
 *
 * Every screen-docked HUD (timer, countdown meter, character meter frame,
 * inventory frame, mood token/disc) is a box anchored to one of six screen
 * corners. Historically three separate systems positioned these and none
 * knew about the others, so HUDs of different kinds collided in a shared
 * corner (e.g. a top-right timer under a top-right mood token).
 *
 * This module stacks every HUD assigned to the same corner so they never
 * overlap: top corners grow downward from the top margin, bottom corners
 * grow upward from the bottom. Global HUDs (timer, countdown) sit closest
 * to the edge; character frames stack after them. The exact same function
 * drives the runtime overlay AND the character-manager preview, so what an
 * author sees while configuring is what plays.
 */

export type HudCorner =
  | 'top-left' | 'top-right' | 'top-center'
  | 'bottom-left' | 'bottom-right' | 'bottom-center';

export type HudKind = 'timer' | 'countdown' | 'meter' | 'inventory' | 'mood';

export interface HudBox {
  id: string;
  corner: HudCorner;
  /** Estimated on-stage width in px (for the preview + horizontal placement). */
  width: number;
  /** Estimated on-stage height in px (drives vertical stacking). */
  height: number;
  kind: HudKind;
}

export interface HudPlacement {
  id: string;
  corner: HudCorner;
  /** Stacking offset from the corner's base position (0 for the first box).
   *  Positive Y = downward (top corners); components read this as config.offset.y. */
  offsetY: number;
  /** Absolute top-left the preview renders at (runtime uses offsetY on the
   *  component's own corner anchoring instead). */
  left: number;
  top: number;
}

// Global time/counter readouts sit at the very edge; character frames after.
const KIND_ORDER: Record<HudKind, number> = {
  timer: 0, countdown: 1, meter: 2, inventory: 3, mood: 4,
};

/** Vertical band of a corner. */
function isTop(corner: HudCorner): boolean {
  return corner.startsWith('top');
}

/** Horizontal anchor x of a corner-aligned box of the given width. */
function anchorLeft(corner: HudCorner, width: number, stageWidth: number, margin: number): number {
  if (corner.endsWith('left')) return margin;
  if (corner.endsWith('right')) return Math.max(margin, stageWidth - margin - width);
  return Math.round((stageWidth - width) / 2); // center
}

/**
 * Stack screen HUDs per corner so nothing overlaps.
 *
 * @param boxes  every screen-docked HUD to place
 * @param stage  the stage pixel dimensions the HUDs anchor to
 * @param margin edge margin (px)
 * @param gap    gap between stacked boxes (px)
 */
export function layoutScreenHuds(
  boxes: HudBox[],
  stage: { width: number; height: number },
  margin = 12,
  gap = 8,
): HudPlacement[] {
  const byCorner = new Map<HudCorner, HudBox[]>();
  for (const b of boxes) {
    const list = byCorner.get(b.corner) ?? [];
    list.push(b);
    byCorner.set(b.corner, list);
  }

  const placements: HudPlacement[] = [];
  for (const [corner, list] of byCorner) {
    // Stable order: kind priority, then original order for ties.
    const ordered = list
      .map((b, i) => ({ b, i }))
      .sort((a, z) => (KIND_ORDER[a.b.kind] - KIND_ORDER[z.b.kind]) || (a.i - z.i))
      .map((x) => x.b);

    let cum = 0; // cumulative height consumed from the corner edge
    const top = isTop(corner);
    for (const box of ordered) {
      const offsetY = cum === 0 ? 0 : (top ? cum : -cum);
      const left = anchorLeft(corner, box.width, stage.width, margin);
      const absTop = top
        ? margin + cum
        : stage.height - margin - box.height - cum;
      placements.push({ id: box.id, corner, offsetY, left, top: absTop });
      cum += box.height + gap;
    }
  }
  return placements;
}

/** Placement lookup by id (convenience for callers). */
export function placementMap(placements: HudPlacement[]): Map<string, HudPlacement> {
  const m = new Map<string, HudPlacement>();
  for (const p of placements) m.set(p.id, p);
  return m;
}
