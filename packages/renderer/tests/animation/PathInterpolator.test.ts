/**
 * PathInterpolator Tests
 * Tests math utilities for animation path interpolation
 */

import { describe, it, expect } from 'vitest';
import {
  cubicBezier,
  quadraticBezier,
  lerp,
  applyEasing,
  interpolateSegment,
  calculatePositionAtTime,
} from '../../src/animation/PathInterpolator';
import type { AnimationWaypoint } from '@asaps/core';

describe('PathInterpolator', () => {
  describe('lerp', () => {
    it('should return start value at t=0', () => {
      expect(lerp(0, 100, 200)).toBe(100);
    });

    it('should return end value at t=1', () => {
      expect(lerp(1, 100, 200)).toBe(200);
    });

    it('should return midpoint at t=0.5', () => {
      expect(lerp(0.5, 100, 200)).toBe(150);
    });

    it('should handle negative values', () => {
      expect(lerp(0.5, -100, 100)).toBe(0);
    });

    it('should handle reverse interpolation (end < start)', () => {
      expect(lerp(0.5, 200, 100)).toBe(150);
    });

    it('should extrapolate beyond 0-1 range', () => {
      expect(lerp(2, 0, 100)).toBe(200);
      expect(lerp(-1, 0, 100)).toBe(-100);
    });
  });

  describe('quadraticBezier', () => {
    it('should return start point at t=0', () => {
      expect(quadraticBezier(0, 0, 50, 100)).toBe(0);
    });

    it('should return end point at t=1', () => {
      expect(quadraticBezier(1, 0, 50, 100)).toBe(100);
    });

    it('should calculate midpoint with control point influence', () => {
      // With control point at 50, midpoint should be influenced by it
      const result = quadraticBezier(0.5, 0, 50, 100);
      expect(result).toBe(50); // For symmetric control, midpoint equals control point
    });

    it('should handle control point above/below line', () => {
      // Control point at 100 (above straight line)
      const resultHigh = quadraticBezier(0.5, 0, 100, 100);
      expect(resultHigh).toBeGreaterThan(50);

      // Control point at 0 (below straight line)
      const resultLow = quadraticBezier(0.5, 0, 0, 100);
      expect(resultLow).toBeLessThan(50);
    });
  });

  describe('cubicBezier', () => {
    it('should return start point at t=0', () => {
      expect(cubicBezier(0, 0, 25, 75, 100)).toBe(0);
    });

    it('should return end point at t=1', () => {
      expect(cubicBezier(1, 0, 25, 75, 100)).toBe(100);
    });

    it('should be influenced by control points', () => {
      // Symmetric control points
      const result = cubicBezier(0.5, 0, 33, 66, 100);
      // At t=0.5 with these control points, should be near middle
      expect(result).toBeCloseTo(50, 0);
    });

    it('should produce smooth curve through control points', () => {
      // Test multiple points along curve
      const points = [0, 0.25, 0.5, 0.75, 1].map((t) =>
        cubicBezier(t, 0, 25, 75, 100)
      );

      // Should be monotonically increasing for these control points
      for (let i = 1; i < points.length; i++) {
        expect(points[i]).toBeGreaterThan(points[i - 1]);
      }
    });

    it('should handle same start and end', () => {
      const result = cubicBezier(0.5, 100, 50, 50, 100);
      // Curve should dip below 100 due to control points
      expect(result).toBeLessThan(100);
    });
  });

  describe('applyEasing', () => {
    it('should return linear value for "linear" easing', () => {
      expect(applyEasing(0.5, 'linear')).toBe(0.5);
      expect(applyEasing(0.25, 'linear')).toBe(0.25);
    });

    it('should return linear value when no easing specified', () => {
      expect(applyEasing(0.5, undefined)).toBe(0.5);
      expect(applyEasing(0.5)).toBe(0.5);
    });

    it('should clamp input to 0-1 range', () => {
      expect(applyEasing(-0.5, 'ease')).toBeGreaterThanOrEqual(0);
      expect(applyEasing(1.5, 'ease')).toBeLessThanOrEqual(1);
    });

    it('should return 0 at t=0 for all easing functions', () => {
      expect(applyEasing(0, 'ease')).toBe(0);
      expect(applyEasing(0, 'ease-in')).toBe(0);
      expect(applyEasing(0, 'ease-out')).toBe(0);
      expect(applyEasing(0, 'ease-in-out')).toBe(0);
    });

    it('should return 1 at t=1 for all easing functions', () => {
      expect(applyEasing(1, 'ease')).toBeCloseTo(1, 5);
      expect(applyEasing(1, 'ease-in')).toBeCloseTo(1, 5);
      expect(applyEasing(1, 'ease-out')).toBeCloseTo(1, 5);
      expect(applyEasing(1, 'ease-in-out')).toBeCloseTo(1, 5);
    });

    it('should apply ease-in (slow start)', () => {
      // ease-in should be below linear at t=0.5
      const easeInValue = applyEasing(0.5, 'ease-in');
      expect(easeInValue).toBeLessThan(0.5);
    });

    it('should apply ease-out (slow end)', () => {
      // ease-out should be above linear at t=0.5
      const easeOutValue = applyEasing(0.5, 'ease-out');
      expect(easeOutValue).toBeGreaterThan(0.5);
    });

    it('should apply ease-in-out (slow start and end)', () => {
      // ease-in-out should be approximately linear at t=0.5
      const easeInOutValue = applyEasing(0.5, 'ease-in-out');
      expect(easeInOutValue).toBeCloseTo(0.5, 1);
    });

    it('should parse custom cubic-bezier format', () => {
      // Custom linear bezier
      const linearResult = applyEasing(0.5, 'cubic-bezier(0, 0, 1, 1)');
      expect(linearResult).toBeCloseTo(0.5, 1);

      // Custom ease-like bezier
      const easeResult = applyEasing(0.5, 'cubic-bezier(0.25, 0.1, 0.25, 1.0)');
      expect(easeResult).toBeGreaterThan(0);
      expect(easeResult).toBeLessThan(1);
    });

    it('should fallback to linear for invalid easing', () => {
      expect(applyEasing(0.5, 'invalid-easing')).toBe(0.5);
      expect(applyEasing(0.5, 'not-a-function')).toBe(0.5);
    });
  });

  describe('interpolateSegment', () => {
    const createWaypoint = (x: number, y: number, overrides?: Partial<AnimationWaypoint>): AnimationWaypoint => ({
      x,
      y,
      duration: 1000,
      ...overrides,
    });

    describe('linear interpolation', () => {
      it('should interpolate position linearly', () => {
        const start = createWaypoint(0, 0);
        const end = createWaypoint(100, 100);

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.x).toBe(50);
        expect(result.y).toBe(50);
      });

      it('should return start position at progress=0', () => {
        const start = createWaypoint(10, 20);
        const end = createWaypoint(100, 200);

        const result = interpolateSegment(0, start, end, 'linear');
        expect(result.x).toBe(10);
        expect(result.y).toBe(20);
      });

      it('should return end position at progress=1', () => {
        const start = createWaypoint(10, 20);
        const end = createWaypoint(100, 200);

        const result = interpolateSegment(1, start, end, 'linear');
        expect(result.x).toBe(100);
        expect(result.y).toBe(200);
      });
    });

    describe('bezier interpolation', () => {
      it('should use bezier when control points are provided', () => {
        const start = createWaypoint(0, 0, {
          controlPoint2: { x: 50, y: 0 },
        });
        const end = createWaypoint(100, 100, {
          controlPoint1: { x: 50, y: 100 },
        });

        const result = interpolateSegment(0.5, start, end, 'bezier');
        // With these control points, the curve should not be straight
        expect(result.x).toBe(50); // x is at midpoint due to symmetric control
        expect(result.y).toBe(50); // y is at midpoint due to symmetric control
      });

      it('should fallback to linear if control points missing', () => {
        const start = createWaypoint(0, 0);
        const end = createWaypoint(100, 100);

        const result = interpolateSegment(0.5, start, end, 'bezier');
        expect(result.x).toBe(50);
        expect(result.y).toBe(50);
      });
    });

    describe('transform interpolation', () => {
      it('should interpolate scale', () => {
        const start = createWaypoint(0, 0, { scale: 1 });
        const end = createWaypoint(100, 100, { scale: 2 });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.scale).toBe(1.5);
      });

      it('should interpolate rotation', () => {
        const start = createWaypoint(0, 0, { rotation: 0 });
        const end = createWaypoint(100, 100, { rotation: 180 });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.rotation).toBe(90);
      });

      it('should interpolate opacity', () => {
        const start = createWaypoint(0, 0, { opacity: 1 });
        const end = createWaypoint(100, 100, { opacity: 0 });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.opacity).toBe(0.5);
      });

      it('should use default values for undefined transforms', () => {
        const start = createWaypoint(0, 0, { scale: undefined });
        const end = createWaypoint(100, 100, { scale: 2 });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.scale).toBe(1.5); // Default 1 to 2, midpoint is 1.5
      });

      it('should not include transform in result if neither waypoint defines it', () => {
        const start = createWaypoint(0, 0);
        const end = createWaypoint(100, 100);

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.scale).toBeUndefined();
        expect(result.rotation).toBeUndefined();
        expect(result.opacity).toBeUndefined();
      });
    });

    describe('flip properties', () => {
      it('should use start waypoint flipX value for entire segment', () => {
        const start = createWaypoint(0, 0, { flipX: true });
        const end = createWaypoint(100, 100, { flipX: false });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.flipX).toBe(true);
      });

      it('should use start waypoint flipY value for entire segment', () => {
        const start = createWaypoint(0, 0, { flipY: true });
        const end = createWaypoint(100, 100, { flipY: false });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.flipY).toBe(true);
      });
    });

    describe('sprite animation properties', () => {
      it('should use start waypoint sprite animation', () => {
        const start = createWaypoint(0, 0, { spriteAnimation: 'walk' });
        const end = createWaypoint(100, 100, { spriteAnimation: 'run' });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.spriteAnimation).toBe('walk');
      });

      it('should use start waypoint sprite frames', () => {
        const start = createWaypoint(0, 0, { spriteFrames: [0, 1, 2] });
        const end = createWaypoint(100, 100, { spriteFrames: [3, 4, 5] });

        const result = interpolateSegment(0.5, start, end, 'linear');
        expect(result.spriteFrames).toEqual([0, 1, 2]);
      });
    });

    describe('easing application', () => {
      it('should apply end waypoint easing to progress', () => {
        const start = createWaypoint(0, 0);
        const end = createWaypoint(100, 100, { easing: 'ease-in' });

        const result = interpolateSegment(0.5, start, end, 'linear');
        // ease-in produces value less than linear at t=0.5
        expect(result.x).toBeLessThan(50);
        expect(result.y).toBeLessThan(50);
      });
    });
  });

  describe('calculatePositionAtTime', () => {
    const createWaypoint = (x: number, y: number, duration: number, overrides?: Partial<AnimationWaypoint>): AnimationWaypoint => ({
      x,
      y,
      duration,
      ...overrides,
    });

    it('should return null for empty waypoints', () => {
      const result = calculatePositionAtTime([], 500, 'linear');
      expect(result).toBeNull();
    });

    it('should return single waypoint position for single waypoint', () => {
      const waypoints = [createWaypoint(50, 75, 0, { scale: 2, rotation: 45 })];

      const result = calculatePositionAtTime(waypoints, 500, 'linear');
      expect(result?.x).toBe(50);
      expect(result?.y).toBe(75);
      expect(result?.scale).toBe(2);
      expect(result?.rotation).toBe(45);
    });

    it('should calculate position at start of animation', () => {
      const waypoints = [
        createWaypoint(0, 0, 0),
        createWaypoint(100, 100, 1000),
      ];

      const result = calculatePositionAtTime(waypoints, 0, 'linear');
      expect(result?.x).toBe(0);
      expect(result?.y).toBe(0);
    });

    it('should calculate position at end of animation', () => {
      const waypoints = [
        createWaypoint(0, 0, 0),
        createWaypoint(100, 100, 1000),
      ];

      const result = calculatePositionAtTime(waypoints, 1000, 'linear');
      expect(result?.x).toBe(100);
      expect(result?.y).toBe(100);
    });

    it('should calculate position at midpoint of animation', () => {
      const waypoints = [
        createWaypoint(0, 0, 0),
        createWaypoint(100, 100, 1000),
      ];

      const result = calculatePositionAtTime(waypoints, 500, 'linear');
      expect(result?.x).toBe(50);
      expect(result?.y).toBe(50);
    });

    it('should handle multiple segments', () => {
      const waypoints = [
        createWaypoint(0, 0, 0),
        createWaypoint(100, 0, 1000),
        createWaypoint(100, 100, 1000),
      ];

      // At t=500, should be in first segment (0,0) to (100,0)
      const result1 = calculatePositionAtTime(waypoints, 500, 'linear');
      expect(result1?.x).toBe(50);
      expect(result1?.y).toBe(0);

      // At t=1500, should be in second segment (100,0) to (100,100)
      const result2 = calculatePositionAtTime(waypoints, 1500, 'linear');
      expect(result2?.x).toBe(100);
      expect(result2?.y).toBe(50);
    });

    it('should return last waypoint position when past end', () => {
      const waypoints = [
        createWaypoint(0, 0, 0),
        createWaypoint(100, 100, 1000),
      ];

      const result = calculatePositionAtTime(waypoints, 2000, 'linear');
      expect(result?.x).toBe(100);
      expect(result?.y).toBe(100);
    });

    it('should clear sprite animation when past end', () => {
      const waypoints = [
        createWaypoint(0, 0, 0, { spriteAnimation: 'walk' }),
        createWaypoint(100, 100, 1000, { spriteAnimation: 'idle' }),
      ];

      const result = calculatePositionAtTime(waypoints, 2000, 'linear');
      expect(result?.spriteAnimation).toBeUndefined();
    });

    it('should handle bezier interpolation type', () => {
      const waypoints = [
        createWaypoint(0, 0, 0, { controlPoint2: { x: 50, y: 0 } }),
        createWaypoint(100, 100, 1000, { controlPoint1: { x: 50, y: 100 } }),
      ];

      const result = calculatePositionAtTime(waypoints, 500, 'bezier');
      expect(result?.x).toBeDefined();
      expect(result?.y).toBeDefined();
    });

    it('should preserve transforms through path', () => {
      const waypoints = [
        createWaypoint(0, 0, 0, { scale: 1, opacity: 1 }),
        createWaypoint(100, 100, 1000, { scale: 2, opacity: 0.5 }),
      ];

      const result = calculatePositionAtTime(waypoints, 500, 'linear');
      expect(result?.scale).toBe(1.5);
      expect(result?.opacity).toBe(0.75);
    });
  });
});
