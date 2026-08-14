/**
 * Warning for a HUD stack too tall for the smallest screen the story will run on.
 *
 * Screen HUDs are drawn at a fixed pixel size — a meter frame with four
 * counters is ~174px whether it sits on a desktop or a phone. Stack two in one
 * corner and that is ~250px of chrome, which a tall viewport absorbs without
 * comment and a short one cannot: the runtime reserves space so nothing
 * overlaps, and past a point there is no room left for the beat itself.
 *
 * The runtime cannot fix that — it can only choose which thing to sacrifice —
 * so this belongs at authoring time, where adding the third frame is a
 * decision someone is making on purpose. It is a warning, never a block: a
 * story only ever played on a desktop is entitled to a tall HUD stack.
 *
 * Threshold: the reservation is capped at 40% of the stage height, so a stack
 * exceeding that on the smallest target is the point where content starts
 * being pushed under a HUD rather than clear of it.
 */
import type { HudRect } from '@asaps/renderer';

/**
 * Shortest viewport a story is realistically played on, in the orientation
 * where a top/bottom HUD band actually costs height.
 *
 * Phone *landscape* (360px) is shorter still, but a narrow corner HUD is
 * stepped around sideways there rather than reserved above, so it does not
 * bound the stack the same way. Portrait is the honest constraint.
 */
export const SMALLEST_TARGET_HEIGHT = 740;

/** Share of the viewport past which the runtime stops reserving and content overlaps. */
export const HUD_STACK_LIMIT = 0.4;

export interface HudStackWarning {
  corner: string;
  /** Vertical extent the stack occupies from its edge, in px. */
  extent: number;
  /** Extent as a share of the smallest target viewport height. */
  share: number;
  /** How many HUDs are stacked there. */
  count: number;
}

/**
 * Corners whose HUD stack would take more than the runtime is willing to
 * reserve on the smallest target.
 *
 * Extent is the stack's own span plus the edge margin — the distance from the
 * screen edge to the far side of the last box. Measuring the span rather than
 * summing heights keeps the gaps between stacked HUDs in the total, and works
 * from either edge without needing to know the stage height the layout was
 * built against.
 */
export function hudStackWarnings(
  rects: HudRect[] | null | undefined,
  smallestTargetHeight: number = SMALLEST_TARGET_HEIGHT,
  limit: number = HUD_STACK_LIMIT,
  edgeMargin = 12,
): HudStackWarning[] {
  if (!rects || rects.length === 0) return [];

  const byCorner = new Map<string, HudRect[]>();
  for (const r of rects) {
    const list = byCorner.get(r.corner) ?? [];
    list.push(r);
    byCorner.set(r.corner, list);
  }

  const out: HudStackWarning[] = [];
  for (const [corner, list] of byCorner) {
    // Centre-anchored HUDs (the countdown meter) span the width rather than
    // stacking in a corner, and are a single fixed-height bar — not the
    // accumulation this warns about.
    if (corner.endsWith('center')) continue;

    const top = Math.min(...list.map((r) => r.y));
    const bottom = Math.max(...list.map((r) => r.y + r.height));
    const extent = (bottom - top) + edgeMargin;

    const share = extent / smallestTargetHeight;
    if (share > limit) {
      out.push({ corner, extent: Math.round(extent), share, count: list.length });
    }
  }
  // Worst first — if an author fixes one, it should be the one that bites.
  return out.sort((a, z) => z.extent - a.extent);
}

/** Author-facing sentence for a warning. */
export function describeHudStackWarning(w: HudStackWarning, smallestTargetHeight = SMALLEST_TARGET_HEIGHT): string {
  const pct = Math.round(w.share * 100);
  const where = w.corner.replace('-', ' ');
  return `${w.count} HUDs stacked at ${where} take ${w.extent}px — ${pct}% of a ${smallestTargetHeight}px-tall phone screen. `
    + `Past 40% the story text has to run underneath them instead of below. `
    + `Move one to another corner, show fewer counters, or accept it if this story is not meant for phones.`;
}
