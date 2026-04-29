/**
 * Step 8 — Phase A: goal status tracking, satisfaction-predicate auto-flip,
 * GAMYGDALA-style emotion firing on transitions, condition + effect plumbing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

const knight = {
  id: 'char_1',
  name: 'Knight',
  goals: [
    { id: 'find-grail', name: 'Find the Grail', priority: 0.8 },
    {
      id: 'reach-castle',
      name: 'Reach the castle',
      priority: 0.5,
      satisfaction: { type: 'counter', operator: '>=', variableName: 'distance', value: 100 },
    },
  ],
};

const peasant = { id: 'char_2', name: 'Peasant', goals: [] };

describe('Goal status — basic CRUD', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight, peasant]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults every goal's status to 'open'", () => {
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('open');
    expect(ctx.getGoalStatus('char_1', 'reach-castle')).toBe('open');
  });

  it('returns open for goals it has never heard of', () => {
    expect(ctx.getGoalStatus('char_1', 'unknown')).toBe('open');
  });

  it('setGoalStatus updates and reports the previous value', () => {
    const prev = ctx.setGoalStatus('char_1', 'find-grail', 'met');
    expect(prev).toBe('open');
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('met');
  });

  it('setGoalStatus returns the same value for a no-op transition', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met');
    const prev = ctx.setGoalStatus('char_1', 'find-grail', 'met');
    expect(prev).toBe('met');
  });

  it('emits characterGoalStatusChanged on real transitions only', () => {
    const handler = vi.fn();
    ctx.on('characterGoalStatusChanged', handler);
    ctx.setGoalStatus('char_1', 'find-grail', 'met');
    ctx.setGoalStatus('char_1', 'find-grail', 'met');  // no-op
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns null for unresolvable character refs', () => {
    expect(ctx.setGoalStatus('', 'find-grail', 'met')).toBeNull();
  });

  it('getCharacterGoalStatuses returns a defensive copy', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met');
    const copy = ctx.getCharacterGoalStatuses('char_1');
    copy['find-grail'] = 'failed';
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('met');
  });
});

describe('GAMYGDALA-style emotion firing on goal status changes', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fires pride and joy when a goal is met (scaled by priority)', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met');
    // priority 0.8 → pride = 0.7 * 0.8 = 0.56, joy = 0.4 * 0.8 = 0.32
    expect(ctx.getCharacterEmotion('char_1', 'pride')).toBeCloseTo(0.56);
    expect(ctx.getCharacterEmotion('char_1', 'joy')).toBeCloseTo(0.32);
  });

  it('fires shame and sadness when a goal fails', () => {
    ctx.setGoalStatus('char_1', 'reach-castle', 'failed');
    // priority 0.5 → shame = 0.6 * 0.5 = 0.30, sadness = 0.4 * 0.5 = 0.20
    expect(ctx.getCharacterEmotion('char_1', 'shame')).toBeCloseTo(0.30);
    expect(ctx.getCharacterEmotion('char_1', 'sadness')).toBeCloseTo(0.20);
  });

  it('does not fire emotions on abandonment (intentionally quiet)', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'abandoned');
    expect(ctx.getCharacterEmotion('char_1', 'pride')).toBe(0);
    expect(ctx.getCharacterEmotion('char_1', 'shame')).toBe(0);
    expect(ctx.getCharacterEmotion('char_1', 'sadness')).toBe(0);
  });

  it('suppressEmotion option skips the auto-firings', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met', { suppressEmotion: true });
    expect(ctx.getCharacterEmotion('char_1', 'pride')).toBe(0);
    expect(ctx.getCharacterEmotion('char_1', 'joy')).toBe(0);
  });

  it('uses default priority 0.5 when authored goal has no priority', () => {
    const generic = {
      id: 'g1', name: 'Generic',
      goals: [{ id: 'plain', name: 'do something' }],  // no priority
    };
    const story2 = new Story();
    story2.setCharacters([generic]);
    const ctx2 = new StoryContext(undefined, story2);
    ctx2.setGoalStatus('g1', 'plain', 'met');
    // pride = 0.7 * 0.5 = 0.35
    expect(ctx2.getCharacterEmotion('g1', 'pride')).toBeCloseTo(0.35);
  });
});

describe('Goal satisfaction predicate auto-evaluation', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does not flip 'reach-castle' until the predicate becomes true", () => {
    ctx.setCounter('distance', 50);
    expect(ctx.evaluateCharacterGoals('char_1')).toBe(0);
    expect(ctx.getGoalStatus('char_1', 'reach-castle')).toBe('open');
  });

  it('flips an open goal to met when the predicate satisfies', () => {
    ctx.setCounter('distance', 100);
    expect(ctx.evaluateCharacterGoals('char_1')).toBe(1);
    expect(ctx.getGoalStatus('char_1', 'reach-castle')).toBe('met');
  });

  it('skips terminal-status goals on subsequent evaluations', () => {
    ctx.setGoalStatus('char_1', 'reach-castle', 'failed', { suppressEmotion: true });
    ctx.setCounter('distance', 100);  // would otherwise satisfy
    expect(ctx.evaluateCharacterGoals('char_1')).toBe(0);
    expect(ctx.getGoalStatus('char_1', 'reach-castle')).toBe('failed');
  });

  it('markBeatVisited triggers the per-beat goal evaluation tick', () => {
    ctx.setCounter('distance', 200);
    ctx.markBeatVisited('beat_1');
    expect(ctx.getGoalStatus('char_1', 'reach-castle')).toBe('met');
  });

  it('evaluateAllCharacterGoals walks every character with goals', () => {
    ctx.setCounter('distance', 100);
    expect(ctx.evaluateAllCharacterGoals()).toBe(1);
  });
});

describe('Goal condition operator', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns true when status matches', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met', { suppressEmotion: true });
    const cond: any = { type: 'goal', operator: '==', character: 'char_1', goalId: 'find-grail', goalStatus: 'met' };
    expect(ctx.checkCondition(cond)).toBe(true);
  });

  it('returns false when status does not match', () => {
    const cond: any = { type: 'goal', operator: '==', character: 'char_1', goalId: 'find-grail', goalStatus: 'met' };
    expect(ctx.checkCondition(cond)).toBe(false);
  });

  it("supports != operator", () => {
    const cond: any = { type: 'goal', operator: '!=', character: 'char_1', goalId: 'find-grail', goalStatus: 'met' };
    expect(ctx.checkCondition(cond)).toBe(true);
  });

  it("falls back to value when goalStatus is omitted", () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'failed', { suppressEmotion: true });
    const cond: any = { type: 'goal', operator: '==', character: 'char_1', goalId: 'find-grail', value: 'failed' };
    expect(ctx.checkCondition(cond)).toBe(true);
  });

  it('warns and returns false when character or goalId missing', () => {
    expect(ctx.checkCondition({ type: 'goal', operator: '==' } as any)).toBe(false);
  });
});

describe('setGoalStatus effect dispatch', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies and fires emotions like the API call', () => {
    ctx.applyEffect({
      type: 'setGoalStatus', target: 'char_1',
      goalId: 'find-grail', goalStatus: 'met',
    } as any);
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('met');
    expect(ctx.getCharacterEmotion('char_1', 'pride')).toBeCloseTo(0.56);
  });

  it('respects suppressEmotion on the effect', () => {
    ctx.applyEffect({
      type: 'setGoalStatus', target: 'char_1',
      goalId: 'find-grail', goalStatus: 'met', suppressEmotion: true,
    } as any);
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('met');
    expect(ctx.getCharacterEmotion('char_1', 'pride')).toBe(0);
  });

  it('skips when goalId or goalStatus is missing', () => {
    ctx.applyEffect({ type: 'setGoalStatus', target: 'char_1' } as any);
    ctx.applyEffect({ type: 'setGoalStatus', target: 'char_1', goalId: 'find-grail' } as any);
    expect(ctx.getGoalStatus('char_1', 'find-grail')).toBe('open');
  });
});

describe('Goal serialization round-trip', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([knight]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips status losslessly', () => {
    ctx.setGoalStatus('char_1', 'find-grail', 'met', { suppressEmotion: true });
    const blob = ctx.serialize();
    expect(blob.characterGoalStatus!.char_1['find-grail']).toBe('met');

    const ctx2 = new StoryContext(undefined, story);
    ctx2.loadFromSerialized(blob);
    expect(ctx2.getGoalStatus('char_1', 'find-grail')).toBe('met');
  });

  it('forward-compat with saves missing the field', () => {
    const blob = ctx.serialize();
    delete (blob as any).characterGoalStatus;
    const ctx2 = new StoryContext(undefined, story);
    expect(() => ctx2.loadFromSerialized(blob)).not.toThrow();
    expect(ctx2.getGoalStatus('char_1', 'find-grail')).toBe('open');
  });
});
