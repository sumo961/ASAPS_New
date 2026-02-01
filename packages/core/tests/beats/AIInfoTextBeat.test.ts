/**
 * Tests for AIInfoTextBeat - AI-generated contextual info text
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIInfoTextBeat } from '../../src/beats/AIInfoTextBeat';
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

describe('AIInfoTextBeat', () => {
  let context: StoryContext;
  let story: Story;

  beforeEach(() => {
    context = new StoryContext();
    story = new Story({ title: 'Test Story', firstBeatId: 'ai1' });
    context.setStory(story);
  });

  describe('constructor', () => {
    it('should create with default parameters', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('');
      expect(params.fallbackText).toBe('Continue...');
      expect(params.buttonText).toBe('Continue');
      expect(params.includeVariables).toBe(true);
      expect(params.includeInventory).toBe(false);
      expect(params.includeHistory).toBe(false);
      expect(params.maxSentences).toBe(2);
    });

    it('should create with custom parameters', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Describe the atmosphere',
          fallbackText: 'The room is quiet.',
          buttonText: 'Next',
          includeVariables: false,
          includeInventory: true,
          includeHistory: true,
          maxSentences: 3,
          contextVariables: ['playerName', 'mood'],
        },
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('Describe the atmosphere');
      expect(params.fallbackText).toBe('The room is quiet.');
      expect(params.buttonText).toBe('Next');
      expect(params.includeVariables).toBe(false);
      expect(params.includeInventory).toBe(true);
      expect(params.includeHistory).toBe(true);
      expect(params.maxSentences).toBe(3);
      expect(params.contextVariables).toEqual(['playerName', 'mood']);
    });

    it('should support direct parameters (not in parameters object)', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        prompt: 'Direct prompt',
        fallbackText: 'Direct fallback',
      } as any);

      const params = beat.getParameters();
      expect(params.prompt).toBe('Direct prompt');
      expect(params.fallbackText).toBe('Direct fallback');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Test prompt',
          fallbackText: 'Fallback',
          buttonText: 'Go',
          contextVariables: ['var1'],
          includeVariables: true,
          includeInventory: true,
          includeHistory: true,
          maxSentences: 5,
        },
      });

      const params = beat.getParameters();
      expect(params).toEqual({
        prompt: 'Test prompt',
        fallbackText: 'Fallback',
        buttonText: 'Go',
        contextVariables: ['var1'],
        includeVariables: true,
        includeInventory: true,
        includeHistory: true,
        includeChoiceHistory: true,
        includeCounters: true,
        maxSentences: 5,
      });
    });
  });

  describe('updateParameters', () => {
    it('should update individual parameters', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
      });

      beat.updateParameters({ prompt: 'New prompt' });
      expect(beat.getParameters().prompt).toBe('New prompt');

      beat.updateParameters({ fallbackText: 'New fallback' });
      expect(beat.getParameters().fallbackText).toBe('New fallback');

      beat.updateParameters({ maxSentences: 4 });
      expect(beat.getParameters().maxSentences).toBe(4);
    });

    it('should update multiple parameters at once', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
      });

      beat.updateParameters({
        prompt: 'Updated prompt',
        includeInventory: true,
        includeHistory: true,
      });

      const params = beat.getParameters();
      expect(params.prompt).toBe('Updated prompt');
      expect(params.includeInventory).toBe(true);
      expect(params.includeHistory).toBe(true);
    });
  });

  describe('execute - without AI service', () => {
    it('should use fallback text when AI service is not available', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate something',
          fallbackText: 'This is the fallback text.',
          buttonText: 'Continue',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        'This is the fallback text.',
        'Continue',
        expect.any(Array)
      );
    });

    it('should log warning when AI service is not configured', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const renderer = createMockRenderer(null);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
      });

      await beat.execute(context, renderer);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AI service not configured')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('execute - with AI service', () => {
    it('should call AI service and render generated text', async () => {
      const aiService = createMockAIService('{"text": "AI says hello!", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Say hello',
          fallbackText: 'Fallback',
        },
      });

      await beat.execute(context, renderer);

      expect(aiService.generateContent).toHaveBeenCalled();
      expect(renderer.renderText).toHaveBeenCalledWith(
        'AI says hello!',
        'Continue',
        expect.any(Array)
      );
    });

    it('should show loading indicator while generating', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
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
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate',
          fallbackText: 'Error fallback',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        'Error fallback',
        'Continue',
        expect.any(Array)
      );
    });

    it('should handle plain text response (non-JSON)', async () => {
      const aiService = createMockAIService('Plain text response without JSON');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        'Plain text response without JSON',
        'Continue',
        expect.any(Array)
      );
    });

    it('should store AI suggestions in renderer state', async () => {
      const aiService = createMockAIService('{"text": "Hello", "suggestions": ["Add playerName variable"]}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'My AI Beat',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith(
        'aiSuggestions',
        expect.objectContaining({
          beatId: 'ai1',
          beatName: 'My AI Beat',
          suggestions: ['Add playerName variable'],
        })
      );
    });
  });

  describe('caching and context hash', () => {
    it('should regenerate text when variables change', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate based on mood',
          includeVariables: true,
        },
      });

      // First execution
      context.setVariable('mood', 'happy');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Same context - should use cache
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Changed variable - should regenerate
      context.setVariable('mood', 'sad');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should regenerate text when inventory changes', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
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

    it('should regenerate text when history changes', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Summarize journey',
          includeHistory: true,
        },
      });

      // Pre-mark the beat's own ID as visited since Beat.execute marks itself visited,
      // which would otherwise change the history hash between executions
      context.markBeatVisited('ai1');
      context.markBeatVisited('beat_0');

      // First execution
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Same history - should use cache
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // New beat visited - should regenerate
      context.markBeatVisited('beat_1');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should NOT regenerate when inventory changes but includeInventory is false', async () => {
      const aiService = createMockAIService('{"text": "Generated", "suggestions": []}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generic text',
          includeInventory: false,
        },
      });

      // First execution
      context.addToInventory('Book');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);

      // Changed inventory but includeInventory is false - should use cache
      context.addToInventory('Axe');
      await beat.execute(context, renderer);
      expect(aiService.generateContent).toHaveBeenCalledTimes(1);
    });
  });

  describe('AI suggestions', () => {
    it('should expose AI suggestions via getter', async () => {
      const aiService = createMockAIService('{"text": "Hello", "suggestions": ["Tip 1", "Tip 2"]}');
      const renderer = createMockRenderer(aiService);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          prompt: 'Generate',
        },
      });

      await beat.execute(context, renderer);

      expect(beat.aiSuggestions).toEqual(['Tip 1', 'Tip 2']);
    });

    it('should have empty suggestions initially', () => {
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
      });

      expect(beat.aiSuggestions).toEqual([]);
    });
  });

  describe('variable interpolation', () => {
    it('should interpolate variables in fallback text', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIInfoTextBeat({
        id: 'ai1',
        name: 'AI Info',
        type: 'aiInfoText',
        parameters: {
          fallbackText: 'Hello, ${playerName}!',
        },
      });

      context.setVariable('playerName', 'Alice');
      await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        'Hello, Alice!',
        'Continue',
        expect.any(Array)
      );
    });
  });
});
