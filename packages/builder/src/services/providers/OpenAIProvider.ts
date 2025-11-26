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
  private useJsonFormat: boolean = true;
  private useProxy: boolean = false;
  private proxyEndpoint: string = 'http://localhost:3001/api/ai/openai';

  /**
   * Configure the provider
   */
  configure(config: AIProviderConfig): void {
    super.configure(config);

    if (this._isReady) {
      // Use proxy for custom base URLs to avoid CORS issues
      this.useProxy = !!config.baseUrl;

      if (!this.useProxy) {
        // Official OpenAI API - use SDK directly
        this.client = new OpenAI({
          apiKey: config.apiKey,
          dangerouslyAllowBrowser: true,
        });
      }

      this.model = config.model || 'gpt-4-turbo-preview';

      // Disable response_format for third-party providers that may not support it
      // (e.g., Moonshot, DeepSeek, etc.)
      this.useJsonFormat = !config.baseUrl;

      console.log(`[OpenAIProvider] Configured with model: ${this.model}${config.baseUrl ? ` using proxy for baseURL: ${config.baseUrl}` : ' (direct API)'}`);
    }
  }

  /**
   * Make request via proxy for custom baseUrls (to avoid CORS)
   */
  private async makeProxyRequest(requestBody: any): Promise<any> {
    const response = await fetch(this.proxyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: this.config?.baseUrl,
        apiKey: this.config?.apiKey,
        ...requestBody,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Handle different error response formats from various providers
      const errorMessage =
        errorData.error?.message ||  // OpenAI/Moonshot format: {"error":{"message":"..."}}
        errorData.message ||         // Simple format: {"message":"..."}
        errorData.error ||           // String format: {"error":"..."}
        JSON.stringify(errorData) || // Fallback: stringify the whole thing
        'Proxy request failed';
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    return response.json();
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
      const requestBody = {
        model: this.model,
        max_tokens: 8000,
        temperature: this.config?.temperature || 0.7,
        ...(this.useJsonFormat && { response_format: { type: 'json_object' as const } }),
        messages: [
          {
            role: 'system' as const,
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      let response;

      if (this.useProxy) {
        // Use proxy for custom providers (Moonshot, DeepSeek, etc.)
        response = await this.makeProxyRequest(requestBody);
      } else {
        // Direct API call for official OpenAI
        response = await this.client!.chat.completions.create(requestBody);
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Extract JSON from response (handles both raw JSON and markdown-wrapped JSON)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from response');
      }

      const storyData = JSON.parse(jsonMatch[0]);

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
      const requestBody = {
        model: this.model,
        max_tokens: 4000,
        temperature: this.config?.temperature || 0.7,
        ...(this.useJsonFormat && { response_format: { type: 'json_object' as const } }),
        messages: [
          {
            role: 'system' as const,
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      let response;

      if (this.useProxy) {
        response = await this.makeProxyRequest(requestBody);
      } else {
        response = await this.client!.chat.completions.create(requestBody);
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Extract JSON from response (handles both raw JSON and markdown-wrapped JSON)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from response');
      }

      const dialogData = JSON.parse(jsonMatch[0]);

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
      const requestBody = {
        model: this.model,
        max_tokens: 3000,
        temperature: this.config?.temperature || 0.6,
        ...(this.useJsonFormat && { response_format: { type: 'json_object' as const } }),
        messages: [
          {
            role: 'system' as const,
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      let response;

      if (this.useProxy) {
        response = await this.makeProxyRequest(requestBody);
      } else {
        response = await this.client!.chat.completions.create(requestBody);
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Extract JSON from response (handles both raw JSON and markdown-wrapped JSON)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from response');
      }

      const suggestions = JSON.parse(jsonMatch[0]);

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
      const requestBody = {
        model: this.model,
        max_tokens: 2000,
        temperature: this.config?.temperature || 0.7,
        ...(this.useJsonFormat && { response_format: { type: 'json_object' as const } }),
        messages: [
          {
            role: 'system' as const,
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      let response;

      if (this.useProxy) {
        response = await this.makeProxyRequest(requestBody);
      } else {
        response = await this.client!.chat.completions.create(requestBody);
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Extract JSON from response (handles both raw JSON and markdown-wrapped JSON)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from response');
      }

      const beatData = JSON.parse(jsonMatch[0]);

      console.log('[OpenAIProvider] Beat created:', beatData.beat.type);

      return beatData as NaturalLanguageBeatResponse;
    });
  }
}
