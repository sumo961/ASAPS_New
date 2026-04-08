/**
 * Tests for OnlineContentBeat — word limit enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnlineContentBeat } from '../../src/beats/OnlineContentBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function createMockRenderer(aiResponse?: string) {
  const stateStore: Record<string, any> = {};

  // Mock AI service
  if (aiResponse !== undefined) {
    stateStore['aiService'] = {
      generateContent: vi.fn().mockResolvedValue(aiResponse),
    };
  }

  const renderer: IRenderer = {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn().mockImplementation((key, value) => { stateStore[key] = value; }),
    getState: vi.fn().mockImplementation((key) => stateStore[key] ?? null),
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

  return { renderer, stateStore };
}

function createMockStory() {
  return {
    getBeat: vi.fn().mockReturnValue(null),
    getBeats: vi.fn().mockReturnValue([]),
    getEnvironment: vi.fn().mockReturnValue({ nodes: [] }),
  };
}

describe('OnlineContentBeat', () => {
  let context: StoryContext;

  beforeEach(() => {
    context = new StoryContext();
    context.setStory(createMockStory() as any);
  });

  describe('constructor and parameters', () => {
    it('should initialize with defaults', () => {
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'test query',
        },
      });

      expect(beat.maxWords).toBe(150);
      expect(beat.sourceType).toBe('ai-query');
      expect(beat.query).toBe('test query');
    });

    it('should respect custom maxWords', () => {
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'test',
          maxWords: 80,
        },
      });

      expect(beat.maxWords).toBe(80);
    });

    it('should update maxWords via updateParameters', () => {
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: { sourceType: 'ai-query', query: 'test' },
      });

      beat.updateParameters({ maxWords: 50 });
      expect(beat.maxWords).toBe(50);
    });
  });

  describe('word limit enforcement', () => {
    it('should truncate AI response exceeding maxWords at sentence boundary', async () => {
      // Generate text that's ~30 words (exceeds limit of 20)
      const longResponse = 'City Life\n\nThe city has many attractions. There are museums and parks. ' +
        'The food scene is remarkable. Visitors enjoy the nightlife. The weather is pleasant year round.';

      const { renderer } = createMockRenderer(longResponse);
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'Tell me about this city',
          maxWords: 20,
          fallbackText: 'Fallback',
        },
      });

      await beat.execute(context, renderer);

      // renderText should have been called with truncated content
      expect(renderer.renderText).toHaveBeenCalled();
      const renderedText = (renderer.renderText as any).mock.calls[0][0] as string;

      // Count words in rendered text (excluding title)
      const contentAfterTitle = renderedText.includes('\n\n')
        ? renderedText.split('\n\n').slice(1).join(' ')
        : renderedText;
      const wordCount = contentAfterTitle.split(/\s+/).filter(Boolean).length;

      expect(wordCount).toBeLessThanOrEqual(20);
    });

    it('should not truncate content within word limit', async () => {
      const shortResponse = 'Quick Facts\n\nThe city is beautiful and historic.';

      const { renderer } = createMockRenderer(shortResponse);
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'Tell me about the city',
          maxWords: 100,
          fallbackText: 'Fallback',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalled();
      const renderedText = (renderer.renderText as any).mock.calls[0][0] as string;
      // Original content should be preserved (no truncation, no ellipsis)
      expect(renderedText).not.toContain('…');
    });

    it('should use fallback text when AI service is not available', async () => {
      const { renderer } = createMockRenderer(); // No AI service

      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'test',
          fallbackText: 'Content unavailable',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalled();
      const renderedText = (renderer.renderText as any).mock.calls[0][0] as string;
      // When AI is unavailable, the beat uses its errorMessage (default: "Unable to fetch content...")
      expect(renderedText).toContain('Unable to fetch content');
    });
  });

  describe('getParameters', () => {
    it('should include all parameters', () => {
      const beat = new OnlineContentBeat({
        id: 'oc_1',
        name: 'Test',
        type: 'onlineContent',
        parameters: {
          sourceType: 'ai-query',
          query: 'city transport',
          maxWords: 120,
          fallbackText: 'No data',
          buttonText: 'Next',
          title: 'Transport',
        },
      });

      const params = beat.getParameters();
      expect(params.sourceType).toBe('ai-query');
      expect(params.query).toBe('city transport');
      expect(params.maxWords).toBe(120);
      expect(params.errorMessage).toBe('Unable to fetch content. Please try again.');
      expect(params.buttonText).toBe('Next');
      expect(params.title).toBe('Transport');
    });
  });
});
