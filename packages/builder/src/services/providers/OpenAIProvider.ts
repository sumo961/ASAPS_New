/**
 * OpenAI Provider
 *
 * Implementation using OpenAI's GPT API
 */

import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
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
import { requiresMaxCompletionTokens, isReasoningModel } from './openai-utils';

/**
 * OpenAI Provider Implementation
 */
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;
  private model: string = 'gpt-5.1';
  private useJsonFormat: boolean = true;
  private useProxy: boolean = false;
  private proxyEndpoint: string = 'http://localhost:3001/api/ai/openai';

  /**
   * Check if a URL is a localhost address (no CORS issues, no proxy needed)
   */
  private isLocalhostUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'localhost' ||
             parsed.hostname === '127.0.0.1' ||
             parsed.hostname.startsWith('192.168.') ||
             parsed.hostname.startsWith('10.');
    } catch {
      return false;
    }
  }

  /**
   * Configure the provider
   */
  configure(config: AIProviderConfig): void {
    super.configure(config);

    if (this._isReady) {
      // Use proxy for all remote URLs (to avoid CORS issues in browser/Electron)
      // Skip proxy only for localhost/local network - direct connection is faster
      const isLocalUrl = config.baseUrl && this.isLocalhostUrl(config.baseUrl);
      // Use proxy unless it's a local URL (default OpenAI and remote URLs need proxy)
      this.useProxy = !isLocalUrl;

      if (!this.useProxy) {
        // Direct connection - local server only (Ollama, etc.)
        this.client = new OpenAI({
          apiKey: config.apiKey || 'not-needed-for-local', // Ollama doesn't require API key
          baseURL: config.baseUrl,
          dangerouslyAllowBrowser: true,
        });
      }

      this.model = config.model || 'gpt-5.1';

      // Disable response_format for third-party providers that may not support it
      // (e.g., Moonshot, DeepSeek, local Ollama, etc.)
      this.useJsonFormat = !config.baseUrl;

      const connectionType = isLocalUrl ? `direct local: ${config.baseUrl}` :
                            `proxy for: ${config.baseUrl || 'api.openai.com'}`;
      console.log(`[OpenAIProvider] Configured with model: ${this.model} (${connectionType})`);
    }
  }

  /**
   * Make request via proxy for custom baseUrls (to avoid CORS)
   */
  private async makeProxyRequest(requestBody: any): Promise<any> {
    console.log('[OpenAIProvider] makeProxyRequest called, endpoint:', this.proxyEndpoint);
    console.log('[OpenAIProvider] baseUrl:', this.config?.baseUrl || '(none - using default)');
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
   * Build a chat completion request body with modern model support
   * Uses shared utilities for model detection (requiresMaxCompletionTokens, isReasoningModel)
   */
  private buildChatRequest(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    defaultMaxTokens: number,
    fallbackTemperature: number
  ): ChatCompletionCreateParamsNonStreaming & Record<string, any> {
    const reasoningEffort = this.config?.reasoningEffort;
    const maxTokens = this.config?.maxTokens ?? defaultMaxTokens;

    const requestBody: ChatCompletionCreateParamsNonStreaming & Record<string, any> = {
      model: this.model,
      messages,
    };

    // Use shared utility to determine correct token parameter
    if (requiresMaxCompletionTokens(this.model) || !!reasoningEffort) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }

    if (this.useJsonFormat) {
      requestBody.response_format = { type: 'json_object' };
    }

    if (reasoningEffort !== undefined) {
      // SDK types may lag newest GPT-5 levels (minimal, xhigh); cast to allow them.
      requestBody.reasoning_effort = reasoningEffort as any;
    }

    // Use shared utility to check if model supports temperature
    if (!isReasoningModel(this.model, reasoningEffort)) {
      requestBody.temperature = this.config?.temperature ?? fallbackTemperature;
    }

    return requestBody;
  }

  /**
   * Try to repair truncated JSON by closing open brackets/braces
   */
  private tryRepairJson(json: string): string | null {
    // Count open brackets/braces and track string state
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;
    let lastStructuralIndex = 0; // Track last valid structural position

    for (let i = 0; i < json.length; i++) {
      const char = json[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        if (!inString) {
          lastStructuralIndex = i;
        }
        continue;
      }
      if (inString) continue;

      if (char === '{') { openBraces++; lastStructuralIndex = i; }
      else if (char === '}') { openBraces--; lastStructuralIndex = i; }
      else if (char === '[') { openBrackets++; lastStructuralIndex = i; }
      else if (char === ']') { openBrackets--; lastStructuralIndex = i; }
      else if (char === ',' || char === ':') { lastStructuralIndex = i; }
    }

    let repaired = json;

    // If we're in a string, try to find a good truncation point
    if (inString) {
      // Find the last complete property value by looking for patterns like: "key": "value
      // Truncate at the last complete value if possible
      const lastCompleteMatch = json.match(/^([\s\S]*"[^"]*":\s*(?:"[^"]*"|[\d.]+|true|false|null|\{[\s\S]*?\}|\[[\s\S]*?\]))\s*,?\s*"[^"]*$/);
      if (lastCompleteMatch) {
        repaired = lastCompleteMatch[1];
        // Recount after truncation
        inString = false;
        openBraces = 0;
        openBrackets = 0;
        for (const char of repaired) {
          if (escape) { escape = false; continue; }
          if (char === '\\') { escape = true; continue; }
          if (char === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      } else {
        // Simple fix: close the string
        repaired += '"';
        inString = false;
      }
    }

    // Remove trailing incomplete properties (e.g., "key":  or "key": "incomplete)
    repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
    repaired = repaired.replace(/,\s*$/, '');

    // Close open brackets/braces in correct order
    // We need to close in reverse order of opening (last opened = first closed)
    for (let i = 0; i < openBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < openBraces; i++) {
      repaired += '}';
    }

    console.log(`[OpenAIProvider] JSON repair: closed ${openBrackets} brackets, ${openBraces} braces`);
    return repaired;
  }

  /**
   * Convert object-style beats to array-style
   * Some models return: { "beats": { "beat_0": {...}, "beat_1": {...} } }
   * We need: { "beats": [{ "id": "beat_0", ... }, { "id": "beat_1", ... }] }
   */
  private normalizeBeatsFormat(data: any): void {
    if (data.beats && typeof data.beats === 'object' && !Array.isArray(data.beats)) {
      console.log('[OpenAIProvider] Converting object-style beats to array format...');
      const beatsObj = data.beats;
      const beatsArray = [];

      for (const [key, beat] of Object.entries(beatsObj)) {
        if (beat && typeof beat === 'object') {
          beatsArray.push({
            id: key,
            name: (beat as any).name || (beat as any).description?.substring(0, 50) || key,
            ...(beat as any),
          });
        }
      }

      data.beats = beatsArray;
    }
  }

  /**
   * Clean up redundant/invalid parameters that some models add despite prompts
   * This prevents validation warnings for known problematic patterns
   */
  private cleanupBeatParameters(data: any): void {
    if (!data.beats || !Array.isArray(data.beats)) {
      console.log('[OpenAIProvider] cleanupBeatParameters: No beats array found');
      return;
    }

    // Beat types that should NOT have a "connection" parameter
    // (they define targets in their choices/props/hyperlinks instead)
    const multiConnectionTypes = new Set([
      'movementChoice',
      'pickProp',
      'dialogTree',
      'hyperText',
      'conditionBeat'
    ]);

    // Flat conditionBeat parameters that should be removed
    // (the correct format uses nested condition/trueConnection/falseConnection)
    const forbiddenConditionParams = new Set([
      'conditionType',
      'variableName',
      'operator',
      'value',
      'trueTarget',
      'falseTarget'
    ]);

    let cleanupCount = 0;
    const cleanupDetails: string[] = [];

    console.log(`[OpenAIProvider] cleanupBeatParameters: Processing ${data.beats.length} beats`);

    for (const beat of data.beats) {
      if (!beat.parameters) {
        console.log(`[OpenAIProvider] Beat ${beat.id} has no parameters, skipping`);
        continue;
      }

      // Debug: log beat type check for multi-connection types
      const isMultiConn = multiConnectionTypes.has(beat.type);
      const hasConn = 'connection' in beat.parameters;
      if (isMultiConn || hasConn) {
        console.log(`[OpenAIProvider] Beat ${beat.id} (${beat.type}): isMultiConn=${isMultiConn}, hasConnection=${hasConn}`);
      }

      // Remove "connection" from multi-connection beat types
      if (isMultiConn && hasConn) {
        delete beat.parameters.connection;
        cleanupCount++;
        cleanupDetails.push(`${beat.id}: removed 'connection' from ${beat.type}`);
      }

      // Remove flat conditionBeat parameters if nested format exists
      if (beat.type === 'conditionBeat' && beat.parameters.condition) {
        for (const param of forbiddenConditionParams) {
          if (param in beat.parameters) {
            delete beat.parameters[param];
            cleanupCount++;
            cleanupDetails.push(`${beat.id}: removed '${param}' from conditionBeat`);
          }
        }
      }

      // Remove non-schema parameters from titleScreen
      if (beat.type === 'titleScreen') {
        const allowedTitleParams = new Set(['title', 'author', 'connection']);
        for (const key of Object.keys(beat.parameters)) {
          if (!allowedTitleParams.has(key)) {
            delete beat.parameters[key];
            cleanupCount++;
            cleanupDetails.push(`${beat.id}: removed '${key}' from titleScreen`);
          }
        }
      }
    }

    if (cleanupCount > 0) {
      console.log(`[OpenAIProvider] Cleaned up ${cleanupCount} redundant parameters from AI response:`);
      cleanupDetails.forEach(detail => console.log(`  - ${detail}`));
    } else {
      console.log('[OpenAIProvider] No redundant parameters to clean up');
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
      // GPT-5 reasoning models need much higher max_completion_tokens because reasoning tokens
      // are counted within this limit. 8000 tokens can be entirely consumed by reasoning,
      // leaving nothing for actual output. Use 32000 to allow room for both.
      const isGPT5 = this.model.startsWith('gpt-5');
      const isCustomEndpoint = !!this.config?.baseUrl;
      const defaultMaxTokens = isGPT5 ? 32000 : (isCustomEndpoint ? 16000 : 8000);

      const requestBody = this.buildChatRequest(
        [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        defaultMaxTokens,
        0.7
      );

      let response;

      console.log('[OpenAIProvider] generateStory useProxy:', this.useProxy);
      if (this.useProxy) {
        // Use proxy for all non-local endpoints (including default OpenAI)
        response = await this.makeProxyRequest(requestBody);
      } else {
        // Direct API call only for local servers (Ollama, etc.)
        response = await this.client!.chat.completions.create(requestBody);
      }

      console.log('[OpenAIProvider] Response received:', JSON.stringify(response).substring(0, 500));
      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('[OpenAIProvider] No content in response. Full response:', JSON.stringify(response));
        throw new Error('No response from OpenAI');
      }

      // Extract JSON from response (handles both raw JSON and markdown-wrapped JSON)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[OpenAIProvider] No JSON found in response. Raw content:', content.substring(0, 500));
        throw new Error('Could not extract JSON from response. The AI may have returned plain text instead of JSON.');
      }

      let storyData;
      let jsonString = jsonMatch[0];

      try {
        storyData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('[OpenAIProvider] JSON parse error:', parseError);
        console.error('[OpenAIProvider] Attempted to parse:', jsonString.substring(0, 500));

        // Try to repair truncated JSON by closing open brackets/braces
        const repaired = this.tryRepairJson(jsonString);
        if (repaired) {
          try {
            storyData = JSON.parse(repaired);
            console.log('[OpenAIProvider] Successfully repaired truncated JSON');
          } catch {
            throw new Error(`Invalid JSON in response (repair failed): ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. The model may have hit token limits.`);
          }
        } else {
          throw new Error(`Invalid JSON in response: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. The model may have hit token limits - try a simpler prompt or increase max tokens.`);
        }
      }

      // Validate the response structure
      if (!storyData || typeof storyData !== 'object') {
        console.error('[OpenAIProvider] Response is not an object:', typeof storyData);
        throw new Error('AI response is not a valid JSON object');
      }

      // Try to normalize alternate response formats from local models
      // Some models wrap the response in "story", "narrative", or similar
      if (!storyData.metadata) {
        const wrapperKeys = ['story', 'narrative', 'response', 'result', 'data'];
        for (const key of wrapperKeys) {
          if (storyData[key] && typeof storyData[key] === 'object' && storyData[key].metadata) {
            console.log(`[OpenAIProvider] Found response wrapped in "${key}", unwrapping...`);
            storyData = storyData[key];
            break;
          }
        }
      }

      // Try to construct metadata from top-level fields if still missing
      if (!storyData.metadata && storyData.title) {
        console.log('[OpenAIProvider] Constructing metadata from top-level fields...');
        storyData.metadata = {
          title: storyData.title,
          description: storyData.description || storyData.summary || '',
          author: storyData.author || 'AI Generated',
          tags: storyData.tags || storyData.genres || [],
        };
      }

      if (!storyData.metadata) {
        const keys = Object.keys(storyData);
        console.error('[OpenAIProvider] Missing metadata in response. Got keys:', keys);
        throw new Error(`AI response is missing required "metadata" field. Got keys: [${keys.join(', ')}]. Try a more capable model (e.g., llama3:70b, mixtral, qwen2.5:32b).`);
      }

      if (!storyData.metadata.title) {
        console.error('[OpenAIProvider] Missing title in metadata:', storyData.metadata);
        throw new Error('AI response is missing required "metadata.title" field.');
      }

      // Normalize object-style beats to array format
      // Some models return: { "beats": { "beat_0": {...}, "beat_1": {...} } }
      this.normalizeBeatsFormat(storyData);

      // Try to find beats array under alternate names
      if (!storyData.beats || !Array.isArray(storyData.beats)) {
        const beatsAltNames = ['scenes', 'events', 'nodes', 'steps', 'segments'];
        for (const altName of beatsAltNames) {
          // Check for array format
          if (Array.isArray(storyData[altName])) {
            console.log(`[OpenAIProvider] Found beats array as "${altName}", renaming...`);
            storyData.beats = storyData[altName];
            break;
          }
          // Check for object format under alternate name
          if (storyData[altName] && typeof storyData[altName] === 'object' && !Array.isArray(storyData[altName])) {
            console.log(`[OpenAIProvider] Found beats object as "${altName}", converting...`);
            storyData.beats = storyData[altName];
            this.normalizeBeatsFormat(storyData);
            break;
          }
        }
      }

      if (!storyData.beats || !Array.isArray(storyData.beats)) {
        const beatsType = storyData.beats ? (Array.isArray(storyData.beats) ? 'array' : typeof storyData.beats) : 'undefined';
        console.error('[OpenAIProvider] Missing or invalid beats array. Got:', beatsType);
        throw new Error(`AI response is missing required "beats" array (got ${beatsType}). Try a more capable model.`);
      }

      // Clean up redundant parameters that models often add despite prompts
      this.cleanupBeatParameters(storyData);

      console.log('[OpenAIProvider] Story generated:', storyData.metadata.title, `(${storyData.beats.length} beats)`);

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
      const requestBody = this.buildChatRequest(
        [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        4000,
        0.7
      );

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
      const requestBody = this.buildChatRequest(
        [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        3000,
        0.6
      );

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
      const requestBody = this.buildChatRequest(
        [
          {
            role: 'system',
            content: systemPrompt + '\n\nRespond with valid JSON only.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        2000,
        0.7
      );

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
