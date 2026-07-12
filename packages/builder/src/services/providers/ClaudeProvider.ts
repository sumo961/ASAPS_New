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
import {
  stripThinkingBlocks,
  extractJSON,
  repairJsonAggressive,
  parseJSONWithRepair,
} from './openai-utils';

/**
 * Claude Provider Implementation
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'claude';
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-6';
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

      this.model = config.model || 'claude-sonnet-4-6';

      console.log(`[ClaudeProvider] Configured with model: ${this.model}${config.baseUrl ? ` using proxy for baseURL: ${config.baseUrl}` : ' (direct API)'}`);
    }
  }

  /**
   * Map reasoningEffort to a Claude extended-thinking budget_tokens value.
   * Returns undefined when thinking should NOT be enabled (unset, 'none', or
   * when pointed at a custom baseUrl — most Claude-compatible proxies don't
   * support the thinking parameter).
   *
   * Used only for older Claude models that still accept the legacy
   * `thinking.type='enabled'` + `budget_tokens` shape. The X.6 generation
   * (Opus 4.6+, Sonnet 4.6+) requires the adaptive shape via
   * applyThinkingConfig(). Haiku has no adaptive variant.
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
      // 'max' is a Claude 4.5+ adaptive-mode tier; older 'enabled'-shape
      // models don't have a documented equivalent. Cap at xhigh so the
      // legacy path stays valid; the adaptive path passes 'max' through.
      case 'max':     return 32000;
      default:        return undefined;
    }
  }

  /**
   * Whether the current model uses the newer adaptive-thinking API shape
   * (thinking.type='adaptive' + output_config.effort) instead of the
   * legacy thinking.type='enabled' + budget_tokens shape.
   *
   * The newer shape is required by Opus 4.6+ and Sonnet 4.6+ (and any
   * Opus/Sonnet major >= 5). Opus/Sonnet 4.5-and-earlier and ALL Haiku
   * models still use the legacy shape. The API rejects mixing the two:
   * sending the legacy shape to an adaptive-only model returns 400 with
   * "thinking.type.enabled is not supported for this model".
   */
  private requiresAdaptiveThinking(): boolean {
    const m = this.model.toLowerCase();
    // Adaptive thinking (thinking.type='adaptive' + output_config.effort) is
    // supported only from the X.6 generation onward — Opus 4.6+, Sonnet 4.6+,
    // and any Opus/Sonnet major >= 5. Verified against the Anthropic API
    // reference. Two family-specific exclusions:
    //   - NO Haiku model supports it yet (Haiku 4.5 rejects the effort param).
    //   - Opus/Sonnet 4.5-and-earlier use the legacy enabled+budget_tokens
    //     shape, so the cutoff is minor >= 6, not >= 5.
    const match = m.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/);
    if (!match) return false;
    const [, family, majorStr, minorStr] = match;
    // A 3rd segment longer than 2 digits is a YYYYMMDD snapshot of the
    // original (undated) generation — e.g. claude-sonnet-4-20250514 — which
    // predates adaptive thinking and uses the legacy shape. Without this the
    // regex would read the date as the minor version (20250514 >= 6).
    if (minorStr.length > 2) return false;
    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    // Haiku has no adaptive variant below major 5.
    if (family === 'haiku') return major >= 5;
    // Opus / Sonnet: adaptive arrived with the X.6 generation.
    if (major >= 5) return true;
    if (major === 4 && minor >= 6) return true;
    return false;
  }

  /**
   * Translate the user's reasoningEffort to Anthropic's adaptive-mode
   * effort levels. Per platform.claude.com/docs/en/api/messages, valid
   * effort values are low | medium | high | xhigh | max. Our internal
   * dial has minimal/low/medium/high/xhigh — minimal collapses to
   * low; everything else is a direct passthrough.
   */
  private getAdaptiveEffort(): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined {
    if (this.useProxy) return undefined;
    const effort = this.config?.reasoningEffort;
    if (!effort || effort === 'none') return undefined;
    switch (effort) {
      case 'minimal':
      case 'low':     return 'low';
      case 'medium':  return 'medium';
      case 'high':    return 'high';
      case 'xhigh':   return 'xhigh';
      case 'max':     return 'max';
      default:        return undefined;
    }
  }

  /**
   * Apply the appropriate thinking-config shape to a request body based
   * on the model. Mutates requestBody in place. Logs which shape and
   * level got applied.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyThinkingConfig(requestBody: any): void {
    if (this.requiresAdaptiveThinking()) {
      const effort = this.getAdaptiveEffort();
      if (effort) {
        requestBody.thinking = { type: 'adaptive' };
        requestBody.output_config = { effort };
        console.log(`[ClaudeProvider] Adaptive thinking enabled, effort=${effort}`);
      }
    } else {
      const thinkingBudget = this.getThinkingBudget();
      if (thinkingBudget) {
        requestBody.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
        console.log(`[ClaudeProvider] Extended thinking enabled, budget=${thinkingBudget}`);
      }
    }
  }

  /**
   * Attempt to repair malformed or truncated JSON.
   *
   * Delegates to @asaps/core's shared repairJsonAggressive(), which is the
   * union of this provider's historical repair pass (quoted-key heuristic —
   * the Kimi `"description: "value"` case — plus truncation closing) and
   * OpenAIProvider's more complete one (control chars, comments, interior
   * quotes, single quotes, missing commas, spurious extra braces).
   */
  private repairTruncatedJson(json: string): string {
    return repairJsonAggressive(json);
  }

  /**
   * Make request via proxy for custom baseUrls (to avoid CORS)
   */
  private async makeProxyRequest(requestBody: any, signal?: AbortSignal): Promise<any> {
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
      signal,
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
      // Use configured maxTokens if available, else scale a default to the
      // requested reasoning effort.
      //
      // CRITICAL (per platform.claude.com/docs/en/api/messages): thinking
      // tokens COUNT AGAINST max_tokens. In adaptive mode there is no
      // separate thinking budget — Claude decides how much to think,
      // bounded only by max_tokens. So a 32K cap at xhigh effort can
      // burn 20K+ on thinking and leave too little for the JSON output,
      // resulting in mid-JSON truncation (observed: response truncated
      // at 10K → 30K → 42K chars across three retries with xhigh).
      //
      // Scale headroom by effort so a default install just works without
      // requiring users to manually bump Max Tokens.
      const defaultMaxTokensFor = (effort: string | undefined): number => {
        switch (effort) {
          case 'max':   return 128000; // max can match xhigh's reasoning span or exceed
          case 'xhigh': return 96000;  // xhigh thinking can eat 30-40K alone
          case 'high':  return 64000;
          case 'medium': return 48000;
          case 'low':
          case 'minimal':
          case 'none':
          default: return 32000;
        }
      };
      const defaultMaxTokens = defaultMaxTokensFor(this.config?.reasoningEffort);
      const maxTokens = this.config?.maxTokens || defaultMaxTokens;
      console.log(
        `[ClaudeProvider] generateStory max_tokens=${maxTokens} ` +
          `(default=${defaultMaxTokens}, configured=${this.config?.maxTokens ?? 'unset'}, ` +
          `effort=${this.config?.reasoningEffort ?? 'unset'})`,
      );

      // `temperature` is omitted: newer Anthropic models reject it as
      // deprecated, and extended thinking requires it to equal 1 or be
      // omitted anyway. The API default is fine for story generation.
      const requestBody: any = {
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ],
      };

      this.applyThinkingConfig(requestBody);

      let response;

      if (this.useProxy) {
        // Use proxy for custom providers; thread signal for cancel support.
        response = await this.makeProxyRequest(requestBody, request.signal);
      } else {
        // Direct API call for official Anthropic — STREAM the response.
        //
        // A non-streaming messages.create() holds the HTTP connection open
        // until the ENTIRE response is generated, so the SDK's fixed request
        // timeout (default 10 min) aborts long runs with
        // APIConnectionTimeoutError. A large max_tokens + adaptive thinking
        // (xhigh ⇒ 96K) routinely runs past that — thinking expands to fill
        // the budget. Streaming returns headers immediately and reads SSE
        // chunks as they arrive, so the initial-fetch timeout clears early
        // and the body streams for as long as generation takes.
        // .finalMessage() reassembles the complete Message.
        const stream = this.client!.messages.stream(requestBody as any, {
          signal: request.signal,
        });
        // Drive the UI progress indicator with the real cumulative char count.
        if (request.onProgress) {
          stream.on('text', (_delta: string, snapshot: string) => {
            request.onProgress!(snapshot.length);
          });
        }
        const apiResponse = await stream.finalMessage();
        response = { content: apiResponse.content };
      }

      // Extract and parse JSON response. With extended thinking enabled, the
      // response may contain a leading `thinking` block before the `text` block.
      const content = (response.content as Array<{ type: string; text?: string }>)
        .find(c => c.type === 'text');
      if (!content || typeof content.text !== 'string') {
        throw new Error('Unexpected response type from Claude');
      }

      // Shared tolerant extractor: fences, prose-wrapped JSON, brace matching.
      // Inline thinking tags are stripped first so a reasoning draft can't be
      // mistaken for the real payload.
      let jsonString: string;
      try {
        jsonString = extractJSON(stripThinkingBlocks(content.text));
      } catch {
        console.error('[ClaudeProvider] Raw response:', content.text.substring(0, 500));
        throw new Error('Could not extract JSON from Claude response');
      }

      let storyData;
      try {
        storyData = JSON.parse(jsonString);
      } catch (parseError) {
        // Log the problematic part of the JSON for debugging
        const errorPos = parseError instanceof SyntaxError ?
          parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0') : 0;
        const start = Math.max(0, errorPos - 100);
        const end = Math.min(jsonString.length, errorPos + 100);
        console.error('[ClaudeProvider] JSON parse error near position', errorPos);
        console.error('[ClaudeProvider] Context:', jsonString.substring(start, end));
        console.error('[ClaudeProvider] Full response length:', jsonString.length);

        // Try to repair truncated JSON via the shared escalating repair passes
        console.log('[ClaudeProvider] Attempting to repair truncated JSON...');
        try {
          storyData = parseJSONWithRepair(jsonString);
          console.log('[ClaudeProvider] JSON repair successful!');
        } catch {
          const effort = this.config?.reasoningEffort ?? 'unset';
          const thinkingHint =
            this.requiresAdaptiveThinking() && (effort === 'high' || effort === 'xhigh')
              ? ` Thinking tokens count against max_tokens on this model and ${effort} effort can consume a large share — raise Max Tokens in AI settings (currently ${maxTokens}) or lower reasoning effort.`
              : ` Raise Max Tokens in AI settings (currently ${maxTokens}).`;
          throw new Error(
            `Failed to parse AI response (truncated at ${jsonString.length} chars).${thinkingHint}`,
          );
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
      // Dialog trees branch several turns deep; on thinking models (Opus 4.x)
      // the thinking tokens count against max_tokens, and the response also
      // carries a routingPlan paragraph. A hardcoded 4000 left no room for a
      // full branching tree — it got truncated to just the root ("stops at one
      // level"). Honour the user's configured Max Tokens with a generous
      // default, same as the story path.
      const maxTokens = this.config?.maxTokens || 16000;
      // `temperature` omitted — newer Anthropic models reject it as deprecated.
      const requestBody = {
        model: this.model,
        max_tokens: maxTokens,
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

      // Extract + parse JSON via the shared tolerant extractor with repair
      const dialogData = parseJSONWithRepair(stripThinkingBlocks(content.text));

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
      // `temperature` omitted — newer Anthropic models reject it as deprecated.
      const requestBody = {
        model: this.model,
        // 8000: suggestion JSON for 3-5 beats plus thinking headroom on
        // adaptive-thinking models (max_tokens is a cap, not a floor)
        max_tokens: 8000,
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

      // Extract + parse JSON via the shared tolerant extractor with repair
      const suggestions = parseJSONWithRepair(stripThinkingBlocks(content.text));

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
      // `temperature` omitted — newer Anthropic models reject it as deprecated.
      const requestBody = {
        model: this.model,
        max_tokens: 2000,
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

      // Extract + parse JSON via the shared tolerant extractor with repair
      const beatData = parseJSONWithRepair(stripThinkingBlocks(content.text));

      console.log('[ClaudeProvider] Beat created:', beatData.beat.type);

      return beatData as NaturalLanguageBeatResponse;
    });
  }

  /**
   * Generate a single conversation turn for AIConversationBeat / Ideator.
   */
  async generateConversationTurn(request: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    maxTokens?: number;
  }): Promise<{ text: string }> {
    this.ensureReady();

    // Convert messages to Claude format (user/assistant only, system goes to system field)
    const claudeMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // `temperature` omitted — newer Anthropic models reject it as deprecated.
    const requestBody = {
      model: this.model,
      max_tokens: request.maxTokens ?? 1000,
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

  /**
   * Multi-turn chat with tool use. Sends `tools` to Claude, executes any
   * tool_use blocks via the supplied callback, sends tool_result messages
   * back, and loops until Claude produces a plain-text response (or we hit
   * maxIterations).
   *
   * Used by Ideator to run the conversation with the optional Brave web
   * search tool. The shape of the request mirrors generateConversationTurn
   * so callers can switch between the two by feature-flagging on whether
   * tools are configured.
   */
  async generateChatWithTools(request: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    tools: Array<{ name: string; description: string; input_schema: unknown }>;
    executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
    onToolUse?: (name: string, input: Record<string, unknown>) => void;
    maxIterations?: number;
  }): Promise<{
    text: string;
    toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  }> {
    this.ensureReady();

    // Build the running messages array in Claude format. user/assistant only
    // — system content is hoisted to the `system` field on each request.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const toolCalls: Array<{
      name: string;
      input: Record<string, unknown>;
      result: string;
    }> = [];
    const maxIter = request.maxIterations ?? 5;
    // Honour user-configured maxTokens (matches the pattern in
    // buildChatRequest elsewhere in this file). 1500 was too tight for
    // tool loops where the model wants to think before calling — bumped
    // default to 8192.
    const toolLoopMaxTokens = this.config?.maxTokens || 8192;

    for (let iter = 0; iter < maxIter; iter++) {
      const requestBody = {
        model: this.model,
        max_tokens: toolLoopMaxTokens,
        system: request.systemPrompt,
        tools: request.tools,
        messages,
      };
      console.log(
        `[ClaudeProvider] tool-loop iter ${iter}/${maxIter}, ` +
          `${messages.length} messages, requesting up to ${requestBody.max_tokens} tokens`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any;
      if (this.useProxy) {
        response = await this.makeProxyRequest(requestBody);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiResp = await this.client!.messages.create(requestBody as any);
        response = { content: apiResp.content, stop_reason: apiResp.stop_reason };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = (response.content ?? []) as any[];
      const toolUses = blocks.filter(b => b?.type === 'tool_use');
      const textLen = blocks
        .filter(b => b?.type === 'text')
        .reduce((n, b) => n + String(b.text ?? '').length, 0);
      console.log(
        `[ClaudeProvider] iter ${iter} response: stop=${response.stop_reason}, ` +
          `text_len=${textLen}, tool_uses=${toolUses.length}`,
      );

      if (toolUses.length === 0) {
        // No tools requested — concatenate any text blocks and return.
        const text = blocks
          .filter(b => b?.type === 'text')
          .map(b => String(b.text ?? ''))
          .join('\n')
          .trim();
        console.log(`[ClaudeProvider] tool-loop done at iter ${iter}, returning ${text.length} chars`);
        return { text, toolCalls };
      }

      // Echo Claude's full assistant message (including the tool_use blocks)
      // back into the running history — Anthropic requires this so it can
      // correlate tool_use_id with tool_result_id on the next turn.
      messages.push({ role: 'assistant', content: blocks });

      // Run each tool. Doing them in sequence (not parallel) keeps the chat
      // chip ordering deterministic and avoids racing the UI store.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const tu of toolUses) {
        const name = String(tu.name ?? '');
        const input = (tu.input ?? {}) as Record<string, unknown>;
        try {
          request.onToolUse?.(name, input);
        } catch {
          /* host UI errors must never break the loop */
        }
        let result: string;
        try {
          result = await request.executeTool(name, input);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
        toolCalls.push({ name, input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return {
      text:
        '(Reached the maximum number of tool steps for this turn — let me know what you would like to focus on.)',
      toolCalls,
    };
  }
}
