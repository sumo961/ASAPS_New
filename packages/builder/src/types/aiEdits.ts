/**
 * AI edits ledger — every edit an AI surface proposed for this project and
 * what the author decided, kept WITH the project (folder, IndexedDB, zip)
 * so it travels and survives, unlike a per-machine session store.
 *
 * Why: a project mixes the author's writing with AI-authored edits from the
 * generator review, its "Ask AI", and the Co-Designer. Authorship questions
 * ("which parts did the AI write?"), research on co-creative authoring, and
 * diagnosis a week later ("did an AI batch touch these beats?") all need the
 * record of proposals AND decisions — declined proposals included.
 */

export type AIEditSource = 'generator-review' | 'ask-ai' | 'co-designer';

export type AIEditDecision = 'accepted' | 'rejected' | 'skipped' | 'failed';

export interface AIEditEntry {
  id: string;
  /** ISO timestamp of the decision. */
  at: string;
  source: AIEditSource;
  decision: AIEditDecision;
  /** Groups the proposals of one batch (a Co-Designer proposal set title, a review finding id). */
  batch?: string;
  /** One sentence, author-facing. */
  summary: string;
  /** Beats the proposal touches (may be empty for character edits). */
  beatIds: string[];
  /** Outcome detail (apply result) or the reason for a rejection. */
  detail?: string;
  /** The proposal as the surface produced it — raw, for research and replay. */
  proposal?: unknown;
}

export interface AIEditLedger {
  version: 1;
  entries: AIEditEntry[];
}
