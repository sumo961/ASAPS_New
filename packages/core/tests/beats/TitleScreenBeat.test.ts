/**
 * Tests for TitleScreenBeat - story opening screen
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TitleScreenBeat } from '../../src/beats/TitleScreenBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

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

describe('TitleScreenBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
      });

      expect(beat.title).toBe('Untitled Story');
      expect(beat.author).toBeUndefined();
      expect(beat.buttonText).toBeUndefined();
    });

    it('should create with custom values', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        title: 'My Great Story',
        author: 'Author Name',
        buttonText: 'Begin Adventure',
      });

      expect(beat.title).toBe('My Great Story');
      expect(beat.author).toBe('Author Name');
      expect(beat.buttonText).toBe('Begin Adventure');
    });

    it('should support parameters object format', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        parameters: {
          title: 'Mystery at Midnight',
          author: 'Jane Doe',
          buttonText: 'Start',
        },
      });

      expect(beat.title).toBe('Mystery at Midnight');
      expect(beat.author).toBe('Jane Doe');
      expect(beat.buttonText).toBe('Start');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        title: 'Test Title',
        author: 'Test Author',
        buttonText: 'Play',
        node: 'title_bg',
      });

      const params = beat.getParameters();
      expect(params.title).toBe('Test Title');
      expect(params.author).toBe('Test Author');
      expect(params.buttonText).toBe('Play');
      expect(params.node).toBe('title_bg');
    });
  });

  describe('updateParameters', () => {
    it('should update title', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
      });

      beat.updateParameters({ title: 'New Title' });
      expect(beat.title).toBe('New Title');
    });

    it('should update author and buttonText', () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
      });

      beat.updateParameters({ author: 'New Author', buttonText: 'Go!' });
      expect(beat.author).toBe('New Author');
      expect(beat.buttonText).toBe('Go!');
    });
  });

  describe('performAction', () => {
    it('should render title screen and return next beat', async () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        title: 'My Story',
        author: 'Author',
        buttonText: 'Start',
      });

      beat.addConnection({ targetId: 'beat_intro' });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderTitleScreen).toHaveBeenCalledWith(
        'My Story',
        'Author',
        'Start',
        expect.any(Array)
      );
      expect(result).toBe('beat_intro');
    });

    it('should use "Start" as default button text', async () => {
      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        title: 'Test',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderTitleScreen as any).mock.calls[0];
      expect(callArgs[2]).toBe('Start'); // processed buttonText
    });

    it('should process text with variable interpolation', async () => {
      context.setVariable('playerName', 'Alice');

      const beat = new TitleScreenBeat({
        id: 'title1',
        name: 'Title',
        type: 'titleScreen',
        title: '$playerName$\'s Adventure',
        author: 'AI Author',
      });

      beat.addConnection({ targetId: 'next' });

      await beat.execute(context, renderer);

      expect(renderer.renderTitleScreen).toHaveBeenCalledWith(
        "Alice's Adventure",
        'AI Author',
        'Start',
        expect.any(Array)
      );
    });
  });
});
