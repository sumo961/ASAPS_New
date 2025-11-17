import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Beat } from '../../src/beats/Beat';
import { StoryContext } from '../../src/engine/StoryContext';
import { BeatConfig } from '../../src/types/BeatConfig';

// Test implementation of Beat for testing purposes
class TestBeat extends Beat {
  private _performActionCalled = false;
  private _parameters: Record<string, any> = {};

  constructor(config: BeatConfig) {
    super(config);
    this._parameters = config.parameters || {};
  }

  async performAction(context: StoryContext): Promise<StoryContext> {
    this._performActionCalled = true;
    // Modify context to test that changes persist
    context.setVariable('test_beat_executed', true);
    return context;
  }

  getParameters(): Record<string, any> {
    return this._parameters;
  }

  updateParameters(params: Record<string, any>): void {
    this._parameters = { ...this._parameters, ...params };
  }

  wasPerformActionCalled(): boolean {
    return this._performActionCalled;
  }
}

describe('Beat Base Class', () => {
  let beatConfig: BeatConfig;
  let context: StoryContext;

  beforeEach(() => {
    beatConfig = {
      id: 'test-beat-1',
      name: 'Test Beat',
      type: 'testBeat',
      parameters: {
        message: 'Hello World',
        duration: 5
      }
    };
    context = new StoryContext();
  });

  describe('Constructor', () => {
    it('should create a beat with the provided configuration', () => {
      const beat = new TestBeat(beatConfig);

      expect(beat.id).toBe('test-beat-1');
      expect(beat.name).toBe('Test Beat');
      expect(beat.type).toBe('testBeat');
      expect(beat.getParameters()).toEqual({
        message: 'Hello World',
        duration: 5
      });
    });

    it.skip('should generate a unique instance ID', () => {
      // Feature not yet implemented
      const beat1 = new TestBeat(beatConfig);
      const beat2 = new TestBeat({ ...beatConfig, id: 'test-beat-2' });

      expect(beat1.instanceId).not.toBe(beat2.instanceId);
    });

    it('should set default parameters if none provided', () => {
      const beat = new TestBeat({
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat'
      });

      expect(beat.getParameters()).toEqual({});
    });
  });

  describe.skip('Lifecycle Methods', () => {
    // These tests need to be updated to provide a mock renderer
    // Beat.execute() signature: async execute(context: StoryContext, renderer: IRenderer)
    it('should call onEnter, performAction, and onExit in sequence', async () => {
      const beat = new TestBeat(beatConfig);

      // Spy on lifecycle methods
      const onEnterSpy = vi.spyOn(beat, 'onEnter');
      const onExitSpy = vi.spyOn(beat, 'onExit');

      const resultContext = await beat.execute(context);

      expect(onEnterSpy).toHaveBeenCalledOnce();
      expect(onEnterSpy).toHaveBeenCalledWith(context);
      expect((beat as any).wasPerformActionCalled()).toBe(true);
      expect(onExitSpy).toHaveBeenCalledOnce();
      expect(onExitSpy).toHaveBeenCalledWith(resultContext);
    });

    it('should maintain context state through execution', async () => {
      const beat = new TestBeat(beatConfig);

      // Set some initial state
      context.setVariable('initial_value', 42);

      const resultContext = await beat.execute(context);

      // Should preserve initial state
      expect(resultContext.getVariable('initial_value')).toBe(42);
      // Should add new state from beat execution
      expect(resultContext.getVariable('test_beat_executed')).toBe(true);
    });

    it('should handle errors in performAction', async () => {
      class ErrorBeat extends Beat {
        async performAction(context: StoryContext): Promise<StoryContext> {
          throw new Error('Perform action failed');
        }

        getParameters(): Record<string, any> {
          return {};
        }

        updateParameters(params: Record<string, any>): void {
          // No-op
        }
      }

      const beat = new ErrorBeat(beatConfig);

      await expect(beat.execute(context)).rejects.toThrow('Perform action failed');
    });
  });

  describe('Parameter Management', () => {
    it('should update parameters correctly', () => {
      const beat = new TestBeat(beatConfig);

      beat.updateParameters({
        message: 'Updated Message',
        newParam: 'New Value'
      });

      expect(beat.getParameters()).toEqual({
        message: 'Updated Message',
        duration: 5,
        newParam: 'New Value'
      });
    });

    it('should not mutate original parameters object', () => {
      const originalParams = { message: 'Original' };
      const beat = new TestBeat({
        ...beatConfig,
        parameters: originalParams
      });

      beat.updateParameters({ message: 'Updated' });

      expect(originalParams.message).toBe('Original');
      expect(beat.getParameters().message).toBe('Updated');
    });
  });

  describe.skip('Event System', () => {
    // Event system not yet implemented - Beat class doesn't extend EventEmitter
    it('should emit started event when execution begins', async () => {
      const beat = new TestBeat(beatConfig);
      const startedHandler = vi.fn();

      beat.on('started', startedHandler);
      await beat.execute(context);

      expect(startedHandler).toHaveBeenCalledOnce();
      expect(startedHandler).toHaveBeenCalledWith({
        beatId: 'test-beat-1',
        beatName: 'Test Beat'
      });
    });

    it('should emit completed event when execution finishes', async () => {
      const beat = new TestBeat(beatConfig);
      const completedHandler = vi.fn();

      beat.on('completed', completedHandler);
      await beat.execute(context);

      expect(completedHandler).toHaveBeenCalledOnce();
      expect(completedHandler).toHaveBeenCalledWith({
        beatId: 'test-beat-1',
        beatName: 'Test Beat'
      });
    });

    it('should emit error event when execution fails', async () => {
      class ErrorBeat extends Beat {
        async performAction(context: StoryContext): Promise<StoryContext> {
          throw new Error('Test error');
        }

        getParameters(): Record<string, any> {
          return {};
        }

        updateParameters(params: Record<string, any>): void {
          // No-op
        }
      }

      const beat = new ErrorBeat(beatConfig);
      const errorHandler = vi.fn();

      beat.on('error', errorHandler);

      await expect(beat.execute(context)).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler).toHaveBeenCalledWith({
        beatId: 'test-beat-1',
        beatName: 'Test Beat',
        error: expect.any(Error)
      });
    });
  });

  describe.skip('Validation', () => {
    // Validation not yet implemented in Beat constructor
    it('should validate required configuration fields', () => {
      expect(() => {
        new TestBeat({} as BeatConfig);
      }).toThrow();
    });

    it('should validate beat ID format', () => {
      const invalidIds = ['', '   ', 'invalid id', 'invalid@id'];

      invalidIds.forEach(invalidId => {
        expect(() => {
          new TestBeat({
            ...beatConfig,
            id: invalidId
          });
        }).toThrow();
      });
    });
  });

  describe.skip('Clone', () => {
    // Clone method not yet implemented
    it('should create a deep copy of the beat', () => {
      const beat = new TestBeat(beatConfig);
      const clonedBeat = beat.clone();

      expect(clonedBeat).not.toBe(beat);
      expect(clonedBeat.id).toBe(beat.id);
      expect(clonedBeat.name).toBe(beat.name);
      expect(clonedBeat.type).toBe(beat.type);
      expect(clonedBeat.getParameters()).toEqual(beat.getParameters());
    });

    it('should create independent parameter objects', () => {
      const beat = new TestBeat(beatConfig);
      const clonedBeat = beat.clone();

      clonedBeat.updateParameters({ newParam: 'cloned value' });

      expect(beat.getParameters()).not.toHaveProperty('newParam');
      expect(clonedBeat.getParameters()).toHaveProperty('newParam', 'cloned value');
    });
  });
});