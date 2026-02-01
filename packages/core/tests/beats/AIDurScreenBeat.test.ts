/**
 * Tests for AIDurScreenBeat - AI-generated duration screen with auto-advance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIDurScreenBeat } from '../../src/beats/AIDurScreenBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { IRenderer } from '../../src/types';

// Mock renderer factory
function createMockRenderer(aiService?: any): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockImplementation((key: string) => {
      if (key === 'aiService') return aiService || null;
      return null;
    }),
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
    renderLoading: vi.fn(),
  } as unknown as IRenderer;
}

// Mock AI service factory
function createMockAIService(response: string = '{"text": "AI generated text", "suggestions": []}') {
  return {
    generateContent: vi.fn().mockResolvedValue(response),
  };
}

describe('AIDurScreenBeat', () => {
  let context: StoryContext;
  let story: Story;

  beforeEach(() => {
    context = new StoryContext();
    story = new Story({ title: 'Test Story', firstBeatId: 'aiDur1' });
    context.setStory(story);
  });

  describe('constructor', () => {
    it('should create with default parameters', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('');
      expect(params.fallbackText).toBe('Continue...');
      expect(params.includeVariables).toBe(true);
      expect(params.includeInventory).toBe(false);
      expect(params.includeHistory).toBe(false);
      expect(params.maxSentences).toBe(2);
      expect(params.wordsPerMinute).toBe(200);
      expect(params.minDuration).toBe(2000);
      expect(params.maxDuration).toBe(15000);
    });

    it('should create with custom parameters', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Describe the scene',
          fallbackText: 'A quiet room.',
          includeVariables: false,
          includeInventory: true,
          includeHistory: true,
          maxSentences: 4,
          wordsPerMinute: 150,
          minDuration: 3000,
          maxDuration: 20000,
          contextVariables: ['location'],
        },
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('Describe the scene');
      expect(params.fallbackText).toBe('A quiet room.');
      expect(params.includeVariables).toBe(false);
      expect(params.includeInventory).toBe(true);
      expect(params.includeHistory).toBe(true);
      expect(params.maxSentences).toBe(4);
      expect(params.wordsPerMinute).toBe(150);
      expect(params.minDuration).toBe(3000);
      expect(params.maxDuration).toBe(20000);
      expect(params.contextVariables).toEqual(['location']);
    });

    it('should support direct parameters (not in parameters object)', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        prompt: 'Direct prompt',
        fallbackText: 'Direct fallback',
        wordsPerMinute: 250,
      } as any);

      const params = beat.getParameters();
      expect(params.prompt).toBe('Direct prompt');
      expect(params.fallbackText).toBe('Direct fallback');
      expect(params.wordsPerMinute).toBe(250);
    });
  });

  describe('getParameters', () => {
    it('should return all parameters including duration settings', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Test prompt',
          fallbackText: 'Fallback',
          contextVariables: ['var1'],
          includeVariables: true,
          includeInventory: true,
          includeHistory: true,
          maxSentences: 3,
          wordsPerMinute: 180,
          minDuration: 1500,
          maxDuration: 10000,
        },
      });

      const params = beat.getParameters();
      expect(params).toEqual({
        prompt: 'Test prompt',
        fallbackText: 'Fallback',
        contextVariables: ['var1'],
        includeVariables: true,
        includeInventory: true,
        includeHistory: true,
        includeChoiceHistory: true,
        includeCounters: true,
        maxSentences: 3,
        wordsPerMinute: 180,
        minDuration: 1500,
        maxDuration: 10000,
      });
    });
  });

  describe('updateParameters', () => {
    it('should update duration-related parameters', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
      });

      beat.updateParameters({ wordsPerMinute: 300 });
      expect(beat.getParameters().wordsPerMinute).toBe(300);

      beat.updateParameters({ minDuration: 5000 });
      expect(beat.getParameters().minDuration).toBe(5000);

      beat.updateParameters({ maxDuration: 25000 });
      expect(beat.getParameters().maxDuration).toBe(25000);
    });

    it('should update AI-related parameters', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
      });

      beat.updateParameters({
        prompt: 'Updated prompt',
        includeInventory: true,
        maxSentences: 5,
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('Updated prompt');
      expect(params.includeInventory).toBe(true);
      expect(params.maxSentences).toBe(5);
    });
  });

  describe('execute - without AI service', () => {
    it('should use fallback text and renderDurScreen when AI is unavailable', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate something',
          fallbackText: 'Fallback display text.',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'Fallback display text.',
        expect.any(Number), // duration
        expect.any(Array)   // locations
      );
    });

    it('should log warning when AI service is not configured', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AI service not configured')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('execute - with AI service', () => {
    it('should call AI service and render with renderDurScreen', async () => {
      const aiService = createMockAIService('{"text": "AI generated scene description.", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Describe the scene',
          fallbackText: 'Fallback',
        },
      });

      await beat.execute(context, renderer);

      expect(aiService.generateContent).toHaveBeenCalled();
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'AI generated scene description.',
        expect.any(Number),
        expect.any(Array)
      );
    });

    it('should show loading indicator while generating', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate text',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderLoading).toHaveBeenCalledWith(
        'Thinking...',
        expect.objectContaining({ subMessage: 'Generating response' })
      );
    });

    it('should use fallback text on AI error', async () => {
      const aiService = {
        generateContent: vi.fn().mockRejectedValue(new Error('AI failed')),
      };
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate',
          fallbackText: 'Error fallback',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'Error fallback',
        expect.any(Number),
        expect.any(Array)
      );
    });
  });

  describe('duration calculation', () => {
    it('should calculate duration based on word count and WPM', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          // 10 words at 200 WPM = 3000ms
          fallbackText: 'One two three four five six seven eight nine ten.',
          wordsPerMinute: 200,
          minDuration: 1000,
          maxDuration: 30000,
        },
      });

      await beat.execute(context, renderer);

      // 10 words / 200 WPM * 60 * 1000 = 3000ms
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        expect.any(String),
        3000,
        expect.any(Array)
      );
    });

    it('should respect minimum duration', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          // Very short text
          fallbackText: 'Hi.',
          wordsPerMinute: 200,
          minDuration: 2000, // Minimum 2 seconds
          maxDuration: 30000,
        },
      });

      await beat.execute(context, renderer);

      // 1 word at 200 WPM would be 300ms, but minDuration is 2000ms
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        expect.any(String),
        2000, // minDuration enforced
        expect.any(Array)
      );
    });

    it('should respect maximum duration', async () => {
      const renderer = createMockRenderer(null);
      // Create a very long text
      const longText = Array(500).fill('word').join(' ');
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          fallbackText: longText,
          wordsPerMinute: 200,
          minDuration: 1000,
          maxDuration: 10000, // Maximum 10 seconds
        },
      });

      await beat.execute(context, renderer);

      // 500 words at 200 WPM would be 150000ms, but maxDuration is 10000ms
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        expect.any(String),
        10000, // maxDuration enforced
        expect.any(Array)
      );
    });

    it('should calculate duration correctly with different WPM', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          // 20 words at 100 WPM = 12000ms
          fallbackText: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.',
          wordsPerMinute: 100,
          minDuration: 1000,
          maxDuration: 30000,
        },
      });

      await beat.execute(context, renderer);

      // 20 words / 100 WPM * 60 * 1000 = 12000ms
      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        expect.any(String),
        12000,
        expect.any(Array)
      );
    });
  });

  describe('caching and context hash', () => {
    it('should regenerate text when inventory changes', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Describe inventory',
          includeInventory: true,
        },
      });

      // First execution with book
      context.addToInventory('Book');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Same inventory - should use cache
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Changed inventory - should regenerate
      context.removeFromInventory('Book');
      context.addToInventory('Axe');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should regenerate text when variables change', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Describe mood',
          includeVariables: true,
        },
      });

      // First execution
      context.setVariable('mood', 'happy');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Changed variable - should regenerate
      context.setVariable('mood', 'sad');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should regenerate text when history changes', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Summarize journey',
          includeHistory: true,
        },
      });

      // First execution
      context.markBeatVisited('beat_0');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // New beat visited - should regenerate
      context.markBeatVisited('beat_1');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('AI suggestions', () => {
    it('should expose AI suggestions via getter', async () => {
      const aiService = createMockAIService('{"text": "Hello", "suggestions": ["Add weather variable"]}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      expect(beat.aiSuggestions).toEqual(['Add weather variable']);
    });

    it('should store suggestions in renderer state', async () => {
      const aiService = createMockAIService('{"text": "Text", "suggestions": ["Suggestion 1", "Suggestion 2"]}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'My Duration Beat',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith(
        'aiSuggestions',
        expect.objectContaining({
          beatId: 'aiDur1',
          beatName: 'My Duration Beat',
          suggestions: ['Suggestion 1', 'Suggestion 2'],
        })
      );
    });
  });

  describe('variable interpolation', () => {
    it('should interpolate variables in fallback text', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          fallbackText: 'Welcome to ${location}!',
        },
      });

      context.setVariable('location', 'the forest');
      await beat.execute(context, renderer);

      expect(renderer.renderDurScreen).toHaveBeenCalledWith(
        'Welcome to the forest!',
        expect.any(Number),
        expect.any(Array)
      );
    });
  });

  describe('difference from AIInfoTextBeat', () => {
    it('should use renderDurScreen instead of renderText', async () => {
      const aiService = createMockAIService('{"text": "Test text", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      // Should use renderDurScreen, NOT renderText
      expect(renderer.renderDurScreen).toHaveBeenCalled();
      expect(renderer.renderText).not.toHaveBeenCalled();
    });

    it('should NOT have buttonText parameter', () => {
      const beat = new AIDurScreenBeat({
        id: 'aiDur1',
        name: 'AI Duration',
        type: 'aiDurScreen',
      });

      const params = beat.getParameters();
      // AIDurScreenBeat should not have buttonText since it auto-advances
      expect(params).not.toHaveProperty('buttonText');
    });
  });
});
