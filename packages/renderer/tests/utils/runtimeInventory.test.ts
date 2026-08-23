/**
 * Runtime pickup → HUD item resolution, shared by the Preview Window and the
 * exported web player. Red Story regression: a picked-up 'knife' rendered its
 * raw matching key in a fully Persian story, even though the granting
 * pickProp beat's prop.displayName was translated.
 */
import { describe, it, expect } from 'vitest';
import { harvestPickPropData, buildRuntimeInventoryItems } from '../../src/utils/runtimeInventory';

const pickPropBeat = {
  type: 'pickProp',
  props: [
    { name: 'knife', displayName: 'چاقو', description: 'یک چاقو', assetId: 'a1' },
    { name: 'sweets', displayName: 'شیرینی', target: '6' },
  ],
  locations: new Map([
    ['knife', { kind: 'prop', name: 'knife', assetId: 'a1' }],
  ]),
};

const resolveAsset = (id: string) => (id === 'a1' ? 'blob:knife-icon' : undefined);

describe('harvestPickPropData', () => {
  it('collects labels, descriptions, and icons by prop name (case-insensitive)', () => {
    const h = harvestPickPropData([pickPropBeat], resolveAsset);
    expect(h.labels.get('knife')).toBe('چاقو');
    expect(h.labels.get('KNIFE'.toLowerCase())).toBe('چاقو');
    expect(h.descriptions.get('knife')).toBe('یک چاقو');
    expect(h.assets.get('knife')).toBe('blob:knife-icon');
  });

  it('ignores non-pickProp beats', () => {
    const h = harvestPickPropData([{ type: 'infoText' }, null], resolveAsset);
    expect(h.labels.size).toBe(0);
  });
});

describe('buildRuntimeInventoryItems', () => {
  const harvest = harvestPickPropData([pickPropBeat], resolveAsset);

  it('labels a runtime pickup with the granting prop displayName, never the key', () => {
    const items = buildRuntimeInventoryItems([{ name: 'knife', quantity: 1 }], [], harvest);
    expect(items[0].displayName).toBe('چاقو');
    expect(items[0].name).toBe('knife'); // matching key untouched
    expect(items[0].icon).toBe('blob:knife-icon');
  });

  it('lets an authored character item definition win over the prop harvest', () => {
    const defs = [{ id: 'i1', name: 'knife', displayName: 'Grandmother’s knife', icon: 'authored.png' }];
    const items = buildRuntimeInventoryItems([{ name: 'knife', quantity: 2 }], defs, harvest);
    expect(items[0].displayName).toBe('Grandmother’s knife');
    expect(items[0].icon).toBe('authored.png');
    expect(items[0].quantity).toBe(2);
  });

  it('falls back to the raw key when nothing else exists', () => {
    const items = buildRuntimeInventoryItems([{ name: 'lantern', quantity: 1 }], [], harvest);
    expect(items[0].displayName).toBe('lantern');
    expect(items[0].icon).toBe('');
  });
});
