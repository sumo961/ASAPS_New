/**
 * Tests for inventory alias unification (Step 1.b of the rich-character roadmap).
 *
 * Validates that:
 *   - Inventory operations route to the canonical Character.id bucket regardless
 *     of whether the caller passes id, name, or displayName.
 *   - Legacy buckets stored under name / displayName / arbitrary aliases get
 *     merged into the canonical bucket the first time the character is touched.
 *   - Quantities are summed (not replaced) when an item exists in both the
 *     legacy bucket and the canonical bucket.
 *   - 'player' / empty refs continue to route to the global inventory unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

describe('StoryContext — inventory alias unification', () => {
  let context: StoryContext;
  const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
  const wolf = { id: 'char_2', name: 'Wolf' };

  beforeEach(() => {
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes id/name/displayName to the same bucket', () => {
    context.addInventoryItem('char_1', 'wand', 1);
    context.addInventoryItem('Granny', 'wand', 2);
    context.addInventoryItem('grandma', 'wand', 3);
    expect(context.getCharacterInventoryQuantity('char_1', 'wand')).toBe(6);
    expect(context.getCharacterInventoryQuantity('Granny', 'wand')).toBe(6);
    expect(context.getCharacterInventoryQuantity('Grandma', 'wand')).toBe(6);
  });

  it('migrates a legacy name-keyed bucket into the canonical id bucket', () => {
    // Simulate older save state — direct write to the alias-keyed bucket.
    const legacyState = context.serialize();
    legacyState.characterInventories = {
      Granny: [{ name: 'wand', quantity: 5 }, { name: 'cookie', quantity: 2 }],
    };
    context.loadFromSerialized(legacyState);

    // First touch via canonical id should pull the legacy bucket into char_1.
    expect(context.getCharacterInventoryQuantity('char_1', 'wand')).toBe(5);
    expect(context.getCharacterInventoryQuantity('char_1', 'cookie')).toBe(2);

    // The alias bucket should be gone — only the canonical key remains.
    const dump = context.serialize();
    expect(Object.keys(dump.characterInventories)).toEqual(['char_1']);
  });

  it('sums quantities when both legacy and canonical buckets hold the same item', () => {
    const legacyState = context.serialize();
    legacyState.characterInventories = {
      char_1: [{ name: 'wand', quantity: 2 }],
      Granny: [{ name: 'wand', quantity: 3 }, { name: 'cookie', quantity: 1 }],
    };
    context.loadFromSerialized(legacyState);

    context.addInventoryItem('Granny', 'wand', 0); // touch to trigger merge
    expect(context.getCharacterInventoryQuantity('char_1', 'wand')).toBe(5);
    expect(context.getCharacterInventoryQuantity('char_1', 'cookie')).toBe(1);
    expect(Object.keys(context.serialize().characterInventories)).toEqual(['char_1']);
  });

  it('absorbs displayName-keyed legacy buckets too', () => {
    const legacyState = context.serialize();
    legacyState.characterInventories = {
      Grandma: [{ name: 'glasses', quantity: 1 }],
    };
    context.loadFromSerialized(legacyState);

    expect(context.getCharacterInventoryQuantity('char_1', 'glasses')).toBe(1);
    expect(Object.keys(context.serialize().characterInventories)).toEqual(['char_1']);
  });

  it('keeps inline / unknown character buckets untouched', () => {
    context.addInventoryItem('UnknownNPC', 'note', 1);
    expect(context.getCharacterInventoryQuantity('UnknownNPC', 'note')).toBe(1);
    // No matching defined character → bucket stays under the original ref.
    expect(context.serialize().characterInventories['UnknownNPC']).toEqual([{ name: 'note', quantity: 1 }]);
  });

  it("does not affect 'player' / empty refs (still route to global inventory)", () => {
    context.addInventoryItem('player', 'sword', 1);
    context.addInventoryItem('', 'shield', 1);
    expect(context.getInventoryQuantity('sword')).toBe(1);
    expect(context.getInventoryQuantity('shield')).toBe(1);
    expect(context.serialize().characterInventories).toEqual({});
  });

  it('removes items from the canonical bucket when called with a name alias', () => {
    context.addInventoryItem('char_1', 'cookie', 5);
    context.removeInventoryItem('Granny', 'cookie', 2);
    expect(context.getCharacterInventoryQuantity('char_1', 'cookie')).toBe(3);
  });

  it('emits inventoryChanged with the canonical character id', () => {
    const handler = vi.fn();
    context.on('inventoryChanged', handler);
    context.addInventoryItem('Granny', 'wand', 1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      action: 'add', character: 'char_1', item: 'wand', quantity: 1, newTotal: 1,
    }));
  });
});
