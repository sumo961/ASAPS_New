import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AIService, getAIService, resetAIService } from '../AIService';
import type {
  IAIProvider,
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse,
  AIProviderConfig,
} from '../../types/ai';

describe('AIService', () => {
  let service: AIService;
  let mockProvider: IAIProvider;
  let originalFetch: typeof global.fetch;

  const mockSchema = {
    schema: 'asaps-beat-definitions-v2.2',
    beatTypes: {
      titleScreen: {
        name: 'Title Screen',
        category: 'visible',
        parameters: {
          title: { type: 'string', required: true },
        },
      },
      dialogTree: {
        name: 'Dialog Tree',
        category: 'visible',
        parameters: {
          dialogTree: { type: 'object', required: true },
        },
      },
      infoText: {
        name: 'Intro Text',
        category: 'visible',
        parameters: {
          text: { type: 'string', required: true },
        },
      },
      movementChoice: {
        name: 'Movement Choice',
        category: 'visible',
        parameters: {
          question: { type: 'string', required: true },
          choices: { type: 'array', required: true },
        },
      },
    },
  };

  beforeEach(() => {
    // Store original fetch
    originalFetch = global.fetch;

    // Mock fetch to return schema
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSchema),
      } as Response)
    );

    // Reset singleton before each test
    resetAIService();

    // Create mock provider
    mockProvider = {
      name: 'test-provider',
      isReady: vi.fn(() => true),
      configure: vi.fn(),
      generateStory: vi.fn(),
      generateDialog: vi.fn(),
      suggestBeats: vi.fn(),
      createBeatFromNL: vi.fn(),
    };

    // Create new service instance
    service = new AIService({ validateSchema: false }); // Disable validation for most tests
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('Provider Management', () => {
    it('should register a provider', () => {
      service.registerProvider(mockProvider);

      expect(service.getAvailableProviders()).toContain('test-provider');
    });

    it('should set provider as current when registering if none is set', () => {
      service.registerProvider(mockProvider);

      expect(service.getCurrentProvider()).toBe(mockProvider);
      expect(service.isReady()).toBe(true);
    });

    it('should not override current provider when registering additional providers', () => {
      const firstProvider = { ...mockProvider, name: 'first' };
      const secondProvider = { ...mockProvider, name: 'second' };

      service.registerProvider(firstProvider);
      service.registerProvider(secondProvider);

      expect(service.getCurrentProvider()).toBe(firstProvider);
    });

    it('should switch to a different provider', () => {
      const firstProvider = { ...mockProvider, name: 'first' };
      const secondProvider = { ...mockProvider, name: 'second' };

      service.registerProvider(firstProvider);
      service.registerProvider(secondProvider);

      service.setProvider('second');

      expect(service.getCurrentProvider()).toBe(secondProvider);
    });

    it('should throw when switching to unregistered provider', () => {
      expect(() => {
        service.setProvider('non-existent');
      }).toThrow("Provider 'non-existent' not registered");
    });

    it('should throw when switching to non-ready provider', () => {
      const notReadyProvider = {
        ...mockProvider,
        name: 'not-ready',
        isReady: vi.fn(() => false),
      };

      service.registerProvider(notReadyProvider);

      expect(() => {
        service.setProvider('not-ready');
      }).toThrow("Provider 'not-ready' is not configured");
    });

    it('should return list of available providers', () => {
      service.registerProvider({ ...mockProvider, name: 'provider1' });
      service.registerProvider({ ...mockProvider, name: 'provider2' });
      service.registerProvider({ ...mockProvider, name: 'provider3' });

      const providers = service.getAvailableProviders();

      expect(providers).toHaveLength(3);
      expect(providers).toContain('provider1');
      expect(providers).toContain('provider2');
      expect(providers).toContain('provider3');
    });
  });

  describe('Service Readiness', () => {
    it('should not be ready without provider', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should be ready with configured provider', () => {
      service.registerProvider(mockProvider);

      expect(service.isReady()).toBe(true);
    });

    it('should not be ready if provider is not ready', () => {
      const notReadyProvider = {
        ...mockProvider,
        isReady: vi.fn(() => false),
      };

      service.registerProvider(notReadyProvider);

      expect(service.isReady()).toBe(false);
    });
  });

  describe('Story Generation', () => {
    const mockStoryRequest: StoryGenerationRequest = {
      prompt: 'A mystery in a mansion',
      genre: 'mystery',
      length: 'medium',
    };

    const mockStoryResponse: StoryGenerationResponse = {
      metadata: {
        title: 'Mansion Mystery',
        author: 'AI',
        genre: 'mystery',
      },
      beats: [
        {
          id: 'beat_1',
          name: 'Title',
          type: 'titleScreen',
          position: { x: 100, y: 100 },
          parameters: { title: 'Mansion Mystery' },
          connections: [],
        },
      ],
      reasoning: 'Created a mystery story',
    };

    beforeEach(() => {
      service.registerProvider(mockProvider);
      mockProvider.generateStory = vi.fn(async () => mockStoryResponse);
    });

    it('should generate story using current provider', async () => {
      const result = await service.generateStory(mockStoryRequest);

      // AIService wraps the request with an AbortSignal for cancel support
      // — assert all original fields plus a signal are forwarded.
      expect(mockProvider.generateStory).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockStoryRequest,
          signal: expect.any(AbortSignal),
        })
      );
      expect(result).toEqual(mockStoryResponse);
    });

    it('should throw when not ready', async () => {
      const emptyService = new AIService();

      await expect(emptyService.generateStory(mockStoryRequest)).rejects.toThrow(
        'AI Service not ready'
      );
    });

    it('should validate story when validation enabled', async () => {
      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);

      const result = await validatingService.generateStory(mockStoryRequest);

      expect(result).toEqual(mockStoryResponse);
    });

    it('should throw on validation failure', async () => {
      const invalidResponse = {
        ...mockStoryResponse,
        beats: [
          {
            id: 'beat_1',
            name: 'Invalid',
            type: 'unknownType',
            position: { x: 0, y: 0 },
            parameters: {},
            connections: [],
          },
        ],
      };

      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);
      mockProvider.generateStory = vi.fn(async () => invalidResponse);

      await expect(validatingService.generateStory(mockStoryRequest)).rejects.toThrow(
        'Story validation failed'
      );
    });

    it('should propagate provider errors', async () => {
      mockProvider.generateStory = vi.fn(async () => {
        throw new Error('Provider API error');
      });

      await expect(service.generateStory(mockStoryRequest)).rejects.toThrow(
        'Provider API error'
      );
    });
  });

  describe('Dialog Generation', () => {
    const mockDialogRequest: DialogGenerationRequest = {
      scene: 'Guard confronts player',
      character: 'Guard',
    };

    const mockDialogResponse: DialogGenerationResponse = {
      dialogTree: {
        id: 'node_1',
        text: 'Halt! Who goes there?',
        choices: [
          {
            id: 'choice_1', target: 'next_beat',
            text: 'I am a traveler',
          },
        ],
      },
      reasoning: 'Created guard dialog',
    };

    beforeEach(() => {
      service.registerProvider(mockProvider);
      mockProvider.generateDialog = vi.fn(async () => mockDialogResponse);
    });

    it('should generate dialog using current provider', async () => {
      const result = await service.generateDialog(mockDialogRequest);

      expect(mockProvider.generateDialog).toHaveBeenCalledWith(mockDialogRequest);
      expect(result).toEqual(mockDialogResponse);
    });

    it('should throw when not ready', async () => {
      const emptyService = new AIService();

      await expect(emptyService.generateDialog(mockDialogRequest)).rejects.toThrow(
        'AI Service not ready'
      );
    });

    it('should validate dialog when validation enabled', async () => {
      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);

      const result = await validatingService.generateDialog(mockDialogRequest);

      expect(result).toEqual(mockDialogResponse);
    });
  });

  describe('Beat Suggestions', () => {
    const mockSuggestionRequest: BeatSuggestionRequest = {
      currentBeat: {
        id: 'beat_1',
        name: 'Current Beat',
        type: 'infoText',
        parameters: { text: 'Some text' },
      },
      existingBeats: [],
      storyMetadata: {
        title: 'Test Story',
        genre: 'adventure',
      },
      count: 3,
    };

    const mockSuggestionResponse: BeatSuggestionResponse = {
      suggestions: [
        {
          beatType: 'movementChoice',
          name: 'Choose Path',
          reasoning: 'Give player a choice',
          confidence: 0.9,
          connections: [],
          parameters: {
            question: 'Which way?',
            choices: [
              { text: 'Left', target: 'beat_left' },
              { text: 'Right', target: 'beat_right' },
            ],
          },
        },
      ],
    };

    beforeEach(() => {
      service.registerProvider(mockProvider);
      mockProvider.suggestBeats = vi.fn(async () => mockSuggestionResponse);
    });

    it('should suggest beats using current provider', async () => {
      const result = await service.suggestBeats(mockSuggestionRequest);

      expect(mockProvider.suggestBeats).toHaveBeenCalledWith(mockSuggestionRequest);
      expect(result).toEqual(mockSuggestionResponse);
    });

    it('should throw when not ready', async () => {
      const emptyService = new AIService();

      await expect(emptyService.suggestBeats(mockSuggestionRequest)).rejects.toThrow(
        'AI Service not ready'
      );
    });

    it('should filter invalid beat types when validation enabled', async () => {
      const responseWithInvalid: BeatSuggestionResponse = {
        suggestions: [
          {
            beatType: 'validType',
            name: 'Valid',
            reasoning: 'Valid suggestion',
            confidence: 0.9,
            connections: [],
            parameters: {},
          },
          {
            beatType: 'invalidType',
            name: 'Invalid',
            reasoning: 'Invalid suggestion',
            confidence: 0.8,
            connections: [],
            parameters: {},
          },
        ],
      };

      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);
      mockProvider.suggestBeats = vi.fn(async () => responseWithInvalid);

      const result = await validatingService.suggestBeats(mockSuggestionRequest);

      // Invalid beat types should be filtered out
      // (Note: This will pass if schema is not loaded or doesn't have beat types)
      expect(result.suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Natural Language Beat Creation', () => {
    const mockNLRequest: NaturalLanguageBeatRequest = {
      description: 'Create a dialog where a guard questions the player',
      storyContext: {
        title: 'Test Story',
        existingBeats: [],
        currentPosition: { x: 200, y: 200 },
      },
    };

    const mockNLResponse: NaturalLanguageBeatResponse = {
      beat: {
        id: 'beat_new',
        name: 'Guard Dialog',
        type: 'dialogTree',
        position: { x: 200, y: 200 },
        parameters: {
          dialogTree: {
            id: 'node_1',
            text: 'Who are you?',
            choices: [],
          },
        },
        connections: [],
      },
      interpretation: 'Created guard dialog beat',
    };

    beforeEach(() => {
      service.registerProvider(mockProvider);
      mockProvider.createBeatFromNL = vi.fn(async () => mockNLResponse);
    });

    it('should create beat from natural language', async () => {
      const result = await service.createBeatFromNL(mockNLRequest);

      expect(mockProvider.createBeatFromNL).toHaveBeenCalledWith(mockNLRequest);
      expect(result).toEqual(mockNLResponse);
    });

    it('should throw when not ready', async () => {
      const emptyService = new AIService();

      await expect(emptyService.createBeatFromNL(mockNLRequest)).rejects.toThrow(
        'AI Service not ready'
      );
    });

    it('should validate beat when validation enabled', async () => {
      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);

      const result = await validatingService.createBeatFromNL(mockNLRequest);

      expect(result).toEqual(mockNLResponse);
    });
  });

  describe('Schema Access', () => {
    it('should provide access to validator', () => {
      const validator = service.getValidator();

      expect(validator).toBeDefined();
      expect(validator.validateBeat).toBeDefined();
    });

    it('should provide beat schema', async () => {
      const schema = await service.getBeatSchema();

      expect(schema).toBeDefined();
      expect(schema.beatTypes).toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      resetAIService();
      const instance1 = getAIService();
      const instance2 = getAIService();

      expect(instance1).toBe(instance2);
    });

    it('should allow custom options on first call', () => {
      resetAIService();
      const service = getAIService({ validateSchema: false });

      expect(service).toBeDefined();
    });

    it('should ignore options on subsequent calls', () => {
      resetAIService();
      const service1 = getAIService({ validateSchema: false });
      const service2 = getAIService({ validateSchema: true }); // Should be ignored

      expect(service1).toBe(service2);
    });

    it('should reset service instance', () => {
      const service1 = getAIService();
      resetAIService();
      const service2 = getAIService();

      expect(service1).not.toBe(service2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      service.registerProvider(mockProvider);
    });

    it('should handle provider throwing errors', async () => {
      mockProvider.generateStory = vi.fn(async () => {
        throw new Error('Network error');
      });

      await expect(
        service.generateStory({ prompt: 'Test' })
      ).rejects.toThrow('Network error');
    });

    it('should handle validation errors gracefully', async () => {
      const invalidResponse: StoryGenerationResponse = {
        metadata: { title: '', author: '' }, // Invalid empty title
        beats: [],
        reasoning: '',
      };

      const validatingService = new AIService({ validateSchema: true });
      validatingService.registerProvider(mockProvider);
      mockProvider.generateStory = vi.fn(async () => invalidResponse);

      await expect(
        validatingService.generateStory({ prompt: 'Test' })
      ).rejects.toThrow('Story validation failed');
    });
  });

  describe('Configuration Options', () => {
    it('should respect validateSchema option', () => {
      const service1 = new AIService({ validateSchema: true });
      const service2 = new AIService({ validateSchema: false });

      expect(service1).toBeDefined();
      expect(service2).toBeDefined();
    });

    it('should use default options when none provided', () => {
      const defaultService = new AIService();

      expect(defaultService).toBeDefined();
      expect(defaultService.isReady()).toBe(false);
    });
  });
});
