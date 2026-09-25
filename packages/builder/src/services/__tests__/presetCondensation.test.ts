/**
 * "Start as if…" presets are condensed to states that PLAY differently from
 * the target beat on (2026-09-26): a 76-beat story offered 446 near-identical
 * states for one beat. Two states merge when every condition ahead comes out
 * the same and every placeholder ahead reads the same.
 */
import { describe, it, expect } from 'vitest';
import { Story, BeatTypeRegistry } from '@asaps/core';
import { generatePathPresets } from '../PathBasedPresetGenerator';

function story(beats: any[]) {
  const s = new Story({ title: 't', firstBeatId: beats[0].id } as any);
  const reg = BeatTypeRegistry.getInstance();
  beats.forEach((b) => s.addBeat(reg.createBeat(b.type, b)));
  return s;
}
const choice = (id: string, text: string, target: string, effects: any[]) => ({ id, text, target, effects });

describe('preset condensation', () => {
  const beats = [
    { id: 'a', type: 'multiChoice', name: 'A', parameters: { question: 'q', choices: [
      choice('a1', 'One', 'b', [{ type: 'setVariable', target: 'mood', value: 'x' }, { type: 'incrementCounter', target: 'score', value: 1 }]),
      choice('a2', 'Two', 'b', [{ type: 'setVariable', target: 'mood', value: 'y' }, { type: 'incrementCounter', target: 'score', value: 2 }]),
      choice('a3', 'Three', 'b', [{ type: 'setVariable', target: 'mood', value: 'z' }, { type: 'incrementCounter', target: 'score', value: 5 }]),
    ] } },
    { id: 'b', type: 'infoText', name: 'B', parameters: { text: 'Here.' }, connections: [{ targetId: 'gate' }] },
    { id: 'gate', type: 'conditionBeat', name: 'Gate', parameters: { condition: { type: 'counter', variableName: 'score', operator: '>=', value: 4 }, trueTarget: 'end', falseTarget: 'end' } },
    { id: 'end', type: 'endScreen', name: 'End', parameters: { message: 'x', showRestart: false } },
  ];

  it('merges states that differ only in what nothing ahead reads; keeps each side of a gate', () => {
    // mood is never read; score is gated at >= 4 → two situations: 1–2 and 5.
    const r = generatePathPresets(story(beats), 'b');
    expect(r.presets).toHaveLength(2);
    expect(r.presets.map((p) => p.preset.state.counters.score >= 4).sort()).toEqual([false, true]);
  });

  it('a placeholder ahead makes its values distinct', () => {
    const withText = beats.map((b) => (b.id === 'b' ? { ...b, parameters: { text: 'You felt ${mood}.' } } : b));
    expect(generatePathPresets(story(withText), 'b').presets).toHaveLength(3);
  });
});
