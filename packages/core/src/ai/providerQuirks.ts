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
  if (m.startsWith('gpt-6')) return true;
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
         m.startsWith('gpt-6') ||
         m.includes('kimi-k2') ||
         !!reasoningEffort;
}

/**
 * Whether a model is GPT-6 Astra (`gpt-6-astra`, OpenAI's flagship since
 * September 2026, 1.05M context / 128K output). Astra differs from the
 * GPT-5.x families in three ways that matter to request shape:
 *   - reasoning effort accepts low|medium|high|xhigh|max — `none` and
 *     `minimal` return HTTP 400 (developers.openai.com/api/docs/guides/latest-model)
 *   - function tools are Responses-API only ("Chat Completions does not
 *     support function calling with GPT-6 Astra")
 *   - no `reasoning.mode: pro` (that stays a GPT-5.6 feature)
 */
export function isGpt6Model(model: string | undefined): boolean {
  return !!model && model.toLowerCase().startsWith('gpt-6');
}

/**
 * Translate ASAPS's provider-neutral reasoning effort into the value OpenAI
 * accepts for the given model. Returns undefined when nothing should be
 * sent (model default).
 *
 *   - 'max' is honoured by GPT-6 Astra; every other OpenAI model caps it at
 *     'xhigh' (the tier below), so a global 'max' never 400s on a provider
 *     switch.
 *   - 'none' / 'minimal' are rejected by GPT-6 Astra; OpenAI's migration
 *     note says "start with low and compare results", so that is what Astra
 *     receives. Other models pass them through untouched.
 */
export function openaiReasoningEffort(
  model: string | undefined,
  effort: string | undefined,
): string | undefined {
  if (effort === undefined || effort === '') return undefined;
  const gpt6 = isGpt6Model(model);
  if (effort === 'max') return gpt6 ? 'max' : 'xhigh';
  if (gpt6 && (effort === 'none' || effort === 'minimal')) return 'low';
  return effort;
}

/**
 * Whether a base URL points at the official OpenAI API (or is unset, which
 * defaults there). Only the official endpoint serves POST /v1/responses —
 * OpenAI-compatible servers (Ollama, Kimi/Moonshot, DeepSeek, custom
 * proxies) implement /chat/completions only, so anything that changes the
 * request shape to the Responses API must be gated on this.
 */
export function isOfficialOpenAIEndpoint(baseUrl: string | undefined): boolean {
  return !baseUrl || baseUrl.includes('api.openai.com');
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

  const effort = openaiReasoningEffort(model, options?.reasoningEffort);
  if (effort !== undefined) {
    body.reasoning_effort = effort;
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
 * A function tool in the provider-neutral (Anthropic-style) shape ASAPS
 * uses across ClaudeProvider / OpenAIProvider / AIService.
 */
export interface NeutralToolSpec {
  name: string;
  description: string;
  input_schema: unknown;
}

/**
 * A function call the model requested, lifted out of a Responses-API
 * result (`output[]` items of type `function_call`).
 */
export interface ResponsesFunctionCall {
  /** Item id (`fc_…`) — informational; the round-trip key is call_id. */
  id?: string;
  /** Pairs the tool result (`function_call_output.call_id`) to this call. */
  call_id: string;
  name: string;
  /** JSON-encoded arguments string, exactly as the API returned it. */
  arguments: string;
}

/**
 * Build a Responses-API request body for a function-calling turn
 * (POST /v1/responses with `tools`). Used by the OpenAI tool loop on the
 * official endpoint for EVERY model — Chat Completions rejects function
 * tools + reasoning_effort on the GPT-5.6 family ("use /v1/responses or set
 * reasoning_effort to 'none'") and does not support function tools at all
 * on GPT-6 Astra.
 *
 * Shape per developers.openai.com/api/docs/guides/function-calling:
 *   - `instructions` carries the system prompt; `input` is the running item
 *     list (role messages, echoed prior `output` items, and
 *     `function_call_output` results)
 *   - tools are flat `{ type:'function', name, description, parameters }`
 *     (no `function:{}` wrapper as in Chat Completions); `strict:false`
 *     keeps our loosely-typed tool schemas accepted verbatim
 *   - `reasoning.effort` via openaiReasoningEffort; `reasoning.mode:'pro'`
 *     only when the caller asks for it (GPT-5.6 pro mode, medium+ efforts)
 *   - never `temperature` (rejected by reasoning models, unsupported on Astra)
 */
export function buildResponsesToolRequestBody(
  model: string,
  instructions: string,
  input: unknown[],
  tools: NeutralToolSpec[],
  maxTokens: number,
  options?: {
    reasoningEffort?: string;
    proMode?: boolean;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    instructions,
    input,
    tools: tools.map(t => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
      strict: false,
    })),
    max_output_tokens: maxTokens,
  };
  const reasoning: Record<string, unknown> = {};
  if (options?.proMode) {
    reasoning.mode = 'pro';
    const effort = options.reasoningEffort === 'max' ? 'xhigh' : options.reasoningEffort;
    if (effort === 'medium' || effort === 'high' || effort === 'xhigh') reasoning.effort = effort;
  } else {
    const effort = openaiReasoningEffort(model, options?.reasoningEffort);
    if (effort !== undefined) reasoning.effort = effort;
  }
  if (Object.keys(reasoning).length > 0) body.reasoning = reasoning;
  return body;
}

/**
 * Lift the function calls the model requested out of a Responses-API
 * result. Empty when the turn ended in plain text.
 */
export function extractResponsesFunctionCalls(json: any): ResponsesFunctionCall[] {
  const calls: ResponsesFunctionCall[] = [];
  if (!Array.isArray(json?.output)) return calls;
  for (const item of json.output) {
    if (item?.type !== 'function_call') continue;
    if (typeof item.call_id !== 'string' || typeof item.name !== 'string') continue;
    calls.push({
      id: typeof item.id === 'string' ? item.id : undefined,
      call_id: item.call_id,
      name: item.name,
      arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
    });
  }
  return calls;
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
