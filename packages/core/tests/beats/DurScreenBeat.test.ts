/**
 * Tests for DurScreenBeat - timed auto-advance text
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DurScreenBeat } from '../../src/beats/DurScreenBeat';
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

describe('DurScreenBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
      });

      const params = beat.getParameters();
      expect(params.text).toBe('');
      expect(params.duration).toBe(3000);
    });

    it('should create with custom text and duration', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Three days later...',
        duration: 5000,
      });

      expect(beat.text).toBe('Three days later...');
      expect(beat.duration).toBe(5000);
    });

    it('should support parameters object format', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        parameters: {
          text: 'Meanwhile...',
          duration: 2000,
        },
      });

      expect(beat.text).toBe('Meanwhile...');
      expect(beat.duration).toBe(2000);
    });

    it('should initialize with text variations', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Time passes...',
        textVariations: ['Days go by...', 'Hours slip away...'],
      });

      expect(beat.text).toBe('Time passes...');
      expect(beat.textVariations).toEqual(['Days go by...', 'Hours slip away...']);
    });

    it('should initialize text variations from parameters', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        parameters: {
          text: 'Time passes...',
          textVariations: ['Days go by...'],
        },
      });

      expect(beat.textVariations).toEqual(['Days go by...']);
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'The sun sets...',
        duration: 4000,
        node: 'sunset_bg',
      });

      const params = beat.getParameters();
      expect(params.text).toBe('The sun sets...');
      expect(params.duration).toBe(4000);
      expect(params.node).toBe('sunset_bg');
    });

    it('should include textVariations when present', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Time passes...',
        textVariations: ['Hours pass...', 'The clock ticks on...'],
      });

      const params = beat.getParameters();
      expect(params.textVariations).toEqual(['Hours pass...', 'The clock ticks on...']);
    });

    it('should not include textVariations when empty', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Simple text',
      });

      const params = beat.getParameters();
      expect(params.textVariations).toBeUndefined();
    });
  });

  describe('updateParameters', () => {
    it('should update text', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
      });

      beat.updateParameters({ text: 'New text' });
      expect(beat.text).toBe('New text');
    });

    it('should update duration', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
      });

      beat.updateParameters({ duration: 7000 });
      expect(beat.duration).toBe(7000);
    });

    it('should update textVariations', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
      });

      beat.updateParameters({ textVariations: ['Variation A', 'Variation B'] });
      expect(beat.textVariations).toEqual(['Variation A', 'Variation B']);
    });

    it('should update node', () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
      });

      beat.updateParameters({ node: 'new_background' });
      expect(beat.node).toBe('new_background');
    });
  });

  describe('performAction', () => {
    it('should render durScreen with text and duration', async () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Three days later...',
        duration: 3000,
      });

      // Add a default connection so getNextBeat works
      beat.addConnection({ targetId: 'next_beat' });

      await beat.execute(context, renderer);

      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'Three days later...',
        3000,
        expect.any(Array)
      );
    });

    it('should process text with variable interpolation', async () => {
      context.setVariable('days', '5');

      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: '$days$ days later...',
        duration: 3000,
      });

      beat.addConnection({ targetId: 'next_beat' });

      await beat.execute(context, renderer);

      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        '5 days later...',
        3000,
        expect.any(Array)
      );
    });

    it('should return next beat from connections', async () => {
      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Text',
        duration: 1000,
      });

      beat.addConnection({ targetId: 'beat_next' });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_next');
    });

    it('should select from text variations randomly', async () => {
      // Mock Math.random to return deterministic value
      const randomSpy = vi.spyOn(Math, 'random');
      randomSpy.mockReturnValue(0.5);

      const beat = new DurScreenBeat({
        id: 'dur1',
        name: 'Timed Text',
        type: 'durScreen',
        text: 'Main text',
        textVariations: ['Variation 1', 'Variation 2'],
      });

      beat.addConnection({ targetId: 'next_beat' });

      await beat.execute(context, renderer);

      // With 3 options and Math.random() = 0.5, index = floor(0.5 * 3) = 1
      // Options: ['Main text', 'Variation 1', 'Variation 2']
      // Index 1 = 'Variation 1'
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'Variation 1',
        expect.any(Number),
        expect.any(Array)
      );

      randomSpy.mockRestore();
    });
  });
});
