/**
 * Tests for slotIntent.ts — the soft, responsive layout annotation
 * model that's the data spine of intent-annotated responsive slots.
 *
 * The load-bearing invariant per the docstring: slotIntent must never
 * be confused with legacy baked-pixel locations[]. The defensive
 * guards isSlotIntent + slotIntentFor are what prevent malformed
 * data from leaking into the runtime as silent layout bugs.
 *
 * SlotAnchor, SlotIntentEntry, SlotIntent are types only — they have
 * no runtime impl to test. We focus on the two guard functions.
 */
import { describe, it, expect } from 'vitest';
import { isSlotIntent, slotIntentFor, type SlotIntent } from '../../src/utils/slotIntent';

describe('isSlotIntent', () => {
  it('accepts an empty object as a valid (no-intent) map', () => {
    // A beat that has slotIntent: {} is honest — it's saying "I
    // know about the field, no preferences yet". Not an error.
    expect(isSlotIntent({})).toBe(true);
  });

  it('accepts a populated object', () => {
    expect(isSlotIntent({
      title: { preferredLines: 2 },
      body: { anchor: { h: 'center', v: 'middle' } },
    })).toBe(true);
  });

  describe('rejects malformed shapes', () => {
    it('rejects null', () => {
      expect(isSlotIntent(null)).toBe(false);
    });

    it('rejects undefined', () => {
      // The common case: a beat without slotIntent at all. Must
      // return false so consumers fall back to flow defaults.
      expect(isSlotIntent(undefined)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isSlotIntent('intent')).toBe(false);
      expect(isSlotIntent(42)).toBe(false);
      expect(isSlotIntent(true)).toBe(false);
    });

    it('rejects arrays — critical guard', () => {
      // CRITICAL — the doc says slotIntent must NEVER be confused
      // with the legacy locations[] array. Arrays must be rejected
      // or a stale locations[] could silently feed downstream.
      expect(isSlotIntent([])).toBe(false);
      expect(isSlotIntent([{ kind: 'text', x: 100 }])).toBe(false);
    });
  });
});

describe('slotIntentFor', () => {
  describe('happy path', () => {
    it('returns the intent entry for the requested slot', () => {
      const intent: SlotIntent = {
        title: { preferredLines: 2 },
        body: { anchor: { h: 'center', v: 'middle' } },
      };
      expect(slotIntentFor(intent, 'title')).toEqual({ preferredLines: 2 });
      expect(slotIntentFor(intent, 'body')).toEqual({ anchor: { h: 'center', v: 'middle' } });
    });

    it('returns undefined for a slot with no entry', () => {
      const intent: SlotIntent = { title: { preferredLines: 2 } };
      expect(slotIntentFor(intent, 'body')).toBeUndefined();
    });
  });

  describe('tolerates malformed input', () => {
    it('returns undefined when the whole slotIntent is missing', () => {
      expect(slotIntentFor(undefined, 'title')).toBeUndefined();
      expect(slotIntentFor(null, 'title')).toBeUndefined();
    });

    it('returns undefined when slotIntent is the wrong type', () => {
      expect(slotIntentFor('intent', 'title')).toBeUndefined();
      expect(slotIntentFor(42, 'title')).toBeUndefined();
      expect(slotIntentFor([], 'title')).toBeUndefined();
    });

    it('returns undefined when the matching key is not an object', () => {
      // Defensive — an AI emission might give us
      // { title: "two lines please" } instead of an entry object.
      // Returning undefined means downstream falls back to flow
      // defaults instead of crashing on .preferredLines etc.
      const intent = { title: 'two lines please' } as any;
      expect(slotIntentFor(intent, 'title')).toBeUndefined();
    });

    it('returns undefined for null slot value', () => {
      const intent = { title: null } as any;
      expect(slotIntentFor(intent, 'title')).toBeUndefined();
    });

    it('returns the entry for any non-array object value', () => {
      // The check is just `typeof === 'object'` after the array
      // guard at the top level — a sub-entry that's missing all
      // documented fields still counts as "valid empty intent" and
      // gets returned as-is. The renderer treats absent fields as
      // "no preference".
      const intent = { title: {} } as SlotIntent;
      expect(slotIntentFor(intent, 'title')).toEqual({});
    });
  });

  it('does not mutate the input', () => {
    const intent: SlotIntent = { title: { preferredLines: 2 } };
    const snapshot = JSON.parse(JSON.stringify(intent));
    slotIntentFor(intent, 'title');
    slotIntentFor(intent, 'body');
    slotIntentFor(intent, 'nonexistent');
    expect(intent).toEqual(snapshot);
  });
});
