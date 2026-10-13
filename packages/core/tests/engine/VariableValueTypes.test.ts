/**
 * Variables typed in Project Settings keep their type when authoring
 * surfaces write text, and variable conditions compare "false" with false
 * and "5" with 5 (a boolean default false never matched a condition value
 * typed as "false"; an effect wrote "true" as text).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';
import { alignForComparison, coerceToDeclaredType } from '../../src/engine/variableValues';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function context(variables: any[]) {
  const story = new Story();
  story.setSettings({ variables });
  return new StoryContext(undefined, story);
}

const is = (ctx: StoryContext, name: string, value: unknown, operator = '==') =>
  ctx.checkCondition({ type: 'variable', variableName: name, operator, value } as any);

describe('boolean variables', () => {
  it('a default false matches a condition value typed as "false"', () => {
    const ctx = context([{ name: 'wokeHim', type: 'boolean', defaultValue: false }]);
    expect(is(ctx, 'wokeHim', 'false')).toBe(true);
    expect(is(ctx, 'wokeHim', 'true')).toBe(false);
    expect(is(ctx, 'wokeHim', 'true', '!=')).toBe(true);
  });

  it('an effect writing "true" stores a boolean', () => {
    const ctx = context([{ name: 'wokeHim', type: 'boolean', defaultValue: false }]);
    ctx.applyEffect({ type: 'setVariable', target: 'wokeHim', value: 'true' });
    expect(ctx.getVariable('wokeHim')).toBe(true);
    expect(is(ctx, 'wokeHim', true)).toBe(true);
    expect(is(ctx, 'wokeHim', 'true')).toBe(true);
    expect(is(ctx, 'wokeHim', ' True ')).toBe(true);
  });

  it('a default saved as text "true" is seeded as a boolean', () => {
    const ctx = context([{ name: 'lit', type: 'boolean', defaultValue: 'true' }]);
    expect(ctx.getVariable('lit')).toBe(true);
  });
});

describe('number and text variables', () => {
  it('a number variable written as "5" is a number and compares numerically', () => {
    const ctx = context([{ name: 'gold', type: 'number', defaultValue: 0 }]);
    ctx.setVariable('gold', '5');
    expect(ctx.getVariable('gold')).toBe(5);
    expect(is(ctx, 'gold', '5')).toBe(true);
    expect(is(ctx, 'gold', '10', '<')).toBe(true);
  });

  it('a string variable keeps "true" as text', () => {
    const ctx = context([{ name: 'answer', type: 'string', defaultValue: '' }]);
    ctx.setVariable('answer', 'true');
    expect(ctx.getVariable('answer')).toBe('true');
    expect(is(ctx, 'answer', 'true')).toBe(true);
  });

  it('an undeclared variable keeps what was written, but still compares with a boolean', () => {
    const ctx = context([]);
    ctx.setVariable('flag', 'false');
    expect(ctx.getVariable('flag')).toBe('false');
    expect(is(ctx, 'flag', false)).toBe(true);
  });
});

describe('helpers', () => {
  it('keeps text that does not read as the declared type', () => {
    expect(coerceToDeclaredType('yes', 'boolean')).toBe('yes');
    expect(coerceToDeclaredType('', 'boolean')).toBe(false);
    expect(coerceToDeclaredType('', 'number')).toBe('');
    expect(coerceToDeclaredType('7', undefined)).toBe('7');
  });

  it('aligns only matching kinds', () => {
    expect(alignForComparison(false, 'false')).toEqual([false, false]);
    expect(alignForComparison('3', 3)).toEqual([3, 3]);
    expect(alignForComparison(3, 'three')).toEqual([3, 'three']);
    expect(alignForComparison('a', 'b')).toEqual(['a', 'b']);
  });
});

describe('Condition beat operators for variables', () => {
  it('exists / notExists', () => {
    const ctx = context([{ name: 'answer', type: 'string', defaultValue: '' }]);
    expect(is(ctx, 'answer', undefined, 'exists')).toBe(false);
    expect(is(ctx, 'answer', undefined, 'notExists')).toBe(true);
    ctx.setVariable('answer', 'Eymund');
    expect(is(ctx, 'answer', undefined, 'exists')).toBe(true);
    expect(is(ctx, 'answer', undefined, 'notExists')).toBe(false);
  });

  it('contains on text', () => {
    const ctx = context([]);
    ctx.setVariable('answer', 'Wake Eymund up');
    expect(is(ctx, 'answer', 'eymund', 'contains')).toBe(true);
    expect(is(ctx, 'answer', 'leave', 'contains')).toBe(false);
  });
});

describe('preconditions (beat requirements) use the same comparison', () => {
  it('a requirement on a boolean variable typed as "false" passes at the start', async () => {
    const { Story } = await import('../../src/engine/Story');
    const story = new Story();
    story.setSettings({ variables: [{ name: 'wokeHim', type: 'boolean', defaultValue: false }] });
    const ctx = new StoryContext(undefined, story);
    const req = { condition: { type: 'variable', variableName: 'wokeHim', operator: '==', value: 'false' } };
    expect(ctx.checkCondition(req.condition as any)).toBe(true);
  });
});
