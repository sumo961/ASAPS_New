import { describe, it, expect } from 'vitest';
import { dialogTreeToText, textToDialogTree } from '../dialogTreeText';

const beats = [
  { id: 'beat_talk', name: 'Talk to Vic' },
  { id: 'beat_home', name: 'Go home' },
  { id: 'beat_end', name: 'End of day' },
  { id: 'beat_a', name: 'Twin' },
  { id: 'beat_b', name: 'Twin' }, // a name used twice → written as the id
];

const tree = {
  id: 'root', speaker: 'Friend', text: 'I saw what happened at lunch.', speakerState: 'sad', emotion: 'worried',
  choices: [
    {
      id: 'c1', text: 'Me too. I should have done something.', soundEffect: 'click',
      effects: [{ type: 'incrementCounter', target: 'courage', value: 1 }],
      dialogNode: {
        id: 'n2', speaker: 'Friend', text: "Then let's talk to Vic together.",
        choices: [
          { id: 'c2', text: "Okay, let's go.", target: 'beat_talk' },
          { id: 'c3', text: 'Not today.', target: 'beat_home', conditions: [{ type: 'inventory', item: 'phone', checkType: 'notHas' }] },
        ],
      },
    },
    {
      id: 'c4', text: "It's none of my business.", conditions: [{ type: 'counter', variableName: 'courage', operator: '<', value: 2 }],
      dialogNode: {
        id: 'n3', speaker: 'Friend', text: 'Or would that just\nmake things {worse} -> really?',
        choices: [
          {
            id: 'k1', text: '', continue: true, conditions: [{ type: 'visitedBeat', beatId: 'beat_talk', operator: 'not' }],
            dialogNode: {
              id: 'n4', speaker: 'Teacher', text: 'Everything all right here?',
              choices: [
                { id: 'c5', text: 'Yes, all fine.', target: 'beat_end', effects: [
                  { type: 'setVariable', target: 'lied', value: true },
                  { type: 'addInventory', target: 'note', character: 'Billie' },
                  { type: 'nudgeMood', target: 'Teacher', valenceDelta: -0.2 },
                ] },
                { id: 'c6', text: '> starts with an arrow', target: 'beat_b' },
                { id: 'c7', text: 'Loop', target: '__self__' },
              ],
            },
          },
        ],
      },
    },
  ],
};

/** The tree without what the text leaves out (ids, looks, emotions, sounds). */
function core(n: any): any {
  if (!n || typeof n !== 'object') return n;
  if (Array.isArray(n)) return n.map(core);
  const { id, speakerState, emotion, soundEffect, visible, characterRef, ...rest } = n;
  const out: any = {};
  for (const [k, v] of Object.entries(rest)) out[k] = core(v);
  return out;
}

describe('dialog tree as text', () => {
  const text = dialogTreeToText(tree, { title: 'E2 - Victim&Friend', beats });

  it('reads like a script', () => {
    expect(text).toContain('# E2 - Victim&Friend');
    expect(text).toContain('Friend: I saw what happened at lunch.');
    expect(text).toContain("  > Me too. I should have done something.  {courage +1}");
    expect(text).toContain("      > Okay, let's go.  -> Talk to Vic");
    expect(text).toContain('{if lacks phone}  -> Go home');
    expect(text).toContain("  > It's none of my business.  {if courage < 2}");
    expect(text).toContain('    then Teacher: Everything all right here?  {if not visited Talk to Vic}');
    expect(text).toContain('{set lied = true} {give note (Billie)} {effect {"type":"nudgeMood"');
    expect(text).toContain('-> beat_b'); // ambiguous name → id
    expect(text).toContain('-> (start)');
    expect(text).toMatch(/Left out: speaker looks, emotions, reply sounds and visibility/);
  });

  it('comes back as the same conversation', () => {
    const back = textToDialogTree(text, { beats });
    expect(back.warnings).toEqual([]);
    expect(core(back.tree)).toEqual(core(tree));
  });

  it('keeps special characters in lines and replies', () => {
    const back = textToDialogTree(text, { beats });
    const n3 = back.tree.choices[1].dialogNode;
    expect(n3.text).toBe('Or would that just\nmake things {worse} -> really?');
    expect(n3.choices[0].dialogNode.choices[1].text).toBe('> starts with an arrow');
  });

  it('reads hand-written text, and says what it could not place', () => {
    const back = textToDialogTree([
      'Guide: Welcome!',
      '  > Hi  -> Talk to Vic',
      '  > Who are you?',
      '    Guide: Your guide.  -> Nowhere',
      'stray line without a speaker',
    ].join('\n'), { beats });
    expect(back.tree.speaker).toBe('Guide');
    expect(back.tree.choices[0].target).toBe('beat_talk');
    expect(back.tree.choices[1].dialogNode.text).toBe('Your guide.');
    expect(back.warnings.some((w) => w.includes('"Nowhere"'))).toBe(true);
    expect(back.warnings.some((w) => w.includes('Line 5'))).toBe(true);
  });

  it('reports text with no character line', () => {
    expect(textToDialogTree('# only a comment').warnings[0]).toMatch(/No character line/);
  });

  it('reads "then" written at the same level as the line it follows (as people write it)', () => {
    const r = textToDialogTree([
      'Friend: I saw what happened at lunch.',
      '  > Me too.  {courage +1}',
      '    Friend: Then let\'s talk to Vic together.  -> Talk to Vic',
      '  > It\'s none of my business.  {if courage < 2}',
      '    Friend: Or would that just make things worse?',
      '    then Teacher: Everything all right here?',
      '    then Friend: ...',
      '      > Yes.  {if var met_vic == true} {if has key} {courage = 3} {set met_vic = true} {give key} {take key (Billie)}  -> End of day',
    ].join('\n'), { beats });
    expect(r.warnings).toEqual([]);
    const worse = r.tree.choices[1].dialogNode;
    expect(worse.text).toBe('Or would that just make things worse?');
    const teacher = worse.choices[0];
    expect(teacher).toMatchObject({ continue: true, dialogNode: { speaker: 'Teacher' } });
    const friend = teacher.dialogNode.choices[0];
    expect(friend).toMatchObject({ continue: true, dialogNode: { speaker: 'Friend', text: '...' } });
    const yes = friend.dialogNode.choices[0];
    expect(yes.target).toBe('beat_end');
    expect(yes.conditions).toEqual([
      { type: 'variable', variableName: 'met_vic', operator: '==', value: true },
      { type: 'inventory', item: 'key', checkType: 'has' },
    ]);
    expect(yes.effects).toEqual([
      { type: 'setCounter', target: 'courage', value: 3 },
      { type: 'setVariable', target: 'met_vic', value: true },
      { type: 'addInventory', target: 'key' },
      { type: 'removeInventory', target: 'key', character: 'Billie' },
    ]);
  });

  it('keeps several exported "then" steps as alternatives for one line', () => {
    const t = { speaker: 'A', text: 'Hi', choices: [
      { text: '', continue: true, conditions: [{ type: 'counter', variableName: 'x', operator: '>', value: 1 }], dialogNode: { speaker: 'B', text: 'One', choices: [] } },
      { text: '', continue: true, dialogNode: { speaker: 'C', text: 'Two', choices: [] } },
    ] };
    const back = textToDialogTree(dialogTreeToText(t));
    expect(back.tree.choices.map((c: any) => c.dialogNode.text)).toEqual(['One', 'Two']);
  });
});
