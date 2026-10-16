import { describe, it, expect } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

function contextWithCast() {
  const story = new Story();
  (story as any).setCharacters([
    { id: 'char_me', name: 'Me', displayName: 'Me', role: 'player' },
    { id: 'char_zoe', name: 'Zoe', displayName: 'Zoe', role: 'npc' },
  ]);
  return new StoryContext(undefined, story);
}

describe('getCharacterInventoryEntries', () => {
  it("finds an NPC's items whichever ref the granting beat used", () => {
    const ctx = contextWithCast();
    ctx.addInventoryItem('Zoe', 'key');
    ctx.addInventoryItem('char_zoe', 'key');
    expect(ctx.getCharacterInventoryEntries('char_zoe')).toEqual([{ name: 'key', quantity: 2 }]);
  });

  it("gives the player's character the global player inventory too", () => {
    const ctx = contextWithCast();
    ctx.addInventoryItem('player', 'lamp');
    ctx.addInventoryItem('char_me', 'lamp');
    ctx.addInventoryItem('char_me', 'note');
    expect(ctx.getCharacterInventoryEntries('char_me')).toEqual([
      { name: 'lamp', quantity: 2 },
      { name: 'note', quantity: 1 },
    ]);
    expect(ctx.getCharacterInventoryEntries('char_zoe')).toEqual([]);
  });
});
