/**
 * Claude AI Provider
 *
 * Implementation using Anthropic's Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
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
 * Claude Provider Implementation
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude';
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-20250514';
  private useProxy: boolean = false;
  // Prefer same-origin proxy (Vite dev server plugin) over cross-origin port 3001
  private proxyEndpoint: string = typeof window !== 'undefined' && window.location?.port === '5173'
    ? '/api/ai/claude'
    : 'http://localhost:3001/api/ai/claude';

  /**
   * Configure the provider
   */
  configure(config: AIProviderConfig): void {
    super.configure(config);

    if (this._isReady) {
      // If custom baseUrl is provided, use proxy to avoid CORS
      this.useProxy = !!config.baseUrl;

      if (!this.useProxy) {
        // Official Anthropic API - use SDK directly with CORS enabled
        this.client = new Anthropic({
          apiKey: config.apiKey,
          dangerouslyAllowBrowser: true,
        });
      }

      this.model = config.model || 'claude-sonnet-4-20250514';

      console.log(`[ClaudeProvider] Configured with model: ${this.model}${config.baseUrl ? ` using proxy for baseURL: ${config.baseUrl}` : ' (direct API)'}`);
    }
  }

  /**
   * Map reasoningEffort to a Claude extended-thinking budget_tokens value.
   * Returns undefined when thinking should NOT be enabled (unset, 'none', or
   * when pointed at a custom baseUrl — most Claude-compatible proxies don't
   * support the thinking parameter).
   */
  private getThinkingBudget(): number | undefined {
    if (this.useProxy) return undefined;
    const effort = this.config?.reasoningEffort;
    if (!effort || effort === 'none') return undefined;
    switch (effort) {
      case 'minimal': return 1024;
      case 'low':     return 4000;
      case 'medium':  return 10000;
      case 'high':    return 20000;
      case 'xhigh':   return 32000;
      default:        return undefined;
    }
  }

  /**
   * Attempt to repair malformed or truncated JSON
   * Handles:
   * - Missing quotes in property names (e.g., "description: → "description":)
   * - Truncated strings and values
   * - Unclosed brackets and braces
   */
  private repairTruncatedJson(json: string): string {
    let repaired = json.trim();

    // Fix 1: Fix malformed property names (missing closing quote before colon)
    // Pattern: "propertyName: " → "propertyName": "
    // This handles cases where Kimi outputs "description: "value" instead of "description": "value"
    repaired = repaired.replace(/"([^"]+):\s*"/g, '"$1": "');

    // Fix 2: Fix missing quotes around property names entirely
    // Pattern: propertyName: → "propertyName":
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Fix 3: Remove trailing incomplete property/value
    // Find and remove incomplete content after last complete value
    // Look for patterns like: ,"incomplete  or  : "incomplete string without closing
    const lastCompleteMatch = repaired.match(
      /^([\s\S]*(?:"[^"]*"\s*:\s*(?:"[^"]*"|true|false|null|-?\d+(?:\.\d+)?|\{[\s\S]*?\}|\[[\s\S]*?\]))\s*,?\s*)(?:"[^"]*"?\s*:?\s*"?[^"}\]]*)?$/
    );
    if (lastCompleteMatch && lastCompleteMatch[1]) {
      repaired = lastCompleteMatch[1];
    }

    // Fix 4: Remove trailing incomplete string value
    // If we end with an unclosed string, try to close or remove it
    const unclosedStringMatch = repaired.match(/^([\s\S]*"[^"]*"\s*:\s*)"[^"]*$/);
    if (unclosedStringMatch) {
      // Remove the incomplete string value and its property
      repaired = unclosedStringMatch[1].replace(/,\s*$/, '');
    }

    // Fix 5: Count and close brackets/braces
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (const char of repaired) {
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
        continue;
      }
      if (inString) continue;

      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }

    // Remove trailing comma if present
    repaired = repaired.replace(/,\s*$/, '');

    // Add closing brackets and braces
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }

    return repaired;
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
      // Body may be JSON (Anthropic error) or plaintext (gateway / CDN error
      // like Envoy "upstream connect error..."). Tolerate both.
      const rawText = await response.text();
      let message: string;
      try {
        const error = JSON.parse(rawText);
        message = error.message || error.error?.message || error.error || 'Proxy request failed';
      } catch {
        message = rawText.trim().slice(0, 300) || 'Proxy request failed';
      }
      throw new Error(`${response.status}: ${message}`);
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

    // Build enhanced prompts with deep beat type understanding.
    // affectDepth ('auto' / 'sparse' / 'standard' / 'rich') gates how
    // much of the rich-character / affect system the AI deploys.
    const systemPrompt = buildEnhancedStoryGenerationSystemPrompt(
      schema,
      request.affectDepth ?? 'auto',
    );
    const userPrompt = buildEnhancedUserPrompt(request);

    console.log('[ClaudeProvider] Generating story with Claude (affectDepth='
      + (request.affectDepth ?? 'auto') + ')...');

    return this.withRetry(async () => {
      // Use configured maxTokens if available
      // For story generation, we need high token limits for complex branching narratives
      // Kimi K2 supports 256K context, Claude supports 200K+
      const defaultMaxTokens = 32000;
      const maxTokens = this.config?.maxTokens || defaultMaxTokens;
      const thinkingBudget = this.getThinkingBudget();

      const requestBody: any = {
        model: this.model,
        max_tokens: maxTokens,
        // Extended thinking requires temperature=1.0; regular calls use the configured value.
        temperature: thinkingBudget ? 1.0 : (this.config?.temperature || 0.7),
        system: systemPrompt,
        messages: [
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      if (thinkingBudget) {
        requestBody.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
        console.log(`[ClaudeProvider] Extended thinking enabled, budget=${thinkingBudget}`);
      }

      let response;

      if (this.useProxy) {
        // Use proxy for custom providers
        response = await this.makeProxyRequest(requestBody);
      } else {
        // Direct API call for official Anthropic
        const apiResponse = await this.client!.messages.create(requestBody as any);
        response = { content: apiResponse.content };
      }

      // Extract and parse JSON response. With extended thinking enabled, the
      // response may contain a leading `thinking` block before the `text` block.
      const content = (response.content as Array<{ type: string; text?: string }>)
        .find(c => c.type === 'text');
      if (!content || typeof content.text !== 'string') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ClaudeProvider] Raw response:', content.text.substring(0, 500));
        throw new Error('Could not extract JSON from Claude response');
      }

      let storyData;
      try {
        storyData = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // Log the problematic part of the JSON for debugging
        const errorPos = parseError instanceof SyntaxError ?
          parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0') : 0;
        const start = Math.max(0, errorPos - 100);
        const end = Math.min(jsonMatch[0].length, errorPos + 100);
        console.error('[ClaudeProvider] JSON parse error near position', errorPos);
        console.error('[ClaudeProvider] Context:', jsonMatch[0].substring(start, end));
        console.error('[ClaudeProvider] Full response length:', jsonMatch[0].length);

        // Try to repair truncated JSON by closing open brackets
        console.log('[ClaudeProvider] Attempting to repair truncated JSON...');
        const repaired = this.repairTruncatedJson(jsonMatch[0]);
        try {
          storyData = JSON.parse(repaired);
          console.log('[ClaudeProvider] JSON repair successful!');
        } catch (repairError) {
          throw new Error(`Failed to parse AI response (truncated): The response was cut off. Try generating a shorter story.`);
        }
      }

      console.log('[ClaudeProvider] Story generated:', storyData.metadata?.title);

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

    console.log('[ClaudeProvider] Generating dialog with Claude...');

    return this.withRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 4000,
        temperature: this.config?.temperature || 0.7,
        system: systemPrompt,
        messages: [
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
        const apiResponse = await this.client!.messages.create(requestBody as any);
        response = { content: apiResponse.content };
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }

      const dialogData = JSON.parse(jsonMatch[0]);

      console.log('[ClaudeProvider] Dialog generated');

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

    console.log('[ClaudeProvider] Generating beat suggestions with Claude...');

    return this.withRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 3000,
        temperature: this.config?.temperature || 0.6,
        system: systemPrompt,
        messages: [
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
        const apiResponse = await this.client!.messages.create(requestBody as any);
        response = { content: apiResponse.content };
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }

      const suggestions = JSON.parse(jsonMatch[0]);

      console.log('[ClaudeProvider] Generated', suggestions.suggestions?.length || 0, 'suggestions');

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

    console.log('[ClaudeProvider] Creating beat from natural language with Claude...');

    return this.withRetry(async () => {
      const requestBody = {
        model: this.model,
        max_tokens: 2000,
        temperature: this.config?.temperature || 0.7,
        system: systemPrompt,
        messages: [
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
        const apiResponse = await this.client!.messages.create(requestBody as any);
        response = { content: apiResponse.content };
      }

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }

      const beatData = JSON.parse(jsonMatch[0]);

      console.log('[ClaudeProvider] Beat created:', beatData.beat.type);

      return beatData as NaturalLanguageBeatResponse;
    });
  }

  /**
   * Generate a single conversation turn for AIConversationBeat
   */
  async generateConversationTurn(request: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  }): Promise<{ text: string }> {
    this.ensureReady();

    // Convert messages to Claude format (user/assistant only, system goes to system field)
    const claudeMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const requestBody = {
      model: this.model,
      max_tokens: 1000,
      temperature: this.config?.temperature ?? 0.8,
      system: request.systemPrompt,
      messages: claudeMessages,
    };

    let response;
    if (this.useProxy) {
      response = await this.makeProxyRequest(requestBody);
    } else {
      const apiResponse = await this.client!.messages.create(requestBody as any);
      response = { content: apiResponse.content };
    }

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    return { text: content.text.trim() };
  }
}
