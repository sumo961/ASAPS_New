/**
 * Path simulation follows every random branch and runs branch + link
 * effects (2026-09-25). It used to follow only a randomTarget's first
 * branch, so analysis — and the "Start as if…" / "Show as" states built on
 * it — never saw the other draws.
 */
import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

function build(): Story {
  const story = new Story({ title: 'Random', author: 'Test', firstBeatId: 'draw' });
  story.addBeat(createTestBeat({ id: 'draw', name: 'Case draw', type: 'randomTarget', parameters: { choices: [
    { target: 'briefA', effects: [{ type: 'setVariable', target: 'CaseVariant', value: 'A' }] },
    { target: 'briefB', effects: [{ type: 'setVariable', target: 'CaseVariant', value: 'B' }] },
    { target: 'briefC', weight: 0, effects: [{ type: 'setVariable', target: 'CaseVariant', value: 'C' }] },
  ] } } as any));
  for (const id of ['briefA', 'briefB', 'briefC']) {
    story.addBeat(createTestBeat({ id, name: id, type: 'infoText', parameters: { text: id },
      connections: [{ targetId: 'end', effects: [{ type: 'setCounter', target: 'Clock', value: id === 'briefB' ? 180 : 240 }] }] } as any));
  }
  story.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'x' } }));
  return story;
}

function arrivals(story: Story, beatId: string) {
  const out: Array<{ variant: unknown; clock: unknown }> = [];
  for (const o of new StateSimulationAnalyzer(story).analyze().outcomes as any[]) {
    for (const v of o.pathVariations ?? []) {
      const steps = v.simulatedPath?.steps ?? [];
      const i = steps.findIndex((s: any) => s.beatId === beatId);
      if (i > 0) out.push({ variant: steps[i - 1].stateAfter.variables.get('CaseVariant'), clock: steps[i - 1].stateAfter.counters.get('Clock') });
    }
  }
  return out;
}

describe('path simulation through a random draw', () => {
  it('explores every drawable branch with its effects, and runs link effects', () => {
    const got = arrivals(build(), 'end').sort((a, b) => String(a.variant).localeCompare(String(b.variant)));
    expect(got).toEqual([{ variant: 'A', clock: 240 }, { variant: 'B', clock: 180 }]);
  });
});
