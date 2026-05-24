/**
 * spatialAnimation — responsive motion intent for the SPATIAL layer
 * (Phase-3 composite image). Sibling of slotAnimation, which targets
 * the FLOW slots. The split mirrors SpatialFlowView's deliberate
 * data-layer separation: spatial-layer wraps the uniformly-scaled
 * image (pan / zoom); flow layer wraps the responsive text + buttons
 * (handled by slotAnimations).
 *
 * Like slotAnimation, this is INTENT, not pixel keyframes — the
 * renderer interprets presets against the image's currently-resolved
 * rect, so motion survives reflow / viewport / orientation.
 */

/** Supported spatial-layer presets.
 *
 * `'path'` is the keyframe-driven escape hatch — waypoints over the
 * LETTERBOXED image rect (normalized 0..1, same coordinate system as
 * hotspots), with optional per-waypoint zoom. The renderer interpolates
 * pan + scale frame-by-frame, recomputing pixel offsets against the
 * current image rect so the motion survives reflow / orientation. */
export type SpatialAnimationPreset =
  | 'ken-burns'   // slow zoom + drift; classic cinematic
  | 'zoom-in'     // start scaled-up, settle to fit
  | 'zoom-out'   // start at fit, slow push beyond
  | 'pan-left'    // drift left across the image
  | 'pan-right'   // drift right across the image
  | 'pan-up'      // drift up
  | 'pan-down'    // drift down
  | 'path';       // keyframe waypoints over the letterboxed image

/**
 * A single spatial-layer animation event. Unlike slot animations,
 * spatial presets are long-running (cinematic) so the default
 * duration is much larger — defaults to 6000ms (Ken-Burns dwell).
 */
export interface SpatialAnimation {
  preset: SpatialAnimationPreset;
  /** Milliseconds. Default ~6000 for cinematic dwell. */
  duration?: number;
  /** Milliseconds. */
  delay?: number;
  /** CSS easing keyword or cubic-bezier. Default 'linear' for pans, 'ease-out' for zooms. */
  easing?: string;
  /**
   * Intensity scaler. For zoom presets: scale delta from 1 (0.2 = 20%
   * extra zoom). For pan presets: percent of image dimension to traverse.
   * Default 10 (10% drift / 1.1× zoom) — gentle enough to read as
   * motion but not draw attention away from the foreground.
   */
  intensity?: number;
  /** Required when preset === 'path'. Ignored otherwise. */
  path?: SpatialPath;
}

/**
 * A waypoint along a spatial path. Coordinates are normalized 0..1
 * against the LETTERBOXED image rect — the same coordinate system
 * hotspots use, so a waypoint at `(0.5, 0.5)` always centers on the
 * image regardless of viewport. `zoom` is a scale factor where 1 means
 * the image fills its container at fit-scale (objectFit: contain) and
 * >1 zooms in (the renderer translates so the waypoint stays centered
 * during the zoom).
 */
export interface SpatialWaypoint {
  x: number;
  y: number;
  zoom?: number;
  t?: number;
  easing?: string;
}

/**
 * Keyframe path for the spatial layer (image). Same shape as SlotPath
 * but with image-relative waypoints.
 */
export interface SpatialPath {
  type?: 'linear' | 'bezier';
  loop?: boolean;
  waypoints: SpatialWaypoint[];
}

/** Top-level shape stored on a beat. */
export interface SpatialAnimations {
  enter?: SpatialAnimation;
  /**
   * P3-anim-7 — exit applied to the spatial layer BEFORE the next beat
   * takes over. Plays in PARALLEL with the flow-layer slot exits
   * (independent DOM subtrees) — total wait before advance is the max
   * of the two so neither layer is cut off mid-animation.
   */
  exit?: SpatialAnimation;
}

/** Defensive type guard. */
export function isSpatialAnimations(value: unknown): value is SpatialAnimations {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
