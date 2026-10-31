/**
 * Path analysis plays what the engine plays (2026-10-31). Each case is a
 * small story the simulator used to get wrong: an ending it reported that
 * the story can't reach, or one it missed.
 */
import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

function story(beats: any[], characters?: any[]): Story {
  const s = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  for (const b of beats) {
    const beat = createTestBeat({ name: b.id, ...b } as any);
    if (b.locations) beat.locations = new Map(b.locations.map((l: any) => [l.id, l]));
    s.addBeat(beat);
  }
  if (characters) (s as any).getCharacters = () => characters;
  return s;
}

const end = (id: string) => ({ id, type: 'endScreen', parameters: { message: id } });
const check = (condition: Record<string, any>, extra: Record<string, any> = {}) =>
  ({ id: 'check', type: 'conditionBeat', parameters: { ...condition, ...extra, trueTarget: 'yes', falseTarget: 'no' } });
const flagCheck = check({ conditionType: 'variable', variableName: 'flag', operator: '==', value: true });

function endings(s: Story): string[] {
  const r = new StateSimulationAnalyzer(s).analyze();
  return [...new Set(r.outcomes.filter((o: any) => o.endType === 'ending').map((o: any) => o.endingBeatId))].sort();
}

const setFlag = [{ type: 'setVariable', target: 'flag', value: true }];

describe('path analysis follows the engine', () => {
  it('branches on every Free Layout button, with its effects', () => {
    const s = story([
      { id: 'fl', type: 'freeLayout', parameters: { choices: [
        { id: 'b1', locationName: 'Button', text: 'Plain', target: 'check' },
        { id: 'b2', locationName: 'Picture', text: '', target: 'check', effects: setFlag },
        { id: 'b3', locationName: 'Deleted', target: 'gone' },
      ] }, locations: [{ id: 'e1', name: 'Button', kind: 'button' }, { id: 'e2', name: 'Picture', kind: 'prop' }] },
      flagCheck, end('yes'), end('no'), end('gone'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it('a choice beat with one way out still applies its effects', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [{ id: 'c', text: 'Go', target: 'check', effects: setFlag }] } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['yes']);
  });

  it('a Dialog Tree reply counts on the way to a line\'s own exit', () => {
    const s = story([
      { id: 'd', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'Bob', text: 'Hi', choices: [
        { id: 'c1', text: 'Insult', effects: setFlag, dialogNode: { id: 'n1', speaker: 'Bob', text: 'Out', target: 'check' } },
        { id: 'c2', text: 'Greet', dialogNode: { id: 'n2', speaker: 'Bob', text: 'Hello', target: 'check' } },
      ] } } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it('a choice that stays on the beat still changes state', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c1', text: 'Search the desk', target: '__self__', effects: setFlag },
        { id: 'c2', text: 'Leave', target: 'check' },
      ] } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it('a choice hidden by its conditions is not taken', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c1', text: 'Use key', target: 'yes', conditions: [{ type: 'variable', variableName: 'hasKey', operator: '==', value: true }] },
        { id: 'c2', text: 'Walk away', target: 'no' },
      ] } },
      end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('an unmet requirement jumps to its fallback before the beat shows', () => {
    const s = story([
      { id: 'door', type: 'infoText', parameters: { text: 'The door opens' }, connections: [{ targetId: 'yes' }],
        requires: [{ condition: { type: 'variable', variableName: 'hasKey', operator: '==', value: true }, fallbackTarget: 'no' }] },
      end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('a Condition Check with more conditions matches all or any', () => {
    const beats = (match: 'all' | 'any') => [
      { id: 'set', type: 'setVariable', parameters: { name: 'a', value: true }, connections: [{ targetId: 'check' }] },
      check({ conditionType: 'variable', variableName: 'a', operator: '==', value: true },
        { moreConditions: [{ type: 'variable', variableName: 'b', operator: '==', value: true }], conditionsMatch: match }),
      end('yes'), end('no'),
    ];
    expect(endings(story(beats('all')))).toEqual(['no']);
    expect(endings(story(beats('any')))).toEqual(['yes']);
  });

  it('counts items: two coins less one is still a coin; quantity checks compare amounts', () => {
    const inv = (id: string, action: string, quantity: number, next: string) =>
      ({ id, type: 'addRemoveInventory', parameters: { action, item: 'coin', quantity }, connections: [{ targetId: next }] });
    expect(endings(story([inv('a', 'add', 2, 'r'), inv('r', 'remove', 1, 'check'),
      check({ conditionType: 'inventory', item: 'coin', checkType: 'has' }), end('yes'), end('no')]))).toEqual(['yes']);
    expect(endings(story([inv('a', 'add', 1, 'check'),
      check({ conditionType: 'inventory', item: 'coin', checkType: 'quantity', quantityCheck: true, quantityOperator: '>=', quantityValue: 3 }),
      end('yes'), end('no')]))).toEqual(['no']);
  });

  it('another character\'s items are not the player\'s', () => {
    const s = story([
      check({ conditionType: 'inventory', item: 'Lantern', checkType: 'has' }), end('yes'), end('no'),
    ], [{ id: 'shop', name: 'Shopkeeper', inventory: [{ name: 'Lantern' }] }]);
    expect(endings(s)).toEqual(['no']);
  });

  it('two characters\' counters of one name are kept apart', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [{ id: 'c', text: 'Talk', target: 'check', effects: [
        { type: 'incrementCounter', target: 'trust', value: 1, character: 'mara' },
        { type: 'incrementCounter', target: 'trust', value: 1, character: 'jonas' },
      ] }] } },
      check({ conditionType: 'counter', variableName: 'trust', operator: '>=', value: 2, character: 'mara' }),
      end('yes'), end('no'),
    ], [
      { id: 'mara', name: 'Mara', counters: [{ name: 'trust', value: 0 }] },
      { id: 'jonas', name: 'Jonas', counters: [{ name: 'trust', value: 0 }] },
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('a Set Timer\'s "time runs out" link is followed', () => {
    const s = story([
      // As the builder saves it: the timer link and the way on in connections.
      { id: 't', type: 'setTimer', parameters: { timerName: 'T', value: 30, timerTarget: 'late', continueTarget: 'yes' },
        connections: [{ targetId: 'late', label: 'Timer Target' }, { targetId: 'yes' }] },
      end('yes'), end('late'),
    ]);
    expect(endings(s)).toEqual(['late', 'yes']);
    expect(new ReachabilityAnalyzer(s).analyze().unreachableBeats).toEqual([]);
  });
});
