import { describe, it, expect } from 'vitest';
import {
  beatsForCharacter,
  choicesForCharacter,
  interactionsForCharacter,
  relationshipBetween,
} from '../../src/utils/narrativeMemory';

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };
const characters = [granny, wolf];

describe('beatsForCharacter', () => {
  it('returns [] for empty history or beats', () => {
    expect(beatsForCharacter([], [], granny, characters)).toEqual([]);
    expect(beatsForCharacter(['b1'], [], granny, characters)).toEqual([]);
  });

  it('matches Beat.speaker by free-text name', () => {
    const beats = [
      { id: 'b1', type: 'infoText', name: 'Greeting', speaker: 'Granny' },
      { id: 'b2', type: 'infoText', name: 'Other', speaker: 'Stranger' },
    ];
    const result = beatsForCharacter(['b1', 'b2'], beats, granny, characters);
    expect(result).toEqual([
      { beatId: 'b1', beatName: 'Greeting', beatType: 'infoText', index: 0, role: 'speaker' },
    ]);
  });

  it('matches Beat.characterRef directly by id', () => {
    const beats = [{ id: 'b1', type: 'infoText', characterRef: 'char_1', speaker: 'totally different name' }];
    const result = beatsForCharacter(['b1'], beats, granny, characters);
    expect(result[0].role).toBe('speaker');
  });

  it('records each visit separately when the same beat appears twice', () => {
    const beats = [{ id: 'b1', type: 'infoText', speaker: 'Granny' }];
    const result = beatsForCharacter(['b1', 'b1', 'b1'], beats, granny, characters);
    expect(result.map(r => r.index)).toEqual([0, 1, 2]);
  });

  it('walks DialogTree node speakers (root + nested)', () => {
    const beats = [{
      id: 'b1', type: 'dialogTree', name: 'Convo',
      speaker: 'narrator',
      parameters: {
        dialogTree: {
          id: 'root', speaker: 'Wolf', text: '',
          choices: [{
            id: 'c1', text: '...',
            dialogNode: { id: 'n1', speaker: 'Granny', text: '', choices: [] },
          }],
        },
      },
    }];
    const result = beatsForCharacter(['b1'], beats, granny, characters);
    expect(result[0].role).toBe('dialog-speaker');
  });

  it('matches AddRemoveInventory roles distinctly', () => {
    const beats = [
      { id: 'b1', type: 'addRemoveInventory', parameters: { character: 'Granny' } },
      { id: 'b2', type: 'addRemoveInventory', parameters: { fromChar: 'Granny', toChar: 'Wolf' } },
      { id: 'b3', type: 'addRemoveInventory', parameters: { fromChar: 'Wolf', toChar: 'char_1' } },
    ];
    const result = beatsForCharacter(['b1', 'b2', 'b3'], beats, granny, characters);
    expect(result.map(e => e.role)).toEqual(['inventory-holder', 'inventory-source', 'inventory-target']);
  });

  it('matches AI beat npcName', () => {
    const beats = [
      { id: 'b1', type: 'aiDialogTree', parameters: { npcName: 'char_1' } },
      { id: 'b2', type: 'aiConversation', parameters: { npcName: 'Grandma' } },
    ];
    const result = beatsForCharacter(['b1', 'b2'], beats, granny, characters);
    expect(result.map(e => e.role)).toEqual(['npc', 'npc']);
  });

  it('prefers "speaker" role when a beat has multiple matches', () => {
    const beats = [{
      id: 'b1', type: 'dialogTree', speaker: 'Granny',
      parameters: { dialogTree: { id: 'root', speaker: 'Granny', text: '', choices: [] } },
    }];
    const result = beatsForCharacter(['b1'], beats, granny, characters);
    expect(result[0].role).toBe('speaker');
  });

  it('skips beats not in the history (referencing the character but not visited)', () => {
    const beats = [{ id: 'b_offstage', type: 'infoText', speaker: 'Granny' }];
    expect(beatsForCharacter([], beats, granny, characters)).toEqual([]);
  });
});

describe('choicesForCharacter', () => {
  const beats = [
    { id: 'b1', type: 'dialogTree', speaker: 'Granny' },
    { id: 'b2', type: 'infoText', speaker: 'Stranger' },
  ];

  it('returns choices made in beats involving the character', () => {
    const choices = [
      { beatId: 'b1', choiceText: 'Hi Granny', timestamp: 1 },
      { beatId: 'b2', choiceText: 'Walk on', timestamp: 2 },
    ];
    const result = choicesForCharacter(choices, beats, granny, characters);
    expect(result.map(c => c.choiceText)).toEqual(['Hi Granny']);
  });

  it('drops choices whose beat is unknown', () => {
    const choices = [{ beatId: 'b_nonexistent', choiceText: 'Phantom', timestamp: 1 }];
    expect(choicesForCharacter(choices, beats, granny, characters)).toEqual([]);
  });

  it('falls back to beat name/type when the choice record lacks them', () => {
    const choices = [{ beatId: 'b1', choiceText: 'Hi', timestamp: 1 }];
    const result = choicesForCharacter(choices, [{ ...beats[0], name: 'Greeting' }, beats[1]], granny, characters);
    expect(result[0].beatName).toBe('Greeting');
    expect(result[0].beatType).toBe('dialogTree');
  });
});

describe('interactionsForCharacter', () => {
  it('returns beats (in visit order) followed by choices (in timestamp order)', () => {
    // Beat-history indices and choice timestamps live on different number
    // scales, so for the MVP the timeline is split: beats first, choices
    // after. Callers needing precise interleaving can correlate via beatId.
    const beats = [
      { id: 'b1', name: 'Greet', type: 'infoText', speaker: 'Granny' },
      { id: 'b2', name: 'Choose', type: 'dialogTree', speaker: 'Granny' },
    ];
    const history = ['b1', 'b2'];
    const choices = [
      { beatId: 'b1', choiceText: 'First choice', timestamp: 100 },
      { beatId: 'b2', choiceText: 'Second choice', timestamp: 200 },
    ];
    const result = interactionsForCharacter(history, choices, beats, granny, characters);
    expect(result.map(e => `${e.kind}:${e.beatId}`)).toEqual([
      'beat:b1', 'beat:b2', 'choice:b1', 'choice:b2',
    ]);
  });

  it('annotates choice entries with role "present"', () => {
    const beats = [{ id: 'b1', type: 'dialogTree', speaker: 'Granny' }];
    const result = interactionsForCharacter(
      ['b1'],
      [{ beatId: 'b1', choiceText: 'Yes', timestamp: 1 }],
      beats, granny, characters,
    );
    const choice = result.find(e => e.kind === 'choice');
    expect(choice?.role).toBe('present');
  });
});

describe('relationshipBetween', () => {
  const beats = [
    { id: 'b1', type: 'dialogTree', name: 'Both meet',
      parameters: { dialogTree: {
        id: 'root', speaker: 'Granny', text: '',
        choices: [{ id: 'c1', text: '', dialogNode: { id: 'n1', speaker: 'Wolf', text: '', choices: [] } }],
      } },
    },
    { id: 'b2', type: 'infoText', speaker: 'Granny' },
    { id: 'b3', type: 'infoText', speaker: 'Wolf' },
  ];

  it('finds beats where both characters appear', () => {
    const r = relationshipBetween(granny, wolf, ['b1', 'b2', 'b3'], [], beats, characters);
    expect(r.sharedBeats.map(e => e.beatId)).toEqual(['b1']);
  });

  it('finds choices made in shared beats', () => {
    const choices = [
      { beatId: 'b1', choiceText: 'Friend', timestamp: 1 },
      { beatId: 'b2', choiceText: 'Solo', timestamp: 2 },
    ];
    const r = relationshipBetween(granny, wolf, ['b1', 'b2', 'b3'], choices, beats, characters);
    expect(r.sharedChoices.map(c => c.choiceText)).toEqual(['Friend']);
  });

  it('is symmetric (a→b == b→a, modulo order)', () => {
    const ab = relationshipBetween(granny, wolf, ['b1', 'b2'], [], beats, characters);
    const ba = relationshipBetween(wolf, granny, ['b1', 'b2'], [], beats, characters);
    expect(ab.sharedBeats.map(e => e.beatId).sort()).toEqual(ba.sharedBeats.map(e => e.beatId).sort());
  });

  it('returns empty for self-relationship', () => {
    const r = relationshipBetween(granny, granny, ['b1', 'b2'], [], beats, characters);
    expect(r.sharedBeats).toEqual([]);
    expect(r.sharedChoices).toEqual([]);
  });
});
