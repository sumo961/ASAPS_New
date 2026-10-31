/**
 * Arrival states: what players can arrive with at each beat, from one path
 * simulation (Story Logic hubs, presets).
 */
import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { arrivalStates, arrivalStateAt, arrivesDifferently, describeArrivalDifferences, stateMentions } from '../../src/analysis/arrivalStates';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

function story(beats: any[], characters?: any[]): Story {
  const s = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  for (const b of beats) s.addBeat(createTestBeat({ name: b.id, ...b } as any));
  if (characters) (s as any).getCharacters = () => characters;
  return s;
}

const info = (id: string, next: string, extra: any = {}) =>
  ({ id, type: 'infoText', parameters: { text: id }, connections: [{ targetId: next }], ...extra });
const end = (id: string) => ({ id, type: 'endScreen', parameters: { message: id } });

// Two ways to the door: one picks up the notebook, one doesn't.
const twoWays = () => story([
  { id: 'start', type: 'multiChoice', parameters: { question: '?', choices: [
    { id: 'a', text: 'Search the desk', target: 'desk' },
    { id: 'b', text: 'Go straight on', target: 'door' },
  ] } },
  { id: 'desk', type: 'addRemoveInventory', parameters: { action: 'add', item: 'notebook', quantity: 1 }, connections: [{ targetId: 'door' }] },
  info('door', 'end'),
  end('end'),
]);

describe('arrivalStates', () => {
  it('groups the ways into a beat by the state they arrive in', () => {
    const paths = new StateSimulationAnalyzer(twoWays()).analyzeRaw();
    const at = arrivalStates(paths);
    expect(at.get('door')).toHaveLength(2);
    // The start beat is reached once, in the starting state.
    expect(at.get('start')).toHaveLength(1);
    expect(at.get('start')![0].pathCount).toBe(2);
    // The beat's own effects are not part of its arrival: the notebook arrives
    // at the door, not at the desk.
    const desk = at.get('desk')![0].state;
    expect(desk.inventory.get('player')?.has('notebook') ?? false).toBe(false);
  });

  it('says what differs, in words', () => {
    const paths = new StateSimulationAnalyzer(twoWays()).analyzeRaw();
    const door = arrivalStates(paths).get('door')!;
    expect(describeArrivalDifferences(door)).toEqual(['with or without notebook']);
  });

  it('arrivals that hold the same are one, whichever way they came', () => {
    const s = story([
      { id: 'start', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'a', text: 'Left', target: 'left' }, { id: 'b', text: 'Right', target: 'right' },
      ] } },
      info('left', 'hub'), info('right', 'hub'), info('hub', 'end'), end('end'),
    ]);
    const hub = arrivalStates(new StateSimulationAnalyzer(s).analyzeRaw()).get('hub')!;
    expect(hub).toHaveLength(1);
    expect(hub[0].pathCount).toBe(2);
    expect(describeArrivalDifferences(hub)).toEqual([]);
  });

  it('names counter ranges, variables and feelings', () => {
    const s = story([
      { id: 'start', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'a', text: 'Back him', target: 'hub', effects: [
          { type: 'setVariable', target: 'brave', value: true },
          { type: 'addSentiment', target: 'tomas', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.6 }] },
        { id: 'b', text: 'Stay quiet', target: 'hub' },
      ] } },
      info('hub', 'end'), end('end'),
    ], [{ id: 'tomas', name: 'Tomas' }]);
    const analyzer = new StateSimulationAnalyzer(s);
    const hub = arrivalStates(analyzer.analyzeRaw()).get('hub')!;
    expect(hub).toHaveLength(2);
    const diffs = describeArrivalDifferences(hub, { affectOf: (st) => analyzer.affectAt(st), nameOf: (r) => (r === 'tomas' ? 'Tomas' : r) });
    expect(diffs).toContain('brave: true / not set');
    expect(diffs).toContain("Tomas's trust → player 0 to 0.6");
  });

  it('the first step arrives in the state its path starts in', () => {
    const paths = new StateSimulationAnalyzer(twoWays()).analyzeRaw();
    expect(arrivalStateAt(paths[0], 0)).toBe(paths[0].steps[0].stateBefore);
  });
});

describe('stateMentions', () => {
  it('matches an item, a set variable or a counter above zero by name', () => {
    const st = { variables: new Map<string, any>([['hasKey', true], ['sawGhost', false]]), counters: new Map([['clues', 2], ['proof', 0]]),
      inventory: new Map([['player', new Set(['Brass Lantern'])], ['tomas', new Set(['map'])]]), visitedBeats: new Set<string>() };
    expect(stateMentions(st, ['key'])).toBe(true);
    expect(stateMentions(st, ['lantern'])).toBe(true);
    expect(stateMentions(st, ['clue'])).toBe(true);
    expect(stateMentions(st, ['ghost'])).toBe(false);   // false
    expect(stateMentions(st, ['proof'])).toBe(false);   // zero
    expect(stateMentions(st, ['map'])).toBe(false);     // someone else's
  });
});

describe('differences the story starts with', () => {
  it("a variant drawn at random is no sign of the way taken; what the way changes still is", () => {
    const arrival = (start: string, items: string[], i: number) => ({
      state: { variables: new Map(), counters: new Map(), inventory: new Map([['player', new Set(items)]]), visitedBeats: new Set<string>() },
      path: {} as any, stepIndex: i, pathCount: 1, startKey: start,
    });
    // Two starting states (captain A or B), each reaching the beat one way only.
    const fromStart = [arrival('captain A', ['coat'], 0), arrival('captain B', [], 1)];
    expect(arrivesDifferently(fromStart)).toBe(false);
    expect(describeArrivalDifferences(fromStart)).toEqual([]);
    // From one start, one way picks up the notebook.
    const byWay = [arrival('captain A', ['notebook'], 0), arrival('captain A', [], 1), arrival('captain B', [], 2)];
    expect(arrivesDifferently(byWay)).toBe(true);
    expect(describeArrivalDifferences(byWay)).toEqual(['with or without notebook']);
  });
});
