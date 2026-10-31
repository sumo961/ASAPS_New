/**
 * The states players arrive in at each beat, from one path simulation.
 *
 * Path Analysis, Story Logic and the Preview's "Start as if…" presets all
 * need "with what can a player reach this beat?". A step's arrival state is
 * the previous step's stateAfter (the first step's is the state the path
 * starts in). Arrivals are grouped by what they hold — variables, counters,
 * items, casting and feelings — so a beat reached by hundreds of paths shows
 * the handful of states that actually differ, each with a sample path.
 */
import { hashState, itemQuantity, type SimulatedPath, type SimulationState } from './StateSimulationAnalyzer';

export interface BeatArrival {
  /** The state on arrival (the beat's own effects not yet applied). */
  state: SimulationState;
  /** A path that arrives in this state, and where in it the beat is. */
  path: SimulatedPath;
  stepIndex: number;
  /** How many arrivals (path visits) share this state. */
  pathCount: number;
  /** The state its path starts in (arrivalKey). Stories that draw a
   *  character variant or a run at random start in several states; a
   *  difference they start with is no sign of the way the player took. */
  startKey: string;
}

export interface ArrivalOptions {
  /** Only these beats (all when omitted). */
  only?: Iterable<string>;
  /** What makes two arrivals the same (default: variables, counters, items,
   *  casting and feelings). Presets pass what matters from the beat on. */
  keyOf?: (beatId: string, state: SimulationState) => string;
}

/** The state a path arrives in at its step `i`. */
export function arrivalStateAt(path: SimulatedPath, i: number): SimulationState {
  if (i > 0) return path.steps[i - 1].stateAfter;
  return path.steps[0]?.stateBefore ?? emptyState();
}

function emptyState(): SimulationState {
  return { variables: new Map(), counters: new Map(), inventory: new Map(), visitedBeats: new Set() };
}

// Feelings live in a runtime snapshot shared between branches until one
// changes it, so its key is computed once per snapshot.
const runtimeKeys = new WeakMap<object, string>();
function feelingsKey(state: SimulationState): string {
  const rt = state.runtime as any;
  let key = '';
  if (rt && typeof rt === 'object') {
    key = runtimeKeys.get(rt) ?? '';
    if (!key) {
      // Strengths, not when they were felt (createdAt differs per run).
      const sentiments = Object.entries(rt.characterSentiments ?? {}).map(([c, list]) =>
        [c, (Array.isArray(list) ? list : []).map((x: any) => [x?.toEntityRef, x?.emotion, x?.strength])]);
      key = JSON.stringify([rt.characterMoods ?? null, sentiments, rt.characterEmotionLevels ?? null, rt.activeCharacterVariants ?? null]);
      runtimeKeys.set(rt, key);
    }
  }
  return state.pendingRuntime?.length ? `${key}|${JSON.stringify(state.pendingRuntime)}` : key;
}

/** Variables, counters, items, casting and feelings, as one string. */
export function arrivalKey(state: SimulationState): string {
  return `${hashState(state)}#${feelingsKey(state)}`;
}

/**
 * For each beat, the distinct states players arrive in, most common first.
 * A path that visits a beat twice counts both visits.
 */
export function arrivalStates(paths: SimulatedPath[], options: ArrivalOptions = {}): Map<string, BeatArrival[]> {
  const only = options.only ? new Set(options.only) : null;
  const keyOf = options.keyOf ?? ((_beatId: string, state: SimulationState) => arrivalKey(state));
  const groups = new Map<string, Map<string, BeatArrival>>();
  for (const path of paths) {
    const startKey = path.steps.length > 0 ? arrivalKey(arrivalStateAt(path, 0)) : '';
    for (let i = 0; i < path.steps.length; i++) {
      const beatId = path.steps[i].beatId;
      if (only && !only.has(beatId)) continue;
      const state = arrivalStateAt(path, i);
      const key = `${startKey}\u0002${keyOf(beatId, state)}`;
      let byKey = groups.get(beatId);
      if (!byKey) groups.set(beatId, (byKey = new Map()));
      const seen = byKey.get(key);
      if (seen) seen.pathCount++;
      else byKey.set(key, { state, path, stepIndex: i, pathCount: 1, startKey });
    }
  }
  const out = new Map<string, BeatArrival[]>();
  for (const [beatId, byKey] of groups) {
    out.set(beatId, [...byKey.values()].sort((a, b) => b.pathCount - a.pathCount));
  }
  return out;
}

/** One fact about a state: a variable, counter, item, role or feeling. */
interface Fact {
  kind: 'variable' | 'counter' | 'item' | 'role' | 'feeling' | 'mood';
  label: string;
  value: string | number | boolean;
}

export interface DescribeOptions {
  /** The runtime's settled feelings for a state (StateSimulationAnalyzer.affectAt). */
  affectOf?: (state: SimulationState) => Record<string, unknown> | undefined;
  /** Display name for a character id or ref. */
  nameOf?: (ref: string) => string;
}

function factsOf(state: SimulationState, opts: DescribeOptions): Map<string, Fact> {
  const name = opts.nameOf ?? ((r: string) => r);
  const facts = new Map<string, Fact>();
  for (const [k, v] of state.variables) facts.set(`v:${k}`, { kind: 'variable', label: k, value: v });
  for (const [k, v] of state.counters) facts.set(`c:${k}`, { kind: 'counter', label: k, value: v });
  for (const [bag, items] of state.inventory) {
    for (const item of items) {
      const label = bag === 'player' ? item : `${name(bag)}'s ${item}`;
      facts.set(`i:${bag}\u0001${item}`, { kind: 'item', label, value: itemQuantity(state, bag, item) });
    }
  }
  const affect: any = opts.affectOf?.(state) ?? state.runtime;
  for (const [role, holder] of Object.entries(affect?.roleHolders ?? {})) {
    facts.set(`r:${role}`, { kind: 'role', label: `@${role}`, value: name(String(holder)) });
  }
  for (const [char, list] of Object.entries(affect?.characterSentiments ?? {})) {
    for (const s of (Array.isArray(list) ? list : []) as any[]) {
      if (typeof s?.strength !== 'number') continue;
      facts.set(`f:${char}\u0001${s.toEntityRef}\u0001${s.emotion}`, {
        kind: 'feeling', label: `${name(char)}'s ${s.emotion} → ${name(String(s.toEntityRef))}`, value: round(s.strength),
      });
    }
  }
  for (const [char, mood] of Object.entries(affect?.characterMoods ?? {})) {
    const valence = (mood as any)?.valence;
    if (typeof valence === 'number') facts.set(`m:${char}`, { kind: 'mood', label: `${name(char)}'s mood`, value: round(valence) });
  }
  return facts;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Whether the way a player took decides the state they arrive in: two
 * paths that started alike arrive differently. (A story that only starts
 * in different states — a variant drawn at random — reaches every beat in
 * different states without any of them depending on the route.)
 */
export function arrivesDifferently(arrivals: BeatArrival[]): boolean {
  const starts = new Map<string, number>();
  for (const a of arrivals) starts.set(a.startKey, (starts.get(a.startKey) ?? 0) + 1);
  return [...starts.values()].some((n) => n > 1);
}

/**
 * What differs between the states a beat is reached in, in the author's
 * words: "with or without the notebook", "trust 0.2 to 0.8",
 * "brave: true / not set". Empty when every arrival is the same. A
 * difference the story starts with (a variant drawn at random) is left out
 * unless the way taken changes it too.
 */
export function describeArrivalDifferences(arrivals: BeatArrival[], opts: DescribeOptions = {}): string[] {
  if (arrivals.length < 2) return [];
  const all = arrivals.map((a) => factsOf(a.state, opts));
  const keys = new Set<string>();
  for (const f of all) for (const k of f.keys()) keys.add(k);
  // Arrivals by the state their path started in.
  const byStart = new Map<string, number[]>();
  arrivals.forEach((a, i) => byStart.set(a.startKey, [...(byStart.get(a.startKey) ?? []), i]));
  const variesInPlay = (key: string): boolean => [...byStart.values()].some((idx) => {
    const vals = new Set(idx.map((i) => JSON.stringify(all[i].get(key)?.value ?? null)));
    return vals.size > 1;
  });
  const out: string[] = [];
  for (const key of [...keys].sort()) {
    if (!variesInPlay(key)) continue;
    const facts = all.map((f) => f.get(key));
    const present = facts.filter((f): f is Fact => !!f);
    const sample = present[0];
    const values = [...new Set(present.map((f) => f.value))];
    const missing = present.length < facts.length;
    if (!missing && values.length < 2) continue;
    if (sample.kind === 'item') {
      if (missing && values.every((v) => v === 1)) out.push(`with or without ${sample.label}`);
      else out.push(`${sample.label}: ${range(values.map(Number), missing)}`);
    } else if (sample.kind === 'counter' || sample.kind === 'feeling' || sample.kind === 'mood') {
      out.push(`${sample.label} ${range(values.map(Number), missing)}`);
    } else {
      const shown = values.map((v) => String(v)).sort();
      out.push(`${sample.label}: ${[...shown, ...(missing ? ['not set'] : [])].join(' / ')}`);
    }
  }
  return out;
}

function range(values: number[], missing: boolean): string {
  const nums = missing ? [...values, 0] : values;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? String(lo) : `${lo} to ${hi}`;
}

/**
 * Whether a state holds something named like `word` (an item, a set
 * variable, a counter above zero), e.g. "key" matches an item "Brass key"
 * or a variable hasKey. Story Logic uses it to tell text that assumes the
 * key from text the arriving state backs up.
 */
export function stateMentions(state: SimulationState, words: string[]): boolean {
  const res = words.map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  const hit = (name: string) => res.some((re) => re.test(name));
  for (const [bag, items] of state.inventory) {
    if (bag !== 'player') continue;
    for (const item of items) if (hit(item)) return true;
  }
  for (const [k, v] of state.variables) if (hit(k) && v !== false && v !== 0 && v !== '' && v !== 'false') return true;
  for (const [k, v] of state.counters) if (hit(k) && v > 0) return true;
  return false;
}
