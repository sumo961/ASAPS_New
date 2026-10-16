import { describe, it, expect } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

function story() {
  const s = new Story();
  (s as any).setCharacters([
    { id: 'char_me', name: 'Me', role: 'player', inventory: [{ id: 'i1', name: 'lamp', quantity: 1 }, { id: 'i2', name: 'coin', quantity: 3 }] },
    { id: 'char_zoe', name: 'Zoe', role: 'npc', inventory: [{ id: 'i3', name: 'key' }] },
    { id: 'char_tim', name: 'Tim', role: 'npc' },
  ]);
  return s;
}

describe('starting inventory', () => {
  it("hands each character the items listed on them", () => {
    const ctx = new StoryContext(undefined, story());
    expect(ctx.getInventoryEntries()).toEqual([{ name: 'lamp', quantity: 1 }, { name: 'coin', quantity: 3 }]);
    expect(ctx.hasInventoryItem('player', 'lamp')).toBe(true);
    expect(ctx.hasInventoryItem('Zoe', 'key')).toBe(true);
    expect(ctx.getCharacterInventoryEntries('char_tim')).toEqual([]);
  });

  it('does not double them when the story is set again', () => {
    const s = story();
    const ctx = new StoryContext(undefined, s);
    ctx.setStory(s);
    expect(ctx.getInventoryQuantity('coin')).toBe(3);
  });

  it('gives them back on restart and on an inventory reset, keeps play changes otherwise', () => {
    const ctx = new StoryContext(undefined, story());
    ctx.removeFromInventory('lamp', 1);
    ctx.addToInventory('rope');
    ctx.selectiveReset({ variables: true });
    expect(ctx.hasInInventory('lamp')).toBe(false);
    expect(ctx.hasInInventory('rope')).toBe(true);
    ctx.selectiveReset({ inventory: true });
    expect(ctx.hasInInventory('lamp')).toBe(true);
    expect(ctx.hasInInventory('rope')).toBe(false);
    ctx.removeFromInventory('lamp', 1);
    ctx.reset();
    expect(ctx.hasInInventory('lamp')).toBe(true);
  });
});
