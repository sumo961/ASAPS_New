/**
 * OpenAI Provider
 *
 * Implementation using OpenAI's GPT API
 */

import OpenAI from 'openai';
import { BaseAIProvider } from './IProvider';
import type {
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse,
  AIProviderConfig
} from '../../types/ai';
import * as DialogPrompts from '../prompts/dialogGeneration';
import * as BeatSuggestionsPrompts from '../prompts/beatSuggestions';
import {
  buildEnhancedStoryGenerationSystemPrompt,
  buildEnhancedUserPrompt
} from '../prompts/storyGenerationEnhanced';
import { getAIValidator } from '../AIValidator';

/**
 * OpenAI Provider Implementation
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;
  private model: string = 'gpt-4-turbo-preview';

  /**
   * Configure the provider
   */
  configure(config: AIProviderConfig): void {
    super.configure(config);

    if (this._isReady) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true, // For browser usage
      });

      this.model = config.model || 'gpt-4-turbo-preview';

      console.log(`[OpenAIProvider] Configured with model: ${this.model}`);
    }
  }

  /**
   * Generate complete story
   */
  async generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResponse> {
    this.ensureReady();

    const validator = getAIValidator();
    await validator.ensureSchemaLoaded();
    const schema = validator.getSchema();

    // Build enhanced prompts with deep beat type understanding
    const systemPrompt = buildEnhancedStoryGenerationSystemPrompt(schema);
    const userPrompt = buildEnhancedUserPrompt(request);

    console.log('[OpenAIProvider] Generating story with GPT...');

    return this.withRetry(async () => {
      const response = await this.client!.chat.completions.create({
        model: this.model,
        max_tokens: 8000,
        temperature: this.config?.temperature || 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const storyData = JSON.parse(content);

      console.log('[OpenAIProvider] Story generated:', storyData.metadata.title);

      return storyData as StoryGenerationResponse;
    });
  }

  /**
   * Generate dialog tree
   */
  async generateDialog(request: DialogGenerationRequest): Promise<DialogGenerationResponse> {
    this.ensureReady();

    const systemPrompt = DialogPrompts.buildDialogGenerationSystemPrompt();
    const userPrompt = DialogPrompts.buildDialogGenerationUserPrompt(request);

    console.log('[OpenAIProvider] Generating dialog with GPT...');

    return this.withRetry(async () => {
      const response = await this.client!.chat.completions.create({
        model: this.model,
        max_tokens: 4000,
        temperature: this.config?.temperature || 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const dialogData = JSON.parse(content);

      console.log('[OpenAIProvider] Dialog generated');

      return dialogData as DialogGenerationResponse;
    });
  }

  /**
   * Suggest next beats
   */
  async suggestBeats(request: BeatSuggestionRequest): Promise<BeatSuggestionResponse> {
    this.ensureReady();

    const validator = getAIValidator();
    await validator.ensureSchemaLoaded();
    const schema = validator.getSchema();

    const systemPrompt = BeatSuggestionsPrompts.buildBeatSuggestionsSystemPrompt(schema);
    const userPrompt = BeatSuggestionsPrompts.buildBeatSuggestionsUserPrompt(request);

    console.log('[OpenAIProvider] Generating beat suggestions with GPT...');

    return this.withRetry(async () => {
      const response = await this.client!.chat.completions.create({
        model: this.model,
        max_tokens: 3000,
        temperature: this.config?.temperature || 0.6,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const suggestions = JSON.parse(content);

      console.log('[OpenAIProvider] Generated', suggestions.suggestions?.length || 0, 'suggestions');

      return suggestions as BeatSuggestionResponse;
    });
  }

  /**
   * Create beat from natural language
   */
  async createBeatFromNL(request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse> {
    this.ensureReady();

    const validator = getAIValidator();
    await validator.ensureSchemaLoaded();
    const schema = validator.getSchema();

    const systemPrompt = this.formatSystemPrompt(schema);
    const userPrompt = `Create a single beat from this description: "${request.description}"

${request.storyContext ? `
Story Context:
- Title: ${request.storyContext.title}
- Existing beats: ${request.storyContext.existingBeats.length}
` : ''}

Respond with JSON in this format:
{
  "beat": {
    "id": "beat_new",
    "name": "Descriptive name",
    "type": "appropriateBeatType",
    "position": { "x": ${request.storyContext?.currentPosition?.x || 400}, "y": ${request.storyContext?.currentPosition?.y || 200} },
    "parameters": { /* type-specific parameters */ },
    "connections": []
  },
  "interpretation": "How you interpreted the user's request"
}`;

    console.log('[OpenAIProvider] Creating beat from natural language with GPT...');

    return this.withRetry(async () => {
      const response = await this.client!.chat.completions.create({
        model: this.model,
        max_tokens: 2000,
        temperature: this.config?.temperature || 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const beatData = JSON.parse(content);

      console.log('[OpenAIProvider] Beat created:', beatData.beat.type);

      return beatData as NaturalLanguageBeatResponse;
    });
  }
}
