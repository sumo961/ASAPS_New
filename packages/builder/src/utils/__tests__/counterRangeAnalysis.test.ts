import { describe, it, expect } from 'vitest';
import { analyzeCounterRanges, readCounterCondition, conditionCanBeTrue, conditionCanBeFalse } from '../counterRangeAnalysis';

describe('analyzeCounterRanges', () => {
  it('sees setVariable counters, legacy flat choice fields AND canonical effects[]', () => {
    const beats = [
      { id: 'a', type: 'setVariable', parameters: { type: 'counter', name: 'trust', operation: 'add', value: 2 } },
      { id: 'b', type: 'multiChoice', parameters: { choices: [
        { text: 'kind', effects: [{ type: 'incrementCounter', target: 'trust', value: 3 }] },
        { text: 'rude', effects: [{ type: 'incrementCounter', target: 'trust', value: -1 }] },
      ] } },
      { id: 'c', type: 'pickProp', parameters: { props: [{ name: 'key', counter: 'clues', counterValue: 1 }] } },
      { id: 'd', type: 'dialogTree', parameters: { dialogTree: { choices: [{ text: 'x', dialogNode: { choices: [{ text: 'y', effects: [{ type: 'incrementCounter', target: 'trust' }] }] } }] } } },
    ];
    const r = analyzeCounterRanges(beats);
    expect(r.get('trust')).toEqual({ min: -1, max: 6, modified: true });
    expect(r.get('clues')).toEqual({ min: 0, max: 1, modified: true });
  });
  it('seeds from story-level variable declarations and marks untouched counters unmodified', () => {
    const r = analyzeCounterRanges([], [{ name: 'trust', type: 'counter', initialValue: 5 }]);
    expect(r.get('trust')).toEqual({ min: 5, max: 5, modified: false });
  });
});

describe('readCounterCondition', () => {
  it('reads the flattened (post-pipeline) shape — the old validators skipped it', () => {
    const c = readCounterCondition({ type: 'conditionBeat', parameters: { conditionType: 'counter', variableName: 'trust', operator: '>=', value: 3, trueTarget: 't', falseTarget: 'f' } });
    expect(c).toMatchObject({ counterName: 'trust', operator: '>=', value: 3, trueTarget: 't', falseTarget: 'f', nested: false });
  });
  it('reads the nested shape', () => {
    const c = readCounterCondition({ type: 'conditionBeat', parameters: { condition: { type: 'counter', variable: 'trust', operator: '>', value: 2 }, trueConnection: { target: 't' } } });
    expect(c).toMatchObject({ counterName: 'trust', operator: '>', value: 2, trueTarget: 't', nested: true });
  });
  it('ignores non-counter conditions', () => {
    expect(readCounterCondition({ type: 'conditionBeat', parameters: { conditionType: 'inventory', item: 'key' } })).toBeNull();
  });
});

describe('satisfiability', () => {
  const r = { min: 0, max: 4, modified: true };
  it('true branch', () => {
    expect(conditionCanBeTrue(r, '>=', 5)).toBe(false);
    expect(conditionCanBeTrue(r, '>=', 4)).toBe(true);
    expect(conditionCanBeTrue(r, '==', 7)).toBe(false);
    expect(conditionCanBeTrue(r, '<', 0)).toBe(false);
  });
  it('false branch', () => {
    expect(conditionCanBeFalse(r, '>=', 0)).toBe(false); // always true
    expect(conditionCanBeFalse(r, '>=', 1)).toBe(true);
    expect(conditionCanBeFalse(r, '<=', 4)).toBe(false);
  });
});
