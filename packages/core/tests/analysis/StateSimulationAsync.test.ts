import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

/** Three-way choices whose branches rejoin at the next choice: 3^levels paths. */
function wideStory(levels: number): Story {
  const story = new Story({ title: 'Wide', author: 'Test', firstBeatId: 'c0' });
  for (let i = 0; i < levels; i++) {
    const next = i + 1 < levels ? `c${i + 1}` : 'end';
    const options = ['a', 'b', 'c'];
    story.addBeat(createTestBeat({
      id: `c${i}`,
      name: `Choice ${i}`,
      type: 'multiChoice',
      parameters: { question: `Q${i}`, choices: options.map((t) => ({ text: t })) },
      connections: options.map((t) => ({ targetId: `c${i}${t}`, label: t })),
    }));
    for (const t of options) {
      story.addBeat(createTestBeat({ id: `c${i}${t}`, name: `${i}${t}`, type: 'infoText', parameters: { text: t }, connections: [{ targetId: next }] }));
    }
  }
  story.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'End' } }));
  return story;
}

describe('StateSimulationAnalyzer.analyzeAsync', () => {
  it('gives the same result as analyze(), reporting progress between slices', async () => {
    const story = wideStory(6);
    const sync = new StateSimulationAnalyzer(story).analyze();
    const progress: number[] = [];
    const async = await new StateSimulationAnalyzer(story).analyzeAsync((p) => progress.push(p.expansions), undefined, 0);
    expect(progress.length).toBeGreaterThan(0);
    expect(async.outcomes.length).toBe(sync.outcomes.length);
    expect(async.totalPaths).toBe(sync.totalPaths);
    expect(async.reachableBeats.sort()).toEqual(sync.reachableBeats.sort());
    // Progress only climbs.
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it('stops when cancelled', async () => {
    const signal = { aborted: false };
    const run = new StateSimulationAnalyzer(wideStory(6)).analyzeAsync(() => { signal.aborted = true; }, signal, 0);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});
