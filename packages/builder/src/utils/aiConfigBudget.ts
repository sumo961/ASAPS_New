/**
 * Saved Max Tokens vs the automatic budget.
 *
 * The AI settings field says "leave blank", but many installs carry a number
 * anyway — an old placeholder copied in, a value saved by a release that
 * persisted its default, or a project's globalSettings.ai replayed onto a
 * fresh machine. `config.maxTokens || default` then silently defeats every
 * budget improvement: the 2026-09-08 replay ran opus-5 at a stored 32000
 * while the automatic budget for that model was 64000, and both passes
 * truncated mid-JSON.
 *
 * Rule: a stored value is honored when it was entered deliberately
 * (`maxTokensUserSet`, stamped by the settings dialog from now on) or when
 * it is AT LEAST the automatic budget (a raise is always deliberate). A
 * legacy value below the automatic budget is dropped — the field goes back
 * to "automatic" — and the caller logs what happened.
 */
import { defaultStoryMaxTokensFor } from '../services/providers/ClaudeProvider';

export interface BudgetBearingConfig {
  provider?: string;
  providerType?: string;
  model?: string;
  maxTokens?: number;
  maxTokensUserSet?: boolean;
  reasoningEffort?: string;
}

export interface ReconcileResult<T> {
  config: T;
  /** The legacy value that was dropped, when one was. */
  dropped?: number;
  /** The automatic budget the install now runs on. */
  automatic: number;
}

export function reconcileLegacyMaxTokens<T extends BudgetBearingConfig>(config: T): ReconcileResult<T> {
  const automatic = defaultStoryMaxTokensFor(config.reasoningEffort, config.model);
  const isClaude = (config.providerType ?? config.provider) === 'claude';
  const stored = config.maxTokens;
  if (!isClaude || typeof stored !== 'number' || config.maxTokensUserSet || stored >= automatic) {
    return { config, automatic };
  }
  const next = { ...config };
  delete next.maxTokens;
  return { config: next, dropped: stored, automatic };
}
