import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetVariableBeat } from '../../src/beats/SetVariableBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer factory matching ConditionBeat tests
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
  } as unknown as IRenderer;
}

describe('SetVariableBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create beat with default parameters', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Variable',
        type: 'setVariable',
      });

      const params = beat.getParameters();
      expect(params.type).toBe('variable');
      expect(params.name).toBe('');
      expect(params.value).toBe('');
      expect(params.operation).toBe('set');
    });

    it('should create beat with parameters object', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Counter',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 100,
          operation: 'set',
        },
      });

      const params = beat.getParameters();
      expect(params.type).toBe('counter');
      expect(params.name).toBe('score');
      expect(params.value).toBe(100);
      expect(params.operation).toBe('set');
    });

    it('should support legacy variable parameter', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Legacy Set',
        type: 'setVariable',
        variable: 'oldStyle',
        value: 'legacy value',
      });

      const params = beat.getParameters();
      expect(params.name).toBe('oldStyle');
      expect(params.value).toBe('legacy value');
    });

    it('should support variableName parameter (AI variation)', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'AI Set',
        type: 'setVariable',
        parameters: {
          variableName: 'aiGenerated',
          value: 'ai value',
        },
      });

      const params = beat.getParameters();
      expect(params.name).toBe('aiGenerated');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'health',
          value: 50,
          operation: 'add',
        },
      });

      const params = beat.getParameters();
      expect(params).toEqual({
        type: 'counter',
        name: 'health',
        value: 50,
        operation: 'add',
      });
    });
  });

  describe('updateParameters', () => {
    it('should update type parameter', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
      });

      beat.updateParameters({ type: 'counter' });
      expect(beat.getParameters().type).toBe('counter');
    });

    it('should update name parameter', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
      });

      beat.updateParameters({ name: 'newName' });
      expect(beat.getParameters().name).toBe('newName');
    });

    it('should update via variable parameter (legacy)', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
      });

      beat.updateParameters({ variable: 'legacyName' });
      expect(beat.getParameters().name).toBe('legacyName');
    });

    it('should update via variableName parameter (AI variation)', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
      });

      beat.updateParameters({ variableName: 'aiName' });
      expect(beat.getParameters().name).toBe('aiName');
    });

    it('should update value and operation', () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Test',
        type: 'setVariable',
      });

      beat.updateParameters({ value: 200, operation: 'multiply' });
      const params = beat.getParameters();
      expect(params.value).toBe(200);
      expect(params.operation).toBe('multiply');
    });
  });

  describe('performAction - counter operations', () => {
    it('should set counter to specific value', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Score',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 100,
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('score')).toBe(100);
    });

    it('should add to counter value', async () => {
      context.setCounter('score', 50);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Add Score',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 25,
          operation: 'add',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('score')).toBe(75);
    });

    it('should handle "change" operation as add (legacy)', async () => {
      context.setCounter('score', 50);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Change Score',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 30,
          operation: 'change',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('score')).toBe(80);
    });

    it('should subtract from counter value', async () => {
      context.setCounter('health', 100);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Damage',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'health',
          value: 25,
          operation: 'subtract',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('health')).toBe(75);
    });

    it('should multiply counter value', async () => {
      context.setCounter('damage', 10);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Critical Hit',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'damage',
          value: 2,
          operation: 'multiply',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('damage')).toBe(20);
    });

    it('should divide counter value', async () => {
      context.setCounter('items', 100);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Split Items',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'items',
          value: 4,
          operation: 'divide',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('items')).toBe(25);
    });

    it('should prevent division by zero', async () => {
      context.setCounter('items', 100);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Divide by Zero',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'items',
          value: 0,
          operation: 'divide',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      // Should keep original value
      expect(context.getCounter('items')).toBe(100);
    });

    it('should handle counter starting at 0', async () => {
      // Counter not set, defaults to 0
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Add to Zero',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'newCounter',
          value: 50,
          operation: 'add',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('newCounter')).toBe(50);
    });

    it('should handle negative values', async () => {
      context.setCounter('temperature', 20);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Cold Spell',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'temperature',
          value: -30,
          operation: 'add',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('temperature')).toBe(-10);
    });

    it('should handle decimal values', async () => {
      context.setCounter('price', 100);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Discount',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'price',
          value: 0.8,
          operation: 'multiply',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('price')).toBe(80);
    });
  });

  describe('performAction - variable operations', () => {
    it('should set variable to string value', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Name',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'playerName',
          value: 'Hero',
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getVariable('playerName')).toBe('Hero');
    });

    it('should set variable to boolean value', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Flag',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'hasKey',
          value: true,
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getVariable('hasKey')).toBe(true);
    });

    it('should set variable to object value', async () => {
      const complexValue = { x: 10, y: 20 };

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Position',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'position',
          value: complexValue,
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getVariable('position')).toEqual({ x: 10, y: 20 });
    });

    it('should overwrite existing variable', async () => {
      context.setVariable('status', 'idle');

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Update Status',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'status',
          value: 'active',
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getVariable('status')).toBe('active');
    });
  });

  describe('performAction - error handling', () => {
    it('should log error and proceed when variable name is missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'No Name',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: '', // Empty name
          value: 100,
          operation: 'set',
        },
        connections: [{ targetId: 'next' }],
      });

      const result = await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SetVariableBeat sv1 has no variable/counter name specified')
      );
      expect(result).toBe('next');

      consoleSpy.mockRestore();
    });

    it('should handle invalid number values gracefully', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Invalid Number',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'count',
          value: 'not a number',
          operation: 'add',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      // NaN converts to 0
      expect(context.getCounter('count')).toBe(0);
    });
  });

  describe('navigation', () => {
    it('should always return next beat (invisible beat)', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Something',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'test',
          value: 'value',
          operation: 'set',
        },
        connections: [{ targetId: 'nextBeat' }],
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBe('nextBeat');
    });

    it('should return null when no connections', async () => {
      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Set Something',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'test',
          value: 'value',
          operation: 'set',
        },
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBeNull();
    });
  });

  describe('default operation', () => {
    it('should use set operation by default', async () => {
      context.setCounter('counter', 50);

      const beat = new SetVariableBeat({
        id: 'sv1',
        name: 'Default Op',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'counter',
          value: 100,
          // operation not specified - should default to 'set'
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getCounter('counter')).toBe(100);
    });
  });
});
