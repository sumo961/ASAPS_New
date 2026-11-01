/**
 * AI Story Logic (docs/AI-Story-Logic-Plan.md, Phase 1): which beats to check,
 * what the model reads about each, batches, the per-beat cache, and the check
 * every finding must pass before an author sees it. The model never touches
 * the story and its word is not taken: a finding must quote words really in
 * the beat, name a beat it was given and point at one of its arriving states.
 */
import { parseJSONWithRepair, itemQuantity, type BeatArrival, type SimulationState } from '@asaps/core';
import { STORY_LOGIC_KINDS, STORY_LOGIC_SCHEMA, STORY_LOGIC_SYSTEM_PROMPT, buildStoryLogicUserPrompt, type StoryLogicPromptBeat } from './prompts/storyLogicReview';
import type { StoryLogicFinding, StoryLogicKind, StoryLogicStore } from '../types/storyLogic';
import type { ModelPrice } from './aiPricing';

/** Usage routes, so the panel counts its own requests and nothing else. */
export const STORY_LOGIC_ROUTE = 'story-logic';
export const STORY_LOGIC_FIX_ROUTE = 'story-logic-fix';

/** Most arriving states described per beat; the commonest come first. */
const MAX_STATES_PER_BEAT = 6;
/** Batch limits: several beats share one call, none outgrows a reply. */
const MAX_BEATS_PER_BATCH = 12;
const MAX_CHARS_PER_BATCH = 24000;
const MAX_OUTPUT_TOKENS = 4000;
/** Measured on Birka (2026-11-01): a chars/4 estimate came out well under what the provider counted. */
const CHARS_PER_TOKEN = 3;
const TYPICAL_OUTPUT_PER_REQUEST = 1000;
/** A story with more candidates than this also gets the first-pass offer. */
export const FIRST_PASS_MIN_CANDIDATES = 40;

export interface StoryLogicCandidate extends Omit<StoryLogicPromptBeat, 'script'> {
  /** The words a finding may quote. */
  words: string[];
  /** The beat with speakers and gates, as the model reads it. */
  script?: string[];
  /** Path visits through this beat: how much of the story meets it. */
  pathCount: number;
  /** A way in that arrives in each state, to show as a path. */
  statePaths: string[][];
  /** Key of its words, states and ways in: unchanged means still checked. */
  cacheKey: string;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The words a player meets on a beat: text, questions, Dialog Tree lines, choices. */
export function beatWords(params: Record<string, any> | undefined): string[] {
  const out: string[] = [];
  const add = (v: unknown) => { if (typeof v === 'string' && v.trim()) out.push(v); };
  const p = params ?? {};
  for (const k of ['title', 'text', 'question', 'message', 'prompt']) add(p[k]);
  for (const list of [p.choices, p.props, p.hotspots]) {
    if (Array.isArray(list)) for (const c of list) { add(c?.text); add(c?.label); add(c?.description); }
  }
  const seen = new Set<any>();
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    add(node.text);
    for (const c of Array.isArray(node.choices) ? node.choices : []) { add(c?.text); walk(c?.dialogNode); }
    if (node.next && typeof node.next === 'object') walk(node.next);
  };
  walk(p.dialogTree);
  return [...new Set(out)];
}

/** A gate in words. A visited condition with no beat is never true in the engine: said so, since the author probably meant something else. */
function describeGate(c: any, beatName: (id: string) => string): string {
  const not = c?.operator === 'not' || c?.operator === '!=';
  switch (c?.type) {
    case 'visitedBeat': {
      const id = c.beatId || c.variableName || c.left;
      if (!id) return 'visited (no beat chosen: this condition is never true)';
      return `${not ? 'has not visited' : 'visited'} "${beatName(id)}"`;
    }
    case 'inventory':
      return `${not || c.checkType === 'notHas' ? 'lacks' : 'has'} ${c.item}`;
    case 'variable':
      return `${c.variableName} ${c.operator ?? '=='} ${JSON.stringify(c.value)}`;
    case 'roleHolder':
      return `@${c.role} ${not ? 'is not' : 'is'} ${c.character}`;
    default:
      return JSON.stringify(c);
  }
}

const gatesOf = (conditions: unknown, beatName: (id: string) => string): string =>
  Array.isArray(conditions) && conditions.length ? conditions.map((c) => describeGate(c, beatName)).join(' and ') : '';

/**
 * The beat as a player meets it, for the model: who says each line, and which
 * conditions decide whether a line or reply is shown. Without these it reports
 * names the speaker label has introduced and lines a gate already handles.
 */
export function beatScript(
  params: Record<string, any> | undefined,
  opts: { beatName?: (id: string) => string; nameOf?: (ref: string) => string; speakerNames?: boolean } = {},
): string[] {
  const beatName = opts.beatName ?? ((id: string) => id);
  const out: string[] = [];
  const p = params ?? {};
  const label = (who: unknown, text: string) => (opts.speakerNames !== false && typeof who === 'string' && who.trim() ? `${opts.nameOf?.(who) ?? who}: ${text}` : text);
  const line = (depth: number, s: string) => out.push(`${'  '.repeat(depth)}${s}`);
  const reply = (depth: number, c: any) => {
    const gate = gatesOf(c?.conditions, beatName);
    line(depth, `Reply: ${c.text}${gate ? ` [shown only if ${gate}]` : ''}`);
  };
  for (const k of ['title', 'text', 'question', 'message', 'prompt']) {
    if (typeof p[k] === 'string' && p[k].trim()) line(0, label(k === 'title' ? '' : p.speaker, p[k]));
  }
  for (const list of [p.choices, p.props, p.hotspots]) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      const text = c?.text ?? c?.label;
      if (typeof text === 'string' && text.trim()) reply(0, { ...c, text });
    }
  }
  const seen = new Set<any>();
  const walk = (node: any, depth: number): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (typeof node.text === 'string' && node.text.trim()) line(depth, label(node.speaker, node.text));
    const choices: any[] = Array.isArray(node.choices) ? node.choices : [];
    const nextLines = choices.filter((c) => c?.continue);
    const branching = nextLines.length > 1 || nextLines.some((c) => gatesOf(c?.conditions, beatName));
    for (const c of choices) {
      if (c?.continue) {
        if (!branching) { walk(c.dialogNode, depth); continue; }
        const gate = gatesOf(c.conditions, beatName);
        line(depth, gate ? `[next line only if ${gate}]` : '[otherwise, next line]');
        walk(c.dialogNode, depth + 1);
        continue;
      }
      if (typeof c?.text === 'string' && c.text.trim()) reply(depth, c);
      // Not a next line, so the player gets a button for it, with no words on it.
      else if (c?.dialogNode) reply(depth, { ...c, text: '(a button with no label)' });
      walk(c?.dialogNode, depth + 1);
    }
    if (node.next && typeof node.next === 'object') walk(node.next, depth);
  };
  walk(p.dialogTree, 0);
  return out;
}

/** One arriving state in plain words, as the model and the author read it. */
export function describeState(state: SimulationState, opts: { affect?: Record<string, any>; nameOf?: (ref: string) => string } = {}): string {
  const name = opts.nameOf ?? ((r: string) => r);
  const parts: string[] = [];
  const held: string[] = [];
  for (const [bag, items] of state.inventory) {
    for (const item of items) {
      const n = itemQuantity(state, bag, item);
      const label = n > 1 ? `${n} ${item}` : item;
      held.push(bag === 'player' ? label : `${name(bag)} holds ${label}`);
    }
  }
  parts.push(held.length ? `has: ${held.join(', ')}` : 'has no items');
  const vars = [...state.variables].map(([k, v]) => `${k} = ${v}`);
  if (vars.length) parts.push(`variables: ${vars.join(', ')}`);
  const counters = [...state.counters].map(([k, v]) => `${k} = ${v}`);
  if (counters.length) parts.push(`counters: ${counters.join(', ')}`);
  const affect: any = opts.affect ?? state.runtime ?? {};
  for (const [role, holder] of Object.entries(affect.roleHolders ?? {})) parts.push(`@${role} is ${name(String(holder))}`);
  for (const [char, list] of Object.entries(affect.characterSentiments ?? {})) {
    for (const s of (Array.isArray(list) ? list : []) as any[]) {
      if (typeof s?.strength === 'number') parts.push(`${name(char)} feels ${s.emotion} toward ${name(String(s.toEntityRef))}: ${Math.round(s.strength * 100) / 100}`);
    }
  }
  for (const [char, mood] of Object.entries(affect.characterMoods ?? {})) {
    const v = (mood as any)?.valence;
    if (typeof v === 'number') parts.push(`${name(char)}'s mood: ${Math.round(v * 100) / 100} (-1 low to 1 high)`);
  }
  return parts.join('; ');
}

export interface CandidateInput {
  beats: Array<{ id: string; name?: string; type: string; speaker?: string; parameters?: Record<string, any> }>;
  arrivals: Map<string, BeatArrival[]>;
  /** Beats the way taken reaches in different states. */
  hubBeats: Iterable<string>;
  /** Beats the keyword check flags. */
  flaggedBeats?: Iterable<string>;
  /** The beats linking to each beat. */
  incoming: Map<string, string[]>;
  affectOf?: (state: SimulationState) => Record<string, any> | undefined;
  nameOf?: (ref: string) => string;
  /** False when the story hides speaker names from players. */
  speakerNames?: boolean;
}

/**
 * The beats worth a model's time: reached in different states or flagged by
 * the keyword check, with words to judge. Most-travelled first, then those
 * whose states differ most.
 */
export function selectCandidates(input: CandidateInput): StoryLogicCandidate[] {
  const byId = new Map(input.beats.map((b) => [b.id, b]));
  const beatName = (id: string) => byId.get(id)?.name || id;
  const wanted = new Set<string>([...input.hubBeats, ...(input.flaggedBeats ?? [])]);
  const out: StoryLogicCandidate[] = [];
  for (const id of wanted) {
    const beat = byId.get(id);
    const list = input.arrivals.get(id);
    if (!beat || !list?.length) continue;
    const words = beatWords(beat.parameters);
    if (words.length === 0) continue;
    const seen = new Map<string, BeatArrival>();
    for (const a of list) {
      if (seen.size >= MAX_STATES_PER_BEAT) break;
      const text = describeState(a.state, { affect: input.affectOf?.(a.state), nameOf: input.nameOf });
      if (!seen.has(text)) seen.set(text, a);
    }
    // States are grouped by what they hold, not by route: the route is one
    // example of how players get here, never a fact about all of them.
    const kept = [...seen].map(([text, a]) => {
      const way = a.path.steps.slice(Math.max(0, a.stepIndex - 5), a.stepIndex).map((s) => s.beatName || s.beatId);
      return [way.length ? `${text}; one way here: ${way.join(' → ')}` : text, a] as const;
    });
    const scriptOpts = { beatName, nameOf: input.nameOf, speakerNames: input.speakerNames };
    const script = beatScript(beat.parameters, scriptOpts);
    // The end of the beat before is what the player has just read.
    const before = (input.incoming.get(id) ?? []).filter((from) => from !== id).slice(0, 4).map((from) => {
      const w = beatScript(byId.get(from)?.parameters, scriptOpts).map((l) => l.trim()).join(' / ');
      return `${beatName(from)}: ${w.length > 600 ? `…${w.slice(-600)}` : w}`;
    });
    const arrivingStates = kept.map(([text]) => text);
    out.push({
      beatId: id,
      name: beat.name,
      type: beat.type,
      ...(beat.speaker ? { speaker: beat.speaker } : {}),
      words,
      script,
      arrivingStates,
      before,
      pathCount: list.reduce((n, a) => n + a.pathCount, 0),
      statePaths: kept.map(([, a]) => a.path.steps.slice(0, a.stepIndex + 1).map((s) => s.beatId)),
      cacheKey: hash(JSON.stringify([script, arrivingStates, before])),
    });
  }
  return out.sort((a, b) => b.pathCount - a.pathCount || b.arrivingStates.length - a.arrivingStates.length);
}

const promptBeat = ({ beatId, name, type, speaker, words, script, arrivingStates, before }: StoryLogicCandidate): StoryLogicPromptBeat =>
  ({ beatId, name, type, ...(speaker ? { speaker } : {}), script: script ?? words, arrivingStates, before });

/** Candidates not yet checked in this form, in order. */
export function pendingCandidates(candidates: StoryLogicCandidate[], store: StoryLogicStore | null | undefined): StoryLogicCandidate[] {
  return candidates.filter((c) => store?.checked?.[c.beatId]?.key !== c.cacheKey);
}

export function makeBatches(candidates: StoryLogicCandidate[]): StoryLogicCandidate[][] {
  const batches: StoryLogicCandidate[][] = [];
  let cur: StoryLogicCandidate[] = [];
  let chars = 0;
  for (const c of candidates) {
    const size = JSON.stringify(promptBeat(c)).length;
    if (cur.length && (cur.length >= MAX_BEATS_PER_BATCH || chars + size > MAX_CHARS_PER_BATCH)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(c);
    chars += size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/** Rough size of a run, shown before it starts (4 characters ≈ 1 token). */
export function estimateRun(candidates: StoryLogicCandidate[], digestChars: number): { batches: number; inputTokens: number; sharedTokens: number; maxOutputTokens: number } {
  const batches = makeBatches(candidates);
  const shared = STORY_LOGIC_SYSTEM_PROMPT.length + digestChars;
  const chars = batches.reduce((n, b) => n + buildStoryLogicUserPrompt(b.map(promptBeat)).length + shared, 0);
  return { batches: batches.length, inputTokens: Math.ceil(chars / CHARS_PER_TOKEN), sharedTokens: Math.ceil(shared / CHARS_PER_TOKEN), maxOutputTokens: batches.length * MAX_OUTPUT_TOKENS };
}

/**
 * Rough dollars for a run: instructions and digest are written to the prompt
 * cache once and read back after that. Output goes by what requests really
 * wrote on this story, or a typical figure before the first check. Thinking
 * models can raise their own output cap, so no figure here is a ceiling.
 */
export function estimateRunCost(
  e: { batches: number; inputTokens: number; sharedTokens: number; maxOutputTokens: number },
  price: ModelPrice,
  outputPerRequest: number = TYPICAL_OUTPUT_PER_REQUEST,
): number {
  const fresh = e.inputTokens - e.sharedTokens * e.batches;
  const input = fresh * price.input + e.sharedTokens * price.cacheWrite + e.sharedTokens * Math.max(0, e.batches - 1) * price.cacheRead;
  return (input + outputPerRequest * e.batches * price.output) / 1e6;
}

/** The first pass offered on a large story: the most-travelled beats covering about half the path visits. */
export function firstPass(candidates: StoryLogicCandidate[]): StoryLogicCandidate[] {
  const total = candidates.reduce((n, c) => n + c.pathCount, 0);
  const out: StoryLogicCandidate[] = [];
  let sum = 0;
  for (const c of candidates) {
    if (sum >= total / 2) break;
    out.push(c);
    sum += c.pathCount;
  }
  return out;
}

export interface ValidatedReply {
  findings: StoryLogicFinding[];
  /** Findings dropped by the check, with why (shown as a count; logged). */
  dropped: string[];
}

/** The check: anything not grounded in what the model was given is dropped. */
export function validateFindings(reply: string, batch: StoryLogicCandidate[]): ValidatedReply {
  let parsed: any;
  try { parsed = parseJSONWithRepair(reply); } catch { return { findings: [], dropped: ['The reply was not JSON.'] }; }
  const raw: any[] = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const byId = new Map(batch.map((c) => [c.beatId, c]));
  const findings: StoryLogicFinding[] = [];
  const dropped: string[] = [];
  const keys = new Set<string>();
  for (const f of raw) {
    const c = byId.get(f?.beatId);
    if (!c) { dropped.push(`unknown beat ${String(f?.beatId)}`); continue; }
    if (!STORY_LOGIC_KINDS.includes(f.kind)) { dropped.push(`unknown kind ${String(f.kind)}`); continue; }
    if (typeof f.quote !== 'string' || !f.quote.trim() || !c.words.some((w) => norm(w).includes(norm(f.quote)))) { dropped.push(`quote not in ${c.beatId}: ${String(f.quote)}`); continue; }
    if (!Number.isInteger(f.state) || f.state < 0 || f.state >= c.arrivingStates.length) { dropped.push(`bad state ${String(f.state)} on ${c.beatId}`); continue; }
    if (typeof f.why !== 'string' || !f.why.trim()) { dropped.push(`no reason on ${c.beatId}`); continue; }
    const key = findingKey(c.beatId, f.kind, f.quote);
    if (keys.has(key)) continue;
    keys.add(key);
    findings.push({
      key, beatId: c.beatId, kind: f.kind as StoryLogicKind, quote: f.quote, state: f.state, why: f.why,
      severity: f.severity === 'problem' ? 'problem' : 'worth a look',
      suggestion: typeof f.suggestion === 'string' ? f.suggestion : '',
    });
  }
  return { findings, dropped };
}

export function findingKey(beatId: string, kind: string, quote: string): string {
  return `${beatId}:${kind}:${hash(norm(quote))}`;
}

export type StoryLogicComplete = (
  systemPrompt: string,
  userPrompt: string,
  opts: { systemContext?: string; schema?: Record<string, unknown>; maxTokens: number; signal?: AbortSignal; route?: string; cacheContext?: boolean },
) => Promise<string>;

export interface RunProgress { done: number; total: number; found: number }

/**
 * Check the candidates batch by batch. A failed batch stops the run; what was
 * checked so far is kept (`onBatch` hands each batch's results over at once).
 */
export async function runStoryLogicCheck(
  candidates: StoryLogicCandidate[],
  digest: string,
  complete: StoryLogicComplete,
  handlers: { onBatch: (checked: StoryLogicStore['checked'], dropped: string[]) => void; onProgress?: (p: RunProgress) => void; signal?: AbortSignal },
): Promise<void> {
  const batches = makeBatches(candidates);
  let found = 0;
  for (let i = 0; i < batches.length; i++) {
    handlers.onProgress?.({ done: i, total: batches.length, found });
    const reply = await complete(STORY_LOGIC_SYSTEM_PROMPT, buildStoryLogicUserPrompt(batches[i].map(promptBeat)), {
      systemContext: digest ? `The whole story, for reference:\n${digest}` : undefined,
      schema: STORY_LOGIC_SCHEMA,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: handlers.signal,
      route: STORY_LOGIC_ROUTE,
      cacheContext: true,
    });
    if (handlers.signal?.aborted) return;
    const { findings, dropped } = validateFindings(reply, batches[i]);
    found += findings.length;
    const checked: StoryLogicStore['checked'] = {};
    for (const c of batches[i]) checked[c.beatId] = { key: c.cacheKey, findings: findings.filter((f) => f.beatId === c.beatId) };
    handlers.onBatch(checked, dropped);
  }
  handlers.onProgress?.({ done: batches.length, total: batches.length, found });
}

/** Add checked results to a store, dropping beats no longer among the story's. */
export function mergeChecked(store: StoryLogicStore | null | undefined, checked: StoryLogicStore['checked']): StoryLogicStore {
  return { ...store, version: 1, dismissed: store?.dismissed ?? [], checked: { ...(store?.checked ?? {}), ...checked } };
}

export function dismissFinding(store: StoryLogicStore | null | undefined, key: string): StoryLogicStore {
  return { ...store, version: 1, checked: store?.checked ?? {}, dismissed: [...new Set([...(store?.dismissed ?? []), key])] };
}

/** Findings to show: those of beats unchanged since checked, not dismissed; problems first. */
export function visibleFindings(candidates: StoryLogicCandidate[], store: StoryLogicStore | null | undefined): StoryLogicFinding[] {
  if (!store) return [];
  const dismissed = new Set(store.dismissed);
  const out: StoryLogicFinding[] = [];
  for (const c of candidates) {
    const entry = store.checked[c.beatId];
    if (entry?.key !== c.cacheKey) continue;
    out.push(...entry.findings.filter((f) => !dismissed.has(f.key)));
  }
  return out.sort((a, b) => Number(b.severity === 'problem') - Number(a.severity === 'problem'));
}
