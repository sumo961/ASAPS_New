import type { AIEditEntry, AIEditLedger } from '../types/aiEdits';
import type { ChangeProposal, ProposalApplyResult } from '../components/ai/codesigner/types';
import { describeProposal } from '../components/ai/codesigner/proposalParsing';
import type { FixProposal, AIFixSuggestion } from '../types/generationReview';

export type NewAIEditEntry = Omit<AIEditEntry, 'id' | 'at'>;

let seq = 0;
const nextId = () => `aie_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Append entries (newest last), returning a new ledger; `null` in → fresh ledger. */
export function appendAIEdits(ledger: AIEditLedger | null | undefined, entries: NewAIEditEntry[]): AIEditLedger {
  const at = new Date().toISOString();
  const stamped: AIEditEntry[] = entries.map((e) => ({ ...e, id: nextId(), at }));
  return { version: 1, entries: [...(ledger?.entries ?? []), ...stamped] };
}

/** Beats a Co-Designer proposal touches. */
export function beatIdsOfProposal(p: ChangeProposal): string[] {
  switch (p.kind) {
    case 'editText':
    case 'updateParams':
    case 'addNote':
      return [p.beatId];
    case 'addBeat':
      return [p.connectFrom, p.connectTo].filter((x): x is string => typeof x === 'string' && !!x);
    default:
      return [];
  }
}

/** One entry per applied Co-Designer proposal, decision from its apply result. */
export function coDesignerAppliedEntries(
  proposals: ChangeProposal[],
  results: ProposalApplyResult[],
  title?: string,
): NewAIEditEntry[] {
  return proposals.map((p, index) => {
    const r = results.find((x) => x.index === index);
    return {
      source: 'co-designer', decision: r && !r.ok ? 'failed' : 'accepted', batch: title,
      summary: describeProposal(p), beatIds: beatIdsOfProposal(p), ...(r?.detail ? { detail: r.detail } : {}), proposal: p,
    };
  });
}

/** Proposals the author left unticked or dismissed with the batch. */
export function coDesignerDeclinedEntries(proposals: ChangeProposal[], title?: string, reason = 'Not selected by the author'): NewAIEditEntry[] {
  return proposals.map((p) => ({
    source: 'co-designer', decision: 'rejected', batch: title, summary: describeProposal(p), beatIds: beatIdsOfProposal(p), detail: reason, proposal: p,
  }));
}

/** A review-banner proposal settled (deterministic or AI-authored). */
export function reviewProposalEntry(p: FixProposal, decision: 'accepted' | 'skipped'): NewAIEditEntry {
  return {
    source: p.source === 'ai' ? 'ask-ai' : 'generator-review', decision, batch: p.findingId,
    summary: p.description, beatIds: [p.beatId], proposal: p,
  };
}

/** An "Ask AI" suggestion the author rejected as a whole. */
export function aiFixRejectedEntries(s: AIFixSuggestion, reason = 'Rejected by the author'): NewAIEditEntry[] {
  return s.edits.map((e) => ({
    source: 'ask-ai', decision: 'rejected', batch: s.findingId, summary: e.description, beatIds: [e.beatId], detail: reason, proposal: e,
  }));
}
