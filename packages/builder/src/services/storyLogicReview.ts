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

/** Most arriving states described per beat; the commonest come first. */
const MAX_STATES_PER_BEAT = 6;
/** Batch limits: several beats share one call, none outgrows a reply. */
const MAX_BEATS_PER_BATCH = 12;
const MAX_CHARS_PER_BATCH = 24000;
const MAX_OUTPUT_TOKENS = 4000;
/** A story with more candidates than this also gets the first-pass offer. */
export const FIRST_PASS_MIN_CANDIDATES = 40;

export interface StoryLogicCandidate extends StoryLogicPromptBeat {
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
    const before = (input.incoming.get(id) ?? []).filter((from) => from !== id).slice(0, 4).map((from) => {
      const w = beatWords(byId.get(from)?.parameters).join(' / ');
      return `${beatName(from)}: ${w.length > 400 ? `${w.slice(0, 400)}…` : w}`;
    });
    const arrivingStates = kept.map(([text]) => text);
    out.push({
      beatId: id,
      name: beat.name,
      type: beat.type,
      ...(beat.speaker ? { speaker: beat.speaker } : {}),
      words,
      arrivingStates,
      before,
      pathCount: list.reduce((n, a) => n + a.pathCount, 0),
      statePaths: kept.map(([, a]) => a.path.steps.slice(0, a.stepIndex + 1).map((s) => s.beatId)),
      cacheKey: hash(JSON.stringify([words, arrivingStates, before])),
    });
  }
  return out.sort((a, b) => b.pathCount - a.pathCount || b.arrivingStates.length - a.arrivingStates.length);
}

const promptBeat = ({ beatId, name, type, speaker, words, arrivingStates, before }: StoryLogicCandidate): StoryLogicPromptBeat =>
  ({ beatId, name, type, ...(speaker ? { speaker } : {}), words, arrivingStates, before });

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
export function estimateRun(candidates: StoryLogicCandidate[], digestChars: number): { batches: number; inputTokens: number; maxOutputTokens: number } {
  const batches = makeBatches(candidates);
  const chars = batches.reduce((n, b) => n + buildStoryLogicUserPrompt(b.map(promptBeat)).length + STORY_LOGIC_SYSTEM_PROMPT.length + digestChars, 0);
  return { batches: batches.length, inputTokens: Math.ceil(chars / 4), maxOutputTokens: batches.length * MAX_OUTPUT_TOKENS };
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
  opts: { systemContext?: string; schema?: Record<string, unknown>; maxTokens: number; signal?: AbortSignal },
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
  return { version: 1, dismissed: store?.dismissed ?? [], checked: { ...(store?.checked ?? {}), ...checked } };
}

export function dismissFinding(store: StoryLogicStore | null | undefined, key: string): StoryLogicStore {
  return { version: 1, checked: store?.checked ?? {}, dismissed: [...new Set([...(store?.dismissed ?? []), key])] };
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
