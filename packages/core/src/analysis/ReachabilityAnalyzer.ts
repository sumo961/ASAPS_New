import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';
import { StoryContext } from '../engine/StoryContext';

/**
 * Analysis of a specific condition's satisfiability
 */
export interface ConditionAnalysis {
  condition: Condition;
  isSatisfiable: boolean;
  reason?: string;
  possibleValues?: {
    min: number;
    max: number;
  };
  suggestedFix?: string;
}

/**
 * Information about an unreachable beat
 */
export interface UnreachableBeat {
  beatId: string;
  beatName: string;
  beatType: string;
  reason: 'noIncoming' | 'impossibleCondition' | 'unreachableParent' | 'orphaned';
  details: string;
  blockingConditions?: ConditionAnalysis[];
  incomingConnections?: Array<{
    sourceBeatId: string;
    sourceBeatName: string;
    connection: Connection;
  }>;
  suggestedFixes?: string[];
}

/**
 * Warning about potentially problematic beats
 */
export interface ReachabilityWarning {
  beatId: string;
  message: string;
  severity: 'warning' | 'error';
  type: 'hard-to-reach' | 'single-path' | 'conditional-only';
}

/**
 * Result of reachability analysis
 */
export interface ReachabilityResult {
  reachableBeats: Set<string>;
  unreachableBeats: UnreachableBeat[];
  warnings: ReachabilityWarning[];
  orphanedBeats: string[];
  analysis: {
    totalBeats: number;
    reachableCount: number;
    unreachableCount: number;
    orphanedCount: number;
  };
}

/**
 * Configuration for reachability analysis
 */
export interface ReachabilityConfig {
  analyzeConditions?: boolean; // Analyze condition satisfiability (default: true)
  detectOrphans?: boolean; // Detect beats with no incoming connections (default: true)
  suggestFixes?: boolean; // Generate fix suggestions (default: true)
}

/**
 * ReachabilityAnalyzer - Analyzes which beats can be reached in a story
 *
 * Uses breadth-first search to find all reachable beats, then analyzes
 * why unreachable beats cannot be reached (impossible conditions, missing
 * connections, etc.)
 */
export class ReachabilityAnalyzer {
  private story: Story;
  private config: Required<ReachabilityConfig>;
  private counterModifications: Map<string, { min: number; max: number }>;
  private variableValues: Map<string, Set<any>>;
  private stateAnalyzed: boolean = false;

  constructor(story: Story, config: ReachabilityConfig = {}) {
    this.story = story;
    this.config = {
      analyzeConditions: config.analyzeConditions ?? true,
      detectOrphans: config.detectOrphans ?? true,
      suggestFixes: config.suggestFixes ?? true
    };
    this.counterModifications = new Map();
    this.variableValues = new Map();
  }

  /**
   * Analyze reachability of all beats in the story
   */
  public analyze(): ReachabilityResult {
    console.log('[ReachabilityAnalyzer] Starting reachability analysis...');

    const allBeats = this.story.getAllBeats();
    const totalBeats = allBeats.length;

    if (totalBeats === 0) {
      console.warn('[ReachabilityAnalyzer] No beats in story');
      return this.createEmptyResult();
    }

    // Step 1: Analyze counter and variable modifications
    if (this.config.analyzeConditions) {
      this.ensureStateAnalyzed();
    }

    // Step 2: Find all reachable beats via BFS
    const reachableBeats = this.findReachableBeats();

    // Step 3: Analyze unreachable beats
    const unreachableBeats = this.analyzeUnreachableBeats(allBeats, reachableBeats);

    // Step 4: Detect orphaned beats (no incoming connections)
    const orphanedBeats = this.config.detectOrphans
      ? this.detectOrphanedBeats(allBeats)
      : [];

    // Step 5: Generate warnings
    const warnings = this.generateWarnings(reachableBeats);

    console.log(`[ReachabilityAnalyzer] Analysis complete. ${reachableBeats.size}/${totalBeats} beats reachable`);

    return {
      reachableBeats,
      unreachableBeats,
      warnings,
      orphanedBeats,
      analysis: {
        totalBeats,
        reachableCount: reachableBeats.size,
        unreachableCount: unreachableBeats.length,
        orphanedCount: orphanedBeats.length
      }
    };
  }

  /**
   * Find all beats reachable from the first beat using BFS
   */
  private findReachableBeats(): Set<string> {
    const reachable = new Set<string>();
    const queue: string[] = [];

    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      console.warn('[ReachabilityAnalyzer] No first beat found');
      return reachable;
    }

    queue.push(firstBeatId);
    reachable.add(firstBeatId);

    while (queue.length > 0) {
      const beatId = queue.shift()!;
      const beat = this.story.getBeat(beatId);

      if (!beat) continue;

      // Get all outgoing connections
      const connections = beat.getConnections();

      for (const connection of connections) {
        // For unconditional connections, mark as reachable
        // When config.analyzeConditions is false, treat all connections as reachable
        const isReachable = !connection.condition ||
                            !this.config.analyzeConditions ||
                            this.isConditionPossible(connection.condition);

        if (isReachable) {
          if (!reachable.has(connection.targetId)) {
            reachable.add(connection.targetId);
            queue.push(connection.targetId);
          }
        }
      }

      // Check defaultTarget
      if (beat.defaultTarget && !reachable.has(beat.defaultTarget)) {
        reachable.add(beat.defaultTarget);
        queue.push(beat.defaultTarget);
      }
    }

    return reachable;
  }

  /**
   * Ensure state modifications have been analyzed (lazy initialization)
   */
  private ensureStateAnalyzed(): void {
    if (this.stateAnalyzed) return;
    this.analyzeStateModifications();
    this.stateAnalyzed = true;
  }

  /**
   * Analyze all beats to find counter and variable modifications
   */
  private analyzeStateModifications(): void {
    this.counterModifications.clear();
    this.variableValues.clear();

    const allBeats = this.story.getAllBeats();

    for (const beat of allBeats) {
      const params = beat.getParameters();

      // Analyze SetVariable beats
      if (beat.type === 'setVariable') {
        const varType = params.type; // 'variable' or 'counter'
        const varName = params.name;
        const varValue = params.value;
        const operation = params.operation || 'set';

        if (!varName) continue;

        if (varType === 'variable') {
          // Track variable values
          if (!this.variableValues.has(varName)) {
            this.variableValues.set(varName, new Set());
          }
          this.variableValues.get(varName)!.add(varValue);
        } else if (varType === 'counter') {
          // Track counter modifications
          const value = Number(varValue) || 0;

          if (!this.counterModifications.has(varName)) {
            this.counterModifications.set(varName, { min: 0, max: 0 });
          }

          const range = this.counterModifications.get(varName)!;

          if (operation === 'set') {
            range.max = Math.max(range.max, value);
            range.min = Math.min(range.min, value);
          } else if (operation === 'change') {
            // 'change' operation adds to current value
            if (value > 0) {
              range.max += value;
            } else {
              range.min += value;
            }
          }
        }
      }

      // Analyze choice-based beats with counter effects
      if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
        const choices = params.choices || params.props || [];

        for (const choice of choices) {
          if (choice.counterEffect) {
            const counterName = choice.counterEffect.counter;
            const value = choice.counterEffect.value || 0;

            if (!this.counterModifications.has(counterName)) {
              this.counterModifications.set(counterName, { min: 0, max: 0 });
            }

            const range = this.counterModifications.get(counterName)!;
            if (value > 0) {
              range.max += value;
            } else {
              range.min += value;
            }
          }
        }
      }

      // Analyze dialogTree choices
      if (beat.type === 'dialogTree' && params.dialogTree) {
        this.analyzeDialogTreeForCounters(params.dialogTree);
      }
    }
  }

  /**
   * Recursively analyze dialog tree for counter modifications
   */
  private analyzeDialogTreeForCounters(node: any): void {
    if (!node) return;

    if (node.choices) {
      for (const choice of node.choices) {
        if (choice.counterEffect) {
          const counterName = choice.counterEffect.counter;
          const value = choice.counterEffect.value || 0;

          if (!this.counterModifications.has(counterName)) {
            this.counterModifications.set(counterName, { min: 0, max: 0 });
          }

          const range = this.counterModifications.get(counterName)!;
          if (value > 0) {
            range.max += value;
          } else {
            range.min += value;
          }
        }

        if (choice.nextNode) {
          this.analyzeDialogTreeForCounters(choice.nextNode);
        }
      }
    }
  }

  /**
   * Check if a condition is theoretically possible
   */
  private isConditionPossible(condition: Condition): boolean {
    const analysis = this.analyzeCondition(condition);
    return analysis.isSatisfiable;
  }

  /**
   * Analyze a specific condition for satisfiability
   */
  public analyzeCondition(condition: Condition): ConditionAnalysis {
    // Ensure state modifications have been analyzed
    this.ensureStateAnalyzed();

    const { type, operator, left, right, counter1, counter2, beatId } = condition;

    switch (type) {
      case 'counter': {
        const counterName = left;
        const requiredValue = right;

        if (!counterName || requiredValue === undefined) {
          return {
            condition,
            isSatisfiable: true,
            reason: 'Invalid condition format'
          };
        }

        const range = this.counterModifications.get(counterName);

        if (!range) {
          return {
            condition,
            isSatisfiable: false,
            reason: `Counter "${counterName}" is never modified in the story`,
            suggestedFix: `Add a setVariable beat or choice that modifies "${counterName}"`
          };
        }

        const isSatisfiable = this.checkCounterCondition(range, operator, requiredValue);

        if (!isSatisfiable) {
          return {
            condition,
            isSatisfiable: false,
            reason: `Counter "${counterName}" cannot satisfy ${operator} ${requiredValue}. Range: ${range.min} to ${range.max}`,
            possibleValues: range,
            suggestedFix: this.suggestCounterFix(counterName, operator, requiredValue, range)
          };
        }

        return {
          condition,
          isSatisfiable: true,
          possibleValues: range
        };
      }

      case 'counterCompare': {
        if (!counter1 || !counter2) {
          return { condition, isSatisfiable: true };
        }

        const range1 = this.counterModifications.get(counter1);
        const range2 = this.counterModifications.get(counter2);

        if (!range1 || !range2) {
          return {
            condition,
            isSatisfiable: false,
            reason: `One or both counters ("${counter1}", "${counter2}") are never modified`
          };
        }

        // Conservative: assume satisfiable if ranges overlap
        return {
          condition,
          isSatisfiable: true,
          possibleValues: range1
        };
      }

      case 'variable': {
        const varName = left;
        const requiredValue = right;

        if (!varName) {
          return { condition, isSatisfiable: true };
        }

        const possibleValues = this.variableValues.get(varName);
        if (!possibleValues || possibleValues.size === 0) {
          return {
            condition,
            isSatisfiable: false,
            reason: `Variable "${varName}" is never set in the story`,
            suggestedFix: `Add a setVariable beat that sets "${varName}"`
          };
        }

        const isSatisfiable = Array.from(possibleValues).some(val =>
          this.compareValues(val, operator, requiredValue)
        );

        if (!isSatisfiable) {
          return {
            condition,
            isSatisfiable: false,
            reason: `Variable "${varName}" never equals ${requiredValue}. Possible values: ${Array.from(possibleValues).join(', ')}`,
            suggestedFix: `Change condition or add setVariable that sets "${varName}" to ${requiredValue}`
          };
        }

        return { condition, isSatisfiable: true };
      }

      case 'inventory':
      case 'visitedBeat':
      case 'timer':
        // These are runtime-dependent, assume satisfiable
        return { condition, isSatisfiable: true };

      default:
        return { condition, isSatisfiable: true };
    }
  }

  /**
   * Check if a counter condition can be satisfied
   */
  private checkCounterCondition(
    range: { min: number; max: number },
    operator: string,
    value: number
  ): boolean {
    switch (operator) {
      case '==':
        return range.min <= value && value <= range.max;
      case '!=':
        return true; // Always possible
      case '>':
        return range.max > value;
      case '>=':
        return range.max >= value;
      case '<':
        return range.min < value;
      case '<=':
        return range.min <= value;
      default:
        return true;
    }
  }

  /**
   * Compare two values with an operator
   */
  private compareValues(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case 'contains':
        return String(left).includes(String(right));
      case 'not':
        return !left;
      default:
        return true;
    }
  }

  /**
   * Suggest a fix for an unsatisfiable counter condition
   */
  private suggestCounterFix(
    counterName: string,
    operator: string,
    required: number,
    range: { min: number; max: number }
  ): string {
    switch (operator) {
      case '>=':
      case '>':
        if (range.max < required) {
          const needed = required - range.max;
          return `Add ${needed} more to "${counterName}" via setVariable or choice effects`;
        }
        break;
      case '<=':
      case '<':
        if (range.min > required) {
          return `Reduce minimum value of "${counterName}" or change condition threshold`;
        }
        break;
      case '==':
        if (required < range.min || required > range.max) {
          return `Add a setVariable beat that sets "${counterName}" to exactly ${required}`;
        }
        break;
    }

    return `Adjust counter "${counterName}" values or modify condition`;
  }

  /**
   * Analyze why beats are unreachable
   */
  private analyzeUnreachableBeats(
    allBeats: Beat[],
    reachableBeats: Set<string>
  ): UnreachableBeat[] {
    const unreachable: UnreachableBeat[] = [];

    for (const beat of allBeats) {
      if (reachableBeats.has(beat.id)) continue;

      // Find all incoming connections
      const incomingConnections = this.findIncomingConnections(beat.id, allBeats);

      let reason: UnreachableBeat['reason'] = 'noIncoming';
      let details = 'No paths lead to this beat';
      const blockingConditions: ConditionAnalysis[] = [];
      const suggestedFixes: string[] = [];

      if (incomingConnections.length === 0) {
        reason = 'orphaned';
        details = 'This beat has no incoming connections';
        suggestedFixes.push(`Add a connection from another beat to "${beat.name}"`);
      } else {
        // Check if all incoming connections are blocked by impossible conditions
        let hasImpossibleCondition = false;
        let allParentsUnreachable = true;

        for (const incoming of incomingConnections) {
          const sourceBeat = this.story.getBeat(incoming.sourceBeatId);
          if (sourceBeat && reachableBeats.has(incoming.sourceBeatId)) {
            allParentsUnreachable = false;
          }

          if (incoming.connection.condition) {
            const analysis = this.analyzeCondition(incoming.connection.condition);
            blockingConditions.push(analysis);

            if (!analysis.isSatisfiable) {
              hasImpossibleCondition = true;
              if (analysis.suggestedFix) {
                suggestedFixes.push(analysis.suggestedFix);
              }
            }
          }
        }

        if (hasImpossibleCondition) {
          reason = 'impossibleCondition';
          details = 'All paths to this beat have impossible conditions';
        } else if (allParentsUnreachable) {
          reason = 'unreachableParent';
          details = 'All beats that connect to this beat are themselves unreachable';
        }
      }

      unreachable.push({
        beatId: beat.id,
        beatName: beat.name,
        beatType: beat.type,
        reason,
        details,
        blockingConditions: blockingConditions.length > 0 ? blockingConditions : undefined,
        incomingConnections,
        suggestedFixes: suggestedFixes.length > 0 ? suggestedFixes : undefined
      });
    }

    return unreachable;
  }

  /**
   * Find all connections pointing to a specific beat
   */
  private findIncomingConnections(
    targetBeatId: string,
    allBeats: Beat[]
  ): Array<{ sourceBeatId: string; sourceBeatName: string; connection: Connection }> {
    const incoming: Array<{
      sourceBeatId: string;
      sourceBeatName: string;
      connection: Connection;
    }> = [];

    for (const beat of allBeats) {
      const connections = beat.getConnections();

      for (const connection of connections) {
        if (connection.targetId === targetBeatId) {
          incoming.push({
            sourceBeatId: beat.id,
            sourceBeatName: beat.name,
            connection
          });
        }
      }

      // Check defaultTarget
      if (beat.defaultTarget === targetBeatId) {
        incoming.push({
          sourceBeatId: beat.id,
          sourceBeatName: beat.name,
          connection: {
            targetId: targetBeatId,
            label: 'default'
          }
        });
      }
    }

    return incoming;
  }

  /**
   * Detect orphaned beats (no incoming connections except first beat)
   */
  private detectOrphanedBeats(allBeats: Beat[]): string[] {
    const orphaned: string[] = [];
    const firstBeatId = this.story.getFirstBeatId();

    for (const beat of allBeats) {
      if (beat.id === firstBeatId) continue;

      const incoming = this.findIncomingConnections(beat.id, allBeats);
      if (incoming.length === 0) {
        orphaned.push(beat.id);
      }
    }

    return orphaned;
  }

  /**
   * Generate warnings for potentially problematic beats
   */
  private generateWarnings(reachableBeats: Set<string>): ReachabilityWarning[] {
    const warnings: ReachabilityWarning[] = [];
    const allBeats = this.story.getAllBeats();

    for (const beat of allBeats) {
      if (!reachableBeats.has(beat.id)) continue;

      const incoming = this.findIncomingConnections(beat.id, allBeats);

      // Warning: Only reachable via conditional paths (check this first, it's more specific)
      const allConditional = incoming.every(conn => conn.connection.condition !== undefined);
      if (allConditional && incoming.length > 0) {
        warnings.push({
          beatId: beat.id,
          message: `Beat "${beat.name}" is only reachable via conditional paths`,
          severity: 'warning',
          type: 'conditional-only'
        });
      }
      // Warning: Only reachable via one path (but not if it's already flagged as conditional-only)
      else if (incoming.length === 1 && beat.id !== this.story.getFirstBeatId()) {
        warnings.push({
          beatId: beat.id,
          message: `Beat "${beat.name}" has only one incoming connection`,
          severity: 'warning',
          type: 'single-path'
        });
      }
    }

    return warnings;
  }

  /**
   * Create empty result
   */
  private createEmptyResult(): ReachabilityResult {
    return {
      reachableBeats: new Set(),
      unreachableBeats: [],
      warnings: [],
      orphanedBeats: [],
      analysis: {
        totalBeats: 0,
        reachableCount: 0,
        unreachableCount: 0,
        orphanedCount: 0
      }
    };
  }
}
