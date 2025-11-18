/**
 * AI Service
 *
 * Main service for AI-assisted story creation
 * Coordinates providers, validation, and error handling
 */

import type {
  IAIProvider,
  AIServiceOptions,
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse
} from '../types/ai';
import { getAIValidator } from './AIValidator';

/**
 * AI Service
 *
 * Singleton service for AI operations
 */
export class AIService {
  private providers: Map<string, IAIProvider> = new Map();
  private currentProvider: IAIProvider | null = null;
  private options: AIServiceOptions;
  private validator = getAIValidator();

  constructor(options: AIServiceOptions = {}) {
    this.options = {
      validateSchema: true,
      retryOnError: true,
      maxRetries: 3,
      ...options
    };
  }

  /**
   * Register an AI provider
   */
  registerProvider(provider: IAIProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[AIService] Registered provider: ${provider.name}`);

    // Set as current if no provider is set
    if (!this.currentProvider && provider.isReady()) {
      this.currentProvider = provider;
      console.log(`[AIService] Set ${provider.name} as current provider`);
    }
  }

  /**
   * Set active provider
   */
  setProvider(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not registered`);
    }

    if (!provider.isReady()) {
      throw new Error(`Provider '${providerName}' is not configured`);
    }

    this.currentProvider = provider;
    console.log(`[AIService] Switched to provider: ${providerName}`);
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): IAIProvider | null {
    return this.currentProvider;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.currentProvider !== null && this.currentProvider.isReady();
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Ensure service is ready
   */
  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('AI Service not ready. Configure a provider first.');
    }
  }

  /**
   * Generate complete story
   */
  async generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResponse> {
    this.ensureReady();

    console.log('[AIService] Generating story:', request.prompt);

    try {
      // Generate with current provider
      const response = await this.currentProvider!.generateStory(request);

      // Validate if enabled
      if (this.options.validateSchema) {
        const validation = await this.validator.validateStoryGeneration(response);

        if (!validation.valid) {
          console.error('[AIService] Story validation failed:', validation.errors);
          throw new Error(`Story validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[AIService] Story validation warnings:', validation.warnings);
        }
      }

      console.log('[AIService] Story generated successfully:', response.metadata.title);
      return response;

    } catch (error) {
      console.error('[AIService] Story generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate dialog tree
   */
  async generateDialog(request: DialogGenerationRequest): Promise<DialogGenerationResponse> {
    this.ensureReady();

    console.log('[AIService] Generating dialog for scene:', request.scene);

    try {
      const response = await this.currentProvider!.generateDialog(request);

      // Validate if enabled
      if (this.options.validateSchema) {
        const validation = await this.validator.validateDialogGeneration(response);

        if (!validation.valid) {
          console.error('[AIService] Dialog validation failed:', validation.errors);
          throw new Error(`Dialog validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[AIService] Dialog validation warnings:', validation.warnings);
        }
      }

      console.log('[AIService] Dialog generated successfully');
      return response;

    } catch (error) {
      console.error('[AIService] Dialog generation failed:', error);
      throw error;
    }
  }

  /**
   * Suggest next beats
   */
  async suggestBeats(request: BeatSuggestionRequest): Promise<BeatSuggestionResponse> {
    this.ensureReady();

    console.log('[AIService] Generating beat suggestions for:', request.currentBeat.name);

    try {
      const response = await this.currentProvider!.suggestBeats(request);

      // Basic validation - ensure suggestions are for valid beat types
      if (this.options.validateSchema) {
        const schema = this.validator.getSchema();
        if (schema) {
          response.suggestions = response.suggestions.filter(s => {
            if (!schema.beatTypes[s.beatType]) {
              console.warn(`[AIService] Filtered invalid beat type suggestion: ${s.beatType}`);
              return false;
            }
            return true;
          });
        }
      }

      console.log('[AIService] Generated', response.suggestions.length, 'beat suggestions');
      return response;

    } catch (error) {
      console.error('[AIService] Beat suggestion failed:', error);
      throw error;
    }
  }

  /**
   * Create beat from natural language
   */
  async createBeatFromNL(request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse> {
    this.ensureReady();

    console.log('[AIService] Creating beat from description:', request.description);

    try {
      const response = await this.currentProvider!.createBeatFromNL(request);

      // Validate generated beat
      if (this.options.validateSchema) {
        const validation = await this.validator.validateBeat(response.beat);

        if (!validation.valid) {
          console.error('[AIService] Beat validation failed:', validation.errors);
          throw new Error(`Beat validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        }

        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[AIService] Beat validation warnings:', validation.warnings);
        }
      }

      console.log('[AIService] Beat created:', response.beat.type, response.beat.name);
      return response;

    } catch (error) {
      console.error('[AIService] Natural language beat creation failed:', error);
      throw error;
    }
  }

  /**
   * Get validator instance
   */
  getValidator() {
    return this.validator;
  }

  /**
   * Get beat schema
   */
  async getBeatSchema(): Promise<any> {
    await this.validator.ensureSchemaLoaded();
    return this.validator.getSchema();
  }
}

/**
 * Singleton instance
 */
let serviceInstance: AIService | null = null;

/**
 * Get shared AI service instance
 */
export function getAIService(options?: AIServiceOptions): AIService {
  if (!serviceInstance) {
    serviceInstance = new AIService(options);
  }
  return serviceInstance;
}

/**
 * Reset service instance (mainly for testing)
 */
export function resetAIService(): void {
  serviceInstance = null;
}
