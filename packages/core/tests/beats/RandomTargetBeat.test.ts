/**
 * Tests for RandomTargetBeat - random selection logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RandomTargetBeat } from '../../src/beats/RandomTargetBeat';
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

describe('RandomTargetBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
    // Mock window for potential timer usage
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
  });

  describe('constructor', () => {
    it('should create with string array choices', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
        choices: ['beat1', 'beat2', 'beat3'],
      });

      const params = beat.getParameters();
      expect(params.choices).toEqual(['beat1', 'beat2', 'beat3']);
    });

    it('should create with parameters object', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
        parameters: {
          choices: ['optionA', 'optionB'],
        },
      });

      const params = beat.getParameters();
      expect(params.choices).toEqual(['optionA', 'optionB']);
    });

    it('should convert Connection format to string array', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
        choices: [
          { targetId: 'target1' },
          { targetId: 'target2' },
        ] as any,
      });

      const params = beat.getParameters();
      expect(params.choices).toEqual(['target1', 'target2']);
    });

    it('should convert legacy object format', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
        choices: [
          { id: 'c1', target: 'legacy1' },
          { id: 'c2', target: 'legacy2' },
        ] as any,
      });

      const params = beat.getParameters();
      expect(params.choices).toEqual(['legacy1', 'legacy2']);
    });

    it('should create connections for each choice', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
        choices: ['a', 'b', 'c'],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(3);
      expect(connections[0].targetId).toBe('a');
      expect(connections[0].label).toBe('Random 1');
      expect(connections[1].targetId).toBe('b');
      expect(connections[1].label).toBe('Random 2');
      expect(connections[2].targetId).toBe('c');
      expect(connections[2].label).toBe('Random 3');
    });

    it('should handle empty choices', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random Beat',
        type: 'randomTarget',
      });

      const params = beat.getParameters();
      expect(params.choices).toEqual([]);
    });
  });

  describe('getParameters', () => {
    it('should return choices array', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['x', 'y', 'z'],
      });

      expect(beat.getParameters()).toEqual({
        choices: ['x', 'y', 'z'],
      });
    });
  });

  describe('updateParameters', () => {
    it('should update choices', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['old1', 'old2'],
      });

      beat.updateParameters({ choices: ['new1', 'new2', 'new3'] });

      expect(beat.getParameters().choices).toEqual(['new1', 'new2', 'new3']);
    });

    it('should update connections when choices change', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['old'],
      });

      beat.updateParameters({ choices: ['updated1', 'updated2'] });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections[0].targetId).toBe('updated1');
      expect(connections[1].targetId).toBe('updated2');
    });

    it('should handle object format in updateParameters', () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
      });

      beat.updateParameters({
        choices: [
          { id: 'c1', target: 'converted1' },
          { id: 'c2', target: 'converted2' },
        ],
      });

      expect(beat.getParameters().choices).toEqual(['converted1', 'converted2']);
    });
  });

  describe('performAction', () => {
    it('should return one of the valid choices', async () => {
      const choices = ['beat1', 'beat2', 'beat3'];
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices,
      });

      const result = await beat.execute(context, renderer);

      expect(choices).toContain(result);
    });

    it('should randomly distribute over multiple executions', async () => {
      const choices = ['a', 'b', 'c'];
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices,
      });

      const results = new Set<string>();
      // Run many times to increase probability of hitting all choices
      for (let i = 0; i < 100; i++) {
        const result = await beat.execute(context, renderer);
        if (result) results.add(result);
      }

      // With 100 iterations, we should have hit most if not all choices
      // (probability of missing one choice in 100 tries is extremely low)
      expect(results.size).toBeGreaterThanOrEqual(2);
    });

    it('should filter out empty choices', async () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['valid', '', 'also_valid'] as any,
      });

      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const result = await beat.execute(context, renderer);
        if (result) results.add(result);
      }

      expect(results.has('')).toBe(false);
      expect(results.has('valid')).toBe(true);
      expect(results.has('also_valid')).toBe(true);
    });

    it('should return null for no valid choices', async () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: [],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
    });

    it('should log warning for no valid choices', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: [],
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no valid choices')
      );

      consoleSpy.mockRestore();
    });

    it('should work with single choice (always returns it)', async () => {
      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['only_one'],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('only_one');
    });
  });

  describe('random distribution', () => {
    it('should use Math.random for selection', async () => {
      const mathRandomSpy = vi.spyOn(Math, 'random');

      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['a', 'b'],
      });

      await beat.execute(context, renderer);

      expect(mathRandomSpy).toHaveBeenCalled();

      mathRandomSpy.mockRestore();
    });

    it('should select first choice when Math.random returns 0', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['first', 'second', 'third'],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('first');

      vi.restoreAllMocks();
    });

    it('should select last choice when Math.random returns close to 1', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9999);

      const beat = new RandomTargetBeat({
        id: 'random1',
        name: 'Random',
        type: 'randomTarget',
        choices: ['first', 'second', 'third'],
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('third');

      vi.restoreAllMocks();
    });
  });
});
