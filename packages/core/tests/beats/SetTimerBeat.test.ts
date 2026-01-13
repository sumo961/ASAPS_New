/**
 * Tests for SetTimerBeat - timer lifecycle management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SetTimerBeat } from '../../src/beats/SetTimerBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

// Mock renderer factory
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

describe('SetTimerBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    // Mock window for timer tests
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer Beat',
        type: 'setTimer',
      });

      const params = beat.getParameters();
      expect(params.timerName).toBe('Timer Beat'); // Uses beat name as fallback
      expect(params.value).toBe(60); // Default value in getParameters
      expect(params.timerTarget).toBe('');
    });

    it('should create with parameters object', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer Beat',
        type: 'setTimer',
        parameters: {
          name: 'countdown',
          value: 30,
          timerTarget: 'timeout_beat',
        },
      });

      const params = beat.getParameters();
      expect(params.timerName).toBe('countdown');
      expect(params.value).toBe(30);
      expect(params.timerTarget).toBe('timeout_beat');
    });

    it('should support legacy config format', () => {
      // Note: timerName is checked after config.name in the constructor
      // So timerName only works when params.name is not set and config.name differs
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer Beat', // Display name
        type: 'setTimer',
        value: 45,
        target: 'legacy_target',
      });

      const params = beat.getParameters();
      // config.name is used as timer name fallback
      expect(params.timerName).toBe('Timer Beat');
      expect(params.value).toBe(45);
      expect(params.timerTarget).toBe('legacy_target');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Test Timer',
        type: 'setTimer',
        parameters: {
          name: 'bomb',
          value: 10,
          timerTarget: 'explosion',
        },
      });

      const params = beat.getParameters();
      expect(params).toHaveProperty('timerName', 'bomb');
      expect(params).toHaveProperty('value', 10);
      expect(params).toHaveProperty('timerTarget', 'explosion');
      expect(params).toHaveProperty('continueTarget', '');
    });
  });

  describe('updateParameters', () => {
    it('should update timerName', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
      });

      beat.updateParameters({ timerName: 'newTimer' });
      expect(beat.getParameters().timerName).toBe('newTimer');
    });

    it('should update via name parameter', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
      });

      beat.updateParameters({ name: 'altName' });
      expect(beat.getParameters().timerName).toBe('altName');
    });

    it('should update value', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
      });

      beat.updateParameters({ value: 120 });
      expect(beat.getParameters().value).toBe(120);
    });

    it('should update timerTarget', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
      });

      beat.updateParameters({ timerTarget: 'new_target' });
      expect(beat.getParameters().timerTarget).toBe('new_target');
    });

    it('should update continueTarget via target alias', () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
      });

      beat.updateParameters({ target: 'continue_beat' });
      expect(beat.getParameters().continueTarget).toBe('continue_beat');
    });
  });

  describe('performAction', () => {
    it('should set timer in context', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'countdown',
          value: 30,
          timerTarget: 'timeout',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      // Timer should be set in context
      expect(context.getTimerTarget('countdown')).toBe('timeout');
    });

    it('should clear timer when value is 0', async () => {
      // First set a timer
      context.setTimer('temp_timer', 60, 'target');

      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'temp_timer',
          value: 0,
          timerTarget: 'unused',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);

      // Timer should be cleared (returns 0)
      expect(context.getTimer('temp_timer')).toBe(0);
    });

    it('should return next beat immediately', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'timer',
          value: 60,
          timerTarget: 'timeout_beat',
        },
        connections: [{ targetId: 'continue_beat' }],
      });

      const result = await beat.execute(context, renderer);

      // Should proceed to next beat immediately
      expect(result).toBe('continue_beat');
    });

    it('should log error and continue if timer name missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new SetTimerBeat({
        id: 'timer1',
        name: '', // Empty name
        type: 'setTimer',
        parameters: {
          name: '',
          value: 30,
          timerTarget: 'target',
        },
        connections: [{ targetId: 'next' }],
      });

      const result = await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no timer name specified')
      );
      expect(result).toBe('next');

      consoleSpy.mockRestore();
    });

    it('should log error and continue if timer target missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'timer',
          value: 30,
          timerTarget: '', // Empty target
        },
        connections: [{ targetId: 'next' }],
      });

      const result = await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no timer target specified')
      );
      expect(result).toBe('next');

      consoleSpy.mockRestore();
    });
  });

  describe('getNextBeat', () => {
    it('should return connection with empty label (continue connection)', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'timer',
          value: 30,
          timerTarget: 'timeout_beat',
        },
        connections: [
          { targetId: 'timeout_beat', label: 'Timer Target' },
          { targetId: 'continue_beat', label: '' }, // Continue connection
        ],
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBe('continue_beat');
    });

    it('should fallback to default if no continue connection', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'timer',
          value: 30,
          timerTarget: 'timeout_beat',
        },
        defaultTarget: 'default_beat',
        connections: [
          { targetId: 'timeout_beat', label: 'Timer Target' },
        ],
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBe('default_beat');
    });

    it('should return null if no connections', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'timer',
          value: 30,
          timerTarget: 'timeout_beat',
        },
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBeNull();
    });
  });

  describe('timer value handling', () => {
    it('should accept fractional seconds', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'quick_timer',
          value: 0.5, // Half second
          timerTarget: 'quick_target',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getTimerTarget('quick_timer')).toBe('quick_target');
    });

    it('should handle large timer values', async () => {
      const beat = new SetTimerBeat({
        id: 'timer1',
        name: 'Timer',
        type: 'setTimer',
        parameters: {
          name: 'long_timer',
          value: 3600, // 1 hour
          timerTarget: 'hour_target',
        },
        connections: [{ targetId: 'next' }],
      });

      await beat.execute(context, renderer);
      expect(context.getTimerTarget('long_timer')).toBe('hour_target');
    });
  });
});
