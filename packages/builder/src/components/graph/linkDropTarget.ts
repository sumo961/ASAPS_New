/**
 * Which beat does a drawn link land on?
 *
 * A drop used to count only when the element directly under the pointer
 * belonged to a beat. The link's own line and the labels of other links lie
 * on top of beats, so a drop that looked on target read as "empty space" —
 * harmless while empty space did nothing, confusing once it opened the
 * "where does this link go?" menu (author report, 2026-11-28: "one now has
 * to be very careful to hit the target point exactly").
 *
 * Now: the beat whose box holds the point wins, whatever lies on top; and a
 * drop that only just misses a beat still lands on it (NEAR pixels on
 * screen). The beat the link starts from takes a drop only on its own box:
 * its handle sits on its edge, so every short drag ends "near" it.
 */

export interface BeatBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How close to a beat a drop still lands on it, in screen pixels. */
export const NEAR = 28;

/** A drag shorter than this never left the handle: not a link, not a question. */
export const MIN_DRAG = 12;

const inside = (b: BeatBox, x: number, y: number) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
const area = (b: BeatBox) => (b.right - b.left) * (b.bottom - b.top);
const distance = (b: BeatBox, x: number, y: number) =>
  Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

/**
 * The beat a link dropped at (x, y) lands on, or null over empty space.
 * `fromId` is the beat the link starts from.
 */
export function beatAtDrop(boxes: ReadonlyArray<BeatBox>, x: number, y: number, fromId: string | null, near = NEAR): string | null {
  // On a beat's box: the smallest one (a card inside an expanded dialog over
  // its frame — both are the same beat anyway).
  const on = boxes.filter((b) => inside(b, x, y)).sort((a, b) => area(a) - area(b));
  const onOther = on.find((b) => b.id !== fromId);
  if (onOther) return onOther.id;
  if (on.length > 0) return on[0].id; // on the beat it starts from
  // Just beside a beat: the nearest one, never the beat it starts from.
  let best: { id: string; d: number } | null = null;
  for (const b of boxes) {
    if (b.id === fromId) continue;
    const d = distance(b, x, y);
    if (d <= near && (!best || d < best.d)) best = { id: b.id, d };
  }
  return best ? best.id : null;
}

/** The beat a flowchart node stands for: a card inside an expanded Dialog Tree (dlg:<beat id>:<path>) is its beat. */
export const beatIdOfNode = (nodeId: string): string => (nodeId.startsWith('dlg:') ? nodeId.split(':')[1] : nodeId);

/** The boxes of the beats on screen now (cluster frames are not beats). */
export function beatBoxesOnScreen(isBeat: (id: string) => boolean, root: ParentNode = document): BeatBox[] {
  const out: BeatBox[] = [];
  root.querySelectorAll<HTMLElement>('.react-flow__node').forEach((el) => {
    const id = beatIdOfNode(el.getAttribute('data-id') ?? '');
    if (!id || !isBeat(id)) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return; // hidden in a collapsed cluster
    out.push({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return out;
}
