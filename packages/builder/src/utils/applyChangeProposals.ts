/**
 * Main-window executor for Co-Designer change proposals.
 *
 * Validates each selected proposal against LIVE story state (the model
 * worked from a snapshot — beats may have changed or vanished) and applies
 * it through the injected callbacks, which the App wires to its existing
 * undoable command handlers. One result per proposal, never throws:
 * a failed proposal reports why and the rest still apply.
 */

import type { ChangeProposal, ProposalApplyResult } from '../components/ai/codesigner/types';
import { getAllBeatTypeIds } from '../services/beatSchemaVocabulary';
import { applyStanceToTraits } from '../services/prompts/interpersonalStance';
import { setSiteField } from './choiceWiring';
import { describeEffect, describeCondition } from './wiringVocabulary';

/** Effect types whose `target` names a character. */
const CHARACTER_TARGET_EFFECTS = new Set([
  'nudgeMood', 'addSentiment', 'fireEmotion', 'addReflection', 'setGoalStatus', 'setCharacterVariant',
]);
/** Condition types whose `character` field names a character. */
const CHARACTER_CONDITIONS = new Set(['mood', 'emotion', 'sentiment', 'trait', 'goal', 'characterVariant']);

type Char = NonNullable<ApplyContext['characters']>[number];

/**
 * Check wiring against the live story. Returns a problem or null.
 * Catches what the engine would silently ignore or misroute: unknown
 * characters, writes to a counter that is bound to an affect source (it is
 * derived — the next read overwrites the write), gates that send the player
 * to a beat that does not exist.
 */
function wiringProblem(
  effects: Array<Record<string, any>>,
  conditions: Array<Record<string, any>>,
  ctx: ApplyContext,
  beatExists: (id: string) => boolean,
): string | null {
  const chars = ctx.characters;
  const findChar = (ref: string): Char | undefined =>
    chars?.find((c) => c.id === ref || c.name === ref || c.displayName === ref);
  const charOk = (ref: unknown) => !chars || ref === 'player' || (typeof ref === 'string' && !!findChar(ref));

  for (const e of effects) {
    if (CHARACTER_TARGET_EFFECTS.has(e.type) && !charOk(e.target)) {
      return `${describeEffect(e)}: no character "${e.target}"`;
    }
    if (e.type === 'addSentiment' && !charOk(e.sentimentTarget)) {
      return `${describeEffect(e)}: no character "${e.sentimentTarget}"`;
    }
    if ((e.type === 'incrementCounter' || e.type === 'setCounter') && e.character) {
      const owner = findChar(String(e.character));
      if (chars && !owner) return `${describeEffect(e)}: no character "${e.character}"`;
      const counter = (owner as any)?.counters?.find((k: any) => k?.name === e.target);
      if (counter?.source) {
        return `${describeEffect(e)}: ${e.target} is read from ${owner?.displayName || owner?.name}'s ${counter.source.kind} — it can't be set; change the ${counter.source.kind} instead`;
      }
    }
  }
  for (const c of conditions) {
    if (CHARACTER_CONDITIONS.has(c.type) && !charOk(c.character)) {
      return `${describeCondition(c)}: no character "${c.character}"`;
    }
    if (c.type === 'visitedBeat' && !beatExists(String(c.beatId))) {
      return `${describeCondition(c)}: no beat "${c.beatId}"`;
    }
  }
  return null;
}

export interface ApplyContext {
  /** Live beats (id, name, getParameters for validation + positioning). */
  beats: Array<{
    id: string;
    name?: string;
    x?: number;
    y?: number;
    notes?: string;
    getParameters?: () => Record<string, unknown>;
  }>;
  /** Undoable field/parameter update (App.handleBeatUpdate). */
  updateBeat: (beatId: string, updates: Record<string, unknown>) => void;
  /** Undoable beat creation; returns the new beat or null (App-side wrapper). */
  addBeat: (
    beatType: string,
    position: { x: number; y: number } | undefined,
    name: string
  ) => { id: string } | null;
  /** Connect source → target with an optional label. */
  connectBeats: (sourceId: string, targetId: string, label?: string) => void;
  /** Live characters for validation (id / ref name / display name) plus
   *  base traits — needed to derive a variant's E/A from its stance. */
  characters?: Array<{ id?: string; name?: string; displayName?: string; traits?: Record<string, number>; counters?: Array<Record<string, unknown>> }>;
  /** Character field update (NOT in the undo history — noted in the result). */
  updateCharacter?: (characterId: string, updates: Record<string, unknown>) => void;
}

export function applyChangeProposals(
  proposals: ChangeProposal[],
  ctx: ApplyContext
): ProposalApplyResult[] {
  const results: ProposalApplyResult[] = [];
  const findBeat = (id: string) => ctx.beats.find(b => b.id === id);
  const knownTypes = new Set(getAllBeatTypeIds());
  // Parameters as this batch leaves them. updateBeat lands through React
  // state, so two proposals on the same beat's choices would otherwise both
  // start from the original list and the second would undo the first.
  const pendingParams = new Map<string, Record<string, any>>();
  const paramsOf = (beat: ApplyContext['beats'][number]): Record<string, any> =>
    pendingParams.get(beat.id) ?? (beat.getParameters?.() as Record<string, any>) ?? {};
  const beatExists = (id: string) => !!findBeat(id);

  proposals.forEach((p, index) => {
    try {
      switch (p.kind) {
        case 'editText': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          ctx.updateBeat(p.beatId, { parameters: { [p.param]: p.newValue } });
          results.push({ index, ok: true, detail: `Set ${p.param} on ${beat.name || p.beatId}` });
          return;
        }

        case 'updateParams': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          ctx.updateBeat(p.beatId, { parameters: p.params });
          results.push({
            index, ok: true,
            detail: `Updated ${Object.keys(p.params).join(', ')} on ${beat.name || p.beatId}`,
          });
          return;
        }

        case 'addBeat': {
          if (!knownTypes.has(p.beatType)) {
            results.push({ index, ok: false, detail: `Unknown beat type "${p.beatType}"` });
            return;
          }
          const anchor = p.connectFrom ? findBeat(p.connectFrom) : undefined;
          if (p.connectFrom && !anchor) {
            results.push({ index, ok: false, detail: `connectFrom ${p.connectFrom} not found` });
            return;
          }
          const position = anchor
            ? { x: (anchor.x || 0) + 300, y: (anchor.y || 0) + 40 }
            : undefined;
          const newBeat = ctx.addBeat(p.beatType, position, p.name);
          if (!newBeat) {
            results.push({ index, ok: false, detail: `Could not create ${p.beatType} beat` });
            return;
          }
          if (p.parameters && Object.keys(p.parameters).length > 0) {
            ctx.updateBeat(newBeat.id, { parameters: p.parameters });
          }
          if (p.connectFrom) ctx.connectBeats(p.connectFrom, newBeat.id, p.connectLabel);
          if (p.connectTo) {
            if (findBeat(p.connectTo)) {
              ctx.connectBeats(newBeat.id, p.connectTo);
            } else {
              results.push({
                index, ok: true,
                detail: `Added "${p.name}" (${newBeat.id}) — connectTo ${p.connectTo} not found, left unwired`,
              });
              return;
            }
          }
          results.push({ index, ok: true, detail: `Added ${p.beatType} "${p.name}" (${newBeat.id})` });
          return;
        }

        case 'setChoiceEffects':
        case 'setChoiceConditions': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const isEffects = p.kind === 'setChoiceEffects';
          const list = isEffects ? p.effects : p.conditions;
          const problem = wiringProblem(isEffects ? list : [], isEffects ? [] : list, ctx, beatExists);
          if (problem) {
            results.push({ index, ok: false, detail: problem });
            return;
          }
          const params = paramsOf(beat);
          const patch = setSiteField(params, p.choiceId, isEffects ? 'effects' : 'conditions', list);
          if (!patch.ok) {
            results.push({ index, ok: false, detail: `${beat.name || p.beatId}: ${patch.problem}` });
            return;
          }
          pendingParams.set(beat.id, { ...params, ...patch.parametersPatch });
          ctx.updateBeat(p.beatId, { parameters: patch.parametersPatch });
          const where = `${beat.name || p.beatId} › ${patch.site.label ? `"${patch.site.label.slice(0, 40)}"` : p.choiceId}`;
          results.push({
            index, ok: true,
            detail: isEffects
              ? (list.length ? `${where}: ${list.map((e) => describeEffect(e)).join('; ')}` : `${where}: effects removed`)
              : (list.length ? `${where} shows only if ${list.map((c) => describeCondition(c)).join(' and ')}` : `${where} always shown`),
          });
          return;
        }

        case 'setRequirements': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const problem = wiringProblem([], p.requires.map((r: any) => r.condition), ctx, beatExists);
          if (problem) {
            results.push({ index, ok: false, detail: problem });
            return;
          }
          const badFallback = p.requires.find((r: any) => r.fallbackTarget && !beatExists(r.fallbackTarget)) as any;
          if (badFallback) {
            results.push({ index, ok: false, detail: `fallback beat "${badFallback.fallbackTarget}" not found` });
            return;
          }
          ctx.updateBeat(p.beatId, {
            requires: p.requires.length ? p.requires : undefined,
            requiresMode: p.requiresMode ?? 'all',
          });
          results.push({
            index, ok: true,
            detail: p.requires.length
              ? `${beat.name || p.beatId} requires ${p.requires.map((r: any) => describeCondition(r.condition)).join(p.requiresMode === 'any' ? ' or ' : ' and ')}`
              : `Entry gate removed from ${beat.name || p.beatId}`,
          });
          return;
        }

        case 'updateCharacter': {
          const chars = ctx.characters ?? [];
          const target = chars.find(
            c => c.id === p.characterId || c.name === p.characterId || c.displayName === p.characterId
          );
          if (!target || !target.id) {
            results.push({ index, ok: false, detail: `Character "${p.characterId}" not found` });
            return;
          }
          if (!ctx.updateCharacter) {
            results.push({ index, ok: false, detail: 'Character updates are not available here' });
            return;
          }
          const updates: Record<string, unknown> = { ...(p.updates as any) };
          // Keep the circumplex model consistent: a proposed variant that
          // carries a stance has its extraversion/agreeableness re-derived
          // from the (possibly also-updated) base traits + stance, the same
          // rule the character helper uses — so a stance change actually
          // moves the traits it implies.
          const baseTraits = (updates.traits as Record<string, number>) || target.traits || {};
          if (Array.isArray(updates.variants)) {
            updates.variants = (updates.variants as any[]).map((v) => {
              if (!v?.stance) return v;
              const ea = applyStanceToTraits(baseTraits, v.stance);
              return { ...v, traits: { ...(v.traits || {}), extraversion: ea.extraversion, agreeableness: ea.agreeableness } };
            });
          }
          // Counters MERGE by name rather than replacing the list.
          //
          // The digest names a character's counters but not their bands or
          // bounds, so a model asked to "add a fear meter" cannot faithfully
          // restate the trust meter it must send alongside — observed live: it
          // echoed trust without its four bands and said so ("tell me and I'll
          // match them, so you don't lose that setup"). Replacing would have
          // silently destroyed an authored ladder.
          //
          // Merging makes a partial proposal safe and matches how an author
          // reads it: "add fear" should not rewrite trust. Fields the proposal
          // states win; fields it omits are kept.
          if (Array.isArray(updates.counters)) {
            const existing = (target as { counters?: Array<Record<string, unknown>> }).counters || [];
            const byName = new Map(existing.map((c) => [String(c.name), c]));
            const merged = (updates.counters as Array<Record<string, unknown>>).map((incoming) => {
              const prior = byName.get(String(incoming.name));
              byName.delete(String(incoming.name));
              return prior ? { ...prior, ...incoming } : incoming;
            });
            // Counters the proposal didn't mention are untouched, not deleted.
            updates.counters = [...merged, ...byName.values()];
          }
          ctx.updateCharacter(target.id, updates);
          const summary = Object.keys(updates).map(k =>
            k === 'variants' ? `${(updates.variants as any[]).length} variants` : k,
          ).join(', ');
          results.push({
            index, ok: true,
            detail: `Updated ${summary} on character ${target.displayName || target.name || target.id}`,
          });
          return;
        }

        case 'addNote': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const stamp = `[Co-Designer] ${p.note.trim()}`;
          const existing = typeof beat.notes === 'string' && beat.notes.trim() ? beat.notes : '';
          ctx.updateBeat(p.beatId, { notes: existing ? `${existing}\n\n${stamp}` : stamp });
          results.push({ index, ok: true, detail: `Added note to ${beat.name || p.beatId}` });
          return;
        }
      }
    } catch (err) {
      results.push({
        index, ok: false,
        detail: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  return results;
}
