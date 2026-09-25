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

describe('path simulation through AI conditions and multi-choice', () => {
  it('explores every AI-condition category and every multi-choice option (with its effects)', () => {
    const story = new Story({ title: 'Branches', author: 'Test', firstBeatId: 'ask' });
    story.addBeat(createTestBeat({ id: 'ask', name: 'Ask', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'c1', text: 'Kind', target: 'judge', effects: [{ type: 'setVariable', target: 'tone', value: 'kind' }] },
      { id: 'c2', text: 'Harsh', target: 'judge', effects: [{ type: 'setVariable', target: 'tone', value: 'harsh' }] },
    ] } } as any));
    story.addBeat(createTestBeat({ id: 'judge', name: 'Judge', type: 'aiCondition', parameters: { categories: [
      { name: 'warm', description: 'w', targetId: 'endWarm' }, { name: 'cold', description: 'c', targetId: 'endCold' },
    ] } } as any));
    story.addBeat(createTestBeat({ id: 'endWarm', name: 'Warm', type: 'endScreen', parameters: { message: 'w', showRestart: false } }));
    story.addBeat(createTestBeat({ id: 'endCold', name: 'Cold', type: 'endScreen', parameters: { message: 'c', showRestart: false } }));
    const endings = new Set<string>(); const tones = new Set<unknown>();
    for (const o of new StateSimulationAnalyzer(story).analyze().outcomes as any[]) {
      for (const v of o.pathVariations ?? []) {
        const steps = v.simulatedPath?.steps ?? [];
        endings.add(steps[steps.length - 1]?.beatId);
        tones.add(steps.find((s: any) => s.beatId === 'judge')?.stateAfter.variables.get('tone'));
      }
    }
    expect([...endings].sort()).toEqual(['endCold', 'endWarm']);
    expect([...tones].sort()).toEqual(['harsh', 'kind']);
  });
});
