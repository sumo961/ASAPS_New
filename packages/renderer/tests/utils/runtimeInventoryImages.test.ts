import { describe, it, expect } from 'vitest';
import { harvestPickPropData, buildRuntimeInventoryItems } from '../../src/utils/runtimeInventory';

const urls: Record<string, string> = { key_png: 'blob:key', lamp_png: 'blob:lamp', prop_key: 'blob:prop-key' };
const resolve = (id: string) => urls[id];

describe('inventory pictures from inventory beats and effects', () => {
  it('uses the Inventory Management beat picture', () => {
    const beats = [{ type: 'addRemoveInventory', getParameters: () => ({ action: 'add', item: 'key', itemImage: 'key_png' }) }];
    const items = buildRuntimeInventoryItems([{ name: 'key', quantity: 1 }], [], harvestPickPropData(beats, resolve));
    expect(items[0].icon).toBe('blob:key');
  });

  it('finds add-inventory effects nested in choices and links', () => {
    const beats = [
      {
        type: 'dialogTree',
        getParameters: () => ({ dialogTree: { choices: [{ id: 'a', effects: [{ type: 'addInventory', target: 'lamp', itemImage: 'lamp_png' }] }] } }),
        connections: [],
      },
    ];
    const items = buildRuntimeInventoryItems([{ name: 'lamp', quantity: 1 }], [], harvestPickPropData(beats, resolve));
    expect(items[0].icon).toBe('blob:lamp');
  });

  it('keeps a Pick Prop graphic and an authored item icon ahead of it', () => {
    const beats = [
      { type: 'pickProp', props: [{ name: 'key', assetId: 'prop_key' }] },
      { type: 'addRemoveInventory', getParameters: () => ({ item: 'key', itemImage: 'key_png' }) },
    ];
    const harvest = harvestPickPropData(beats, resolve);
    expect(buildRuntimeInventoryItems([{ name: 'key', quantity: 1 }], [], harvest)[0].icon).toBe('blob:prop-key');
    const authored = [{ id: 'k', name: 'key', displayName: 'Key', icon: 'blob:authored' }];
    expect(buildRuntimeInventoryItems([{ name: 'key', quantity: 1 }], authored, harvest)[0].icon).toBe('blob:authored');
  });
});

import { resolveItemDefinitionIcons } from '../../src/utils/runtimeInventory';

describe('resolveItemDefinitionIcons', () => {
  const urls: Record<string, string> = { map_png: 'blob:player/map' };
  it('prefers the asset, keeps a usable stored icon, drops builder blobs in players', () => {
    const defs = [
      { name: 'map', assetId: 'map_png', icon: 'blob:builder/old' },
      { name: 'rope', icon: 'https://example.test/rope.png' },
      { name: 'coin', icon: 'blob:builder/coin' },
    ];
    expect(resolveItemDefinitionIcons(defs, (id) => urls[id], { dropBlobUrls: true }).map((d) => d.icon))
      .toEqual(['blob:player/map', 'https://example.test/rope.png', '']);
    expect(resolveItemDefinitionIcons(defs, (id) => urls[id])[2].icon).toBe('blob:builder/coin');
  });
});

import { itemCatalogFor } from '../../src/utils/runtimeInventory';

describe('itemCatalogFor', () => {
  it("shows an item with another character's record when the owner has none (a storage character)", () => {
    const harald = { id: 'h', inventory: [{ name: 'item_1' }] };
    const storage = { id: 's', inventory: [{ name: 'Fish', displayName: 'Fish', icon: 'fish.png' }] };
    const items = buildRuntimeInventoryItems([{ name: 'Fish', quantity: 1 }], itemCatalogFor(harald, [harald, storage]), harvestPickPropData([], () => undefined));
    expect(items[0]).toMatchObject({ displayName: 'Fish', icon: 'fish.png' });
  });
});
