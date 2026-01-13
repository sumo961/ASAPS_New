/**
 * Tests for ConditionBeat - conditional branching logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConditionBeat } from '../../src/beats/ConditionBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer
function createMockRenderer(): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  };
}

describe('ConditionBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with counter condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test Condition',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'score',
        operator: '>=',
        value: 10,
        trueTarget: 'win',
        falseTarget: 'lose',
      });

      expect(beat.conditionType).toBe('counter');
      expect(beat.variableName).toBe('score');
      expect(beat.operator).toBe('>=');
      expect(beat.value).toBe(10);
      expect(beat.trueTarget).toBe('win');
      expect(beat.falseTarget).toBe('lose');
    });

    it('should support val as alternative to value', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test Condition',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'health',
        operator: '>',
        val: 0,
        trueTarget: 'alive',
        falseTarget: 'dead',
      });

      expect(beat.variableName).toBe('health');
      expect(beat.val).toBe(0);
      expect(beat.condition.variableName).toBe('health');
      expect(beat.condition.value).toBe(0);
    });

    it('should support inventory condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Has Key',
        type: 'conditionBeat',
        conditionType: 'inventory',
        item: 'golden_key',
        character: 'player',
        checkType: 'has',
        trueTarget: 'unlock_door',
        falseTarget: 'locked',
      });

      expect(beat.conditionType).toBe('inventory');
      expect(beat.item).toBe('golden_key');
      expect(beat.character).toBe('player');
      expect(beat.checkType).toBe('has');
    });

    it('should support timer condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Timer Check',
        type: 'conditionBeat',
        conditionType: 'timer',
        timer: 'bomb_timer',
        operator: '<=',
        value: 0,
        trueTarget: 'explode',
        falseTarget: 'continue',
      });

      expect(beat.conditionType).toBe('timer');
      expect(beat.timer).toBe('bomb_timer');
    });

    it('should support counterCompare condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Compare Counters',
        type: 'conditionBeat',
        conditionType: 'counterCompare',
        counter1: 'player_score',
        counter2: 'enemy_score',
        operator: '>',
        trueTarget: 'player_wins',
        falseTarget: 'enemy_wins',
      });

      expect(beat.conditionType).toBe('counterCompare');
      expect(beat.counter1).toBe('player_score');
      expect(beat.counter2).toBe('enemy_score');
    });

    it('should support visitedBeat condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Check Visited',
        type: 'conditionBeat',
        conditionType: 'visitedBeat',
        beatId: 'secret_room',
        trueTarget: 'knows_secret',
        falseTarget: 'doesnt_know',
      });

      expect(beat.conditionType).toBe('visitedBeat');
      expect(beat.beatId).toBe('secret_room');
    });

    it('should default to counter condition type', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Default Type',
        type: 'conditionBeat',
        variableName: 'test',
        trueTarget: 'next',
      });

      expect(beat.conditionType).toBe('counter');
    });

    it('should handle nested condition object from ASML parser', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'ASML Condition',
        type: 'conditionBeat',
        parameters: {
          condition: {
            type: 'counter',
            variableName: 'gold',
            operator: '>=',
            value: 100,
          },
          trueTarget: 'buy',
          falseTarget: 'poor',
        },
      });

      expect(beat.conditionType).toBe('counter');
      expect(beat.condition.variableName).toBe('gold');
    });

    it('should extract targets from trueConnection/falseConnection objects', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Connection Objects',
        type: 'conditionBeat',
        parameters: {
          conditionType: 'counter',
          variableName: 'test',
          trueConnection: { target: 'target_a' },
          falseConnection: { target: 'target_b' },
        },
      });

      expect(beat.trueTarget).toBe('target_a');
      expect(beat.falseTarget).toBe('target_b');
    });
  });

  describe('getParameters', () => {
    it('should return all condition parameters', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'score',
        operator: '==',
        value: 50,
        trueTarget: 'equal',
        falseTarget: 'not_equal',
      });

      const params = beat.getParameters();

      expect(params.conditionType).toBe('counter');
      expect(params.variableName).toBe('score');
      expect(params.operator).toBe('==');
      expect(params.value).toBe(50);
      expect(params.trueTarget).toBe('equal');
      expect(params.falseTarget).toBe('not_equal');
      expect(params.condition).toBeDefined();
    });
  });

  describe('updateParameters', () => {
    it('should update condition parameters', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'old_var',
        trueTarget: 'old_target',
      });

      beat.updateParameters({
        variableName: 'new_var',
        operator: '!=',
        value: 100,
        trueTarget: 'new_target',
      });

      expect(beat.variableName).toBe('new_var');
      expect(beat.operator).toBe('!=');
      expect(beat.value).toBe(100);
      expect(beat.trueTarget).toBe('new_target');
    });

    it('should rebuild condition after update', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'test',
        trueTarget: 'next',
      });

      beat.updateParameters({
        conditionType: 'inventory',
        item: 'key',
        character: 'hero',
      });

      expect(beat.condition.type).toBe('inventory');
      expect(beat.condition.item).toBe('key');
      expect(beat.condition.character).toBe('hero');
    });
  });

  describe('getConnections', () => {
    it('should return true and false target connections', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'test',
        trueTarget: 'target_true',
        falseTarget: 'target_false',
      });

      const connections = beat.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections).toContainEqual({ targetId: 'target_true', label: 'true' });
      expect(connections).toContainEqual({ targetId: 'target_false', label: 'false' });
    });

    it('should return only true target if no false target', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'test',
        trueTarget: 'target_true',
      });

      const connections = beat.getConnections();

      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual({ targetId: 'target_true', label: 'true' });
    });

    it('should return empty if no targets defined', () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'test',
        trueTarget: '',
      });

      const connections = beat.getConnections();

      expect(connections).toHaveLength(0);
    });
  });

  describe('performAction - counter conditions', () => {
    it('should return trueTarget when counter condition is true', async () => {
      context.setCounter('score', 100);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Score Check',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'score',
        operator: '>=',
        value: 50,
        trueTarget: 'high_score',
        falseTarget: 'low_score',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('high_score');
    });

    it('should return falseTarget when counter condition is false', async () => {
      context.setCounter('score', 25);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Score Check',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'score',
        operator: '>=',
        value: 50,
        trueTarget: 'high_score',
        falseTarget: 'low_score',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('low_score');
    });

    it('should handle equality operator', async () => {
      context.setCounter('lives', 3);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Lives Check',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'lives',
        operator: '==',
        value: 3,
        trueTarget: 'three_lives',
        falseTarget: 'other',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('three_lives');
    });

    it('should handle inequality operator', async () => {
      context.setCounter('health', 50);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Health Check',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'health',
        operator: '!=',
        value: 0,
        trueTarget: 'alive',
        falseTarget: 'dead',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('alive');
    });

    it('should handle less than operator', async () => {
      context.setCounter('fuel', 10);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Fuel Check',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'fuel',
        operator: '<',
        value: 20,
        trueTarget: 'low_fuel',
        falseTarget: 'enough_fuel',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('low_fuel');
    });
  });

  describe('performAction - variable conditions', () => {
    it('should check variable values', async () => {
      context.setVariable('difficulty', 'hard');

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Difficulty Check',
        type: 'conditionBeat',
        conditionType: 'variable',
        variableName: 'difficulty',
        operator: '==',
        value: 'hard',
        trueTarget: 'hard_mode',
        falseTarget: 'normal_mode',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('hard_mode');
    });
  });

  describe('performAction - inventory conditions', () => {
    it('should check if player has item', async () => {
      context.addInventoryItem('player', 'sword');

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Sword Check',
        type: 'conditionBeat',
        conditionType: 'inventory',
        item: 'sword',
        character: 'player',
        checkType: 'has',
        trueTarget: 'has_sword',
        falseTarget: 'no_sword',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('has_sword');
    });

    it('should return false when player lacks item', async () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Key Check',
        type: 'conditionBeat',
        conditionType: 'inventory',
        item: 'key',
        character: 'player',
        checkType: 'has',
        trueTarget: 'has_key',
        falseTarget: 'no_key',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('no_key');
    });
  });

  describe('performAction - visitedBeat conditions', () => {
    it('should check if beat was visited', async () => {
      context.markBeatVisited('secret_room');

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Visited Check',
        type: 'conditionBeat',
        conditionType: 'visitedBeat',
        beatId: 'secret_room',
        trueTarget: 'knows_secret',
        falseTarget: 'doesnt_know',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('knows_secret');
    });

    it('should return false for unvisited beat', async () => {
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Visited Check',
        type: 'conditionBeat',
        conditionType: 'visitedBeat',
        beatId: 'hidden_area',
        trueTarget: 'found_it',
        falseTarget: 'not_found',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('not_found');
    });
  });

  describe('performAction - edge cases', () => {
    it('should handle missing false target by returning next beat', async () => {
      context.setCounter('test', 0);

      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'No False Target',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'test',
        operator: '==',
        value: 100, // Will be false
        trueTarget: 'true_path',
        // No falseTarget
      });

      // Add a connection to simulate next beat
      beat.addConnection({ targetId: 'default_next' });

      const result = await beat.execute(context, renderer);

      // Should follow default connection when condition is false and no falseTarget
      expect(result).toBe('default_next');
    });

    it('should handle undefined counter as 0', async () => {
      // Don't set any counter
      const beat = new ConditionBeat({
        id: 'cond1',
        name: 'Undefined Counter',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'nonexistent',
        operator: '==',
        value: 0,
        trueTarget: 'is_zero',
        falseTarget: 'not_zero',
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('is_zero');
    });
  });

  describe('toJSON / fromConfig serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new ConditionBeat({
        id: 'cond1',
        name: 'Serialize Test',
        type: 'conditionBeat',
        conditionType: 'counter',
        variableName: 'gold',
        operator: '>=',
        value: 100,
        trueTarget: 'rich',
        falseTarget: 'poor',
      });

      const json = original.toJSON();
      const restored = new ConditionBeat(json);

      expect(restored.id).toBe(original.id);
      expect(restored.conditionType).toBe(original.conditionType);
      expect(restored.variableName).toBe(original.variableName);
      expect(restored.operator).toBe(original.operator);
      expect(restored.value).toBe(original.value);
      expect(restored.trueTarget).toBe(original.trueTarget);
      expect(restored.falseTarget).toBe(original.falseTarget);
    });
  });
});
