/**
 * BackwardAnalyzer - Analyze paths backward from a target beat
 *
 * Answers the question: "What conditions/choices lead to reaching beat X?"
 *
 * This is complementary to forward analysis:
 * - Forward: "What outcomes are possible from start?"
 * - Backward: "What's required to reach outcome X?"
 */

import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import {
  ConstraintSet,
  PathStep,
  createEmptyConstraintSet,
  cloneConstraintSet,
  addConditionConstraint,
  constraintSetToStrings,
  hashConstraintSet,
  constraintSetsCompatible,
  mergeConstraintSets,
} from './ConstraintSet';

/**
 * A decision point on the path to a target
 */
export interface DecisionPoint {
  beatId: string;
  beatName: string;
  beatType: string;
  requiredChoice?: string;      // For choice beats: which choice must be made
  requiredCondition?: string;   // For condition beats: which branch must be taken
  alternatives?: string[];      // Other choices that also lead to target
}

/**
 * A requirement set for reaching a target
 */
export interface PathRequirement {
  // Constraint set that must be satisfied
  constraints: ConstraintSet;

  // Key decision points (choices/conditions that determine the path)
  decisionPoints: DecisionPoint[];

  // ALL beats on this path (for highlighting)
  pathBeats: Array<{ beatId: string; beatName: string; beatType: string }>;

  // Path length
  pathLength: number;

  // Human-readable summary
  summary: string;
}

/**
 * Result of backward analysis
 */
export interface BackwardAnalysisResult {
  targetBeatId: string;
  targetBeatName: string;

  // All requirement sets that lead to the target (disjunction)
  requirements: PathRequirement[];

  // Minimum steps to reach target
  minimumSteps: number;

  // Beats that MUST be visited on all paths to target
  necessaryBeats: string[];

  // Analysis time
  analysisTime: number;
}

/**
 * Internal node for backward graph
 */
interface BackwardNode {
  beatId: string;
  incomingEdges: Array<{
    fromBeatId: string;
    connection: Connection | null;  // The connection that leads here
    conditionForThis?: { condition: Condition; branch: boolean };  // For condition beats
  }>;
}

/**
 * Information about a beat that sets a variable
 */
interface VariableSetter {
  beatId: string;
  beatName: string;
  operation: 'set' | 'change' | 'increment';
  value: number;
}

/**
 * BackwardAnalyzer
 */
export class BackwardAnalyzer {
  private story: Story;
  private reverseGraph: Map<string, BackwardNode>;
  // Map of variable name -> beats that set it
  private variableSetters: Map<string, VariableSetter[]>;

  constructor(story: Story) {
    this.story = story;
    this.reverseGraph = new Map();
    this.variableSetters = new Map();
    this.buildReverseGraph();
    this.buildVariableSetterMap();
  }

  /**
   * Build map of which beats set which variables
   */
  private buildVariableSetterMap(): void {
    for (const beat of this.story.getAllBeats()) {
      // setVariable, setCounter, setGlobal beats set variables
      if (['setVariable', 'setCounter', 'setGlobal', 'counter', 'variable'].includes(beat.type)) {
        const params = beat.getParameters();
        const varName = params.variableName || params.variable || params.counterName || params.name;
        const operation = params.operation || 'set';
        const value = params.value ?? params.val ?? 1;

        if (varName) {
          if (!this.variableSetters.has(varName)) {
            this.variableSetters.set(varName, []);
          }
          this.variableSetters.get(varName)!.push({
            beatId: beat.id,
            beatName: beat.name,
            operation: operation as 'set' | 'change' | 'increment',
            value: typeof value === 'number' ? value : 1,
          });
        }
      }

      // Also check for effects on choices that set variables
      const params = beat.getParameters();
      const choices = params.choices || params.options || params.props || [];
      for (const choice of choices) {
        if (choice.effects) {
          for (const effect of choice.effects) {
            if (effect.type === 'setVariable' || effect.type === 'counter') {
              const varName = effect.variable || effect.variableName || effect.counterName;
              if (varName) {
                if (!this.variableSetters.has(varName)) {
                  this.variableSetters.set(varName, []);
                }
                this.variableSetters.get(varName)!.push({
                  beatId: beat.id,
                  beatName: beat.name,
                  operation: effect.operation || 'change',
                  value: effect.value ?? 1,
                });
              }
            }
          }
        }
        // Direct counter fields on choices
        if (choice.counter) {
          if (!this.variableSetters.has(choice.counter)) {
            this.variableSetters.set(choice.counter, []);
          }
          this.variableSetters.get(choice.counter)!.push({
            beatId: beat.id,
            beatName: beat.name,
            operation: choice.counterOperation || 'change',
            value: choice.counterValue ?? 1,
          });
        }
      }
    }

  }

  /**
   * Check if a path includes beats that can satisfy its constraints
   */
  private pathCanSatisfyConstraints(
    pathBeatIds: Set<string>,
    constraints: ConstraintSet
  ): { valid: boolean; missingVariables: string[] } {
    const missingVariables: string[] = [];

    // Check each variable constraint
    for (const [varName, constraint] of constraints.variables) {
      // Skip 'visited beat' constraints - these are tracking constraints, not game state
      if (varName.startsWith('visited ')) continue;

      // Find beats that set this variable
      const setters = this.variableSetters.get(varName) || [];

      // Check if any setter on the path can SATISFY the constraint (not just set it)
      // For numeric constraints like >= 1, we need a setter that provides value >= 1
      // Initialize beats typically set to 0, which doesn't satisfy >= 1
      let constraintSatisfied = false;

      if (constraint.type === 'numeric') {
        const minRequired = constraint.min ?? -Infinity;

        for (const setter of setters) {
          if (!pathBeatIds.has(setter.beatId)) continue;

          // Check if this setter can satisfy the constraint
          // 'set' operation: value must be >= minRequired
          // 'change'/'increment' operation: adds to existing value, assume it helps
          if (setter.operation === 'set') {
            if (setter.value >= minRequired) {
              constraintSatisfied = true;
              break;
            }
          } else if (setter.operation === 'change' || setter.operation === 'increment') {
            // Increment operations with positive values can satisfy >= constraints
            if (setter.value > 0 && minRequired > 0) {
              constraintSatisfied = true;
              break;
            }
          }
        }
      } else {
        // For non-numeric constraints, just check if any setter is on the path
        constraintSatisfied = setters.some(s => pathBeatIds.has(s.beatId));
      }

      if (!constraintSatisfied && setters.length > 0) {
        missingVariables.push(varName);
      }
    }

    return {
      valid: missingVariables.length === 0,
      missingVariables,
    };
  }

  /**
   * Get beats that must be visited to satisfy a constraint
   */
  private getBeatsForConstraint(varName: string): VariableSetter[] {
    return this.variableSetters.get(varName) || [];
  }

  /**
   * Build the reverse graph (target -> sources)
   */
  private buildReverseGraph(): void {
    const allBeats = this.story.getAllBeats();

    // Initialize nodes
    for (const beat of allBeats) {
      this.reverseGraph.set(beat.id, {
        beatId: beat.id,
        incomingEdges: [],
      });
    }

    // Add edges (reversed direction)
    for (const beat of allBeats) {
      const connections = this.getOutgoingConnections(beat);

      for (const conn of connections) {
        const targetNode = this.reverseGraph.get(conn.targetId);
        if (targetNode) {
          targetNode.incomingEdges.push({
            fromBeatId: beat.id,
            connection: conn.connection,
            conditionForThis: conn.conditionBranch,
          });
        }
      }
    }
  }

  /**
   * Get all outgoing connections from a beat
   */
  private getOutgoingConnections(beat: Beat): Array<{
    targetId: string;
    connection: Connection | null;
    conditionBranch?: { condition: Condition; branch: boolean };
  }> {
    const params = beat.getParameters();
    const results: Array<{
      targetId: string;
      connection: Connection | null;
      conditionBranch?: { condition: Condition; branch: boolean };
    }> = [];
    const addedTargets = new Set<string>();

    // Condition beats have true/false targets with condition info
    if (beat.type === 'conditionBeat') {
      const condition = this.extractCondition(params);
      if (params.trueTarget) {
        results.push({
          targetId: params.trueTarget,
          connection: null,
          conditionBranch: condition ? { condition, branch: true } : undefined,
        });
        addedTargets.add(params.trueTarget);
      }
      if (params.falseTarget) {
        results.push({
          targetId: params.falseTarget,
          connection: null,
          conditionBranch: condition ? { condition, branch: false } : undefined,
        });
        addedTargets.add(params.falseTarget);
      }
    }

    // Use beat's getConnections() to get all connections (including derived ones from choices)
    const connections = beat.getConnections();
    for (const conn of connections) {
      if (conn.targetId && !addedTargets.has(conn.targetId)) {
        results.push({ targetId: conn.targetId, connection: conn });
        addedTargets.add(conn.targetId);
      }
    }

    // Default target (property on Beat class, not in parameters)
    if (beat.defaultTarget && !addedTargets.has(beat.defaultTarget)) {
      results.push({ targetId: beat.defaultTarget, connection: null });
    }

    return results;
  }

  /**
   * Analyze backward from a target beat
   */
  public analyzeBackward(targetBeatId: string): BackwardAnalysisResult {
    const startTime = performance.now();

    const targetBeat = this.story.getBeat(targetBeatId);
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

    // BFS backward from target to start
    const requirements: PathRequirement[] = [];
    const visited = new Set<string>();

    interface QueueItem {
      beatId: string;
      constraints: ConstraintSet;
      decisionPoints: DecisionPoint[];
      pathBeats: Array<{ beatId: string; beatName: string; beatType: string }>;
      pathLength: number;
    }

    const queue: QueueItem[] = [{
      beatId: targetBeatId,
      constraints: createEmptyConstraintSet(),
      decisionPoints: [],
      pathBeats: [{ beatId: targetBeat.id, beatName: targetBeat.name, beatType: targetBeat.type }],
      pathLength: 0,
    }];

    let minimumSteps = Infinity;
    const beatOccurrences = new Map<string, number>();  // For finding necessary beats

    while (queue.length > 0 && requirements.length < 100) {
      const current = queue.shift()!;

      // Check if we've reached the start
      if (current.beatId === firstBeatId) {
        // Validate that the path can satisfy its constraints
        // A path that requires expert_visited >= 1 must include a beat that sets expert_visited
        const pathBeatIds = new Set(current.pathBeats.map(pb => pb.beatId));
        const validation = this.pathCanSatisfyConstraints(pathBeatIds, current.constraints);

        if (!validation.valid) {
          // Path cannot satisfy its constraints - it's invalid
          // This happens when the path goes through condition TRUE branches
          // without including the beats that set the required variables
          continue;
        }

        const pathLength = current.pathLength + 1;
        minimumSteps = Math.min(minimumSteps, pathLength);

        // Count beat occurrences for this path (use all pathBeats, not just decision points)
        for (const pb of current.pathBeats) {
          beatOccurrences.set(pb.beatId, (beatOccurrences.get(pb.beatId) || 0) + 1);
        }

        requirements.push({
          constraints: current.constraints,
          decisionPoints: current.decisionPoints.reverse(),
          pathBeats: current.pathBeats.reverse(),
          pathLength,
          summary: this.generateSummary(current.constraints, current.decisionPoints),
        });
        continue;
      }

      // Avoid infinite loops - include PLAYER CHOICES (not condition results) in hash
      // Condition results are determined by game state, not player decisions, so they shouldn't differentiate paths
      // Only actual choices (dialogTree, movementChoice, etc.) should create distinct paths
      const choiceHash = current.decisionPoints
        .filter(dp => dp.requiredChoice) // Only player choices, not condition results
        .map(dp => `${dp.beatId}:${dp.requiredChoice}`)
        .join('|');
      const stateHash = `${current.beatId}#${hashConstraintSet(current.constraints)}#${choiceHash}`;
      if (visited.has(stateHash)) continue;
      visited.add(stateHash);

      // Depth limit
      if (current.pathLength > 50) continue;

      // Get incoming edges
      const node = this.reverseGraph.get(current.beatId);
      if (!node) continue;

      for (const edge of node.incomingEdges) {
        const fromBeat = this.story.getBeat(edge.fromBeatId);
        if (!fromBeat) continue;

        let newConstraints = cloneConstraintSet(current.constraints);
        let newDecisionPoints = [...current.decisionPoints];
        // Track ALL beats in the path
        let newPathBeats = [...current.pathBeats, { beatId: fromBeat.id, beatName: fromBeat.name, beatType: fromBeat.type }];

        // Apply constraint from condition
        if (edge.conditionForThis) {
          const result = addConditionConstraint(
            newConstraints,
            edge.conditionForThis.condition,
            edge.conditionForThis.branch
          );
          if (result === null) continue;  // Impossible path
          newConstraints = result;

          // Add decision point
          newDecisionPoints.push({
            beatId: fromBeat.id,
            beatName: fromBeat.name,
            beatType: fromBeat.type,
            requiredCondition: edge.conditionForThis.branch ? 'TRUE' : 'FALSE',
          });
        }

        // Apply constraint from connection condition
        if (edge.connection?.condition) {
          const result = addConditionConstraint(newConstraints, edge.connection.condition, true);
          if (result === null) continue;
          newConstraints = result;
        }

        // For choice beats, note the decision point
        if (this.isChoiceBeat(fromBeat.type)) {
          const choiceMade = this.findChoiceForTarget(fromBeat, current.beatId);
          if (choiceMade) {
            newDecisionPoints.push({
              beatId: fromBeat.id,
              beatName: fromBeat.name,
              beatType: fromBeat.type,
              requiredChoice: choiceMade,
            });
          }
        }

        queue.push({
          beatId: edge.fromBeatId,
          constraints: newConstraints,
          decisionPoints: newDecisionPoints,
          pathBeats: newPathBeats,
          pathLength: current.pathLength + 1,
        });
      }
    }

    // Find necessary beats (present in ALL paths)
    const necessaryBeats: string[] = [];
    if (requirements.length > 0) {
      for (const [beatId, count] of beatOccurrences) {
        if (count === requirements.length) {
          necessaryBeats.push(beatId);
        }
      }
    }

    return {
      targetBeatId,
      targetBeatName: targetBeat.name,
      requirements,
      minimumSteps: minimumSteps === Infinity ? -1 : minimumSteps,
      necessaryBeats,
      analysisTime: performance.now() - startTime,
    };
  }

  /**
   * Find which choice leads to a target
   */
  private findChoiceForTarget(beat: Beat, targetBeatId: string): string | undefined {
    // Use getConnections() which includes label for choices
    const connections = beat.getConnections();

    for (const conn of connections) {
      if (conn.targetId === targetBeatId && conn.label) {
        return conn.label;
      }
    }

    // Fallback: check parameters directly for different choice beat types
    const params = beat.getParameters();

    // DialogTree stores choices in dialogTree.choices
    if (params.dialogTree?.choices) {
      for (const choice of params.dialogTree.choices) {
        if (choice.target === targetBeatId) {
          return choice.text || 'Choice';
        }
      }
    }

    // MovementChoice, PickProp store choices array
    const choices = params.choices || params.options || params.props || [];
    for (const choice of choices) {
      const choiceTarget = choice.targetId || choice.target;
      if (choiceTarget === targetBeatId) {
        return choice.text || choice.label || choice.name || 'Choice';
      }
    }

    return undefined;
  }

  /**
   * Generate human-readable summary of requirements
   */
  private generateSummary(constraints: ConstraintSet, decisionPoints: DecisionPoint[]): string {
    const parts: string[] = [];

    // Constraint requirements
    const constraintStrings = constraintSetToStrings(constraints);
    if (constraintStrings.length > 0) {
      parts.push(`Requires: ${constraintStrings.slice(0, 3).join(', ')}${constraintStrings.length > 3 ? '...' : ''}`);
    }

    // Key decisions
    const keyDecisions = decisionPoints.filter(dp => dp.requiredChoice || dp.requiredCondition).slice(0, 2);
    if (keyDecisions.length > 0) {
      const decisionSummary = keyDecisions.map(dp => {
        if (dp.requiredChoice) return `"${dp.requiredChoice}"`;
        if (dp.requiredCondition) return `${dp.beatName}=${dp.requiredCondition}`;
        return dp.beatName;
      }).join(', ');
      parts.push(`Via: ${decisionSummary}`);
    }

    return parts.join(' | ') || 'No specific requirements';
  }

  /**
   * Extract condition from beat parameters
   */
  private extractCondition(params: any): Condition | null {
    if (params.condition) return params.condition;

    if (params.variableName || params.variable || params.left) {
      return {
        type: params.conditionType || 'variable',
        operator: params.operator || '==',
        variableName: params.variableName || params.variable || params.left,
        value: params.value ?? params.right ?? params.val,
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
   * Get all endings in the story
   */
  public getEndings(): Array<{ beatId: string; beatName: string }> {
    const endings: Array<{ beatId: string; beatName: string }> = [];

    for (const beat of this.story.getAllBeats()) {
      // endScreen and aiSummary are both considered ending beats
      if (beat.type === 'endScreen' || beat.type === 'aiSummary') {
        endings.push({ beatId: beat.id, beatName: beat.name });
      }
    }

    return endings;
  }
}
