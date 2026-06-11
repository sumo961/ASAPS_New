/**
 * Tests for hotspot.ts — normalized 0-1 clickable regions on the
 * spatial layer, with optional portrait orientation override (P3-3e).
 *
 * isHotspot is the storage→runtime defensive guard (legacy projects
 * may have missing fields, AI-generated projects may have malformed
 * shapes). resolveHotspotRect picks the right rect for orientation.
 */
import { describe, it, expect } from 'vitest';
import { isHotspot, resolveHotspotRect, type Hotspot } from '../../src/utils/hotspot';

describe('isHotspot', () => {
  it('accepts a minimal valid hotspot', () => {
    expect(isHotspot({ id: 'door', x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(true);
  });

  it('accepts a full hotspot with all optionals', () => {
    expect(isHotspot({
      id: 'door',
      x: 0.1, y: 0.2, width: 0.3, height: 0.4,
      label: 'Front door',
      shape: 'ellipse',
      portrait: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
      rotation: 45,
      fromProp: true,
      triggerName: 'door',
    })).toBe(true);
  });

  describe('rejects malformed shapes', () => {
    it('rejects null', () => {
      expect(isHotspot(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isHotspot(undefined)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isHotspot('door')).toBe(false);
      expect(isHotspot(42)).toBe(false);
      expect(isHotspot(true)).toBe(false);
    });

    it('rejects arrays', () => {
      expect(isHotspot([])).toBe(false);
      expect(isHotspot([1, 2, 3])).toBe(false);
    });

    it('rejects when id is missing', () => {
      expect(isHotspot({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    });

    it('rejects when id is non-string', () => {
      expect(isHotspot({ id: 42, x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    });

    it('rejects when any coordinate is missing', () => {
      expect(isHotspot({ id: 'a', y: 0, width: 1, height: 1 })).toBe(false);
      expect(isHotspot({ id: 'a', x: 0, width: 1, height: 1 })).toBe(false);
      expect(isHotspot({ id: 'a', x: 0, y: 0, height: 1 })).toBe(false);
      expect(isHotspot({ id: 'a', x: 0, y: 0, width: 1 })).toBe(false);
    });

    it('rejects when any coordinate is non-numeric', () => {
      // Critical — legacy AI projects sometimes emit string
      // coordinates ('0.5'). The guard catches this before the
      // renderer tries to do arithmetic on them.
      expect(isHotspot({ id: 'a', x: '0', y: 0, width: 1, height: 1 })).toBe(false);
      expect(isHotspot({ id: 'a', x: 0, y: null, width: 1, height: 1 })).toBe(false);
    });
  });

  it('does NOT validate coordinate ranges (0-1)', () => {
    // The guard is a SHAPE check, not a VALUE check. The renderer
    // tolerates out-of-range values (will just clip / overshoot the
    // image); the guard's job is only to ensure we have the right
    // FIELDS to do arithmetic on. Out-of-range values must pass.
    expect(isHotspot({ id: 'a', x: -1, y: 2, width: 99, height: -5 })).toBe(true);
  });

  it('does NOT validate optional fields when present-but-malformed', () => {
    // Same reason — shape check, not value check. A bad label/shape
    // doesn't disqualify the object from being recognized.
    expect(isHotspot({ id: 'a', x: 0, y: 0, width: 1, height: 1, label: 42 })).toBe(true);
  });
});

describe('resolveHotspotRect', () => {
  const base: Hotspot = {
    id: 'door',
    x: 0.7, y: 0.2, width: 0.1, height: 0.3,  // upper-right
  };

  describe('landscape context', () => {
    it('returns the canonical x/y/width/height', () => {
      expect(resolveHotspotRect(base, false)).toEqual({
        x: 0.7, y: 0.2, width: 0.1, height: 0.3,
      });
    });

    it('ignores a portrait override when landscape', () => {
      const withOverride: Hotspot = {
        ...base,
        portrait: { x: 0.4, y: 0.8, width: 0.1, height: 0.1 },
      };
      // Landscape context — portrait override is irrelevant.
      expect(resolveHotspotRect(withOverride, false)).toEqual({
        x: 0.7, y: 0.2, width: 0.1, height: 0.3,
      });
    });
  });

  describe('portrait context', () => {
    it('returns the canonical rect when no portrait override is set', () => {
      // Zero-regression contract from the docstring: existing
      // hotspots without an override render in both orientations
      // using the landscape values.
      expect(resolveHotspotRect(base, true)).toEqual({
        x: 0.7, y: 0.2, width: 0.1, height: 0.3,
      });
    });

    it('returns the portrait override when present', () => {
      // The motivating example: a door in upper-right of the wide
      // shot moves to lower-right of the portrait crop. Different
      // values, no separate beat needed.
      const withOverride: Hotspot = {
        ...base,
        portrait: { x: 0.4, y: 0.8, width: 0.1, height: 0.1 },
      };
      expect(resolveHotspotRect(withOverride, true)).toEqual({
        x: 0.4, y: 0.8, width: 0.1, height: 0.1,
      });
    });
  });

  describe('purity', () => {
    it('does not mutate the input hotspot', () => {
      const original: Hotspot = {
        id: 'door',
        x: 0.1, y: 0.2, width: 0.3, height: 0.4,
        portrait: { x: 0.5, y: 0.6, width: 0.7, height: 0.8 },
      };
      const snapshot = JSON.parse(JSON.stringify(original));
      resolveHotspotRect(original, true);
      resolveHotspotRect(original, false);
      expect(original).toEqual(snapshot);
    });

    it('returns a fresh object each call (safe to spread into styles)', () => {
      const h = { ...base, portrait: { x: 0.4, y: 0.8, width: 0.1, height: 0.1 } };
      const a = resolveHotspotRect(h, true);
      const b = resolveHotspotRect(h, true);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
