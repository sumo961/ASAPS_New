/**
 * Tests for the story-merge feature — merging another .asaps story into
 * the open project without conflicts.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { analyzeMergeSource, computeMerge, type MergeSourceAnalysis } from '../projectMerge';

function makeSource(overrides: Partial<MergeSourceAnalysis> = {}): MergeSourceAnalysis {
  return {
    projectName: 'Incoming',
    storyTitle: 'Incoming Story',
    projectData: {},
    parsedAssets: [],
    incomingBeats: [],
    incomingCharacters: [],
    incomingVariables: [],
    characterCollisions: [],
    ...overrides,
  };
}

const baseInput = {
  existingBeats: [] as any[],
  existingCharacters: [] as any[],
  existingClusters: [] as any[],
  existingVariables: [] as any[],
  existingAssetIds: [] as string[],
  decisions: [] as any[],
  targetProjectId: 'proj-1',
};

describe('computeMerge', () => {
  it('preserves incoming beat ids when they do not collide', () => {
    const source = makeSource({
      incomingBeats: [
        { id: 'beat_a', type: 'infoText', x: 0, y: 0, connections: [{ targetId: 'beat_b' }] },
        { id: 'beat_b', type: 'endScreen', x: 100, y: 100, connections: [] },
      ],
    });
    const result = computeMerge({ ...baseInput, source });
    expect(result.beats.map(b => b.id)).toEqual(['beat_a', 'beat_b']);
    expect(result.beats[0].connections[0].targetId).toBe('beat_b');
  });

  it('remaps colliding beat ids and rewrites every reference, including nested ones', () => {
    const source = makeSource({
      incomingBeats: [
        {
          id: 'beat_0', type: 'dialogTree', x: 0, y: 0,
          parameters: {
            dialogTree: {
              speaker: 'NPC', text: 'Hi',
              choices: [{ text: 'Go', target: 'beat_1' }],
            },
          },
          connections: [{ targetId: 'beat_1' }],
        },
        {
          id: 'beat_1', type: 'conditionBeat', x: 50, y: 50,
          parameters: { trueTarget: 'beat_0', falseTarget: 'beat_1' },
          connections: [],
        },
      ],
      // existing project already uses beat_0 / beat_1
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingBeats: [{ id: 'beat_0', x: 0 }, { id: 'beat_1', x: 200 }],
    });

    const [b0, b1] = result.beats;
    expect(b0.id).not.toBe('beat_0');
    expect(b1.id).not.toBe('beat_1');
    // Every reference follows the remap — connections, nested dialog choices,
    // condition targets.
    expect(b0.connections[0].targetId).toBe(b1.id);
    expect(b0.parameters.dialogTree.choices[0].target).toBe(b1.id);
    expect(b1.parameters.trueTarget).toBe(b0.id);
    expect(b1.parameters.falseTarget).toBe(b1.id);
  });

  it('reuse decision drops the incoming character and rewires id + speaker references', () => {
    const source = makeSource({
      incomingCharacters: [{ id: 'char_inc', name: 'Elena' }],
      characterCollisions: [{
        incomingId: 'char_inc', incomingName: 'Elena',
        existingId: 'char_ex', existingName: 'Elena',
      }],
      incomingBeats: [{
        id: 'b1', type: 'dialogTree', x: 0, y: 0,
        speaker: 'Elena',
        parameters: { characterId: 'char_inc' },
        connections: [],
      }],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingCharacters: [{ id: 'char_ex', name: 'Elena' }],
      decisions: [{ incomingId: 'char_inc', action: 'reuse' }],
    });

    expect(result.characters).toHaveLength(0);
    expect(result.summary.charactersReused).toBe(1);
    expect(result.beats[0].parameters.characterId).toBe('char_ex');
    // Same display name — speaker unchanged
    expect(result.beats[0].speaker).toBe('Elena');
  });

  it('keep-both renames the incoming character and updates speaker fields but not story text', () => {
    const source = makeSource({
      incomingCharacters: [{ id: 'char_inc', name: 'Elena', displayName: 'Elena' }],
      characterCollisions: [{
        incomingId: 'char_inc', incomingName: 'Elena',
        existingId: 'char_ex', existingName: 'Elena',
      }],
      incomingBeats: [{
        id: 'b1', type: 'dialogTree', x: 0, y: 0,
        speaker: 'Elena',
        parameters: { text: 'Elena walked into the room.' },
        connections: [],
      }],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingCharacters: [{ id: 'char_ex', name: 'Elena' }],
      decisions: [{ incomingId: 'char_inc', action: 'keep-both' }],
    });

    expect(result.characters).toHaveLength(1);
    // App convention: machine name is a slug, displayName is the label
    expect(result.characters[0].name).toBe('elena_2');
    expect(result.characters[0].displayName).toBe('Elena 2');
    expect(result.beats[0].speaker).toBe('Elena 2');
    // Prose mentioning the name is NOT rewritten
    expect(result.beats[0].parameters.text).toBe('Elena walked into the room.');
  });

  it('collisions without a decision default to keep-both (never silently fuse)', () => {
    const source = makeSource({
      incomingCharacters: [{ id: 'char_inc', name: 'Sam' }],
      characterCollisions: [{
        incomingId: 'char_inc', incomingName: 'Sam',
        existingId: 'char_ex', existingName: 'Sam',
      }],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingCharacters: [{ id: 'char_ex', name: 'Sam' }],
      decisions: [],
    });
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].name).toBe('Sam 2');
  });

  it('remaps colliding asset ids and rewrites references in beats and characters', () => {
    const source = makeSource({
      parsedAssets: [{
        id: 'asset_123_abc',
        asset: {
          type: 'image', filename: 'bg.png', mimeType: 'image/png', size: 10,
          blob: new Blob(['x']), uploadedAt: new Date(), metadata: {},
        } as any,
      }],
      incomingCharacters: [{ id: 'c1', name: 'Hero', visual: { defaultAssetId: 'asset_123_abc' } }],
      incomingBeats: [{ id: 'b1', type: 'infoText', x: 0, y: 0, node: 'asset_123_abc', connections: [] }],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingAssetIds: ['asset_123_abc'], // collision
    });

    const newId = result.assets[0].id;
    expect(newId).not.toBe('asset_123_abc');
    expect(result.assets[0].projectId).toBe('proj-1');
    expect(result.beats[0].node).toBe(newId);
    expect(result.characters[0].visual.defaultAssetId).toBe(newId);
  });

  it('unions variables by name with existing winning', () => {
    const source = makeSource({
      incomingVariables: [
        { name: 'score', initialValue: 0 },
        { name: 'gold', initialValue: 10 },
      ],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingVariables: [{ name: 'Score', initialValue: 100 }], // case-insensitive match
    });
    expect(result.variables.map((v: any) => v.name)).toEqual(['gold']);
    expect(result.summary.variablesAdded).toBe(1);
  });

  it('offsets incoming beats beside the existing graph and assigns the merged cluster', () => {
    const source = makeSource({
      storyTitle: 'Side Story',
      incomingBeats: [
        { id: 'b1', type: 'infoText', x: 10, y: 20, connections: [] },
        { id: 'b2', type: 'infoText', x: 110, y: 220, connections: [] },
      ],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingBeats: [{ id: 'e1', x: 1000, y: 0 }],
    });

    // Relative layout preserved, but shifted right of x=1000
    expect(result.beats[0].x).toBeGreaterThan(1000);
    expect(result.beats[1].x - result.beats[0].x).toBe(100);
    expect(result.beats[1].y - result.beats[0].y).toBe(200);
    // All in the merged cluster
    expect(result.cluster.name).toBe('Merged: Side Story');
    expect(result.beats.every(b => b.cluster === result.cluster.id)).toBe(true);
  });
});

describe('computeMerge slug/display collisions', () => {
  it('detects collisions between a machine-name slug and its display form', () => {
    const source = makeSource({
      incomingCharacters: [{ id: 'c9', name: 'Environmental Consultant' }],
      characterCollisions: [{
        incomingId: 'c9', incomingName: 'Environmental Consultant',
        existingId: 'c1', existingName: 'Environmental Consultant',
      }],
      incomingBeats: [{ id: 'b1', type: 'dialogTree', x: 0, y: 0, speaker: 'Environmental Consultant', connections: [] }],
    });
    const result = computeMerge({
      ...baseInput,
      source,
      existingCharacters: [{ id: 'c1', name: 'environmental_consultant', displayName: 'Environmental Consultant' }],
      decisions: [{ incomingId: 'c9', action: 'reuse' }],
    });
    expect(result.characters).toHaveLength(0);
    expect(result.summary.charactersReused).toBe(1);
  });
});

describe('analyzeMergeSource', () => {
  async function makeZip(projectData: any): Promise<Blob> {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(projectData));
    return zip.generateAsync({ type: 'blob' });
  }

  it('reports character name collisions case-insensitively', async () => {
    const blob = await makeZip({
      metadata: {},
      project: {
        name: 'P2',
        story: {
          metadata: { title: 'Story Two' },
          beats: [{ id: 'b1', type: 'infoText' }],
          characters: [{ id: 'c9', name: 'elena' }, { id: 'c10', name: 'Bob' }],
        },
      },
    });
    const analysis = await analyzeMergeSource(blob, [{ id: 'c1', name: 'Elena' }]);

    expect(analysis.storyTitle).toBe('Story Two');
    expect(analysis.incomingBeats).toHaveLength(1);
    expect(analysis.characterCollisions).toHaveLength(1);
    expect(analysis.characterCollisions[0].incomingName).toBe('elena');
    expect(analysis.characterCollisions[0].existingName).toBe('Elena');
  });

  it('rejects blobs without project.json', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'not a project');
    const blob = await zip.generateAsync({ type: 'blob' });
    await expect(analyzeMergeSource(blob, [])).rejects.toThrow(/project\.json/);
  });
});
