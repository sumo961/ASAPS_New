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
import type { ChangeProposal, ChangeProposalSet, CoDesignerVariant } from './types';
import {
  normalizeTraits,
  normalizeMood,
  slugify,
} from '../../../services/prompts/characterGeneration';
import { normalizeStance } from '../../../services/prompts/interpersonalStance';
import {
  normalizeEffect,
  normalizeCondition,
  normalizeRequirement,
  normalizeList,
  describeEffect,
  describeCondition,
} from '../../../utils/wiringVocabulary';

/**
 * Validate + clamp the affect fields of an updateCharacter proposal. Numeric
 * ranges are clamped (traits [0,1], mood/stance [-1,1]) and variant ids are
 * slugified + deduped, mirroring the AI character helper — so a stray or
 * out-of-range value from the model can't corrupt a character.
 */
function normalizeCharacterUpdates(rawUpdates: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['displayName', 'description', 'color'] as const) {
    if (typeof rawUpdates[key] === 'string' && rawUpdates[key].trim()) out[key] = rawUpdates[key];
  }
  if (rawUpdates.traits && typeof rawUpdates.traits === 'object') {
    out.traits = normalizeTraits(rawUpdates.traits);
  }
  if (rawUpdates.variantSelectionPolicy === 'fixed' || rawUpdates.variantSelectionPolicy === 'random') {
    out.variantSelectionPolicy = rawUpdates.variantSelectionPolicy;
  }
  // Counters. A full replacement of the character's counter list, mirroring
  // how variants work — the model sees the existing ones in the digest and
  // returns the set it wants. Every field is clamped or dropped, so a stray
  // value can't corrupt a character.
  if (Array.isArray(rawUpdates.counters)) {
    const seenNames = new Set<string>();
    const counters = rawUpdates.counters
      .filter((k: any) => k && typeof k === 'object' && typeof k.name === 'string' && k.name.trim())
      .map((k: any, i: number) => {
        let name = slugify(k.name, `counter${i + 1}`);
        while (seenNames.has(name)) name = `${name}_2`;
        seenNames.add(name);

        const out: Record<string, unknown> = {
          name,
          displayName: (typeof k.displayName === 'string' && k.displayName.trim()) || name,
          value: Number.isFinite(k.value) ? Number(k.value) : 0,
          visible: k.visible !== false,
        };
        if (Number.isFinite(k.min)) out.min = Number(k.min);
        if (Number.isFinite(k.max)) out.max = Number(k.max);
        if (typeof k.color === 'string' && k.color.trim()) out.color = k.color;
        if (k.showLevelMeter !== undefined) out.showLevelMeter = !!k.showLevelMeter;
        if (['value', 'fraction', 'percentage', 'band'].includes(k.numericFormat)) {
          out.numericFormat = k.numericFormat;
        }

        // A binding is only accepted when it is complete and well-formed;
        // a half-specified source would render a meter that reads nothing.
        const src = k.source;
        if (src && typeof src === 'object') {
          if (src.kind === 'sentiment' && typeof src.emotion === 'string' && src.emotion.trim()
              && typeof src.toEntityRef === 'string' && src.toEntityRef.trim()) {
            out.source = {
              kind: 'sentiment',
              emotion: src.emotion.trim().toLowerCase(),
              toEntityRef: src.toEntityRef.trim(),
              ...(typeof src.fromCharacterRef === 'string' && src.fromCharacterRef.trim()
                ? { fromCharacterRef: src.fromCharacterRef.trim() } : {}),
            };
          } else if (src.kind === 'emotion' && typeof src.emotion === 'string' && src.emotion.trim()) {
            out.source = { kind: 'emotion', emotion: src.emotion.trim().toLowerCase() };
          } else if (src.kind === 'mood' && (src.axis === 'valence' || src.axis === 'arousal')) {
            out.source = { kind: 'mood', axis: src.axis };
          }
        }
        // A derived counter stores nothing of its own.
        if (out.source) out.value = 0;

        if (Array.isArray(k.bands)) {
          const bands = k.bands
            .filter((b: any) => b && Number.isFinite(b.from) && typeof b.label === 'string' && b.label.trim())
            .map((b: any) => ({ from: Number(b.from), label: b.label.trim() }))
            .sort((a: any, b: any) => a.from - b.from);
          if (bands.length > 0) out.bands = bands;
        }
        return out;
      });
    if (counters.length > 0) out.counters = counters;
  }

  if (Array.isArray(rawUpdates.variants)) {
    const seen = new Set<string>();
    const variants: CoDesignerVariant[] = rawUpdates.variants
      .filter((v: any) => v && typeof v === 'object')
      .map((v: any, i: number) => {
        let id = slugify(typeof v.id === 'string' ? v.id : v.name || '', `variant${i + 1}`);
        while (seen.has(id)) id = `${id}_2`;
        seen.add(id);
        const variant: CoDesignerVariant = { id, name: (typeof v.name === 'string' && v.name.trim()) || id };
        if (typeof v.characterDescription === 'string' && v.characterDescription.trim()) {
          variant.characterDescription = v.characterDescription.trim();
        }
        if (v.traits && typeof v.traits === 'object') variant.traits = normalizeTraits(v.traits);
        if (v.initialMood && typeof v.initialMood === 'object') variant.initialMood = normalizeMood(v.initialMood);
        const stance = normalizeStance(v.stance);
        if (stance) variant.stance = stance;
        return variant;
      });
    if (variants.length > 0) out.variants = variants;
  }
  return out;
}

const BLOCK_RE = /```asaps-proposals\s*([\s\S]*?)```/;

const VALID_KINDS = new Set([
  'editText', 'updateParams', 'addBeat', 'addNote', 'updateCharacter',
  'setChoiceEffects', 'setChoiceConditions', 'setRequirements',
]);

/** Warnings from the last normalizeProposal rejection (why an entry was dropped). */
const lastProblems: string[] = [];
function reject(kind: string, problem: string): null {
  lastProblems.push(`${kind}: ${problem}`);
  return null;
}

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
    case 'setChoiceEffects':
    case 'setChoiceConditions': {
      const choiceId = raw.choiceId ?? raw.optionId ?? raw.propId ?? raw.hotspotId;
      if (typeof raw.beatId !== 'string' || (typeof choiceId !== 'string' && typeof choiceId !== 'number')) {
        return reject(raw.kind, 'needs beatId and choiceId');
      }
      const isEffects = raw.kind === 'setChoiceEffects';
      const list = normalizeList(isEffects ? raw.effects : raw.conditions, isEffects ? normalizeEffect : normalizeCondition);
      if (!list.ok) return reject(raw.kind, list.problem);
      const note = typeof raw.note === 'string' ? raw.note : undefined;
      return isEffects
        ? { kind: 'setChoiceEffects', beatId: raw.beatId, choiceId: String(choiceId), effects: list.value, note }
        : { kind: 'setChoiceConditions', beatId: raw.beatId, choiceId: String(choiceId), conditions: list.value, note };
    }
    case 'setRequirements': {
      if (typeof raw.beatId !== 'string') return reject(raw.kind, 'needs beatId');
      const list = normalizeList(raw.requires ?? raw.requirements, normalizeRequirement);
      if (!list.ok) return reject(raw.kind, list.problem);
      return {
        kind: 'setRequirements',
        beatId: raw.beatId,
        requires: list.value,
        requiresMode: raw.requiresMode === 'any' ? 'any' : raw.requiresMode === 'all' ? 'all' : undefined,
        note: typeof raw.note === 'string' ? raw.note : undefined,
      };
    }
    case 'updateCharacter': {
      if (typeof raw.characterId !== 'string' || !raw.updates || typeof raw.updates !== 'object') return null;
      const updates = normalizeCharacterUpdates(raw.updates);
      if (Object.keys(updates).length === 0) return null;
      return { kind: 'updateCharacter', characterId: raw.characterId, updates: updates as any, note: typeof raw.note === 'string' ? raw.note : undefined };
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
  /** Why wiring entries were dropped (e.g. "setChoiceEffects: #1: addSentiment needs sentimentEmotion"). */
  problems?: string[];
}

export function extractProposalsFromReply(text: string): ExtractedProposals {
  const match = text.match(BLOCK_RE);
  if (!match) return { cleanText: text.trim(), proposalSet: null, droppedCount: 0 };

  const cleanText = text.replace(BLOCK_RE, '').trim();
  try {
    const parsed = parseJSONWithRepair<any>(match[1]);
    const rawList = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
    lastProblems.length = 0;
    const proposals = rawList.map(normalizeProposal).filter(Boolean) as ChangeProposal[];
    const droppedCount = rawList.length - proposals.length;
    const problems = lastProblems.length ? [...lastProblems] : undefined;
    if (proposals.length === 0) {
      return { cleanText, proposalSet: null, droppedCount, problems };
    }
    return {
      cleanText,
      proposalSet: {
        title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Proposed changes',
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
        proposals,
      },
      droppedCount,
      problems,
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
    case 'setChoiceEffects':
      return p.effects.length
        ? `On ${p.beatId} › ${p.choiceId}: ${p.effects.map((e) => describeEffect(e)).join('; ')}`
        : `On ${p.beatId} › ${p.choiceId}: remove all effects`;
    case 'setChoiceConditions':
      return p.conditions.length
        ? `Show ${p.beatId} › ${p.choiceId} only if ${p.conditions.map((c) => describeCondition(c)).join(' and ')}`
        : `Always show ${p.beatId} › ${p.choiceId}`;
    case 'setRequirements':
      return p.requires.length
        ? `Gate ${p.beatId}: requires ${p.requires.map((r: any) => describeCondition(r.condition) + (r.fallbackTarget ? ` (else → ${r.fallbackTarget})` : '')).join(p.requiresMode === 'any' ? ' or ' : ' and ')}`
        : `Remove the entry gate on ${p.beatId}`;
    case 'updateCharacter': {
      const parts: string[] = [];
      const u = p.updates as any;
      for (const k of ['displayName', 'description', 'color'] as const) if (u[k] !== undefined) parts.push(k);
      if (u.traits) parts.push('traits');
      if (u.variantSelectionPolicy) parts.push(`selection: ${u.variantSelectionPolicy}`);
      if (Array.isArray(u.variants)) {
        parts.push(`${u.variants.length} variant${u.variants.length === 1 ? '' : 's'} (${u.variants.map((v: any) => v.name || v.id).join(', ')})`);
      }
      return `Update character ${p.characterId} — ${parts.join(', ')}`;
    }
  }
}
