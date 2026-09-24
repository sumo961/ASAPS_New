import { describe, it, expect } from 'vitest';
import {
  characterLabel,
  detectRenames,
  planLinkedSpeakerRefresh,
  renameSpeakerVoices,
} from '../renameCharacter';
import { findReferencesByName, relinkReferences } from '../relinkReferences';

const guardBefore = { id: 'c1', name: 'Guard', displayName: 'Guard' };
const guardAfter = { id: 'c1', name: 'Marco', displayName: 'Marco' };
const wolf = { id: 'c2', name: 'Wolf' };

describe('detectRenames', () => {
  it('reports characters whose name or display name changed, with shown labels', () => {
    const r = detectRenames([guardBefore, wolf], [guardAfter, wolf]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ oldLabel: 'Guard', newLabel: 'Marco' });
  });
  it('ignores additions, deletions and edits that leave both names alone', () => {
    expect(detectRenames([guardBefore], [{ ...guardBefore, color: '#f00' } as any, wolf])).toEqual([]);
    expect(detectRenames([guardBefore, wolf], [wolf])).toEqual([]);
  });
  it('a display-name-only change counts (that is what the player shows)', () => {
    const r = detectRenames([{ id: 'x', name: 'granny' }], [{ id: 'x', name: 'granny', displayName: 'Grandma' }]);
    expect(r[0]).toMatchObject({ oldLabel: 'granny', newLabel: 'Grandma' });
  });
  it('label falls back displayName → name → id', () => {
    expect(characterLabel({ id: 'i' })).toBe('i');
    expect(characterLabel({ id: 'i', name: 'n' })).toBe('n');
  });
});

describe('planLinkedSpeakerRefresh', () => {
  const beats = [
    { id: 'b1', type: 'infoText', speaker: 'Guard', characterRef: 'c1', parameters: {} },
    { id: 'b2', type: 'infoText', speaker: 'Guard', parameters: {} }, // free text — not touched
    { id: 'b3', type: 'infoText', speaker: 'Wolf', characterRef: 'c2', parameters: {} },
    {
      id: 'b4', type: 'dialogTree', speaker: '', parameters: {
        other: 1,
        dialogTree: {
          speaker: 'Guard', characterRef: 'c1', text: 'Halt!',
          choices: [
            { id: 'a', text: 'Hi', dialogNode: { speaker: 'Guard', characterRef: 'c1', text: 'Move along.' } },
            { id: 'b', text: 'Bye', dialogNode: { speaker: 'Guard', text: 'Unlinked guard' } },
            { id: 'c', text: 'Leave', target: 'b1' },
          ],
        },
      },
    },
  ];

  it('refreshes linked beat speakers and linked dialog nodes only', () => {
    const plan = planLinkedSpeakerRefresh(beats, guardAfter);
    expect([...plan.keys()].sort()).toEqual(['b1', 'b4']);
    expect(plan.get('b1')).toEqual({ speaker: 'Marco' });
    const tree = plan.get('b4')!.parameters!.dialogTree;
    expect(plan.get('b4')!.parameters!.other).toBe(1);
    expect(tree.speaker).toBe('Marco');
    expect(tree.choices[0].dialogNode.speaker).toBe('Marco');
    expect(tree.choices[1].dialogNode.speaker).toBe('Guard'); // unlinked stays
    expect(tree.choices[2]).toBe(beats[3].parameters!.dialogTree.choices[2]); // untouched branch keeps identity
  });

  it('does not mutate its input and is a no-op when copies are current', () => {
    const snapshot = JSON.stringify(beats);
    planLinkedSpeakerRefresh(beats, guardAfter);
    expect(JSON.stringify(beats)).toBe(snapshot);
    expect(planLinkedSpeakerRefresh(beats, guardBefore).size).toBe(0);
  });
});

describe('free-text mentions of the old name (offered, not forced)', () => {
  it('findReferencesByName with the OLD names finds the unlinked sites; applying uses the NEW label + link', () => {
    const beats = [
      { id: 'b1', type: 'infoText', speaker: 'Guard', characterRef: 'c1', parameters: {} },
      { id: 'b2', type: 'infoText', speaker: 'guard', parameters: {} },
      { id: 'b3', type: 'addRemoveInventory', parameters: { character: 'Guard' } },
    ];
    const matches = findReferencesByName(
      beats,
      { id: 'c1', name: guardBefore.name, displayName: guardBefore.displayName },
      [guardAfter, wolf],
    );
    expect(matches.map((m) => m.beatId).sort()).toEqual(['b2', 'b3']);
    const after = relinkReferences(beats, matches, guardAfter) as any[];
    expect(after[1]).toMatchObject({ speaker: 'Marco', characterRef: 'c1' });
    expect(after[2].parameters.character).toBe('c1');
    expect(after[0]).toBe(beats[0]);
  });
});

describe('renameSpeakerVoices', () => {
  const voices = { openai: { Guard: 'onyx', Wolf: 'echo' }, elevenlabs: { Guard: 'v-123' } };
  it('moves each provider\'s voice from the old label to the new one', () => {
    const next = renameSpeakerVoices(voices, [{ oldLabel: 'Guard', newLabel: 'Marco' }])!;
    expect(next.openai).toEqual({ Wolf: 'echo', Marco: 'onyx' });
    expect(next.elevenlabs).toEqual({ Marco: 'v-123' });
    expect(voices.openai.Guard).toBe('onyx'); // input untouched
  });
  it('returns the same object when nothing moves', () => {
    expect(renameSpeakerVoices(voices, [{ oldLabel: 'Nobody', newLabel: 'X' }])).toBe(voices);
    expect(renameSpeakerVoices(undefined, [{ oldLabel: 'Guard', newLabel: 'Marco' }])).toBeUndefined();
  });
  it('keeps both entries when the new label already has a voice', () => {
    const v = { openai: { Guard: 'onyx', Marco: 'alloy' } };
    expect(renameSpeakerVoices(v, [{ oldLabel: 'Guard', newLabel: 'Marco' }])).toBe(v);
  });
});
