import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story, BeatTypeRegistry } from '@asaps/core';
import { collectProblems, dialogCanEndWithoutExit } from '../problems';
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

  it('calls an imported scene\'s link to a merged beat unused while every line has a way out', () => {
    // As ASML 1.0 imports leave them: the beat's links name the beats its
    // lines were merged from (12), the tree's own exits go elsewhere.
    const tree = (last: any) => ({ id: 'r', speaker: 'Wolf', text: 'Hello.', choices: [
      { id: 'a', text: 'Hi.', dialogNode: { id: 'n', speaker: 'Wolf', text: 'Seymour.', choices: [{ id: 'b', text: 'Odd name', target: 'end' }, ...last] } },
    ] });
    const scene = (last: any[]) => build([{ id: 'd', name: 'Wolf', type: 'dialogTree', parameters: { dialogTree: tree(last) }, connections: [{ targetId: '12', label: 'Hi.' }] }, end]);

    const quiet = collectProblems(scene([]), searchSituations(scene([])));
    expect(quiet.map((p) => [p.label, p.severity])).toEqual([['Unused old link', 'note']]);
    expect(quiet[0].message).toContain('(12)');

    // A next line with no exit now ends the scene, and the old link is taken.
    const gran = [{ id: 'c', text: '', continue: true, dialogNode: { id: 'g', speaker: 'Gran', text: '', choices: [] } }];
    const broken = collectProblems(scene(gran), searchSituations(scene(gran)));
    expect(broken.find((p) => p.label === 'Broken link')).toMatchObject({ severity: 'error', beatId: 'd' });
    expect(broken.find((p) => p.label === 'Line without words')?.message).toContain('A line by Gran after "Seymour."');
  });

  it('knows when a Dialog Tree can end on a line with no exit', () => {
    expect(dialogCanEndWithoutExit({ text: 'a', choices: [{ text: 'x', target: 'e' }] })).toBe(false);
    expect(dialogCanEndWithoutExit({ text: 'a', target: 'e', choices: [] })).toBe(false);
    expect(dialogCanEndWithoutExit({ text: 'a', choices: [] })).toBe(true);
    expect(dialogCanEndWithoutExit({ text: 'a', choices: [{ text: 'x', target: 'e', conditions: [{ type: 'hasItem', item: 'k' }] }] })).toBe(true);
    expect(dialogCanEndWithoutExit({ text: 'a', choices: [{ text: 'x' }] })).toBe(true);
  });
});
