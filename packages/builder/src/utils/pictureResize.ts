/**
 * Resizing a picture (prop, character) on the Visual Editor's stage.
 *
 * Dragging a corner scales the picture and keeps its proportions; with
 * Option/Alt held, the box crops it instead: the edge moves over a picture
 * that stays where it is. Before 2026-10-31 every drag cropped (the picture
 * kept its natural size inside the box), which surprised authors.
 *
 * The picture's place inside its box is `imageFrame`, in fractions of the
 * box, so a cropped picture keeps its crop when it is scaled later and on
 * stages of any size.
 */

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export interface Rect { x: number; y: number; w: number; h: number }
export interface PictureFit {
  imageFit?: 'scale' | 'crop';
  imageFrame?: Rect;
}
export interface PictureElement extends PictureFit {
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const isFull = (f: Rect): boolean =>
  Math.abs(f.x) < 1e-4 && Math.abs(f.y) < 1e-4 && Math.abs(f.w - 1) < 1e-4 && Math.abs(f.h - 1) < 1e-4;

/** The renderer draws a picture with no imageFit at its natural size when it has a size % or ASML's default box. */
export function drawnAtNaturalSize(el: PictureElement): boolean {
  if (el.imageFit) return false;
  const defaultBox = (el.width === 100 && el.height === 100) || (el.width === 128 && el.height === 128);
  return el.size !== undefined || defaultBox;
}

/**
 * Where the picture is now, as a box and the picture's frame in it, exactly
 * as the renderer draws it, so the first drag doesn't make it jump.
 */
export function pictureStart(el: PictureElement, natural: { w: number; h: number }): { box: Rect; frame: Rect } {
  if (el.imageFit === 'crop' && el.imageFrame) {
    return { box: { x: el.x, y: el.y, w: el.width, h: el.height }, frame: el.imageFrame };
  }
  if (el.imageFit === 'scale') {
    return { box: { x: el.x, y: el.y, w: el.width, h: el.height }, frame: FULL };
  }
  if (drawnAtNaturalSize(el)) {
    // Natural size times size %, from the top-left corner.
    const s = (el.size ?? 100) / 100;
    return { box: { x: el.x, y: el.y, w: natural.w * s, h: natural.h * s }, frame: FULL };
  }
  // Natural size, centred in the box and cut off by it.
  const w = el.width || natural.w;
  const h = el.height || natural.h;
  return {
    box: { x: el.x, y: el.y, w, h },
    frame: { x: (w - natural.w) / 2 / w, y: (h - natural.h) / 2 / h, w: natural.w / w, h: natural.h / h },
  };
}

/** The new box for a corner drag, with the opposite corner fixed. */
function cornerBox(box: Rect, corner: Corner, dx: number, dy: number, min: number): Rect {
  const growX = corner === 'ne' || corner === 'se' ? dx : -dx;
  const growY = corner === 'sw' || corner === 'se' ? dy : -dy;
  const w = Math.max(min, box.w + growX);
  const h = Math.max(min, box.h + growY);
  return {
    x: corner === 'nw' || corner === 'sw' ? box.x + box.w - w : box.x,
    y: corner === 'nw' || corner === 'ne' ? box.y + box.h - h : box.y,
    w,
    h,
  };
}

/**
 * The element's new box and fit for a drag of `dx`, `dy` (stage pixels) from
 * the start. `crop` is the modifier key. The size % is folded into the box.
 */
export function resizePicture(
  start: { box: Rect; frame: Rect },
  corner: Corner,
  dx: number,
  dy: number,
  crop: boolean,
  min = 20,
): { x: number; y: number; width: number; height: number; size: undefined } & PictureFit {
  const { box, frame } = start;
  if (crop) {
    const next = cornerBox(box, corner, dx, dy, min);
    // The picture stays put on the stage: re-express it in the new box.
    const px = box.x + frame.x * box.w;
    const py = box.y + frame.y * box.h;
    const pw = frame.w * box.w;
    const ph = frame.h * box.h;
    const f = { x: (px - next.x) / next.w, y: (py - next.y) / next.h, w: pw / next.w, h: ph / next.h };
    return { x: next.x, y: next.y, width: next.w, height: next.h, size: undefined, imageFit: 'crop', imageFrame: f };
  }
  // Scale: follow the axis dragged further, keep the proportions.
  const free = cornerBox(box, corner, dx, dy, 0);
  let k = Math.abs(free.w / box.w - 1) >= Math.abs(free.h / box.h - 1) ? free.w / box.w : free.h / box.h;
  k = Math.max(k, min / Math.min(box.w, box.h));
  const w = box.w * k;
  const h = box.h * k;
  const x = corner === 'nw' || corner === 'sw' ? box.x + box.w - w : box.x;
  const y = corner === 'nw' || corner === 'ne' ? box.y + box.h - h : box.y;
  return isFull(frame)
    ? { x, y, width: w, height: h, size: undefined, imageFit: 'scale', imageFrame: undefined }
    : { x, y, width: w, height: h, size: undefined, imageFit: 'crop', imageFrame: frame };
}
