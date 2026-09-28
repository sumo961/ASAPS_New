/**
 * Per-route token accounting for AI requests — what each kind of call costs,
 * and whether prompt caching is paying off. Kept in memory for the session;
 * `globalThis.asapsAIUsage.summary()` prints it from a devtools console.
 */

export interface AIUsageTotals {
  route: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const totals = new Map<string, AIUsageTotals>();

/**
 * Record one response's usage. Accepts the Anthropic shape (input_tokens,
 * output_tokens, cache_read_input_tokens, cache_creation_input_tokens) and
 * the OpenAI shape (prompt_tokens, completion_tokens,
 * prompt_tokens_details.cached_tokens). Missing usage is a no-op.
 */
export function recordAIUsage(route: string, model: string, usage: any): void {
  if (!usage || typeof usage !== 'object') return;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const cachedOpenAI = n(usage.prompt_tokens_details?.cached_tokens);
  const input = usage.input_tokens !== undefined ? n(usage.input_tokens) : n(usage.prompt_tokens) - cachedOpenAI;
  const output = usage.output_tokens !== undefined ? n(usage.output_tokens) : n(usage.completion_tokens);
  const cacheRead = usage.cache_read_input_tokens !== undefined ? n(usage.cache_read_input_tokens) : cachedOpenAI;
  const cacheWrite = n(usage.cache_creation_input_tokens);

  const key = `${route}|${model}`;
  const t = totals.get(key) ?? { route, model, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  t.calls += 1;
  t.inputTokens += input;
  t.outputTokens += output;
  t.cacheReadTokens += cacheRead;
  t.cacheWriteTokens += cacheWrite;
  totals.set(key, t);
  console.log(
    `[AI usage] ${route} (${model}): in=${input} out=${output}` +
      (cacheRead || cacheWrite ? ` cache read=${cacheRead} write=${cacheWrite}` : ''),
  );
}

/** Totals per route and model, biggest input first. */
export function getAIUsageSummary(): AIUsageTotals[] {
  return [...totals.values()].sort((a, b) => b.inputTokens + b.cacheReadTokens - (a.inputTokens + a.cacheReadTokens));
}

export function resetAIUsage(): void {
  totals.clear();
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).asapsAIUsage = { summary: getAIUsageSummary, reset: resetAIUsage };
}
