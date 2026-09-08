import { describe, it, expect } from 'vitest';
import { reconcileLegacyMaxTokens } from '../aiConfigBudget';

describe('reconcileLegacyMaxTokens', () => {
  it('drops a legacy value below the automatic budget (the 32000-on-opus-5 install)', () => {
    const r = reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-5', maxTokens: 32000 });
    expect(r.dropped).toBe(32000);
    expect(r.automatic).toBe(64000);
    expect(r.config.maxTokens).toBeUndefined();
  });
  it('keeps a value the user entered deliberately', () => {
    const r = reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-5', maxTokens: 32000, maxTokensUserSet: true });
    expect(r.dropped).toBeUndefined();
    expect(r.config.maxTokens).toBe(32000);
  });
  it('keeps a raise (a value at or above the automatic budget)', () => {
    expect(reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-5', maxTokens: 96000 }).config.maxTokens).toBe(96000);
    expect(reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-4-8', maxTokens: 32000 }).config.maxTokens).toBe(32000);
  });
  it('scales with reasoning effort', () => {
    const r = reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-5', reasoningEffort: 'xhigh', maxTokens: 64000 });
    expect(r.dropped).toBe(64000);
    expect(r.automatic).toBe(96000);
  });
  it('leaves non-Claude providers and empty fields alone', () => {
    expect(reconcileLegacyMaxTokens({ provider: 'openai', model: 'gpt-5', maxTokens: 4000 }).config.maxTokens).toBe(4000);
    expect(reconcileLegacyMaxTokens({ provider: 'claude', model: 'claude-opus-5' }).dropped).toBeUndefined();
  });
});
