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
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import {
  ConstraintSet,
  PathStep,
  OutcomeGroup,
  ConstraintPathResult,
  createEmptyConstraintSet,
} from './ConstraintSet';
import type { BackwardAnalysisResult, PathRequirement, DecisionPoint } from './BackwardAnalyzer';

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
  visitedBeats: Set<string>;
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
  };
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
    const sortedItems = Array.from(items).sort();
    parts.push(`i:${char}=[${sortedItems.join(',')}]`);
  }

  return parts.join('|');
}

// ============================================================================
// StateSimulationAnalyzer
// ============================================================================

export class StateSimulationAnalyzer {
  private story: Story;
  private config: Required<SimulationAnalysisConfig>;

  // Cached beat lookups
  private beatCache: Map<string, Beat | null> = new Map();

  constructor(story: Story, config: SimulationAnalysisConfig = {}) {
    this.story = story;
    this.config = {
      maxDepth: config.maxDepth ?? 200,
      maxPaths: config.maxPaths ?? 1000,
      maxBeatRevisits: config.maxBeatRevisits ?? 1,
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

    const paths = this.exploreAllPaths(firstBeatId, createInitialState());

    return this.buildResult(paths, startTime);
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

    const allPaths = this.exploreAllPaths(firstBeatId, createInitialState());

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

      // Also include beats with no outgoing connections (implicit endings)
      const connections = beat.getConnections();
      const hasDefaultTarget = beat.defaultTarget && beat.defaultTarget.trim() !== '';
      if (connections.length === 0 && !hasDefaultTarget) {
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
  private exploreAllPaths(startBeatId: string, initialState: SimulationState): SimulatedPath[] {
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

    // Initialize with start beat
    stack.push({
      beatId: startBeatId,
      state: cloneState(initialState),
      path: [],
      decisions: [],
      visitedStates: new Set(),
      takenChoicesPerBeat: new Map(),
    });

    const startBeat = this.getBeat(startBeatId);
    console.log(`[PATH] Starting exploration from "${startBeatId}", beat found: ${!!startBeat}, name: ${startBeat?.name || 'N/A'}, maxPaths=${this.config.maxPaths}`);
    if (startBeat) {
      const conns = this.getConnections(startBeat);
      console.log(`[PATH] First beat has ${conns.length} connections:`, conns.map(c => c.targetId));
    }
    while (stack.length > 0 && paths.length < this.config.maxPaths) {
      const frame = stack.pop()!;

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

      // Check for loop: same beat + same state + same taken choices = no progress possible
      // We include takenChoicesPerBeat in the key because different choices taken
      // means different paths are still available (e.g., DABC vs ABCD)
      const takenChoicesKey = this.hashTakenChoices(frame.takenChoicesPerBeat);
      const stateKey = `${beat.id}|${hashState(frame.state)}|${takenChoicesKey}`;
      if (frame.visitedStates.has(stateKey)) {
        // This is a non-productive loop (same beat + same state + same choices = no progress)
        console.log(`[PATH] CYCLE detected at "${beat.name}" (${beat.id}), pathLen: ${frame.path.length}`);
        paths.push(this.buildPath(frame.path, frame.decisions, frame.state, 'cycle'));
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
        const condition = this.getCondition(beat);
        const result = condition ? this.evaluateCondition(condition, newState) : true;

        // Update the last step with condition result
        newPath[newPath.length - 1].conditionResult = result;

        // Find the appropriate connection based on condition result (case-insensitive)
        const targetConnection = result
          ? connections.find(c => c.label?.toLowerCase() === 'true' || c.label?.toLowerCase() === 'yes')
          : connections.find(c => c.label?.toLowerCase() === 'false' || c.label?.toLowerCase() === 'no');

        const targetId = targetConnection?.targetId || connections[0].targetId;

        stack.push({
          beatId: targetId,
          state: newState,
          path: newPath,
          decisions: frame.decisions,
          visitedStates: newVisitedStates,
          takenChoicesPerBeat: frame.takenChoicesPerBeat,
        });
      } else if (this.isChoiceBeat(beat) && connections.length > 1) {
        // CHOICE BEAT: Create branches only for options NOT YET TAKEN at this beat
        // This prevents exponential explosion in hub-and-spoke patterns

        const takenHere = frame.takenChoicesPerBeat.get(beat.id) ?? new Set<number>();

        // DEBUG: Log choice beat branching
        console.log(`[PATH] Choice beat "${beat.name}" (${beat.id}): ${connections.length} connections, taken: [${Array.from(takenHere).join(',')}], pathLen: ${frame.path.length}`);

        // Find options we haven't taken yet on THIS path
        const availableOptions: number[] = [];
        for (let i = 0; i < connections.length; i++) {
          if (!takenHere.has(i)) {
            availableOptions.push(i);
          }
        }

        // If all options have been taken at this beat on this path,
        // we need to check if any option NOW leads somewhere different
        // (e.g., a condition that was false is now true due to state changes).
        //
        // KEY INSIGHT: Only retry options that lead to CONDITION BEATS.
        // Options that lead to regular beats (like visiting an expert) don't
        // need retrying - they always do the same thing. But condition-gated
        // paths might now succeed if the required variables have been set.
        if (availableOptions.length === 0) {
          // Find options that lead to condition beats - only these might behave differently
          const conditionGatedOptions: number[] = [];
          for (let i = 0; i < connections.length; i++) {
            const targetBeat = this.getBeat(connections[i].targetId);
            if (targetBeat && targetBeat.type === 'conditionBeat') {
              conditionGatedOptions.push(i);
            }
          }

          // If no condition-gated options, this is a dead end
          if (conditionGatedOptions.length === 0) {
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
            continue;
          }

          // Check if we've already re-explored condition options with this state
          const stateHash = hashState(newState);
          const reexploreKey = `reexplore:${beat.id}:${stateHash}`;
          if (frame.visitedStates.has(reexploreKey)) {
            // Already re-explored with this exact state - dead end
            paths.push(this.buildPath(newPath, frame.decisions, newState, 'deadEnd'));
            continue;
          }
          newVisitedStates.add(reexploreKey);

          // Only retry the condition-gated options (in reverse for stack ordering)
          for (let idx = conditionGatedOptions.length - 1; idx >= 0; idx--) {
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
              alternatives: connections
                .filter((_, cidx) => cidx !== i)
                .map(c => c.label || c.targetId),
            }];

            stack.push({
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

        // Create branches for available options (in reverse for stack ordering)
        console.log(`[PATH] Creating ${availableOptions.length} branches for available options: [${availableOptions.join(',')}]`);
        for (let idx = availableOptions.length - 1; idx >= 0; idx--) {
          const i = availableOptions[idx];
          const conn = connections[i];

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
            alternatives: connections
              .filter((_, cidx) => cidx !== i)
              .map(c => c.label || c.targetId),
          }];

          stack.push({
            beatId: conn.targetId,
            state: newState,
            path: branchPath,
            decisions: branchDecisions,
            visitedStates: newVisitedStates,
            takenChoicesPerBeat: newTakenChoicesPerBeat,
          });
        }
      } else {
        // Automatic beat - follow first/only connection
        stack.push({
          beatId: connections[0].targetId,
          state: newState,
          path: newPath,
          decisions: frame.decisions,
          visitedStates: newVisitedStates,
          takenChoicesPerBeat: frame.takenChoicesPerBeat,
        });
      }
    }

    console.log(`[PATH] Exploration complete: ${paths.length} paths found, stack empty: ${stack.length === 0}`);
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
   */
  private getConnections(beat: Beat): Connection[] {
    const connections = beat.getConnections();

    // Also check for defaultTarget
    if (beat.defaultTarget && !connections.some(c => c.targetId === beat.defaultTarget)) {
      connections.push({ targetId: beat.defaultTarget });
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
   * Apply beat effects to the simulation state
   */
  private applyBeatEffects(beat: Beat, state: SimulationState): SimulationState {
    const newState = cloneState(state);
    newState.visitedBeats.add(beat.id);

    const params = beat.getParameters();

    switch (beat.type) {
      case 'setVariable':
      case 'variable': {
        const varType = params.type || 'variable';
        const name = params.name || params.variableName;
        const value = params.value;
        const operation = params.operation || 'set';

        if (!name) break;

        if (varType === 'counter') {
          const current = newState.counters.get(name) || 0;
          if (operation === 'set') {
            newState.counters.set(name, Number(value) || 0);
          } else if (operation === 'change' || operation === 'add' || operation === 'increment') {
            newState.counters.set(name, current + (Number(value) || 1));
          } else if (operation === 'decrement' || operation === 'subtract') {
            newState.counters.set(name, current - (Number(value) || 1));
          }
        } else {
          if (operation === 'set') {
            newState.variables.set(name, value);
          }
        }
        break;
      }

      case 'addRemoveInventory': {
        const character = params.character || 'player';
        const item = params.item || params.prop;
        const operation = params.operation || 'add';
        const quantity = params.quantity || 1;

        if (!item) break;

        if (!newState.inventory.has(character)) {
          newState.inventory.set(character, new Set());
        }

        const inv = newState.inventory.get(character)!;
        if (operation === 'add') {
          // For quantities > 1, we could track count, but for simplicity just add the item
          inv.add(item);
        } else if (operation === 'remove') {
          inv.delete(item);
        }
        break;
      }

      case 'setTimer': {
        // Timers don't affect path analysis state
        break;
      }

      // Other beat types don't modify state
    }

    return newState;
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

    // Get the variable name (handle legacy and new field names)
    const varName = condition.variableName || condition.left;
    const compareValue = condition.value ?? condition.right;

    switch (type) {
      case 'counter':
      case 'variable': {
        if (!varName) return false;

        const currentValue = type === 'counter'
          ? (state.counters.get(varName) ?? 0)
          : (state.variables.get(varName) ?? 0);

        return this.compareValues(currentValue, operator, compareValue);
      }

      case 'inventory': {
        const character = condition.variableName || 'player';
        const item = condition.item || condition.value;
        const inv = state.inventory.get(character);
        const hasItem = inv?.has(item as string) ?? false;

        if (operator === 'contains' || operator === '==') {
          return hasItem;
        } else if (operator === 'not' || operator === '!=') {
          return !hasItem;
        }
        return false;
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
        const counter1Value = state.counters.get(condition.counter1 || '') ?? 0;
        const counter2Value = state.counters.get(condition.counter2 || '') ?? 0;
        return this.compareValues(counter1Value, operator, counter2Value);
      }

      default:
        return false;
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
      case '==': return left == right; // eslint-disable-line eqeqeq
      case '!=': return left != right; // eslint-disable-line eqeqeq
      default:   return false;
    }
  }

  /**
   * Check if a beat is a choice beat (player makes a decision)
   */
  private isChoiceBeat(beat: Beat): boolean {
    return [
      'dialogTree',
      'movementChoice',
      'pickProp',
      'hyperText',
      'aiDialogTree',
    ].includes(beat.type);
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
