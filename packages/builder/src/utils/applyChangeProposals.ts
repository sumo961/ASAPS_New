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
import { setSiteField, labelFieldOf, addOption, listWiringSites } from './choiceWiring';
import { redirectIncoming, retargetValue } from './redirectIncoming';
import { beatLinks } from './storyLinks';
import { beatParameterProblem, beatConnectionType } from './beatTypeReference';

type Link = { targetId: string; label?: string; effects?: unknown[] };

/**
 * A single-exit beat's link, written as the schema's "connection" parameter
 * ({ target, label?, effects? } or a bare id). No beat reads
 * parameters.connection — it is the generators' wire shape, turned into the
 * beat's stored link on import — so writing it as a parameter was a silent
 * no-op ("Updated connection" while nothing changed). Split it out so the
 * caller can write the beat's link instead. Returns undefined when the
 * params carry no connection.
 */
function splitConnection(
  beatType: string | undefined,
  params: Record<string, unknown> | undefined,
  beatExists: (id: string) => boolean,
): { rest: Record<string, unknown>; links: Link[] } | { problem: string } | undefined {
  if (!params || !('connection' in params)) return undefined;
  const { connection, ...rest } = params as Record<string, any>;
  if (beatConnectionType(beatType) !== 'single') {
    return { problem: `${beatType} has no single "connection" — its exits live in its choices, branches or targets` };
  }
  if (connection === null || connection === '' || connection === undefined) return { rest, links: [] };
  const target = typeof connection === 'string' ? connection : connection.target ?? connection.targetId;
  if (typeof target !== 'string' || !target) return { problem: 'connection needs a "target" beat id' };
  if (!beatExists(target)) return { problem: `connection target "${target}" not found` };
  const link: Link = { targetId: target };
  if (typeof connection === 'object' && typeof connection.label === 'string' && connection.label) link.label = connection.label;
  if (typeof connection === 'object' && Array.isArray(connection.effects) && connection.effects.length) link.effects = connection.effects;
  return { rest, links: [link] };
}
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
    type?: string;
    name?: string;
    requires?: Array<Record<string, unknown>>;
    requiresMode?: 'all' | 'any';
    connections?: Array<Record<string, unknown>>;
    defaultTarget?: string;
    toJSON?: () => Record<string, any>;
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
  /** Declare a story variable; false when one by that name already exists. */
  defineVariable?: (v: { name: string; defaultValue: string | number | boolean; description?: string }) => boolean;
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
          const paramProblem = beat.type ? beatParameterProblem(beat.type, p.params, false) : null;
          if (paramProblem) {
            results.push({ index, ok: false, detail: paramProblem });
            return;
          }
          const split = splitConnection(beat.type, p.params, beatExists);
          if (split && 'problem' in split) {
            results.push({ index, ok: false, detail: `${beat.name || p.beatId}: ${split.problem}` });
            return;
          }
          const params = split ? split.rest : p.params;
          const updates: Record<string, unknown> = {};
          if (Object.keys(params).length) updates.parameters = params;
          // The link REPLACES the beat's exits: a single-exit beat with two
          // links follows the first, which is how stray old links bypass
          // new ones.
          if (split) updates.connections = split.links;
          ctx.updateBeat(p.beatId, updates);
          const parts = Object.keys(params);
          if (split) parts.push(split.links.length ? `exit → ${split.links[0].targetId} (replaces its previous exit)` : 'exit removed');
          results.push({ index, ok: true, detail: `Updated ${parts.join(', ')} on ${beat.name || p.beatId}` });
          return;
        }

        case 'addBeat': {
          if (!knownTypes.has(p.beatType)) {
            results.push({ index, ok: false, detail: `Unknown beat type "${p.beatType}"` });
            return;
          }
          const addProblem = beatParameterProblem(p.beatType, p.parameters ?? {}, true);
          if (addProblem) {
            results.push({ index, ok: false, detail: addProblem });
            return;
          }
          const addSplit = splitConnection(p.beatType, p.parameters, beatExists);
          if (addSplit && 'problem' in addSplit) {
            results.push({ index, ok: false, detail: addSplit.problem });
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
          const newParams = addSplit ? addSplit.rest : p.parameters;
          if ((newParams && Object.keys(newParams).length > 0) || addSplit) {
            ctx.updateBeat(newBeat.id, {
              ...(newParams && Object.keys(newParams).length > 0 ? { parameters: newParams } : {}),
              ...(addSplit ? { connections: addSplit.links } : {}),
            });
          }
          if (p.connectFrom) {
            // A single-exit source gets its exit REPLACED: appending would
            // leave the old link first, and the beat follows the first one.
            const src = anchor as (typeof ctx.beats)[number] | undefined;
            if (src && beatConnectionType(src.type) === 'single') {
              ctx.updateBeat(src.id, { connections: [{ targetId: newBeat.id, ...(p.connectLabel ? { label: p.connectLabel } : {}) }] });
            } else {
              ctx.connectBeats(p.connectFrom, newBeat.id, p.connectLabel);
            }
          }
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

        case 'setLinkEffects': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const problem = wiringProblem(p.effects, [], ctx, beatExists);
          if (problem) {
            results.push({ index, ok: false, detail: problem });
            return;
          }
          // A beat whose exits are its options (choices, dialog, props,
          // random branches) keeps only a derived copy of its links; effects
          // written there would fire on top of the option's own.
          if (listWiringSites(paramsOf(beat)).length > 0) {
            results.push({ index, ok: false, detail: `${beat.name || p.beatId}'s exits are its options — use setChoiceEffects on the option instead` });
            return;
          }
          const json = (typeof beat.toJSON === 'function' ? beat.toJSON() : beat) as Record<string, any>;
          const links: Array<Record<string, any>> = Array.isArray(json.connections) ? json.connections : [];
          const matches = p.targetId ? links.filter((l) => l.targetId === p.targetId) : links;
          if (matches.length !== 1) {
            results.push({
              index, ok: false,
              detail: links.length === 0
                ? `${beat.name || p.beatId} has no link of its own — its exits live on its choices; use setChoiceEffects`
                : p.targetId
                  ? `${beat.name || p.beatId} has no link to ${p.targetId} (links: ${links.map((l) => l.targetId).join(', ')})`
                  : `${beat.name || p.beatId} has ${links.length} links — say which with targetId (${links.map((l) => l.targetId).join(', ')})`,
            });
            return;
          }
          const chosen = matches[0];
          const next = links.map((l) => {
            if (l !== chosen) return l;
            const copy = { ...l };
            if (p.effects.length) copy.effects = p.effects; else delete copy.effects;
            return copy;
          });
          ctx.updateBeat(p.beatId, { connections: next });
          results.push({
            index, ok: true,
            detail: p.effects.length
              ? `Leaving ${beat.name || p.beatId} → ${chosen.targetId} now does: ${p.effects.map((e) => describeEffect(e)).join('; ')}`
              : `Removed the effects on ${beat.name || p.beatId} → ${chosen.targetId}`,
          });
          return;
        }

        case 'defineVariable': {
          if (!ctx.defineVariable) {
            results.push({ index, ok: false, detail: 'Variables cannot be declared from here' });
            return;
          }
          const added = ctx.defineVariable({ name: p.name, defaultValue: p.defaultValue, description: p.description });
          results.push(added
            ? { index, ok: true, detail: `Declared story variable ${p.name} (starts as ${JSON.stringify(p.defaultValue)}) — see Project Settings → Variables` }
            : { index, ok: true, detail: `Story variable ${p.name} already exists — left as it is` });
          return;
        }

        case 'editChoiceText': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const params = paramsOf(beat);
          const field = labelFieldOf(params, p.choiceId);
          const patch = setSiteField(params, p.choiceId, field, p.text);
          if (!patch.ok) {
            results.push({ index, ok: false, detail: `${beat.name || p.beatId}: ${patch.problem}` });
            return;
          }
          pendingParams.set(beat.id, { ...params, ...patch.parametersPatch });
          ctx.updateBeat(p.beatId, { parameters: patch.parametersPatch });
          results.push({ index, ok: true, detail: `Reworded ${patch.site.kind === 'dialogNode' ? 'line' : 'choice'} on ${beat.name || p.beatId}: "${p.text.slice(0, 60)}${p.text.length > 60 ? '…' : ''}"` });
          return;
        }

        case 'addChoice': {
          const beat = findBeat(p.beatId);
          if (!beat) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          const targets = beatLinks({ id: '_', parameters: { dialogTree: { id: '_', choices: [p.choice] } } }).map((l) => l.target);
          const missing = targets.filter((t) => !beatExists(t));
          if (missing.length) {
            results.push({ index, ok: false, detail: `target beat ${missing.map((m) => `"${m}"`).join(', ')} not found` });
            return;
          }
          const nested = p.choice.dialogNode ? listWiringSites({ dialogTree: p.choice.dialogNode }) : [];
          const problem = wiringProblem(
            [...(p.choice.effects ?? []), ...nested.flatMap((s) => s.effects)],
            [...(p.choice.conditions ?? []), ...nested.flatMap((s) => s.conditions)],
            ctx, beatExists,
          );
          if (problem) {
            results.push({ index, ok: false, detail: problem });
            return;
          }
          const params = paramsOf(beat);
          const added = addOption(params, p.choice as any, p.parentId);
          if (!added.ok) {
            results.push({ index, ok: false, detail: `${beat.name || p.beatId}: ${added.problem}` });
            return;
          }
          pendingParams.set(beat.id, { ...params, ...added.parametersPatch });
          ctx.updateBeat(p.beatId, { parameters: added.parametersPatch });
          results.push({ index, ok: true, detail: `Added choice "${p.choice.text.slice(0, 50)}" (${added.id}) to ${beat.name || p.beatId}` });
          return;
        }

        case 'replaceBeat': {
          const old = findBeat(p.beatId);
          if (!old) {
            results.push({ index, ok: false, detail: `${p.beatId} not found — was it deleted or renamed?` });
            return;
          }
          if (ctx.beats[0]?.id === old.id) {
            results.push({ index, ok: false, detail: `${old.name || old.id} is where the story starts — edit it in place instead` });
            return;
          }
          const beatType = p.beatType || old.type;
          if (!beatType || !knownTypes.has(beatType)) {
            results.push({ index, ok: false, detail: `Unknown beat type "${beatType}"` });
            return;
          }
          const newProblem = beatParameterProblem(beatType, p.parameters, true);
          if (newProblem) {
            results.push({ index, ok: false, detail: newProblem });
            return;
          }
          // The new version's own links: to existing beats, or to the old id
          // (a self-loop — it becomes a loop on the new version).
          const outgoing = beatLinks({ id: '_', parameters: p.parameters }).map((l) => l.target);
          const missing = [...new Set(outgoing.filter((t) => t !== old.id && !beatExists(t)))];
          if (missing.length) {
            results.push({ index, ok: false, detail: `the new version links to missing beat${missing.length > 1 ? 's' : ''} ${missing.join(', ')}` });
            return;
          }
          const sites = listWiringSites(p.parameters as any);
          const problem = wiringProblem(sites.flatMap((s) => s.effects), sites.flatMap((s) => s.conditions), ctx, beatExists);
          if (problem) {
            results.push({ index, ok: false, detail: problem });
            return;
          }
          const oldName = old.name || old.id;
          const newSplit = splitConnection(beatType, p.parameters, beatExists);
          if (newSplit && 'problem' in newSplit) {
            results.push({ index, ok: false, detail: newSplit.problem });
            return;
          }
          const created = ctx.addBeat(beatType, { x: old.x || 0, y: (old.y || 0) + 220 }, p.name || oldName);
          if (!created) {
            results.push({ index, ok: false, detail: `Could not create the new ${beatType} beat` });
            return;
          }
          const oldJson = (typeof old.toJSON === 'function' ? old.toJSON() : old) as Record<string, any>;
          const newUpdates: Record<string, unknown> = {
            parameters: retargetValue(newSplit ? newSplit.rest : p.parameters, old.id, created.id),
            notes: `[Co-Designer] New version of "${oldName}" (${old.id}). Links into the old beat now lead here; play both, then delete the one you don't keep.${p.note ? `\n\n${p.note}` : ''}`,
          };
          // The gate belongs to the beat's place in the story — carry it over.
          if (Array.isArray(oldJson.requires) && oldJson.requires.length) {
            newUpdates.requires = retargetValue(oldJson.requires, old.id, created.id);
            newUpdates.requiresMode = oldJson.requiresMode ?? 'all';
          }
          // Same type, no links of its own in the new parameters: keep the
          // old beat's exits (infoText etc. keep them on the beat, not in
          // parameters), or the new version would dead-end.
          if (outgoing.length === 0 && beatType === old.type && Array.isArray(oldJson.connections) && oldJson.connections.length) {
            newUpdates.connections = retargetValue(structuredClone(oldJson.connections), old.id, created.id);
            if (oldJson.defaultTarget) newUpdates.defaultTarget = oldJson.defaultTarget === old.id ? created.id : oldJson.defaultTarget;
          }
          if (newSplit) newUpdates.connections = retargetValue(newSplit.links, old.id, created.id);
          ctx.updateBeat(created.id, newUpdates);

          const serialized = ctx.beats.map((b) => {
            const j = (typeof b.toJSON === 'function' ? b.toJSON() : b) as Record<string, any>;
            return { id: b.id, parameters: paramsOf(b), connections: j.connections, defaultTarget: j.defaultTarget, requires: j.requires };
          });
          const moved = redirectIncoming(serialized, old.id, created.id);
          for (const u of moved.updates) {
            const src = findBeat(u.beatId);
            if (src && u.updates.parameters) pendingParams.set(u.beatId, { ...paramsOf(src), ...u.updates.parameters });
            ctx.updateBeat(u.beatId, u.updates);
          }
          ctx.updateBeat(old.id, { name: `${oldName} (replaced)` });
          const sources = moved.updates.length;
          results.push({
            index, ok: true,
            detail: `New version of "${oldName}" added (${created.id}); ${moved.links} link${moved.links === 1 ? '' : 's'} from ${sources} beat${sources === 1 ? '' : 's'} now lead to it. The old beat is kept as "${oldName} (replaced)" — delete it once you've compared.` +
              (moved.leftovers.length ? ` ${moved.leftovers.length} link(s) still point at the old beat (${moved.leftovers.map((l) => l.source).join(', ')}).` : ''),
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
