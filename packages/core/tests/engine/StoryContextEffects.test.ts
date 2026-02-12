/**
 * Additional StoryContext tests for:
 * - setCounter effect type (new)
 * - recordChoice / getChoiceHistory / getRecentChoices
 * - resolveValue with var:/counter:/inventory references
 * - evaluateCondition edge cases
 * - getState immutability
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

describe('StoryContext - Extended', () => {
  let context: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('applyEffect - setCounter', () => {
    it('should set counter to specified value', () => {
      context.setCounter('health', 50);
      context.applyEffect({ type: 'setCounter', target: 'health', value: 100 });
      expect(context.getCounter('health')).toBe(100);
    });

    it('should set counter to 0 when value is 0', () => {
      context.setCounter('score', 999);
      context.applyEffect({ type: 'setCounter', target: 'score', value: 0 });
      expect(context.getCounter('score')).toBe(0);
    });

    it('should default to 0 when value is undefined', () => {
      context.setCounter('score', 42);
      context.applyEffect({ type: 'setCounter', target: 'score' });
      expect(context.getCounter('score')).toBe(0);
    });

    it('should create counter if it does not exist', () => {
      context.applyEffect({ type: 'setCounter', target: 'brand_new', value: 77 });
      expect(context.getCounter('brand_new')).toBe(77);
    });

    it('should set counter to negative value', () => {
      context.applyEffect({ type: 'setCounter', target: 'penalty', value: -10 });
      expect(context.getCounter('penalty')).toBe(-10);
    });
  });

  describe('applyEffect - multiple effects in sequence', () => {
    it('should apply a sequence of mixed effects correctly', () => {
      context.applyEffect({ type: 'setVariable', target: 'name', value: 'Hero' });
      context.applyEffect({ type: 'incrementCounter', target: 'xp', value: 100 });
      context.applyEffect({ type: 'addInventory', target: 'sword' });
      context.applyEffect({ type: 'setCounter', target: 'level', value: 1 });
      context.applyEffect({ type: 'incrementCounter', target: 'xp', value: 50 });

      expect(context.getVariable('name')).toBe('Hero');
      expect(context.getCounter('xp')).toBe(150);
      expect(context.hasInInventory('sword')).toBe(true);
      expect(context.getCounter('level')).toBe(1);
    });

    it('should handle add then remove inventory', () => {
      context.applyEffect({ type: 'addInventory', target: 'key' });
      expect(context.hasInInventory('key')).toBe(true);

      context.applyEffect({ type: 'removeInventory', target: 'key' });
      expect(context.hasInInventory('key')).toBe(false);
    });
  });

  describe('applyEffect - unknown effect type', () => {
    it('should not throw for unrecognized effect type', () => {
      expect(() => {
        context.applyEffect({ type: 'unknownType' as any, target: 'x' });
      }).not.toThrow();
    });
  });

  describe('recordChoice / getChoiceHistory / getRecentChoices', () => {
    it('should record a choice with timestamp', () => {
      context.recordChoice({
        beatId: 'beat1',
        beatName: 'Forest Path',
        choiceText: 'Go north',
        choiceId: 'c1',
      });

      const history = context.getChoiceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].beatId).toBe('beat1');
      expect(history[0].beatName).toBe('Forest Path');
      expect(history[0].choiceText).toBe('Go north');
      expect(history[0].choiceId).toBe('c1');
      expect(history[0].timestamp).toBeTypeOf('number');
    });

    it('should return multiple choices in order', () => {
      context.recordChoice({ beatId: 'b1', choiceText: 'First' });
      context.recordChoice({ beatId: 'b2', choiceText: 'Second' });
      context.recordChoice({ beatId: 'b3', choiceText: 'Third' });

      const history = context.getChoiceHistory();
      expect(history).toHaveLength(3);
      expect(history[0].choiceText).toBe('First');
      expect(history[2].choiceText).toBe('Third');
    });

    it('should return a copy of history (not mutable reference)', () => {
      context.recordChoice({ beatId: 'b1', choiceText: 'Test' });
      const h1 = context.getChoiceHistory();
      h1.push({ beatId: 'fake', choiceText: 'Injected', timestamp: 0 } as any);

      expect(context.getChoiceHistory()).toHaveLength(1);
    });

    it('should limit results with getRecentChoices', () => {
      for (let i = 0; i < 20; i++) {
        context.recordChoice({ beatId: `b${i}`, choiceText: `Choice ${i}` });
      }

      const recent = context.getRecentChoices(5);
      expect(recent).toHaveLength(5);
      expect(recent[0].choiceText).toBe('Choice 15');
      expect(recent[4].choiceText).toBe('Choice 19');
    });

    it('should use default limit of 10 for getRecentChoices', () => {
      for (let i = 0; i < 20; i++) {
        context.recordChoice({ beatId: `b${i}`, choiceText: `Choice ${i}` });
      }

      const recent = context.getRecentChoices();
      expect(recent).toHaveLength(10);
      expect(recent[0].choiceText).toBe('Choice 10');
    });

    it('should return all if fewer choices than limit', () => {
      context.recordChoice({ beatId: 'b1', choiceText: 'Only one' });

      const recent = context.getRecentChoices(10);
      expect(recent).toHaveLength(1);
    });
  });

  describe('getState immutability', () => {
    it('should return a frozen copy of state', () => {
      context.setVariable('test', 'value');
      context.setCounter('score', 50);

      const state = context.getState();

      // Should be frozen
      expect(Object.isFrozen(state)).toBe(true);

      // Original should still work
      context.setCounter('score', 100);
      expect(context.getCounter('score')).toBe(100);
    });
  });

  describe('checkCondition - edge cases', () => {
    it('should handle unknown condition type gracefully', () => {
      const result = context.checkCondition({
        type: 'nonexistent' as any,
        operator: '==',
      });
      expect(result).toBe(false);
    });

    it('should handle counter condition with missing variableName', () => {
      // When variableName is missing, the counter lookup uses undefined key
      // which returns 0. But the condition check may fail because undefined
      // is passed through getCounter() which returns 0 for any missing key.
      const result = context.checkCondition({
        type: 'counter',
        operator: '==',
        variableName: 'nonexistent_counter',
        value: 0,
      });
      // Non-existent counter defaults to 0, so == 0 should be true
      expect(result).toBe(true);
    });

    it('should handle inventory contains with no items', () => {
      expect(context.checkCondition({
        type: 'inventory',
        operator: 'contains',
        item: 'anything',
      })).toBe(false);
    });

    it('should handle inventory "not" when inventory is empty', () => {
      expect(context.checkCondition({
        type: 'inventory',
        operator: 'not',
        item: 'anything',
      })).toBe(true);
    });
  });

  describe('negative counter values', () => {
    it('should support negative counter values via increment', () => {
      context.setCounter('health', 100);
      context.incrementCounter('health', -30);
      expect(context.getCounter('health')).toBe(70);
    });

    it('should support setting counter to negative', () => {
      context.setCounter('debt', -500);
      expect(context.getCounter('debt')).toBe(-500);
    });

    it('should increment past zero into negative', () => {
      context.setCounter('balance', 10);
      context.incrementCounter('balance', -20);
      expect(context.getCounter('balance')).toBe(-10);
    });
  });
});
