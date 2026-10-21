/**
 * Fields a newer ASAPS adds to dialog lines and replies must survive an
 * older one loading and saving the tree. Rebuilding lines from a list of
 * known fields made an outdated version strip every "continue" step and
 * speaker look from a group's dialogs (bullying-IDN, 2026-10-20).
 */
import { describe, it, expect } from 'vitest';
import { DialogTreeBeat } from '../../src/beats/DialogTreeBeat';

const make = (dialogTree: any) => new DialogTreeBeat({ id: 'b', name: 'b', type: 'dialogTree', parameters: { dialogTree }, connections: [] } as any);

describe('DialogTreeBeat keeps fields it does not know', () => {
  it('passes unknown line and reply fields through a load and save', () => {
    const tree = {
      id: 'root', speaker: 'A', text: 'Hi', futureLineField: { a: 1 },
      choices: [
        { id: 'c1', text: '', continue: true, futureReplyField: 'x', dialogNode: { id: 'n', speaker: 'B', text: 'Yo', speakerState: 's1', futureLineField: 2, choices: [] } },
        { id: 'c2', text: 'Bye', target: 'beat_end', futureReplyField: [1, 2] },
      ],
    };
    const out = (make(tree).toJSON() as any).parameters.dialogTree;
    expect(out.futureLineField).toEqual({ a: 1 });
    expect(out.choices[0].futureReplyField).toBe('x');
    expect(out.choices[0].continue).toBe(true);
    expect(out.choices[0].dialogNode.futureLineField).toBe(2);
    expect(out.choices[0].dialogNode.speakerState).toBe('s1');
    expect(out.choices[1].futureReplyField).toEqual([1, 2]);
    expect(out.choices[1].target).toBe('beat_end');
  });

  it('still migrates the old formats (next, a node as target)', () => {
    const out = (make({
      id: 'root', speaker: 'A', text: 'Hi', next: { speaker: 'B', text: 'Then me', choices: [] },
      choices: [],
    }).toJSON() as any).parameters.dialogTree;
    expect(out.next).toBeUndefined();
    expect(out.choices[0]).toMatchObject({ continue: true, dialogNode: { speaker: 'B', text: 'Then me' } });

    const old = (make({
      id: 'root', speaker: 'A', text: 'Hi',
      choices: [{ id: 'c', text: 'Go on', target: { speaker: 'B', text: 'Nested', choices: [] } }],
    }).toJSON() as any).parameters.dialogTree;
    expect(typeof old.choices[0].target).not.toBe('object');
    expect(old.choices[0].dialogNode).toMatchObject({ speaker: 'B', text: 'Nested' });
  });
});
