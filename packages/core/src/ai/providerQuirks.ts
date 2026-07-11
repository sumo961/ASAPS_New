/**
 * Provider quirk helpers — single source of truth.
 *
 * ASAPS has three AI-call code paths that historically each re-implemented
 * the same provider-specific workarounds, so every quirk fix had to be
 * written three times or it shipped to only one path and the others stayed
 * broken until a field report:
 *
 *   1. Builder path    — AIService + OpenAIProvider/ClaudeProvider
 *   2. In-app runtime  — PreviewWindow's inline AIServiceAdapter
 *   3. Exported runtime — packages/player-web/src/WebAIProvider.ts
 *
 * This module lives in @asaps/core (which all three paths already depend on)
 * and has ZERO dependencies on the builder package, so player-web can import
 * it without pulling in Zustand/ReactFlow/the editor. Keep it that way: no
 * imports from @asaps/builder, no DOM, no framework. Pure functions only.
 */

/**
 * Whether a model requires `max_completion_tokens` instead of the legacy
 * `max_tokens` field.
 *
 * Modern OpenAI models (GPT-4o, o1, o3, o4, GPT-5) require the newer
 * parameter. Moonshot Kimi K2 (incl. K2.5/K2.6/kimi-k2-thinking) also
 * deprecated `max_tokens` in favour of `max_completion_tokens` per
 * platform.kimi.ai docs.
 */
export function requiresMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase();
  if (m.startsWith('gpt-5')) return true;
  if (m.includes('gpt-4o')) return true;
  if (m.startsWith('o1')) return true;
  if (m.startsWith('o3')) return true;
  if (m.startsWith('o4')) return true;
  if (m.includes('kimi-k2')) return true;
  // Older / third-party models still use max_tokens.
  return false;
}

/**
 * Whether a model is a reasoning model. Reasoning models reject an explicit
 * `temperature` (it must stay at the default 1) and spend hidden
 * `reasoning_content` tokens against the completion-token budget.
 *
 * `reasoningEffort` being set at all also implies a reasoning model — some
 * OpenAI-compatible endpoints accept an effort knob on otherwise-unmarked
 * model ids.
 */
export function isReasoningModel(model: string, reasoningEffort?: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('o1') ||
         m.startsWith('o3') ||
         m.startsWith('gpt-5') ||
         m.includes('kimi-k2') ||
         !!reasoningEffort;
}

/**
 * Apply reasoning-model headroom to a caller-requested maxTokens budget.
 *
 * Reasoning models (Kimi K2 series, GPT-5, o-series) count their internal
 * reasoning_content against the completion-token budget. Callers that size a
 * request for the *visible* output (e.g. AIInfoTextBeat asks for 250 tokens
 * for 2-3 sentences) get a truncated or empty response on a reasoning model
 * because the hidden reasoning ate the whole budget. Flooring at 4096 gives
 * reasoning models room to think AND emit the visible content, while leaving
 * non-reasoning models exactly what the caller asked for.
 */
export function effectiveMaxTokens(model: string | undefined, requested: number): number {
  if (model && isReasoningModel(model)) {
    return Math.max(requested, 4096);
  }
  return requested;
}

/**
 * Strip inline thinking/reasoning blocks from a model's text response.
 *
 * Some models (Kimi, DeepSeek, some local models) emit `<think>`,
 * `<thinking>`, or `<reasoning>` blocks inline in the content rather than in
 * a separate API field. These must not reach the player/UI. Also collapses
 * the leftover blank-line runs and trims edge whitespace so the visible text
 * reads cleanly.
 *
 * Note: this handles the *XML-tagged* case only. The deprecated
 * StoryPreview component additionally tried to strip *untagged* plain-text
 * reasoning preambles via heuristics; that behaviour is intentionally NOT
 * folded in here (it is risky and that component is on its way out).
 */
export function stripThinkingBlocks(text: string): string {
  let result = text;
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, '');
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  result = result.replace(/^\s+/, '').replace(/\s+$/, '');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

/**
 * Build an OpenAI-style chat-completion request body with the correct
 * parameters for the given model:
 *   - max_completion_tokens vs max_tokens (per requiresMaxCompletionTokens)
 *   - response_format (when requested)
 *   - reasoning_effort (when requested)
 *   - temperature ONLY for non-reasoning models (reasoning models 400 on it)
 */
export function buildChatRequestBody(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  options?: {
    temperature?: number;
    reasoningEffort?: string;
    responseFormat?: { type: string };
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (requiresMaxCompletionTokens(model)) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  if (options?.reasoningEffort !== undefined) {
    body.reasoning_effort = options.reasoningEffort;
  }

  if (!isReasoningModel(model, options?.reasoningEffort) && options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  return body;
}

/**
 * Whether a model supports OpenAI's `reasoning.mode: "pro"` (deep reasoning
 * via the Responses API). Introduced with the GPT-5.6 tier family
 * (Sol/Terra/Luna, GA 2026-07-09); Sol is the documented pro-mode target.
 * Pro mode is NOT available on Chat Completions — callers must route
 * through POST /v1/responses, which only the official OpenAI endpoint
 * serves. Third-party OpenAI-compatible servers (Ollama, Kimi, custom
 * proxies) implement /chat/completions only, so pro must never change the
 * request shape for them.
 */
export function supportsProReasoning(model: string): boolean {
  return model.toLowerCase().startsWith('gpt-5.6');
}

/**
 * Build an OpenAI Responses-API request body (POST /v1/responses) for
 * pro-mode reasoning. Field shapes per developers.openai.com:
 *   - `input` takes the same role/content message array
 *   - the token cap is `max_output_tokens`
 *   - `reasoning: { mode: "pro", effort? }` — pro mode accepts only the
 *     medium/high/xhigh efforts, so lower tiers are omitted (API default)
 *     and the Anthropic-only 'max' is capped to 'xhigh'
 * Deliberately NO response_format equivalent: the JSON-forcing shape
 * differs on the Responses API and our callers already tolerate prose-
 * wrapped JSON via extractJSON + repair. Temperature is never sent
 * (reasoning models reject it).
 */
export function buildResponsesRequestBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  options?: {
    reasoningEffort?: string;
  }
): Record<string, unknown> {
  const reasoning: Record<string, unknown> = { mode: 'pro' };
  const effort = options?.reasoningEffort === 'max' ? 'xhigh' : options?.reasoningEffort;
  if (effort === 'medium' || effort === 'high' || effort === 'xhigh') {
    reasoning.effort = effort;
  }
  return {
    model,
    input: messages.map(m => ({ role: m.role, content: m.content })),
    max_output_tokens: maxTokens,
    reasoning,
  };
}

/**
 * Extract the assistant text from a (non-streaming) Responses-API result.
 * The raw REST shape is an `output` array whose message items carry
 * content parts of type `output_text`; some servers also include the SDK
 * convenience field `output_text`.
 */
export function extractResponsesOutputText(json: any): string {
  if (typeof json?.output_text === 'string' && json.output_text.length > 0) {
    return json.output_text;
  }
  const parts: string[] = [];
  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          parts.push(part.text);
        }
      }
    }
  }
  return parts.join('');
}
