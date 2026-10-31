/**
 * "Start as if…" presets give the player the player's items, with how many,
 * and leave other characters' starting items with them (2026-10-31: every
 * preset handed the player a shopkeeper's Lantern).
 */
import { describe, it, expect } from 'vitest';
import { generatePathPresets } from '../PathBasedPresetGenerator';
import { Story, BeatTypeRegistry } from '@asaps/core';

const beat = (id: string, type: string, parameters: any, connections: any[] = []) =>
  BeatTypeRegistry.getInstance().createBeat(type, { id, name: id, type, parameters, connections } as any);

describe('presets and items', () => {
  it('keeps bags apart and counts the player\'s items', () => {
    const story = new Story({ title: 't', author: 'a', firstBeatId: 'coins' });
    story.setCharacters([{ id: 'shop', name: 'Shopkeeper', inventory: [{ name: 'Lantern' }] }] as any);
    story.addBeat(beat('coins', 'addRemoveInventory', { action: 'add', item: 'coin', quantity: 3 }, [{ targetId: 'shopfront' }]));
    story.addBeat(beat('shopfront', 'infoText', { text: 'The shop.' }, [{ targetId: 'end' }]));
    story.addBeat(beat('end', 'endScreen', { message: 'e', showRestart: false }));
    const { presets } = generatePathPresets(story, 'shopfront');
    expect(presets.length).toBeGreaterThan(0);
    for (const { preset } of presets) {
      expect(preset.state.inventory).toEqual(['coin']);
      expect(preset.state.inventoryQuantities).toEqual({ coin: 3 });
      expect(preset.state.characterInventories).toEqual({ shop: ['Lantern'] });
    }
  });
});
