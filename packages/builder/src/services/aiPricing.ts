/**
 * What AI use costs in dollars, from the token counts the provider reports.
 * Standard API list prices per million tokens. A model not listed here (local
 * models, proxies, newer releases) stays in tokens: never a guessed price.
 * Checked 2026-11-01: platform.claude.com/docs/en/about-claude/pricing,
 * developers.openai.com/api/docs/pricing.
 */
import { getAIUsageSummary, type AIUsageTotals } from '@asaps/core';

export interface ModelPrice { input: number; cacheWrite: number; cacheRead: number; output: number }

const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50 },
  'claude-fable-5': { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-8': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'gpt-6-astra': { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
};

export const priceOf = (model: string | undefined): ModelPrice | null => (model && PRICES[model]) || null;

export interface AISpend {
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Calls on a model with no known price: costUsd leaves them out. */
  unpricedCalls: number;
}

export const NO_SPEND: AISpend = { calls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0 };

export function addSpend(a: AISpend | undefined, b: AISpend): AISpend {
  const s = a ?? NO_SPEND;
  return {
    calls: s.calls + b.calls,
    inputTokens: s.inputTokens + b.inputTokens,
    cacheReadTokens: s.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: s.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: s.outputTokens + b.outputTokens,
    costUsd: s.costUsd + b.costUsd,
    unpricedCalls: s.unpricedCalls + b.unpricedCalls,
  };
}

const costOf = (t: Pick<AISpend, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'outputTokens'>, p: ModelPrice) =>
  (t.inputTokens * p.input + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite + t.outputTokens * p.output) / 1e6;

/** Takes what was used on a route since the last call, so overlapping requests are each counted once. */
export function createSpendMeter(route: string, read: () => AIUsageTotals[] = getAIUsageSummary): () => AISpend {
  const key = (t: AIUsageTotals) => t.model;
  const snapshot = () => new Map(read().filter((t) => t.route === route).map((t) => [key(t), t]));
  let seen = snapshot();
  return () => {
    const now = snapshot();
    let out = NO_SPEND;
    for (const [model, t] of now) {
      const was = seen.get(model);
      const d = {
        calls: t.calls - (was?.calls ?? 0),
        inputTokens: t.inputTokens - (was?.inputTokens ?? 0),
        cacheReadTokens: t.cacheReadTokens - (was?.cacheReadTokens ?? 0),
        cacheWriteTokens: t.cacheWriteTokens - (was?.cacheWriteTokens ?? 0),
        outputTokens: t.outputTokens - (was?.outputTokens ?? 0),
      };
      if (d.calls === 0) continue;
      const price = priceOf(model);
      out = addSpend(out, { ...d, costUsd: price ? costOf(d, price) : 0, unpricedCalls: price ? 0 : d.calls });
    }
    seen = now;
    return out;
  };
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return 'under $0.01';
  return `$${n.toFixed(2)}`;
}

export const formatTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Dollars when every call has a price, tokens otherwise. */
export function describeSpend(s: AISpend): string {
  const tokens = `${formatTokens(s.inputTokens + s.cacheWriteTokens)} tokens in, ${formatTokens(s.cacheReadTokens)} from cache, ${formatTokens(s.outputTokens)} out`;
  const requests = `${s.calls} ${s.calls === 1 ? 'request' : 'requests'}`;
  if (s.calls === s.unpricedCalls) return `${tokens}, ${requests}`;
  const cost = s.unpricedCalls > 0 ? `${formatUsd(s.costUsd)} plus ${s.unpricedCalls} unpriced` : formatUsd(s.costUsd);
  return `${cost} (${tokens}, ${requests})`;
}
