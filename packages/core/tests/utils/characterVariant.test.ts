/**
 * Tests for characterVariant — variant overlay resolution. Variants
 * are PARTIAL overlays: the runtime resolves a character + variant
 * id into the effective character record (variant's fields replace
 * the base; missing fields inherit).
 *
 * Coverage focus:
 *   - undefined/null variant returns the base unchanged
 *     (same-reference, not a copy — perf-critical hot path)
 *   - each overlay field is applied independently
 *   - characterDescription maps to description (the name swap that
 *     bit us when CharacterVariant kept the long form)
 *   - undefined fields in the variant do NOT erase base fields
 *     (overlay is sparse, not whole-record replacement)
 *   - findCharacterVariant defensive paths (null/undefined char,
 *     missing variants array, no matching id)
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCharacterWithVariant,
  findCharacterVariant,
} from '../../src/utils/characterVariant';

describe('resolveCharacterWithVariant', () => {
  describe('no variant', () => {
    it('returns the base unchanged when variant is undefined', () => {
      // Same-reference contract: this is on the hot path (every
      // beat that references a character runs this). Avoid
      // allocating a copy when there's nothing to overlay.
      const base = { id: 'alice', displayName: 'Alice', traits: { kind: 5 } };
      expect(resolveCharacterWithVariant(base, undefined)).toBe(base);
    });

    it('returns the base unchanged when variant is null', () => {
      const base = { id: 'alice' };
      expect(resolveCharacterWithVariant(base, null)).toBe(base);
    });
  });

  describe('field overlay', () => {
    it('overrides displayName', () => {
      const base = { id: 'alice', displayName: 'Alice' };
      const result = resolveCharacterWithVariant(base, {
        id: 'angry',
        displayName: 'Angry Alice',
      } as any);
      expect(result.displayName).toBe('Angry Alice');
    });

    it('maps characterDescription onto description (the name swap)', () => {
      // The variant carries `characterDescription` (long form),
      // but the runtime character carries plain `description`.
      // Easy to mis-implement as a pass-through and silently drop
      // the variant description.
      const base = { id: 'alice', description: 'base description' };
      const result = resolveCharacterWithVariant(base, {
        id: 'v', characterDescription: 'variant description',
      } as any);
      expect(result.description).toBe('variant description');
    });

    it('overrides portrait', () => {
      const base = { id: 'alice', portrait: { asset: 'base.png' } };
      const result = resolveCharacterWithVariant(base, {
        id: 'v', portrait: { asset: 'variant.png' },
      } as any);
      expect((result.portrait as any).asset).toBe('variant.png');
    });

    it('overrides traits as a whole map (not deep-merge)', () => {
      // Traits override is a REPLACE, not a deep merge. Variants
      // express a different personality, not a delta on the base.
      const base = { id: 'alice', traits: { kind: 5, brave: 3 } };
      const result = resolveCharacterWithVariant(base, {
        id: 'v', traits: { fierce: 8 },
      } as any);
      expect(result.traits).toEqual({ fierce: 8 });
    });

    it('overrides dossierPolicy / initialMood / initialSentiments', () => {
      const base = {
        id: 'alice',
        dossierPolicy: 'reAnchor' as const,
        initialMood: { valence: 0, arousal: 0 },
        initialSentiments: { bob: 'neutral' },
      };
      const result = resolveCharacterWithVariant(base, {
        id: 'v',
        dossierPolicy: 'reflection',
        initialMood: { valence: -1, arousal: 1 },
        initialSentiments: { bob: 'hostile' },
      } as any);
      expect(result.dossierPolicy).toBe('reflection');
      expect((result.initialMood as any).valence).toBe(-1);
      expect((result.initialSentiments as any).bob).toBe('hostile');
    });
  });

  describe('sparse overlay', () => {
    it('does NOT erase base fields when variant has fewer fields set', () => {
      // The most-likely-to-regress behavior. A variant that only
      // changes the portrait must leave displayName + traits alone.
      const base = {
        id: 'alice',
        displayName: 'Alice',
        traits: { kind: 5 },
      };
      const result = resolveCharacterWithVariant(base, {
        id: 'v', portrait: { asset: 'x.png' },
      } as any);
      expect(result.displayName).toBe('Alice');
      expect(result.traits).toEqual({ kind: 5 });
    });

    it('a variant with no overlayable fields returns a base-equivalent copy', () => {
      // Edge case — variant exists but only has identity fields
      // (id, name) that aren't in the overlay set. Result is
      // structurally equal to base. The function still returns a
      // new object (spread), not the same reference, because
      // partial overlay path always allocates.
      const base = { id: 'alice', displayName: 'Alice' };
      const result = resolveCharacterWithVariant(base, { id: 'v' } as any);
      expect(result).toEqual(base);
      expect(result).not.toBe(base);
    });
  });
});

describe('findCharacterVariant', () => {
  it('returns the variant by id', () => {
    const char = {
      variants: [
        { id: 'angry', displayName: 'Angry Alice' },
        { id: 'happy', displayName: 'Happy Alice' },
      ] as any,
    };
    const result = findCharacterVariant(char, 'happy');
    expect((result as any)?.displayName).toBe('Happy Alice');
  });

  it('returns undefined when the variant id is not found', () => {
    const char = {
      variants: [{ id: 'a' }] as any,
    };
    expect(findCharacterVariant(char, 'b')).toBeUndefined();
  });

  it('returns undefined when character is null', () => {
    expect(findCharacterVariant(null, 'x')).toBeUndefined();
  });

  it('returns undefined when character is undefined', () => {
    expect(findCharacterVariant(undefined, 'x')).toBeUndefined();
  });

  it('returns undefined when variantId is empty string', () => {
    // Important: an empty string is "no variant selected", not
    // "find a variant with empty id". The early-return guard
    // catches it.
    expect(findCharacterVariant({ variants: [{ id: '' } as any] }, '')).toBeUndefined();
  });

  it('returns undefined when variantId is null/undefined', () => {
    const char = { variants: [{ id: 'a' }] as any };
    expect(findCharacterVariant(char, null)).toBeUndefined();
    expect(findCharacterVariant(char, undefined)).toBeUndefined();
  });

  it('returns undefined when character.variants is missing', () => {
    expect(findCharacterVariant({} as any, 'a')).toBeUndefined();
  });
});
