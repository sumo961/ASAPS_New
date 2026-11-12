import { describe, it, expect } from 'vitest';
import { collectAssetUses, missingAssetUses, planAssetReplace } from '../assetReferences';

const lost = 'asset_1792155258311_uxc6ryr4u';
const kept = 'asset_1792169684623_syqlxancs';

function beat(id: string, parameters: any, extra: any = {}) {
  return {
    id, type: 'infoText', name: id, x: 0, y: 0, parameters, ...extra,
    getParameters() { return this.parameters; },
    toJSON() { return { id, type: 'infoText', name: id, x: 0, y: 0, parameters: this.parameters, ...extra }; },
  };
}

describe('asset references', () => {
  const beats = [
    beat('a', { text: 'x', backgroundSound: lost }),
    beat('b', { text: 'y', dialogTree: { id: 'r', sound: { assetId: lost }, choices: [] } }),
    beat('c', { text: 'z', backgroundImage: kept }),
  ];

  it('finds which beats use each asset, and whether it is a sound', () => {
    const uses = collectAssetUses(beats);
    expect(uses.get(lost)).toEqual({ beats: ['a', 'b'], sound: true });
    expect(uses.get(kept)).toEqual({ beats: ['c'], sound: false });
  });

  it('lists only the ones the project lacks', () => {
    expect([...missingAssetUses(beats, [kept]).keys()]).toEqual([lost]);
  });

  it('plans one edit per using beat, keeping the old values for undo', () => {
    const edits = planAssetReplace(beats, lost, kept);
    expect(edits.map((e) => e.beatId)).toEqual(['a', 'b']);
    expect(edits[0].updates.parameters.backgroundSound).toBe(kept);
    expect(edits[0].oldValues.parameters.backgroundSound).toBe(lost);
    expect(edits[1].updates.parameters.dialogTree.sound.assetId).toBe(kept);
    expect(beats[0].parameters.backgroundSound).toBe(lost); // nothing changed yet
  });

  it('reaches fields outside the parameters, and leaves names alone', () => {
    const b = beat('d', { text: lost }, { look: { background: { image: lost } } });
    const [edit] = planAssetReplace([b], lost, kept);
    expect(edit.updates.look.background.image).toBe(kept);
    expect(planAssetReplace([beat(lost, { text: 'x' })], lost, kept)).toEqual([]);
  });

  it('does nothing for a swap to itself', () => {
    expect(planAssetReplace(beats, lost, lost)).toEqual([]);
  });
});
