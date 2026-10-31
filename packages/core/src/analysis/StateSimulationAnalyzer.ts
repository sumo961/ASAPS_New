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

import type { Story } from '../engine/Story';
import { alignForComparison } from '../engine/variableValues';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import { analysisLinks, isChoiceBeatType } from './analysisLinks';
import { StoryContext, PLAYTHROUGH_VARIABLE, type SerializedStoryState } from '../engine/StoryContext';
import {
  ConstraintSet,
  PathStep,
  OutcomeGroup,
  ConstraintPathResult,
  createEmptyConstraintSet,
} from './ConstraintSet';
import type { BackwardAnalysisResult, PathRequirement, DecisionPoint } from './BackwardAnalyzer';
import { isMultiChoiceLike } from '../beats/MultiChoiceBeat';

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
  connectionTaken?: string; // Label of connection taken
  decisionMade?: string;    // For choice beats
  conditionResult?: boolean; // For condition beats
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
    type: 'ending' | 'deadEnd' | 'cycle';
  };
  finalState: SimulationState;
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

/** Take some away; at none the item leaves the bag (as StoryContext.removeFromInventory). */
function removeItem(state: SimulationState, bag: string, item: string, quantity: number): void {
  const left = itemQuantity(state, bag, item) - Math.max(1, quantity);
  if (left <= 0) {
    state.inventory.get(bag)?.delete(item);
    state.itemCounts?.delete(`${bag}\u0001${item}`);
  } else if (left === 1) state.itemCounts?.delete(`${bag}\u0001${item}`);
  else (state.itemCounts ??= new Map()).set(`${bag}\u0001${item}`, left);
}

/**
 * Create a hash of the simulation state for cycle detection
 * Only includes variables/counters/inventory, not visitedBeats (which changes every step)
 */
function hashState(state: SimulationState): string {
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

/** How far a running path analysis has got (analyzeAsync progress). */
export interface SimulationProgress {
  /** Simulation steps taken so far. */
  expansions: number;
  /** Distinct beats the simulation has reached so far. */
  beatsReached: number;
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
  public analyzeBackward(targetBeatId: string): BackwardAnalysisResult {
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

    const allPaths = this.exploreAllPaths(firstBeatId, this.initialStates());

    // Filter paths that visit the target beat
    const pathsToTarget = allPaths.filter(path =>
      path.steps.some(step => step.beatId === targetBeatId)
    );

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
    // Past the cap: one branch per beat nobody has reached yet, and one per
    // (beat, variables/counters) combination not seen before — a choice's
    // variable can decide a gate much later (Late Light: "declined" at the
    // visit question opens a scene two beats on), and dropping it lost the
    // scene. That second allowance is itself bounded.
    const admittedNew = new Set<string>();
    const seenBeatStates = new Set<string>();
    const cap = this.config.maxFrontier ?? 4000;
    const enqueue = (f: (typeof stack)[number]) => {
      if (stack.length < cap) { stack.push(f); return; }
      if (!seenBeats.has(f.beatId) && !admittedNew.has(f.beatId)) { admittedNew.add(f.beatId); stack.push(f); return; }
      if (seenBeatStates.size < cap * 4) {
        const k = `${f.beatId}|${hashState(f.state)}`;
        if (!seenBeatStates.has(k)) { seenBeatStates.add(k); stack.push(f); return; }
      }
      this.truncated = true;
    };

    while (stack.length > 0 && paths.length < this.config.maxPaths) {
      if (++expansions > (this.config.maxExpansions ?? 300000)) { this.truncated = true; break; }
      if (expansions % 250 === 0) yield { expansions, beatsReached: seenBeats.size };
      // Use BFS (shift) instead of DFS (pop) to ensure fair coverage
      // across all branches at each level. DFS can exhaust the maxPaths
      // budget on the first few branches of a wide choice beat,
      // leaving later branches unexplored.
      const frame = stack.shift()!;

      // Check depth limit
      if (frame.path.length >= this.config.maxDepth) {
        paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'deadEnd'));
        continue;
      }

      // Get current beat
      const beat = this.getBeat(frame.beatId);
      if (!beat) {
        continue; // Invalid beat, skip this branch
      }
      seenBeats.add(beat.id);

      // Check for loop: same beat + same state + same taken choices = no progress possible
      // We include takenChoicesPerBeat in the key because different choices taken
      // means different paths are still available (e.g., DABC vs ABCD)
      const takenChoicesKey = this.hashTakenChoices(frame.takenChoicesPerBeat);
      const stateKey = `${beat.id}|${hashState(frame.state)}|${takenChoicesKey}`;
      if (frame.visitedStates.has(stateKey)) {
        // This is a non-productive loop (same beat + same state + same choices = no progress)
        paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'cycle'));
        continue;
      }

      // Requirements are checked before anything else (Beat.execute): unmet,
      // the story jumps to the fallback without showing this beat.
      const redirect = this.requirementRedirect(beat, frame.state);
      if (redirect) {
        enqueue({
          beatId: redirect,
          state: frame.state,
          path: frame.path,
          decisions: frame.decisions,
          visitedStates: frame.visitedStates,
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
      };
      const newPath = [...frame.path, step];

      // Update visited states for loop detection
      const newVisitedStates = new Set(frame.visitedStates);
      newVisitedStates.add(stateKey);

      // Check for terminal beat
      if (this.isTerminalBeat(beat)) {
        paths.push(this.buildPath(newPath, frame.decisions, newState, 'ending'));
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
      } else if (this.isChoiceBeat(beat) && connections.length > 1) {
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
          paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
          continue;
        }

        // Find options we haven't taken yet on THIS path
        const availableOptions = offered.filter((i) => !takenHere.has(i));

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
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'cycle'));
            continue;
          }

          // Check if we've already re-explored condition options with this state
          const stateHash = hashState(newState);
          const reexploreKey = `reexplore:${beat.id}:${stateHash}`;
          if (frame.visitedStates.has(reexploreKey)) {
            // Already re-explored with this exact state: a cycle
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'cycle'));
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
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
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
    let connections = analysisLinks(beat).filter((c) => c.label !== 'requires-fallback');
    const routes = beat.type === 'dialogTree' ? this.dialogRoutes(beat) : [];
    if (routes.length > 0) {
      // Each way through the tree is its own route: two replies whose lines
      // end at the same exit set different things (the beat's own list
      // merges them). The tree's links are all in the routes.
      const own = new Set(beat.getConnections().map((c) => `${c.targetId}\u0000${c.label ?? ''}`));
      connections = [...routes, ...connections.filter((c) => !own.has(`${c.targetId}\u0000${c.label ?? ''}`))];
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

    // Deduplicate connections by targetId
    // Keep first connection for each unique target (preserves label)
    const seenTargets = new Set<string>();
    const uniqueConnections: Connection[] = [];
    for (const conn of connections) {
      if (!seenTargets.has(conn.targetId)) {
        seenTargets.add(conn.targetId);
        uniqueConnections.push(conn);
      }
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
    const walk = (node: any, route: Array<{ choice?: any; node?: any }>, depth: number): void => {
      if (!node || typeof node !== 'object' || depth > 20 || out.length >= 200) return;
      // A line with its own exit ends the conversation there (its replies are never shown).
      if (typeof node.target === 'string' && node.target) { exit(node.target, `[NPC exit] ${node.speaker || 'NPC'}`, route); return; }
      for (const choice of Array.isArray(node.choices) ? node.choices : []) {
        if (!choice) continue;
        const taken = [...route, { choice }];
        if (typeof choice.target === 'string' && choice.target) exit(choice.target, choice.text || 'Choice', taken);
        else if (choice.dialogNode) walk(choice.dialogNode, [...taken, { node: choice.dialogNode }], depth + 1);
      }
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
      }
    }
    return conds.every((c) => !c || this.evaluateCondition(c, state));
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
    const target = connection.targetId === beat.id ? '__self__' : connection.targetId;
    const same = list.filter((c) => c && (c.target ?? c.targetId) === target);
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
      if (!node || typeof node !== 'object' || depth > 20) return null;
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

        const currentValue = type === 'counter'
          ? (state.counters.get(this.counterKey((condition as any).character, varName)) ?? 0)
          : (state.variables.get(varName) ?? 0);

        return this.compareValues(currentValue, operator, compareValue);
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
    endType: 'ending' | 'deadEnd' | 'cycle'
  ): SimulatedPath {
    const lastStep = steps[steps.length - 1];
    return {
      steps,
      decisions,
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

  /**
   * Build ConstraintPathResult from simulated paths
   */
  private buildResult(paths: SimulatedPath[], startTime: number): ConstraintPathResult {
    // Group paths by outcome (ending beat)
    const outcomeMap = new Map<string, SimulatedPath[]>();
    for (const path of paths) {
      const key = path.outcome.beatId;
      if (!outcomeMap.has(key)) {
        outcomeMap.set(key, []);
      }
      outcomeMap.get(key)!.push(path);
    }

    // Convert to OutcomeGroups
    const outcomes: OutcomeGroup[] = [];
    for (const [beatId, groupPaths] of outcomeMap) {
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
        endingBeatId: beatId,
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

    // Calculate reachability using graph traversal (not just what paths explored)
    // This ensures we don't report false "unreachable" beats
    const { reachableBeats, unreachableBeats } = this.calculateReachability();

    // Unique endings
    const uniqueEndings = Array.from(new Set(
      outcomes
        .filter(o => o.endType === 'ending')
        .map(o => o.endingBeatId)
    ));

    return {
      outcomes,
      totalOutcomes: outcomes.length,
      totalConstraintSets: paths.length,
      reachableBeats,
      unreachableBeats,
      uniqueEndings,
      statesExplored: paths.length,
      analysisTime: performance.now() - startTime,
    };
  }

  /**
   * Calculate reachability using simple graph traversal
   * This is more accurate than using path simulation results because
   * the simulation may not explore all branches (e.g., failing conditions)
   */
  private calculateReachability(): { reachableBeats: string[]; unreachableBeats: string[] } {
    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      const allBeats = this.story.getAllBeats();
      return {
        reachableBeats: [],
        unreachableBeats: allBeats.map(b => b.id),
      };
    }

    const reachable = new Set<string>();
    const queue: string[] = [firstBeatId];

    while (queue.length > 0) {
      const beatId = queue.shift()!;
      if (reachable.has(beatId)) continue;

      const beat = this.getBeat(beatId);
      if (!beat) continue;

      reachable.add(beatId);

      // Add all connected beats (regardless of conditions - they're structurally reachable)
      const connections = this.getConnections(beat);
      for (const conn of connections) {
        if (!reachable.has(conn.targetId)) {
          queue.push(conn.targetId);
        }
      }
    }

    // Get all beats in story
    const allBeats = this.story.getAllBeats();
    const allBeatIds = new Set(allBeats.map(b => b.id));

    // Unreachable = all - reachable
    const unreachableBeats = Array.from(allBeatIds).filter(id => !reachable.has(id));

    return {
      reachableBeats: Array.from(reachable),
      unreachableBeats,
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
