/**
 * Speech bubbles (Speaker Display ▸ "Show lines as: speech bubbles"): a
 * speaking character's line is drawn as a comic bubble next to them, its
 * tail pointing at where they speak from, instead of in the text box.
 *
 * This file is the geometry, kept free of the DOM so it can be tested: where
 * a character speaks from, how big the bubble is around its text, where it
 * goes on the stage, and the outline (oval plus tail) as one SVG path.
 * SpeechBubbleLayer measures the stage and draws it.
 */
import { showsSpeaker, type StageCharacterLike } from './speakerDimming';

export interface BubbleRect { x: number; y: number; width: number; height: number }
export interface BubblePoint { x: number; y: number }

/** Where on its picture a placed character speaks from, as fractions of its box (0–1). */
export interface SpeakFrom { x: number; y: number }

/** Without a point set by the author: the middle of the picture, near its top — usually the face. */
export const DEFAULT_SPEAK_FROM: SpeakFrom = { x: 0.5, y: 0.15 };

/**
 * The point on the stage the tail aims at. A character drawn mirrored speaks
 * from the mirrored point, so a point set on the picture stays on the mouth.
 */
export function speakPoint(rect: BubbleRect, speakFrom?: SpeakFrom | null, flipX?: boolean): BubblePoint {
  const f = speakFrom && Number.isFinite(speakFrom.x) && Number.isFinite(speakFrom.y) ? speakFrom : DEFAULT_SPEAK_FROM;
  const fx = Math.min(1, Math.max(0, flipX ? 1 - f.x : f.x));
  const fy = Math.min(1, Math.max(0, f.y));
  return { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy };
}

/**
 * Where the head is on a cut-out picture, found from its see-through pixels,
 * as fractions of the picture: the middle of the topmost part of the figure,
 * down to about the eyes. Used when the author hasn't set a point: the top
 * middle of the picture's box often misses the head (a figure drawn
 * off-centre, a hat brim), and the bubble then covers the face.
 *
 * `alpha` is one value (0–255) per pixel, row by row, of a picture scaled to
 * w × h. Returns null for a picture with no see-through background (a photo)
 * or nothing drawn, where the plain default is as good a guess. `r` is half
 * the head's width, as a share of the picture's width.
 */
export function headPointFromAlpha(alpha: ArrayLike<number>, w: number, h: number): (SpeakFrom & { r: number }) | null {
  if (!(w > 0 && h > 0) || alpha.length < w * h) return null;
  const OPAQUE = 128;
  const rowLeft = new Array<number>(h).fill(-1);
  const rowRight = new Array<number>(h).fill(-1);
  const rowCount = new Array<number>(h).fill(0);
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] < OPAQUE) continue;
      opaque++;
      rowCount[y]++;
      if (rowLeft[y] < 0) rowLeft[y] = x;
      rowRight[y] = x;
    }
  }
  if (opaque > w * h * 0.97 || opaque === 0) return null;
  const minCount = Math.max(1, Math.round(w * 0.01));
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    if (rowCount[y] < minCount) continue;
    if (top < 0) top = y;
    bottom = y;
  }
  if (top < 0) return null;
  const figure = bottom - top + 1;
  if (figure < 4) return null;
  // The head: the rows at the top of the figure. Its middle is the middle of
  // what is drawn there, its size the widest of those rows.
  const band = Math.max(1, Math.round(figure * 0.1));
  let sumX = 0;
  let n = 0;
  let headWidth = 0;
  for (let y = top; y < top + band && y <= bottom; y++) {
    if (rowCount[y] < minCount) continue;
    for (let x = rowLeft[y]; x <= rowRight[y]; x++) {
      if (alpha[y * w + x] >= OPAQUE) { sumX += x; n++; }
    }
    headWidth = Math.max(headWidth, rowRight[y] - rowLeft[y] + 1);
  }
  if (n === 0) return null;
  const cx = sumX / n + 0.5;
  // About the eyes: half a head down from its top, never below a third of the figure.
  const cy = top + Math.min(headWidth * 0.55, figure * 0.33);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  // r: half the head's width, as a share of the picture's width.
  return { x: round(cx / w), y: round(cy / h), r: round(headWidth / 2 / w) };
}

/**
 * The part of an <img> box its picture is drawn in, for object-fit contain,
 * scale-down and cover (centred); the whole box otherwise.
 */
export function drawnPictureRect(box: BubbleRect, natural: { width: number; height: number }, fit: string | undefined): BubbleRect {
  if (!(natural.width > 0 && natural.height > 0 && box.width > 0 && box.height > 0)) return box;
  const sx = box.width / natural.width;
  const sy = box.height / natural.height;
  let s: number;
  if (fit === 'contain') s = Math.min(sx, sy);
  else if (fit === 'scale-down') s = Math.min(1, sx, sy);
  else if (fit === 'cover') s = Math.max(sx, sy);
  else return box;
  const width = natural.width * s;
  const height = natural.height * s;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/** The narrowest and widest an author can make a bubble's text, as shares of the stage's width. */
export const BUBBLE_TEXT_SHARE_MIN = 0.1;
export const BUBBLE_TEXT_SHARE_MAX = 0.6;

const clampShare = (share: number) => Math.min(BUBBLE_TEXT_SHARE_MAX, Math.max(BUBBLE_TEXT_SHARE_MIN, share));

/**
 * The widest a bubble's text runs before wrapping, for a stage this wide.
 * `share` is the author's own width for the beat (BeatLook.speechBubbleWidth).
 */
export function bubbleTextMaxWidth(stageWidth: number, share?: number | null): number {
  if (typeof share === 'number' && Number.isFinite(share) && share > 0) return Math.round(stageWidth * clampShare(share));
  // About a quarter of the stage: a line of any length wraps into a rounder
  // bubble, as in comics, instead of a long flat oval.
  return Math.round(Math.min(300, Math.max(140, stageWidth * 0.26)));
}

/**
 * The oval around a block of text (its measured width and height). The text
 * sits in the oval's middle with room to spare at its corners; `stroke` is
 * the outline's width, drawn inside the returned size.
 */
export function bubbleSize(textWidth: number, textHeight: number, fontPx: number, stroke = 2): {
  width: number; height: number; rx: number; ry: number;
} {
  const padX = Math.max(10, fontPx * 0.7);
  const padY = Math.max(6, fontPx * 0.45);
  const rx = (textWidth / 2 + padX) * 1.2;
  const ry = (textHeight / 2 + padY) * 1.3;
  return { width: Math.ceil(2 * rx + stroke), height: Math.ceil(2 * ry + stroke), rx, ry };
}

/** Something on the stage a bubble should keep clear of; heavier weighs more. */
/** How far below the reply bubble its tail reaches when the player isn't on the stage. */
export const OFFSTAGE_TAIL = 22;

/**
 * Where the player's reply bubble goes when their character is not on the
 * stage: the story is told from the player's own eyes, so the replies come
 * from this side of the screen. The bubble sits along the bottom of the
 * stage with its tail pointing down and out of the picture, where it is
 * least in the way: clear of the line being answered and of the panels,
 * over other characters only if it must be.
 *
 * Null when the bubble is too big to be one (the buttons stay).
 */
export function placeOffstageBubble(opts: {
  stage: { width: number; height: number };
  size: { width: number; height: number };
  obstacles?: BubbleObstacle[];
  margin?: number;
}): BubblePlacement | null {
  const { stage, size, obstacles = [] } = opts;
  const margin = opts.margin ?? 8;
  const w = size.width;
  const h = size.height;
  if (!(w > 0 && h > 0)) return null;
  if (w > stage.width - 2 * margin || h + OFFSTAGE_TAIL > stage.height * 0.6) return null;

  const y = stage.height - margin - OFFSTAGE_TAIL - h;
  const room = stage.width - 2 * margin - w;
  // Along the bottom, the middle first: that is where "this side of the screen" reads best.
  const places = [0.5, 0.35, 0.65, 0.2, 0.8, 0, 1];
  let best: { rect: BubbleRect; score: number } | null = null;
  places.forEach((at, order) => {
    const rect = { x: margin + room * at, y, width: w, height: h };
    let score = order * 4; // a small pull towards the middle
    for (const o of obstacles) score += (overlap(rect, o.rect) / (w * h)) * 1000 * o.weight;
    if (!best || score < best.score) best = { rect, score };
  });
  const rect = best!.rect;
  return { rect, tip: { x: rect.x + rect.width / 2, y: rect.y + rect.height + OFFSTAGE_TAIL } };
}

/**
 * `bubbleSize` backwards: the text share (BeatLook.speechBubbleWidth) that
 * makes a bubble `bubbleWidth` wide on this stage. For the Visual Editor's
 * resize handles. A thought's cloud is wider than its oval by its bumps.
 */
export function bubbleTextShareFor(bubbleWidth: number, stageWidth: number, fontPx: number, stroke = 2, thought = false): number {
  const padX = Math.max(10, fontPx * 0.7);
  const oval = bubbleWidth - (thought ? 2 * THOUGHT_BUMP : 0);
  const textWidth = (oval - stroke) / 1.2 - 2 * padX;
  return clampShare(stageWidth > 0 ? textWidth / stageWidth : BUBBLE_TEXT_SHARE_MIN);
}

export interface BubbleObstacle { rect: BubbleRect; weight: number }

/** Buttons, HUDs and visible text: a bubble that covers them much is not placed at all. */
export const HEAVY = 3;
/** How near the rim of a bubble's oval a button or panel may come (1 = the rim): closer in, the bubble is on it. */
export const OVAL_CLEAR = 0.92;
/** Other characters on the stage: better not covered, but allowed. */
export const LIGHT = 0.6;
/** How much of a character's picture, from the top, is taken to be their head. */
const HEAD_SHARE = 0.28;

export interface BubblePlacement {
  /** The bubble's box on the stage. */
  rect: BubbleRect;
  /** Where the tail ends, on the stage. */
  tip: BubblePoint;
}

function overlap(a: BubbleRect, b: BubbleRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Distance from the oval's centre to its edge in the direction (dx, dy). */
function ovalRadius(rx: number, ry: number, dx: number, dy: number): number {
  const len = Math.hypot(dx, dy) || 1;
  const c = dx / len;
  const s = dy / len;
  return 1 / Math.sqrt((c / rx) ** 2 + (s / ry) ** 2);
}

/** How far from the middle of a box (half-sizes rx, ry) its edge is, in the direction (dx, dy). */
function boxRadius(rx: number, ry: number, dx: number, dy: number): number {
  const len = Math.hypot(dx, dy) || 1;
  const c = Math.abs(dx / len);
  const s = Math.abs(dy / len);
  return Math.min(c > 1e-6 ? rx / c : Infinity, s > 1e-6 ? ry / s : Infinity);
}

/** The narrowest and widest an author can make the reply bubble's text, as shares of the stage's width. */
export const REPLY_TEXT_SHARE_MIN = 0.12;
export const REPLY_TEXT_SHARE_MAX = 0.7;

const clampReplyShare = (share: number) => Math.min(REPLY_TEXT_SHARE_MAX, Math.max(REPLY_TEXT_SHARE_MIN, share));

/** The widest the reply bubble's lines run before wrapping; `share` is the beat's own width (BeatLook.replyBubbleWidth). */
export function replyTextMaxWidth(stageWidth: number, share?: number | null): number {
  if (typeof share === 'number' && Number.isFinite(share) && share > 0) return Math.round(stageWidth * clampReplyShare(share));
  return Math.round(Math.min(380, Math.max(160, stageWidth * 0.34)));
}

/** `replyBubbleSize` backwards: the share that makes the reply bubble `bubbleWidth` wide. For the Visual Editor's handles. */
export function replyTextShareFor(bubbleWidth: number, stageWidth: number, fontPx: number, stroke = 2): number {
  const padX = Math.max(12, fontPx * 0.8);
  return clampReplyShare(stageWidth > 0 ? (bubbleWidth - stroke - 2 * padX) / stageWidth : REPLY_TEXT_SHARE_MIN);
}

/**
 * The box around a list of the player's replies (its measured width and
 * height): a rounded box rather than an oval, since a list of lines fills a
 * box and would leave an oval's corners empty.
 */
export function replyBubbleSize(textWidth: number, textHeight: number, fontPx: number, stroke = 2): { width: number; height: number } {
  const padX = Math.max(12, fontPx * 0.8);
  const padY = Math.max(8, fontPx * 0.5);
  return { width: Math.ceil(textWidth + 2 * padX + stroke), height: Math.ceil(textHeight + 2 * padY + stroke) };
}

/**
 * Where the bubble goes: above the speaker, leaning away from the middle of
 * the stage (so two speakers' bubbles don't meet in the middle), or beside
 * them when there is no room above. It stays on the stage, keeps clear of
 * buttons and HUDs, never covers the point it points at, and prefers a tail
 * of a comfortable length.
 *
 * Returns null when the bubble doesn't fit: the line is then shown in the
 * text box, as without bubbles (small phone screens, a crowded stage).
 */
export function placeSpeechBubble(opts: {
  stage: { width: number; height: number };
  size: { width: number; height: number };
  mouth: BubblePoint;
  speaker?: BubbleRect;
  obstacles?: BubbleObstacle[];
  margin?: number;
  /**
   * How far short of the point the tail stops: for a point found in the
   * middle of the face, about the head's half-width, so the tail ends at
   * the head instead of across the face.
   */
  stopShort?: number;
  /** 'box': a rounded box (the player's replies), whose edge reaches further at the corners than an oval's. */
  shape?: 'oval' | 'box';
}): BubblePlacement | null {
  const { stage, size, mouth, speaker, obstacles = [] } = opts;
  const edgeAt = opts.shape === 'box' ? boxRadius : ovalRadius;
  const stopShort = Math.max(0, opts.stopShort ?? 0);
  const margin = opts.margin ?? 8;
  const w = size.width;
  const h = size.height;
  if (!(w > 0 && h > 0)) return null;
  // A bubble wider than nearly the whole stage, or taller than half of it,
  // is no longer a bubble next to someone: keep the text box.
  if (w > stage.width * 0.9 || w > stage.width - 2 * margin || h > stage.height * 0.5) return null;
  // A speaker whose head is off the stage (a narrow phone screen cuts them
  // off) has nothing to point at: keep the text box.
  if (mouth.x < 0 || mouth.y < 0 || mouth.x > stage.width || mouth.y > stage.height) return null;

  const rx = w / 2;
  const ry = h / 2;
  const tail = Math.min(64, Math.max(24, stage.height * 0.06));
  const towardMiddle = Math.sign(stage.width / 2 - mouth.x) || 1;

  // The speaker's face, around the point the tail aims at: above it when
  // the author pinned the mouth, below it with the default point at the top
  // of the head — so both. A bubble over it hides who is talking.
  const face: BubbleRect | null = speaker ? (() => {
    const fw = Math.max(40, speaker.width * 0.35);
    const fh = Math.max(40, speaker.height * 0.18);
    return { x: mouth.x - fw / 2, y: mouth.y - fh * 0.8, width: fw, height: fh * 2 };
  })() : null;

  /** `moves`: how often this place was moved clear of something (twice at most: off a panel, then off a face). */
  type Candidate = { cx: number; cy: number; below?: boolean; moves?: number };
  const candidates: Candidate[] = [];
  for (const lift of [tail, tail * 1.8]) {
    for (const k of [-0.6, -0.35, 0, 0.35, 0.6]) {
      candidates.push({ cx: mouth.x + k * w, cy: mouth.y - lift - ry });
    }
  }
  for (const side of [-1, 1]) {
    for (const dy of [-0.35, 0.1]) {
      candidates.push({ cx: mouth.x + side * (rx + tail), cy: mouth.y + dy * h });
    }
  }
  for (const k of [-0.35, 0, 0.35]) {
    candidates.push({ cx: mouth.x + k * w, cy: mouth.y + tail + ry, below: true });
  }
  // Clear of the face: above it, or level with it at its sides (a longer
  // tail, where a close-up leaves no room nearer).
  if (face) {
    for (const k of [-0.35, 0, 0.35]) candidates.push({ cx: mouth.x + k * w, cy: face.y - margin - ry });
    for (const x of [face.x - margin - rx, face.x + face.width + margin + rx]) candidates.push({ cx: x, cy: face.y + ry });
  }

  // Does the oval itself reach into something the player needs to see or
  // press (a button, a panel)? Its box may: an oval leaves its corners free.
  // A few pixels at the rim don't count. A box (the player's replies)
  // reaches as far as its box.
  const reachesInto = (cx: number, cy: number, o: BubbleRect): boolean => {
    if (opts.shape === 'box') {
      const rim = 6;
      return overlap({ x: cx - rx + rim, y: cy - ry + rim, width: Math.max(0, w - 2 * rim), height: Math.max(0, h - 2 * rim) }, o) > 0;
    }
    const px = Math.min(o.x + o.width, Math.max(o.x, cx));
    const py = Math.min(o.y + o.height, Math.max(o.y, cy));
    return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < OVAL_CLEAR * OVAL_CLEAR;
  };

  let best: { score: number; rect: BubbleRect; heavy: number; into: boolean } | null = null;
  // The list grows while it is walked: a place that sits on a button or a
  // panel is tried again moved just clear of it, to each side.
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const wantX = c.cx - rx;
    const wantY = c.cy - ry;
    const x = Math.min(stage.width - margin - w, Math.max(margin, wantX));
    const y = Math.min(stage.height - margin - h, Math.max(margin, wantY));
    const rect = { x, y, width: w, height: h };
    const cx = x + rx;
    const cy = y + ry;
    const area = w * h;

    let score = Math.hypot(x - wantX, y - wantY) * 1.5;
    // The tail needs room: the bubble must not sit on the point itself.
    const reach = Math.hypot(mouth.x - cx, mouth.y - cy) - edgeAt(rx, ry, mouth.x - cx, mouth.y - cy);
    // On the point itself is no place at all. Nearer than the tail would
    // like (it stops short of a face found in the picture) is a poor one,
    // but better than sitting on a button or a panel.
    if (reach < 8) score += 10000;
    else if (reach - stopShort < 8) score += 200;
    score += Math.abs(reach - stopShort - tail);
    let heavy = 0;
    let into = false;
    for (const o of obstacles) {
      const share = overlap(rect, o.rect) / area;
      score += share * o.weight * 1000;
      if (o.weight < HEAVY && share > 0) {
        // Another character: over their body is a pity, over their face is
        // worse (the top of their picture, where a head is).
        const head = { x: o.rect.x, y: o.rect.y, width: o.rect.width, height: o.rect.height * HEAD_SHARE };
        const onHead = overlap(rect, head);
        score += (onHead / (head.width * head.height || 1)) * 600;
        // Also tried just above that head, where there is often room.
        if (onHead > 0 && (c.moves ?? 0) < 2) candidates.push({ cx, cy: o.rect.y - 2 - ry, below: c.below, moves: (c.moves ?? 0) + 1 });
      }
      if (o.weight >= HEAVY) {
        heavy += share;
        if (share > 0 && reachesInto(cx, cy, o.rect)) {
          into = true;
          if ((c.moves ?? 0) < 2) {
            const gap = 2;
            const moves = (c.moves ?? 0) + 1;
            candidates.push(
              { cx: o.rect.x - gap - rx, cy, below: c.below, moves },
              { cx: o.rect.x + o.rect.width + gap + rx, cy, below: c.below, moves },
              { cx, cy: o.rect.y - gap - ry, below: c.below, moves },
              { cx, cy: o.rect.y + o.rect.height + gap + ry, below: c.below, moves },
            );
          }
        }
      }
    }
    // Any place clear of them is better than one that is not.
    if (into) score += 3000;
    if (speaker) score += (overlap(rect, speaker) / area) * 400;
    if (face) score += (overlap(rect, face) / (face.width * face.height)) * 1500;
    // Lean away from the middle of the stage, as in comics where two
    // speakers' bubbles sit above and outside them.
    score += Math.max(0, ((cx - mouth.x) / w) * towardMiddle) * 40;
    if (c.below) score += 60;
    if (!best || score < best.score) best = { score, rect, heavy, into };
  }
  // No bubble (the text box shows) when the best place still sits on a
  // button or a panel: on a phone held upright the replies fill the width
  // and a long line's bubble dipped into the first of them.
  if (!best || best.score >= 10000 || best.heavy > 0.25 || best.into) return null;

  const { rect } = best;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  // The tail stops just short of the point, so it doesn't stab the face.
  const d = Math.hypot(mouth.x - cx, mouth.y - cy) || 1;
  const edge = edgeAt(rx, ry, mouth.x - cx, mouth.y - cy);
  const gap = Math.min(Math.max(stopShort, Math.min(6, d * 0.1)), Math.max(0, d - edge - 8));
  return { rect, tip: { x: mouth.x - ((mouth.x - cx) / d) * gap, y: mouth.y - ((mouth.y - cy) / d) * gap } };
}

const f = (n: number) => +n.toFixed(2);

/**
 * The bubble's outline in its own box (width × height), with the tail to
 * `tip` (in the same coordinates, usually outside the box), as one closed
 * path so the outline runs around the tail without a seam. Without a tip, or
 * one inside the oval, a plain oval.
 */
export function bubblePath(width: number, height: number, tip?: BubblePoint | null, stroke = 2): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(1, width / 2 - stroke / 2);
  const ry = Math.max(1, height / 2 - stroke / 2);
  const inside = !tip || ((tip.x - cx) / rx) ** 2 + ((tip.y - cy) / ry) ** 2 <= 1;
  if (inside) {
    return `M ${f(cx - rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 1 ${f(cx + rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 1 ${f(cx - rx)} ${f(cy)} Z`;
  }
  // The tail leaves the oval facing the tip; its base is about 30 px wide,
  // narrower on a small bubble.
  const phi = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
  const halfBase = Math.min(16, Math.max(6, Math.min(rx, ry) * 0.35));
  const speed = Math.hypot(rx * Math.sin(phi), ry * Math.cos(phi)) || 1;
  const delta = Math.min(0.6, halfBase / speed);
  const at = (a: number) => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  const p1 = at(phi - delta);
  const p2 = at(phi + delta);
  return `M ${f(p1.x)} ${f(p1.y)} L ${f(tip.x)} ${f(tip.y)} L ${f(p2.x)} ${f(p2.y)} A ${f(rx)} ${f(ry)} 0 1 1 ${f(p1.x)} ${f(p1.y)} Z`;
}

/**
 * A rounded box in its own box (width × height) with a tail to `tip` (in the
 * same coordinates, outside the box), as one closed path. The tail leaves
 * the side facing the tip, as near the tip as the rounded corners allow.
 * Without a tip, or one inside the box, a plain rounded box.
 */
export function boxBubblePath(width: number, height: number, tip?: BubblePoint | null, stroke = 2, radius = 14): string {
  const s = stroke / 2;
  const x0 = s;
  const y0 = s;
  const x1 = Math.max(x0 + 2, width - s);
  const y1 = Math.max(y0 + 2, height - s);
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  type Side = 'top' | 'right' | 'bottom' | 'left';
  let side: Side | null = null;
  if (tip && (tip.x < x0 || tip.x > x1 || tip.y < y0 || tip.y > y1)) {
    const dx = (tip.x - width / 2) / (width / 2);
    const dy = (tip.y - height / 2) / (height / 2);
    side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
  }
  const halfBase = Math.min(16, Math.max(6, Math.min(x1 - x0, y1 - y0) * 0.18));
  // Where along a side the tail's base is centred: level with the tip, kept off the corners.
  const along = (from: number, to: number, want: number) => {
    const lo = from + r + halfBase;
    const hi = to - r - halfBase;
    return lo <= hi ? Math.min(hi, Math.max(lo, want)) : (from + to) / 2;
  };
  const t = tip ?? { x: 0, y: 0 };
  let d = `M ${f(x0 + r)} ${f(y0)}`;
  if (side === 'top') { const c = along(x0, x1, t.x); d += ` L ${f(c - halfBase)} ${f(y0)} L ${f(t.x)} ${f(t.y)} L ${f(c + halfBase)} ${f(y0)}`; }
  d += ` L ${f(x1 - r)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)}`;
  if (side === 'right') { const c = along(y0, y1, t.y); d += ` L ${f(x1)} ${f(c - halfBase)} L ${f(t.x)} ${f(t.y)} L ${f(x1)} ${f(c + halfBase)}`; }
  d += ` L ${f(x1)} ${f(y1 - r)} A ${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(y1)}`;
  if (side === 'bottom') { const c = along(x0, x1, t.x); d += ` L ${f(c + halfBase)} ${f(y1)} L ${f(t.x)} ${f(t.y)} L ${f(c - halfBase)} ${f(y1)}`; }
  d += ` L ${f(x0 + r)} ${f(y1)} A ${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1 - r)}`;
  if (side === 'left') { const c = along(y0, y1, t.y); d += ` L ${f(x0)} ${f(c + halfBase)} L ${f(t.x)} ${f(t.y)} L ${f(x0)} ${f(c - halfBase)}`; }
  d += ` L ${f(x0)} ${f(y0 + r)} A ${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)} Z`;
  return d;
}

/** How far a thought cloud's bumps reach out from its oval; the cloud's box is this much bigger on each side. */
export const THOUGHT_BUMP = 12;

/**
 * A thought: a cloud in its own box (width × height) — bumps around an oval
 * set in by THOUGHT_BUMP — as one closed path. The tail is a trail of small
 * circles instead (thoughtTrail).
 */
export function thoughtPath(width: number, height: number, stroke = 2): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(4, width / 2 - THOUGHT_BUMP - stroke / 2);
  const ry = Math.max(4, height / 2 - THOUGHT_BUMP - stroke / 2);
  // Ramanujan's perimeter, cut into bumps about 44 px apart.
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.min(20, Math.max(7, Math.round(perimeter / 44)));
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    // An arc bulging outward (to the left of travel, clockwise on screen);
    // its height stays within THOUGHT_BUMP.
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    const r = Math.max(chord * 0.55, (chord * chord / 4 + THOUGHT_BUMP * THOUGHT_BUMP) / (2 * THOUGHT_BUMP));
    d += ` A ${f(r)} ${f(r)} 0 0 1 ${f(q.x)} ${f(q.y)}`;
  }
  return `${d} Z`;
}

/**
 * The trail of a thought: three shrinking circles from the cloud toward
 * `tip` (in the box's coordinates), the last one next to the tip.
 */
export function thoughtTrail(width: number, height: number, tip: BubblePoint): Array<{ cx: number; cy: number; r: number }> {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const edge = ovalRadius(rx, ry, tip.x - cx, tip.y - cy);
  const d = Math.hypot(tip.x - cx, tip.y - cy);
  if (d <= edge) return [];
  const ux = (tip.x - cx) / d;
  const uy = (tip.y - cy) / d;
  const gap = d - edge;
  const big = Math.min(9, Math.max(4, gap * 0.16));
  return [
    { t: 0.22, r: big },
    { t: 0.55, r: big * 0.68 },
    { t: 0.86, r: big * 0.45 },
  ].map(({ t, r }) => ({ cx: f(cx + ux * (edge + gap * t)), cy: f(cy + uy * (edge + gap * t)), r: f(r) }));
}

/** A line shown in a bubble: who said it (character id or name) and what. */
export interface BubbleLine {
  speaker: string;
  text: string;
  /** Thought, not spoken (an inner voice): a cloud. */
  thought?: { color?: string };
}

/**
 * What the stage needs to keep the line before up beside the current one,
 * as comics do (the renderer keeps it; see ReactRenderer.bubbleHistory):
 * the line just before (another character's, kept when the player clicked
 * Continue; a reply the player picked is not shown again) — and the
 * player's character, at whom inner voices point.
 */
export interface BubbleHistory {
  /** The line before the current one. */
  earlier?: BubbleLine;
  /**
   * The first line shown after `earlier` (bubbleLineKey). Unset until the
   * stage reports one; any other line drops `earlier` (the story moved on
   * without the player, e.g. on a timer).
   */
  earlierAnchor?: string;
  /** The player's character (role "player"): thoughts point at them. */
  player?: string;
  /** The stage showed this line in a bubble. */
  onShown?: (line: BubbleLine) => void;
  /**
   * The replies the player can pick now, in a Dialog Tree (the choices'
   * text): with Speaker Display ▸ replies as one bubble, they are listed in
   * a bubble at the player's character instead of as buttons.
   */
  replies?: string[];
}

export const bubbleLineKey = (line: BubbleLine): string => `${line.speaker}\u0000${line.text}`;

/** The earlier line to show beside `current`, when it still belongs with it. */
export function earlierLineFor(history: BubbleHistory | undefined, current: BubbleLine | undefined): BubbleLine | undefined {
  const earlier = history?.earlier;
  if (!earlier || !current || typeof earlier.text !== 'string' || !earlier.text.trim()) return undefined;
  if (history.earlierAnchor !== undefined && history.earlierAnchor !== bubbleLineKey(current)) return undefined;
  return earlier;
}

/**
 * How long the player's replies wait after a line shows in a bubble, so it
 * can be read with some margin first: 300 ms a word (200 words a minute)
 * plus 1.5 s, at least 2.5 s and at most 10 s.
 */
export function bubbleReadingMs(text: string | undefined): number {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.round(Math.min(10000, Math.max(2500, 1500 + words * 300)));
}

/** Which placed character shows the speaker, by character id or by the name it was placed with. */
export function speakerLocation<T extends StageCharacterLike>(
  locations: ReadonlyArray<T> | undefined,
  speaker: string | undefined,
): T | undefined {
  if (!locations || !speaker) return undefined;
  return locations.find((l) => showsSpeaker(l, speaker));
}

/**
 * Who the current bubble points at: the speaker on the stage — or, for a
 * thought whose inner voice isn't on the stage (it speaks in the player's
 * head), the player's character.
 */
export function bubbleSpeakerFor<T extends StageCharacterLike>(
  locations: ReadonlyArray<T> | undefined,
  speaker: string | undefined,
  thought: boolean,
  history: BubbleHistory | undefined,
): T | undefined {
  return speakerLocation(locations, speaker)
    ?? (thought && history?.player ? speakerLocation(locations, history.player) : undefined);
}


/**
 * Where the meter and inventory panels over the stage are, in page
 * coordinates: a character's own, drawn inside the stage, and screen-docked
 * ones, which the screen HUD layer draws outside it. Bubbles keep clear of
 * both. Panels that don't overlap the stage (another view's) are left out.
 */
export function hudFramesOver(root: HTMLElement, rootBox: { left: number; top: number; right: number; bottom: number }): DOMRect[] {
  const out: DOMRect[] = [];
  root.ownerDocument.querySelectorAll<HTMLElement>('[data-hud-frame]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right <= rootBox.left || r.left >= rootBox.right || r.bottom <= rootBox.top || r.top >= rootBox.bottom) return;
    out.push(r);
  });
  return out;
}
