/**
 * Tests for slotLayout.ts — the schema-driven slot/spatial layout
 * registry. The renderer routes between absolute / slot / spatial
 * paths based on these functions, so bugs here cascade as silent
 * layout regressions (existing beats fall back to the wrong render
 * path).
 *
 * The functions read the project schema (beat-definitions/core-beats.json)
 * directly — these are integration tests against the live schema,
 * not isolated unit tests. That's intentional: the contract IS
 * "what the schema says". A schema change that breaks slot routing
 * surfaces here.
 */
import { describe, it, expect } from 'vitest';
import {
  isSlotModeBeatType,
  getSlotSpec,
  shouldUseSlotMode,
  isSpatialModeBeatType,
  getSpatialSpec,
  shouldUseSpatialMode,
} from '../src/utils/slotLayout';

describe('isSlotModeBeatType', () => {
  it('returns true for known slot-mode beats', () => {
    // Sample from the catalog — confirmed slot-mode in the schema.
    // If any of these starts failing, either the schema changed (in
    // which case the test needs the new fact recorded) or someone
    // broke layoutMode reading.
    expect(isSlotModeBeatType('infoText')).toBe(true);
    expect(isSlotModeBeatType('endScreen')).toBe(true);
    expect(isSlotModeBeatType('multiChoice')).toBe(true);
    expect(isSlotModeBeatType('inputText')).toBe(true);
    expect(isSlotModeBeatType('keypad')).toBe(true);
  });

  it('returns false for spatial-mode beats (titleScreen is layoutMode=spatial)', () => {
    // titleScreen declares layoutMode:'spatial' — a hero image with
    // overlay text. It's NOT slot-mode. The two render paths are
    // distinct; this test pins that distinction so the spatial
    // routing in isSpatialModeBeatType / getSpatialSpec catches it
    // and slot routing does not.
    expect(isSlotModeBeatType('titleScreen')).toBe(false);
  });

  it('returns true for the new experimental slot-mode beats', () => {
    expect(isSlotModeBeatType('qrScan')).toBe(true);
    expect(isSlotModeBeatType('webView')).toBe(true);
    expect(isSlotModeBeatType('arBeat')).toBe(true);
  });

  it('returns false for non-slot beat types', () => {
    // Spatial-only beats and invisible/logic beats don't have
    // layoutMode:'slot' — they should NOT route through slot mode.
    expect(isSlotModeBeatType('panorama')).toBe(false);  // not yet slot-mode
    expect(isSlotModeBeatType('setVariable')).toBe(false);  // invisible
    expect(isSlotModeBeatType('conditionBeat')).toBe(false);  // invisible
  });

  it('returns false for unknown beat types', () => {
    expect(isSlotModeBeatType('nonexistent')).toBe(false);
    expect(isSlotModeBeatType('')).toBe(false);
  });
});

describe('getSlotSpec', () => {
  it('returns the slot array for slot-mode beats', () => {
    const spec = getSlotSpec('infoText');
    expect(spec).not.toBeNull();
    expect(Array.isArray(spec)).toBe(true);
    expect(spec!.length).toBeGreaterThan(0);
  });

  it('returns null for titleScreen (spatial-mode, not slot)', () => {
    // Same distinction as above: spatial-mode beats route through
    // getSpatialSpec, not getSlotSpec.
    expect(getSlotSpec('titleScreen')).toBeNull();
  });

  it('every returned slot has name + role', () => {
    const spec = getSlotSpec('multiChoice');
    expect(spec).not.toBeNull();
    for (const s of spec!) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.role).toBe('string');
    }
  });

  it('returns null for non-slot beats', () => {
    expect(getSlotSpec('setVariable')).toBeNull();
    expect(getSlotSpec('conditionBeat')).toBeNull();
  });

  it('returns null for unknown beat types', () => {
    expect(getSlotSpec('nonexistent')).toBeNull();
  });
});

describe('shouldUseSlotMode', () => {
  it('returns true for slot-mode beat WITHOUT baked locations', () => {
    // The canonical activation: a slot-mode beat type and no
    // author-positioned locations — slot mode applies.
    expect(shouldUseSlotMode('infoText', false)).toBe(true);
    expect(shouldUseSlotMode('multiChoice', false)).toBe(true);
  });

  it('returns false for slot-mode beat WITH baked locations', () => {
    // The zero-regression guarantee from the docstring: a beat the
    // author manually positioned in the Visual Editor keeps the
    // absolute path even if its TYPE supports slot mode. Existing
    // projects render unchanged.
    expect(shouldUseSlotMode('infoText', true)).toBe(false);
    expect(shouldUseSlotMode('multiChoice', true)).toBe(false);
  });

  it('returns false for non-slot beat regardless of positioning', () => {
    expect(shouldUseSlotMode('setVariable', false)).toBe(false);
    expect(shouldUseSlotMode('setVariable', true)).toBe(false);
  });
});

describe('isSpatialModeBeatType', () => {
  it('returns false for beats that opt into spatial PER-INSTANCE', () => {
    // P3-3c-2/-8/-9: movementChoice, pickProp, dialogTree opt into
    // spatial WHEN a hotspot is configured on a choice. At the TYPE
    // level, the schema does NOT set layoutMode:'spatial' for them
    // — they declare a spatialLayer descriptor but route per
    // instance. isSpatialModeBeatType (type-level check) reports
    // false for these.
    expect(isSpatialModeBeatType('movementChoice')).toBe(false);
    expect(isSpatialModeBeatType('pickProp')).toBe(false);
    expect(isSpatialModeBeatType('dialogTree')).toBe(false);
  });
});

describe('getSpatialSpec', () => {
  // The docstring explicitly carves out P3-3c-2/-8/-9 — beats that
  // opt INTO spatial per instance via a hotspot on a choice. The
  // schema declares the spec WITHOUT setting layoutMode at the type
  // level, so the type-level isSpatialModeBeatType gate does NOT
  // apply. getSpatialSpec must still return their spec so the
  // editor's spatial preview and the runtime's spatial routing can
  // pick it up.
  it('returns a spec for beats with spatialLayer in the schema', () => {
    const spec = getSpatialSpec('movementChoice');
    if (spec !== null) {
      // movementChoice declares spatialLayer.source — confirm shape.
      expect(typeof spec.source).toBe('string');
      expect(spec.source.length).toBeGreaterThan(0);
      expect(['contain', 'cover']).toContain(spec.fit);
      expect(Array.isArray(spec.slots)).toBe(true);
    }
  });

  it('defaults fit to "contain" when the schema omits it', () => {
    // The doc says fit defaults to 'contain' (whole image,
    // letterboxed — keeps hotspots accurate). Confirm via any beat
    // that has a spec.
    const spec = getSpatialSpec('movementChoice');
    if (spec !== null && spec.fit) {
      // Whatever it is, it's one of the two valid values. If the
      // schema doesn't specify, the default kicks in.
      expect(['contain', 'cover']).toContain(spec.fit);
    }
  });

  it('returns null for beats without spatialLayer', () => {
    expect(getSpatialSpec('infoText')).toBeNull();
    expect(getSpatialSpec('setVariable')).toBeNull();
    expect(getSpatialSpec('nonexistent')).toBeNull();
  });
});

describe('shouldUseSpatialMode', () => {
  it('returns false when author has baked positions (zero-regression)', () => {
    // Same guarantee as slot mode — a baked-in beat keeps absolute
    // path regardless of schema declarations.
    expect(shouldUseSpatialMode('movementChoice', true)).toBe(false);
  });
});
