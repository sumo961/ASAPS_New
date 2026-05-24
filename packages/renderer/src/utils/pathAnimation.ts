/**
 * Path-animation runtime — shared between SlotFlowView (slot layer) and
 * SpatialFlowView (image layer). Both layers express keyframe paths in
 * layout-agnostic coordinates that need a per-frame translation into
 * pixels against the currently-resolved stage / image rect:
 *
 *   - Slot path: anchor (corner/edge of the STAGE) + percent offset.
 *     The slot wrapper's CENTER is translated to that target each frame.
 *   - Spatial path: normalized 0..1 on the letterboxed IMAGE rect plus
 *     optional zoom. The image layer's transform pans (translate) and
 *     scales (zoom) so the waypoint stays centered.
 *
 * The interpolation core (waypoint time assignment, easing, segment
 * lookup) is shared. The pixel resolution differs per layer and is
 * passed in as a function so callers don't have to leak DOM details
 * into the utility.
 */

export interface SlotAnchor2D {
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'center' | 'bottom';
}

export interface SlotWaypointLite {
  anchor?: SlotAnchor2D;
  dxPercent?: number;
  dyPercent?: number;
  t?: number;
  easing?: string;
}

export interface SpatialWaypointLite {
  x: number;
  y: number;
  zoom?: number;
  t?: number;
  easing?: string;
}

/**
 * Assign normalized times to a waypoint array. Waypoints with an
 * explicit `t` keep it (clamped to 0..1); the rest are spread evenly
 * between the surrounding fixed values. Returns the parallel time
 * array; never mutates the input.
 */
export function assignWaypointTimes<W extends { t?: number }>(waypoints: W[]): number[] {
  const n = waypoints.length;
  if (n === 0) return [];
  if (n === 1) return [waypoints[0].t ?? 1];
  const ts: number[] = waypoints.map(w => (typeof w.t === 'number' ? Math.max(0, Math.min(1, w.t)) : NaN));
  // Anchor endpoints if absent
  if (Number.isNaN(ts[0])) ts[0] = 0;
  if (Number.isNaN(ts[n - 1])) ts[n - 1] = 1;
  // Fill missing values with even spacing between flanking fixed values
  let i = 1;
  while (i < n - 1) {
    if (Number.isNaN(ts[i])) {
      let j = i;
      while (j < n - 1 && Number.isNaN(ts[j])) j++;
      // ts[i-1] and ts[j] are fixed
      const span = ts[j] - ts[i - 1];
      const steps = j - (i - 1);
      for (let k = i; k < j; k++) {
        ts[k] = ts[i - 1] + (span * (k - (i - 1))) / steps;
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return ts;
}

/**
 * Resolve a CSS easing keyword / cubic-bezier expression to a function
 * over [0..1]. Falls back to linear for unrecognised input — the
 * renderer never crashes on a typo.
 */
export function easingFn(easing: string | undefined): (t: number) => number {
  if (!easing) return linear;
  const key = easing.trim().toLowerCase();
  if (key === 'linear') return linear;
  if (key === 'ease') return cubicBezier(0.25, 0.1, 0.25, 1);
  if (key === 'ease-in') return cubicBezier(0.42, 0, 1, 1);
  if (key === 'ease-out') return cubicBezier(0, 0, 0.58, 1);
  if (key === 'ease-in-out') return cubicBezier(0.42, 0, 0.58, 1);
  const m = key.match(/^cubic-bezier\s*\(\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*\)$/);
  if (m) {
    const [, x1, y1, x2, y2] = m;
    return cubicBezier(parseFloat(x1), parseFloat(y1), parseFloat(x2), parseFloat(y2));
  }
  return linear;
}

function linear(t: number): number { return t; }

/**
 * Newton-Raphson cubic-bezier solver. Returns y(t) for an x-axis-time
 * curve defined by control points (x1,y1) and (x2,y2). Same algorithm
 * Chrome uses for CSS `cubic-bezier(...)`.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sampleCurveX = (t: number) => ((1 - t) * (1 - t) * 3 * t * x1) + ((1 - t) * 3 * t * t * x2) + (t * t * t);
  const sampleCurveY = (t: number) => ((1 - t) * (1 - t) * 3 * t * y1) + ((1 - t) * 3 * t * t * y2) + (t * t * t);
  const sampleCurveDerivativeX = (t: number) => {
    const oneMinusT = 1 - t;
    return 3 * oneMinusT * oneMinusT * x1 + 6 * oneMinusT * t * (x2 - x1) + 3 * t * t * (1 - x2);
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Solve sampleCurveX(u) = t for u via Newton-Raphson, then sample Y.
    let u = t;
    for (let i = 0; i < 8; i++) {
      const xCurr = sampleCurveX(u) - t;
      if (Math.abs(xCurr) < 1e-6) return sampleCurveY(u);
      const d = sampleCurveDerivativeX(u);
      if (Math.abs(d) < 1e-6) break;
      u = u - xCurr / d;
    }
    return sampleCurveY(Math.max(0, Math.min(1, u)));
  };
}

/**
 * Interpolate two waypoints. Splits the current time into a segment
 * t in [0..1] and applies the segment's easing. Falls through to a
 * pure value pair (numbers) for the caller to lerp.
 */
export function segmentProgress(
  globalT: number,
  times: number[],
  waypointEasings: (string | undefined)[],
  fallbackEasing: string | undefined,
): { i0: number; i1: number; eased: number } {
  const n = times.length;
  if (n === 0) return { i0: 0, i1: 0, eased: 0 };
  if (n === 1) return { i0: 0, i1: 0, eased: 1 };
  // Find segment
  let i = 0;
  while (i < n - 1 && globalT > times[i + 1]) i++;
  const t0 = times[i];
  const t1 = times[Math.min(i + 1, n - 1)];
  const segLen = t1 - t0;
  const segT = segLen <= 0 ? 1 : Math.max(0, Math.min(1, (globalT - t0) / segLen));
  const ease = easingFn(waypointEasings[Math.min(i + 1, n - 1)] || fallbackEasing);
  return { i0: i, i1: Math.min(i + 1, n - 1), eased: ease(segT) };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ───────────────────────── Slot layer ───────────────────────── */

export interface RunSlotPathOpts {
  /** The slot wrapper element being animated. */
  el: HTMLElement;
  /** Stage / root the percent offsets are relative to. */
  stage: HTMLElement;
  waypoints: SlotWaypointLite[];
  duration: number;
  delay?: number;
  easing?: string;
  loop?: boolean;
  /** Fires once the (non-looping) animation completes. */
  onDone?: () => void;
}

/**
 * Drive a translate transform on a slot element through the given
 * waypoints. Each waypoint targets an anchor on the STAGE (corner /
 * edge) plus a percent offset, and the slot's CENTER is moved there.
 *
 * Returns a cleanup function — call it on unmount to cancel the rAF
 * and clear the inline transform. Safe to call after natural completion.
 */
export function runSlotPath({
  el, stage, waypoints, duration, delay = 0, easing, loop = false, onDone,
}: RunSlotPathOpts): () => void {
  if (!el || !stage || waypoints.length === 0) return () => {};
  const times = assignWaypointTimes(waypoints);
  const waypointEasings = waypoints.map(w => w.easing);
  let rafId = 0;
  let cancelled = false;

  // Measure the slot's natural rect ONCE — the layout determines this,
  // and the path transform shifts from it. Re-measured if loop wraps.
  const measureNatural = () => {
    el.style.transform = '';
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      stage: s,
      naturalCx: r.left - s.left + r.width / 2,
      naturalCy: r.top - s.top + r.height / 2,
    };
  };
  let measured = measureNatural();

  const targetPx = (wp: SlotWaypointLite, stageRect: DOMRect) => {
    const h = wp.anchor?.h ?? 'center';
    const v = wp.anchor?.v ?? 'center';
    const ax = h === 'left' ? 0 : h === 'right' ? stageRect.width : stageRect.width / 2;
    const ay = v === 'top' ? 0 : v === 'bottom' ? stageRect.height : stageRect.height / 2;
    return {
      x: ax + ((wp.dxPercent ?? 0) / 100) * stageRect.width,
      y: ay + ((wp.dyPercent ?? 0) / 100) * stageRect.height,
    };
  };

  const start = performance.now() + delay;
  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = now - start;
    if (elapsed < 0) {
      rafId = requestAnimationFrame(step);
      return;
    }
    let progress = duration <= 0 ? 1 : elapsed / duration;
    if (progress >= 1 && loop) {
      // Re-measure on each loop (viewport may have changed)
      measured = measureNatural();
      const startNew = performance.now();
      // Replace global start without restarting rAF
      // (next frame computes elapsed from the new start)
      // -- handled by recursive call so we don't accumulate drift.
      const cleanup = runSlotPath({ el, stage, waypoints, duration, delay: 0, easing, loop, onDone });
      // The new animator owns el now; cancel the previous frame loop.
      cancelled = true;
      void startNew;
      void cleanup;
      return;
    }
    progress = Math.max(0, Math.min(1, progress));
    const { i0, i1, eased } = segmentProgress(progress, times, waypointEasings, easing);
    const p0 = targetPx(waypoints[i0], measured.stage);
    const p1 = targetPx(waypoints[i1], measured.stage);
    const tx = lerp(p0.x, p1.x, eased) - measured.naturalCx;
    const ty = lerp(p0.y, p1.y, eased) - measured.naturalCy;
    el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  rafId = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    el.style.transform = '';
  };
}

/* ───────────────────────── Spatial layer ───────────────────────── */

export interface ImageRect {
  /** x of letterboxed image, relative to the container element. */
  x: number;
  /** y of letterboxed image, relative to the container element. */
  y: number;
  width: number;
  height: number;
}

export interface RunSpatialPathOpts {
  /** The image element being panned / zoomed. */
  el: HTMLElement;
  /** Returns the current letterboxed image rect relative to its
   *  parent. Called every frame so the path tracks reflow / variant
   *  swaps without restarting. */
  getImageRect: () => ImageRect | null;
  waypoints: SpatialWaypointLite[];
  duration: number;
  delay?: number;
  easing?: string;
  loop?: boolean;
  onDone?: () => void;
}

/**
 * Pan + zoom the spatial image layer along normalized waypoints. The
 * transform centers each waypoint's (x, y) ∈ [0..1] in the container
 * while applying its `zoom` factor (1 = no zoom). Recomputes against
 * the live image rect every frame so the path survives reflow.
 */
export function runSpatialPath({
  el, getImageRect, waypoints, duration, delay = 0, easing, loop = false, onDone,
}: RunSpatialPathOpts): () => void {
  if (!el || waypoints.length === 0) return () => {};
  const times = assignWaypointTimes(waypoints);
  const waypointEasings = waypoints.map(w => w.easing);
  let rafId = 0;
  let cancelled = false;

  const start = performance.now() + delay;
  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = now - start;
    if (elapsed < 0) {
      rafId = requestAnimationFrame(step);
      return;
    }
    let progress = duration <= 0 ? 1 : elapsed / duration;
    if (progress >= 1 && loop) {
      const cleanup = runSpatialPath({ el, getImageRect, waypoints, duration, delay: 0, easing, loop, onDone });
      cancelled = true;
      void cleanup;
      return;
    }
    progress = Math.max(0, Math.min(1, progress));
    const { i0, i1, eased } = segmentProgress(progress, times, waypointEasings, easing);
    const a = waypoints[i0];
    const b = waypoints[i1];
    const wx = lerp(a.x, b.x, eased);
    const wy = lerp(a.y, b.y, eased);
    const wz = lerp(a.zoom ?? 1, b.zoom ?? 1, eased);
    const rect = getImageRect();
    if (rect) {
      // To center (wx, wy) of the image in its container while zooming
      // by wz, translate the IMAGE so its (wx, wy) point lands on the
      // image center, then scale around the center.
      const containerCx = rect.x + rect.width / 2;
      const containerCy = rect.y + rect.height / 2;
      const waypointPxX = rect.x + wx * rect.width;
      const waypointPxY = rect.y + wy * rect.height;
      const dx = (containerCx - waypointPxX) * wz;
      const dy = (containerCy - waypointPxY) * wz;
      el.style.transformOrigin = `${rect.x + rect.width / 2}px ${rect.y + rect.height / 2}px`;
      el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${wz.toFixed(4)})`;
    }
    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  rafId = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    el.style.transform = '';
    el.style.transformOrigin = '';
  };
}
