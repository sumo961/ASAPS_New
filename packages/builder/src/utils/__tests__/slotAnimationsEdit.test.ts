/**
 * Tests for mergeSlotAnimations — pure merge for Visual Editor's
 * slotAnimations tab. Called per-edit; persisted via the normal
 * beat-param command path. Wrong behavior here loses animation
 * settings or silently re-enables ones the author tried to clear.
 *
 * Coverage focus:
 *   - `partial === null` removes the slot's entire entry
 *   - shallow merges otherwise
 *   - null/undefined sub-keys drop just that sub-slot
 *   - empty entry (no sub-keys) drops the whole slot
 *   - no remaining slots returns undefined (absent → no animation)
 *   - never mutates input
 *   - input not a plain object is treated as empty base
 */
import { describe, it, expect } from 'vitest';
import { mergeSlotAnimations } from '../slotAnimationsEdit';

describe('mergeSlotAnimations', () => {
  describe('partial === null (slot removal)', () => {
    it('removes the slot entirely', () => {
      const prev = {
        text: { enter: { preset: 'fade' } as any },
        button: { enter: { preset: 'slide' } as any },
      };
      const result = mergeSlotAnimations(prev as any, 'text', null);
      expect(result).toEqual({ button: { enter: { preset: 'slide' } } });
    });

    it('removing the only slot returns undefined (no animations)', () => {
      // Critical contract: absent ≠ empty object. The renderer
      // checks `if (slotAnimations)` to decide whether to wire
      // up the animation system — an empty {} would mount the
      // system and do nothing.
      const prev = { text: { enter: { preset: 'fade' } as any } };
      expect(mergeSlotAnimations(prev as any, 'text', null)).toBeUndefined();
    });

    it('removing a non-existent slot is a no-op (but still returns the existing)', () => {
      const prev = { text: { enter: { preset: 'fade' } as any } };
      const result = mergeSlotAnimations(prev as any, 'unknown_slot', null);
      expect(result).toEqual(prev);
    });
  });

  describe('shallow merge', () => {
    it('merges partial onto existing entry', () => {
      const prev = {
        text: { enter: { preset: 'fade' } as any },
      };
      const result = mergeSlotAnimations(prev as any, 'text', {
        exit: { preset: 'fade' } as any,
      });
      expect(result).toEqual({
        text: {
          enter: { preset: 'fade' },
          exit: { preset: 'fade' },
        },
      });
    });

    it('partial fields replace existing fields with the same key', () => {
      const prev = {
        text: { enter: { preset: 'fade' } as any },
      };
      const result = mergeSlotAnimations(prev as any, 'text', {
        enter: { preset: 'slide' } as any,
      });
      expect((result as any).text.enter.preset).toBe('slide');
    });

    it('creates a new slot when not previously present', () => {
      const prev = { text: { enter: { preset: 'fade' } as any } };
      const result = mergeSlotAnimations(prev as any, 'button', {
        enter: { preset: 'slide' } as any,
      });
      expect((result as any).button.enter.preset).toBe('slide');
      // Original slot untouched.
      expect((result as any).text.enter.preset).toBe('fade');
    });

    it('handles undefined prev (creates the map)', () => {
      const result = mergeSlotAnimations(undefined, 'text', {
        enter: { preset: 'fade' } as any,
      });
      expect((result as any).text.enter.preset).toBe('fade');
    });
  });

  describe('null/undefined sub-keys', () => {
    it('null sub-key drops just that sub-slot', () => {
      // `enter: null` is the "clear the enter animation" UI gesture
      // — leaves the rest of the slot's entries intact.
      const prev = {
        text: {
          enter: { preset: 'fade' } as any,
          exit: { preset: 'fade' } as any,
        },
      };
      const result = mergeSlotAnimations(prev as any, 'text', { enter: null } as any);
      expect((result as any).text).toEqual({ exit: { preset: 'fade' } });
    });

    it('undefined sub-key also drops', () => {
      const prev = {
        text: { enter: { preset: 'fade' } as any, exit: { preset: 'fade' } as any },
      };
      const result = mergeSlotAnimations(prev as any, 'text', { enter: undefined as any });
      expect((result as any).text).toEqual({ exit: { preset: 'fade' } });
    });

    it('clearing all sub-keys removes the whole slot', () => {
      // Author cleared enter, then exit → slot is now empty →
      // drop it entirely. Skip the "Object.keys(merged).length === 0"
      // edge case at our own peril.
      const prev = {
        text: { enter: { preset: 'fade' } as any },
        button: { enter: { preset: 'slide' } as any },
      };
      const result = mergeSlotAnimations(prev as any, 'text', { enter: null } as any);
      expect(result).toEqual({ button: { enter: { preset: 'slide' } } });
    });

    it('clearing the only slot\'s only sub-key returns undefined', () => {
      const prev = { text: { enter: { preset: 'fade' } as any } };
      const result = mergeSlotAnimations(prev as any, 'text', { enter: null } as any);
      expect(result).toBeUndefined();
    });
  });

  describe('input shape defensiveness', () => {
    it('treats non-object prev as empty base', () => {
      // A serialization bug or legacy import might leave the
      // value as an array or primitive. Don't trust the type.
      const result = mergeSlotAnimations([] as any, 'text', {
        enter: { preset: 'fade' } as any,
      });
      expect((result as any).text.enter.preset).toBe('fade');
    });
  });

  describe('purity', () => {
    it('does not mutate prev', () => {
      const prev = { text: { enter: { preset: 'fade' } as any } };
      const snapshot = JSON.parse(JSON.stringify(prev));
      mergeSlotAnimations(prev as any, 'text', { exit: { preset: 'fade' } as any });
      expect(prev).toEqual(snapshot);
    });

    it('does not mutate the partial', () => {
      const partial = { enter: { preset: 'fade' } as any };
      const snapshot = JSON.parse(JSON.stringify(partial));
      mergeSlotAnimations(undefined, 'text', partial);
      expect(partial).toEqual(snapshot);
    });
  });
});
