import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { changeBeatType, changeableTypes } from '../changeBeatType';

const registry = BeatTypeRegistry.getInstance();
const make = (type: string, extra: Record<string, any>) =>
  registry.createBeat(type, { id: 'b1', name: 'Hallway', type, x: 40, y: 80, cluster: 'c1', speaker: 'Ann', ...extra } as any) as any;
const targets = (beat: any) => beat.getConnections().map((c: any) => c.targetId);

describe('changeBeatType', () => {
  it('Info Text → Explanation: same id, place, text, link (with its effects) and background', () => {
    const before = make('infoText', {
      node: 'asset_bg',
      parameters: { text: 'Rain.' },
      connections: [{ targetId: 'next', label: '', effects: [{ type: 'counter', name: 'n', operation: 'add', value: 1 }] }],
    });
    const { beat, losses } = changeBeatType(before, 'explanation');
    expect(beat.type).toBe('explanation');
    expect([beat.id, beat.name, beat.x, beat.y, beat.cluster, beat.speaker]).toEqual(['b1', 'Hallway', 40, 80, 'c1', 'Ann']);
    expect(beat.getParameters().text).toBe('Rain.');
    expect(beat.node).toBe('asset_bg');
    expect(beat.connections[0]).toMatchObject({ targetId: 'next', effects: [{ name: 'n' }] });
    expect(losses).toEqual([]);
  });

  it('Info Text → Multi Choice: the text is asked, the link is the first choice', () => {
    const { beat, losses } = changeBeatType(make('infoText', { parameters: { text: 'Now?' }, connections: [{ targetId: 'next', label: '' }] }), 'multiChoice');
    expect(beat.getParameters().question).toBe('Now?');
    expect(beat.getParameters().choices).toMatchObject([{ text: 'Continue', target: 'next' }]);
    expect(targets(beat)).toEqual(['next']);
    expect(losses).toEqual([]);
  });

  it('Multi Choice → Movement Choice keeps every choice, its effects and conditions', () => {
    const choices = [
      { id: 'a', text: 'Run', target: 'x', effects: [{ type: 'counter', name: 'fear', operation: 'add', value: 1 }] },
      { id: 'b', text: 'Hide', target: 'y', conditions: [{ type: 'variable', name: 'dark', operator: '==', value: true }] },
    ];
    const { beat, losses } = changeBeatType(make('multiChoice', { parameters: { question: 'Now?', choices } }), 'movementChoice');
    expect(beat.getParameters().choices).toMatchObject(choices);
    expect(targets(beat).sort()).toEqual(['x', 'y']);
    expect(losses).toEqual([]);
  });

  it('Multi Choice → Info Text names the choices it cannot keep', () => {
    const { beat, losses } = changeBeatType(make('multiChoice', { parameters: { question: 'Now?', choices: [
      { id: 'a', text: 'Run', target: 'x' }, { id: 'b', text: 'Hide', target: 'y' },
    ] } }), 'infoText');
    expect(beat.getParameters().text).toBe('Now?');
    expect(targets(beat)).toEqual(['x']);
    expect(losses.join(' ')).toMatch(/“Hide”/);
  });

  it('Multi Choice ↔ Dialog Tree: the question is the first line, the choices its replies', () => {
    const mc = make('multiChoice', { parameters: { question: 'Tea?', choices: [{ id: 'a', text: 'Yes', target: 'x' }, { id: 'b', text: 'No', target: 'y' }] } });
    const { beat: dt } = changeBeatType(mc, 'dialogTree');
    expect(dt.getParameters().dialogTree).toMatchObject({ speaker: 'Ann', text: 'Tea?', choices: [{ text: 'Yes', target: 'x' }, { text: 'No', target: 'y' }] });
    expect(targets(dt).sort()).toEqual(['x', 'y']);
    const { beat: back, losses } = changeBeatType(dt, 'multiChoice');
    expect(back.getParameters()).toMatchObject({ question: 'Tea?', choices: [{ text: 'Yes', target: 'x' }, { text: 'No', target: 'y' }] });
    expect(losses).toEqual([]);
  });

  it('a Dialog Tree with a deeper conversation says what goes', () => {
    const dt = make('dialogTree', { parameters: { dialogTree: { id: 'r', speaker: 'Ann', text: 'Hi', choices: [
      { id: 'a', text: 'Why?', dialogNode: { id: 'n', speaker: 'Ann', text: 'Because.', choices: [] } },
    ] } } });
    expect(changeBeatType(dt, 'multiChoice').losses.join(' ')).toMatch(/conversation after “Why\?”/);
  });

  it('names the settings the new type does not have', () => {
    const { losses } = changeBeatType(make('infoText', { parameters: { text: 'Hi', buttonText: 'Onward', textVariations: ['Hello'] } }), 'multiChoice');
    expect(losses.join(' ')).toMatch(/Button/i);
    expect(losses.join(' ')).toMatch(/Variations/i);
  });

  it('Multi Choice → Free Layout: a text box with the question and a button for each choice, laid out on the stage', () => {
    const choices = [
      { id: 'a', text: 'Run', target: 'x', effects: [{ type: 'counter', name: 'fear', operation: 'add', value: 1 }] },
      { id: 'b', text: 'Hide', target: 'y' },
    ];
    const { beat, losses } = changeBeatType(make('multiChoice', { parameters: { question: 'Now?', choices } }), 'freeLayout', { width: 1000, height: 500 });
    const p = beat.getParameters();
    const locs = [...beat.locations.values()];
    expect(locs.map((l: any) => [l.name, l.kind])).toEqual([['Text', 'text'], ['Button', 'button'], ['Button 2', 'button']]);
    expect(locs.every((l: any) => l.x >= 0 && l.y >= 0 && l.x + l.width <= 1000 && l.y + l.height <= 500)).toBe(true);
    expect(p.texts).toMatchObject([{ locationName: 'Text', elementId: locs[0].id, text: 'Now?' }]);
    expect(p.choices).toMatchObject([
      { id: 'a', locationName: 'Button', elementId: locs[1].id, text: 'Run', target: 'x', effects: [{ name: 'fear' }] },
      { id: 'b', locationName: 'Button 2', text: 'Hide', target: 'y' },
    ]);
    expect(targets(beat)).toEqual(['x', 'y']);
    // A Free Layout shows no speaker's name.
    expect(losses).toEqual(['its Speaker (Free Layout has no such setting)']);
  });

  it('a choice\'s sound becomes its button\'s Click Sound, and back', () => {
    const before = make('multiChoice', { parameters: { question: 'Now?', choices: [{ id: 'a', text: 'Run', target: 'x', soundEffect: 'preset:soft-click' }] } });
    const { beat } = changeBeatType(before, 'freeLayout');
    const button = [...beat.locations.values()].find((l: any) => l.kind === 'button') as any;
    expect(button.sound).toBe('preset:soft-click');
    expect(beat.getParameters().choices[0].soundEffect).toBeUndefined();
    const back = changeBeatType(beat, 'multiChoice').beat;
    expect(back.getParameters().choices[0].soundEffect).toBe('preset:soft-click');
  });

  it('Info Text → Free Layout: its link is a button with its button text', () => {
    const { beat, losses } = changeBeatType(make('infoText', { parameters: { text: 'Rain.', buttonText: 'Go inside' }, connections: [{ targetId: 'next', label: '' }] }), 'freeLayout');
    expect(beat.getParameters().choices).toMatchObject([{ text: 'Go inside', target: 'next', locationName: 'Button' }]);
    expect(targets(beat)).toEqual(['next']);
    expect(losses.join(' ')).not.toContain('Button Text');
  });

  it('Free Layout → Multi Choice: the first text box is asked, the buttons are the choices; other text boxes are named', () => {
    const before = make('freeLayout', {
      locations: [
        { name: 'Sign', kind: 'text', x: 0, y: 0, width: 100, height: 40 },
        { name: 'Note', kind: 'text', x: 0, y: 50, width: 100, height: 40 },
        { name: 'Door', kind: 'button', x: 0, y: 100, width: 100, height: 40 },
        { name: 'Lamp', kind: 'prop', x: 0, y: 150, width: 40, height: 40 },
      ],
      parameters: {
        texts: [{ locationName: 'Sign', text: 'Where now?' }, { locationName: 'Note', text: 'A note.' }],
        choices: [
          { id: 'd', locationName: 'Door', text: 'Leave', target: 'x' },
          { id: 'l', locationName: 'Lamp', text: '', target: 'y' },
          { id: 'gone', locationName: 'Deleted', text: 'Old', target: 'z' },
        ],
      },
    });
    const { beat, losses } = changeBeatType(before, 'multiChoice');
    expect(beat.getParameters().question).toBe('Where now?');
    expect(beat.getParameters().choices).toMatchObject([{ id: 'd', text: 'Leave', target: 'x' }, { id: 'l', text: 'Lamp', target: 'y' }]);
    expect(losses.join(' ')).toContain('“A note.”');
    expect(losses.join(' ')).toContain('layout in the Visual Editor');
  });

  it('Free Layout → Info Text: the button\'s words go on the beat\'s own button', () => {
    const before = make('freeLayout', {
      locations: [{ name: 'Text', kind: 'text', x: 0, y: 0, width: 100, height: 40 }, { name: 'Button', kind: 'button', x: 0, y: 50, width: 100, height: 40 }],
      parameters: { texts: [{ locationName: 'Text', text: 'Rain.' }], choices: [{ id: 'c', locationName: 'Button', text: 'Go inside', target: 'next' }] },
    });
    const { beat, losses } = changeBeatType(before, 'infoText');
    expect(beat.getParameters()).toMatchObject({ text: 'Rain.', buttonText: 'Go inside' });
    expect(targets(beat)).toEqual(['next']);
    expect(losses.join(' ')).not.toContain('button text');
  });

  it('only the beat types it can carry across are offered', () => {
    expect(changeableTypes(make('infoText', {}))).toContain('multiChoice');
    expect(changeableTypes(make('infoText', {}))).not.toContain('infoText');
    expect(changeableTypes(make('infoText', {}))).toContain('freeLayout');
    expect(changeableTypes(make('setVariable', {}))).toEqual([]);
  });
});
