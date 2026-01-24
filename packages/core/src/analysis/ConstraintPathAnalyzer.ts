/**
 * ConstraintPathAnalyzer - Constraint-based path analysis
 *
 * Unlike the old PathAnalyzer that enumerated all paths (exponential explosion),
 * this analyzer works with constraint sets that represent classes of execution.
 * Paths with the same outcome and compatible constraints are merged.
 *
 * Key features:
 * 1. Groups paths by outcome (ending beat)
 * 2. Tracks constraint sets, not individual paths
 * 3. Merges compatible paths to reduce explosion
 * 4. Provides meaningful analysis (~100 outcomes instead of 10,000 paths)
 */

import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import {
  ConstraintSet,
  OutcomeGroup,
  PathStep,
  ConstraintPathResult,
  createEmptyConstraintSet,
  cloneConstraintSet,
  addConditionConstraint,
  constraintSetToStrings,
  hashConstraintSet,
  constraintSetsCompatible,
  mergeConstraintSets,
} from './ConstraintSet';

// Re-export types for use by other modules
export type { ConstraintPathResult };

/**
 * Configuration for constraint-based analysis
 */
export interface ConstraintAnalysisConfig {
  maxDepth?: number;           // Maximum path depth (default: 100)
  maxOutcomes?: number;        // Maximum outcomes to track (default: 1000)
  maxConstraintSets?: number;  // Max constraint sets per outcome (default: 50)
  maxBeatRevisits?: number;    // Max times a beat can be revisited (default: 3)
  trackInventory?: boolean;    // Track inventory changes (default: true)
}

/**
 * Internal state during exploration
 */
interface ExplorationState {
  constraints: ConstraintSet;
  path: PathStep[];
  visitCounts: Map<string, number>;  // Beat ID -> visit count
  depth: number;
}

/**
 * ConstraintPathAnalyzer
 */
export class ConstraintPathAnalyzer {
  private story: Story;
  private config: Required<ConstraintAnalysisConfig>;

  // Results
  private outcomeGroups: Map<string, OutcomeGroup>;  // endingBeatId -> OutcomeGroup
  private reachableBeats: Set<string>;
  private statesExplored: number;

  // Memoization: constraint hash at beat -> already explored
  private exploredStates: Set<string>;

  constructor(story: Story, config: ConstraintAnalysisConfig = {}) {
    this.story = story;
    this.config = {
      maxDepth: config.maxDepth ?? 100,
      maxOutcomes: config.maxOutcomes ?? 1000,
      maxConstraintSets: config.maxConstraintSets ?? 50,
      maxBeatRevisits: config.maxBeatRevisits ?? 3,
      trackInventory: config.trackInventory ?? true,
    };
    this.outcomeGroups = new Map();
    this.reachableBeats = new Set();
    this.statesExplored = 0;
    this.exploredStates = new Set();
  }

  /**
   * Analyze all feasible paths through the story
   */
  public analyze(): ConstraintPathResult {
    const startTime = performance.now();

    // Reset state
    this.outcomeGroups.clear();
    this.reachableBeats.clear();
    this.statesExplored = 0;
    this.exploredStates.clear();

    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      return this.buildResult(startTime);
    }

    const firstBeat = this.story.getBeat(firstBeatId);
    if (!firstBeat) {
      return this.buildResult(startTime);
    }

    // Start exploration
    const initialState: ExplorationState = {
      constraints: createEmptyConstraintSet(),
      path: [],
      visitCounts: new Map(),
      depth: 0,
    };

    this.explore(firstBeat, initialState);

    return this.buildResult(startTime);
  }

  /**
   * Main exploration function
   */
  private explore(beat: Beat, state: ExplorationState): void {
    this.statesExplored++;

    // Check depth limit
    if (state.depth >= this.config.maxDepth) {
      this.recordOutcome(beat, state, 'deadEnd');
      return;
    }

    // Check beat revisit limit
    const visitCount = state.visitCounts.get(beat.id) || 0;
    if (visitCount >= this.config.maxBeatRevisits) {
      this.recordOutcome(beat, state, 'cycle');
      return;
    }

    // Check if we've already explored this state (beat + constraints + PLAYER CHOICES)
    // Only include player choices (decisionMade), not condition results (conditionResult)
    // Condition results are determined by game state, not player decisions
    const choiceHistory = state.path
      .filter(step => step.decisionMade) // Only player choices, not condition results
      .map(step => `${step.beatId}:${step.decisionMade}`)
      .join('|');
    const stateHash = `${beat.id}#${hashConstraintSet(state.constraints)}#${choiceHistory}`;
    if (this.exploredStates.has(stateHash)) {
      return;  // Already explored this path class
    }
    this.exploredStates.add(stateHash);

    // Mark beat as reachable
    this.reachableBeats.add(beat.id);

    // Add to path
    const step: PathStep = {
      beatId: beat.id,
      beatName: beat.name,
      beatType: beat.type,
    };
    const newPath = [...state.path, step];

    // Update visit count
    const newVisitCounts = new Map(state.visitCounts);
    newVisitCounts.set(beat.id, visitCount + 1);

    // Check if this is an ending beat (endScreen or aiSummary)
    if (beat.type === 'endScreen' || beat.type === 'aiSummary') {
      this.recordOutcome(beat, {
        ...state,
        path: newPath,
        visitCounts: newVisitCounts,
      }, 'ending');
      return;
    }

    // Apply beat effects to constraints
    const constraintsAfterBeat = this.applyBeatEffects(beat, state.constraints);
    if (constraintsAfterBeat === null) {
      return;  // Impossible path
    }

    // Get connections and explore
    const connections = this.getConnections(beat);

    if (connections.length === 0) {
      // Dead end
      this.recordOutcome(beat, {
        ...state,
        path: newPath,
        constraints: constraintsAfterBeat,
        visitCounts: newVisitCounts,
      }, 'deadEnd');
      return;
    }

    // Handle based on beat type
    const beatType = beat.type;

    if (beatType === 'conditionBeat') {
      this.exploreConditionBeat(beat, connections, {
        ...state,
        path: newPath,
        constraints: constraintsAfterBeat,
        visitCounts: newVisitCounts,
        depth: state.depth + 1,
      });
    } else if (this.isChoiceBeat(beatType)) {
      this.exploreChoiceBeat(beat, connections, {
        ...state,
        path: newPath,
        constraints: constraintsAfterBeat,
        visitCounts: newVisitCounts,
        depth: state.depth + 1,
      });
    } else {
      // Automatic beat - follow all connections (usually just one)
      this.exploreAutomaticBeat(beat, connections, {
        ...state,
        path: newPath,
        constraints: constraintsAfterBeat,
        visitCounts: newVisitCounts,
        depth: state.depth + 1,
      });
    }
  }

  /**
   * Handle condition beat - branch based on constraint feasibility
   */
  private exploreConditionBeat(beat: Beat, connections: Connection[], state: ExplorationState): void {
    const params = beat.getParameters();
    const condition = this.extractCondition(params);

    if (!condition) {
      // No condition - follow default or first connection
      this.exploreAutomaticBeat(beat, connections, state);
      return;
    }

    // Find true/false targets
    const trueTarget = params.trueTarget || connections.find(c => c.label === 'true')?.targetId;
    const falseTarget = params.falseTarget || connections.find(c => c.label === 'false')?.targetId;

    // Try TRUE branch
    if (trueTarget) {
      const constraintsIfTrue = addConditionConstraint(state.constraints, condition, true);
      if (constraintsIfTrue !== null) {
        const targetBeat = this.story.getBeat(trueTarget);
        if (targetBeat) {
          // Create a new path with the condition result recorded (don't mutate shared path)
          const newPath = state.path.length > 0
            ? [...state.path.slice(0, -1), { ...state.path[state.path.length - 1], conditionResult: true }]
            : state.path;

          this.explore(targetBeat, {
            ...state,
            path: newPath,
            constraints: constraintsIfTrue,
          });
        }
      }
    }

    // Try FALSE branch
    if (falseTarget) {
      const constraintsIfFalse = addConditionConstraint(state.constraints, condition, false);
      if (constraintsIfFalse !== null) {
        const targetBeat = this.story.getBeat(falseTarget);
        if (targetBeat) {
          // Create a new path with the condition result recorded (don't mutate shared path)
          const newPath = state.path.length > 0
            ? [...state.path.slice(0, -1), { ...state.path[state.path.length - 1], conditionResult: false }]
            : state.path;

          this.explore(targetBeat, {
            ...state,
            path: newPath,
            constraints: constraintsIfFalse,
          });
        }
      }
    }
  }

  /**
   * Handle choice beat (dialogTree, movementChoice, etc.)
   */
  private exploreChoiceBeat(beat: Beat, connections: Connection[], state: ExplorationState): void {
    const params = beat.getParameters();
    const choices = params.choices || params.options || [];

    // If no choices defined, treat as automatic
    if (choices.length === 0 && connections.length > 0) {
      this.exploreAutomaticBeat(beat, connections, state);
      return;
    }

    // Explore each choice
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const targetId = choice.targetId || choice.target || connections[i]?.targetId;

      if (!targetId) continue;

      // Check if choice has conditions
      let constraintsForChoice = state.constraints;
      if (choice.conditions && Array.isArray(choice.conditions)) {
        let feasible = true;
        for (const cond of choice.conditions) {
          const result = addConditionConstraint(constraintsForChoice, cond, true);
          if (result === null) {
            feasible = false;
            break;
          }
          constraintsForChoice = result;
        }
        if (!feasible) continue;  // This choice is impossible
      }

      const targetBeat = this.story.getBeat(targetId);
      if (targetBeat) {
        // Create a new path with the decision recorded (don't mutate shared path)
        const decisionText = choice.text || choice.label || `Choice ${i + 1}`;
        const newPath = state.path.length > 0
          ? [...state.path.slice(0, -1), { ...state.path[state.path.length - 1], decisionMade: decisionText }]
          : state.path;

        this.explore(targetBeat, {
          ...state,
          path: newPath,
          constraints: constraintsForChoice,
        });
      }
    }

    // Also check defaultTarget
    if (params.defaultTarget) {
      const defaultBeat = this.story.getBeat(params.defaultTarget);
      if (defaultBeat) {
        this.explore(defaultBeat, state);
      }
    }
  }

  /**
   * Handle automatic beat (infoText, durScreen, etc.)
   */
  private exploreAutomaticBeat(beat: Beat, connections: Connection[], state: ExplorationState): void {
    // Check for defaultTarget first
    const params = beat.getParameters();
    if (params.defaultTarget) {
      const targetBeat = this.story.getBeat(params.defaultTarget);
      if (targetBeat) {
        this.explore(targetBeat, state);
        return;
      }
    }

    // Follow connections
    for (const conn of connections) {
      // Check connection condition
      if (conn.condition) {
        const constraintsWithCond = addConditionConstraint(state.constraints, conn.condition, true);
        if (constraintsWithCond === null) continue;  // This connection is impossible

        const targetBeat = this.story.getBeat(conn.targetId);
        if (targetBeat) {
          this.explore(targetBeat, {
            ...state,
            constraints: constraintsWithCond,
          });
        }
      } else {
        const targetBeat = this.story.getBeat(conn.targetId);
        if (targetBeat) {
          this.explore(targetBeat, state);
        }
      }
    }
  }

  /**
   * Record an outcome (reached ending, dead end, or cycle)
   */
  private recordOutcome(beat: Beat, state: ExplorationState, endType: 'ending' | 'deadEnd' | 'cycle'): void {
    const outcomeKey = `${endType}:${beat.id}`;

    let group = this.outcomeGroups.get(outcomeKey);
    if (!group) {
      group = {
        endingBeatId: beat.id,
        endingBeatName: beat.name,
        endType,
        constraintSets: [],
        representativePath: state.path,
        minPathLength: state.path.length,
        maxPathLength: state.path.length,
      };
      this.outcomeGroups.set(outcomeKey, group);
    }

    // Try to merge with existing constraint set or add new one
    let merged = false;
    for (let i = 0; i < group.constraintSets.length; i++) {
      const existing = group.constraintSets[i];
      if (constraintSetsCompatible(existing, state.constraints)) {
        const mergedSet = mergeConstraintSets(existing, state.constraints);
        if (mergedSet) {
          group.constraintSets[i] = mergedSet;
          merged = true;
          break;
        }
      }
    }

    if (!merged && group.constraintSets.length < this.config.maxConstraintSets) {
      group.constraintSets.push(cloneConstraintSet(state.constraints));
    }

    // Update path length stats
    group.minPathLength = Math.min(group.minPathLength, state.path.length);
    group.maxPathLength = Math.max(group.maxPathLength, state.path.length);

    // Keep the shortest path as representative
    if (state.path.length < group.representativePath.length) {
      group.representativePath = [...state.path];
    }
  }

  /**
   * Apply beat effects to constraint set
   */
  private applyBeatEffects(beat: Beat, constraints: ConstraintSet): ConstraintSet | null {
    const result = cloneConstraintSet(constraints);
    const params = beat.getParameters();

    // Handle setVariable beat
    if (beat.type === 'setVariable') {
      const varName = params.variableName || params.variable;
      const value = params.value;
      const operation = params.operation || 'set';

      if (varName && value !== undefined) {
        if (operation === 'set') {
          const numValue = typeof value === 'number' ? value : parseFloat(value);
          if (!isNaN(numValue)) {
            result.variables.set(varName, { type: 'numeric', exact: numValue });
          } else {
            result.variables.set(varName, { type: 'value', equals: value });
          }
        }
        // For increment/decrement, we'd need range tracking - simplified for now
      }
    }

    // Handle addRemoveInventory
    if (beat.type === 'addRemoveInventory') {
      const character = params.character || 'player';
      const item = params.item;
      const action = params.action || 'add';

      if (item) {
        if (!result.inventory.has(character)) {
          result.inventory.set(character, { has: new Set(), notHas: new Set() });
        }
        const inv = result.inventory.get(character)!;

        if (action === 'add') {
          inv.notHas.delete(item);
          inv.has.add(item);
        } else if (action === 'remove') {
          inv.has.delete(item);
          inv.notHas.add(item);
        }
      }
    }

    // Track visited beat (for visitedBeat conditions)
    result.requiredVisits.add(beat.id);

    return result;
  }

  /**
   * Get connections from a beat
   */
  private getConnections(beat: Beat): Connection[] {
    // Use the Beat's built-in getConnections() method which handles
    // all beat types correctly (including derived connections from choices)
    const connections = beat.getConnections();

    // Also check for defaultTarget (property on Beat class) if not covered by connections
    // Note: beat.defaultTarget is a public property, not in parameters
    if (beat.defaultTarget && !connections.some(c => c.targetId === beat.defaultTarget)) {
      connections.push({ targetId: beat.defaultTarget });
    }

    // For condition beats, ensure true/false targets are included
    if (beat.type === 'conditionBeat') {
      const params = beat.getParameters();
      if (params.trueTarget && !connections.some(c => c.targetId === params.trueTarget)) {
        connections.push({ targetId: params.trueTarget, label: 'true' });
      }
      if (params.falseTarget && !connections.some(c => c.targetId === params.falseTarget)) {
        connections.push({ targetId: params.falseTarget, label: 'false' });
      }
    }

    return connections;
  }

  /**
   * Extract condition from beat parameters
   */
  private extractCondition(params: any): Condition | null {
    // Check for explicit condition object
    if (params.condition) return params.condition;

    // Build condition from individual fields
    if (params.variableName || params.variable || params.left) {
      return {
        type: params.conditionType || 'variable',
        operator: params.operator || '==',
        variableName: params.variableName || params.variable || params.left,
        value: params.value ?? params.right ?? params.val,
      };
    }

    // Counter compare
    if (params.counter1 && params.counter2) {
      return {
        type: 'counterCompare',
        operator: params.operator || '==',
        counter1: params.counter1,
        counter2: params.counter2,
      };
    }

    // Visited beat
    if (params.beatId) {
      return {
        type: 'visitedBeat',
        operator: params.operator || '==',
        beatId: params.beatId,
      };
    }

    return null;
  }

  /**
   * Check if beat type is a choice beat
   */
  private isChoiceBeat(beatType: string): boolean {
    return [
      'dialogTree',
      'movementChoice',
      'pickProp',
      'conversationChoice',
      'hyperText',
    ].includes(beatType);
  }

  /**
   * Build final result
   */
  private buildResult(startTime: number): ConstraintPathResult {
    const allBeats = this.story.getAllBeats();
    const allBeatIds = new Set(allBeats.map(b => b.id));
    const unreachable = [...allBeatIds].filter(id => !this.reachableBeats.has(id));

    // Convert outcome map to array, sorted by outcome type then beat name
    const outcomes = [...this.outcomeGroups.values()].sort((a, b) => {
      // Endings first, then dead ends, then cycles
      const typeOrder: Record<string, number> = { ending: 0, deadEnd: 1, cycle: 2 };
      if (typeOrder[a.endType] !== typeOrder[b.endType]) {
        return typeOrder[a.endType] - typeOrder[b.endType];
      }
      return a.endingBeatName.localeCompare(b.endingBeatName);
    });

    let totalConstraintSets = 0;
    const uniqueEndingsSet = new Set<string>();
    for (const outcome of outcomes) {
      totalConstraintSets += outcome.constraintSets.length;
      if (outcome.endType === 'ending') {
        uniqueEndingsSet.add(outcome.endingBeatId);
      }
    }

    return {
      outcomes,
      totalOutcomes: outcomes.length,
      totalConstraintSets,
      reachableBeats: [...this.reachableBeats],
      unreachableBeats: unreachable,
      uniqueEndings: [...uniqueEndingsSet],
      statesExplored: this.statesExplored,
      analysisTime: performance.now() - startTime,
    };
  }
}
