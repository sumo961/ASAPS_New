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

/** The widest a bubble's text runs before wrapping, for a stage this wide. */
export function bubbleTextMaxWidth(stageWidth: number): number {
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
export interface BubbleObstacle { rect: BubbleRect; weight: number }

/** Buttons, HUDs and visible text: a bubble that covers them much is not placed at all. */
export const HEAVY = 3;
/** Other characters on the stage: better not covered, but allowed. */
export const LIGHT = 0.6;

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
}): BubblePlacement | null {
  const { stage, size, mouth, speaker, obstacles = [] } = opts;
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

  type Candidate = { cx: number; cy: number; below?: boolean };
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

  let best: { score: number; rect: BubbleRect; heavy: number } | null = null;
  for (const c of candidates) {
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
    const reach = Math.hypot(mouth.x - cx, mouth.y - cy) - ovalRadius(rx, ry, mouth.x - cx, mouth.y - cy);
    if (reach < 8) score += 10000;
    score += Math.abs(reach - tail);
    let heavy = 0;
    for (const o of obstacles) {
      const share = overlap(rect, o.rect) / area;
      score += share * o.weight * 1000;
      if (o.weight >= HEAVY) heavy += share;
    }
    if (speaker) score += (overlap(rect, speaker) / area) * 400;
    if (face) score += (overlap(rect, face) / (face.width * face.height)) * 1500;
    // Lean away from the middle of the stage, as in comics where two
    // speakers' bubbles sit above and outside them.
    score += Math.max(0, ((cx - mouth.x) / w) * towardMiddle) * 40;
    if (c.below) score += 60;
    if (!best || score < best.score) best = { score, rect, heavy };
  }
  if (!best || best.score >= 10000 || best.heavy > 0.25) return null;

  const { rect } = best;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  // The tail stops just short of the point, so it doesn't stab the face.
  const d = Math.hypot(mouth.x - cx, mouth.y - cy) || 1;
  const gap = Math.min(6, d * 0.1);
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
 * the line just before — another character's, or the player's own reply in
 * a Dialog Tree — and the player's character, at whom inner voices point.
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
}

export const bubbleLineKey = (line: BubbleLine): string => `${line.speaker}\u0000${line.text}`;

/** The earlier line to show beside `current`, when it still belongs with it. */
export function earlierLineFor(history: BubbleHistory | undefined, current: BubbleLine | undefined): BubbleLine | undefined {
  const earlier = history?.earlier;
  if (!earlier || !current || !earlier.text.trim()) return undefined;
  if (history.earlierAnchor !== undefined && history.earlierAnchor !== bubbleLineKey(current)) return undefined;
  return earlier;
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

