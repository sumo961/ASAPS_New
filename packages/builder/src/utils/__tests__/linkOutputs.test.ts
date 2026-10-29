/**
 * A beat's outputs for links drawn in the flowchart (2026-10-29). Each
 * update is applied the way the store applies an Inspector edit
 * (useStoryBuilder.updateBeat): parameters through updateParameters, the
 * rest assigned — then the beat's links must show the new target.
 */
import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { linkOutputs, setAtPath } from '../linkOutputs';

const registry = BeatTypeRegistry.getInstance();
const make = (type: string, extra: Record<string, any> = {}) =>
  registry.createBeat(type, { id: `b_${type}`, name: type, type, ...extra } as any) as any;

function apply(beat: any, updates: Record<string, any>) {
  const { parameters, ...rest } = updates;
  if (parameters) beat.updateParameters(parameters);
  Object.assign(beat, rest);
}
const targets = (beat: any) => beat.getConnections().map((c: any) => c.targetId);

describe('setAtPath', () => {
  it('writes into nested lists and objects', () => {
    const o: any = { a: [{ b: 1 }, { b: 2 }] };
    setAtPath(o, 'a[1].b', 9);
    setAtPath(o, 'c.d', 'x');
    expect(o).toEqual({ a: [{ b: 1 }, { b: 9 }], c: { d: 'x' } });
  });
});

describe('linkOutputs', () => {
  it('a plain beat has one output, its next beat, and keeps the link\'s effects', () => {
    const beat = make('infoText', { connections: [{ targetId: 'old', label: '', effects: [{ type: 'counter', name: 'n', operation: 'add', value: 1 }] }] });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => [o.label, o.target])).toEqual([['Next', 'old']]);
    apply(beat, outs[0].updatesFor('new'));
    expect(targets(beat)).toEqual(['new']);
    expect(beat.connections[0].effects).toHaveLength(1);
  });

  it('Multi Choice: one output per choice, numbered, unlinked ones included', () => {
    const beat = make('multiChoice', { parameters: { question: 'Q', choices: [
      { id: 'a', text: 'Hide', target: '' },
      { id: 'b', text: 'Run', target: 'beat_run' },
    ] } });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => [o.label, o.target])).toEqual([['1 · Hide', ''], ['2 · Run', 'beat_run']]);
    apply(beat, outs[0].updatesFor('beat_hide'));
    expect(targets(beat).sort()).toEqual(['beat_hide', 'beat_run']);
    expect(beat.getParameters().choices[0].text).toBe('Hide');
  });

  it('Condition: If true / If false, written where the Inspector writes them', () => {
    const beat = make('conditionBeat', { parameters: { conditionType: 'variable', variable: 'x', operator: '==', value: 1 } });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => o.label)).toEqual(['If true', 'If false']);
    apply(beat, outs[1].updatesFor('beat_no'));
    expect(beat.getParameters().falseTarget).toBe('beat_no');
    expect(beat.getConnections().find((c: any) => c.label === 'false')?.targetId).toBe('beat_no');
  });

  it('Set Timer: continue and time-out', () => {
    const beat = make('setTimer', { parameters: { value: 30, timerTarget: 'late' } });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => [o.key, o.target])).toEqual([['continueTarget', ''], ['timerTarget', 'late']]);
    apply(beat, outs[0].updatesFor('go_on'));
    expect(targets(beat).sort()).toEqual(['go_on', 'late']);
  });

  it('Dialog Tree: player lines without a reply, and character lines nobody answers', () => {
    const beat = make('dialogTree', { parameters: { dialogTree: {
      id: 'root', speaker: 'Ann', text: 'Hi',
      choices: [
        { id: 'c1', text: 'Bye', target: '' },
        { id: 'c2', text: 'Why?', dialogNode: { id: 'n2', speaker: 'Ann', text: 'Because.', choices: [] } },
      ],
    } } });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => [o.key, o.label])).toEqual([
      ['dialogTree.choices[0].target', 'Bye'],
      ['dialogTree.choices[1].dialogNode.target', 'Why? › after “Because.”'],
    ]);
    apply(beat, outs[0].updatesFor('beat_out'));
    expect(beat.getParameters().dialogTree.choices[0].target).toBe('beat_out');
    expect(targets(beat)).toContain('beat_out');
  });

  it('Random branches stay plain ids when they were', () => {
    const beat = make('randomTarget', { parameters: { choices: ['a', 'b'] } });
    const outs = linkOutputs(beat)!;
    expect(outs.map((o) => o.label)).toEqual(['1 · Branch 1', '2 · Branch 2']);
    apply(beat, outs[1].updatesFor('c'));
    expect(beat.getParameters().choices).toEqual(['a', 'c']);
  });

  it('beat types whose links are only set in the Properties panel say so', () => {
    expect(linkOutputs(make('aiCondition'))).toBeNull();
  });
});
