/**
 * PathInterpolator - Math utilities for animation path interpolation
 *
 * Handles bezier curve calculations and linear interpolation
 * for smooth animation along defined paths.
 */

import type { AnimationWaypoint, ControlPoint } from '@asaps/core';

/**
 * Calculate a point on a cubic bezier curve
 *
 * @param t Progress along curve (0-1)
 * @param p0 Start point
 * @param p1 First control point
 * @param p2 Second control point
 * @param p3 End point
 */
export function cubicBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
}

/**
 * Calculate a point on a quadratic bezier curve
 *
 * @param t Progress along curve (0-1)
 * @param p0 Start point
 * @param p1 Control point
 * @param p2 End point
 */
export function quadraticBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number
): number {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;

  return uu * p0 + 2 * u * t * p1 + tt * p2;
}

/**
 * Linear interpolation between two values
 *
 * @param t Progress (0-1)
 * @param start Start value
 * @param end End value
 */
export function lerp(t: number, start: number, end: number): number {
  return start + (end - start) * t;
}

/**
 * Apply easing function to linear progress
 *
 * @param t Linear progress (0-1)
 * @param easing CSS easing function name
 */
export function applyEasing(t: number, easing?: string): number {
  if (!easing || easing === 'linear') {
    return t;
  }

  // Clamp t to 0-1
  t = Math.max(0, Math.min(1, t));

  switch (easing) {
    case 'ease':
      return cubicBezierEasing(t, 0.25, 0.1, 0.25, 1.0);
    case 'ease-in':
      return cubicBezierEasing(t, 0.42, 0, 1.0, 1.0);
    case 'ease-out':
      return cubicBezierEasing(t, 0, 0, 0.58, 1.0);
    case 'ease-in-out':
      return cubicBezierEasing(t, 0.42, 0, 0.58, 1.0);
    default:
      // Try to parse custom cubic-bezier format
      const match = easing.match(/cubic-bezier\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
      if (match) {
        return cubicBezierEasing(
          t,
          parseFloat(match[1]),
          parseFloat(match[2]),
          parseFloat(match[3]),
          parseFloat(match[4])
        );
      }
      return t; // Fallback to linear
  }
}

/**
 * Cubic bezier easing function (for timing, not spatial)
 * Uses Newton-Raphson method to solve for t given x
 */
function cubicBezierEasing(
  x: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): number {
  // Clamp input to [0, 1]
  x = Math.max(0, Math.min(1, x));

  // For linear curves, return x
  if (p1x === p1y && p2x === p2y) {
    return x;
  }

  // Newton-Raphson iteration to find t for given x
  const epsilon = 1e-6;
  let t = x;

  for (let i = 0; i < 8; i++) {
    // Clamp t to [0, 1] to prevent runaway values
    t = Math.max(0, Math.min(1, t));

    const xt = cubicBezier(t, 0, p1x, p2x, 1);
    const diff = xt - x;

    if (Math.abs(diff) < epsilon) {
      break;
    }

    // Derivative of bezier curve
    const derivative =
      3 * (1 - t) * (1 - t) * p1x +
      6 * (1 - t) * t * (p2x - p1x) +
      3 * t * t * (1 - p2x);

    if (Math.abs(derivative) < epsilon) {
      break;
    }

    t -= diff / derivative;
  }

  // Clamp final t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Calculate y value using solved t and clamp result
  const y = cubicBezier(t, 0, p1y, p2y, 1);
  return Math.max(0, Math.min(1, y));
}

/**
 * Interpolate position along a path segment
 *
 * @param progress Progress along segment (0-1)
 * @param start Start waypoint
 * @param end End waypoint
 * @param interpolationType Type of interpolation ('linear' or 'bezier')
 */
export function interpolateSegment(
  progress: number,
  start: AnimationWaypoint,
  end: AnimationWaypoint,
  interpolationType: 'linear' | 'bezier'
): { x: number; y: number; scale?: number; rotation?: number; opacity?: number; flipX?: boolean; flipY?: boolean; spriteAnimation?: string; spriteFrames?: number[]; spriteFrameDuration?: number } {
  // Apply easing to progress
  const easedProgress = applyEasing(progress, end.easing);

  let x: number;
  let y: number;

  if (interpolationType === 'bezier' && start.controlPoint2 && end.controlPoint1) {
    // Cubic bezier interpolation
    x = cubicBezier(
      easedProgress,
      start.x,
      start.controlPoint2.x,
      end.controlPoint1.x,
      end.x
    );
    y = cubicBezier(
      easedProgress,
      start.y,
      start.controlPoint2.y,
      end.controlPoint1.y,
      end.y
    );
  } else {
    // Linear interpolation
    x = lerp(easedProgress, start.x, end.x);
    y = lerp(easedProgress, start.y, end.y);
  }

  // Interpolate additional properties using default values when not specified
  // Default values: scale=1, rotation=0, opacity=1, flipX=false, flipY=false
  const startScale = start.scale ?? 1;
  const endScale = end.scale ?? 1;
  const startRotation = start.rotation ?? 0;
  const endRotation = end.rotation ?? 0;
  const startOpacity = start.opacity ?? 1;
  const endOpacity = end.opacity ?? 1;

  const result: { x: number; y: number; scale?: number; rotation?: number; opacity?: number; flipX?: boolean; flipY?: boolean; spriteAnimation?: string; spriteFrames?: number[]; spriteFrameDuration?: number } = {
    x,
    y,
  };

  // Always interpolate transform properties (using defaults if not specified)
  // Only include in result if either waypoint has a non-default value
  if (start.scale !== undefined || end.scale !== undefined) {
    result.scale = lerp(easedProgress, startScale, endScale);
  }

  if (start.rotation !== undefined || end.rotation !== undefined) {
    result.rotation = lerp(easedProgress, startRotation, endRotation);
  }

  if (start.opacity !== undefined || end.opacity !== undefined) {
    result.opacity = lerp(easedProgress, startOpacity, endOpacity);
  }

  // Flip properties are boolean - use the START waypoint's value for the entire segment
  // The flip applies when arriving at a waypoint and stays until the next waypoint is reached
  // This matches the AnimationPathEditor behavior and prevents mid-segment direction changes
  if (start.flipX !== undefined || end.flipX !== undefined) {
    result.flipX = start.flipX ?? false;
  }

  if (start.flipY !== undefined || end.flipY !== undefined) {
    result.flipY = start.flipY ?? false;
  }

  // Sprite animation properties - use the START waypoint's value for the entire segment
  // This allows different animations for different path segments (e.g., walk then run)
  if (start.spriteAnimation !== undefined) {
    result.spriteAnimation = start.spriteAnimation;
  }

  if (start.spriteFrames !== undefined && start.spriteFrames.length > 0) {
    result.spriteFrames = start.spriteFrames;
  }

  if (start.spriteFrameDuration !== undefined) {
    result.spriteFrameDuration = start.spriteFrameDuration;
  }

  return result;
}

/**
 * Calculate position at a specific time along an animation path
 *
 * @param waypoints Array of waypoints defining the path
 * @param currentTime Current time in milliseconds
 * @param interpolationType Type of interpolation
 */
export function calculatePositionAtTime(
  waypoints: AnimationWaypoint[],
  currentTime: number,
  interpolationType: 'linear' | 'bezier'
): { x: number; y: number; scale?: number; rotation?: number; opacity?: number; flipX?: boolean; flipY?: boolean; spriteAnimation?: string; spriteFrames?: number[]; spriteFrameDuration?: number } | null {
  if (waypoints.length === 0) {
    return null;
  }

  if (waypoints.length === 1) {
    return {
      x: waypoints[0].x,
      y: waypoints[0].y,
      scale: waypoints[0].scale,
      rotation: waypoints[0].rotation,
      opacity: waypoints[0].opacity,
      flipX: waypoints[0].flipX,
      flipY: waypoints[0].flipY,
      spriteAnimation: waypoints[0].spriteAnimation,
      spriteFrames: waypoints[0].spriteFrames,
      spriteFrameDuration: waypoints[0].spriteFrameDuration,
    };
  }

  // Calculate total duration to detect mismatches
  const totalDuration = waypoints.slice(1).reduce((sum, wp) => sum + wp.duration, 0);

  // Find which segment we're in
  let accumulatedTime = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const currentWaypoint = waypoints[i];
    const nextWaypoint = waypoints[i + 1];
    const segmentDuration = nextWaypoint.duration;

    if (currentTime <= accumulatedTime + segmentDuration) {
      // We're in this segment
      const segmentProgress = (currentTime - accumulatedTime) / segmentDuration;
      return interpolateSegment(
        segmentProgress,
        currentWaypoint,
        nextWaypoint,
        interpolationType
      );
    }

    accumulatedTime += segmentDuration;
  }

  // Past the end - return last waypoint position but NO sprite animation
  // When animation completes, sprite animation should stop (undefined values signal stop)
  const lastWaypoint = waypoints[waypoints.length - 1];
  return {
    x: lastWaypoint.x,
    y: lastWaypoint.y,
    scale: lastWaypoint.scale,
    rotation: lastWaypoint.rotation,
    opacity: lastWaypoint.opacity,
    flipX: lastWaypoint.flipX,
    flipY: lastWaypoint.flipY,
    // Explicitly undefined to signal sprite animation should stop
    spriteAnimation: undefined,
    spriteFrames: undefined,
    spriteFrameDuration: undefined,
  };
}
