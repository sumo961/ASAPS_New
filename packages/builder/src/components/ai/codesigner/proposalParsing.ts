/**
 * Extraction + validation of ChangeProposalSets from Co-Designer replies.
 *
 * Protocol: when the author asks the model to implement agreed changes, the
 * model ends its reply with a fenced block:
 *
 *   ```asaps-proposals
 *   { "title": "...", "proposals": [ ... ] }
 *   ```
 *
 * The block is stripped from the visible chat text; the parsed set drives
 * the proposal card. Tolerant parsing via the shared JSON repair chain.
 */

import { parseJSONWithRepair } from '@asaps/core';
import type { ChangeProposal, ChangeProposalSet } from './types';

const BLOCK_RE = /```asaps-proposals\s*([\s\S]*?)```/;

const VALID_KINDS = new Set(['editText', 'updateParams', 'addBeat', 'addNote', 'updateCharacter']);

function normalizeProposal(raw: any): ChangeProposal | null {
  if (!raw || typeof raw !== 'object' || !VALID_KINDS.has(raw.kind)) return null;
  switch (raw.kind as ChangeProposal['kind']) {
    case 'editText':
      if (typeof raw.beatId !== 'string' || typeof raw.param !== 'string' || typeof raw.newValue !== 'string') return null;
      return { kind: 'editText', beatId: raw.beatId, param: raw.param, newValue: raw.newValue, note: typeof raw.note === 'string' ? raw.note : undefined };
    case 'updateParams':
      if (typeof raw.beatId !== 'string' || !raw.params || typeof raw.params !== 'object') return null;
      return { kind: 'updateParams', beatId: raw.beatId, params: raw.params, note: typeof raw.note === 'string' ? raw.note : undefined };
    case 'addBeat':
      if (typeof raw.beatType !== 'string' || typeof raw.name !== 'string') return null;
      return {
        kind: 'addBeat',
        beatType: raw.beatType,
        name: raw.name,
        parameters: raw.parameters && typeof raw.parameters === 'object' ? raw.parameters : undefined,
        connectFrom: typeof raw.connectFrom === 'string' ? raw.connectFrom : undefined,
        connectTo: typeof raw.connectTo === 'string' ? raw.connectTo : undefined,
        connectLabel: typeof raw.connectLabel === 'string' ? raw.connectLabel : undefined,
        note: typeof raw.note === 'string' ? raw.note : undefined,
      };
    case 'addNote':
      if (typeof raw.beatId !== 'string' || typeof raw.note !== 'string' || !raw.note.trim()) return null;
      return { kind: 'addNote', beatId: raw.beatId, note: raw.note };
    case 'updateCharacter': {
      if (typeof raw.characterId !== 'string' || !raw.updates || typeof raw.updates !== 'object') return null;
      const updates: Record<string, string> = {};
      for (const key of ['displayName', 'description', 'color'] as const) {
        if (typeof raw.updates[key] === 'string') updates[key] = raw.updates[key];
      }
      if (Object.keys(updates).length === 0) return null;
      return { kind: 'updateCharacter', characterId: raw.characterId, updates, note: typeof raw.note === 'string' ? raw.note : undefined };
    }
  }
  return null;
}

export interface ExtractedProposals {
  /** Reply text with the proposal block removed (what the chat shows). */
  cleanText: string;
  /** Parsed + validated set, or null when the reply carries none. */
  proposalSet: ChangeProposalSet | null;
  /** Count of entries dropped by validation (surfaced as a hint). */
  droppedCount: number;
}

export function extractProposalsFromReply(text: string): ExtractedProposals {
  const match = text.match(BLOCK_RE);
  if (!match) return { cleanText: text.trim(), proposalSet: null, droppedCount: 0 };

  const cleanText = text.replace(BLOCK_RE, '').trim();
  try {
    const parsed = parseJSONWithRepair<any>(match[1]);
    const rawList = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
    const proposals = rawList.map(normalizeProposal).filter(Boolean) as ChangeProposal[];
    const droppedCount = rawList.length - proposals.length;
    if (proposals.length === 0) {
      return { cleanText, proposalSet: null, droppedCount };
    }
    return {
      cleanText,
      proposalSet: {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Proposed changes',
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
        proposals,
      },
      droppedCount,
    };
  } catch {
    return { cleanText, proposalSet: null, droppedCount: 0 };
  }
}

/** One-line human description used by the proposal card and result log. */
export function describeProposal(p: ChangeProposal): string {
  switch (p.kind) {
    case 'editText':
      return `Edit ${p.param} on ${p.beatId}`;
    case 'updateParams':
      return `Update ${Object.keys(p.params).join(', ')} on ${p.beatId}`;
    case 'addBeat': {
      const wiring = [
        p.connectFrom ? `from ${p.connectFrom}` : '',
        p.connectTo ? `to ${p.connectTo}` : '',
      ].filter(Boolean).join(' ');
      return `Add ${p.beatType} "${p.name}"${wiring ? ` (${wiring})` : ''}`;
    }
    case 'addNote':
      return `Add design note to ${p.beatId}`;
    case 'updateCharacter':
      return `Update character ${p.characterId} (${Object.keys(p.updates).join(', ')})`;
  }
}
