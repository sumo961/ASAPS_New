import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story, BeatTypeRegistry } from '@asaps/core';
import { collectProblems } from '../problems';
import { searchSituations } from '../../../services/storySimulation';

beforeEach(() => vi.stubGlobal('setInterval', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

function build(beats: any[]): Story {
  const story = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  for (const b of beats) story.addBeat(BeatTypeRegistry.getInstance().createBeat(b.type, b));
  return story;
}
const end = { id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'e', showRestart: false } };

describe('collectProblems', () => {
  it('a clean story has none', () => {
    const story = build([{ id: 's', name: 'S', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] }, end]);
    expect(collectProblems(story, searchSituations(story))).toEqual([]);
  });

  it('lists a dead end first and says what stops there', () => {
    const story = build([
      { id: 'm', name: 'Menu', type: 'multiChoice', parameters: { question: 'q', choices: [{ id: 'a', text: 'A', target: 'end' }, { id: 'b', text: 'B', target: 'stop' }] } },
      { id: 'stop', name: 'Stop', type: 'infoText', parameters: { text: 't' } }, end,
    ]);
    const [first] = collectProblems(story, searchSituations(story));
    expect(first).toMatchObject({ severity: 'error', label: 'Dead end', beatId: 'stop' });
  });

  it('tells unreachable beats by their cause, with what is behind it', () => {
    const story = build([
      { id: 's', name: 'S', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] }, end,
      { id: 'lost', name: 'Lost', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'lost2' }] },
      { id: 'lost2', name: 'Lost 2', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
    ]);
    const unreachable = collectProblems(story, searchSituations(story)).filter((p) => p.label === 'Nothing links here');
    expect(unreachable.map((p) => [p.beatId, p.behindIt, p.severity])).toEqual([['lost', 1, 'warning']]);
  });

  it('merges repeats of one problem on one beat', () => {
    const line = (id: string) => ({ id, speaker: 'N', text: id, choices: [] });
    const story = build([{ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'a', text: 'Go', target: 'end' },
      { id: 'b', text: 'One', dialogNode: line('x') },
      { id: 'c', text: 'Two' },
      { id: 'e', text: 'Three' },
    ] } } }, end]);
    const replies = collectProblems(story, searchSituations(story)).filter((p) => p.label === 'Reply goes nowhere');
    expect(replies).toHaveLength(1);
    expect(replies[0].more).toHaveLength(1);
  });
});
