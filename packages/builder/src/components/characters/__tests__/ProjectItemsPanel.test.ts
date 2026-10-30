import { describe, it, expect } from 'vitest';
import { itemsFromCharacters } from '../ProjectItemsPanel';

describe('itemsFromCharacters', () => {
  it('copies item records from characters once per name, without quantities, skipping names the project has', () => {
    const chars = [
      { id: 'a', inventory: [{ id: 'x', name: 'Fish', displayName: 'Fish', description: '', icon: 'f.png', quantity: 3, stackable: true, category: 'misc' }] },
      { id: 'b', inventory: [{ id: 'y', name: 'Fish', displayName: 'Other fish', description: '', icon: '', quantity: 1, stackable: false, category: 'misc' },
                             { id: 'z', name: 'Key', displayName: 'Key', description: '', icon: '', quantity: 1, stackable: false, category: 'key' }] },
    ] as any;
    const out = itemsFromCharacters(chars, [{ id: 'k', name: 'Key', displayName: 'Key', description: '', icon: '', stackable: false, category: 'key' }]);
    expect(out.map((i) => [i.name, i.displayName, i.icon])).toEqual([['Fish', 'Fish', 'f.png']]);
    expect('quantity' in out[0]).toBe(false);
  });
});
