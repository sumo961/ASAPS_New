/**
 * Tests for ClaudeProvider's pure, non-network logic:
 *   - configure(): readiness gating, model defaulting, proxy detection
 *   - the reasoning-effort → thinking-config mapping (both the legacy
 *     budget_tokens shape and the newer adaptive shape) and the
 *     model-detection that chooses between them
 *   - repairTruncatedJson(): the malformed/truncated-JSON salvage path
 *
 * The network methods (generateStory etc.) go through fetch / the
 * Anthropic SDK and are out of scope here — this file pins the decision
 * logic those methods depend on.
 *
 * NOTE: requiresAdaptiveThinking + the effort budgets encode Anthropic
 * API specifics. These tests PIN the current behavior (so refactors are
 * safe); they are not an assertion that the current mapping is the
 * API-correct one. See the date-suffixed-model test for a flagged edge.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeProvider } from '../ClaudeProvider';
import type { AIProviderConfig } from '../../../types/ai';

function cfg(over: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return { provider: 'claude', apiKey: 'sk-test', ...over };
}

let p: ClaudeProvider;
beforeEach(() => {
  p = new ClaudeProvider();
});

describe('configure', () => {
  it('is not ready and keeps defaults when the api key is missing', () => {
    p.configure(cfg({ apiKey: '' }));
    expect(p.isReady()).toBe(false);
    expect((p as any).model).toBe('claude-sonnet-4-6'); // unchanged default
  });

  it('becomes ready and defaults the model when none is supplied', () => {
    p.configure(cfg());
    expect(p.isReady()).toBe(true);
    expect((p as any).model).toBe('claude-sonnet-4-6');
    expect((p as any).useProxy).toBe(false);
  });

  it('uses the supplied model', () => {
    p.configure(cfg({ model: 'claude-opus-4-7' }));
    expect((p as any).model).toBe('claude-opus-4-7');
  });

  it('routes through the proxy when a custom baseUrl is set', () => {
    p.configure(cfg({ baseUrl: 'https://my-gateway.example/v1' }));
    expect((p as any).useProxy).toBe(true);
  });

  it('reports its provider name', () => {
    expect(p.name).toBe('claude');
  });
});

describe('requiresAdaptiveThinking (model detection)', () => {
  const detect = (model: string) => {
    p.configure(cfg({ model }));
    return (p as any).requiresAdaptiveThinking();
  };

  it('is true for Opus/Sonnet from the X.6 generation', () => {
    expect(detect('claude-sonnet-4-6')).toBe(true);
    expect(detect('claude-opus-4-6')).toBe(true);
    expect(detect('claude-opus-4-7')).toBe(true);
    expect(detect('claude-opus-4-8')).toBe(true);
  });

  it('is true for any Opus/Sonnet major >= 5', () => {
    expect(detect('claude-opus-5-0')).toBe(true);
    expect(detect('claude-sonnet-5-1')).toBe(true);
  });

  it('is false for Opus/Sonnet 4.5-and-earlier (legacy budget_tokens)', () => {
    // 4.5 predates adaptive thinking — effort errors on Sonnet 4.5, and
    // adaptive is documented as Opus 4.6+/Sonnet 4.6+ only.
    expect(detect('claude-opus-4-5')).toBe(false);
    expect(detect('claude-sonnet-4-5')).toBe(false);
    expect(detect('claude-opus-4-1')).toBe(false);
    expect(detect('claude-sonnet-4-0')).toBe(false);
  });

  it('is false for ALL Haiku 4.x — Haiku has no adaptive variant', () => {
    // Per the Anthropic API reference, Haiku 4.5 rejects the effort param
    // and is not in the adaptive-thinking list. A hypothetical Haiku 5+
    // would qualify on the major>=5 rule.
    expect(detect('claude-haiku-4-5')).toBe(false);
    expect(detect('claude-haiku-5-0')).toBe(true);
  });

  it('is false for non-matching model ids (e.g. claude-3-5-sonnet)', () => {
    expect(detect('claude-3-5-sonnet-20241022')).toBe(false);
    expect(detect('some-other-model')).toBe(false);
  });

  it('treats date-suffixed model ids (claude-sonnet-4-20250514) as legacy, not adaptive', () => {
    // Regression: the regex used to read the date "20250514" as the minor
    // version (>= 5) and class the original May-2025 Sonnet 4 as adaptive.
    // Verified against the Anthropic API reference: that model predates
    // adaptive thinking and uses the legacy enabled+budget_tokens shape.
    // Since it is ALSO the provider's default model, the misclassification
    // would 400 every reasoningEffort request. The >2-digit-segment guard
    // fixes it.
    expect(detect('claude-sonnet-4-20250514')).toBe(false);
    expect(detect('claude-opus-4-20250514')).toBe(false);
  });
});

describe('thinking shape end-to-end (applyThinkingConfig)', () => {
  it('default model (Sonnet 4.6) emits the adaptive shape', () => {
    p.configure(cfg({ reasoningEffort: 'high' })); // no model → default claude-sonnet-4-6
    const body: any = {};
    (p as any).applyThinkingConfig(body);
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'high' });
  });

  it('a dated legacy model emits enabled+budget_tokens (regression guard)', () => {
    // The original dated Sonnet 4 must take the legacy path, not adaptive —
    // this is the bug the >2-digit-segment guard fixes.
    p.configure(cfg({ model: 'claude-sonnet-4-20250514', reasoningEffort: 'high' }));
    const body: any = {};
    (p as any).applyThinkingConfig(body);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 20000 });
    expect(body.output_config).toBeUndefined();
  });
});

describe('getThinkingBudget (legacy shape)', () => {
  const budget = (over: Partial<AIProviderConfig>) => {
    p.configure(cfg(over));
    return (p as any).getThinkingBudget();
  };

  it('returns undefined when proxied (most proxies reject thinking)', () => {
    expect(budget({ baseUrl: 'https://gw/v1', reasoningEffort: 'high' })).toBeUndefined();
  });

  it('returns undefined when effort is unset or none', () => {
    expect(budget({})).toBeUndefined();
    expect(budget({ reasoningEffort: 'none' })).toBeUndefined();
  });

  it('maps each effort tier to its budget', () => {
    expect(budget({ reasoningEffort: 'minimal' })).toBe(1024);
    expect(budget({ reasoningEffort: 'low' })).toBe(4000);
    expect(budget({ reasoningEffort: 'medium' })).toBe(10000);
    expect(budget({ reasoningEffort: 'high' })).toBe(20000);
    expect(budget({ reasoningEffort: 'xhigh' })).toBe(32000);
    expect(budget({ reasoningEffort: 'max' })).toBe(32000); // capped at xhigh on legacy
  });
});

describe('getAdaptiveEffort (adaptive shape)', () => {
  const eff = (over: Partial<AIProviderConfig>) => {
    p.configure(cfg(over));
    return (p as any).getAdaptiveEffort();
  };

  it('returns undefined when proxied or effort unset/none', () => {
    expect(eff({ baseUrl: 'https://gw', reasoningEffort: 'high' })).toBeUndefined();
    expect(eff({})).toBeUndefined();
    expect(eff({ reasoningEffort: 'none' })).toBeUndefined();
  });

  it('collapses minimal to low and passes the rest through', () => {
    expect(eff({ reasoningEffort: 'minimal' })).toBe('low');
    expect(eff({ reasoningEffort: 'low' })).toBe('low');
    expect(eff({ reasoningEffort: 'medium' })).toBe('medium');
    expect(eff({ reasoningEffort: 'high' })).toBe('high');
    expect(eff({ reasoningEffort: 'xhigh' })).toBe('xhigh');
    expect(eff({ reasoningEffort: 'max' })).toBe('max');
  });
});

describe('applyThinkingConfig', () => {
  const apply = (over: Partial<AIProviderConfig>) => {
    p.configure(cfg(over));
    const body: any = {};
    (p as any).applyThinkingConfig(body);
    return body;
  };

  it('writes the adaptive shape for a newer model', () => {
    const body = apply({ model: 'claude-sonnet-4-6', reasoningEffort: 'high' });
    expect(body.thinking).toEqual({ type: 'adaptive' });
    expect(body.output_config).toEqual({ effort: 'high' });
  });

  it('writes the legacy budget shape for an older model', () => {
    const body = apply({ model: 'claude-opus-4-1', reasoningEffort: 'medium' });
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
    expect(body.output_config).toBeUndefined();
  });

  it('adds nothing when effort is absent', () => {
    const body = apply({ model: 'claude-sonnet-4-6' });
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
  });

  it('adds nothing when proxied (both shapes suppressed)', () => {
    const body = apply({ model: 'claude-sonnet-4-6', baseUrl: 'https://gw', reasoningEffort: 'high' });
    expect(body.thinking).toBeUndefined();
  });
});

describe('repairTruncatedJson', () => {
  const repair = (s: string) => (p as any).repairTruncatedJson(s) as string;

  it('leaves already-valid JSON parseable', () => {
    const out = repair('{"a":"b","n":1}');
    expect(JSON.parse(out)).toEqual({ a: 'b', n: 1 });
  });

  it('quotes unquoted property names', () => {
    const out = repair('{a: "b", c: 1}');
    expect(JSON.parse(out)).toEqual({ a: 'b', c: 1 });
  });

  it('repairs a property name missing its closing quote (the Kimi case)', () => {
    const out = repair('{"description: "hello"}');
    expect(JSON.parse(out)).toEqual({ description: 'hello' });
  });

  it('closes unbalanced braces', () => {
    const out = repair('{"a": {"b": 1');
    expect(JSON.parse(out)).toEqual({ a: { b: 1 } });
  });

  it('closes unbalanced brackets', () => {
    const out = repair('{"a": [1, 2');
    expect(JSON.parse(out)).toEqual({ a: [1, 2] });
  });

  it('drops a trailing comma', () => {
    const out = repair('{"a": 1,');
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it('does not treat braces inside string values as structure', () => {
    const out = repair('{"a": "x{y}z"}');
    expect(JSON.parse(out)).toEqual({ a: 'x{y}z' });
  });
});
