/**
 * Narrative memory — Layer 4 of the rich-character roadmap, Step 3.
 *
 * Pure derived view over data we already have (beat history, choice history,
 * the beats themselves). Returns "what happened to/with this character" so
 * the dossier (Step 2) and future per-character UIs can show the NPC's
 * interaction trail without storing duplicate state.
 *
 * Character appearance is computed from the same surface area as
 * `findReferencesByName` (Step 1.d.5):
 *   - Beat.speaker / Beat.characterRef (top-level)
 *   - DialogNode.speaker / DialogNode.characterRef (root + every nested node
 *     reachable via choices[].dialogNode)
 *   - AddRemoveInventory.character / .fromChar / .toChar
 *   - AIDialogTree.npcName / AIConversation.npcName
 * Match priority: characterRef equal to id wins, else case-insensitive name
 * or displayName match.
 */

import { resolveCharacter } from './characterRef';

interface CharacterLike {
  id: string;
  name?: string;
  displayName?: string;
}

interface BeatLike {
  id: string;
  type?: string;
  name?: string;
  speaker?: string;
  characterRef?: string;
  parameters?: Record<string, any>;
}

interface ChoiceRecordLike {
  beatId: string;
  beatName?: string;
  beatType?: string;
  choiceText: string;
  choiceContext?: string;
  timestamp: number;
}

/**
 * One entry in the per-character beat history. `role` describes how the
 * character appeared in this beat (speaker, the inventory holder, the NPC,
 * etc.) so callers can render meaningful summaries.
 */
export interface CharacterBeatEntry {
  beatId: string;
  beatName?: string;
  beatType?: string;
  /** Position in the global beat history (smaller = earlier). */
  index: number;
  /** Why we're listing this beat for this character. */
  role: 'speaker' | 'dialog-speaker' | 'inventory-holder' | 'inventory-source' | 'inventory-target' | 'npc';
}

export interface CharacterChoiceEntry {
  beatId: string;
  beatName?: string;
  beatType?: string;
  choiceText: string;
  choiceContext?: string;
  timestamp: number;
}

export interface CharacterInteraction {
  /** Sortable timestamp (visit-order index for beat, real timestamp for choice). */
  order: number;
  kind: 'beat' | 'choice';
  beatId: string;
  beatName?: string;
  beatType?: string;
  /** For 'beat' kind: how the character appeared. For 'choice' kind: 'speaker' if known, else 'present'. */
  role?: CharacterBeatEntry['role'] | 'present';
  /** Choice text (only set when kind === 'choice'). */
  choiceText?: string;
  choiceContext?: string;
}

/**
 * True iff `ref` (either characterRef-id or free-text speaker name)
 * identifies the target character. Empty refs return false.
 */
function refMatches(
  ref: string | null | undefined,
  refIsId: boolean,
  target: CharacterLike,
  allCharacters: ReadonlyArray<CharacterLike>,
): boolean {
  if (!ref) return false;
  if (refIsId) return ref === target.id;
  // Free-text fallback: match by name / displayName, case-insensitive — but
  // ONLY if no other defined character takes precedence (i.e. the name doesn't
  // resolve to a different character via some matching rule).
  const resolved = resolveCharacter(ref, allCharacters);
  return !!resolved && resolved.id === target.id;
}

/**
 * Walk every speaker site in a beat and return the roles under which the
 * target character appears. A single beat may yield multiple roles (e.g.
 * top-level speaker AND dialog node speaker).
 */
function rolesInBeat(
  beat: BeatLike,
  target: CharacterLike,
  allCharacters: ReadonlyArray<CharacterLike>,
): CharacterBeatEntry['role'][] {
  const roles: CharacterBeatEntry['role'][] = [];
  const params = beat.parameters || {};

  // 1. Top-level Beat.speaker / characterRef
  if (beat.characterRef && refMatches(beat.characterRef, true, target, allCharacters)) {
    roles.push('speaker');
  } else if (beat.speaker && refMatches(beat.speaker, false, target, allCharacters)) {
    roles.push('speaker');
  }

  // 2. DialogTree node speakers (root + nested)
  if (beat.type === 'dialogTree' && params.dialogTree) {
    const visit = (node: any): boolean => {
      if (!node || typeof node !== 'object') return false;
      let found = false;
      if (node.characterRef && refMatches(node.characterRef, true, target, allCharacters)) {
        found = true;
      } else if (node.speaker && refMatches(node.speaker, false, target, allCharacters)) {
        found = true;
      }
      if (Array.isArray(node.choices)) {
        for (const c of node.choices) {
          if (c && c.dialogNode) {
            if (visit(c.dialogNode)) found = true;
          }
        }
      }
      return found;
    };
    if (visit(params.dialogTree)) roles.push('dialog-speaker');
  }

  // 3. AddRemoveInventory roles — different role labels per field so callers
  //    can distinguish "the items were added to my bag" from "I gave items".
  if (beat.type === 'addRemoveInventory') {
    if (params.character && refMatches(params.character, looksLikeId(params.character, allCharacters), target, allCharacters)) {
      roles.push('inventory-holder');
    }
    if (params.fromChar && refMatches(params.fromChar, looksLikeId(params.fromChar, allCharacters), target, allCharacters)) {
      roles.push('inventory-source');
    }
    if (params.toChar && refMatches(params.toChar, looksLikeId(params.toChar, allCharacters), target, allCharacters)) {
      roles.push('inventory-target');
    }
  }

  // 4. AI beats: npcName
  if ((beat.type === 'aiDialogTree' || beat.type === 'aiConversation') && params.npcName) {
    if (refMatches(params.npcName, looksLikeId(params.npcName, allCharacters), target, allCharacters)) {
      roles.push('npc');
    }
  }

  return roles;
}

/** Heuristic: a string ref looks like an id if it matches some defined character's id exactly. */
function looksLikeId(ref: string, allCharacters: ReadonlyArray<CharacterLike>): boolean {
  return allCharacters.some((c) => c.id === ref);
}

/**
 * Beats from `history` that involve the target character, in visit order.
 * Each visit produces one entry; if the same beat was visited twice the
 * result has two entries (with different `index` values).
 */
export function beatsForCharacter(
  history: ReadonlyArray<string>,
  beats: ReadonlyArray<BeatLike>,
  target: CharacterLike,
  allCharacters: ReadonlyArray<CharacterLike>,
): CharacterBeatEntry[] {
  if (!history.length || !beats.length) return [];
  const beatById = new Map<string, BeatLike>();
  for (const b of beats) beatById.set(b.id, b);

  const result: CharacterBeatEntry[] = [];
  for (let i = 0; i < history.length; i++) {
    const beatId = history[i];
    const beat = beatById.get(beatId);
    if (!beat) continue;
    const roles = rolesInBeat(beat, target, allCharacters);
    if (roles.length === 0) continue;
    // Prefer 'speaker' when present; otherwise list the first role found.
    const role = roles.includes('speaker') ? 'speaker' : roles[0];
    result.push({
      beatId,
      beatName: beat.name,
      beatType: beat.type,
      index: i,
      role,
    });
  }
  return result;
}

/**
 * Choices from `choiceHistory` made in beats that involve the target character.
 * The character may have been the speaker, the NPC, or otherwise referenced
 * by the beat — anything `rolesInBeat` returns counts.
 */
export function choicesForCharacter(
  choiceHistory: ReadonlyArray<ChoiceRecordLike>,
  beats: ReadonlyArray<BeatLike>,
  target: CharacterLike,
  allCharacters: ReadonlyArray<CharacterLike>,
): CharacterChoiceEntry[] {
  if (!choiceHistory.length || !beats.length) return [];
  const beatById = new Map<string, BeatLike>();
  for (const b of beats) beatById.set(b.id, b);

  const result: CharacterChoiceEntry[] = [];
  for (const choice of choiceHistory) {
    const beat = beatById.get(choice.beatId);
    if (!beat) continue;
    if (rolesInBeat(beat, target, allCharacters).length === 0) continue;
    result.push({
      beatId: choice.beatId,
      beatName: choice.beatName ?? beat.name,
      beatType: choice.beatType ?? beat.type,
      choiceText: choice.choiceText,
      choiceContext: choice.choiceContext,
      timestamp: choice.timestamp,
    });
  }
  return result;
}

/**
 * Combined timeline of "things that happened to/with this character" —
 * beats interleaved with choices, each tagged with `kind`. The order field
 * is the global beat-history index for `kind==='beat'` and the choice's
 * timestamp for `kind==='choice'`. Callers can render this as a single
 * narrative log per character.
 */
export function interactionsForCharacter(
  history: ReadonlyArray<string>,
  choiceHistory: ReadonlyArray<ChoiceRecordLike>,
  beats: ReadonlyArray<BeatLike>,
  target: CharacterLike,
  allCharacters: ReadonlyArray<CharacterLike>,
): CharacterInteraction[] {
  const beatEntries = beatsForCharacter(history, beats, target, allCharacters).map<CharacterInteraction>((b) => ({
    order: b.index,
    kind: 'beat',
    beatId: b.beatId,
    beatName: b.beatName,
    beatType: b.beatType,
    role: b.role,
  }));
  const choiceEntries = choicesForCharacter(choiceHistory, beats, target, allCharacters).map<CharacterInteraction>((c) => ({
    order: c.timestamp,
    kind: 'choice',
    beatId: c.beatId,
    beatName: c.beatName,
    beatType: c.beatType,
    role: 'present',
    choiceText: c.choiceText,
    choiceContext: c.choiceContext,
  }));
  // Beats use ascending index (small order), choices use timestamps which
  // can be much larger — we want chronological narrative order, so split
  // sort: beats keep their visit order; choices interleave by timestamp
  // relative to the beat that spawned them. For the MVP we return beats
  // in visit order followed by choices in timestamp order — callers that
  // need precise interleaving can sort by choiceHistory's beat boundaries.
  return [...beatEntries, ...choiceEntries].sort((a, b) => a.order - b.order);
}

/**
 * What two characters share — beats both appeared in plus choices made in
 * those shared beats. Useful for "do they know each other?" / dossier-side
 * relationship hints. Symmetric: `relationshipBetween(a, b)` and
 * `relationshipBetween(b, a)` return the same entries (modulo order).
 */
export function relationshipBetween(
  a: CharacterLike,
  b: CharacterLike,
  history: ReadonlyArray<string>,
  choiceHistory: ReadonlyArray<ChoiceRecordLike>,
  beats: ReadonlyArray<BeatLike>,
  allCharacters: ReadonlyArray<CharacterLike>,
): {
  sharedBeats: CharacterBeatEntry[];
  sharedChoices: CharacterChoiceEntry[];
} {
  if (a.id === b.id) {
    // Self-relationship is meaningless; return empty.
    return { sharedBeats: [], sharedChoices: [] };
  }
  const aBeats = beatsForCharacter(history, beats, a, allCharacters);
  const aBeatIds = new Set(aBeats.map((e) => `${e.beatId}@${e.index}`));
  const bBeats = beatsForCharacter(history, beats, b, allCharacters);
  const sharedBeats = bBeats.filter((e) => aBeatIds.has(`${e.beatId}@${e.index}`));

  // Shared choices = choices in beats where BOTH characters appear.
  const sharedBeatIds = new Set(sharedBeats.map((e) => e.beatId));
  const sharedChoices = choicesForCharacter(choiceHistory, beats, a, allCharacters).filter((c) =>
    sharedBeatIds.has(c.beatId),
  );

  return { sharedBeats, sharedChoices };
}
