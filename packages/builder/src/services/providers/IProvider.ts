/**
 * AI Provider Base Class
 *
 * Abstract base class that all AI providers must extend
 */

import type {
  IAIProvider,
  AIProviderConfig,
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse
} from '../../types/ai';

/**
 * Base AI Provider
 *
 * Provides common functionality and enforces interface
 */
export abstract class BaseAIProvider implements IAIProvider {
  protected config: AIProviderConfig | null = null;
  protected _isReady: boolean = false;

  /**
   * Provider name (must be implemented by subclass)
   */
  abstract readonly name: string;

  /**
   * Configure the provider
   */
  configure(config: AIProviderConfig): void {
    this.config = config;
    this._isReady = this.validateConfig(config);

    if (this._isReady) {
      console.log(`[${this.name}] Provider configured successfully`);
    } else {
      console.warn(`[${this.name}] Provider configuration incomplete`);
    }
  }

  /**
   * Check if provider is ready
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Validate provider configuration
   */
  protected validateConfig(config: AIProviderConfig): boolean {
    if (!config.apiKey || config.apiKey.trim() === '') {
      console.error(`[${this.name}] API key is required`);
      return false;
    }

    if (!config.provider) {
      console.error(`[${this.name}] Provider type must be specified`);
      return false;
    }

    return true;
  }

  /**
   * Ensure provider is ready before making requests
   */
  protected ensureReady(): void {
    if (!this.isReady()) {
      throw new Error(`${this.name} provider is not configured. Call configure() first.`);
    }
  }

  /**
   * Generate complete story
   */
  abstract generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResponse>;

  /**
   * Generate dialog tree
   */
  abstract generateDialog(request: DialogGenerationRequest): Promise<DialogGenerationResponse>;

  /**
   * Suggest next beats
   */
  abstract suggestBeats(request: BeatSuggestionRequest): Promise<BeatSuggestionResponse>;

  /**
   * Create beat from natural language
   */
  abstract createBeatFromNL(request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse>;

  /**
   * Handle API errors with retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${this.name}] Attempt ${attempt + 1} failed:`, error);

        // Don't retry on authentication errors
        if (error instanceof Error && error.message.includes('401')) {
          throw error;
        }

        // Providers flag deterministic failures (e.g. a content refusal —
        // replaying the identical prompt cannot succeed) so we surface them
        // immediately instead of burning two more multi-minute attempts.
        if (error instanceof Error && (error as Error & { nonRetryable?: boolean }).nonRetryable) {
          throw error;
        }

        // Don't retry when the user cancelled. AbortError comes through fetch
        // when the signal fires; rethrow immediately so the caller can show
        // "cancelled" instead of waiting two more 10-minute retries.
        if (error instanceof Error && (error.name === 'AbortError' || /aborted|cancel/i.test(error.message))) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Format system prompt with schema context
   */
  protected formatSystemPrompt(beatSchema: any): string {
    return `You are an AI assistant helping to create interactive stories in the ASAPS format.

You have access to the following beat types and their parameters:
${JSON.stringify(beatSchema, null, 2)}

When generating content:
1. Always use valid beat types from the schema
2. Include all required parameters
3. Use proper connection structures
4. Consider story flow and user experience
5. Generate unique IDs for elements
6. Provide clear, engaging content

Respond with valid JSON structures that match the expected format.`;
  }
}
