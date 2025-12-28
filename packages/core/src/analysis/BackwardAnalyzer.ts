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
 * BackwardAnalyzer
 */
export class BackwardAnalyzer {
  private story: Story;
  private reverseGraph: Map<string, BackwardNode>;

  constructor(story: Story) {
    this.story = story;
    this.reverseGraph = new Map();
    this.buildReverseGraph();
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
      pathLength: number;
    }

    const queue: QueueItem[] = [{
      beatId: targetBeatId,
      constraints: createEmptyConstraintSet(),
      decisionPoints: [],
      pathLength: 0,
    }];

    let minimumSteps = Infinity;
    const beatOccurrences = new Map<string, number>();  // For finding necessary beats

    while (queue.length > 0 && requirements.length < 100) {
      const current = queue.shift()!;

      // Check if we've reached the start
      if (current.beatId === firstBeatId) {
        const pathLength = current.pathLength + 1;
        minimumSteps = Math.min(minimumSteps, pathLength);

        // Count beat occurrences for this path
        for (const dp of current.decisionPoints) {
          beatOccurrences.set(dp.beatId, (beatOccurrences.get(dp.beatId) || 0) + 1);
        }

        requirements.push({
          constraints: current.constraints,
          decisionPoints: current.decisionPoints.reverse(),
          pathLength,
          summary: this.generateSummary(current.constraints, current.decisionPoints),
        });
        continue;
      }

      // Avoid infinite loops
      const stateHash = `${current.beatId}#${hashConstraintSet(current.constraints)}`;
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
      if (beat.type === 'endScreen') {
        endings.push({ beatId: beat.id, beatName: beat.name });
      }
    }

    return endings;
  }
}
