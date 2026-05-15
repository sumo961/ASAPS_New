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
