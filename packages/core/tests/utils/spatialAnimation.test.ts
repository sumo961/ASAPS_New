/**
 * Tests for spatialAnimation.ts — the responsive cinematic-motion
 * intent for the SPATIAL layer (ken-burns, pan, zoom, custom path).
 * Sibling of slotAnimation; same defensive-guard pattern.
 *
 * The interfaces are types-only with no runtime impl to test.
 * What we pin is the isSpatialAnimations type guard — it's the
 * boundary that prevents malformed data (especially arrays — the
 * legacy locations[] shape) from leaking into the spatial renderer
 * as silent layout bugs.
 */
import { describe, it, expect } from 'vitest';
import { isSpatialAnimations, type SpatialAnimations } from '../../src/utils/spatialAnimation';

describe('isSpatialAnimations', () => {
  it('accepts an empty object (no animations configured)', () => {
    // A beat with `spatialAnimations: {}` is honest — it's saying
    // "I know about the field, no preferences yet". Not an error.
    expect(isSpatialAnimations({})).toBe(true);
  });

  it('accepts an object with enter only', () => {
    const sa: SpatialAnimations = {
      enter: { preset: 'ken-burns', duration: 6000 },
    };
    expect(isSpatialAnimations(sa)).toBe(true);
  });

  it('accepts an object with exit only', () => {
    // Exit-only is a valid shape — fade the scene out before the
    // next beat takes over, no special intro.
    const sa: SpatialAnimations = {
      exit: { preset: 'zoom-out', duration: 800 },
    };
    expect(isSpatialAnimations(sa)).toBe(true);
  });

  it('accepts an object with both enter and exit', () => {
    const sa: SpatialAnimations = {
      enter: { preset: 'pan-left', intensity: 15 },
      exit: { preset: 'zoom-in', duration: 500 },
    };
    expect(isSpatialAnimations(sa)).toBe(true);
  });

  describe('rejects malformed shapes', () => {
    it('rejects null', () => {
      expect(isSpatialAnimations(null)).toBe(false);
    });

    it('rejects undefined (the common no-animations case)', () => {
      // Most beats don't have spatialAnimations at all. The guard
      // must return false so consumers fall back to no-animation
      // defaults rather than trying to read .enter on undefined.
      expect(isSpatialAnimations(undefined)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isSpatialAnimations('ken-burns')).toBe(false);
      expect(isSpatialAnimations(6000)).toBe(false);
      expect(isSpatialAnimations(true)).toBe(false);
    });

    it('rejects arrays — critical guard against the legacy locations[] shape', () => {
      // Same load-bearing rule as slotAnimations and slotIntent:
      // an array-typed value must NOT pass the guard. A stale
      // locations[] slipping through could confuse downstream code
      // into treating it as motion intent.
      expect(isSpatialAnimations([])).toBe(false);
      expect(isSpatialAnimations([{ preset: 'ken-burns' }])).toBe(false);
    });
  });

  describe('passes-through despite missing optional fields', () => {
    // Per the source: every field below `enter`/`exit` is optional.
    // The guard's job is shape (is it a plain object?), not
    // semantic validation. Missing duration / intensity / easing
    // / path must NOT disqualify.
    it('accepts an enter without duration', () => {
      expect(isSpatialAnimations({ enter: { preset: 'zoom-in' } })).toBe(true);
    });

    it('accepts an enter with an incomplete path preset', () => {
      // preset: 'path' technically requires a path field, but the
      // guard doesn't enforce that — the renderer falls back to
      // an empty path = no motion. Same shape, valid object.
      expect(isSpatialAnimations({
        enter: { preset: 'path' /* no path */ } as any,
      })).toBe(true);
    });
  });
});
