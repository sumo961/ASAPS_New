/**
 * Tests for slotAnimation.ts — the responsive motion-intent guards.
 * Same defensive pattern as slotIntent: legacy projects, AI emissions,
 * and serialized JSON all carry slotAnimations of unknown shape.
 *
 * These are intentionally TYPE-LEVEL tests of the guards
 * (isSlotAnimations + slotAnimationsFor); the SlotAnimation /
 * SlotPath / SlotWaypoint interfaces are types-only with no runtime
 * impl to test.
 */
import { describe, it, expect } from 'vitest';
import { isSlotAnimations, slotAnimationsFor, type SlotAnimations } from '../../src/utils/slotAnimation';

describe('isSlotAnimations', () => {
  it('accepts an empty object (no animations yet)', () => {
    expect(isSlotAnimations({})).toBe(true);
  });

  it('accepts a populated object', () => {
    const sa: SlotAnimations = {
      title: { enter: { preset: 'fade', duration: 400 } },
      body: { exit: { preset: 'fade' } },
    };
    expect(isSlotAnimations(sa)).toBe(true);
  });

  describe('rejects malformed shapes', () => {
    it('rejects null', () => {
      expect(isSlotAnimations(null)).toBe(false);
    });

    it('rejects undefined (the common no-animations case)', () => {
      expect(isSlotAnimations(undefined)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isSlotAnimations('fade')).toBe(false);
      expect(isSlotAnimations(400)).toBe(false);
      expect(isSlotAnimations(true)).toBe(false);
    });

    it('rejects arrays — same critical guard as slotIntent', () => {
      // The data model is "map of slot-name → entry", never an
      // array. An array-typed value sneaking through could be
      // misinterpreted as a SlotAnimation[] in some consumer.
      expect(isSlotAnimations([])).toBe(false);
      expect(isSlotAnimations([{ preset: 'fade' }])).toBe(false);
    });
  });
});

describe('slotAnimationsFor', () => {
  describe('happy path', () => {
    it('returns the entry for the requested slot', () => {
      const sa: SlotAnimations = {
        title: { enter: { preset: 'fade', duration: 400 } },
        body: { exit: { preset: 'slide-in-left' } },
      };
      expect(slotAnimationsFor(sa, 'title')).toEqual({
        enter: { preset: 'fade', duration: 400 },
      });
      expect(slotAnimationsFor(sa, 'body')).toEqual({
        exit: { preset: 'slide-in-left' },
      });
    });

    it('returns undefined for a slot with no entry', () => {
      const sa: SlotAnimations = { title: { enter: { preset: 'fade' } } };
      expect(slotAnimationsFor(sa, 'body')).toBeUndefined();
    });
  });

  describe('defensive against malformed input', () => {
    it('returns undefined when slotAnimations is missing entirely', () => {
      expect(slotAnimationsFor(undefined, 'title')).toBeUndefined();
      expect(slotAnimationsFor(null, 'title')).toBeUndefined();
    });

    it('returns undefined when slotAnimations is the wrong type', () => {
      expect(slotAnimationsFor('animations', 'title')).toBeUndefined();
      expect(slotAnimationsFor(42, 'title')).toBeUndefined();
      expect(slotAnimationsFor([], 'title')).toBeUndefined();
    });

    it('returns undefined when the matching key is a non-object', () => {
      // Same defensive case as slotIntent: AI might emit
      // { title: 'fade' } shorthand. Returning undefined falls back
      // to no-animation instead of crashing on .enter etc.
      const sa = { title: 'fade' } as any;
      expect(slotAnimationsFor(sa, 'title')).toBeUndefined();
    });

    it('returns undefined for a null slot value', () => {
      const sa = { title: null } as any;
      expect(slotAnimationsFor(sa, 'title')).toBeUndefined();
    });

    it('returns an empty entry object as-is', () => {
      // An entry like {} is valid — "no enter/exit/emphasis
      // configured, but the slot is on the map". Returning it
      // doesn't break consumers because they read .enter / .exit /
      // .emphasis with optional chaining.
      const sa: SlotAnimations = { title: {} };
      expect(slotAnimationsFor(sa, 'title')).toEqual({});
    });
  });

  it('does not mutate the input', () => {
    const sa: SlotAnimations = {
      title: { enter: { preset: 'fade', duration: 400 } },
    };
    const snapshot = JSON.parse(JSON.stringify(sa));
    slotAnimationsFor(sa, 'title');
    slotAnimationsFor(sa, 'body');
    slotAnimationsFor(sa, 'nonexistent');
    expect(sa).toEqual(snapshot);
  });
});
