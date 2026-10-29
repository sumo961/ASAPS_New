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

  it('only the beat types it can carry across are offered', () => {
    expect(changeableTypes(make('infoText', {}))).toContain('multiChoice');
    expect(changeableTypes(make('infoText', {}))).not.toContain('infoText');
    expect(changeableTypes(make('setVariable', {}))).toEqual([]);
  });
});
