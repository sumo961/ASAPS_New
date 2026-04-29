import { describe, it, expect } from 'vitest';
import { findReferencesByName, relinkReferences } from '../relinkReferences';

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('findReferencesByName', () => {
  it('returns [] for empty inputs', () => {
    expect(findReferencesByName([], granny, [granny])).toEqual([]);
    expect(findReferencesByName(null, granny, [])).toEqual([]);
  });

  it('matches Beat.speaker case-insensitively against name and displayName', () => {
    const beats = [
      { id: 'b1', type: 'infoText', speaker: 'Granny' },
      { id: 'b2', type: 'infoText', speaker: 'grandma' },
      { id: 'b3', type: 'infoText', speaker: 'Wolf' },
    ];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    expect(refs.map(r => r.beatId)).toEqual(['b1', 'b2']);
  });

  it('skips beats whose characterRef is already a known character id', () => {
    // b1 is already linked to wolf — must not be silently re-linked to granny.
    const beats = [
      { id: 'b1', type: 'infoText', speaker: 'Granny', characterRef: 'char_2' },
      { id: 'b2', type: 'infoText', speaker: 'Granny' },
    ];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    expect(refs.map(r => r.beatId)).toEqual(['b2']);
  });

  it('walks DialogTree root + nested speakers', () => {
    const beats = [{
      id: 'b1', type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root', speaker: 'Granny', text: '...',
          choices: [{
            id: 'c1', text: 'Hi',
            dialogNode: {
              id: 'n1', speaker: 'Wolf', text: '...',
              choices: [{
                id: 'c2', text: '...',
                dialogNode: { id: 'n2', speaker: 'Grandma', text: '...', choices: [] },
              }],
            },
          }],
        },
      },
    }];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    // root speaker (Granny) and the deeply-nested Grandma both match;
    // Wolf is unaffected.
    expect(refs.map(r => r.where)).toEqual([
      'b1 — dialog',
      'b1 — dialog > choice 1 > choice 1',
    ]);
  });

  it('matches AddRemoveInventory character / fromChar / toChar', () => {
    const beats = [{
      id: 'b1', type: 'addRemoveInventory',
      parameters: { character: 'Granny', fromChar: 'Wolf', toChar: 'grandma' },
    }];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    expect(refs.map(r => r.where)).toEqual([
      'b1 — inventory character',
      'b1 — inventory toChar',
    ]);
  });

  it('skips the special "player" routing keyword on inventory fields', () => {
    const beats = [{
      id: 'b1', type: 'addRemoveInventory',
      parameters: { character: 'player' },
    }];
    // Even if 'player' happened to match a defined character (it doesn't), it must be skipped.
    expect(findReferencesByName(beats, { id: 'cP', name: 'player' }, [])).toEqual([]);
  });

  it('matches AI beats npcName', () => {
    const beats = [
      { id: 'b1', type: 'aiDialogTree', parameters: { npcName: 'Granny' } },
      { id: 'b2', type: 'aiConversation', parameters: { npcName: 'Granny' } },
      { id: 'b3', type: 'aiConversation', parameters: { npcName: 'Wolf' } },
    ];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    expect(refs.map(r => r.beatId)).toEqual(['b1', 'b2']);
  });
});

describe('relinkReferences', () => {
  it('returns the original array reference when no matches', () => {
    const beats = [{ id: 'b1', type: 'infoText', speaker: 'Wolf' }];
    const result = relinkReferences(beats, [], granny);
    expect(result).toEqual(beats);
  });

  it('updates Beat.speaker + characterRef on matched top-level speakers', () => {
    const beats = [
      { id: 'b1', type: 'infoText', speaker: 'Granny' },
      { id: 'b2', type: 'infoText', speaker: 'Wolf' },
    ];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    const result = relinkReferences(beats, refs, granny);
    expect(result[0].speaker).toBe('Grandma'); // displayName preferred
    expect(result[0].characterRef).toBe('char_1');
    expect(result[1]).toEqual(beats[1]); // untouched
  });

  it('updates DialogTree nested node speaker + characterRef', () => {
    const beats = [{
      id: 'b1', type: 'dialogTree',
      parameters: {
        dialogTree: {
          id: 'root', speaker: 'Granny', text: '...',
          choices: [{
            id: 'c1', text: '...',
            dialogNode: { id: 'n1', speaker: 'Granny', text: '...', choices: [] },
          }],
        },
      },
    }];
    const refs = findReferencesByName(beats, granny, [granny]);
    const result = relinkReferences(beats, refs, granny);
    const tree = result[0].parameters!.dialogTree;
    expect(tree.characterRef).toBe('char_1');
    expect(tree.speaker).toBe('Grandma');
    expect(tree.choices[0].dialogNode.characterRef).toBe('char_1');
    expect(tree.choices[0].dialogNode.speaker).toBe('Grandma');
  });

  it('updates AddRemoveInventory fields to canonical id', () => {
    const beats = [{
      id: 'b1', type: 'addRemoveInventory',
      parameters: { character: 'Granny', fromChar: 'wolf', toChar: 'Grandma' },
    }];
    const refs = findReferencesByName(beats, granny, [granny, wolf]);
    const result = relinkReferences(beats, refs, granny);
    expect(result[0].parameters!.character).toBe('char_1');
    // fromChar referenced 'wolf' which matches another character — left alone (granny doesn't match)
    expect(result[0].parameters!.fromChar).toBe('wolf');
    expect(result[0].parameters!.toChar).toBe('char_1');
  });

  it('updates AI beat npcName to canonical id', () => {
    const beats = [
      { id: 'b1', type: 'aiDialogTree', parameters: { npcName: 'Granny' } },
    ];
    const refs = findReferencesByName(beats, granny, [granny]);
    const result = relinkReferences(beats, refs, granny);
    expect(result[0].parameters!.npcName).toBe('char_1');
  });

  it('does not mutate the input beats', () => {
    const beats = [{ id: 'b1', type: 'infoText', speaker: 'Granny' }];
    const original = JSON.parse(JSON.stringify(beats));
    const refs = findReferencesByName(beats, granny, [granny]);
    relinkReferences(beats, refs, granny);
    expect(beats).toEqual(original);
  });
});
