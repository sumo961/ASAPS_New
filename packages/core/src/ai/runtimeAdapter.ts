/**
 * Shared runtime AI adapter — single source of truth for the IAIService
 * implementations that power AI beats at STORY RUNTIME (as opposed to the
 * builder's authoring-time story/dialog generation, which stays in
 * @asaps/builder's OpenAIProvider/ClaudeProvider).
 *
 * Before this module, the "call an AI provider, orchestrate the request,
 * extract text/JSON from the response" logic was copy-pasted with drift
 * across three runtimes:
 *   1. PreviewWindow.tsx  (in-app preview)  — SDK clients + builder proxy
 *   2. StoryPreview.tsx   (deprecated modal preview) — same, older copy
 *   3. WebAIProvider.ts   (exported-HTML runtime) — hand-rolled fetch, with
 *      latent bugs the other copies had already fixed
 *
 * Design: createRuntimeAIService() owns request-body construction (built on
 * the providerQuirks helpers) and response parsing/normalization for two
 * provider families:
 *   - 'anthropic' — Claude Messages API
 *   - 'openai'    — OpenAI-compatible chat completions (OpenAI, Ollama,
 *                   Moonshot/Kimi, custom endpoints)
 * HOW the request travels is a pluggable RuntimeTransport, because that is
 * the only thing that genuinely differs per call site:
 *   - createDirectAnthropicTransport / createDirectOpenAITransport — plain
 *     fetch to the provider REST endpoint (exported runtime; local/official
 *     endpoints in the preview)
 *   - createProxyTransport — the builder's CORS proxy contract
 *     ({ baseUrl, apiKey, ...body } POSTed to /api/ai/claude|openai);
 *     the proxy returns the provider-shaped JSON untouched.
 *
 * Keep this module framework-free: no DOM beyond fetch, no React, no
 * imports from @asaps/builder.
 */

import type { IAIService } from '../types';
import {
  buildChatRequestBody,
  effectiveMaxTokens,
  stripThinkingBlocks,
} from './providerQuirks';
import { extractJSON, parseJSONWithRepair } from './jsonExtraction';

export type RuntimeProviderFamily = 'anthropic' | 'openai';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-sol';

/**
 * Sends a fully-built provider request body and resolves with the
 * provider-shaped response JSON (Anthropic Messages shape for the
 * 'anthropic' family, chat-completions shape for the 'openai' family).
 */
export type RuntimeTransport = (body: Record<string, unknown>) => Promise<any>;

/**
 * Direct fetch to the Anthropic Messages API (or an Anthropic-compatible
 * baseUrl). Includes the CORS opt-in header so browser runtimes (exported
 * HTML, preview windows) can call the official endpoint directly.
 */
export function createDirectAnthropicTransport(options: {
  apiKey: string;
  baseUrl?: string;
}): RuntimeTransport {
  const url = options.baseUrl
    ? `${options.baseUrl.replace(/\/$/, '')}/messages`
    : 'https://api.anthropic.com/v1/messages';

  return async (body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    return response.json();
  };
}

/**
 * Direct fetch to an OpenAI-compatible chat-completions endpoint.
 * apiKey is optional — local servers (Ollama, llama.cpp) don't need one.
 */
export function createDirectOpenAITransport(options: {
  apiKey?: string;
  baseUrl?: string;
}): RuntimeTransport {
  const url = options.baseUrl
    ? `${options.baseUrl.replace(/\/$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  return async (body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey || ''}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    return response.json();
  };
}

/**
 * The builder's CORS-proxy contract: POST { baseUrl, apiKey, ...body } to a
 * proxy endpoint (/api/ai/claude or /api/ai/openai, served by the Vite
 * plugin or the standalone api server). The proxy strips baseUrl/apiKey,
 * forwards the rest upstream, and returns the provider JSON untouched —
 * so the same response-parsing code works for proxied and direct calls.
 *
 * DO NOT change this body shape: vite-ai-proxy.ts and api/server.ts
 * destructure exactly { baseUrl, apiKey, ...requestBody }.
 */
/**
 * Transport for the PUBLIC deployment relay (the "hide your API key"
 * story for exported HTML). Contract — deliberately DIFFERENT from
 * createProxyTransport's dev-proxy shape: the client never sends a key
 * or an upstream URL; it POSTs { provider, body } and the relay (a
 * serverless function generated by the builder's export — see
 * packages/builder/src/export/relayKit.ts) injects the key from its
 * host's environment variables and forwards to the FIXED official
 * endpoint for that provider. Response is the provider-shaped JSON,
 * passed through untouched, so the same response-parsing code works
 * for direct and relayed calls.
 */
/**
 * Reassemble an Anthropic Messages SSE stream into the non-streaming
 * response shape, so streaming is an invisible transport detail to every
 * caller (they keep parsing { content, stop_reason, usage } as before).
 * Handles text and thinking deltas; unknown event types are skipped.
 */
export async function reassembleAnthropicStream(response: Response): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response had no body');
  const decoder = new TextDecoder();
  let buffer = '';
  let message: any = { content: [], stop_reason: null, usage: undefined };
  const blocks: any[] = [];

  const handle = (evt: any) => {
    switch (evt.type) {
      case 'message_start':
        message = { ...evt.message, content: [] };
        break;
      case 'content_block_start':
        blocks[evt.index] = { ...evt.content_block };
        break;
      case 'content_block_delta': {
        const b = blocks[evt.index];
        if (!b) break;
        if (evt.delta?.type === 'text_delta') b.text = (b.text || '') + evt.delta.text;
        else if (evt.delta?.type === 'thinking_delta') b.thinking = (b.thinking || '') + evt.delta.thinking;
        else if (evt.delta?.type === 'input_json_delta') b.partial_json = (b.partial_json || '') + evt.delta.partial_json;
        break;
      }
      case 'message_delta':
        if (evt.delta?.stop_reason) message.stop_reason = evt.delta.stop_reason;
        if (evt.usage) message.usage = { ...(message.usage || {}), ...evt.usage };
        break;
      case 'error':
        throw new Error(evt.error?.message || 'Stream error');
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; data lines carry the JSON.
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try { handle(JSON.parse(data)); } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected token') throw e;
        }
      }
    }
  }
  message.content = blocks.filter(Boolean);
  return message;
}

/**
 * Reassemble an OpenAI chat-completions SSE stream into the non-streaming
 * response shape ({ choices: [{ message, finish_reason }], usage }). Only
 * the fields the runtime adapter consumes are rebuilt; unknown chunks are
 * skipped. Works for any OpenAI-compatible endpoint.
 */
export async function reassembleOpenAIStream(response: Response): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response had no body');
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let role = 'assistant';
  let finishReason: string | null = null;
  let usage: any;
  let id: string | undefined;
  let model: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let evt: any;
        try { evt = JSON.parse(data); } catch { continue; }
        if (evt.error) throw new Error(evt.error.message || 'Stream error');
        id = id || evt.id;
        model = model || evt.model;
        if (evt.usage) usage = evt.usage;
        const choice = evt.choices?.[0];
        if (!choice) continue;
        if (choice.delta?.role) role = choice.delta.role;
        if (typeof choice.delta?.content === 'string') content += choice.delta.content;
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }
  }
  return {
    id, model, usage,
    choices: [{ index: 0, message: { role, content }, finish_reason: finishReason }],
  };
}

export function createRelayTransport(options: {
  /** Relay URL — typically same-origin '/.netlify/functions/asaps-ai'. */
  endpoint: string;
  family: RuntimeProviderFamily;
}): RuntimeTransport {
  return async (body) => {
    // Relay requests go STREAMING for BOTH families. This is not a UX
    // nicety — serverless hosts cap buffered function execution (Netlify:
    // 10 s), which long generations (dialog trees) blow past; a streamed
    // response starts immediately and may run as long as the generation
    // takes. The SSE is reassembled below so callers still receive the
    // plain non-streaming response shape. Opt out per-request with
    // stream:false.
    const wantStream = (body as any).stream !== false;
    const sendBody = wantStream ? { ...body, stream: true } : body;
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: options.family, body: sendBody }),
    });
    if (!response.ok) {
      let message = `Relay request failed (${response.status})`;
      try {
        const err = await response.json();
        message = err.error?.message || err.error || err.message || message;
      } catch { /* plaintext / empty body */ }
      throw new Error(message);
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (wantStream && contentType.includes('text/event-stream')) {
      return options.family === 'anthropic'
        ? reassembleAnthropicStream(response)
        : reassembleOpenAIStream(response);
    }
    return response.json();
  };
}

export function createProxyTransport(options: {
  endpoint: string;
  baseUrl: string;
  apiKey: string;
}): RuntimeTransport {
  return async (body) => {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: options.baseUrl, apiKey: options.apiKey, ...body }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Proxy request failed' }));
      throw new Error(error.message || error.error?.message || 'Proxy request failed');
    }

    return response.json();
  };
}

export interface RuntimeAIServiceOptions {
  family: RuntimeProviderFamily;
  transport: RuntimeTransport;
  /** Model id; defaults per family (DEFAULT_ANTHROPIC_MODEL / DEFAULT_OPENAI_MODEL). */
  model?: string;
  /** Optional log prefix, e.g. '[PreviewWindow]' — errors/debug lines use it. */
  logPrefix?: string;
}

/** Extract the assistant text from an Anthropic Messages response. */
function anthropicText(response: any): string {
  // With extended thinking enabled the response may carry a leading
  // `thinking` block before the `text` block — find the text block rather
  // than assuming content[0].
  const content = Array.isArray(response?.content)
    ? response.content.find((c: any) => c?.type === 'text') ?? response.content[0]
    : undefined;
  if (content?.type === 'text' && typeof content.text === 'string') {
    return content.text;
  }
  // Keep the 'Unexpected response type from Claude' prefix — classifyContent
  // prefix-matches it for its first-category fallback.
  const stop = response?.stop_reason ?? 'unknown';
  const types = Array.isArray(response?.content)
    ? response.content.map((c: any) => c?.type ?? '?').join(', ') || 'none'
    : 'none';
  throw new Error(
    `Unexpected response type from Claude (stop_reason=${stop}, blocks=[${types}])`
  );
}

/** Extract the assistant text from an OpenAI chat-completions response. */
function openaiText(response: any): string {
  return response?.choices?.[0]?.message?.content || '';
}

/**
 * Create an IAIService for runtime AI beats (OnlineContentBeat,
 * AIDialogTreeBeat, AIConversationBeat, AIConditionBeat, InputImageBeat, …).
 *
 * Behavior notes (reconciled across the historical copies — the
 * PreviewWindow copy, being the most evolved, won every conflict):
 *   - thinking/reasoning blocks are stripped from ALL text results
 *   - token budgets get reasoning-model headroom via effectiveMaxTokens
 *   - dialog-tree JSON goes through extractJSON + repair
 *   - 'text'-format dialog tries strict JSON first, falls back to raw text
 *     (NO repair pass there — repair could mangle prose containing a `{`)
 */
export function createRuntimeAIService(options: RuntimeAIServiceOptions): IAIService {
  const { family, transport } = options;
  const model = options.model
    || (family === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);
  const logPrefix = options.logPrefix ?? '[RuntimeAIService]';

  /** One chat round-trip returning the raw assistant text (thinking stripped). */
  async function complete(args: {
    systemPrompt?: string;
    messages: Array<{ role: string; content: unknown }>;
    maxTokens: number;
  }): Promise<string> {
    if (family === 'anthropic') {
      const body: Record<string, unknown> = {
        model,
        max_tokens: effectiveMaxTokens(model, args.maxTokens),
        messages: args.messages,
      };
      if (args.systemPrompt) body.system = args.systemPrompt;
      const response = await transport(body);
      return stripThinkingBlocks(anthropicText(response));
    }

    // OpenAI-compatible. buildChatRequestBody passes messages through
    // untouched, so multimodal content-parts arrays survive intact.
    const messages = args.systemPrompt
      ? [{ role: 'system', content: args.systemPrompt }, ...args.messages]
      : args.messages;
    const body = buildChatRequestBody(
      model,
      messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      effectiveMaxTokens(model, args.maxTokens)
    );
    const response = await transport(body);
    return stripThinkingBlocks(openaiText(response));
  }

  return {
    async generateContent(prompt: string, options?: { maxTokens?: number }): Promise<string> {
      return complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: options?.maxTokens ?? 4096,
      });
    },

    async generateDialog(request: { prompt: string; format: string; maxTurns?: number }): Promise<any> {
      const isTextFormat = request.format === 'text';
      const systemPrompt = isTextFormat
        ? `You are a character in an interactive story. Respond with ONLY dialog text.`
        : `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.`;

      const text = await complete({
        systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
        maxTokens: isTextFormat ? 1024 : 16000,
      });

      if (isTextFormat) {
        // Try strict JSON first (the AI might wrap the text in an object),
        // fall back to the raw text. Deliberately NO repair pass here.
        try {
          return JSON.parse(extractJSON(text));
        } catch {
          return text;
        }
      }

      try {
        return parseJSONWithRepair(text);
      } catch (e) {
        console.error(`${logPrefix} Failed to parse dialog response:`, e);
        console.error(`${logPrefix} Raw response:`, text.substring(0, 500));
        throw new Error('No valid JSON found in response');
      }
    },

    async generateConversationTurn(request: {
      systemPrompt: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{ text: string }> {
      if (family === 'anthropic') {
        // Claude takes the system prompt as a top-level field and only
        // accepts user/assistant roles in messages.
        const claudeMessages = request.messages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const text = await complete({
          systemPrompt: request.systemPrompt,
          messages: claudeMessages.length > 0
            ? claudeMessages
            : [{ role: 'user', content: 'Begin.' }],
          maxTokens: 1000,
        });
        return { text };
      }

      const messages: Array<{ role: string; content: string }> = request.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      // Ensure at least one user message
      if (!messages.some(m => m.role === 'user')) {
        messages.push({ role: 'user', content: 'Begin.' });
      }
      const text = await complete({
        systemPrompt: request.systemPrompt,
        messages,
        maxTokens: 1000,
      });
      return { text: text.trim() };
    },

    async classifyContent(prompt: string, categories: string[]): Promise<string> {
      const systemPrompt = `You are a classifier. Classify into ONE of these categories: ${categories.join(', ')}. Respond with ONLY the category name.`;
      let result: string;
      try {
        result = await complete({
          systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 100,
        });
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Unexpected response type from Claude')) {
          // Historical behavior: a non-text Claude response classifies as
          // the first category instead of failing the beat.
          return categories[0];
        }
        throw e;
      }
      const trimmed = result.trim();
      const match = categories.find(c => c.toLowerCase() === trimmed.toLowerCase());
      return match || categories[0];
    },

    async analyzeImage(
      image: { base64: string; mediaType: string },
      prompt: string,
      options?: { maxTokens?: number }
    ): Promise<string> {
      const maxTokens = options?.maxTokens ?? 1024;

      if (family === 'anthropic') {
        const text = await complete({
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
              { type: 'text', text: prompt },
            ],
          }],
          maxTokens,
        });
        return text.trim();
      }

      // OpenAI-compatible vision via image_url content parts. Local models
      // without vision support return an API error here, which the beat
      // turns into its fallbackValue.
      const text = await complete({
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        maxTokens,
      });
      return text.trim();
    },
  };
}
