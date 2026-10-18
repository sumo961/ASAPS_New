import { describe, it, expect } from 'vitest';
import { analyzeStoryFindings, describeIgnoredParameters } from '../generationReview';

const clock = { id: 'clock', name: 'Set Clock 08:41', type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'set', timeYear: 2025, timeMonth: 11, timeDay: 18, timeHour: 8, timeMinute: 41 } };
const advance = { id: 'wait', name: 'Wait', type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'advance', value: 34, timeUnit: 'minutes' } };
const gate = (params: any) => ({ id: 'gate', name: 'Route: On Time?', type: 'conditionBeat', parameters: { conditionType: 'fictionalTime', trueTarget: 'on_time', falseTarget: 'late', ...params } });
const endings = [{ id: 'on_time', name: 'On time', type: 'endScreen', parameters: {} }, { id: 'late', name: 'Late', type: 'endScreen', parameters: {} }];
const timeGates = (story: any) => analyzeStoryFindings(story).filter((f) => f.kind === 'time-gate');

describe('time-gate findings', () => {
  it('flags the gate that lost its deadline (Stopped Under the City)', () => {
    // As saved after import: no time fields, so the beat compares against 2024-01-01 00:00.
    const found = timeGates({ beats: [clock, advance, gate({ operator: '<=' }), ...endings] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ beatId: 'gate', branch: 'true', targetId: 'on_time' });
    expect(found[0].message).toContain('2024-01-01 00:00');
    expect(found[0].message).toContain('2025-11-18 08:41');
  });

  it('is quiet for a gate with a real deadline, nested or flat', () => {
    const deadline = { year: 2025, month: 11, day: 18, hour: 9, minute: 18 };
    expect(timeGates({ beats: [clock, advance, gate({ operator: '<=', timeYear: 2025, timeMonth: 11, timeDay: 18, timeHour: 9, timeMinute: 18 }), ...endings] })).toEqual([]);
    expect(timeGates({ beats: [clock, gate({ condition: { type: 'fictionalTime', operator: '<=', compareTime: deadline } }), ...endings] })).toEqual([]);
  });

  it('flags an always-true gate, and uses the project start time', () => {
    const found = timeGates({
      globalSettings: { hudOverlays: { fictionalTime: { initialTime: { year: 1970, month: 5, day: 1, hour: 12, minute: 0 } } } },
      beats: [gate({ operator: '>', timeYear: 1969 }), ...endings],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ branch: 'false', targetId: 'late' });
  });

  it('says nothing when the clock can move backwards', () => {
    const rewind = { id: 'r', name: 'Rewind', type: 'setVariable', parameters: { type: 'fictionalTime', operation: 'advance', value: -60, timeUnit: 'minutes' } };
    expect(timeGates({ beats: [clock, rewind, gate({ operator: '<=' }), ...endings] })).toEqual([]);
  });
});

describe('describeIgnoredParameters', () => {
  it('names the beat and the setting the import dropped', () => {
    const story = {
      beats: [clock, gate({ operator: '<=' })],
      generationIssues: { warnings: ["beats[1]: Parameter 'compareTime' not defined in schema for beat type 'conditionBeat'", 'something else'] },
    };
    const lines = describeIgnoredParameters(story);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"Route: On Time?" (conditionBeat)');
    expect(lines[0]).toContain('"compareTime"');
  });
});
