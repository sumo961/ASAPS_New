/**
 * A fictional-time gate written with compareTime (nested in condition or
 * flat) must keep its time: it used to fall back to 2024-01-01 00:00.
 */
import { describe, it, expect, vi } from 'vitest';
import { ConditionBeat } from '../../src/beats/ConditionBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

const renderer = { setState: vi.fn(), getState: vi.fn(), clear: vi.fn() } as unknown as IRenderer;
const time = { year: 2025, month: 11, day: 18, hour: 9, minute: 18 };

function contextAt(hour: number, minute: number) {
  const ctx = new StoryContext();
  ctx.setFictionalTime({ year: 2025, month: 11, day: 18, hour, minute, second: 0 } as any);
  return ctx;
}

describe('ConditionBeat compareTime', () => {
  for (const [label, params] of [
    ['nested', { condition: { type: 'fictionalTime', operator: '<=', compareTime: time }, trueTarget: 'on_time', falseTarget: 'late' }],
    ['flat', { conditionType: 'fictionalTime', operator: '<=', compareTime: time, trueTarget: 'on_time', falseTarget: 'late' }],
  ] as const) {
    it(`reads the ${label} compareTime`, async () => {
      const beat = new ConditionBeat({ id: 'gate', name: 'On time?', type: 'conditionBeat', parameters: params as any });
      expect(beat.getParameters()).toMatchObject({ timeYear: 2025, timeMonth: 11, timeDay: 18, timeHour: 9, timeMinute: 18 });
      expect(await beat.execute(contextAt(9, 0), renderer)).toBe('on_time');
      expect(await beat.execute(contextAt(9, 40), renderer)).toBe('late');
    });
  }

  it('explicit time fields win over compareTime', () => {
    const beat = new ConditionBeat({ id: 'gate', name: 'g', type: 'conditionBeat', parameters: { conditionType: 'fictionalTime', operator: '<=', compareTime: time, timeHour: 10, trueTarget: 'a', falseTarget: 'b' } as any });
    expect(beat.getParameters()).toMatchObject({ timeHour: 10, timeMinute: 18 });
  });
});
