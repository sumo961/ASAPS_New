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
  private model: string = 'gpt-5.5';
  private useJsonFormat: boolean = true;
  private useProxy: boolean = false;
  // Prefer same-origin proxy (Vite dev server plugin) over cross-origin port 3001
  // Same-origin uses Node.js native https; port 3001 may use Electron's Chromium fetch
  private proxyEndpoint: string = typeof window !== 'undefined' && window.location?.port === '5173'
    ? '/api/ai/openai'
    : 'http://localhost:3001/api/ai/openai';

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

      this.model = config.model || 'gpt-5.5';

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
  private async makeProxyRequest(
    requestBody: any,
    signal?: AbortSignal,
    onProgress?: (charsReceived: number) => void,
  ): Promise<any> {
    console.log('[OpenAIProvider] makeProxyRequest called, endpoint:', this.proxyEndpoint);
    console.log('[OpenAIProvider] baseUrl:', this.config?.baseUrl || '(none - using default)');

    // Streaming is opt-in via requestBody.stream === true. The proxy keeps
    // the connection warm by piping content tokens as they arrive — this
    // sidesteps the long-idle-then-killed-by-CDN class of 504 timeouts and
    // gives us a progress signal for the UI.
    const isStreaming = requestBody?.stream === true;

    let response;
    try {
      response = await fetch(this.proxyEndpoint, {
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
    } catch (error) {
      // Connection refused - proxy server not running
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          'API proxy server is not running. External AI providers (OpenAI, Claude, etc.) require the proxy server.\n\n' +
          'Start it with: npm run dev:api\n\n' +
          'Or use a local AI provider (Ollama) which connects directly.'
        );
      }
      throw error;
    }

    if (!response.ok) {
      // The error body might be JSON (provider format) OR plaintext (CDN /
      // gateway errors like Envoy "upstream connect error..."). Read as text
      // first, then try to parse — falling back to the raw text on parse
      // failure so the caller sees a meaningful message instead of a
      // SyntaxError from response.json().
      const rawText = await response.text();
      let errorMessage: string;
      try {
        const errorData = JSON.parse(rawText);
        errorMessage =
          errorData.error?.message ||  // OpenAI/Moonshot format: {"error":{"message":"..."}}
          errorData.message ||         // Simple format: {"message":"..."}
          errorData.error ||           // String format: {"error":"..."}
          JSON.stringify(errorData) || // Fallback: stringify the whole thing
          'Proxy request failed';
      } catch {
        // Body wasn't JSON — typical for upstream gateway errors.
        // Trim to a useful length so a giant HTML error page doesn't flood the UI.
        errorMessage = rawText.trim().slice(0, 300) || 'Proxy request failed';
      }
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    // Streaming success: read the body as a chunked text stream of
    // content tokens (the proxy already extracted them from the upstream
    // SSE format). Accumulate into a single string and wrap in the same
    // shape the buffered path returns so downstream code can stay
    // identical: `response.choices[0].message.content`.
    if (isStreaming && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let chunkCount = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunkCount++;
        accumulated += decoder.decode(value, { stream: true });
        if (onProgress) onProgress(accumulated.length);
      }
      accumulated += decoder.decode();
      console.log(`[OpenAIProvider] stream complete: ${chunkCount} chunks, ${accumulated.length} chars`);
      return {
        choices: [{ message: { content: accumulated } }],
        // Synthesize a finish_reason so existing truncation-detection
        // logic can still run. The proxy doesn't currently forward the
        // upstream finish_reason, so 'stop' is the optimistic default;
        // if the assembled JSON fails to parse, the existing
        // JSON-repair path will handle it.
        _streamed: true,
      };
    }

    return response.json();
  }

  /**
   * Check if we're connecting to Ollama (localhost with typical Ollama port)
   */
  private isOllamaConnection(): boolean {
    const baseUrl = this.config?.baseUrl;
    if (!baseUrl) return false;
    try {
      const parsed = new URL(baseUrl);
      return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
             (parsed.port === '11434' || baseUrl.includes('ollama'));
    } catch {
      return false;
    }
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
      // OpenAI's reasoning_effort accepts none|minimal|low|medium|high|xhigh
      // per developers.openai.com/api/docs/guides/reasoning. 'max' is an
      // Anthropic-only tier we expose in the UI; cap it at 'xhigh' on the
      // OpenAI side so a global 'max' setting doesn't error out for users
      // who switch providers without changing reasoning effort. SDK types
      // may also lag the newest GPT-5 levels, so cast to allow them.
      const effortForOpenAI = reasoningEffort === 'max' ? 'xhigh' : reasoningEffort;
      requestBody.reasoning_effort = effortForOpenAI as any;
    }

    // Use shared utility to check if model supports temperature
    if (!isReasoningModel(this.model, reasoningEffort)) {
      requestBody.temperature = this.config?.temperature ?? fallbackTemperature;
    }

    // For Ollama connections, add Ollama-specific options
    // Ollama's OpenAI-compatible API accepts these in the request body
    if (this.isOllamaConnection()) {
      // Set num_ctx (context window) - Ollama defaults to 2048 which is too small
      // Most modern models support 32k-128k+ context
      requestBody.options = {
        num_ctx: 32768,  // 32k context window
        num_predict: maxTokens,  // Max tokens to generate
      };
      console.log('[OpenAIProvider] Added Ollama options: num_ctx=32768, num_predict=' + maxTokens);
    }

    return requestBody;
  }

  /**
   * Try to repair malformed JSON from LLM output
   * Handles: unquoted keys, single quotes, trailing commas, truncation, control chars
   */
  private tryRepairJson(json: string): string | null {
    let repaired = json;
    const repairs: string[] = [];

    // Step 1: Escape unescaped control characters inside JSON strings
    // This handles newlines, tabs, etc. that smaller models write literally inside string values
    {
      let result = '';
      let inString = false;
      let i = 0;

      while (i < repaired.length) {
        const char = repaired[i];
        const charCode = char.charCodeAt(0);

        // Handle escape sequences
        if (char === '\\' && i + 1 < repaired.length) {
          result += char + repaired[i + 1];
          i += 2;
          continue;
        }

        // Track string boundaries
        if (char === '"') {
          inString = !inString;
          result += char;
          i++;
          continue;
        }

        // Inside a string, escape control characters
        if (inString && charCode < 32) {
          // Map common control characters to their escape sequences
          switch (charCode) {
            case 9:  result += '\\t'; break;  // Tab
            case 10: result += '\\n'; break;  // Newline
            case 13: result += '\\r'; break;  // Carriage return
            case 8:  result += '\\b'; break;  // Backspace
            case 12: result += '\\f'; break;  // Form feed
            default: result += `\\u${charCode.toString(16).padStart(4, '0')}`; // Other control chars
          }
          i++;
          continue;
        }

        // Outside strings, remove harmful control characters (but keep newlines for structure)
        if (!inString && charCode < 32 && charCode !== 10 && charCode !== 13 && charCode !== 9) {
          i++;
          continue;
        }

        result += char;
        i++;
      }

      if (result !== repaired) {
        const escapeCount = result.length - repaired.length + (repaired.match(/[\x00-\x1f]/g) || []).length;
        repairs.push(`escaped ${escapeCount} control characters in strings`);
        repaired = result;
      }
    }

    // Step 1b: Remove JavaScript-style comments (// and /* */) that smaller models add
    // Must be done carefully to not remove // inside string values
    {
      let result = '';
      let inString = false;
      let i = 0;

      while (i < repaired.length) {
        const char = repaired[i];

        // Handle escape sequences inside strings
        if (char === '\\' && inString && i + 1 < repaired.length) {
          result += char + repaired[i + 1];
          i += 2;
          continue;
        }

        // Track string boundaries
        if (char === '"') {
          inString = !inString;
          result += char;
          i++;
          continue;
        }

        // Outside strings, check for comments
        if (!inString) {
          // Single-line comment: // until end of line
          if (char === '/' && i + 1 < repaired.length && repaired[i + 1] === '/') {
            // Skip until newline
            while (i < repaired.length && repaired[i] !== '\n') {
              i++;
            }
            continue;
          }

          // Multi-line comment: /* ... */
          if (char === '/' && i + 1 < repaired.length && repaired[i + 1] === '*') {
            i += 2; // Skip /*
            while (i + 1 < repaired.length && !(repaired[i] === '*' && repaired[i + 1] === '/')) {
              i++;
            }
            i += 2; // Skip */
            continue;
          }
        }

        result += char;
        i++;
      }

      if (result !== repaired) {
        repairs.push('removed JavaScript comments');
        repaired = result;
      }
    }

    // Step 1c: Fix unescaped double quotes inside string values (common with Kimi K2.5).
    // Pattern: "text": "He said "something" and..." — the inner quotes break JSON parsing.
    // Strategy: when inside a string value, a `"` that is NOT immediately followed by a JSON
    // structural character (`,`, `}`, `]`, `\n`, `\r`, or end-of-input) is an interior quote
    // and should be escaped.
    {
      let result = '';
      let i = 0;
      let fixCount = 0;

      while (i < repaired.length) {
        const char = repaired[i];

        // Pass through already-escaped sequences unchanged
        if (char === '\\' && i + 1 < repaired.length) {
          result += char + repaired[i + 1];
          i += 2;
          continue;
        }

        // Opening quote of a string
        if (char === '"') {
          result += char;
          i++;

          // Read string content, deciding for each `"` whether it closes the string
          while (i < repaired.length) {
            const sc = repaired[i];

            if (sc === '\\' && i + 1 < repaired.length) {
              result += sc + repaired[i + 1];
              i += 2;
              continue;
            }

            if (sc === '"') {
              // Peek at the first non-space/tab character after this quote
              let j = i + 1;
              while (j < repaired.length && (repaired[j] === ' ' || repaired[j] === '\t')) j++;
              const next = j < repaired.length ? repaired[j] : '';

              // These characters mean the string value is legitimately over
              const isStructural = next === ',' || next === '}' || next === ']' ||
                                   next === '\n' || next === '\r' || next === '';

              if (isStructural) {
                result += sc; // closing quote
                i++;
                break;
              } else {
                result += '\\"'; // interior quote — escape it
                fixCount++;
                i++;
              }
              continue;
            }

            result += sc;
            i++;
          }
          continue;
        }

        result += char;
        i++;
      }

      if (fixCount > 0) {
        repairs.push(`escaped ${fixCount} unescaped interior quotes in strings`);
        repaired = result;
      }
    }

    // Step 2: Fix unquoted property names (common LLM error)
    // Match: { key: or , key: where key is not quoted
    // Be careful not to match inside strings
    const unquotedKeyPattern = /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
    let hasUnquotedKeys = false;

    // First pass: check if we have unquoted keys (outside of strings)
    const testStr = repaired;
    let inStr = false;
    let escaped = false;
    let cleanedForTest = '';
    for (let i = 0; i < testStr.length; i++) {
      const c = testStr[i];
      if (escaped) { escaped = false; cleanedForTest += '_'; continue; }
      if (c === '\\') { escaped = true; cleanedForTest += '_'; continue; }
      if (c === '"') { inStr = !inStr; cleanedForTest += c; continue; }
      cleanedForTest += inStr ? '_' : c;
    }

    if (unquotedKeyPattern.test(cleanedForTest)) {
      hasUnquotedKeys = true;
    }

    if (hasUnquotedKeys) {
      // Replace unquoted keys with quoted ones, being careful about string context
      let result = '';
      let inString = false;
      let escape = false;
      let i = 0;

      while (i < repaired.length) {
        const char = repaired[i];

        if (escape) {
          result += char;
          escape = false;
          i++;
          continue;
        }

        if (char === '\\') {
          result += char;
          escape = true;
          i++;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          result += char;
          i++;
          continue;
        }

        if (inString) {
          result += char;
          i++;
          continue;
        }

        // Outside string - check for unquoted key
        if ((char === '{' || char === ',')) {
          const rest = repaired.slice(i);
          const match = rest.match(/^([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
          if (match) {
            result += match[1] + '"' + match[2] + '":';
            i += match[0].length;
            continue;
          }
        }

        result += char;
        i++;
      }

      repaired = result;
      repairs.push('quoted unquoted property names');
    }

    // Step 3: Convert single quotes to double quotes (outside of double-quoted strings)
    let hasSingleQuotes = false;
    inStr = false;
    escaped = false;
    for (const c of repaired) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (!inStr && c === "'") { hasSingleQuotes = true; break; }
    }

    if (hasSingleQuotes) {
      let result = '';
      let inDoubleString = false;
      let inSingleString = false;
      let escape = false;

      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];

        if (escape) {
          result += char;
          escape = false;
          continue;
        }

        if (char === '\\') {
          result += char;
          escape = true;
          continue;
        }

        if (char === '"' && !inSingleString) {
          inDoubleString = !inDoubleString;
          result += char;
          continue;
        }

        if (char === "'" && !inDoubleString) {
          inSingleString = !inSingleString;
          result += '"'; // Convert to double quote
          continue;
        }

        result += char;
      }

      repaired = result;
      repairs.push('converted single quotes to double quotes');
    }

    // Step 4: Fix trailing commas before } or ]
    const beforeTrailing = repaired;
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    if (repaired !== beforeTrailing) {
      repairs.push('removed trailing commas');
    }

    // Step 5: Fix missing commas between properties/elements
    // Pattern: "value" "key" should be "value", "key"
    const beforeMissingComma = repaired;
    repaired = repaired.replace(/("\s*)(")(?=\s*"[^"]*"\s*:)/g, '$1,$2');
    // Pattern: } { or ] [ without comma
    repaired = repaired.replace(/(\})\s*(\{)/g, '$1,$2');
    repaired = repaired.replace(/(\])\s*(\[)/g, '$1,$2');
    // Pattern: "value" { or number {
    repaired = repaired.replace(/("|\d)\s*(\{)/g, '$1,$2');
    if (repaired !== beforeMissingComma) {
      repairs.push('added missing commas');
    }

    // Step 5b: Fix missing closing brace before next beat in array
    // Pattern: ], { "id": ... means beat object wasn't closed before next beat
    // Should be: ]}, { "id": ...
    const beforeMissingBrace = repaired;
    // Look for connections array ending with ],{ followed by "id" - missing } to close beat
    repaired = repaired.replace(/(\],)\s*(\{\s*"id"\s*:)/g, ']},\n    $2');
    if (repaired !== beforeMissingBrace) {
      repairs.push('added missing closing brace between beats');
    }

    // Step 6: Handle truncation - close open structures
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }

    // If in string, close it
    if (inString) {
      repaired += '"';
      repairs.push('closed unclosed string');
    }

    // Remove trailing incomplete content
    repaired = repaired.replace(/,\s*"[^"]*":\s*$/, '');
    repaired = repaired.replace(/,\s*"[^"]*$/, '');
    repaired = repaired.replace(/,\s*$/, '');

    // Recount after cleanup
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escape = false;
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

    // Close open structures (add missing closing brackets/braces)
    if (openBrackets > 0 || openBraces > 0) {
      for (let i = 0; i < openBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces; i++) repaired += '}';
      repairs.push(`closed ${openBrackets} brackets, ${openBraces} braces`);
    }

    // Remove extra closing braces (common smaller model error)
    // Pattern: `] }` where the } is spurious (e.g., after beats array closes)
    if (openBraces < 0) {
      const extraBraces = Math.abs(openBraces);
      // Find and remove extra } that appear after ] (array end followed by spurious brace)
      // Common pattern: `]\n  }` or `]\n}\n,`
      let removed = 0;
      // Look for pattern: ] followed by whitespace and } followed by whitespace and , or "
      // This catches the specific error where model adds extra } after array closes
      const extraBracePattern = /(\])\s*(\})\s*(,|")/g;
      const beforeRemove = repaired;
      while (removed < extraBraces) {
        const match = repaired.match(extraBracePattern);
        if (match) {
          repaired = repaired.replace(extraBracePattern, '$1$3');
          removed++;
        } else {
          break;
        }
      }
      // If pattern didn't catch all, try removing lone } before , (outside strings)
      if (removed < extraBraces) {
        // More aggressive: find any } that's followed by , and preceded by ] (possibly with whitespace)
        const loneExtraBrace = /(\][\s\n]*)\}([\s\n]*,)/g;
        while (removed < extraBraces && loneExtraBrace.test(repaired)) {
          repaired = repaired.replace(loneExtraBrace, '$1$2');
          removed++;
        }
      }
      if (repaired !== beforeRemove) {
        repairs.push(`removed ${removed} extra closing brace(s)`);
      }
    }

    // Remove extra closing brackets
    if (openBrackets < 0) {
      const extraBrackets = Math.abs(openBrackets);
      let removed = 0;
      // Look for pattern: } followed by whitespace and ] followed by whitespace and , or "
      const extraBracketPattern = /(\})\s*(\])\s*(,|")/g;
      const beforeRemove = repaired;
      while (removed < extraBrackets) {
        const match = repaired.match(extraBracketPattern);
        if (match) {
          repaired = repaired.replace(extraBracketPattern, '$1$3');
          removed++;
        } else {
          break;
        }
      }
      if (repaired !== beforeRemove) {
        repairs.push(`removed ${removed} extra closing bracket(s)`);
      }
    }

    if (repairs.length > 0) {
      console.log(`[OpenAIProvider] JSON repairs applied: ${repairs.join('; ')}`);
    }

    return repaired;
  }

  /**
   * Helper to collect all targets from a dialogTree recursively
   */
  private collectDialogTreeTargets(node: any, targets: string[]): void {
    if (!node) return;

    if (node.choices && Array.isArray(node.choices)) {
      for (const choice of node.choices) {
        if (choice.target) targets.push(choice.target);
        if (choice.dialogNode) {
          this.collectDialogTreeTargets(choice.dialogNode, targets);
        }
      }
    }
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

      // Rebuild connections array from actual targets for multi-connection types
      // Models often generate inconsistent connections arrays that don't match choice targets
      if (isMultiConn && beat.type !== 'conditionBeat') {
        const actualTargets: string[] = [];

        // Collect targets from choices (movementChoice, dialogTree)
        if (beat.parameters.choices && Array.isArray(beat.parameters.choices)) {
          for (const choice of beat.parameters.choices) {
            if (choice.target) actualTargets.push(choice.target);
          }
        }

        // Collect targets from props (pickProp)
        if (beat.parameters.props && Array.isArray(beat.parameters.props)) {
          for (const prop of beat.parameters.props) {
            if (prop.target) actualTargets.push(prop.target);
          }
        }

        // Collect targets from hyperlinks (hyperText)
        if (beat.parameters.hyperlinks && Array.isArray(beat.parameters.hyperlinks)) {
          for (const link of beat.parameters.hyperlinks) {
            if (link.targetBeatId) actualTargets.push(link.targetBeatId);
            else if (link.target) actualTargets.push(link.target);
          }
        }

        // Collect targets from dialogTree recursively
        if (beat.parameters.dialogTree) {
          this.collectDialogTreeTargets(beat.parameters.dialogTree, actualTargets);
        }

        // Rebuild connections array from actual targets
        if (actualTargets.length > 0) {
          const oldConnections = beat.connections ? JSON.stringify(beat.connections) : 'none';
          beat.connections = [...new Set(actualTargets)].map(t => ({ targetId: t }));
          const newConnections = JSON.stringify(beat.connections);
          if (oldConnections !== newConnections) {
            cleanupCount++;
            cleanupDetails.push(`${beat.id}: rebuilt connections from ${actualTargets.length} targets`);
          }
        }
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

    // Build enhanced prompts with deep beat type understanding.
    // affectDepth ('auto' / 'sparse' / 'standard' / 'rich') gates how
    // much of the rich-character / affect system the AI deploys.
    const systemPrompt = buildEnhancedStoryGenerationSystemPrompt(
      schema,
      request.affectDepth ?? 'auto',
    );
    const userPrompt = buildEnhancedUserPrompt(request);

    console.log('[OpenAIProvider] Generating story with GPT (affectDepth='
      + (request.affectDepth ?? 'auto') + ')...');

    return this.withRetry(async () => {
      // GPT-5 reasoning models need much higher max_completion_tokens because reasoning tokens
      // are counted within this limit. 8000 tokens can be entirely consumed by reasoning,
      // leaving nothing for actual output. Use 32000 to allow room for both.
      // All modern models (GPT-5, Claude, Gemma 3, Mistral 3, DeepSeek, Kimi K2) have
      // 128k+ context windows, so we use 32000 as the baseline for story generation.
      // User can override via config.maxTokens.
      const defaultMaxTokens = 32000;
      const effectiveMaxTokens = this.config?.maxTokens ?? defaultMaxTokens;

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

      console.log(
        `[OpenAIProvider] generateStory useProxy=${this.useProxy}, ` +
          `effectiveMaxTokens=${effectiveMaxTokens} ` +
          `(default=${defaultMaxTokens}, configured=${this.config?.maxTokens ?? 'unset'})`,
      );
      const startedAt = Date.now();
      if (this.useProxy) {
        // Use proxy for all non-local endpoints (including default OpenAI).
        // Stream by default — keeps the connection warm during long
        // reasoning pauses, eliminates 504s on slow models, and gives
        // the UI a progress signal. Thread through request.signal so
        // the user can cancel.
        const streamingBody = { ...requestBody, stream: true };
        response = await this.makeProxyRequest(streamingBody, request.signal, request.onProgress);
      } else {
        // Direct API call only for local servers (Ollama, etc.) — keep
        // non-streaming for now since local servers don't have the
        // intermediary-timeout problem the proxy was solving.
        response = await this.client!.chat.completions.create(requestBody, {
          signal: request.signal,
        });
      }
      const elapsedMs = Date.now() - startedAt;
      const elapsedHuman =
        elapsedMs >= 60000
          ? `${(elapsedMs / 60000).toFixed(1)}min`
          : `${(elapsedMs / 1000).toFixed(1)}s`;

      console.log(
        `[OpenAIProvider] Response received in ${elapsedHuman} ` +
          `(content_len=${(response.choices?.[0]?.message?.content ?? '').length}, ` +
          `finish_reason=${response.choices?.[0]?.finish_reason ?? 'unknown'})`,
      );
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
      const jsonString = jsonMatch[0];

      try {
        storyData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('[OpenAIProvider] JSON parse error:', parseError);
        console.error(
          `[OpenAIProvider] Generation took ${elapsedHuman}; ` +
            `accumulated content_len=${content.length}, ` +
            `extracted JSON candidate_len=${jsonString.length}, ` +
            `effectiveMaxTokens=${effectiveMaxTokens}, ` +
            `finish_reason=${response.choices?.[0]?.finish_reason ?? 'unknown'}`,
        );
        console.error('[OpenAIProvider] First 500 chars:', jsonString.substring(0, 500));
        console.error(
          '[OpenAIProvider] Last 500 chars (where truncation usually shows):',
          jsonString.substring(Math.max(0, jsonString.length - 500)),
        );

        // Extract error position if available and log context around it
        const errorMsg = parseError instanceof Error ? parseError.message : '';
        const posMatch = errorMsg.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1], 10);
          const start = Math.max(0, pos - 100);
          const end = Math.min(jsonString.length, pos + 100);
          console.error(`[OpenAIProvider] Context around error position ${pos}:`);
          console.error('[OpenAIProvider] ---START---');
          console.error(jsonString.substring(start, pos) + '>>>ERROR HERE<<<' + jsonString.substring(pos, end));
          console.error('[OpenAIProvider] ---END---');
        }

        // Try to repair malformed JSON
        const repaired = this.tryRepairJson(jsonString);
        if (repaired) {
          try {
            storyData = JSON.parse(repaired);
            console.log('[OpenAIProvider] Successfully repaired JSON');
          } catch (repairError) {
            // Log context around repair error too
            const repairMsg = repairError instanceof Error ? repairError.message : '';
            const repairPosMatch = repairMsg.match(/position (\d+)/);
            if (repairPosMatch) {
              const pos = parseInt(repairPosMatch[1], 10);
              const start = Math.max(0, pos - 100);
              const end = Math.min(repaired.length, pos + 100);
              console.error(`[OpenAIProvider] Repaired JSON still failed at position ${pos}:`);
              console.error('[OpenAIProvider] ---START---');
              console.error(repaired.substring(start, pos) + '>>>ERROR HERE<<<' + repaired.substring(pos, end));
              console.error('[OpenAIProvider] ---END---');
            }
            throw new Error(
              `Invalid JSON in response after ${elapsedHuman} ` +
                `(${content.length} chars produced, max_tokens=${effectiveMaxTokens}, repair failed): ` +
                `${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. ` +
                `If the JSON appears truncated, raise Max Tokens in AI settings (currently ${effectiveMaxTokens}).`,
            );
          }
        } else {
          throw new Error(
            `Invalid JSON in response after ${elapsedHuman} ` +
              `(${content.length} chars produced, max_tokens=${effectiveMaxTokens}): ` +
              `${parseError instanceof Error ? parseError.message : 'Unknown parse error'}. ` +
              `If the JSON appears truncated, raise Max Tokens in AI settings (currently ${effectiveMaxTokens}).`,
          );
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
        // Dialog trees branch several turns deep; on reasoning models (GPT-5)
        // reasoning tokens count against this budget, so a 4000 cap truncated
        // the tree to just the root. buildChatRequest still lets config.maxTokens
        // override this default.
        16000,
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

  /**
   * Generate a single conversation turn for AIConversationBeat
   */
  async generateConversationTurn(request: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    maxTokens?: number;
  }): Promise<{ text: string }> {
    this.ensureReady();

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const requestBody = this.buildChatRequest(messages as any, request.maxTokens ?? 1000, 0.8);

    let response;
    if (this.useProxy) {
      response = await this.makeProxyRequest(requestBody);
    } else {
      response = await this.client!.chat.completions.create(requestBody);
    }

    const choice = response.choices?.[0];
    const message = choice?.message;
    const content = message?.content;
    if (!content) {
      const finishReason = choice?.finish_reason ?? 'unknown';
      const hasReasoning = !!(message as Record<string, unknown> | undefined)?.reasoning_content;
      console.error(
        `[OpenAIProvider] Empty content in conversation-turn response. ` +
          `finish_reason=${finishReason}, has_reasoning_content=${hasReasoning}, ` +
          `keys=${Object.keys(message ?? {}).join(',')}`,
      );
      // Distinguish the most common causes so the user sees a useful
      // message instead of just "no response":
      //   - finish=length: model ran out of tokens. On reasoning models
      //     (Kimi K2.6) this often means reasoning_content consumed the
      //     whole budget before any visible content was emitted.
      //   - has_reasoning + no content: the model only "thought" and
      //     never produced an answer — same root cause, different shape.
      //   - other: connection drop or unexpected response shape.
      if (finishReason === 'length' || hasReasoning) {
        throw new Error(
          'The model produced no visible content (it spent its whole token budget on internal reasoning). ' +
            'Try again — and if this keeps happening, raise Max Tokens in AI settings.',
        );
      }
      throw new Error(
        `No response from OpenAI (finish_reason=${finishReason}). The connection may have dropped — try again.`,
      );
    }

    return { text: content.trim() };
  }

  /**
   * Multi-turn chat with tool use, OpenAI-compatible flavour.
   *
   * Mirrors ClaudeProvider.generateChatWithTools so Ideator (and any
   * future tool-using flow) can run against OpenAI / Kimi / Moonshot /
   * any OpenAI-compatible endpoint that supports function calling.
   *
   * The request shape matches Claude's: tools is an array of
   * Anthropic-style { name, description, input_schema } specs. We
   * translate to OpenAI's { type: 'function', function: { name,
   * description, parameters } } on the way in, and translate
   * tool_calls (with arguments as JSON strings) back to the Anthropic
   * { name, input } shape on the way out so Ideator's executor and
   * onToolUse callbacks see a consistent contract regardless of
   * provider.
   *
   * Tool-result framing is OpenAI's: role="tool" messages with
   * tool_call_id pairs the result to its originating tool_calls entry.
   * The assistant message containing tool_calls must be echoed back
   * verbatim before the tool messages, mirroring the Anthropic
   * requirement on the Claude side.
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

    // OpenAI requires the system prompt as a regular message rather than a
    // top-level field. Build the running message array with system first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // Translate Anthropic-style tool specs to OpenAI function-calling shape.
    const openaiTools = request.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const toolCalls: Array<{
      name: string;
      input: Record<string, unknown>;
      result: string;
    }> = [];
    const maxIter = request.maxIterations ?? 5;

    // Reasoning models (Kimi K2.6, Moonshot reasoning variants) can emit
    // several thousand tokens of reasoning_content before the tool_calls
    // portion of the message even starts. The previous hardcoded 1500
    // truncated mid-arguments-JSON, which silently cascaded into
    // malformed tool input and loop stalls. Honour the user-configured
    // maxTokens (matches buildChatRequest behavior elsewhere in this
    // file), default to 8192 so reasoning_content has room to breathe.
    const toolLoopMaxTokens = this.config?.maxTokens ?? 8192;

    for (let iter = 0; iter < maxIter; iter++) {
      const requestBody = {
        model: this.model || 'gpt-4o',
        messages,
        tools: openaiTools,
        max_tokens: toolLoopMaxTokens,
      };
      console.log(
        `[OpenAIProvider] tool-loop iter ${iter}/${maxIter}, ` +
          `${messages.length} messages, requesting up to ${requestBody.max_tokens} tokens`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let response: any;
      if (this.useProxy) {
        response = await this.makeProxyRequest(requestBody);
      } else {
        // OpenAI SDK types `function.parameters` strictly; we accept
        // unknown here to keep the Anthropic-style ChatToolSpec shape
        // portable across providers. Runtime is fine.
        response = await this.client!.chat.completions.create(requestBody as any);
      }

      const choice = response.choices?.[0];
      const message = choice?.message;
      const requestedToolCalls = message?.tool_calls as
        | Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>
        | undefined;
      console.log(
        `[OpenAIProvider] iter ${iter} response: finish=${choice?.finish_reason}, ` +
          `content_len=${(message?.content ?? '').length}, ` +
          `tool_calls=${requestedToolCalls?.length ?? 0}, ` +
          `has_reasoning=${!!(message as any)?.reasoning_content}`,
      );

      if (!requestedToolCalls || requestedToolCalls.length === 0) {
        // No tools requested — return the assistant text. Some providers
        // (Kimi reasoning models) sometimes return null content alongside
        // tool_calls; clamp to empty string so downstream synthesis
        // doesn't choke.
        const text = (message?.content ?? '').toString().trim();
        console.log(`[OpenAIProvider] tool-loop done at iter ${iter}, returning ${text.length} chars`);
        return { text, toolCalls };
      }

      // Echo the assistant's tool_calls message back into history. OpenAI
      // requires the tool_call_id on the subsequent role:tool messages to
      // match an id from this assistant message.
      //
      // Kimi-specific: when reasoning is enabled, the response message
      // includes a `reasoning_content` field. Kimi rejects subsequent
      // requests with 400 "thinking is enabled but reasoning_content is
      // missing in assistant tool call message" if we don't echo it
      // back. Forward it when present; non-Kimi providers ignore the
      // extra field.
      const echoMessage: Record<string, unknown> = {
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: requestedToolCalls,
      };
      const reasoningContent = (message as Record<string, unknown>)?.reasoning_content;
      if (reasoningContent !== undefined && reasoningContent !== null) {
        echoMessage.reasoning_content = reasoningContent;
      }
      messages.push(echoMessage);

      // Run each tool. Keep sequential ordering (Anthropic-side rationale
      // applies here too — deterministic chip ordering in the UI store).
      for (const tc of requestedToolCalls) {
        const name = tc.function?.name ?? '';
        let input: Record<string, unknown> = {};
        try {
          input = tc.function?.arguments
            ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          // Malformed arguments JSON — treat as empty input. The tool
          // implementation can decide how to handle missing fields.
          input = {};
        }

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

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    return {
      text:
        '(Reached the maximum number of tool steps for this turn — let me know what you would like to focus on.)',
      toolCalls,
    };
  }
}
