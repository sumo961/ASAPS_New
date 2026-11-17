/**
 * storyDataUsage: which beats set, test and show each variable and counter.
 */
import { describe, it, expect } from 'vitest';
import { storyDataUsage } from '../../src/analysis/storyDataUsage';

const beat = (id: string, type: string, parameters: any = {}, extra: any = {}) => ({ id, type, parameters, ...extra });
const find = (uses: ReturnType<typeof storyDataUsage>, kind: string, name: string, character?: string) =>
  uses.find((u) => u.kind === kind && u.name === name && u.character === character);

describe('storyDataUsage', () => {
  it('finds a Set Variable beat, a choice effect and an Input Text as setters', () => {
    const uses = storyDataUsage([
      beat('a', 'setVariable', { name: 'hasKey', type: 'variable', value: true }),
      beat('b', 'multiChoice', { choices: [{ text: 'Take it', effects: [{ type: 'setVariable', target: 'hasKey', value: true }] }] }),
      beat('c', 'inputText', { variable: 'playerName' }),
    ]);
    expect(find(uses, 'variable', 'hasKey')?.sets).toEqual(['a', 'b']);
    expect(find(uses, 'variable', 'playerName')?.sets).toEqual(['c']);
  });

  it('finds tests in condition beats, link conditions and requirements', () => {
    const uses = storyDataUsage([
      beat('a', 'conditionBeat', { condition: { type: 'variable', variable: 'hasKey', operator: '==', value: true } }),
      beat('b', 'infoText', {}, { connections: [{ targetId: 'c', condition: { type: 'counter', variableName: 'score', operator: '>', value: 3 } }] }),
      beat('c', 'infoText', {}, { requires: [{ type: 'variable', left: 'hasKey', operator: '==', right: true }] }),
    ]);
    expect(find(uses, 'variable', 'hasKey')?.tests).toEqual(['a', 'c']);
    expect(find(uses, 'counter', 'score')?.tests).toEqual(['b']);
  });

  it('keeps a character’s counter apart from the story’s own of the same name', () => {
    const uses = storyDataUsage([
      beat('a', 'multiChoice', { choices: [{ effects: [
        { type: 'incrementCounter', target: 'trust', value: 1, character: 'mara' },
        { type: 'incrementCounter', target: 'trust', value: 1 },
      ] }] }),
    ]);
    expect(find(uses, 'counter', 'trust', 'mara')?.sets).toEqual(['a']);
    expect(find(uses, 'counter', 'trust')?.sets).toEqual(['a']);
  });

  it('reads both sides of a counter comparison', () => {
    const uses = storyDataUsage([beat('a', 'conditionBeat', { condition: { type: 'counterCompare', counter1: 'trust', counter2: 'fear' } })]);
    expect(find(uses, 'counter', 'trust')?.tests).toEqual(['a']);
    expect(find(uses, 'counter', 'fear')?.tests).toEqual(['a']);
  });

  it('lists ${name} in text as shown, with the counter of that name when there is no such variable', () => {
    const uses = storyDataUsage([
      beat('a', 'setVariable', { name: 'score', type: 'counter', value: 1 }),
      beat('b', 'infoText', { text: 'You have ${score} points, ${playerName}.' }),
    ]);
    expect(find(uses, 'counter', 'score')?.shows).toEqual(['b']);
    expect(find(uses, 'variable', 'playerName')?.shows).toEqual(['b']);
  });

  it('says a meter shows its counter rather than sets it', () => {
    const uses = storyDataUsage([beat('a', 'freeLayout', { elements: [{ kind: 'meter', counter: 'trust' }] })]);
    expect(find(uses, 'counter', 'trust')).toMatchObject({ sets: [], displays: ['a'] });
  });

  it('counts a choice’s own counter fields as a change', () => {
    const uses = storyDataUsage([beat('a', 'multiChoice', { choices: [{ text: 'Help', counter: 'trust', counterValue: 2 }] })]);
    expect(find(uses, 'counter', 'trust')?.sets).toEqual(['a']);
  });
});
