/**
 * Condition Check with several conditions (moreConditions + conditionsMatch)
 * and the inventory "Does Not Have Item" check (checkType notHas).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConditionBeat } from '../../src/beats/ConditionBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

const renderer = { setState: vi.fn(), getState: vi.fn().mockReturnValue(null) } as unknown as IRenderer;

function check(params: Record<string, unknown>) {
  return new ConditionBeat({
    id: 'cond1',
    name: 'Check',
    type: 'conditionBeat',
    conditionType: 'counter',
    variableName: 'trust',
    operator: '>=',
    value: 3,
    trueTarget: 'yes',
    falseTarget: 'no',
    ...params,
  } as any);
}

const hasKey = { type: 'inventory', item: 'key', operator: 'contains' };

describe('ConditionBeat — several conditions', () => {
  let context: StoryContext;
  beforeEach(() => { context = new StoryContext(); });

  it('AND (default) needs every condition', async () => {
    context.setCounter('trust', 5);
    expect(await check({ moreConditions: [hasKey] }).execute(context, renderer)).toBe('no');
    context.addToInventory('key');
    expect(await check({ moreConditions: [hasKey] }).execute(context, renderer)).toBe('yes');
  });

  it('OR needs at least one condition', async () => {
    const beat = check({ moreConditions: [hasKey], conditionsMatch: 'any' });
    expect(await beat.execute(context, renderer)).toBe('no');
    context.addToInventory('key');
    expect(await beat.execute(context, renderer)).toBe('yes');
  });

  it('reads the generator shape (variable alias, nested condition)', async () => {
    context.setVariable('metBefore', true);
    const beat = new ConditionBeat({
      id: 'c', name: 'c', type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', variable: 'trust', operator: '>=', value: 3 },
        moreConditions: [{ type: 'variable', variable: 'metBefore', operator: '==', value: true }],
        conditionsMatch: 'any',
        trueConnection: { target: 'yes' },
        falseConnection: { target: 'no' },
      },
    } as any);
    expect(await beat.execute(context, renderer)).toBe('yes');
  });

  it('keeps the list through getParameters and clears it with an empty list', () => {
    const beat = check({ moreConditions: [hasKey], conditionsMatch: 'any' });
    expect(beat.getParameters()).toMatchObject({ moreConditions: [hasKey], conditionsMatch: 'any' });
    expect(beat.getAllConditions()).toHaveLength(2);
    beat.updateParameters({ moreConditions: [] });
    expect(beat.getParameters()).not.toHaveProperty('moreConditions');
    expect(beat.getAllConditions()).toHaveLength(1);
  });

  it('ignores entries that are not conditions', () => {
    expect(check({ moreConditions: [null, 'x', { item: 'key' }, hasKey] }).getAllConditions()).toHaveLength(2);
  });
});

describe('inventory "Does Not Have Item" (checkType notHas)', () => {
  let context: StoryContext;
  beforeEach(() => { context = new StoryContext(); });

  const lacksKey = () => new ConditionBeat({
    id: 'c', name: 'c', type: 'conditionBeat',
    conditionType: 'inventory', item: 'key', checkType: 'notHas',
    trueTarget: 'yes', falseTarget: 'no',
  } as any);

  it('is true while the item is missing', async () => {
    expect(await lacksKey().execute(context, renderer)).toBe('yes');
  });

  it('is false once the item is held', async () => {
    context.addToInventory('key');
    expect(await lacksKey().execute(context, renderer)).toBe('no');
  });

  it('works as a choice condition too', () => {
    expect(context.checkCondition({ type: 'inventory', item: 'key', checkType: 'notHas', operator: '==' } as any)).toBe(true);
  });

  it('checkType quantity compares quantities without quantityCheck', () => {
    context.addToInventory('coin', 3);
    expect(context.checkCondition({ type: 'inventory', item: 'coin', checkType: 'quantity', quantityOperator: '>=', quantityValue: 3 } as any)).toBe(true);
    expect(context.checkCondition({ type: 'inventory', item: 'coin', checkType: 'quantity', quantityOperator: '>=', quantityValue: 4 } as any)).toBe(false);
  });
});
