/**
 * StateSimulationAnalyzer - State-aware path analysis via gameplay simulation
 *
 * Unlike constraint-based analysis that tracks what values CAN be reached,
 * this analyzer simulates actual gameplay:
 * 1. Traverses beats in order, applying state changes
 * 2. Evaluates conditions against current state
 * 3. Uses stack-based backtracking to explore all paths
 * 4. Properly tracks mandatory prerequisites (setVariable beats)
 *
 * Key improvements over ConstraintPathAnalyzer:
 * - Linear sequences are always included in paths
 * - Conditions are evaluated against actual state, not constraints
 * - No exponential explosion from constraint set enumeration
 */

import { arrivalKey, type BeatArrival } from './arrivalStates';
import type { Story } from '../engine/Story';
import { alignForComparison, counterComparisonValue, isTextForCounter } from '../engine/variableValues';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import { defaultTargetIsLive } from '../beats/Beat';
import { analysisLinks, isChoiceBeatType, EXTRA_LINK } from './analysisLinks';
import { StoryContext, PLAYTHROUGH_VARIABLE, type SerializedStoryState } from '../engine/StoryContext';
import {
  ConstraintSet,
  PathStep,
  OutcomeGroup,
  ConstraintPathResult,
  createEmptyConstraintSet,
  type PathEndType,
} from './ConstraintSet';
import type { BackwardAnalysisResult, PathRequirement, DecisionPoint } from './BackwardAnalyzer';
import { isMultiChoiceLike } from '../beats/MultiChoiceBeat';
import { ANY, allOf, anyOf, applyChange, beatsOnLoops, changeFrom, compareRanges, describeRange, hull, not, type Change, type Range, type Verdict } from './counterRanges';

// ============================================================================
// Types
// ============================================================================

/**
 * Simulation state - tracks all game state during path exploration
 */
export interface SimulationState {
  variables: Map<string, string | number | boolean>;
  counters: Map<string, number>;
  inventory: Map<string, Set<string>>; // character -> items
  /**
   * How many of an item a bag holds, keyed `bag\u0001item`, when more than
   * one (the runtime counts items). Absent = 1 while the item is in its bag.
   */
  itemCounts?: Map<string, number>;
  visitedBeats: Set<string>;
  /**
   * The characters' inner life — moods, sentiments, emotions, goals,
   * variants, baselines, bookmarks — as a runtime StoryContext snapshot
   * (2026-09-26). Feelings are computed by the runtime itself (effects,
   * per-beat decay and goal checks, feelings conditions), not re-modelled
   * here. Shared between branches until one changes it.
   */
  runtime?: Partial<SerializedStoryState>;
  /** Feeling effects not yet applied to `runtime` — flushed at the next
   *  runtime session (usually the next beat's tick), one session per step. */
  pendingRuntime?: any[];
}

/**
 * A step in the simulated path
 */
export interface SimulatedStep {
  beatId: string;
  beatName: string;
  beatType: string;
  stateAfter: SimulationState;
  /** The state the path starts in — on its first step only (every later
   *  step arrives with the previous step's stateAfter; arrivalStateAt). */
  stateBefore?: SimulationState;
  connectionTaken?: string; // Label of connection taken
  decisionMade?: string;    // For choice beats
  conditionResult?: boolean; // For condition beats
  /** Every choice was hidden, so the beat was skipped by its own link. */
  allChoicesHidden?: boolean;
}

/**
 * A complete simulated path
 */
export interface SimulatedPath {
  steps: SimulatedStep[];
  decisions: Array<{
    beatId: string;
    beatName: string;
    choiceMade: string;
    alternatives: string[];
  }>;
  outcome: {
    beatId: string;
    beatName: string;
    type: PathEndType;
  };
  finalState: SimulationState;
  /** Went on through an end screen's Replay: more than one playthrough. */
  viaReplay?: boolean;
}

/**
 * Decision point for backtracking
 */
interface DecisionStackEntry {
  beatId: string;
  stateBefore: SimulationState;
  pathBefore: SimulatedStep[];
  decisionsBefore: SimulatedPath['decisions'];
  options: Connection[];
  exploredIndices: Set<number>;
}

/**
 * Configuration for simulation analysis
 */
export interface SimulationAnalysisConfig {
  maxDepth?: number;           // Maximum path depth (default: 200)
  maxPaths?: number;           // Maximum paths to find (default: 1000)
  maxBeatRevisits?: number;    // Max times a beat can be revisited with same state (default: 1)
  /** Most branches waiting to be explored (default 4000). Past it, a branch
   *  is still queued when it leads to a beat no explored path has reached —
   *  coverage is kept, the combinatorial rest is dropped. */
  maxFrontier?: number;
  /** Most beat steps explored in one run (default 300000). */
  maxExpansions?: number;
  /** When breadth runs out of budget, the search for beats still on no path: most extra paths (default 5000). */
  maxCoveragePaths?: number;
  /** ...and most extra steps (default 150000). */
  maxCoverageExpansions?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a fresh initial state
 */
function createInitialState(): SimulationState {
  return {
    variables: new Map(),
    counters: new Map(),
    inventory: new Map(),
    visitedBeats: new Set(),
  };
}

/**
 * Deep clone a simulation state
 */
function cloneState(state: SimulationState): SimulationState {
  return {
    variables: new Map(state.variables),
    counters: new Map(state.counters),
    inventory: new Map(
      Array.from(state.inventory.entries()).map(([k, v]) => [k, new Set(v)])
    ),
    visitedBeats: new Set(state.visitedBeats),
    ...(state.itemCounts ? { itemCounts: new Map(state.itemCounts) } : {}),
    runtime: state.runtime,
    pendingRuntime: state.pendingRuntime ? [...state.pendingRuntime] : undefined,
  };
}

/** How many of `item` a bag holds (the player's bag is 'player'). */
export function itemQuantity(state: SimulationState, bag: string, item: string): number {
  if (!state.inventory.get(bag)?.has(item)) return 0;
  return state.itemCounts?.get(`${bag}\u0001${item}`) ?? 1;
}

function addItem(state: SimulationState, bag: string, item: string, quantity: number): void {
  const total = itemQuantity(state, bag, item) + Math.max(1, quantity);
  if (!state.inventory.has(bag)) state.inventory.set(bag, new Set());
  state.inventory.get(bag)!.add(item);
  if (total > 1) (state.itemCounts ??= new Map()).set(`${bag}\u0001${item}`, total);
}

/** Put exactly this many of an item in the player's bag. */
function setPlayerQuantity(state: SimulationState, item: string, quantity: number): void {
  state.inventory.get('player')?.delete(item);
  state.itemCounts?.delete(`player\u0001${item}`);
  if (quantity > 0) addItem(state, 'player', item, quantity);
}

/** Take some away; at none the item leaves the bag (as StoryContext.removeFromInventory). */
function removeItem(state: SimulationState, bag: string, item: string, quantity: number): void {
  const left = itemQuantity(state, bag, item) - Math.max(1, quantity);
  if (left <= 0) {
    state.inventory.get(bag)?.delete(item);
    state.itemCounts?.delete(`${bag}\u0001${item}`);
  } else if (left === 1) state.itemCounts?.delete(`${bag}\u0001${item}`);
  else (state.itemCounts ??= new Map()).set(`${bag}\u0001${item}`, left);
}

/** How a path going on past an end screen records that decision. */
const REPLAY_DECISION = 'Replay';

/** Target of a route that ends the story: no beat has this id. */
const STORY_STOPS = '__story_stops__';

/**
 * Create a hash of the simulation state for cycle detection
 * Only includes variables/counters/inventory, not visitedBeats (which changes every step)
 */
/** Variables, counters, items (with how many) and casting, as one string. */
export function hashState(state: SimulationState): string {
  const parts: string[] = [];

  // Sort variables by name for consistent hashing
  const sortedVars = Array.from(state.variables.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, value] of sortedVars) {
    parts.push(`v:${name}=${value}`);
  }

  const sortedCounters = Array.from(state.counters.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, value] of sortedCounters) {
    parts.push(`c:${name}=${value}`);
  }

  const sortedInventory = Array.from(state.inventory.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [char, items] of sortedInventory) {
    const sortedItems = Array.from(items).sort().map((it) => {
      const n = state.itemCounts?.get(`${char}\u0001${it}`);
      return n && n > 1 ? `${it}x${n}` : it;
    });
    parts.push(`i:${char}=[${sortedItems.join(',')}]`);
  }

  // Who plays each role: two castings at one beat are different stories.
  // Casts still pending (applied at the next runtime session) count already.
  const holders: Record<string, string> = { ...((state.runtime as any)?.roleHolders ?? {}) };
  for (const e of state.pendingRuntime ?? []) {
    if (e?.type === 'castRole' && e.target && e.character) holders[String(e.target).replace(/^@/, '')] = e.character;
  }
  for (const role of Object.keys(holders).sort()) parts.push(`r:${role}=${holders[role]}`);

  return parts.join('|');
}

/** At most `cap` items, spread evenly over the list (first and last kept). */
function spreadSample<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(items[Math.round((i * (items.length - 1)) / (cap - 1))]);
  return out;
}

// ============================================================================
// StateSimulationAnalyzer
// ============================================================================

/** One move on the way to a situation (exploreSituations). */
export interface SituationStep {
  beatId: string;
  next?: string;
  /** The link's label: a choice's words, 'true', a timer. */
  label: string;
  /** The replies said on the way through a Dialog Tree. */
  replies: string[];
}

export interface SituationConfig {
  /** Stop after this many situations. */
  maxSituations?: number;
  /** Stop after this many situations with nothing new found. */
  maxStalled?: number;
  /**
   * Stopped short, try this many more situations aimed at the links still
   * never taken: only states that meet a closed link's conditions, nearest
   * to it first. 0 turns it off.
   */
  maxAimed?: number;
  /**
   * Work out counter ranges first (counterRanges) and leave out of the search
   * what they rule out. Default true.
   */
  counterRanges?: boolean;
}

/** What exploreSituations found. */
export interface SituationSearch {
  /** Every situation was played: nothing else can be reached under these rules. */
  complete: boolean;
  situations: number;
  perBeat: Map<string, number>;
  endings: Set<string>;
  stops: Set<string>;
  traps: Set<string>;
  routes: Map<string, number>;
  /** One way to a beat. */
  routeTo?: (beatId: string) => SituationStep[];
  /** Beats some player reaches with every choice hidden. */
  hiddenChoices: Set<string>;
  /** The distinct states each beat is arrived in, most common first (up to ARRIVALS_KEPT each). */
  arrivals: Map<string, BeatArrival[]>;
}

/** A condition on the way between two beats, and how many arrival states meet it (gatesOnTheWay). */
export interface GateOnTheWay {
  /** All of these must hold (one condition, or an earlier line's list). */
  conditions: Condition[];
  /** An earlier line shown instead when these hold: met where they don't. */
  earlierLine: boolean;
  /** The line or reply leading there is never shown, whatever the state. */
  neverShown?: boolean;
  met: number;
  of: number;
}

/** Why the counter ranges rule a link out (counterRanges). */
export interface RangeClosure {
  /** Conditions that can never all hold there; for a Condition beat, its check, which always answers the other way. */
  conditions: Condition[];
  /** What the ranges say about the counters those read: "Money is always 0 there". */
  values: string[];
  /** Shut by an earlier line that always plays instead (its conditions always hold). */
  earlierLine?: boolean;
  /** With several ways there (a Dialog Tree's routes): each way's own conditions. */
  ways?: Condition[][];
  /** Of the conditions, the ones that failed where this was worked out (internal). */
  failing?: Condition[];
}

/**
 * The values each counter can have when players arrive at each beat, one
 * range per counter (counterRanges). Sound: a beat outside `reached` no way of
 * playing gets to, and a link `closed` names is never taken.
 */
export interface CounterRangeFacts {
  reached: ReadonlySet<string>;
  at(beatId: string): ReadonlyMap<string, Range> | undefined;
  closed(fromId: string, toId: string): RangeClosure | null;
  /** A played state at this beat lies in what was worked out (the check that it can be trusted). */
  holds(beatId: string, state: SimulationState): boolean;
}

/** A fact counterRanges follows but can't pin down: any value. */
const ANY_VALUE = Symbol('any value');
/** What a variable nobody knows holds while a step is played (with 5 the second time). */
const STAND_IN = '\u0000anything';

/** What counterRanges knows on arrival: ranges for counters, values for the facts it tracks. */
interface AbsState {
  facts: ReadonlyMap<string, unknown>;
  ranges: Map<string, Range>;
}

/** The facts a condition reads, as counterRanges tracks them; '*' for what it can't. */
function factsRead(c: any): string[] {
  if (!c || typeof c !== 'object') return [];
  const name = c.variableName || c.variable || c.left;
  switch (c.type) {
    case 'variable': return name ? [`v\u0001${name}`] : [];
    case 'visitedBeat': { const id = c.beatId || c.value; return id ? [`b\u0001${id}`] : []; }
    case 'inventory': {
      // A threshold read from a variable or counter: not followed.
      if (c.compareVariable || typeof c.quantityValue === 'string') return ['*'];
      const item = String(c.item || c.value || c.right || '');
      return item ? [`i\u0001${item}`] : [];
    }
    default: return [];
  }
}

/** States kept per beat for Story Logic: enough to tell what differs, not every combination. */
const ARRIVALS_KEPT = 100;

/** How far a running path analysis has got (analyzeAsync progress). */
export interface SimulationProgress {
  /** Simulation steps taken so far. */
  expansions: number;
  /** Distinct beats the simulation has reached so far. */
  beatsReached: number;
  /** Paths finished so far. */
  pathsFound: number;
  /** What it is doing: trying every way, looking for what's still unreached, following Replay; or the situation search. */
  phase: 'exploring' | 'unreached' | 'replay' | 'situations';
}

/** Let the event loop run (paint, input) before the next slice of work. */
function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class StateSimulationAnalyzer {
  private story: Story;
  private config: Required<SimulationAnalysisConfig>;

  // Cached beat lookups
  private beatCache: Map<string, Beat | null> = new Map();

  /** One runtime context, reloaded from each state's snapshot as needed. */
  private scratch: StoryContext | null | undefined;

  private getScratch(): StoryContext | null {
    if (this.scratch === undefined) {
      try { this.scratch = new StoryContext(undefined, this.story); } catch { this.scratch = null; }
    }
    return this.scratch;
  }

  private characters(): any[] {
    return ((this.story as any).getCharacters?.() ?? []) as any[];
  }

  /** The character a reference names (id, name or display name). */
  private characterOf(ref: string | undefined): any | undefined {
    if (!ref) return undefined;
    const r = String(ref).replace(/^@/, '');
    return this.characters().find((c) => c?.id === r || c?.name === r || c?.displayName === r);
  }

  /** The bag an item goes to: the player's ('player'), or a character's by id — as StoryContext.addInventoryItem. */
  private bagOf(ref: string | undefined): string {
    if (!ref || ref === 'player' || ref === '@player') return 'player';
    return this.characterOf(ref)?.id ?? ref;
  }

  /**
   * Where a counter lives, as StoryContext does it. A bare name — or the one
   * character that declares it — is the plain name; another character's
   * counter of that name is `@Name:counter` (it would otherwise add into
   * the same number).
   */
  private counterKey(ref: string | undefined, name: string): string {
    if (!ref) return name;
    const owner = this.characterOf(ref);
    if (!owner) return name;
    const declaring = this.characters().filter((c) => Array.isArray(c?.counters) && c.counters.some((d: any) => d?.name === name));
    if (declaring.length === 1 && declaring[0].id === owner.id) return name;
    return `@${owner.name || owner.id}:${name}`;
  }

  /**
   * Starting states: the runtime's own story-start seeding (moods, variants,
   * counters). A character with variantSelectionPolicy 'random' starts once
   * per variant (combinations capped at 16) so every disposition is played.
   */
  /** A fresh state with the story variables at their Project Settings
   *  defaults — the runtime starts them there too. */
  private seededInitialState(): SimulationState {
    const state = createInitialState();
    const defs = (this.story as any).getSettings?.()?.variables;
    for (const def of Array.isArray(defs) ? defs : []) {
      if (def?.name && def.defaultValue !== undefined && def.defaultValue !== '') state.variables.set(def.name, def.defaultValue);
    }
    for (const char of this.characters()) {
      // Characters start with the items listed on them (the runtime hands
      // them out too): the player's in the player's bag, others in their own.
      const bag = char?.role === 'player' ? 'player' : char?.id;
      for (const it of Array.isArray(char?.inventory) ? char.inventory : []) {
        const name = typeof it?.name === 'string' ? it.name.trim() : '';
        if (name && bag) addItem(state, bag, name, Number(it.quantity) > 0 ? Number(it.quantity) : 1);
      }
      // Their counters start at their authored values (StoryContext.seedCharacterCountersFromStory).
      for (const def of Array.isArray(char?.counters) ? char.counters : []) {
        if (def?.name && typeof def.value === 'number' && def.value !== 0) state.counters.set(this.counterKey(char.id, def.name), def.value);
      }
    }
    return state;
  }

  /**
   * Every starting state, once per value of the built-in playthrough the story
   * can tell apart: a story that tests it (a returning-player branch) is
   * explored as a first run AND a replay — otherwise that branch would read
   * as unreachable. Stories that never mention it start at run 1.
   */
  private initialStates(): SimulationState[] {
    const mentionsRun = /playthrough/.test(JSON.stringify(this.story.getAllBeats().map((b: any) => b.getParameters?.() ?? b.parameters ?? {}))
      + JSON.stringify(this.story.getAllBeats().map((b: any) => b.connections ?? [])));
    if (!mentionsRun) return this.initialStatesForRun();
    return [1, 2].flatMap((run) => this.initialStatesForRun().map((st) => {
      if (!st.variables.has(PLAYTHROUGH_VARIABLE)) st.variables.set(PLAYTHROUGH_VARIABLE, run);
      return st;
    }));
  }

  private initialStatesForRun(): SimulationState[] {
    const base = this.seededInitialState();
    const ctx = this.getScratch();
    if (!ctx) return [base];
    const characters: any[] = ((this.story as any).getCharacters?.() ?? []) as any[];
    const random = characters.filter((c) => c?.variantSelectionPolicy === 'random' && Array.isArray(c.variants) && c.variants.some((v: any) => v?.id));
    // Random roles start once per candidate too (D8: the combinations of
    // variants × castings are sampled evenly down to 16, not truncated).
    const randomRoles = ctx.getRoles().filter((r) => r.selection === 'random' && r.candidates.length > 0);
    type Pick = ['variant' | 'role', string, string];
    let combos: Pick[][] = [[]];
    const widen = (options: Pick[]) => {
      const next: Pick[][] = [];
      for (const combo of combos) for (const o of options) next.push([...combo, o]);
      combos = next;
    };
    for (const c of random) widen(c.variants.filter((x: any) => x?.id).map((v: any) => ['variant', c.id, v.id] as Pick));
    for (const r of randomRoles) widen(r.candidates.map((id) => ['role', r.id, id] as Pick));
    combos = spreadSample(combos, 16);
    return combos.map((combo) => {
      ctx.reset();
      for (const [kind, key, value] of combo) {
        if (kind === 'variant') ctx.setActiveCharacterVariant(key, value, { seedAffect: true });
        else ctx.castRole(key, value);
      }
      return { ...this.seededInitialState(), runtime: ctx.getAffectSnapshot() };
    });
  }

  /**
   * Run `fn` against the runtime context holding this state: its feelings
   * snapshot plus the simulator's own variables / counters / inventory
   * (goal checks and conditions read those). `mutate` stores the result.
   */
  /** A fresh serialized state: the fields the affect snapshot does not carry. */
  private blankRuntime: SerializedStoryState | null = null;
  /** Whether any character has authored goals (the per-beat tick re-checks them). */
  private storyHasGoals: boolean | null = null;

  /** Does the per-beat runtime tick have anything to do for this state? */
  private tickMatters(state: SimulationState): boolean {
    if (this.storyHasGoals === null) {
      const characters: any[] = ((this.story as any).getCharacters?.() ?? []) as any[];
      this.storyHasGoals = characters.some((c) => Array.isArray(c?.goals) && c.goals.length > 0);
    }
    if (this.storyHasGoals) return true;
    const levels = (state.runtime as any)?.characterEmotionLevels ?? {};
    return Object.values(levels).some((m: any) => m && Object.values(m).some((v: any) => Number(v) > 0));
  }

  private withRuntime<T>(state: SimulationState, fn: (ctx: StoryContext) => T, mutate: boolean): T | undefined {
    const ctx = this.getScratch();
    if (!ctx || !state.runtime) return undefined;
    const quiet = console.log;
    console.log = () => {};
    try {
      // The runtime's own bag is the player's.
      const items = [...(state.inventory.get('player') ?? [])].map((name) => ({ name, quantity: itemQuantity(state, 'player', name) }));
      ctx.loadSimulationState(state.runtime, Object.fromEntries(state.variables), Object.fromEntries(state.counters), items);
      // Deferred feeling effects first, in the order they were taken.
      const pending = state.pendingRuntime;
      if (pending?.length) for (const e of pending) { try { ctx.applyEffect(e); } catch { /* skip */ } }
      const result = fn(ctx);
      // Only the affect part is kept: the runtime's own visited list and
      // history would grow along every path and slow each step.
      if (mutate || pending?.length) { state.runtime = ctx.detachAffectSnapshot(); state.pendingRuntime = undefined; }
      return result;
    } catch {
      return undefined;
    } finally {
      console.log = quiet;
    }
  }

  /** The feelings in a simulated state (pending effects applied), as a
   *  StoryContext affect snapshot — for presets and anything that evaluates
   *  feelings conditions outside the analyzer. */
  affectAt(state: SimulationState): Record<string, unknown> | undefined {
    const probe: SimulationState = { ...state, pendingRuntime: state.pendingRuntime ? [...state.pendingRuntime] : undefined };
    this.withRuntime(probe, () => undefined, false);
    return probe.runtime as Record<string, unknown> | undefined;
  }

  /** The last run hit maxFrontier / maxExpansions: some permutations were
   *  not explored (every reachable beat still was, as far as the budget
   *  allowed). */
  public truncated = false;
  /** The search for unreached beats ran out of budget: "unreachable" then means "not found". */
  public searchLimited = false;
  /**
   * The counter ranges the last situation search ran with (counterRanges),
   * when every state it played lay in them. Null otherwise.
   */
  public rangeFacts: CounterRangeFacts | null = null;
  /** Dialog Tree replies some playthrough had on screen, as `beatId|choiceId`. */
  public shownReplies = new Set<string>();

  constructor(story: Story, config: SimulationAnalysisConfig = {}) {
    this.story = story;
    this.config = {
      maxDepth: config.maxDepth ?? 200,
      // Bumped from 1000 → 50000. Stories with wide hub-and-spoke structures
      // can push narrow condition-gated endings to the back of the BFS queue,
      // and a 1000-path budget exhausts before they are dequeued. Real
      // AI-generated stories (20–40 beats) commonly need 10k–30k paths to
      // surface all reachable endings. See Hollow Star regression test.
      maxPaths: config.maxPaths ?? 50000,
      maxBeatRevisits: config.maxBeatRevisits ?? 1,
      maxFrontier: config.maxFrontier ?? 4000,
      maxExpansions: config.maxExpansions ?? 300000,
      maxCoveragePaths: config.maxCoveragePaths ?? 10000,
      maxCoverageExpansions: config.maxCoverageExpansions ?? 300000,
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Analyze all feasible paths through the story (forward analysis)
   * Returns result compatible with ConstraintPathResult
   */
  public analyze(): ConstraintPathResult {
    const startTime = performance.now();

    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      return this.buildEmptyResult(startTime);
    }

    const paths = this.exploreAllPaths(firstBeatId, this.initialStates());

    return this.buildResult(paths, startTime);
  }

  /**
   * analyze(), without holding the thread: runs in slices of about a frame
   * and reports how far it got between them. Same result as analyze().
   */
  public async analyzeAsync(
    onProgress?: (progress: SimulationProgress) => void,
    signal?: { aborted: boolean },
    sliceMs = 12
  ): Promise<ConstraintPathResult> {
    const startTime = performance.now();
    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) return this.buildEmptyResult(startTime);
    const run = this.explorePaths(firstBeatId, this.initialStates());
    let sliceStart = performance.now();
    let step = run.next();
    while (!step.done) {
      if (performance.now() - sliceStart >= sliceMs) {
        onProgress?.(step.value);
        await yieldToEventLoop();
        if (signal?.aborted) throw new DOMException('Path analysis cancelled', 'AbortError');
        sliceStart = performance.now();
      }
      step = run.next();
    }
    return this.buildResult(step.value, startTime);
  }

  /**
   * EXPERIMENT, used by no tool yet: search situations instead of paths. A
   * situation is a beat plus the state values gates still ahead of it read;
   * each is played once, remembering one way of getting there. The work grows
   * with how many situations exist, not with how many orders reach them, so
   * the search can finish where exploring paths runs out of budget.
   */
  public exploreSituations(config: SituationConfig = {}): SituationSearch {
    const run = this.situationRun(config);
    let step = run.next();
    while (!step.done) step = run.next();
    return step.value;
  }

  /** exploreSituations without freezing the UI: the same slices as analyzeRawAsync. */
  public async exploreSituationsAsync(
    onProgress?: (progress: SimulationProgress) => void,
    signal?: { aborted: boolean },
    config: SituationConfig = {},
    sliceMs = 12
  ): Promise<SituationSearch> {
    const run = this.situationRun(config);
    let sliceStart = performance.now();
    let step = run.next();
    while (!step.done) {
      if (performance.now() - sliceStart >= sliceMs) {
        onProgress?.(step.value);
        await yieldToEventLoop();
        if (signal?.aborted) throw new DOMException('Situation search cancelled', 'AbortError');
        sliceStart = performance.now();
      }
      step = run.next();
    }
    return step.value;
  }

  private *situationRun(config: SituationConfig): Generator<SimulationProgress, SituationSearch, void> {
    const startBeatId = this.story.getFirstBeatId();
    const maxSituations = config.maxSituations ?? 500000;
    // Long after the last find, more of the same finds nothing: stop and say so.
    const maxStalled = config.maxStalled ?? 150000;
    const result: SituationSearch = {
      complete: true, situations: 0, perBeat: new Map(), endings: new Set(), stops: new Set(), traps: new Set(), routes: new Map(),
      hiddenChoices: new Set(), arrivals: new Map(),
    };
    this.searchLimited = false;
    this.rangeFacts = null;
    this.oneRunFacts = null;
    if (!startBeatId) return result;
    this.shownReplies = new Set();
    // Ranges first: what they rule out the search need not tell states apart for.
    const ranges = config.counterRanges === false ? null : this.counterRanges();
    let rangesHold = !!ranges;
    const open = ranges?.reached;
    const keyOf = this.stateThatDecidesGates(new Map(this.story.getAllBeats().filter((b) => !open || open.has(b.id)).map((b) => [b.id, 0])));
    interface Item { beatId: string; state: SimulationState; parent: number; via: SituationStep | null; start: string }
    interface Arrived { state: SimulationState; parent: number; count: number; start: string }
    const arrived = new Map<string, Map<string, Arrived>>();
    const trapAt = new Map<string, boolean>();
    const isTrapAt = (beat: Beat): boolean => {
      let known = trapAt.get(beat.id);
      if (known === undefined) trapAt.set(beat.id, (known = this.isTrap(beat)));
      return known;
    };
    const parents: Array<{ parent: number; step: SituationStep }> = [];
    const seen = new Set<string>();
    // The rest wait by how near they are to something still to find, and each
    // distance takes its turn: beats that can never open sit near a gate nothing
    // meets, and always taking the nearest would starve everything further off.
    const stopsFound = new Set<string>();
    const fresh: Item[] = [];
    const buckets: Item[][] = [];
    const far: Item[] = [];
    let waiting = 0;
    let turn = 0;
    let distance = new Map<string, number>();
    let distanceFor = -1;
    const refreshDistance = () => {
      const size = result.perBeat.size + stopsFound.size + this.shownReplies.size;
      if (size === distanceFor) return;
      distanceFor = size;
      distance = this.distanceToUncovered(new Set(result.perBeat.keys()), stopsFound, open);
    };
    const file = (item: Item) => {
      const d = distance.get(item.beatId);
      if (d === undefined) far.push(item); else (buckets[d] ??= []).push(item);
      waiting++;
    };
    const take = (): Item | undefined => {
      for (let tried = 0; tried < buckets.length; tried++) {
        turn = turn + 1 >= buckets.length ? 0 : turn + 1;
        const item = buckets[turn]?.pop();
        if (item) { waiting--; return item; }
      }
      const item = far.pop();
      if (item) waiting--;
      return item;
    };
    const push = (beatId: string, state: SimulationState, parent: number, via: SituationStep | null, start: string) => {
      if (!this.getBeat(beatId) && parent >= 0) {
        const from = parents[parent].step;
        result.stops.add(from.beatId);
        stopsFound.add(`${from.beatId}|${from.label || beatId}`);
        return;
      }
      // Every state played must lie in the ranges, or they are not to be trusted.
      if (rangesHold && !ranges!.holds(beatId, state)) rangesHold = false;
      // Noted before situations merge: what no gate reads still shows in the text.
      let states = arrived.get(beatId);
      if (!states) arrived.set(beatId, (states = new Map()));
      if (states.size < ARRIVALS_KEPT) {
        const arrivedKey = `${start}\u0002${arrivalKey(state)}`;
        const known = states.get(arrivedKey);
        if (known) known.count++;
        else states.set(arrivedKey, { state, parent, count: 1, start });
      }
      const key = `${beatId}|${keyOf(beatId, state)}`;
      if (seen.has(key)) {
        // Back in the same situation, and no way out of here reaches an end.
        const again = this.getBeat(beatId);
        if (again && !this.isTerminalBeat(again) && isTrapAt(again)) result.traps.add(beatId);
        return;
      }
      seen.add(key);
      // Beats nobody has played yet go first: reach before thoroughness.
      if (!result.perBeat.has(beatId)) fresh.push({ beatId, state, parent, via, start });
      else if (aimed) aimed.file({ beatId, state, parent, via, start });
      else file({ beatId, state, parent, via, start });
    };
    let aimed: { file: (item: Item) => void } | null = null;
    for (const state of this.initialStates()) {
      const first = cloneState(state);
      push(startBeatId, first, -1, null, arrivalKey(first));
    }
    let found = 0;
    let lastFind = 0;
    const expand = (item: Item): void => {
      const beat = this.getBeat(item.beatId);
      if (!beat) return;
      result.situations++;
      result.perBeat.set(beat.id, (result.perBeat.get(beat.id) ?? 0) + 1);
      const redirect = this.requirementRedirect(beat, item.state);
      if (redirect) { push(redirect, item.state, item.parent, item.via, item.start); return; }
      const me = parents.length;
      parents.push({ parent: item.parent, step: { beatId: beat.id, label: '', replies: [] } });
      if (!result.routes.has(beat.id)) result.routes.set(beat.id, me);
      const state = this.applyBeatEffects(beat, item.state);
      const on = (conn: Connection | null, target: string, next: SimulationState) => {
        const step: SituationStep = {
          beatId: beat.id, next: target, label: conn?.label ?? '',
          replies: ((conn as any)?.route ?? []).filter((st: any) => st.choice).map((st: any) => String(st.choice.text ?? '')),
        };
        const at = parents.length;
        parents.push({ parent: me, step });
        push(target, next, at, step, item.start);
      };
      if (this.isTerminalBeat(beat)) {
        if (['endScreen', 'aiSummary'].includes(beat.type)) {
          result.endings.add(beat.id);
          if (beat.type === 'endScreen' && beat.getParameters().showRestart !== false) {
            const after = this.stateAfterReplay(beat, state);
            const link = this.linkWhenAllHidden(beat, after);
            if (link) on(null, link, after);
            else if (beat.getParameters().reset === true && hashState(after) !== hashState(this.seededInitialState())) on(null, startBeatId, after);
          }
        } else if (this.loopsOnItself(beat)) result.traps.add(beat.id);
        else result.stops.add(beat.id);
        return;
      }
      const connections = this.getConnections(beat);
      if (connections.length === 0) { result.stops.add(beat.id); return; }
      if (beat.type === 'conditionBeat') {
        const yes = this.conditionBeatResult(beat, state);
        const taken = (yes
          ? connections.find((c) => c.label?.toLowerCase() === 'true' || c.label?.toLowerCase() === 'yes')
          : connections.find((c) => c.label?.toLowerCase() === 'false' || c.label?.toLowerCase() === 'no')) ?? connections[0];
        on(taken, taken.targetId, this.followLink(taken, state, []  as SimulatedStep[]));
      } else if (this.isChoiceBeat(beat) || this.hasTimedExit(beat)) {
        const offered = connections.filter((c) => this.choiceOffered(beat, c, state));
        if (offered.length === 0) {
          const link = this.linkWhenAllHidden(beat, state);
          if (link) { result.hiddenChoices.add(beat.id); on(null, link, state); } else result.stops.add(beat.id);
          return;
        }
        connections.forEach((conn, i) => {
          if (!offered.includes(conn) || this.isNeverDrawn(beat, conn)) return;
          const next = this.applyChoiceEffects(beat, cloneState(state), i, conn);
          this.applyEffectsList(conn.effects, next);
          on(conn, conn.targetId, next);
        });
      } else {
        const only = connections[0];
        const next = cloneState(state);
        this.applyEffectsList(only.effects, next);
        on(only, only.targetId, next);
      }
    };
    while (fresh.length > 0 || waiting > 0) {
      const finds = result.perBeat.size + result.endings.size + result.stops.size + result.traps.size + this.shownReplies.size;
      if (finds !== found) { found = finds; lastFind = result.situations; }
      if (result.situations >= maxSituations || result.situations - lastFind >= maxStalled) { result.complete = false; break; }
      if (result.situations % 250 === 0) yield { expansions: result.situations, beatsReached: result.perBeat.size, pathsFound: 0, phase: 'situations' };
      refreshDistance();
      const item = fresh.pop() ?? take();
      if (!item) break;
      expand(item);
    }
    // Stopped short: aim what's left at the links still never taken.
    const maxAimed = config.maxAimed ?? 100000;
    const maxAimedStalled = Math.min(maxAimed, 20000);
    const leftToFind = !rangesHold || [...open!].some((id) => !result.perBeat.has(id));
    if (!result.complete && maxAimed > 0 && leftToFind) {
      const goals = this.closedLinkGoals(new Set(result.perBeat.keys()), rangesHold ? open : undefined);
      if (goals.length > 0) {
        const near: Item[][] = [];
        let queued = 0;
        aimed = {
          file: (item) => {
            let best = Infinity;
            for (const g of goals) {
              const d = g.distance.get(item.beatId);
              if (d !== undefined && d < best && g.holds(item.state)) best = d;
            }
            if (best < Infinity) { (near[best] ??= []).push(item); queued++; }
          },
        };
        for (const item of [...fresh.splice(0), ...buckets.flat(), ...far.splice(0)]) aimed.file(item);
        buckets.length = 0;
        waiting = 0;
        // Aimed well, a way through turns up soon (group 1's after 355): stop
        // after a while with nothing new.
        let lastAimFind = 0;
        for (let spent = 0; spent < maxAimed; spent++) {
          if (spent % 250 === 0) yield { expansions: result.situations, beatsReached: result.perBeat.size, pathsFound: 0, phase: 'situations' };
          let item = fresh.pop();
          if (!item && queued > 0) {
            for (const list of near) { if (list?.length) { item = list.pop(); queued--; break; } }
          }
          if (!item) break;
          const before = result.perBeat.size;
          expand(item);
          if (result.perBeat.size > before) lastAimFind = spent;
          else if (spent - lastAimFind >= maxAimedStalled) break;
        }
      }
    }
    const wayFrom = (parent: number): SituationStep[] => {
      const steps: SituationStep[] = [];
      for (let at = parent; at >= 0; at = parents[at].parent) if (parents[at].step.next) steps.unshift(parents[at].step);
      return steps;
    };
    result.routeTo = (beatId: string) => wayFrom(result.routes.get(beatId) ?? -1);
    const named = (id: string) => ({ beatId: id, beatName: this.getBeat(id)?.name ?? id });
    for (const [beatId, states] of arrived) {
      const list = [...states.values()].sort((a, b) => b.count - a.count).map((a): BeatArrival => {
        const way = wayFrom(a.parent);
        return {
          state: a.state, stepIndex: way.length, pathCount: a.count, startKey: a.start,
          path: { steps: [...way.map((s) => named(s.beatId)), named(beatId)] },
        };
      });
      result.arrivals.set(beatId, list);
    }
    this.searchLimited = !result.complete;
    if (ranges && !rangesHold) console.warn('[StateSimulationAnalyzer] A played state fell outside the counter ranges; not using them');
    const checksBegan = performance.now();
    this.rangeFacts = rangesHold && ranges ? yield* this.linkChecks(ranges, result) : null;
    this.linkCheckMs = performance.now() - checksBegan;
    // Beats still open: are they out of reach within one playthrough?
    this.oneRunFacts = null;
    const facts = this.rangeFacts;
    if (facts && !result.complete && [...facts.reached].some((id) => !result.perBeat.has(id))) {
      this.oneRunFacts = this.counterRanges([], 60000, undefined, { oneRun: true });
    }
    return result;
  }

  /**
   * Stopped short with beats still open: for each link from a played beat to
   * an unplayed one, follow exactly what its conditions read, together
   * (counterRanges with those facts tracked). One that finds no way to meet
   * them all at once rules the link out. Each is trusted only when every beat
   * and state the search played lies in it.
   */
  /** Every counter a step names (counterRanges), found once. */
  private rangeKeys = new Set<string>();
  /** The beats on loops, from the first counterRanges run: later runs leave out more, never add. */
  private rangeLoops: Set<string> | null = null;
  /** How each step changes counters (counterRanges), for the counters in rangeCounterOrder. */
  private rangeCounterSteps = new Map<string, Map<string, Change>>();
  private rangeCounterOrder = '';
  /** counterRanges is working out one playthrough: Replays lead nowhere. */
  private rangeOneRun = false;
  /**
   * The counter ranges within one playthrough (no Replay), worked out when the
   * search left beats open: a beat out of reach here but open in rangeFacts
   * can only be reached after replaying, with values carried over.
   */
  public oneRunFacts: CounterRangeFacts | null = null;
  /** isTerminalBeat per beat, for counterRanges (it builds the beat's links each time). */
  private rangeTerminal = new Map<string, boolean>();
  /** getConnections per beat, for counterRanges: it asks once per combination of facts. */
  private rangeLinks = new Map<string, Connection[]>();

  /** How long the last search's link checks took (linkChecks), in ms. */
  public linkCheckMs = 0;

  private *linkChecks(base: CounterRangeFacts, result: SituationSearch): Generator<SimulationProgress, CounterRangeFacts, void> {
    const played = new Set(result.perBeat.keys());
    if (result.complete) return base;
    const merge = (into: CounterRangeFacts, checks: CounterRangeFacts[]): CounterRangeFacts => {
      const all = [into, ...checks];
      return {
        reached: new Set([...into.reached].filter((id) => checks.every((c) => c.reached.has(id)))),
        at: into.at,
        holds: into.holds,
        closed: (fromId, toId) => {
          for (const f of all) { const why = f.closed(fromId, toId); if (why) return why; }
          return null;
        },
      };
    };
    // What one check rules out, the next starts from: "ruined" is set only on
    // a beat a visit check already shut. Until a round finds nothing new.
    let facts = base;
    let budget = 40;
    for (let round = 0; round < 4 && budget > 0; round++) {
      if ([...facts.reached].every((id) => played.has(id))) break;
      const groups = new Map<string, string[]>();
      for (const beatId of played) {
        const beat = this.getBeat(beatId);
        if (!beat) continue;
        const links = analysisLinks(beat);
        for (const target of new Set(links.map((c) => c.targetId))) {
          if (played.has(target) || !this.getBeat(target) || !facts.reached.has(target) || facts.closed(beatId, target)) continue;
          const conditions: any[] = beat.type === 'conditionBeat'
            ? [this.getCondition(beat), ...((beat.getParameters() as any).moreConditions ?? [])]
            : this.gatesOnTheWay(beatId, target, []).flat().flatMap((g) => g.conditions);
          if (links.some((c) => c.targetId === target && c.label === EXTRA_LINK.requiresFallback)) {
            conditions.push(...(((beat as any).requires ?? []) as any[]).map((r) => r?.condition));
          }
          const track = [...new Set(conditions.flatMap((c) => factsRead(c)))].sort();
          if (track.length === 0 || track.includes('*') || track.length > 4) continue;
          groups.set(track.join('\u0002'), track);
        }
      }
      const checks: CounterRangeFacts[] = [];
      for (const track of groups.values()) {
        if (budget-- <= 0) break;
        yield { expansions: result.situations, beatsReached: result.perBeat.size, pathsFound: 0, phase: 'situations' };
        const check = this.counterRanges(track, 40000, facts);
        if (!check) continue;
        const fits = [...played].every((id) => check.reached.has(id))
          && [...result.arrivals].every(([id, list]) => list.every((a) => check.holds(id, a.state)));
        if (fits) checks.push(check);
        else console.warn('[StateSimulationAnalyzer] A played state fell outside a link check; not using it');
      }
      const before = facts.reached.size;
      const closedBefore = this.countClosed(facts, played);
      if (checks.length === 0) break;
      facts = merge(facts, checks);
      if (facts.reached.size === before && this.countClosed(facts, played) === closedBefore) break;
    }
    return facts;
  }

  /** How many links from played beats to unplayed ones the facts rule out. */
  private countClosed(facts: CounterRangeFacts, played: Set<string>): number {
    let n = 0;
    for (const beatId of played) {
      const beat = this.getBeat(beatId);
      if (!beat) continue;
      for (const target of new Set(analysisLinks(beat).map((c) => c.targetId))) {
        if (!played.has(target) && facts.closed(beatId, target)) n++;
      }
    }
    return n;
  }

  /** analyzeRaw without freezing the UI: same slices and progress as analyzeAsync. */
  public async analyzeRawAsync(
    onProgress?: (progress: SimulationProgress) => void,
    signal?: { aborted: boolean },
    sliceMs = 12
  ): Promise<SimulatedPath[]> {
    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) return [];
    const run = this.explorePaths(firstBeatId, this.initialStates());
    let sliceStart = performance.now();
    let step = run.next();
    while (!step.done) {
      if (performance.now() - sliceStart >= sliceMs) {
        onProgress?.(step.value);
        await yieldToEventLoop();
        if (signal?.aborted) throw new DOMException('Path analysis cancelled', 'AbortError');
        sliceStart = performance.now();
      }
      step = run.next();
    }
    return step.value;
  }

  /**
   * analyze()'s grouped result from paths already simulated (analyzeRaw), so
   * one simulation serves the outcome list, the tree and arrival states.
   */
  public resultFromPaths(paths: SimulatedPath[], startTime: number = performance.now()): ConstraintPathResult {
    return this.buildResult(paths, startTime);
  }

  /**
   * Return the raw SimulatedPath[] without grouping into outcome groups.
   * Used by PathTree builder which needs the flat path data directly.
   */
  public analyzeRaw(): SimulatedPath[] {
    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) return [];
    return this.exploreAllPaths(firstBeatId, this.initialStates());
  }

  /**
   * Analyze paths backward from a target beat
   * Returns result compatible with BackwardAnalysisResult
   */
  /** Pass `simulated` (analyzeRaw) to read paths already found instead of simulating again. */
  public analyzeBackward(targetBeatId: string, simulated?: SimulatedPath[]): BackwardAnalysisResult {
    const startTime = performance.now();

    const targetBeat = this.getBeat(targetBeatId);
    if (!targetBeat) {
      return {
        targetBeatId,
        targetBeatName: 'Unknown',
        requirements: [],
        minimumSteps: -1,
        necessaryBeats: [],
        analysisTime: performance.now() - startTime,
      };
    }

    // Run forward analysis and filter paths that reach the target
    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      return {
        targetBeatId,
        targetBeatName: targetBeat.name,
        requirements: [],
        minimumSteps: -1,
        necessaryBeats: [],
        analysisTime: performance.now() - startTime,
      };
    }

    const allPaths = simulated ?? this.exploreAllPaths(firstBeatId, this.initialStates());

    // Filter paths that visit the target beat: within one playthrough if it
    // can be done, through a Replay only for a beat nothing else reaches.
    const visiting = allPaths.filter(path =>
      path.steps.some(step => step.beatId === targetBeatId)
    );
    const oneRun = visiting.filter((path) => !path.viaReplay);
    const pathsToTarget = oneRun.length > 0 ? oneRun : visiting;

    // Convert to PathRequirement format
    const requirements = this.convertPathsToRequirements(pathsToTarget, targetBeatId);

    // Find necessary beats (appear in ALL paths)
    const necessaryBeats = this.findNecessaryBeats(pathsToTarget);

    // Find minimum steps
    const minimumSteps = pathsToTarget.length > 0
      ? Math.min(...pathsToTarget.map(p => {
          const targetIndex = p.steps.findIndex(s => s.beatId === targetBeatId);
          return targetIndex + 1;
        }))
      : -1;

    return {
      targetBeatId,
      targetBeatName: targetBeat.name,
      requirements,
      minimumSteps,
      necessaryBeats,
      analysisTime: performance.now() - startTime,
    };
  }

  /**
   * The links from played beats to unplayed ones, each with what a state must
   * hold to take it (a Condition beat's answer, or every gate on some way
   * through) and how far each beat is from the link's beat.
   */
  private closedLinkGoals(played: Set<string>, open?: ReadonlySet<string>): Array<{ holds: (s: SimulationState) => boolean; distance: Map<string, number> }> {
    const into = new Map<string, string[]>();
    for (const beat of this.story.getAllBeats()) {
      for (const c of analysisLinks(beat)) {
        let list = into.get(c.targetId);
        if (!list) into.set(c.targetId, (list = []));
        list.push(beat.id);
      }
    }
    const distanceTo = (goal: string): Map<string, number> => {
      const d = new Map([[goal, 0]]);
      const todo = [goal];
      for (let i = 0; i < todo.length; i++) {
        for (const from of into.get(todo[i]) ?? []) if (!d.has(from)) { d.set(from, d.get(todo[i])! + 1); todo.push(from); }
      }
      return d;
    };
    const goals: Array<{ holds: (s: SimulationState) => boolean; distance: Map<string, number> }> = [];
    const distances = new Map<string, Map<string, number>>();
    for (const beatId of played) {
      const beat = this.getBeat(beatId);
      if (!beat) continue;
      for (const target of new Set(analysisLinks(beat).map((c) => c.targetId))) {
        if (played.has(target) || !this.getBeat(target) || (open && !open.has(target))) continue;
        let holds: ((s: SimulationState) => boolean) | null = null;
        if (beat.type === 'conditionBeat') {
          const params: any = beat.getParameters();
          const wantYes = target === params.trueTarget;
          if (!wantYes && target !== params.falseTarget) continue;
          holds = (s) => this.conditionBeatResult(beat, s) === wantYes;
        } else {
          const ways = this.gatesOnTheWay(beatId, target, []).filter((w) => !w.some((g) => g.neverShown) && w.length > 0);
          if (ways.length === 0) continue;
          holds = (s) => ways.some((w) => w.every((g) => {
            const all = g.conditions.every((c) => !c || this.evaluateCondition(c, s));
            return g.earlierLine ? !all : all;
          }));
        }
        if (!distances.has(beatId)) distances.set(beatId, distanceTo(beatId));
        goals.push({ holds, distance: distances.get(beatId)! });
      }
    }
    return goals;
  }

  /**
   * What stands between two beats for players who arrive at the first in
   * these states, one list per way from one to the other (a Dialog Tree can
   * have several): each condition on that way (the link's own, and in a
   * Dialog Tree every reply's on the way to the exit), with how many of the
   * states meet it. An earlier line that is shown instead is a gate too, met
   * where it isn't shown. A Condition beat's own check is not included.
   */
  public gatesOnTheWay(fromId: string, toId: string, states: SimulationState[]): GateOnTheWay[][] {
    const beat = this.story.getBeat(fromId);
    if (!beat || beat.type === 'conditionBeat') return [];
    const ways: GateOnTheWay[][] = [];
    for (const conn of this.getConnections(beat)) {
      if (conn.targetId !== toId) continue;
      const gates = new Map<string, GateOnTheWay>();
      const add = (conditions: any[], earlierLine: boolean) => {
        const key = `${earlierLine}|${JSON.stringify(conditions)}`;
        if (gates.has(key)) return;
        const all = (s: SimulationState) => conditions.every((c) => !c || this.evaluateCondition(c, s));
        const met = states.filter((s) => (earlierLine ? !all(s) : all(s))).length;
        gates.set(key, { conditions, earlierLine, met, of: states.length });
      };
      for (const c of Array.isArray(conn.condition) ? conn.condition : [conn.condition]) if (c) add([c], false);
      if (beat.type === 'dialogTree') {
        const tree = beat.getParameters().dialogTree;
        const target = conn.targetId === beat.id ? '__self__' : conn.targetId;
        for (const step of (conn as any).route ?? this.dialogPathTo(tree, target, conn.label)) {
          for (const c of Array.isArray(step.choice?.conditions) ? step.choice.conditions : []) if (c) add([c], false);
          for (const list of step.unless ?? []) add(list, true);
        }
      }
      ways.push([...gates.values()]);
    }
    // Linked from the tree, but no way through it gets there: the line or
    // reply leading there is never shown (a next line before it always plays,
    // or it is hidden). Unless the routes were cut off at their limit.
    if (ways.length === 0 && beat.type === 'dialogTree'
      && analysisLinks(beat).some((c) => c.targetId === toId) && this.dialogRoutes(beat).length < 200) {
      ways.push([{ conditions: [], earlierLine: false, neverShown: true, met: 0, of: states.length }]);
    }
    return ways;
  }

  /**
   * The values each counter can have when players arrive at each beat: one
   * range per counter, not every combination, so it finishes fast however
   * many ways there are to play. It takes the steps the situation search
   * does (requirement redirects, Condition beats, choices on offer, Replays)
   * and reads how each step changes a counter from the simulator's own
   * effects. Where a range can't be pinned down it holds every value, so a
   * branch it rules out is out on every way of playing.
   *
   * `track` adds facts followed exactly, together: variables (`v\u0001name`),
   * visits (`b\u0001beatId`) and items in the player's bag (`i\u0001item`).
   * Each beat is then visited once per combination of their values, so
   * conditions on several of them at once can be ruled out ("sentSouth and
   * ruined" when no way has both). Null without a start, or when the
   * combinations run past `nodeCap`.
   */
  public counterRanges(track: string[] = [], nodeCap = 60000, known?: CounterRangeFacts, options: { oneRun?: boolean } = {}): CounterRangeFacts | null {
    const start = this.story.getFirstBeatId();
    if (!start) return null;
    if (options.oneRun) {
      // One playthrough: an end screen's Replay goes nowhere.
      this.rangeOneRun = true;
      try { return this.counterRanges(track, nodeCap, known); } finally { this.rangeOneRun = false; }
    }
    const starts = this.initialStates();
    // The counters steps name, kept from earlier runs (the link checks run many).
    const keys = this.rangeKeys;
    for (const s of starts) for (const k of s.counters.keys()) keys.add(k);
    // A step can name a counter nothing started with: take it in and go again.
    for (let round = 0; round < 6; round++) {
      const facts = this.rangesFor([...keys], track, start, starts, keys, nodeCap, known);
      if (facts !== undefined) return facts;
    }
    return null;
  }

  /** One run of counterRanges: undefined when a step named a new counter (go again). */
  private rangesFor(
    order: string[], track: string[], start: string, starts: SimulationState[], keys: Set<string>, nodeCap: number,
    known?: CounterRangeFacts,
  ): CounterRangeFacts | null | undefined {
    const fresh = new Set<string>();
    // Feelings never change a counter, variable, item or visit: the probes
    // leave the runtime out (its per-beat tick is most of a step's cost).
    const base: SimulationState = { ...cloneState(starts[0] ?? createInitialState()), runtime: undefined, pendingRuntime: undefined };
    const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : v === undefined ? 0 : null);
    const factsKey = (facts: ReadonlyMap<string, unknown>) => track.map((k) => {
      const v = facts.get(k);
      return v === ANY_VALUE ? '?' : `${typeof v}:${String(v)}`;
    }).join('\u0002');
    const readFact = (s: SimulationState, k: string): unknown => {
      const name = k.slice(2);
      if (k[0] === 'v') return s.variables.has(name) ? s.variables.get(name) : undefined;
      if (k[0] === 'b') return s.visitedBeats.has(name);
      return itemQuantity(s, 'player', name);
    };
    // A fact nobody knows is played twice, with two stand-ins: what comes out
    // the same both times doesn't depend on it.
    const loadFacts = (s: SimulationState, facts: ReadonlyMap<string, unknown>, alt: boolean) => {
      for (const k of track) {
        const v = facts.get(k);
        const unknown = v === ANY_VALUE;
        const name = k.slice(2);
        if (k[0] === 'v') {
          const x = unknown ? (alt ? 5 : STAND_IN) : v;
          if (x === undefined) s.variables.delete(name); else s.variables.set(name, x as any);
        } else if (k[0] === 'b') {
          if (unknown ? alt : v) s.visitedBeats.add(name); else s.visitedBeats.delete(name);
        } else {
          setPlayerQuantity(s, name, unknown ? (alt ? 5 : 2) : Number(v) || 0);
        }
      }
    };
    // How one step changes things. Counters: run it from 0, 1 and 7, once per
    // step (no counter change reads anything else). Tracked facts: run it from
    // their values, twice (counters at 0 and 7, so a fact computed from one
    // shows), and a third time with other stand-ins when one is unknown.
    if (this.rangeCounterOrder !== order.join('\u0002')) {
      this.rangeCounterOrder = order.join('\u0002');
      this.rangeCounterSteps.clear();
    }
    const counterSteps = this.rangeCounterSteps;
    const typedBeat = (beat: Beat) => beat.type === 'inputText' || beat.type === 'keypad';
    const run = (p: number, facts: ReadonlyMap<string, unknown> | null, alt: boolean, step: (s: SimulationState) => SimulationState) => {
      const s = cloneState(base);
      s.counters = new Map(order.map((k) => [k, p]));
      if (facts) loadFacts(s, facts, alt);
      const out = step(s);
      for (const k of out.counters.keys()) if (!keys.has(k)) fresh.add(k);
      return out;
    };
    const factSteps = new Map<string, Map<string, unknown>>();
    const probe = (id: string, beat: Beat, from: AbsState, step: (s: SimulationState) => SimulationState): AbsState => {
      let change = counterSteps.get(id);
      if (!change) {
        const runs = [0, 1, 7].map((p) => run(p, null, false, step));
        change = new Map<string, Change>();
        for (const k of order) {
          const ys = runs.map((o) => asNumber(o.counters.get(k)));
          // What players type is anything, whatever the simulator puts there.
          let f = ys.every((y): y is number => y !== null) ? changeFrom(ys[0], ys[1], ys[2]) : null;
          if (f && typedBeat(beat) && !(f.a === 1 && f.b === 0)) f = null;
          if (f && f.a === 1 && f.b === 0) continue;
          change.set(k, f);
        }
        counterSteps.set(id, change);
      }
      let facts: ReadonlyMap<string, unknown> = from.facts;
      if (track.length > 0) {
        const cacheKey = `${id}\u0000${factsKey(from.facts)}`;
        let known = factSteps.get(cacheKey);
        if (!known) {
          const unknownFact = track.some((k) => from.facts.get(k) === ANY_VALUE);
          const runs = [run(0, from.facts, false, step), run(7, from.facts, false, step), ...(unknownFact ? [run(0, from.facts, true, step)] : [])];
          known = new Map<string, unknown>();
          for (const k of track) {
            const outs = runs.map((o) => readFact(o, k));
            const before = from.facts.get(k);
            const same = outs.every((o) => Object.is(o, outs[0]));
            known.set(k, !same || outs[0] === STAND_IN ? ANY_VALUE
              : typedBeat(beat) && k[0] === 'v' && !Object.is(outs[0], before) ? ANY_VALUE
                : outs[0]);
          }
          factSteps.set(cacheKey, known);
        }
        facts = known;
      }
      if (change.size === 0) return { facts, ranges: from.ranges };
      const ranges = new Map(from.ranges);
      for (const [k, f] of change) ranges.set(k, applyChange(ranges.get(k) ?? [0, 0], f));
      return { facts, ranges };
    };

    interface Node { beat: string; state: AbsState; grown: number }
    const nodes = new Map<string, Node>();
    const byBeat = new Map<string, Node[]>();
    // A fact taking many values at a beat (a run count, a loop's tally) is let go there.
    const valuesSeen = new Map<string, Set<string>>();
    const queue: string[] = [];
    const queued = new Set<string>();
    let tooMany = false;
    const anything = new Map(order.map((k) => [k, ANY]));
    const anyFacts = new Map(track.map((k) => [k, ANY_VALUE as unknown]));
    // Only a beat on a loop can keep growing; there a bound is let go after a
    // few rounds. Elsewhere ranges settle by themselves, and stay precise.
    const onLoop = this.rangeLoops ?? beatsOnLoops(this.story.getAllBeats().map((b) => b.id), (id) => {
      const b = this.getBeat(id);
      return b ? this.rangeSteps(b, { facts: anyFacts, ranges: anything }, start, probe, undefined, known).map((s) => s.to) : [];
    });
    const arrive = (to: string, state: AbsState) => {
      if (!this.getBeat(to)) return;
      let facts: ReadonlyMap<string, unknown> = state.facts;
      for (const k of track) {
        const v = facts.get(k);
        if (v === ANY_VALUE) continue;
        const seenKey = `${to}\u0000${k}`;
        let seen = valuesSeen.get(seenKey);
        if (!seen) valuesSeen.set(seenKey, (seen = new Set()));
        seen.add(`${typeof v}:${String(v)}`);
        if (seen.size > 8) { const copy = new Map(facts); copy.set(k, ANY_VALUE); facts = copy; }
      }
      const key = `${to}\u0003${factsKey(facts)}`;
      const was = nodes.get(key);
      let grew = !was;
      if (!was) {
        if (nodes.size >= nodeCap) { tooMany = true; return; }
        const node: Node = { beat: to, state: { facts, ranges: state.ranges }, grown: 0 };
        nodes.set(key, node);
        const list = byBeat.get(to);
        if (list) list.push(node); else byBeat.set(to, [node]);
      } else {
        // A loop that adds can add forever: past three rounds a growing bound is let go.
        const widen = onLoop.has(to) && was.grown >= 3;
        const merged = new Map(was.state.ranges);
        for (const [k, r] of state.ranges) {
          const old = merged.get(k) ?? [0, 0];
          let h = hull(old, r);
          if (h[0] === old[0] && h[1] === old[1]) continue;
          if (widen) h = [h[0] < old[0] ? -Infinity : h[0], h[1] > old[1] ? Infinity : h[1]];
          merged.set(k, h);
          grew = true;
        }
        if (grew) { was.state = { facts: was.state.facts, ranges: merged }; was.grown++; }
      }
      if (grew && !queued.has(key)) { queued.add(key); queue.push(key); }
    };
    for (const s of starts) {
      const ranges = new Map<string, Range>();
      for (const k of order) {
        const v = asNumber(s.counters.get(k));
        ranges.set(k, v !== null && Number.isFinite(v) ? [v, v] : ANY);
      }
      arrive(start, { facts: new Map(track.map((k) => [k, readFact(s, k)])), ranges });
    }
    while (queue.length > 0 && fresh.size === 0 && !tooMany) {
      const key = queue.shift()!;
      queued.delete(key);
      const node = nodes.get(key)!;
      const beat = this.getBeat(node.beat);
      if (!beat) continue;
      for (const { to, state } of this.rangeSteps(beat, node.state, start, probe, undefined, known)) arrive(to, state);
    }
    if (fresh.size > 0) { fresh.forEach((k) => keys.add(k)); return undefined; }
    // Kept from a run with Replays only: later runs may follow fewer links, never more.
    if (track.length === 0 && !known && !this.rangeOneRun) this.rangeLoops = onLoop;
    if (tooMany) return null;

    // With everything settled: which links some way takes, and why the others stay shut.
    const taken = new Set<string>();
    interface Shut {
      conditions: Map<string, Condition>; ways: Map<string, Condition[]>; earlierLine: boolean; values: Set<string>;
      /** Conditions that failed at every arrival: alone they are the reason. */
      alwaysFailing: Map<string, Condition> | null;
      arrivals: Map<string, ReadonlyMap<string, unknown>>;
    }
    const shut = new Map<string, Shut>();
    const nameOf = (id: string) => this.getBeat(id)?.name ?? id;
    const describeFacts = (facts: ReadonlyMap<string, unknown>, about: Condition[]): string | null => {
      const read = new Set(about.flatMap((c) => factsRead(c)));
      const parts = track.filter((k) => read.has(k)).map((k) => {
        const v = facts.get(k);
        const name = k.slice(2);
        if (k[0] === 'v') return v === ANY_VALUE ? `${name} anything` : v === undefined ? `${name} unset` : `${name} ${String(v)}`;
        if (k[0] === 'b') return v === ANY_VALUE ? `"${nameOf(name)}" visited or not` : v ? `"${nameOf(name)}" visited` : `"${nameOf(name)}" not visited`;
        return v === ANY_VALUE ? `any number of ${name}` : v === 0 ? `no ${name}` : `${String(v)} ${name}`;
      });
      return parts.length > 0 ? parts.join(' and ') : null;
    };
    for (const [id, list] of byBeat) {
      const beat = this.getBeat(id);
      if (!beat) continue;
      for (const node of list) {
        this.rangeSteps(beat, node.state, start, probe, {
          taken: (to) => taken.add(`${id}\u0000${to}`),
          shut: (to, why) => {
            const k = `${id}\u0000${to}`;
            let entry = shut.get(k);
            if (!entry) shut.set(k, (entry = { conditions: new Map(), ways: new Map(), earlierLine: false, values: new Set(), alwaysFailing: null, arrivals: new Map() }));
            for (const c of why.conditions) entry.conditions.set(JSON.stringify(c), c);
            entry.ways.set(JSON.stringify(why.conditions), why.conditions);
            entry.earlierLine ||= !!why.earlierLine;
            why.values.forEach((v) => entry!.values.add(v));
            const failing = new Map((why.failing ?? why.conditions).map((c) => [JSON.stringify(c), c] as const));
            entry.alwaysFailing = entry.alwaysFailing === null ? failing
              : new Map([...entry.alwaysFailing].filter(([key]) => failing.has(key)));
            entry.arrivals.set(factsKey(node.state.facts), node.state.facts);
          },
        }, known);
      }
    }
    const hullAt = (beatId: string): Map<string, Range> | undefined => {
      const list = byBeat.get(beatId);
      if (!list) return undefined;
      const out = new Map<string, Range>();
      for (const n of list) for (const [k, r] of n.state.ranges) out.set(k, out.has(k) ? hull(out.get(k)!, r) : r);
      return out;
    };
    const inRanges = (ranges: ReadonlyMap<string, Range>, state: SimulationState): boolean => {
      for (const [k, v] of state.counters) {
        const n = typeof v === 'number' ? v : Number(v) || 0;
        const r = ranges.get(k) ?? [0, 0];
        if (!(n >= r[0] && n <= r[1])) return false;
      }
      return true;
    };
    return {
      reached: new Set(byBeat.keys()),
      at: hullAt,
      holds: (beatId, state) => (byBeat.get(beatId) ?? []).some((n) => track.every((k) => {
        const v = n.state.facts.get(k);
        return v === ANY_VALUE || Object.is(v, readFact(state, k));
      }) && inRanges(n.state.ranges, state)),
      closed: (fromId, toId) => {
        const k = `${fromId}\u0000${toId}`;
        const entry = byBeat.has(fromId) && !taken.has(k) ? shut.get(k) : undefined;
        if (!entry) return null;
        // One condition no arrival meets says it best; else all of a way's together.
        const alone = entry.alwaysFailing && entry.alwaysFailing.size > 0 && !entry.earlierLine ? [...entry.alwaysFailing.values()] : null;
        const about = alone ?? [...entry.conditions.values()];
        const values = [...entry.values];
        const combos = [...new Set([...entry.arrivals.values()].map((f) => describeFacts(f, about)).filter((c): c is string => !!c))];
        if (combos.length > 0) {
          const shown = combos.slice(0, 3);
          values.push(`players arrive there with ${shown.join(', or with ')}${combos.length > shown.length ? `, or ${combos.length - shown.length} more ways` : ''}`);
        }
        return {
          conditions: about, values,
          ...(!alone && entry.ways.size > 1 ? { ways: [...entry.ways.values()] } : {}),
          ...(entry.earlierLine ? { earlierLine: true } : {}),
        };
      },
    };
  }

  /**
   * Where players at this beat go next, and what they arrive with — the
   * situation search's step (expand), over ranges and tracked facts: a branch
   * is left out only when its gate certainly fails there.
   */
  private rangeSteps(
    beat: Beat,
    from: AbsState,
    start: string,
    probe: (id: string, beat: Beat, from: AbsState, step: (s: SimulationState) => SimulationState) => AbsState,
    note?: { taken: (to: string) => void; shut: (to: string, why: RangeClosure) => void },
    known?: CounterRangeFacts,
  ): Array<{ to: string; state: AbsState }> {
    const out: Array<{ to: string; state: AbsState }> = [];
    const go = (to: string | null | undefined, next: AbsState) => {
      if (!to) return;
      // Already ruled out by an earlier check: no way of playing goes there.
      if (known && (!known.reached.has(to) || known.closed(beat.id, to))) return;
      out.push({ to, state: next });
      note?.taken(to);
    };

    // Requirements unmet send players elsewhere before the beat shows.
    const requires = (beat as any).requires as any[] | undefined;
    if (Array.isArray(requires) && requires.length > 0) {
      const checks = requires.map((req) => ({ req, ok: !req?.condition ? true as Verdict : this.rangeVerdict(req.condition, from) }));
      let shows = true;
      if ((beat as any).requiresMode === 'any') {
        const some = anyOf(checks.map((c) => c.ok));
        const fallback = checks.find((c) => c.req?.fallbackTarget)?.req.fallbackTarget;
        if (some !== true && fallback) { go(fallback, from); if (some === false) shows = false; }
      } else {
        for (const c of checks) {
          if (c.ok === true) continue;
          const fallback = c.req?.fallbackTarget;
          if (fallback) go(fallback, from);
          if (c.ok === false) { if (fallback) shows = false; break; }
        }
      }
      if (!shows) return out;
    }

    const after = probe(`${beat.id}\u0000beat`, beat, from, (s) => this.applyBeatEffects(beat, s));
    const valuesOf = (conditions: any[], at: AbsState): string[] => {
      const words: string[] = [];
      for (const c of conditions) {
        if (!c || typeof c !== 'object') continue;
        const names = c.type === 'counter' ? [c.variableName || c.variable || c.left]
          : c.type === 'counterCompare' ? [c.counter1, c.counter2] : [];
        for (const name of names) {
          if (!name) continue;
          const w = describeRange(name, at.ranges.get(this.counterKey(c.character, name)) ?? [0, 0]);
          if (w && !words.includes(w)) words.push(w);
        }
      }
      return words;
    };
    // Every choice hidden: the beat's own link (linkWhenAllHidden), over ranges.
    const hiddenLinks = (at: AbsState): { targets: string[]; maybeNone: boolean } => {
      if (beat.type === 'dialogTree') return { targets: [], maybeNone: true };
      const links: Connection[] = (beat as any).connections ?? [];
      const targets: string[] = [];
      for (const c of links) {
        if (!c.condition) continue;
        const v = Array.isArray(c.condition) ? undefined : this.rangeVerdict(c.condition, at);
        if (v === false) continue;
        targets.push(c.targetId);
        if (v === true) return { targets, maybeNone: false };
      }
      const fallback = links.find((c) => !c.condition)?.targetId ?? beat.defaultTarget ?? null;
      if (fallback) targets.push(fallback);
      return { targets, maybeNone: !fallback };
    };

    let terminal = this.rangeTerminal.get(beat.id);
    if (terminal === undefined) this.rangeTerminal.set(beat.id, (terminal = this.isTerminalBeat(beat)));
    if (terminal) {
      if (beat.type === 'endScreen' && beat.getParameters().showRestart !== false && !this.rangeOneRun) {
        const replay = probe(`${beat.id}\u0000replay`, beat, from, (s) => this.stateAfterReplay(beat, this.applyBeatEffects(beat, s)));
        const { targets, maybeNone } = hiddenLinks(replay);
        for (const t of targets) go(t, replay);
        if (maybeNone && beat.getParameters().reset === true) go(start, replay);
      }
      return out;
    }
    let connections = this.rangeLinks.get(beat.id);
    if (!connections) this.rangeLinks.set(beat.id, (connections = this.getConnections(beat)));
    if (connections.length === 0) return out;
    const along = (i: number, conn: Connection, choice: boolean) => probe(`${beat.id}\u0000${i}`, beat, from, (s) => {
      const entered = this.applyBeatEffects(beat, s);
      const next = choice ? this.applyChoiceEffects(beat, cloneState(entered), i, conn) : cloneState(entered);
      this.applyEffectsList(conn.effects, next);
      return next;
    });

    if (beat.type === 'conditionBeat') {
      const params: any = beat.getParameters();
      const asked = this.getCondition(beat);
      const more: any[] = Array.isArray(params.moreConditions) ? params.moreConditions : [];
      const firstAnswer = asked ? this.rangeVerdict(asked, after) : true;
      const answers = [firstAnswer, ...more.map((c) => this.rangeVerdict(c, after))];
      const yes = more.length === 0 ? firstAnswer : params.conditionsMatch === 'any' ? anyOf(answers) : allOf(answers);
      const label = (c: Connection) => c.label?.toLowerCase();
      const yesLink = connections.find((c) => label(c) === 'true' || label(c) === 'yes') ?? connections[0];
      const noLink = connections.find((c) => label(c) === 'false' || label(c) === 'no') ?? connections[0];
      const asks = [asked, ...more].filter(Boolean);
      for (const [link, possible] of [[yesLink, yes !== false], [noLink, yes !== true]] as const) {
        if (possible) go(link.targetId, along(connections.indexOf(link), link, false));
        else note?.shut(link.targetId, { conditions: asks, values: valuesOf(asks, after) });
      }
    } else if (this.isChoiceBeat(beat) || this.hasTimedExit(beat)) {
      const offers = connections.map((conn) => this.rangeOffered(beat, conn, after));
      if (offers.every((o) => o.offered !== true)) {
        for (const t of hiddenLinks(after).targets) go(t, after);
      }
      connections.forEach((conn, i) => {
        const { offered, closure } = offers[i];
        if (offered === false) {
          if (closure) note?.shut(conn.targetId, { ...closure, values: valuesOf(closure.conditions, after) });
          return;
        }
        if (this.isNeverDrawn(beat, conn)) return;
        go(conn.targetId, along(i, conn, true));
      });
    } else {
      go(connections[0].targetId, along(0, connections[0], false));
    }
    return out;
  }

  /** choiceOffered over ranges and tracked facts: certainly on screen, certainly not (and why), or it depends. */
  private rangeOffered(beat: Beat, connection: Connection, at: AbsState): { offered: Verdict; closure?: Omit<RangeClosure, 'values'> } {
    const conds: any[] = [];
    const own: any = connection.condition;
    if (Array.isArray(own)) conds.push(...own); else if (own) conds.push(own);
    const unless: any[][] = [];
    if (beat.type === 'dialogTree') {
      const target = connection.targetId === beat.id ? '__self__' : connection.targetId;
      for (const step of (connection as any).route ?? this.dialogPathTo(beat.getParameters().dialogTree, target, connection.label)) {
        if (Array.isArray(step.choice?.conditions)) conds.push(...step.choice.conditions);
        unless.push(...(step.unless ?? []));
      }
    }
    const ownVerdicts = conds.map((c) => ({ c, v: this.rangeVerdict(c, at) }));
    const earlier = unless.map((list) => ({ list, v: allOf(list.map((c) => this.rangeVerdict(c, at))) }));
    const offered = allOf([...ownVerdicts.map((x) => x.v), ...earlier.map((x) => not(x.v))]);
    if (offered !== false) return { offered };
    const failing = ownVerdicts.filter((x) => x.v === false).map((x) => x.c);
    // Named with the other conditions of the way: together they are what can't all hold.
    if (failing.length > 0) return { offered, closure: { conditions: conds.filter(Boolean), failing } };
    const always = earlier.find((x) => x.v === true);
    return { offered, closure: always ? { conditions: always.list, earlierLine: true } : undefined };
  }

  /**
   * evaluateCondition over ranges and tracked facts, for what they can decide:
   * counters by their ranges, tracked variables, visits and items by their
   * value. Anything else depends (undefined).
   */
  private rangeVerdict(c: any, at: AbsState): Verdict {
    if (!c) return true;
    if (typeof c !== 'object' || Array.isArray(c)) return undefined;
    const operator = c.operator;
    const range = (key: string): Range => at.ranges.get(key) ?? [0, 0];
    if (c.type === 'counter') {
      const name = c.variableName || c.variable || c.left;
      if (!name) return false;
      const r = range(this.counterKey(c.character, name));
      const raw = c.value ?? c.right;
      if (isTextForCounter(raw)) return operator === '!=';
      const v = counterComparisonValue(raw);
      if (operator === '==' || operator === '!=') {
        return typeof v === 'number' && Number.isFinite(v) ? compareRanges(r, operator, [v, v]) : undefined;
      }
      const n = typeof v === 'number' ? v : Number(v) || 0;
      return compareRanges(r, operator, [n, n]);
    }
    if (c.type === 'counterCompare') {
      const owner = c.character;
      return compareRanges(range(this.counterKey(owner, c.counter1 || '')), operator, range(this.counterKey(owner, c.counter2 || '')));
    }
    // Facts it follows exactly: ask the simulator itself, on a state holding just them.
    const read = factsRead(c);
    if (read.length === 0 || read.some((k) => !at.facts.has(k) || at.facts.get(k) === ANY_VALUE)) return undefined;
    const s = createInitialState();
    for (const k of read) {
      const v = at.facts.get(k);
      const name = k.slice(2);
      if (k[0] === 'v') { if (v !== undefined) s.variables.set(name, v as any); }
      else if (k[0] === 'b') { if (v) s.visitedBeats.add(name); }
      else setPlayerQuantity(s, name, Number(v) || 0);
    }
    return this.evaluateCondition(c, s);
  }

  /**
   * Get all endings in the story
   */
  public getEndings(): Array<{ beatId: string; beatName: string }> {
    const endings: Array<{ beatId: string; beatName: string }> = [];
    const beats = this.story.getAllBeats();

    for (const beat of beats) {
      // Explicit ending types
      if (['endScreen', 'aiSummary'].includes(beat.type)) {
        endings.push({ beatId: beat.id, beatName: beat.name });
        continue;
      }

      // Also include beats with no way on at all (implicit endings) — a
      // requirement redirect, auto-advance or timer counts as a way on.
      if (analysisLinks(beat).length === 0) {
        endings.push({ beatId: beat.id, beatName: beat.name });
      }
    }

    return endings;
  }

  // ==========================================================================
  // Core Exploration Algorithm
  // ==========================================================================

  /**
   * Explore all paths using branching exploration with choice pruning
   *
   * Key insight: For hub-and-spoke patterns (like Investigation Hub), each choice
   * should only be taken ONCE per path. This prevents exponential explosion while
   * still exploring all valid permutations.
   *
   * For a hub with 4 choices, this gives 4! = 24 orderings per ending.
   */
  private exploreAllPaths(startBeatId: string, initialStates: SimulationState[]): SimulatedPath[] {
    const run = this.explorePaths(startBeatId, initialStates);
    let step = run.next();
    while (!step.done) step = run.next();
    return step.value;
  }

  /**
   * The exploration itself, pausable: yields its progress every few hundred
   * steps so analyzeAsync can give the UI a frame. The sync callers drain it
   * in one go.
   */
  private *explorePaths(startBeatId: string, initialStates: SimulationState[]): Generator<SimulationProgress, SimulatedPath[]> {
    const paths: SimulatedPath[] = [];

    // Stack of exploration frames - each frame is a separate branch
    const stack: Array<{
      beatId: string;
      state: SimulationState;
      path: SimulatedStep[];
      decisions: SimulatedPath['decisions'];
      visitedStates: Set<string>; // (beatId + stateHash) pairs for cycle detection
      takenChoicesPerBeat: Map<string, Set<number>>; // beatId -> set of choice indices taken
    }> = [];

    // Initialize with the start beat — once per starting state (one per
    // combination of randomly drawn character variants).
    for (const initialState of initialStates) {
      stack.push({
        beatId: startBeatId,
        state: cloneState(initialState),
        path: [],
        decisions: [],
        visitedStates: new Set(),
        takenChoicesPerBeat: new Map(),
      });
    }

    // Bounds (2026-09-26): with every choice-like beat branching, the BFS
    // queue grew without limit — an 81-beat generated story ran the analyzer
    // (and the preview's presets) out of memory. Queue beyond maxFrontier
    // only what reaches a new beat; stop after maxExpansions steps.
    const seenBeats = new Set<string>();
    let expansions = 0;
    this.truncated = false;
    this.searchLimited = false;
    this.shownReplies = new Set();
    // Past the cap: one branch per beat nobody has reached yet, and one per
    // (beat, variables/counters) combination not seen before — a choice's
    // variable can decide a gate much later (Late Light: "declined" at the
    // visit question opens a scene two beats on), and dropping it lost the
    // scene. That second allowance is itself bounded.
    const admittedNew = new Set<string>();
    const seenBeatStates = new Set<string>();
    const cap = this.config.maxFrontier ?? 4000;
    // The coverage pass (below): once the budget is spent on breadth, search
    // for what no finished path passed through yet.
    let coverage = false;
    const covered = new Set<string>();
    const coverageSeen = new Set<string>();
    let countedPaths = 0;
    let distance = new Map<string, number>();
    let distanceFor = -1;
    let turn = 0;
    // The ways a scene can stop the story that a path has already shown.
    const stopsFound = new Set<string>();
    let buckets: Array<Array<(typeof stack)[number]>> = [];
    let relevant: (beatId: string, state: SimulationState) => string = (_id, state) => hashState(state);
    const pathState = this.stateThatDecidesGates(new Map(this.story.getAllBeats().map((b) => [b.id, 0])));
    const enqueue = (f: (typeof stack)[number]) => {
      // A route that stops the story has nothing left to explore, so it needs no
      // place in the queue. Queued, it was lost whenever the budget ran out first,
      // and a stop on a beat other paths had passed through was never reported.
      if (!this.getBeat(f.beatId) && f.path.length > 0) {
        const last = f.path[f.path.length - 1];
        const stopKey = `stop|${last.beatId}|${last.decisionMade}`;
        if (!coverageSeen.has(stopKey) || (!coverage && stack.length < cap)) {
          coverageSeen.add(stopKey);
          paths.push(this.buildPath(f.path, f.decisions, f.state, 'deadEnd'));
        }
        return;
      }
      if (coverage || stack.length < cap) { stack.push(f); return; }
      if (!seenBeats.has(f.beatId) && !admittedNew.has(f.beatId)) { admittedNew.add(f.beatId); stack.push(f); return; }
      if (seenBeatStates.size < cap * 4) {
        const k = `${f.beatId}|${hashState(f.state)}`;
        if (!seenBeatStates.has(k)) { seenBeatStates.add(k); stack.push(f); return; }
      }
      this.truncated = true;
    };

    const firstFrames = [...stack];
    // Replay: an end screen's button goes on by the screen's own link, or to
    // the first beat. Once the story has been explored, a last pass plays on
    // from there, for what only a replay reaches.
    const replays: Array<(typeof stack)[number]> = [];
    const replayKeys = new Set<string>();
    const replaysPerEnding = new Map<string, number>();
    let replaying = false;
    const noteReplay = (beat: Beat, path: SimulatedStep[], decisions: SimulatedPath['decisions'], state: SimulationState) => {
      const params = beat.getParameters();
      if (beat.type !== 'endScreen' || params.showRestart === false) return;
      const next = this.stateAfterReplay(beat, state);
      const link = this.linkWhenAllHidden(beat, next);
      const target = link ?? startBeatId;
      // With no link of its own the button restarts the story. That only counts
      // when the author chose what carries over ("keep across restarts"): state
      // merely left behind by reset off must not make an ending look reachable
      // in a run that can't reach it.
      if (!link && (params.reset !== true || hashState(next) === hashState(this.seededInitialState()))) return;
      const key = `${beat.id}|${target}|${hashState(next)}`;
      if (replayKeys.has(key) || (replaysPerEnding.get(beat.id) ?? 0) >= 100) return;
      replayKeys.add(key);
      replaysPerEnding.set(beat.id, (replaysPerEnding.get(beat.id) ?? 0) + 1);
      const replayPath = [...path];
      // The next beat arrives with what the reset left, not what the ending saw.
      replayPath[replayPath.length - 1] = { ...replayPath[replayPath.length - 1], decisionMade: REPLAY_DECISION, stateAfter: cloneState(next) };
      const frame = {
        beatId: target,
        state: next,
        path: replayPath,
        decisions: [...decisions, { beatId: beat.id, beatName: beat.name, choiceMade: REPLAY_DECISION, alternatives: [] }],
        visitedStates: new Set<string>(),
        takenChoicesPerBeat: new Map<string, Set<number>>(),
      };
      if (replaying) stack.push(frame); else replays.push(frame);
    };
    const startReplays = (): boolean => {
      if (replaying || replays.length === 0) return false;
      for (; countedPaths < paths.length; countedPaths++) {
        for (const step of paths[countedPaths].steps) covered.add(step.beatId);
      }
      replaying = true;
      coverage = true;
      coverageStart = paths.length;
      coverageSeen.clear();
      buckets = [];
      stack.length = 0;
      stack.push(...replays);
      expansions = 0;
      distanceFor = -1;
      return true;
    };
    const maxExpansions = this.config.maxExpansions ?? 300000;
    const coveragePaths = this.config.maxCoveragePaths ?? 10000;
    const coverageExpansions = this.config.maxCoverageExpansions ?? 300000;
    const pathLimit = this.config.maxPaths;
    let coverageStart = 0;
    for (;;) {
      if (!coverage) {
        const spent = paths.length >= pathLimit || expansions >= maxExpansions;
        if (spent) this.truncated = true;
        if (stack.length === 0 && !this.truncated) {
          // Every path was explored, each menu choice taken once per path. A
          // beat linked from the start but still unreached may only open after
          // going round a menu again, so the coverage pass looks for it too.
          for (; countedPaths < paths.length; countedPaths++) {
            for (const step of paths[countedPaths].steps) covered.add(step.beatId);
            const last = paths[countedPaths].steps[paths[countedPaths].steps.length - 1];
            if (last && paths[countedPaths].outcome.type === 'deadEnd') stopsFound.add(`${last.beatId}|${last.decisionMade}`);
          }
          if (!this.distanceToUncovered(covered, stopsFound).has(startBeatId)) {
            if (startReplays()) continue;
            break;
          }
        }
        if (spent || stack.length === 0) {
          // Breadth first reaches everything in a small story and only the
          // first few choices of a large one: a 400-beat story spent 20000
          // paths and never reached 168 beats. Start over, deep first,
          // preferring what's uncovered, until every beat that can be
          // reached is on a finished path.
          coverage = true;
          coverageStart = paths.length;
          stack.length = 0;
          stack.push(...firstFrames);
          expansions = 0;
        }
      }
      for (; countedPaths < paths.length; countedPaths++) {
        for (const step of paths[countedPaths].steps) covered.add(step.beatId);
        const last = paths[countedPaths].steps[paths[countedPaths].steps.length - 1];
        if (last && paths[countedPaths].outcome.type === 'deadEnd') stopsFound.add(`${last.beatId}|${last.decisionMade}`);
      }
      if (coverage && (paths.length - coverageStart >= coveragePaths || expansions >= coverageExpansions)) {
        // Stopped by the budget, not because nothing was left to try.
        this.searchLimited = true;
        if (startReplays()) continue;
        break;
      }
      expansions++;
      if (expansions % 250 === 0) yield { expansions, beatsReached: seenBeats.size, pathsFound: paths.length, phase: replaying ? 'replay' : coverage ? 'unreached' : 'exploring' };
      // Use BFS (shift) instead of DFS (pop) to ensure fair coverage
      // across all branches at each level. DFS can exhaust the maxPaths
      // budget on the first few branches of a wide choice beat,
      // leaving later branches unexplored.
      let frame: (typeof stack)[number];
      if (coverage) {
        // Finish paths carrying something uncovered, then go to whichever
        // waiting branch is nearest to a beat still uncovered.
        if (covered.size + stopsFound.size + this.shownReplies.size !== distanceFor) {
          // What decides the gates on the way to the beats uncovered when the
          // pass starts. A running score nothing there asks about multiplies
          // the states without opening anything: the budget went on those and
          // never tried the early flag a late choice needs.
          if (distanceFor < 0) {
            distance = this.distanceToUncovered(covered, stopsFound);
            relevant = this.stateThatDecidesGates(distance);
          }
          distanceFor = covered.size + stopsFound.size + this.shownReplies.size;
          distance = this.distanceToUncovered(covered, stopsFound);
          stack.push(...buckets.flat());
          buckets = [];
        }
        for (const f of stack) {
          // A route that ends the story has no beat to measure a distance to,
          // and each one is a finding: it finishes at once.
          const rank = !this.getBeat(f.beatId) || f.path.some((step) => !covered.has(step.beatId))
            ? 0
            : 1 + (distance.get(f.beatId) ?? Number.POSITIVE_INFINITY);
          if (Number.isFinite(rank)) (buckets[rank] ??= []).push(f);
        }
        stack.length = 0;
        // Paths carrying something uncovered first. Then each distance takes
        // its turn: always the nearest let beats that can never open (they are
        // near, behind a gate nothing meets) starve whole storylines further off.
        let nearest = buckets[0]?.length ? buckets[0] : undefined;
        for (let tried = 0; !nearest && tried <= buckets.length; tried++) {
          turn = turn + 1 >= buckets.length ? 1 : turn + 1;
          if (buckets[turn]?.length) nearest = buckets[turn];
        }
        if (!nearest) {
          if (startReplays()) continue;
          break;
        }
        frame = nearest.pop()!;
        // The same beat with the same answers to those gates opens the same
        // things from here, so it only goes on if finishing it would put
        // something uncovered on a path.
        const key = `${frame.beatId}|${relevant(frame.beatId, frame.state)}`;
        if (coverageSeen.has(key) && frame.path.every((step) => covered.has(step.beatId)) && covered.has(frame.beatId)) continue;
        coverageSeen.add(key);
      } else {
        frame = stack.shift()!;
      }

      // Check depth limit
      if (frame.path.length >= this.config.maxDepth) {
        paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'depthLimit'));
        continue;
      }

      // Get current beat
      const beat = this.getBeat(frame.beatId);
      if (!beat) {
        // The player stops here: a scene that ends with nowhere to go, or a
        // link to a beat that doesn't exist (the runtime stops with an error).
        if (frame.path.length > 0) paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'deadEnd'));
        continue;
      }
      seenBeats.add(beat.id);

      // Check for loop: same beat + same state + same taken choices = no progress possible
      // We include takenChoicesPerBeat in the key because different choices taken
      // means different paths are still available (e.g., DABC vs ABCD)
      const takenChoicesKey = this.hashTakenChoices(frame.takenChoicesPerBeat);
      // Back at a beat with nothing changed that a gate ahead reads: another lap
      // can't open anything. A running total nobody asks about used to make every
      // lap look new, until the path was cut off at the depth limit.
      const stateKey = `${beat.id}|${pathState(beat.id, frame.state)}|${takenChoicesKey}`;
      if (frame.visitedStates.has(stateKey)) {
        // This is a non-productive loop (same beat + same state + same choices = no progress)
        paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'cycle'));
        continue;
      }

      // Requirements are checked before anything else (Beat.execute): unmet,
      // the story jumps to the fallback without showing this beat.
      const redirect = this.requirementRedirect(beat, frame.state);
      if (redirect) {
        // Remember the redirect, so requirements that send the player back
        // and forth (A's fallback is B, B's is A) end as a cycle instead of
        // bouncing until the run's expansion budget is spent.
        enqueue({
          beatId: redirect,
          state: frame.state,
          path: frame.path,
          decisions: frame.decisions,
          visitedStates: new Set(frame.visitedStates).add(stateKey),
          takenChoicesPerBeat: frame.takenChoicesPerBeat,
        });
        continue;
      }

      // Apply beat effects to state
      const newState = this.applyBeatEffects(beat, frame.state);

      // Record this step
      const step: SimulatedStep = {
        beatId: beat.id,
        beatName: beat.name,
        beatType: beat.type,
        stateAfter: cloneState(newState),
        ...(frame.path.length === 0 ? { stateBefore: frame.state } : {}),
      };
      const newPath = [...frame.path, step];

      // Update visited states for loop detection
      const newVisitedStates = new Set(frame.visitedStates);
      newVisitedStates.add(stateKey);

      // Check for terminal beat
      if (this.isTerminalBeat(beat)) {
        // Only an end screen is an ending. A beat that simply has no way on is a
        // stop, and a scene whose last reply goes back to its start traps the player.
        const authored = ['endScreen', 'aiSummary'].includes(beat.type);
        paths.push(this.buildPath(newPath, frame.decisions, newState, authored ? 'ending' : this.loopsOnItself(beat) ? 'stuck' : 'deadEnd'));
        noteReplay(beat, newPath, frame.decisions, newState);
        continue;
      }

      // Get connections
      const connections = this.getConnections(beat);

      if (connections.length === 0) {
        // Dead end
        paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
        continue;
      }

      if (beat.type === 'conditionBeat') {
        // Evaluate condition and take appropriate branch (deterministic, no branching)
        const result = this.conditionBeatResult(beat, newState);

        // Update the last step with condition result
        newPath[newPath.length - 1].conditionResult = result;

        // Find the appropriate connection based on condition result (case-insensitive)
        const targetConnection = result
          ? connections.find(c => c.label?.toLowerCase() === 'true' || c.label?.toLowerCase() === 'yes')
          : connections.find(c => c.label?.toLowerCase() === 'false' || c.label?.toLowerCase() === 'no');

        const taken = targetConnection || connections[0];
        const targetId = taken.targetId;
        const linkState = this.followLink(taken, newState, newPath);

        enqueue({
          beatId: targetId,
          state: linkState,
          path: newPath,
          decisions: frame.decisions,
          visitedStates: newVisitedStates,
          takenChoicesPerBeat: frame.takenChoicesPerBeat,
        });
      } else if ((this.isChoiceBeat(beat) || this.hasTimedExit(beat)) && connections.length > 1) {
        // CHOICE BEAT: Create branches only for options NOT YET TAKEN at this beat
        // This prevents exponential explosion in hub-and-spoke patterns

        const takenHere = frame.takenChoicesPerBeat.get(beat.id) ?? new Set<number>();

        // Only the choices on screen in this state: a choice whose conditions
        // fail is hidden from the player. None on screen = the player is stuck.
        const offered: number[] = [];
        for (let i = 0; i < connections.length; i++) {
          if (this.choiceOffered(beat, connections[i], newState)) offered.push(i);
        }
        if (offered.length === 0) {
          const on = this.linkWhenAllHidden(beat, newState);
          if (on) {
            newPath[newPath.length - 1] = { ...newPath[newPath.length - 1], allChoicesHidden: true };
            enqueue({ beatId: on, state: newState, path: newPath, decisions: frame.decisions, visitedStates: newVisitedStates, takenChoicesPerBeat: frame.takenChoicesPerBeat });
          } else {
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
          }
          continue;
        }

        // Find options we haven't taken yet on THIS path
        // (Looking for what's uncovered, a choice leading there is open again:
        // players can return to a menu, and which route got here first decides
        // nothing.)
        const availableOptions = offered.filter((i) => !takenHere.has(i)
          || (coverage && (distance.get(connections[i].targetId) ?? Infinity) < Infinity));

        // If all options have been taken at this beat on this path,
        // we need to check if any option NOW leads somewhere different
        // (e.g., a condition that was false is now true due to state changes).
        //
        // KEY INSIGHT: Only retry options whose downstream behaviour depends
        // on state — any conditionBeat or requires-gated beat reachable within
        // a few hops of the option's target. Options that lead to a purely
        // linear chain always do the same thing and don't need retrying.
        // Walking ~6 beats forward catches the common authoring pattern of a
        // choice → intro text → condition / gated beat.
        if (availableOptions.length === 0) {
          const conditionGatedOptions: number[] = [];
          for (const i of offered) {
            if (this.branchHasStateDependence(connections[i].targetId, 6)) {
              conditionGatedOptions.push(i);
            }
          }

          // Every choice was tried on this path and none can now lead
          // anywhere new: a loop the player can leave by the same choices
          // (a cycle — not a dead end, the choices are still on screen).
          if (conditionGatedOptions.length === 0) {
            paths.push(this.buildPath(newPath, frame.decisions, newState, this.isTrap(beat) ? 'stuck' : 'cycle'));
            continue;
          }

          // Check if we've already re-explored condition options with this state
          const stateHash = hashState(newState);
          const reexploreKey = `reexplore:${beat.id}:${stateHash}`;
          if (frame.visitedStates.has(reexploreKey)) {
            // Already re-explored with this exact state: a cycle
            paths.push(this.buildPath(newPath, frame.decisions, newState, this.isTrap(beat) ? 'stuck' : 'cycle'));
            continue;
          }
          newVisitedStates.add(reexploreKey);

          // Only retry the condition-gated options (forward order for BFS queue)
          for (let idx = 0; idx < conditionGatedOptions.length; idx++) {
            const i = conditionGatedOptions[idx];
            const conn = connections[i];

            // Don't reset takenChoicesPerBeat - we're just retrying specific options
            const branchTakenChoices = new Map(frame.takenChoicesPerBeat);

            const branchPath = [...newPath];
            branchPath[branchPath.length - 1] = {
              ...branchPath[branchPath.length - 1],
              decisionMade: conn.label || conn.targetId,
            };

            const branchDecisions = [...frame.decisions, {
              beatId: beat.id,
              beatName: beat.name,
              choiceMade: conn.label || conn.targetId,
              alternatives: offered
                .filter((cidx) => cidx !== i)
                .map((cidx) => connections[cidx].label || connections[cidx].targetId),
            }];

            enqueue({
              beatId: conn.targetId,
              state: newState,
              path: branchPath,
              decisions: branchDecisions,
              visitedStates: newVisitedStates,
              takenChoicesPerBeat: branchTakenChoices,
            });
          }
          continue;
        }

        // Create branches for available options (forward order for BFS queue)
        for (let idx = 0; idx < availableOptions.length; idx++) {
          const i = availableOptions[idx];
          const conn = connections[i];
          if (this.isNeverDrawn(beat, conn)) continue;

          // Update takenChoicesPerBeat for this branch
          const newTakenChoicesPerBeat = new Map(frame.takenChoicesPerBeat);
          const newTakenHere = new Set(takenHere);
          newTakenHere.add(i);
          newTakenChoicesPerBeat.set(beat.id, newTakenHere);

          // Update the step with the decision for this branch
          const branchPath = [...newPath];
          branchPath[branchPath.length - 1] = {
            ...branchPath[branchPath.length - 1],
            decisionMade: conn.label || conn.targetId,
          };

          // Record the decision
          const branchDecisions = [...frame.decisions, {
            beatId: beat.id,
            beatName: beat.name,
            choiceMade: conn.label || conn.targetId,
            alternatives: offered
              .filter((cidx) => cidx !== i)
              .map((cidx) => connections[cidx].label || connections[cidx].targetId),
          }];

          // Apply per-choice effects (e.g., pickProp adds inventory item per choice)
          const branchState = this.applyChoiceEffects(beat, cloneState(newState), i, conn);
          this.applyEffectsList(conn.effects, branchState);

          // Update the step's stateAfter to reflect this branch's choice effects
          branchPath[branchPath.length - 1] = {
            ...branchPath[branchPath.length - 1],
            stateAfter: cloneState(branchState),
          };

          enqueue({
            beatId: conn.targetId,
            state: branchState,
            path: branchPath,
            decisions: branchDecisions,
            visitedStates: newVisitedStates,
            takenChoicesPerBeat: newTakenChoicesPerBeat,
          });
        }
      } else {
        // Automatic beat - follow first/only connection (and run its link effects).
        // A choice beat with a single choice: it is offered only when its
        // conditions hold, and picking it applies its effects.
        let lone = newState;
        if (this.isChoiceBeat(beat)) {
          if (!this.choiceOffered(beat, connections[0], newState)) {
            const on = this.linkWhenAllHidden(beat, newState);
            if (on) {
              newPath[newPath.length - 1] = { ...newPath[newPath.length - 1], allChoicesHidden: true };
              enqueue({ beatId: on, state: newState, path: newPath, decisions: frame.decisions, visitedStates: newVisitedStates, takenChoicesPerBeat: frame.takenChoicesPerBeat });
            } else {
              paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
            }
            continue;
          }
          lone = this.applyChoiceEffects(beat, cloneState(newState), 0, connections[0]);
        }
        const linkState = this.followLink(connections[0], lone, newPath);
        enqueue({
          beatId: connections[0].targetId,
          state: linkState,
          path: newPath,
          decisions: frame.decisions,
          visitedStates: newVisitedStates,
          takenChoicesPerBeat: frame.takenChoicesPerBeat,
        });
      }
    }

    return paths;
  }

  // ==========================================================================
  // Beat Processing
  // ==========================================================================

  /**
   * Get a beat by ID (cached)
   */
  /** Links to the nearest beat on no finished path yet, for every beat that can get to one. */
  private distanceToUncovered(covered: Set<string>, stopsFound: Set<string>, open?: ReadonlySet<string>): Map<string, number> {
    const incoming = new Map<string, string[]>();
    const beats = this.story.getAllBeats();
    for (const beat of beats) {
      const targets = this.getConnections(beat).map((c) => c.targetId);
      for (const r of (beat as any).requires ?? []) if (r?.fallbackTarget) targets.push(r.fallbackTarget);
      for (const target of targets) {
        const from = incoming.get(target);
        if (from) from.push(beat.id); else incoming.set(target, [beat.id]);
      }
    }
    const distance = new Map<string, number>();
    // Also what to look for: a reply or line that stops the story, on a beat
    // already reached by another way. Each is a finding in its own right.
    const stopToFind = (b: Beat) => {
      if (b.type !== 'dialogTree') return false;
      const links = this.getConnections(b) as any[];
      return links.length > 1 && links.some((c) => c.sceneEnds && !stopsFound.has(`${b.id}|${c.label || c.targetId}`));
    };
    // And a reply beside gated next lines that nothing has shown yet: it shows
    // only in some states, and the search should try to find one.
    const replyToFind = (b: Beat) => {
      if (b.type !== 'dialogTree' || !covered.has(b.id)) return false;
      let waiting = false;
      const seen = new Set<any>();
      const walk = (node: any): void => {
        if (!node || seen.has(node) || waiting) return;
        seen.add(node);
        const choices: any[] = Array.isArray(node.choices) ? node.choices.filter(Boolean) : [];
        const steps = choices.filter((c) => c.continue === true);
        if (steps.length > 0 && steps.every((c) => Array.isArray(c.conditions) && c.conditions.length > 0)) {
          if (choices.some((c) => !c.continue && String(c.text ?? '').trim() && !this.shownReplies.has(`${b.id}|${c.id}`))) waiting = true;
        }
        for (const c of choices) walk(c.dialogNode);
      };
      walk(b.getParameters().dialogTree);
      return waiting;
    };
    // Not what the counter ranges rule out: no way of playing gets there.
    let level = beats.filter((b) => (!covered.has(b.id) && (!open || open.has(b.id))) || stopToFind(b) || replyToFind(b)).map((b) => b.id);
    level.forEach((id) => distance.set(id, 0));
    for (let d = 1; level.length > 0; d++) {
      const next: string[] = [];
      for (const id of level) {
        for (const from of incoming.get(id) ?? []) {
          if (!distance.has(from)) { distance.set(from, d); next.push(from); }
        }
      }
      level = next;
    }
    return distance;
  }

  /**
   * A summary of a state at a beat: only what the conditions still ahead of
   * that beat, on the way to something uncovered, read. Past its last gate a
   * flag can't open anything, however it was set. A condition it can't name
   * (feelings, timers) brings the whole state in.
   */
  private stateThatDecidesGates(distance: Map<string, number>): (beatId: string, state: SimulationState) => string {
    const reads = new Map<string, Set<string>>();
    const next = new Map<string, string[]>();
    // The values a counter is compared with. Past all of them, more of the same
    // opens nothing: 41 and 90 play alike if nothing checks above 40.
    const limits = new Map<string, { low: number; high: number } | null>();
    const directions = this.counterDirections();
    const noteLimit = (name: string, value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value ?? 0);
      if (!Number.isFinite(n)) { limits.set(name, null); return; }
      if (limits.get(name) === null) return;
      const known = limits.get(name);
      limits.set(name, known ? { low: Math.min(known.low, n), high: Math.max(known.high, n) } : { low: n, high: n });
    };
    const noteOf = (c: any): string[] => {
      if (!c) return [];
      const name = c.variableName || c.variable || c.left;
      switch (c.type) {
        case 'variable': return name ? [`v\u0001${name}`] : [];
        case 'counter': {
          if (!name) return [];
          const key = this.counterKey(c.character, name);
          noteLimit(key, c.value ?? c.right);
          return [`c\u0001${key}`];
        }
        case 'counterCompare':
          limits.set(this.counterKey(c.character, c.counter1 || ''), null);
          limits.set(this.counterKey(c.character, c.counter2 || ''), null);
          return [`c\u0001${this.counterKey(c.character, c.counter1 || '')}`, `c\u0001${this.counterKey(c.character, c.counter2 || '')}`];
        case 'inventory': {
          const item = String(c.item || c.value || c.right || '');
          const out = item ? [`i\u0001${item}`] : [];
          if (c.compareVariable) out.push(`v\u0001${String(c.compareVariable).replace(/^\$/, '')}`);
          if (typeof c.quantityValue === 'string') out.push(`v\u0001${c.quantityValue.replace(/^\$/, '')}`);
          return out;
        }
        case 'visitedBeat': { const id = c.beatId || c.value; return id ? [`b\u0001${id}`] : []; }
        default: return ['*'];
      }
    };
    for (const beat of this.story.getAllBeats()) {
      if (!distance.has(beat.id)) continue;
      const own = new Set<string>();
      const read = (list: any) => (Array.isArray(list) ? list : [list]).forEach((c) => noteOf(c).forEach((n) => own.add(n)));
      const params: any = beat.getParameters();
      for (const r of (beat as any).requires ?? []) read(r);
      if (beat.type === 'conditionBeat') {
        read(this.getCondition(beat));
        read(params.moreConditions ?? []);
      }
      const links = this.getConnections(beat) as any[];
      for (const conn of links) {
        read(conn.condition ?? []);
        for (const step of conn.route ?? []) {
          read(step.choice?.conditions ?? []);
          for (const list of step.unless ?? []) read(list);
        }
      }
      reads.set(beat.id, own);
      next.set(beat.id, links.map((c) => c.targetId).filter((id) => distance.has(id)));
    }
    const ahead = new Map<string, string[]>();
    const aheadOf = (start: string): string[] => {
      const known = ahead.get(start);
      if (known) return known;
      const names = new Set<string>();
      const seen = new Set<string>([start]);
      const todo = [start];
      while (todo.length > 0) {
        const id = todo.pop()!;
        reads.get(id)?.forEach((n) => names.add(n));
        for (const to of next.get(id) ?? []) if (!seen.has(to)) { seen.add(to); todo.push(to); }
      }
      const list = [...names].sort();
      ahead.set(start, list);
      return list;
    };
    return (beatId, state) => {
      const names = aheadOf(beatId);
      if (names.includes('*')) return hashState(state);
      return names.map((n) => {
        const name = n.slice(2);
        switch (n[0]) {
          case 'v': return `${n}=${state.variables.get(name)}`;
          case 'c': {
            const value = state.counters.get(name) ?? 0;
            const limit = limits.get(name);
            // Only past the last threshold in the one direction it ever moves:
            // climbing toward a threshold still matters, and so does coming back.
            const way = directions.get(name);
            if (limit && way === 'up' && value > limit.high) return `${n}=above`;
            if (limit && way === 'down' && value < limit.low) return `${n}=below`;
            return `${n}=${value}`;
          }
          case 'i': return `${n}=${itemQuantity(state, 'player', name)}`;
          default: return state.visitedBeats.has(name) ? n : '';
        }
      }).join('|');
    };
  }

  /** Every beat some visited-beat condition in the story asks about. */
  private beatsAskedAboutByVisited(): Set<string> {
    const ids = new Set<string>();
    const walk = (o: any): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (o.type === 'visitedBeat' && (o.beatId || o.value)) ids.add(String(o.beatId || o.value));
      Object.values(o).forEach(walk);
    };
    for (const beat of this.story.getAllBeats()) walk([(beat as any).getParameters?.(), (beat as any).requires, (beat as any).connections]);
    return ids;
  }

  private getBeat(beatId: string): Beat | null {
    if (this.beatCache.has(beatId)) {
      return this.beatCache.get(beatId) ?? null;
    }
    const beat = this.story.getBeat(beatId);
    this.beatCache.set(beatId, beat ?? null);
    return beat ?? null;
  }

  /**
   * Get connections from a beat, deduplicated by target
   *
   * For path analysis, multiple choices that lead to the same target
   * are effectively the same path (e.g., dialogue options that all continue
   * to the next beat). We deduplicate to avoid false branching.
   *
   * Exception: beats with per-choice state effects (pickProp, dialogTree)
   * are NOT deduplicated, because each choice produces different state
   * even when all choices lead to the same target beat.
   */
  private getConnections(beat: Beat): Connection[] {
    // Every way on, including auto-advance and timer / QR targets — the
    // walk every analyzer shares. Requirement redirects are not a way on
    // here: they are taken before the beat shows (requirementRedirect).
    let connections = analysisLinks(beat).filter((c) => c.label !== EXTRA_LINK.requiresFallback);
    const allRoutes = beat.type === 'dialogTree' ? this.dialogRoutes(beat) : [];
    // A beat linked by hand with a tree that exits nowhere goes by its links.
    const routes = allRoutes.every((c: any) => c.sceneEnds) && (beat as any).connections?.length > 0 ? [] : allRoutes;
    if (routes.length > 0) {
      // Each way through the tree is its own route: two replies whose lines
      // end at the same exit set different things (the beat's own list
      // merges them). The tree's links are all in the routes.
      const own = new Set(beat.getConnections().map((c) => `${c.targetId}\u0000${c.label ?? ''}`));
      // The other links (auto-advance, timer) pass through no reply: an empty
      // route, or the reply lookup would lend them the conditions and effects
      // of a reply that happens to share their target.
      const extras = connections.filter((c) => !own.has(`${c.targetId}\u0000${c.label ?? ''}`));
      connections = [...routes, ...extras.map((c) => ({ ...c, route: [] }) as Connection)];
      // Nothing but stops: the beat has no way on at all.
      if (connections.every((c: any) => c.sceneEnds && c.targetId === STORY_STOPS)) return [];
    } else if (beat.type === 'chooseCharacter') {
      // Every option casts someone, linked or not (ChooseCharacterBeat).
      const extras = connections.filter((c) => !beat.getConnections().some((o) => o.targetId === c.targetId && o.label === c.label));
      connections = [...this.characterOptions(beat), ...extras];
    } else {
      // Choices that stay on this beat ('__self__': search the desk, buy one
      // more) change state too — the player can take them before going on.
      connections.push(...this.loopBackChoices(beat));
    }

    // Skip deduplication for beats where each choice has different state effects
    // (e.g., pickProp adds different inventory items per choice)
    if (this.hasPerChoiceEffects(beat)) {
      return connections;
    }

    // Deduplicate connections by targetId. A link that is always on screen
    // stands for every link to its target; links with conditions are kept
    // (each may be the only one offered in some state) unless such an
    // always-offered link to the same target exists. Keeping just the first
    // link let a hidden 'Pay with gold' hide the plain 'Ask nicely' beside it.
    const conditional = (conn: Connection): boolean => {
      const own: any = conn.condition;
      if (Array.isArray(own) ? own.length > 0 : !!own) return true;
      return ((conn as any).route ?? []).some((st: any) => st?.unless || Array.isArray(st?.choice?.conditions) && st.choice.conditions.length > 0);
    };
    const alwaysTo = new Set(connections.filter((c) => !conditional(c)).map((c) => c.targetId));
    const seenTargets = new Set<string>();
    const uniqueConnections: Connection[] = [];
    for (const conn of connections) {
      if (alwaysTo.has(conn.targetId)) {
        if (conditional(conn) || seenTargets.has(conn.targetId)) continue;
        seenTargets.add(conn.targetId);
      }
      uniqueConnections.push(conn);
    }

    return uniqueConnections;
  }

  /**
   * Every way through a Dialog Tree, as links that carry their `route` (the
   * replies taken and lines shown): out to a reply's or line's exit, or back
   * to the first line ('__self__', only when something on the way has
   * effects). Capped, so a very bushy tree stays tractable.
   */
  private dialogRoutes(beat: Beat): Connection[] {
    const out: Connection[] = [];
    const tree = beat.getParameters().dialogTree;
    const changes = (steps: Array<{ choice?: any; node?: any }>) => steps.some((st) => {
      const o = st.choice ?? st.node;
      return (Array.isArray(o?.effects) && o.effects.length > 0) || !!o?.counter || !!o?.variable;
    });
    const exit = (target: string, label: string, route: Array<{ choice?: any; node?: any }>) => {
      if (out.length >= 200) return;
      if (target === '__self__') {
        if (changes(route)) out.push({ targetId: beat.id, label, route } as any);
      } else out.push({ targetId: target, label, route } as any);
    };
    // Where the story goes when the scene ends without an exit (the beat's own
    // link); with none, a target no beat has: the player stops there.
    const after = (beat as any).defaultTarget || (beat as any).connections?.[0]?.targetId || STORY_STOPS;
    const stop = (label: string, route: Array<any>) => {
      if (out.length < 200) { out.push({ targetId: after, label, route, sceneEnds: true } as any); }
    };
    const onRoute = new Set<any>();
    const conditionsOf = (c: any): any[] => (Array.isArray(c?.conditions) ? c.conditions.filter(Boolean) : []);
    const walk = (node: any, route: Array<any>, depth: number): void => {
      // Any depth: a long scene nests a level per line, and missing its exit
      // made the whole beat look like an ending.
      if (!node || typeof node !== 'object' || onRoute.has(node) || out.length >= 200) return;
      onRoute.add(node);
      // A line with its own exit ends the conversation there (its replies are never shown).
      if (typeof node.target === 'string' && node.target) { exit(node.target, `[NPC exit] ${node.speaker || 'NPC'}`, route); return; }
      const all: any[] = (Array.isArray(node.choices) ? node.choices : []).filter((c: any) => c && c.visible !== false);
      const follow = (choice: any, before: any[]) => {
        const taken = [...before, { choice }];
        if (typeof choice.target === 'string' && choice.target) exit(choice.target, choice.text || 'Choice', taken);
        else if (choice.dialogNode) walk(choice.dialogNode, [...taken, { node: choice.dialogNode }], depth + 1);
        else stop(choice.text || 'Choice', taken); // A reply that goes nowhere ends the scene.
      };
      // As the runtime: the first next line whose conditions hold plays, and
      // while one does the replies aren't offered.
      const shut: any[][] = [];
      let always = false;
      for (const step of all.filter((c) => c.continue === true)) {
        follow(step, shut.length > 0 ? [...route, { unless: [...shut] }] : route);
        const conds = conditionsOf(step);
        if (conds.length === 0) { always = true; break; }
        shut.push(conds);
      }
      if (!always) {
        const replies = all.filter((c) => c.continue !== true);
        const held = shut.length > 0 ? [...route, { unless: [...shut] }] : route;
        for (const reply of replies) follow(reply, held);
        // Every reply can be hidden, or there are none: the line ends the scene.
        const open = replies.some((c) => conditionsOf(c).length === 0);
        if (!open) stop(`[Scene ends] ${node.speaker || 'NPC'}`, [...route, { unless: [...shut, ...replies.map(conditionsOf)] }]);
      }
      onRoute.delete(node);
    };
    walk(tree, [], 0);
    return out;
  }

  /**
   * A Choose Your Character beat's options as the player sees them
   * (ChooseCharacterBeat.choicesFor / targetFor): with no options authored,
   * one per candidate of the role; an option without its own link goes where
   * the first linked one does. Each link carries its option.
   */
  private characterOptions(beat: Beat): Connection[] {
    const params = beat.getParameters();
    const authored: any[] = Array.isArray(params.choices) ? params.choices.filter(Boolean) : [];
    const role = String(params.role || 'player').replace(/^@/, '');
    const options = authored.length > 0
      ? authored
      : (this.getScratch()?.getRole(role)?.candidates ?? []).map((id: string) => ({ id: `cast_${id}`, character: id }));
    const fallback = authored.find((c) => c.target && c.target !== '__self__')?.target
      || beat.getConnections()[0]?.targetId || beat.defaultTarget;
    const out: Connection[] = [];
    for (const o of options) {
      const target = o.target === '__self__' ? beat.id : (o.target || fallback);
      if (!target) continue;
      out.push({ targetId: target, label: o.text || o.character || o.id, condition: o.conditions, option: o } as any);
    }
    return out;
  }

  /**
   * A beat's choices that stay on it ('__self__'), as links back to the beat
   * itself — only the ones with effects (a plain one changes nothing).
   */
  private loopBackChoices(beat: Beat): Connection[] {
    const out: Connection[] = [];
    const params = beat.getParameters();
    const hasEffects = (c: any) => (Array.isArray(c?.effects) && c.effects.length > 0) || !!c?.counter || !!c?.variable;
    const choices: any[] = (beat as any).liveChoices ?? (Array.isArray(params.choices) ? params.choices : []);
    for (const c of choices) {
      if (c?.target === '__self__' && hasEffects(c)) out.push({ targetId: beat.id, label: c.text || c.locationName || c.id, condition: c.conditions } as Connection);
    }
    return out;
  }

  /** Where an unmet requirement sends the story, if it does (Beat.checkRequirementsGate). */
  private requirementRedirect(beat: Beat, state: SimulationState): string | null {
    const requires = (beat as any).requires as any[] | undefined;
    if (!Array.isArray(requires) || requires.length === 0) return null;
    const evals = requires.map((req) => ({ req, ok: !req?.condition || this.evaluateCondition(req.condition, state) }));
    if ((beat as any).requiresMode === 'any') {
      if (evals.some((e) => e.ok)) return null;
      return evals.find((e) => e.req?.fallbackTarget)?.req.fallbackTarget ?? null;
    }
    // All (the default): the first unmet requirement decides — with no
    // fallback it is only a note and the beat shows.
    const first = evals.find((e) => !e.ok);
    return first?.req?.fallbackTarget || null;
  }

  /** A Condition Check's answer: its first condition and any more, matched all (AND) or any (OR) — as ConditionBeat. */
  private conditionBeatResult(beat: Beat, state: SimulationState): boolean {
    const condition = this.getCondition(beat);
    const first = condition ? this.evaluateCondition(condition, state) : true;
    const params = beat.getParameters();
    const more = params.moreConditions;
    if (!Array.isArray(more) || more.length === 0) return first;
    const rest = more.map((c: Condition) => this.evaluateCondition(c, state));
    return params.conditionsMatch === 'any' ? first || rest.some(Boolean) : first && rest.every(Boolean);
  }

  /** Come back to a beat with nothing new, and no link from here gets out: an ending or stop is out of reach. */
  private isTrap(start: Beat): boolean {
    const seen = new Set<string>([start.id]);
    const todo = [start];
    while (todo.length > 0) {
      const beat = todo.pop()!;
      for (const conn of this.getConnections(beat)) {
        const next = this.getBeat(conn.targetId);
        if (!next || this.isTerminalBeat(next)) return false;
        if (!seen.has(next.id)) { seen.add(next.id); todo.push(next); }
      }
    }
    return true;
  }

  /** A screen that moves on by itself when its time runs out: the button and the wait are two ways on. */
  private hasTimedExit(beat: Beat): boolean {
    return (beat.defaultTargetDelay ?? 0) > 0 && defaultTargetIsLive(beat);
  }

  /** Counters every change moves one way. Anything else that sets one rules it out. */
  private counterDirections(): Map<string, 'up' | 'down' | 'both'> {
    const out = new Map<string, 'up' | 'down' | 'both'>();
    const note = (name: string, way: 'up' | 'down' | 'both') => {
      const known = out.get(name);
      out.set(name, !known || known === way ? way : 'both');
    };
    const change = (name: string, by: unknown) => {
      const n = Number(by ?? 1);
      note(name, !Number.isFinite(n) ? 'both' : n >= 0 ? 'up' : 'down');
    };
    const walk = (o: any): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (o.type === 'incrementCounter' && o.target) change(this.counterKey(o.character, o.target), o.value);
      if (o.type === 'setCounter' && o.target) note(this.counterKey(o.character, o.target), 'both');
      if (typeof o.counter === 'string' && o.counter) note(o.counter, 'both');
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    };
    for (const beat of this.story.getAllBeats()) {
      const params: any = beat.getParameters();
      walk(params);
      walk(beat.connections);
      if (beat.type === 'setVariable' && params.type === 'counter' && params.name) {
        const key = this.counterKey(params.character, params.name);
        if (params.operation === 'add' || params.operation === 'change') change(key, params.value);
        else if (params.operation === 'subtract') change(key, -Number(params.value ?? 1));
        else note(key, 'both');
      }
      if (beat.type === 'inputText' && params.counter) note(params.counter, 'both');
    }
    return out;
  }

  /** A Dialog Tree with a reply or line that returns to its first line. */
  private loopsOnItself(beat: Beat): boolean {
    if (beat.type !== 'dialogTree') return false;
    const seen = new Set<any>();
    const walk = (node: any): boolean => {
      if (!node || typeof node !== 'object' || seen.has(node)) return false;
      seen.add(node);
      if (node.target === '__self__') return true;
      return (Array.isArray(node.choices) ? node.choices : []).some((c: any) => c?.target === '__self__' || walk(c?.dialogNode));
    };
    return walk(beat.getParameters().dialogTree);
  }

  /**
   * The state a Replay leaves, as StoryContext.restartPlaythrough: what the
   * end screen resets goes back to the story's start, what is marked "keep
   * across restarts" stays, and the playthrough count goes up.
   */
  private stateAfterReplay(beat: Beat, state: SimulationState): SimulationState {
    const p = beat.getParameters();
    const next = cloneState(state);
    if (p.reset === true) {
      const fresh = this.seededInitialState();
      const all = [p.resetVariables, p.resetCounters, p.resetInventory, p.resetTimers, p.resetFictionalTime, p.resetVisitedTracking, p.resetHistory, p.resetCharacters].every((v) => v !== false);
      if (all || p.resetVariables !== false) {
        const keep = new Set<string>(((this.story as any).getSettings?.()?.variables ?? []).filter((d: any) => d?.keepOnRestart).map((d: any) => d.name));
        next.variables = new Map(fresh.variables);
        for (const [name, value] of state.variables) if (keep.has(name)) next.variables.set(name, value);
      }
      if (all || p.resetCounters !== false) {
        const keep = new Set<string>();
        for (const c of this.characters()) for (const d of Array.isArray(c?.counters) ? c.counters : []) if (d?.keepOnRestart) keep.add(this.counterKey(c.id, d.name));
        next.counters = new Map(fresh.counters);
        for (const [name, value] of state.counters) if (keep.has(name)) next.counters.set(name, value);
      }
      if (all || p.resetInventory !== false) {
        next.inventory = fresh.inventory;
        next.itemCounts = fresh.itemCounts;
      }
      if (all || p.resetVisitedTracking !== false) next.visitedBeats = new Set();
      const keepsCast = this.characters().some((c) => c?.keepVariantOnRestart)
        || ((this.story as any).getSettings?.()?.roles ?? []).some((r: any) => r?.keepOnRestart);
      if ((all || p.resetCharacters !== false) && !keepsCast) {
        next.runtime = fresh.runtime;
        next.pendingRuntime = undefined;
      }
    }
    const run = Number(state.variables.get(PLAYTHROUGH_VARIABLE));
    if (Number.isFinite(run)) next.variables.set(PLAYTHROUGH_VARIABLE, run + 1);
    return next;
  }

  /**
   * Every choice hidden: the runtime skips the beat and follows its own link
   * (Beat.getNextBeat), without applying any choice's effects. A Dialog Tree's
   * routes already say where its scene ends.
   */
  private linkWhenAllHidden(beat: Beat, state: SimulationState): string | null {
    if (beat.type === 'dialogTree') return null;
    const links: Connection[] = (beat as any).connections ?? [];
    const met = links.find((c) => c.condition && this.evaluateCondition(c.condition as any, state));
    return met?.targetId ?? links.find((c) => !c.condition)?.targetId ?? beat.defaultTarget ?? null;
  }

  /**
   * Is this choice on screen in this state? Its conditions (one or a list)
   * must all hold, as the beats filter them. In a Dialog Tree that is every
   * reply on the way to the exit.
   */
  private choiceOffered(beat: Beat, connection: Connection, state: SimulationState): boolean {
    const conds: any[] = [];
    const own: any = connection.condition;
    if (Array.isArray(own)) conds.push(...own); else if (own) conds.push(own);
    if (beat.type === 'dialogTree') {
      const tree = beat.getParameters().dialogTree;
      const target = connection.targetId === beat.id ? '__self__' : connection.targetId;
      for (const step of (connection as any).route ?? this.dialogPathTo(tree, target, connection.label)) {
        if (Array.isArray(step.choice?.conditions)) conds.push(...step.choice.conditions);
        // Closed while an earlier next line, or a reply, is on screen instead.
        for (const list of step.unless ?? []) {
          if (list.every((c: any) => !c || this.evaluateCondition(c, state))) return false;
        }
      }
    }
    const offered = conds.every((c) => !c || this.evaluateCondition(c, state));
    if (offered) {
      for (const step of (connection as any).route ?? []) {
        if (step.choice?.id && !step.choice.continue) this.shownReplies.add(`${beat.id}|${step.choice.id}`);
      }
    }
    return offered;
  }

  /**
   * Check if a beat has per-choice state effects that make each branch unique
   * even when connections share the same target.
   */
  /**
   * Walk forward from `startBeatId` up to `maxSteps` linear hops and report
   * whether any beat reachable on this chain is state-dependent — a
   * conditionBeat, or a beat declaring `requires`. Used by the hub-retry logic
   * to decide whether revisiting a "taken" option might now behave differently
   * because state changed elsewhere.
   *
   * The walk follows only the first outgoing connection per beat (linear
   * prefix) and stops on branching beats (other than the ones we're looking
   * for) so it stays cheap.
   */
  private branchHasStateDependence(startBeatId: string, maxSteps: number): boolean {
    let cursor: string | null = startBeatId;
    const seen = new Set<string>();
    for (let step = 0; step < maxSteps; step++) {
      if (!cursor || seen.has(cursor)) return false;
      seen.add(cursor);
      const beat = this.getBeat(cursor);
      if (!beat) return false;
      const hasRequires = Array.isArray((beat as any).requires)
        && (beat as any).requires.length > 0;
      if (beat.type === 'conditionBeat' || hasRequires) return true;
      // Don't traverse into choice-style branching beats — those are separate
      // decision points with their own retry behaviour.
      if (isChoiceBeatType(beat.type)) {
        return false;
      }
      const conns = beat.getConnections();
      cursor = conns.length > 0 ? conns[0].targetId : beat.defaultTarget ?? null;
    }
    return false;
  }

  private hasPerChoiceEffects(beat: Beat): boolean {
    if (beat.type === 'pickProp' || beat.type === 'chooseCharacter') {
      return true; // Each prop adds a different item; each option casts someone else
    }

    const params = beat.getParameters();

    // Helper: does any element in an array carry per-choice effects?
    const anyHasEffects = (arr: any[] | undefined): boolean => {
      if (!Array.isArray(arr)) return false;
      return arr.some((c: any) =>
        (Array.isArray(c?.effects) && c.effects.length > 0) ||
        c?.counter || c?.variable
      );
    };

    if (beat.type === 'dialogTree') {
      // Current format: choices live under params.dialogTree.choices and
      // may recurse via dialogNode. Also support legacy dialogNodes/nodes.
      const tree = params.dialogTree;
      const walkTree = (node: any): boolean => {
        if (!node || !Array.isArray(node.choices)) return false;
        if (anyHasEffects(node.choices)) return true;
        for (const c of node.choices) {
          if (c?.dialogNode && walkTree(c.dialogNode)) return true;
        }
        return false;
      };
      if (tree && walkTree(tree)) return true;

      // Legacy fallback
      const legacyNodes = params.dialogNodes || params.nodes || [];
      for (const n of legacyNodes) {
        if (anyHasEffects(n?.choices)) return true;
      }
      return false;
    }

    if (beat.type === 'movementChoice' || beat.type === 'freeLayout' || isMultiChoiceLike(beat.type)) {
      return anyHasEffects(params.choices);
    }

    return false;
  }

  /**
   * Apply beat effects to the simulation state
   */
  private applyBeatEffects(beat: Beat, state: SimulationState): SimulationState {
    const newState = cloneState(state);
    newState.visitedBeats.add(beat.id);

    const params = beat.getParameters();

    // The runtime's per-beat step: emotions decay, goals are re-checked
    // (StoryContext.markBeatVisited) — feelings move between beats too.
    if (newState.pendingRuntime?.length || this.tickMatters(newState)) this.withRuntime(newState, (ctx) => ctx.markBeatVisited(beat.id), true);

    // Feelings this beat applies on its own.
    if (beat.type === 'updateAffect') {
      this.applyEffectsList((beat as any).affectEffects?.() ?? [], newState);
    }
    if (beat.type === 'dialogTree' && Array.isArray(params.dialogTree?.effects)) {
      this.applyEffectsList(params.dialogTree.effects, newState); // the root node shows on entry
    }

    switch (beat.type) {
      case 'setVariable':
      case 'variable': {
        const varType = params.type || 'variable';
        const name = params.name || params.variableName;
        const value = params.value;
        const operation = params.operation || 'set';

        if (!name) break;

        if (varType === 'counter') {
          // A character's own counter when the beat names one (SetVariableBeat.character).
          const key = this.counterKey(params.character, name);
          const current = newState.counters.get(key) || 0;
          if (operation === 'set') {
            newState.counters.set(key, Number(value) || 0);
          } else if (operation === 'change' || operation === 'add' || operation === 'increment') {
            newState.counters.set(key, current + (Number(value) || 1));
          } else if (operation === 'decrement' || operation === 'subtract') {
            newState.counters.set(key, current - (Number(value) || 1));
          }
        } else {
          if (operation === 'set') {
            newState.variables.set(name, value);
          }
        }
        break;
      }

      case 'addRemoveInventory': {
        // As AddRemoveInventoryBeat: quantities, and transfers between bags.
        const item = params.item || params.prop;
        // The beat stores 'action'; 'operation' was read before, so removes
        // were never simulated.
        const operation = params.action || params.operation || 'add';
        if (!item) break;
        const raw = params.quantity;
        const quantity = typeof raw === 'number' ? Math.max(1, raw)
          : typeof raw === 'string' && raw.startsWith('$')
            ? Math.max(1, Number(newState.variables.get(raw.slice(1)) ?? newState.counters.get(raw.slice(1))) || 1)
            : Math.max(1, parseInt(raw, 10) || 1);
        if (operation === 'add') addItem(newState, this.bagOf(params.character), item, quantity);
        else if (operation === 'remove') removeItem(newState, this.bagOf(params.character), item, quantity);
        else if (operation === 'transfer' && params.fromChar && params.toChar) {
          removeItem(newState, this.bagOf(params.fromChar), item, quantity);
          addItem(newState, this.bagOf(params.toChar), item, quantity);
        }
        break;
      }

      case 'setTimer': {
        // Timers don't affect path analysis state
        break;
      }

      case 'inputText': {
        // InputText beats capture user input into a variable, counter, or character name
        // For simulation, we generate placeholder values based on the beat configuration
        const saveToType = params.saveToType || 'variable';
        const variableName = params.variable || params.variableName || 'userInput';
        const counterName = params.counter;
        const validation = params.validation || 'none';

        // Generate appropriate placeholder value based on validation type
        let placeholderValue: string | number;
        switch (validation) {
          case 'numeric':
            placeholderValue = 42;
            break;
          case 'email':
            placeholderValue = 'user@example.com';
            break;
          case 'alphanumeric':
            placeholderValue = 'User1';
            break;
          default:
            // Use the variable name as a readable placeholder
            placeholderValue = variableName.charAt(0).toUpperCase() + variableName.slice(1);
        }

        if (saveToType === 'variable' && variableName) {
          newState.variables.set(variableName, placeholderValue);
        } else if (saveToType === 'counter' && counterName) {
          const numValue = typeof placeholderValue === 'number' ? placeholderValue : 0;
          const operation = params.counterOperation || 'set';
          if (operation === 'change') {
            const currentValue = newState.counters.get(counterName) || 0;
            newState.counters.set(counterName, currentValue + numValue);
          } else {
            newState.counters.set(counterName, numValue);
          }
        } else if (saveToType === 'characterName' && params.characterId) {
          // Store character name in a special variable format
          newState.variables.set(`character_${params.characterId}_name`, placeholderValue);
        }
        break;
      }

      case 'keypad': {
        // Keypad beats save entered code to a variable or counter, similar to inputText
        const kpSaveToType = params.saveToType || 'variable';
        const kpVariableName = params.variable || params.variableName || 'keypadInput';
        const kpCounterName = params.counter;
        const kpPlaceholder = params.correctCode || '1234';

        if (kpSaveToType === 'variable' && kpVariableName) {
          newState.variables.set(kpVariableName, kpPlaceholder);
        } else if (kpSaveToType === 'counter' && kpCounterName) {
          const numValue = typeof kpPlaceholder === 'number' ? kpPlaceholder : Number(kpPlaceholder) || 0;
          newState.counters.set(kpCounterName, numValue);
        }
        break;
      }

      // Other beat types don't modify state
    }

    return newState;
  }

  /** The random branch behind a connection: same position when it still matches, else the first with that target. */
  private randomBranchFor(beat: Beat, index: number, connection?: Connection): any {
    const raw: any[] = Array.isArray(beat.getParameters().choices) ? beat.getParameters().choices : [];
    const target = (b: any) => (typeof b === 'string' ? b : b?.target || b?.targetId || b?.id);
    if (!connection) return raw[index];
    if (raw[index] !== undefined && target(raw[index]) === connection.targetId) return raw[index];
    return raw.find((b) => target(b) === connection.targetId);
  }

  /** A random branch with weight 0 is never drawn, so no playthrough takes it. */
  private isNeverDrawn(beat: Beat, connection: Connection): boolean {
    if (beat.type !== 'randomTarget') return false;
    const raw: any[] = Array.isArray(beat.getParameters().choices) ? beat.getParameters().choices : [];
    const branches = raw.filter((b) => (typeof b === 'string' ? b : b?.target || b?.targetId || b?.id) === connection.targetId);
    return branches.length > 0 && branches.every((b) => typeof b === 'object' && b?.weight === 0);
  }

  /**
   * Leave a beat along `connection`: its link effects run (as at runtime),
   * and the step records the state the next beat is entered with.
   */
  private followLink(connection: Connection, state: SimulationState, path: SimulatedStep[]): SimulationState {
    if (!Array.isArray(connection.effects) || connection.effects.length === 0) return state;
    const next = cloneState(state);
    this.applyEffectsList(connection.effects, next);
    path[path.length - 1] = { ...path[path.length - 1], stateAfter: cloneState(next) };
    return next;
  }

  /**
   * Apply per-choice effects when branching at a choice beat.
   * For example, pickProp adds the selected prop's name to inventory.
   */
  private applyChoiceEffects(beat: Beat, state: SimulationState, choiceIndex: number, connection?: Connection): SimulationState {
    const params = beat.getParameters();

    switch (beat.type) {
      case 'pickProp': {
        // The picked prop goes into the player's bag, then its effects.
        const prop = this.choiceFor(params.props, beat, choiceIndex, connection);
        if (prop) {
          const itemName = prop.inventoryName || prop.locationName || prop.name || prop.id;
          if (itemName) addItem(state, 'player', itemName, 1);
          this.applyEffectsList(prop.effects, state);
          this.applyInlineChoiceFields(prop, state);
        }
        break;
      }

      case 'dialogTree': {
        // Every reply on the way to this exit, and the lines it leads to
        // (their effects fire when shown) — continue steps and NPC exits
        // included (dialogPathTo).
        const steps: Array<{ choice?: any; node?: any }> = (connection as any)?.route
          ?? (connection ? this.dialogPathTo(params.dialogTree, connection.targetId === beat.id ? '__self__' : connection.targetId, connection.label) : []);
        for (const step of steps) {
          if (step.choice) {
            this.applyEffectsList(step.choice.effects, state);
            this.applyInlineChoiceFields(step.choice, state);
          } else this.applyEffectsList(step.node?.effects, state);
        }
        break;
      }

      case 'movementChoice':
      case 'multiChoice':
      case 'chooseCharacter':
      case 'freeLayout': {
        // A Free Layout's buttons whose picture was deleted are not on screen.
        const choice = this.choiceFor((beat as any).liveChoices ?? params.choices, beat, choiceIndex, connection);
        if (choice) {
          // Choose Your Character casts before the option's own effects.
          if (beat.type === 'chooseCharacter' && choice.character) {
            this.applyEffectsList([{ type: 'castRole', target: String(params.role || 'player').replace(/^@/, ''), character: choice.character }], state);
          }
          this.applyEffectsList(choice.effects, state);
          this.applyInlineChoiceFields(choice, state);
        }
        break;
      }

      case 'randomTarget': {
        // The drawn branch's effects (e.g. which case variant this run uses).
        const branch = this.randomBranchFor(beat, choiceIndex, connection);
        this.applyEffectsList(branch?.effects, state);
        break;
      }

      // hyperText etc. - no per-choice state effects typically
    }

    return state;
  }

  /**
   * The choice (or prop) a link was made from: same target (a link back to
   * the beat itself is a '__self__' choice) and, when several share it, the
   * same label. Falls back to the link's position.
   */
  private choiceFor(list: any[] | undefined, beat: Beat, index: number, connection?: Connection): any {
    if ((connection as any)?.option) return (connection as any).option;
    if (!Array.isArray(list)) return undefined;
    if (!connection) return list[index];
    // A choice staying on its beat: '__self__', or the beat's own id.
    const onSelf = connection.targetId === beat.id;
    const same = list.filter((c) => {
      const to = c && (c.target ?? c.targetId);
      return to === connection.targetId || (onSelf && to === '__self__');
    });
    const labelled = same.find((c) => [c.text, c.name, c.location, c.locationName, c.id].includes(connection.label));
    return labelled ?? same[0] ?? (connection.targetId === beat.id ? undefined : list[index]);
  }

  /**
   * The way through a dialog tree to one of its exits: each reply taken
   * ({choice}) and each line it leads to ({node}), in order. An exit is a
   * reply's (or continue step's) target, or a line's own NPC exit — the
   * label tells same-target exits apart ('[NPC exit] …' for a line's).
   * Empty when the exit is not in the tree.
   */
  private dialogPathTo(tree: any, target: string, label?: string): Array<{ choice?: any; node?: any }> {
    const npcExit = typeof label === 'string' && label.startsWith('[NPC exit]');
    const find = (node: any, depth: number, strict: boolean): Array<{ choice?: any; node?: any }> | null => {
      if (!node || typeof node !== 'object' || depth > 1000) return null;
      if (node.target === target && (!strict || npcExit)) return [];
      for (const choice of Array.isArray(node.choices) ? node.choices : []) {
        if (!choice) continue;
        if (choice.target === target && (!strict || !label || label === 'Choice' || choice.text === label || choice.label === label)) return [{ choice }];
        if (choice.dialogNode) {
          const rest = find(choice.dialogNode, depth + 1, strict);
          if (rest) return [{ choice }, { node: choice.dialogNode }, ...rest];
        }
      }
      return null;
    };
    return find(tree, 0, true) ?? find(tree, 0, false) ?? [];
  }

  /**
   * Apply inline per-choice counter/variable fields that AI-generated stories
   * emit directly on the choice/prop object:
   *   { counter, counterOperation, counterValue }
   *   { variable, variableOperation, variableValue }
   */
  private applyInlineChoiceFields(fields: any, state: SimulationState): void {
    if (!fields || typeof fields !== 'object') return;

    // Counter field
    if (fields.counter) {
      const name = fields.counter;
      const op = fields.counterOperation || 'add';
      const value = Number(fields.counterValue ?? 1);
      const current = state.counters.get(name) || 0;
      switch (op) {
        case 'set':
          state.counters.set(name, value);
          break;
        case 'subtract':
        case 'decrement':
          state.counters.set(name, current - value);
          break;
        case 'multiply':
          state.counters.set(name, current * value);
          break;
        case 'divide':
          state.counters.set(name, value !== 0 ? current / value : current);
          break;
        case 'change':
        case 'add':
        case 'increment':
        default:
          state.counters.set(name, current + value);
          break;
      }
    }

    // Variable field
    if (fields.variable) {
      const name = fields.variable;
      const op = fields.variableOperation || 'set';
      const value = fields.variableValue;
      if (op === 'set') {
        state.variables.set(name, value);
      }
    }
  }


  /**
   * Apply a list of canonical Effects to simulation state.
   * Handles both canonical format (incrementCounter, setVariable, etc.)
   * and legacy format (type: 'counter' with counter/operation fields).
   */
  private applyEffectsList(effects: any[] | undefined, state: SimulationState): void {
    if (!effects || !Array.isArray(effects)) return;
    // Effects the runtime owns are applied together, in order, in one session.
    const runtimeEffects: any[] = [];

    for (const effect of effects) {
      switch (effect.type) {
        case 'incrementCounter': {
          const name = effect.target || effect.counter;
          if (name) {
            const key = this.counterKey(effect.character, name);
            state.counters.set(key, (state.counters.get(key) || 0) + (Number(effect.value) || 1));
          }
          break;
        }
        case 'setCounter': {
          const name = effect.target || effect.counter;
          if (name) {
            state.counters.set(this.counterKey(effect.character, name), Number(effect.value) || 0);
          }
          break;
        }
        case 'setVariable': {
          const name = effect.target || effect.variable;
          if (name) {
            state.variables.set(name, effect.value ?? true);
          }
          break;
        }
        // The runtime's addInventory / removeInventory effects work on the
        // player's bag (StoryContext.applyEffect), one at a time.
        case 'addInventory': {
          const item = effect.target || effect.item;
          if (item) addItem(state, 'player', item, 1);
          break;
        }
        case 'removeInventory': {
          const item = effect.target || effect.item;
          if (item) removeItem(state, 'player', item, 1);
          break;
        }
        // Legacy format (from pickProp or unmigrated data)
        case 'counter': {
          const name = effect.counter;
          if (name) {
            const current = state.counters.get(name) || 0;
            const amount = effect.value ?? 1;
            switch (effect.operation) {
              case 'set': state.counters.set(name, amount); break;
              case 'subtract': state.counters.set(name, current - amount); break;
              default: state.counters.set(name, current + amount); // 'add' or default
            }
          }
          break;
        }
        case 'variable': {
          const name = effect.variable;
          if (name) {
            state.variables.set(name, effect.value ?? true);
          }
          break;
        }
        // Feelings and everything else the runtime owns (addSentiment,
        // nudgeMood, fireEmotion, setGoalStatus, setCharacterVariant,
        // bookmarkAffectState, addReflection, …): the runtime applies it.
        default:
          runtimeEffects.push(effect);
          break;
      }
    }
    // Deferred to the next runtime session (the next beat's tick or a
    // feelings condition) — applied in order before anything reads them.
    if (runtimeEffects.length > 0) state.pendingRuntime = [...(state.pendingRuntime ?? []), ...runtimeEffects];
  }


  /**
   * Get condition from a condition beat
   */
  private getCondition(beat: Beat): Condition | null {
    const params = beat.getParameters();
    return params.condition || null;
  }

  /**
   * Evaluate a condition against the current state
   */
  private evaluateCondition(condition: Condition, state: SimulationState): boolean {
    const { type, operator } = condition;

    // Get the variable name (handle legacy, AI, and new field names)
    // AI emits { variable: "..." }; legacy uses variableName or left.
    const varName = condition.variableName
      || (condition as any).variable
      || condition.left;
    const compareValue = condition.value ?? condition.right;

    switch (type) {
      case 'counter':
      case 'variable': {
        if (!varName) return false;

        if (type === 'counter') {
          const counter = state.counters.get(this.counterKey((condition as any).character, varName)) ?? 0;
          // As the runtime: text is never equal to or ordered with a number.
          if (isTextForCounter(compareValue)) return operator === '!=';
          return this.compareValues(counter, operator, counterComparisonValue(compareValue));
        }
        return this.compareValues(state.variables.get(varName) ?? 0, operator, compareValue);
      }

      case 'inventory': {
        // The player's bag, as StoryContext.checkCondition — with quantity
        // checks ("at least 3 coins") and "Does Not Have Item".
        const item = String((condition as any).item || condition.value || condition.right || '');
        if (!item) return false;
        const quantity = itemQuantity(state, 'player', item);
        const c: any = condition;
        if ((c.quantityCheck || c.checkType === 'quantity') && c.quantityOperator) {
          const read = (ref: any) => {
            const name = String(ref).replace(/^\$/, '');
            const v = state.variables.get(name) ?? state.counters.get(name) ?? 0;
            return typeof v === 'number' ? v : parseInt(String(v), 10) || 0;
          };
          const left = (c.compareSource || 'inventory') === 'variable' ? read(c.compareVariable || '') : quantity;
          const threshold = typeof c.quantityValue === 'string' ? read(c.quantityValue) : (c.quantityValue ?? 0);
          return this.compareValues(left, c.quantityOperator, threshold);
        }
        const hasItem = quantity > 0;
        if (c.checkType === 'notHas' || operator === 'not' || operator === '!=') return !hasItem;
        return hasItem;
      }

      case 'visitedBeat': {
        const beatId = condition.beatId || condition.value;
        const visited = state.visitedBeats.has(beatId as string);

        if (operator === '==' || operator === 'contains') {
          return visited;
        } else if (operator === '!=' || operator === 'not') {
          return !visited;
        }
        return visited;
      }

      case 'counterCompare': {
        const owner = (condition as any).character;
        const counter1Value = state.counters.get(this.counterKey(owner, condition.counter1 || '')) ?? 0;
        const counter2Value = state.counters.get(this.counterKey(owner, condition.counter2 || '')) ?? 0;
        return this.compareValues(counter1Value, operator, counter2Value);
      }

      // Feelings (sentiment, mood, emotion, goal, variant, …): the runtime
      // evaluates them against the state's feelings snapshot.
      default:
        return this.withRuntime(state, (ctx) => ctx.checkCondition(condition as any), false) ?? false;
    }
  }

  /**
   * Compare two values with an operator
   */
  private compareValues(left: any, operator: string, right: any): boolean {
    const numLeft = typeof left === 'number' ? left : Number(left) || 0;
    const numRight = typeof right === 'number' ? right : Number(right) || 0;

    switch (operator) {
      case '>=': return numLeft >= numRight;
      case '<=': return numLeft <= numRight;
      case '>':  return numLeft > numRight;
      case '<':  return numLeft < numRight;
      // Same alignment as the runtime: "false" equals false, "5" equals 5.
      case '==': { const [l, r] = alignForComparison(left, right); return l == r; }
      case '!=': { const [l, r] = alignForComparison(left, right); return l != r; }
      default:   return false;
    }
  }

  /**
   * Check if a beat is a choice beat (player makes a decision)
   */
  private isChoiceBeat(beat: Beat): boolean {
    // Every link a choice beat offers is a possible playthrough (the
    // player's pick, the AI's classification, a random draw, a timer).
    return isChoiceBeatType(beat.type);
  }

  /**
   * Create a hash of taken choices for cycle detection
   */
  private hashTakenChoices(takenChoicesPerBeat: Map<string, Set<number>>): string {
    const parts: string[] = [];
    const sortedBeatIds = Array.from(takenChoicesPerBeat.keys()).sort();
    for (const beatId of sortedBeatIds) {
      const indices = Array.from(takenChoicesPerBeat.get(beatId)!).sort((a, b) => a - b);
      parts.push(`${beatId}:[${indices.join(',')}]`);
    }
    return parts.join('|');
  }

  /**
   * Check if a beat is terminal (ends the story)
   */
  private isTerminalBeat(beat: Beat): boolean {
    // Explicit ending beat types
    if (['endScreen', 'aiSummary'].includes(beat.type)) {
      return true;
    }

    // Also check if beat has no outgoing connections (implicit ending)
    const connections = this.getConnections(beat);
    return connections.length === 0;
  }

  // ==========================================================================
  // Result Building
  // ==========================================================================

  /**
   * Build a SimulatedPath from current exploration state
   */
  private buildPath(
    steps: SimulatedStep[],
    decisions: SimulatedPath['decisions'],
    finalState: SimulationState,
    endType: PathEndType
  ): SimulatedPath {
    const lastStep = steps[steps.length - 1];
    return {
      steps,
      decisions,
      ...(decisions.some((d) => d.choiceMade === REPLAY_DECISION) ? { viaReplay: true } : {}),
      outcome: {
        beatId: lastStep?.beatId || '',
        beatName: lastStep?.beatName || 'Unknown',
        type: endType,
      },
      finalState: cloneState(finalState),
    };
  }

  /**
   * Build empty result when story has no first beat
   */
  private buildEmptyResult(startTime: number): ConstraintPathResult {
    return {
      outcomes: [],
      totalOutcomes: 0,
      totalConstraintSets: 0,
      reachableBeats: [],
      unreachableBeats: [],
      uniqueEndings: [],
      statesExplored: 0,
      analysisTime: performance.now() - startTime,
    };
  }

  private groupOutcomes(paths: SimulatedPath[]): OutcomeGroup[] {
    // Group paths by outcome (how and where they end): a path cut off at the
    // depth limit must not join a dead end or cycle on the same beat.
    const outcomeMap = new Map<string, SimulatedPath[]>();
    for (const path of paths) {
      const key = `${path.outcome.type}:${path.outcome.beatId}`;
      if (!outcomeMap.has(key)) {
        outcomeMap.set(key, []);
      }
      outcomeMap.get(key)!.push(path);
    }

    // Convert to OutcomeGroups
    const outcomes: OutcomeGroup[] = [];
    for (const groupPaths of outcomeMap.values()) {
      const firstPath = groupPaths[0];

      // Build path variations from decision sequences
      const pathVariations = groupPaths.map(path => {
        const decisions = path.decisions.map(d => ({
          beatName: d.beatName,
          choice: d.choiceMade,
        }));

        // Create summary like "Expert A → Expert B → Expert C"
        const summary = path.decisions
          .map(d => {
            // Shorten choice names for readability
            const choice = d.choiceMade.length > 30
              ? d.choiceMade.substring(0, 27) + '...'
              : d.choiceMade;
            return choice;
          })
          .join(' → ');

        // Include all beat IDs for this path (for highlighting)
        const pathBeatIds = path.steps.map(s => s.beatId);

        // Include full simulated path for preset generation
        return { decisions, summary, pathBeatIds, simulatedPath: path, finalState: path.finalState };
      });

      outcomes.push({
        endingBeatId: firstPath.outcome.beatId,
        endingBeatName: firstPath.outcome.beatName,
        endType: firstPath.outcome.type,
        constraintSets: groupPaths.map(() => createEmptyConstraintSet()),
        pathVariations,
        representativePath: firstPath.steps.map(s => ({
          beatId: s.beatId,
          beatName: s.beatName,
          beatType: s.beatType,
          decisionMade: s.decisionMade,
          conditionResult: s.conditionResult,
        })),
        minPathLength: Math.min(...groupPaths.map(p => p.steps.length)),
        maxPathLength: Math.max(...groupPaths.map(p => p.steps.length)),
      });
    }
    return outcomes;
  }

  /**
   * Build ConstraintPathResult from simulated paths
   */
  private buildResult(paths: SimulatedPath[], startTime: number): ConstraintPathResult {
    // One playthrough at a time: paths that went on through an end screen's
    // Replay are told apart, or each ending counts every run after it too.
    const outcomes = this.groupOutcomes(paths.filter((p) => !p.viaReplay));
    const replayOutcomes = this.groupOutcomes(paths.filter((p) => p.viaReplay));

    // Reachable means on a playthrough (Replay included): a beat that is linked
    // but that no way of playing gets to is unreachable, as in Reachability.
    const played = new Set(paths.flatMap((p) => p.steps.map((step) => step.beatId)));
    const allIds = this.story.getAllBeats().map((b) => b.id);
    const reachableBeats = allIds.filter((id) => played.has(id));
    const unreachableBeats = allIds.filter((id) => !played.has(id));

    // Unique endings
    const uniqueEndings = Array.from(new Set(
      outcomes
        .filter(o => o.endType === 'ending')
        .map(o => o.endingBeatId)
    ));

    return {
      outcomes,
      totalOutcomes: outcomes.length,
      totalConstraintSets: outcomes.reduce((sum, o) => sum + (o.pathVariations?.length ?? 0), 0),
      replayOutcomes,
      searchLimited: this.searchLimited,
      reachableBeats,
      unreachableBeats,
      uniqueEndings,
      statesExplored: paths.length,
      analysisTime: performance.now() - startTime,
    };
  }

  /**
   * Convert simulated paths to PathRequirement format for backward analysis
   */
  private convertPathsToRequirements(paths: SimulatedPath[], targetBeatId: string): PathRequirement[] {
    const requirements: PathRequirement[] = [];

    for (const path of paths) {
      // Find path up to target
      const targetIndex = path.steps.findIndex(s => s.beatId === targetBeatId);
      if (targetIndex === -1) continue;

      const stepsToTarget = path.steps.slice(0, targetIndex + 1);

      // Extract decision points
      const decisionPoints: DecisionPoint[] = path.decisions
        .filter(d => stepsToTarget.some(s => s.beatId === d.beatId))
        .map(d => ({
          beatId: d.beatId,
          beatName: d.beatName,
          beatType: 'choice', // Could be more specific
          requiredChoice: d.choiceMade,
          alternatives: d.alternatives,
        }));

      // Add condition results as decision points
      for (const step of stepsToTarget) {
        if (step.conditionResult !== undefined) {
          decisionPoints.push({
            beatId: step.beatId,
            beatName: step.beatName,
            beatType: 'conditionBeat',
            requiredCondition: step.conditionResult ? 'true' : 'false',
          });
        }
      }

      // Build path beats
      const pathBeats = stepsToTarget.map(s => ({
        beatId: s.beatId,
        beatName: s.beatName,
        beatType: s.beatType,
      }));

      // Build summary
      const choiceSummary = path.decisions
        .filter(d => stepsToTarget.some(s => s.beatId === d.beatId))
        .map(d => `${d.beatName}: "${d.choiceMade}"`)
        .join(', ');

      requirements.push({
        constraints: createEmptyConstraintSet(), // Could extract actual constraints from finalState
        decisionPoints,
        pathBeats,
        pathLength: stepsToTarget.length,
        summary: choiceSummary || 'Direct path',
      });
    }

    // Merge similar paths (same decision sequence)
    return this.mergeRequirements(requirements);
  }

  /**
   * Merge requirements with identical decision sequences
   */
  private mergeRequirements(requirements: PathRequirement[]): PathRequirement[] {
    const uniqueMap = new Map<string, PathRequirement>();

    for (const req of requirements) {
      // Create key from decision sequence
      const key = req.decisionPoints
        .map(d => `${d.beatId}:${d.requiredChoice || d.requiredCondition}`)
        .join('|');

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, req);
      }
    }

    return Array.from(uniqueMap.values());
  }

  /**
   * Find beats that appear in ALL paths
   */
  private findNecessaryBeats(paths: SimulatedPath[]): string[] {
    if (paths.length === 0) return [];

    // Start with all beats from first path
    let necessary = new Set(paths[0].steps.map(s => s.beatId));

    // Intersect with all other paths
    for (let i = 1; i < paths.length; i++) {
      const pathBeats = new Set(paths[i].steps.map(s => s.beatId));
      necessary = new Set([...necessary].filter(id => pathBeats.has(id)));
    }

    return Array.from(necessary);
  }
}
