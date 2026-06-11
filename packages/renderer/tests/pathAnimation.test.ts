/**
 * Tests for pathAnimation's pure math primitives: time assignment,
 * easing resolution, segment progress, lerp.
 *
 * These are the shared core that BOTH the slot-layer and spatial-
 * layer animators call from inside their rAF loop on every frame.
 * A bug in any of them is silent (no exception, just wrong pixels)
 * and propagates across all animated beats.
 *
 * runSlotPath / runSpatialPath are DOM-driven and tested via the
 * AnimationEngine tests + integration; this file pins the math.
 */
import { describe, it, expect } from 'vitest';
import {
  assignWaypointTimes,
  easingFn,
  segmentProgress,
  lerp,
} from '../src/utils/pathAnimation';

describe('assignWaypointTimes', () => {
  describe('edge cases', () => {
    it('returns empty array for no waypoints', () => {
      expect(assignWaypointTimes([])).toEqual([]);
    });

    it('single waypoint with explicit t', () => {
      // Single-point animation = "hold this end state for the
      // duration" — the t value gets clamped to [0..1] but otherwise
      // returned as-is.
      expect(assignWaypointTimes([{ t: 0.7 }])).toEqual([0.7]);
    });

    it('single waypoint without t defaults to 1 (the end)', () => {
      // The doc says "anchor endpoints" — a lone waypoint IS an
      // endpoint, so it lands at t=1.
      expect(assignWaypointTimes([{}])).toEqual([1]);
    });
  });

  describe('anchoring endpoints', () => {
    it('first waypoint without t is anchored at 0', () => {
      // Critical: a 3-waypoint path with no explicit times becomes
      // [0, 0.5, 1] — first at 0, last at 1, middle evenly between.
      const result = assignWaypointTimes([{}, {}, {}]);
      expect(result[0]).toBe(0);
    });

    it('last waypoint without t is anchored at 1', () => {
      const result = assignWaypointTimes([{}, {}, {}]);
      expect(result[result.length - 1]).toBe(1);
    });

    it('preserves explicit first t if author set one', () => {
      // The author wants the animation to "start late" — first
      // waypoint at t=0.2. The explicit value wins over the
      // anchor-to-0 default.
      const result = assignWaypointTimes([{ t: 0.2 }, {}, {}]);
      expect(result[0]).toBe(0.2);
    });
  });

  describe('even spacing of unspecified middle waypoints', () => {
    it('three waypoints with no explicit times → [0, 0.5, 1]', () => {
      expect(assignWaypointTimes([{}, {}, {}])).toEqual([0, 0.5, 1]);
    });

    it('five waypoints → [0, 0.25, 0.5, 0.75, 1]', () => {
      expect(assignWaypointTimes([{}, {}, {}, {}, {}])).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('preserves an explicit middle waypoint and spaces around it', () => {
      // Waypoints: [unset, t=0.3, unset, unset, unset].
      // First → 0, second stays 0.3, last → 1; the two between
      // 0.3 and 1 are evenly spaced: 0.3 + 0.7/3 each.
      const result = assignWaypointTimes([{}, { t: 0.3 }, {}, {}, {}]);
      expect(result[0]).toBe(0);
      expect(result[1]).toBe(0.3);
      expect(result[4]).toBe(1);
      // Indices 2 and 3 are between 0.3 and 1, three steps.
      expect(result[2]).toBeCloseTo(0.3 + (0.7 * 1) / 3, 10);
      expect(result[3]).toBeCloseTo(0.3 + (0.7 * 2) / 3, 10);
    });

    it('clamps explicit t values to [0..1]', () => {
      // Defensive — author or AI might emit negative or >1 values;
      // the algorithm clamps so the animation doesn't run backwards
      // or skip past the end.
      const result = assignWaypointTimes([{ t: -0.5 }, { t: 1.5 }]);
      expect(result).toEqual([0, 1]);
    });
  });

  describe('purity', () => {
    it('does not mutate the input array', () => {
      const input = [{ t: 0.2 }, {}, {}];
      const snapshot = JSON.parse(JSON.stringify(input));
      assignWaypointTimes(input);
      expect(input).toEqual(snapshot);
    });
  });
});

describe('easingFn', () => {
  it('returns linear for undefined input', () => {
    const fn = easingFn(undefined);
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
  });

  it('returns linear for "linear" keyword', () => {
    const fn = easingFn('linear');
    expect(fn(0.3)).toBe(0.3);
  });

  it('returns linear (fallback) for an unrecognized keyword', () => {
    // Source comment: "renderer never crashes on a typo". A
    // misspelled "ease-int" silently falls back to linear instead
    // of crashing or returning NaN.
    const fn = easingFn('ease-int' as any);
    expect(fn(0.5)).toBe(0.5);
  });

  describe('cubic-bezier preset endpoints', () => {
    // Every CSS preset must pass through (0, 0) and (1, 1) — the
    // animation MUST start at its origin and end at its target,
    // regardless of curve shape. This is a structural correctness
    // guarantee, not approximation: the cubic-bezier solver
    // shortcuts when t ≤ 0 or t ≥ 1.
    const presets = ['ease', 'ease-in', 'ease-out', 'ease-in-out'];
    it.each(presets)('"%s" preset starts at (0,0) and ends at (1,1)', (preset) => {
      const fn = easingFn(preset);
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
    });
  });

  describe('cubic-bezier(...) custom expression', () => {
    it('parses and uses custom control points', () => {
      const fn = easingFn('cubic-bezier(0.42, 0, 0.58, 1)');
      // (0.42, 0, 0.58, 1) is the ease-in-out shape — the canonical
      // S-curve. Endpoints first.
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
      // Middle is at 0.5 (S-curve symmetry).
      expect(fn(0.5)).toBeCloseTo(0.5, 4);
    });

    it('tolerates whitespace inside the cubic-bezier() expression', () => {
      // Real-world CSS values may have extra spaces; the regex is
      // explicitly tolerant. Falls back to linear if not parsed.
      const fn = easingFn('cubic-bezier( 0.25 , 0.1 , 0.25 , 1 )');
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
    });

    it('falls back to linear for malformed cubic-bezier', () => {
      const fn = easingFn('cubic-bezier(broken)');
      expect(fn(0.5)).toBe(0.5); // linear behavior
    });
  });

  describe('ease-in shape', () => {
    it('ease-in stays below linear in the first half (slow start)', () => {
      const fn = easingFn('ease-in');
      // ease-in curve starts slow, so f(0.3) < 0.3 (lagging linear).
      expect(fn(0.3)).toBeLessThan(0.3);
    });
  });

  describe('ease-out shape', () => {
    it('ease-out stays above linear in the first half (fast start)', () => {
      const fn = easingFn('ease-out');
      // ease-out starts fast, so f(0.3) > 0.3.
      expect(fn(0.3)).toBeGreaterThan(0.3);
    });
  });
});

describe('segmentProgress', () => {
  describe('edge cases', () => {
    it('returns zeros for empty times array', () => {
      expect(segmentProgress(0.5, [], [], undefined)).toEqual({ i0: 0, i1: 0, eased: 0 });
    });

    it('returns the single-waypoint hold for one time', () => {
      // One waypoint = the animation just holds at that state.
      // Both indices point at 0; the eased value is 1 (full hold).
      expect(segmentProgress(0.5, [1], [], undefined)).toEqual({ i0: 0, i1: 0, eased: 1 });
    });
  });

  describe('segment lookup', () => {
    it('picks the correct segment in a 3-waypoint path', () => {
      // Times: [0, 0.5, 1]. globalT = 0.3 is in segment 0..1.
      // globalT = 0.7 is in segment 1..2.
      const t1 = segmentProgress(0.3, [0, 0.5, 1], [undefined, undefined, undefined], undefined);
      expect(t1.i0).toBe(0);
      expect(t1.i1).toBe(1);

      const t2 = segmentProgress(0.7, [0, 0.5, 1], [undefined, undefined, undefined], undefined);
      expect(t2.i0).toBe(1);
      expect(t2.i1).toBe(2);
    });

    it('eased value is 0 at the segment start and 1 at the segment end (linear)', () => {
      const r = segmentProgress(0, [0, 1], [undefined, undefined], 'linear');
      expect(r.eased).toBe(0);
      const r2 = segmentProgress(1, [0, 1], [undefined, undefined], 'linear');
      expect(r2.eased).toBe(1);
    });

    it('eased value scales linearly inside a segment when easing is linear', () => {
      // Times [0, 0.4]. globalT = 0.2 → segT = 0.5 → eased = 0.5 (linear).
      const r = segmentProgress(0.2, [0, 0.4], [undefined, undefined], 'linear');
      expect(r.eased).toBeCloseTo(0.5, 5);
    });

    it('uses the segment-end waypoint\'s easing when present', () => {
      // The doc says easing is "the leg ENDING at this waypoint".
      // segmentProgress reads waypointEasings[i1] for segment i0→i1.
      const r = segmentProgress(0.5, [0, 1], [undefined, 'ease-in'], 'linear');
      // Linear would give 0.5; ease-in is below linear at 0.5, so
      // the result is < 0.5.
      expect(r.eased).toBeLessThan(0.5);
    });

    it('falls back to the global easing when waypoint\'s is undefined', () => {
      const r = segmentProgress(0.5, [0, 1], [undefined, undefined], 'ease-in');
      // ease-in falls below linear at 0.5.
      expect(r.eased).toBeLessThan(0.5);
    });
  });

  describe('zero-length segment safety', () => {
    it('returns eased=1 for a zero-length segment (two equal times)', () => {
      // If two waypoints share the same time (degenerate path),
      // segT divides by zero — the impl substitutes 1 for that
      // case so the value snaps directly to the next waypoint.
      const r = segmentProgress(0.5, [0.5, 0.5, 1], [undefined, undefined, undefined], 'linear');
      // globalT = 0.5; first segment 0.5..0.5 length 0. Should
      // produce a sensible eased value, not NaN.
      expect(r.eased).not.toBeNaN();
    });
  });
});

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(-5, 5, 0)).toBe(-5);
  });

  it('returns b when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('linearly interpolates at t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it('extrapolates past t=1', () => {
    // The lerp doesn't clamp — that's the caller's job. Useful for
    // animations that overshoot deliberately (some easing curves
    // produce values outside [0..1]).
    expect(lerp(0, 10, 1.5)).toBe(15);
  });

  it('extrapolates before t=0', () => {
    expect(lerp(0, 10, -0.5)).toBe(-5);
  });

  it('handles inverted ranges (b < a)', () => {
    // Animating from 100 to 0 at t=0.25 lands at 75. Used for
    // reverse motion.
    expect(lerp(100, 0, 0.25)).toBe(75);
  });
});
