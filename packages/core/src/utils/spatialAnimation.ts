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

/** Supported spatial-layer presets. */
export type SpatialAnimationPreset =
  | 'ken-burns'   // slow zoom + drift; classic cinematic
  | 'zoom-in'     // start scaled-up, settle to fit
  | 'zoom-out'   // start at fit, slow push beyond
  | 'pan-left'    // drift left across the image
  | 'pan-right'   // drift right across the image
  | 'pan-up'      // drift up
  | 'pan-down';   // drift down

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
}

/** Top-level shape stored on a beat. Reserved for future {enter,exit,emphasis}. */
export interface SpatialAnimations {
  enter?: SpatialAnimation;
}

/** Defensive type guard. */
export function isSpatialAnimations(value: unknown): value is SpatialAnimations {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
