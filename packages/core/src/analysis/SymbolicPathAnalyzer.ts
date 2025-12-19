import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { Connection, Condition } from '../types';

/**
 * Represents a constraint on a variable
 */
interface VariableConstraint {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'has' | 'notHas';
  value: any;
}

/**
 * Represents the symbolic state during path exploration
 */
interface SymbolicState {
  // Variable constraints: variable -> set of constraints
  constraints: Map<string, VariableConstraint[]>;
  // Visited beats in current path
  visitedBeats: Set<string>;
  // Visit count for each beat in current path (for limiting revisits)
  visitCounts: Map<string, number>;
  // Constraint hash when each beat was visited (for cycle detection with state changes)
  visitedBeatConstraints: Map<string, string>;
  // Inventory state: character -> items
  inventory: Map<string, Set<string>>;
  // Current path being explored (beat IDs in order)
  currentPath: string[];
}

/**
 * Represents a node in a symbolic path
 */
export interface SymbolicPathNode {
  beatId: string;
  beatName: string;
  beatType: string;
  constraintsAtEntry: string[]; // Human-readable constraints active at this point
}

/**
 * Represents a complete feasible path through the story
 */
export interface SymbolicPath {
  id: string;
  nodes: SymbolicPathNode[];
  length: number;
  endType: 'endBeat' | 'deadEnd' | 'cycle' | 'depthLimit';
  endBeatId?: string;
  constraints: string[]; // All constraints that must be true for this path
}

/**
 * Result of symbolic path analysis
 */
export interface SymbolicPathResult {
  feasiblePaths: number;
  paths: SymbolicPath[]; // Actual path data
  uniqueEndings: string[];
  reachableBeats: string[];
  unreachableBeats: string[];
  constraintConflicts: number; // Paths pruned due to contradictory constraints
  statesCached: number;
  analysisTime: number;
}

/**
 * Configuration for symbolic analysis
 */
export interface SymbolicAnalysisConfig {
  maxDepth?: number;
  maxPaths?: number;
  maxStates?: number; // Limit on memoization cache
  trackInventory?: boolean;
  trackVisitedBeats?: boolean;
  maxStoredPaths?: number; // Limit on paths to store for display (default: 100)
  maxBeatRevisits?: number; // Max times a single beat can be revisited in one path (default: 4)
}

/**
 * SymbolicPathAnalyzer - Uses constraint-based symbolic execution
 * to find feasible paths through a story, pruning impossible branches.
 *
 * Key optimizations:
 * 1. Constraint propagation: Track what we know about variables
 * 2. Conflict detection: Prune paths with contradictory constraints
 * 3. State memoization: Cache results for equivalent states
 * 4. Early termination: Stop when enough paths found
 */
export class SymbolicPathAnalyzer {
  private story: Story;
  private config: Required<SymbolicAnalysisConfig>;

  // Memoization cache: state hash -> set of reachable endings
  private stateCache: Map<string, Set<string>>;

  // Results
  private feasiblePaths: number;
  private collectedPaths: SymbolicPath[];
  private pathIdCounter: number;
  private endings: Set<string>;
  private reachableBeats: Set<string>;
  private conflictsPruned: number;

  // Track unique ending paths by their beat sequence (to find all permutations)
  private endingPathSignatures: Set<string>;

  constructor(story: Story, config: SymbolicAnalysisConfig = {}) {
    this.story = story;
    this.config = {
      maxDepth: config.maxDepth ?? 100,
      maxPaths: config.maxPaths ?? 100000,
      maxStates: config.maxStates ?? 50000,
      trackInventory: config.trackInventory ?? true,
      trackVisitedBeats: config.trackVisitedBeats ?? true,
      maxStoredPaths: config.maxStoredPaths ?? 100, // Only store first 100 paths for display
      maxBeatRevisits: config.maxBeatRevisits ?? 6, // Allow up to 6 visits per beat (for hub patterns with 3+ branches)
    };
    this.stateCache = new Map();
    this.feasiblePaths = 0;
    this.collectedPaths = [];
    this.pathIdCounter = 0;
    this.endings = new Set();
    this.reachableBeats = new Set();
    this.conflictsPruned = 0;
    this.endingPathSignatures = new Set();
  }

  /**
   * Analyze all feasible paths through the story
   */
  public analyze(): SymbolicPathResult {
    const startTime = performance.now();

    console.log('[SymbolicPathAnalyzer] Starting symbolic analysis...');

    // Reset state
    this.stateCache.clear();
    this.feasiblePaths = 0;
    this.collectedPaths = [];
    this.pathIdCounter = 0;
    this.endings = new Set();
    this.reachableBeats = new Set();
    this.conflictsPruned = 0;
    this.endingPathSignatures = new Set();

    const firstBeatId = this.story.getFirstBeatId();
    if (!firstBeatId) {
      console.warn('[SymbolicPathAnalyzer] No first beat found');
      return this.createEmptyResult(performance.now() - startTime);
    }

    const firstBeat = this.story.getBeat(firstBeatId);
    if (!firstBeat) {
      return this.createEmptyResult(performance.now() - startTime);
    }

    // Start with empty symbolic state
    const initialState: SymbolicState = {
      constraints: new Map(),
      visitedBeats: new Set(),
      visitCounts: new Map(),
      visitedBeatConstraints: new Map(),
      inventory: new Map(),
      currentPath: [],
    };

    // Explore from first beat
    this.explore(firstBeat, initialState, 0);

    const analysisTime = performance.now() - startTime;

    // Find unreachable beats
    const allBeatIds = new Set(this.story.getAllBeats().map(b => b.id));
    const unreachableBeats = [...allBeatIds].filter(id => !this.reachableBeats.has(id));

    console.log(`[SymbolicPathAnalyzer] Analysis complete in ${analysisTime.toFixed(0)}ms`);
    console.log(`[SymbolicPathAnalyzer] Feasible paths: ${this.feasiblePaths}, Unique endings: ${this.endings.size}, Pruned: ${this.conflictsPruned}`);

    return {
      feasiblePaths: this.feasiblePaths,
      paths: this.collectedPaths,
      uniqueEndings: [...this.endings],
      reachableBeats: [...this.reachableBeats],
      unreachableBeats,
      constraintConflicts: this.conflictsPruned,
      statesCached: this.stateCache.size,
      analysisTime,
    };
  }

  /**
   * Explore paths from a beat with given symbolic state
   */
  private explore(beat: Beat, state: SymbolicState, depth: number): Set<string> {
    // Check limits
    if (depth >= this.config.maxDepth || this.feasiblePaths >= this.config.maxPaths) {
      // Save depth-limited path
      if (state.currentPath.length > 0) {
        this.savePath(state, 'depthLimit', beat.id);
      }
      return new Set();
    }

    const beatId = beat.id;
    this.reachableBeats.add(beatId);

    // Check visit count limit first - prevent excessive revisits
    const currentVisitCount = state.visitCounts.get(beatId) || 0;
    if (currentVisitCount >= this.config.maxBeatRevisits) {
      // Too many visits to this beat - stop exploring this path (don't save as cycle)
      return new Set();
    }

    // Create state hash for memoization (includes beat ID + constraints)
    const stateHash = this.hashState(beatId, state);

    // Check memoization cache - same beat + same constraints = already explored
    // We count these as feasible paths but don't store truncated path data
    if (this.stateCache.has(stateHash)) {
      const cachedEndings = this.stateCache.get(stateHash)!;

      // If this cached state leads to endings, count them (but don't store truncated paths)
      if (cachedEndings.size > 0) {
        const pathSignature = this.getPathSignature([...state.currentPath, beatId]);
        if (!this.endingPathSignatures.has(pathSignature)) {
          this.endingPathSignatures.add(pathSignature);
          // Count this as a unique path reaching an ending
          for (const _endingId of cachedEndings) {
            this.feasiblePaths++;
            // Don't save the path - we don't have the complete beat sequence
          }
        }
      }

      return cachedEndings;
    }

    // Check for TRUE cycle: same beat visited with SAME constraints in this path
    if (state.visitedBeats.has(beatId)) {
      const constraintsChanged = this.hasConstraintsChangedSinceLastVisit(beatId, state);

      if (!constraintsChanged) {
        // True cycle - same beat, same constraints - stop exploring (don't save)
        return new Set();
      }
      // Constraints changed - allow revisit but increment count
    }

    // Update visited beats, visit counts, and current path
    const newVisited = new Set(state.visitedBeats);
    newVisited.add(beatId);
    const newPath = [...state.currentPath, beatId];

    // Track visit count
    const newVisitCounts = new Map(state.visitCounts);
    newVisitCounts.set(beatId, currentVisitCount + 1);

    // Track constraint hash when we visit this beat (for cycle detection)
    const newVisitedBeatConstraints = new Map(state.visitedBeatConstraints);
    newVisitedBeatConstraints.set(beatId, this.getConstraintHash(state.constraints));

    // Deep copy constraints - IMPORTANT: new Map() only shallow copies, arrays are shared!
    const newConstraints = new Map<string, VariableConstraint[]>();
    state.constraints.forEach((constraints, key) => {
      newConstraints.set(key, [...constraints]);
    });

    // Deep copy inventory
    const newInventory = new Map<string, Set<string>>();
    state.inventory.forEach((items, key) => {
      newInventory.set(key, new Set(items));
    });

    const newState: SymbolicState = {
      constraints: newConstraints,
      visitedBeats: newVisited,
      visitCounts: newVisitCounts,
      visitedBeatConstraints: newVisitedBeatConstraints,
      inventory: newInventory,
      currentPath: newPath,
    };

    // Apply any state modifications from this beat
    this.applyBeatEffects(beat, newState);

    // Check if this is a terminal beat
    const isEndBeat = beat.type === 'endScreen';
    const connections = beat.getConnections();
    const defaultTarget = beat.defaultTarget;
    const hasNoConnections = connections.length === 0 && !defaultTarget;

    if (isEndBeat || hasNoConnections) {
      this.feasiblePaths++;
      if (isEndBeat) {
        this.endings.add(beatId);
        // Track this unique path signature for detecting alternative routes
        const pathSignature = this.getPathSignature(newState.currentPath);
        this.endingPathSignatures.add(pathSignature);
        console.log(`[SymbolicPathAnalyzer] Found END beat: ${beat.name} (${beatId})`, {
          pathLength: newState.currentPath.length,
          constraints: this.formatConstraints(newState.constraints).slice(0, 5),
          pathSignature
        });
      } else {
        console.log(`[SymbolicPathAnalyzer] Found dead end at: ${beat.name} (${beatId})`);
      }
      // Save the complete path
      this.savePath(newState, isEndBeat ? 'endBeat' : 'deadEnd', beatId);
      const result = new Set([beatId]);
      this.cacheState(stateHash, result);
      return result;
    }

    // Explore outgoing connections
    const reachableEndings = new Set<string>();

    // Handle ConditionBeat specially - evaluate which branches are feasible
    if (beat.type === 'conditionBeat' || beat.type === 'condition') {
      this.exploreConditionBeat(beat, newState, depth, reachableEndings);
    } else {
      // Regular beat - explore all connections
      for (const connection of connections) {
        if (this.feasiblePaths >= this.config.maxPaths) break;

        const targetBeat = this.story.getBeat(connection.targetId);
        if (!targetBeat) continue;

        // Check if connection has a condition
        if (connection.condition) {
          const feasibility = this.checkConditionFeasibility(connection.condition, newState);
          if (feasibility === 'impossible') {
            this.conflictsPruned++;
            continue; // Skip this branch - contradicts known constraints
          }

          // Add condition to constraints for this branch
          const branchState = this.cloneState(newState);
          this.addConstraintFromCondition(connection.condition, branchState);

          const endings = this.explore(targetBeat, branchState, depth + 1);
          endings.forEach(e => reachableEndings.add(e));
        } else {
          const endings = this.explore(targetBeat, newState, depth + 1);
          endings.forEach(e => reachableEndings.add(e));
        }
      }

      // Explore default target
      if (defaultTarget && this.feasiblePaths < this.config.maxPaths) {
        const targetBeat = this.story.getBeat(defaultTarget);
        if (targetBeat) {
          const endings = this.explore(targetBeat, newState, depth + 1);
          endings.forEach(e => reachableEndings.add(e));
        }
      }
    }

    this.cacheState(stateHash, reachableEndings);
    return reachableEndings;
  }

  /**
   * Handle ConditionBeat with symbolic constraints
   */
  private exploreConditionBeat(
    beat: Beat,
    state: SymbolicState,
    depth: number,
    reachableEndings: Set<string>
  ): void {
    const params = beat.getParameters();
    const condition = params.condition || this.buildConditionFromParams(params);

    // Get targets - try multiple sources for robustness:
    // 1. Direct params.trueTarget (ConditionBeat returns this)
    // 2. Connection objects from parameters
    // 3. Direct beat property access
    // 4. Connections array with 'true'/'false' labels
    let trueTarget = params.trueTarget ||
                     params.trueConnection?.targetId ||
                     (beat as any).trueTarget;
    let falseTarget = params.falseTarget ||
                      params.falseConnection?.targetId ||
                      (beat as any).falseTarget;

    // Fallback: check beat.getConnections() for labeled connections
    if (!trueTarget || !falseTarget) {
      const connections = beat.getConnections();
      for (const conn of connections) {
        const label = conn.label?.toLowerCase();
        if (!trueTarget && (label === 'true' || label === 'yes')) {
          trueTarget = conn.targetId;
        }
        if (!falseTarget && (label === 'false' || label === 'no')) {
          falseTarget = conn.targetId;
        }
      }
    }

    // Debug logging for troubleshooting
    if (!trueTarget) {
      console.warn(`[SymbolicPathAnalyzer] ConditionBeat ${beat.id} has no trueTarget!`, {
        paramsHas: Object.keys(params),
        beatType: beat.type,
        connectionsCount: beat.getConnections().length
      });
    }

    // Check feasibility of true branch
    const trueFeasibility = this.checkConditionFeasibility(condition, state);

    // Check feasibility of false branch (negated condition)
    const falseFeasibility = trueFeasibility === 'impossible' ? 'possible' :
                            trueFeasibility === 'certain' ? 'impossible' : 'possible';

    // Debug log the condition evaluation
    const varName = condition.variableName || (condition as any).left || (condition as any).variable;
    console.log(`[SymbolicPathAnalyzer] ConditionBeat ${beat.id}: ${varName} ${condition.operator} ${condition.value}`, {
      trueFeasibility,
      falseFeasibility,
      trueTarget,
      falseTarget,
      currentConstraints: this.formatConstraints(state.constraints).join(', ')
    });

    // Explore true branch if feasible
    if (trueFeasibility !== 'impossible' && trueTarget) {
      const targetBeat = this.story.getBeat(trueTarget);
      if (targetBeat && this.feasiblePaths < this.config.maxPaths) {
        console.log(`[SymbolicPathAnalyzer] Exploring TRUE branch → ${trueTarget} (${targetBeat.type})`);
        const branchState = this.cloneState(state);
        this.addConstraintFromCondition(condition, branchState);
        const endings = this.explore(targetBeat, branchState, depth + 1);
        endings.forEach(e => reachableEndings.add(e));
        if (endings.size > 0) {
          console.log(`[SymbolicPathAnalyzer] TRUE branch found endings: ${[...endings].join(', ')}`);
        }
      } else if (!targetBeat) {
        console.warn(`[SymbolicPathAnalyzer] TRUE target beat not found: ${trueTarget}`);
      }
    } else if (trueFeasibility === 'impossible') {
      this.conflictsPruned++;
    } else if (!trueTarget) {
      console.warn(`[SymbolicPathAnalyzer] No trueTarget to explore for ${beat.id}`);
    }

    // Explore false branch if feasible
    if (falseFeasibility !== 'impossible' && falseTarget) {
      const targetBeat = this.story.getBeat(falseTarget);
      if (targetBeat && this.feasiblePaths < this.config.maxPaths) {
        console.log(`[SymbolicPathAnalyzer] Exploring FALSE branch → ${falseTarget} (${targetBeat.type})`);
        const branchState = this.cloneState(state);
        this.addNegatedConstraint(condition, branchState);
        const endings = this.explore(targetBeat, branchState, depth + 1);
        endings.forEach(e => reachableEndings.add(e));
      }
    } else if (falseFeasibility === 'impossible') {
      this.conflictsPruned++;
    }
  }

  /**
   * Build a condition object from beat parameters
   */
  private buildConditionFromParams(params: Record<string, any>): Condition {
    const condition: Condition = {
      type: params.conditionType || 'counter',
      variableName: params.variableName || params.left || params.variable,
      operator: params.operator || '==',
      value: params.value ?? params.val ?? params.right,
    };

    // Add optional properties only if present
    if (params.beatId) {
      condition.beatId = params.beatId;
    }
    if (params.left) {
      condition.left = params.left;
    }
    if (params.right !== undefined) {
      condition.right = params.right;
    }
    if (params.counter1) {
      condition.counter1 = params.counter1;
    }
    if (params.counter2) {
      condition.counter2 = params.counter2;
    }

    return condition;
  }

  /**
   * Check if a condition is feasible given current constraints
   * Returns: 'possible', 'certain', or 'impossible'
   */
  private checkConditionFeasibility(
    condition: Condition,
    state: SymbolicState
  ): 'possible' | 'certain' | 'impossible' {
    if (!condition) return 'possible';

    // Handle inventory conditions
    if (condition.type === 'inventory') {
      return this.checkInventoryCondition(condition, state);
    }

    // Handle visitedBeat conditions
    if (condition.type === 'visitedBeat') {
      const beatId = condition.beatId || (condition as any).left;
      if (!beatId) return 'possible';

      const hasVisited = state.visitedBeats.has(beatId);
      const checkForVisited = condition.operator === '==' || condition.operator === 'contains';

      if (checkForVisited) {
        return hasVisited ? 'certain' : 'impossible';
      } else {
        // Checking for NOT visited
        return hasVisited ? 'impossible' : 'certain';
      }
    }

    // Handle timer conditions - timers are not tracked symbolically, so treat as possible
    if (condition.type === 'timer') {
      return 'possible';
    }

    // Handle counterCompare conditions
    if (condition.type === 'counterCompare') {
      const counter1 = condition.counter1 || (condition as any).left;
      const counter2 = condition.counter2 || (condition as any).right;
      if (!counter1 || !counter2) return 'possible';

      // Get values of both counters
      const constraints1 = state.constraints.get(counter1);
      const constraints2 = state.constraints.get(counter2);

      const value1 = this.getKnownValue(constraints1) ?? 0;
      const value2 = this.getKnownValue(constraints2) ?? 0;

      // If we know both values, evaluate directly
      if (value1 !== undefined && value2 !== undefined) {
        return this.evaluateConditionWithValue(condition.operator, value1, value2);
      }

      return 'possible';
    }

    const varName = condition.variableName || (condition as any).left || (condition as any).variable;
    if (!varName) return 'possible';

    const operator = condition.operator || '==';
    const value = condition.value ?? (condition as any).val ?? (condition as any).right;

    const existingConstraints = state.constraints.get(varName);

    // KEY FIX: If variable has no constraints, it has its DEFAULT value (0 for counters, false for booleans)
    if (!existingConstraints || existingConstraints.length === 0) {
      // Variable hasn't been set - use default value of 0/false
      const defaultValue = 0;
      return this.evaluateConditionWithValue(operator, defaultValue, value);
    }

    // Check for conflicts with existing constraints
    for (const existing of existingConstraints) {
      const conflict = this.constraintsConflict(existing, { variable: varName, operator: operator as any, value });
      if (conflict === 'definite') {
        return 'impossible';
      }
    }

    // Check if condition is already certain based on known values
    for (const existing of existingConstraints) {
      if (existing.operator === '==' && existing.value !== undefined) {
        // We know the exact value - evaluate the condition directly
        return this.evaluateConditionWithValue(operator, existing.value, value);
      }
      if (this.constraintImplies(existing, { variable: varName, operator: operator as any, value })) {
        return 'certain';
      }
    }

    return 'possible';
  }

  /**
   * Evaluate a condition given a known variable value
   */
  private evaluateConditionWithValue(
    operator: string,
    actualValue: any,
    conditionValue: any
  ): 'certain' | 'impossible' {
    // Normalize values for comparison
    const actual = this.normalizeValue(actualValue);
    const expected = this.normalizeValue(conditionValue);

    let result: boolean;
    switch (operator) {
      case '==':
      case '=':
        result = actual === expected;
        break;
      case '!=':
      case '<>':
        result = actual !== expected;
        break;
      case '>':
        result = actual > expected;
        break;
      case '>=':
        result = actual >= expected;
        break;
      case '<':
        result = actual < expected;
        break;
      case '<=':
        result = actual <= expected;
        break;
      default:
        return 'possible' as any; // Unknown operator, can't determine
    }

    return result ? 'certain' : 'impossible';
  }

  /**
   * Normalize a value for comparison (handle booleans, strings, numbers)
   */
  private normalizeValue(value: any): number | boolean | string {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === 'true') return 1;
    if (value === 'false') return 0;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? value : num;
    }
    return value;
  }

  /**
   * Get known value from constraints if exactly known, or undefined
   */
  private getKnownValue(constraints: VariableConstraint[] | undefined): number | undefined {
    if (!constraints || constraints.length === 0) return 0; // Default value
    const eqConstraint = constraints.find(c => c.operator === '==');
    if (eqConstraint && typeof eqConstraint.value === 'number') {
      return eqConstraint.value;
    }
    return undefined;
  }

  /**
   * Check inventory condition
   */
  private checkInventoryCondition(
    condition: Condition,
    state: SymbolicState
  ): 'possible' | 'certain' | 'impossible' {
    const item = (condition as any).item || condition.value;
    const character = (condition as any).character || 'player';
    const checkType = (condition as any).checkType || 'has';

    const inventory = state.inventory.get(character);
    const hasItem = inventory ? inventory.has(item) : false;

    if (checkType === 'has' || checkType === 'hasItem') {
      return hasItem ? 'certain' : 'impossible';
    } else if (checkType === 'notHas' || checkType === 'doesNotHave') {
      return hasItem ? 'impossible' : 'certain';
    }

    return 'possible';
  }

  /**
   * Check if two constraints definitely conflict
   */
  private constraintsConflict(
    c1: VariableConstraint,
    c2: VariableConstraint
  ): 'definite' | 'possible' | 'none' {
    if (c1.variable !== c2.variable) return 'none';

    // Handle equality constraints
    if (c1.operator === '==' && c2.operator === '==') {
      return c1.value !== c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '==' && c2.operator === '!=') {
      return c1.value === c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '!=' && c2.operator === '==') {
      return c1.value === c2.value ? 'definite' : 'none';
    }

    // Handle inequality constraints
    if (c1.operator === '>' && c2.operator === '<=') {
      return c1.value >= c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '>=' && c2.operator === '<') {
      return c1.value >= c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '<' && c2.operator === '>=') {
      return c1.value <= c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '<=' && c2.operator === '>') {
      return c1.value <= c2.value ? 'definite' : 'none';
    }

    // Handle > and < with same boundary
    if (c1.operator === '>' && c2.operator === '<' && typeof c1.value === 'number' && typeof c2.value === 'number') {
      return c1.value >= c2.value ? 'definite' : 'none';
    }

    if (c1.operator === '<' && c2.operator === '>' && typeof c1.value === 'number' && typeof c2.value === 'number') {
      return c1.value <= c2.value ? 'definite' : 'none';
    }

    return 'possible'; // Can't determine conflict
  }

  /**
   * Check if constraint c1 implies constraint c2
   */
  private constraintImplies(c1: VariableConstraint, c2: VariableConstraint): boolean {
    if (c1.variable !== c2.variable) return false;

    // Same constraint
    if (c1.operator === c2.operator && c1.value === c2.value) {
      return true;
    }

    // == implies itself and compatible inequalities
    if (c1.operator === '==' && typeof c1.value === 'number' && typeof c2.value === 'number') {
      if (c2.operator === '>=' && c1.value >= c2.value) return true;
      if (c2.operator === '<=' && c1.value <= c2.value) return true;
      if (c2.operator === '>' && c1.value > c2.value) return true;
      if (c2.operator === '<' && c1.value < c2.value) return true;
    }

    return false;
  }

  /**
   * Add a constraint from a condition
   */
  private addConstraintFromCondition(condition: Condition, state: SymbolicState): void {
    const varName = condition.variableName || (condition as any).left || (condition as any).variable;
    if (!varName) return;

    const constraint: VariableConstraint = {
      variable: varName,
      operator: (condition.operator || '==') as any,
      value: condition.value ?? (condition as any).val ?? (condition as any).right,
    };

    if (!state.constraints.has(varName)) {
      state.constraints.set(varName, []);
    }
    state.constraints.get(varName)!.push(constraint);
  }

  /**
   * Add the negation of a constraint
   */
  private addNegatedConstraint(condition: Condition, state: SymbolicState): void {
    const varName = condition.variableName || (condition as any).left || (condition as any).variable;
    if (!varName) return;

    const operator = condition.operator || '==';
    const value = condition.value ?? (condition as any).val ?? (condition as any).right;

    // Negate the operator
    const negatedOp = this.negateOperator(operator);

    const constraint: VariableConstraint = {
      variable: varName,
      operator: negatedOp as any,
      value,
    };

    if (!state.constraints.has(varName)) {
      state.constraints.set(varName, []);
    }
    state.constraints.get(varName)!.push(constraint);
  }

  /**
   * Negate a comparison operator
   */
  private negateOperator(op: string): string {
    const negations: Record<string, string> = {
      '==': '!=',
      '!=': '==',
      '>': '<=',
      '<': '>=',
      '>=': '<',
      '<=': '>',
      'has': 'notHas',
      'notHas': 'has',
    };
    return negations[op] || '!=';
  }

  /**
   * Apply state modifications from a beat (SetVariable, AddRemoveInventory, etc.)
   */
  private applyBeatEffects(beat: Beat, state: SymbolicState): void {
    const type = beat.type;
    const params = beat.getParameters();

    if (type === 'setVariable') {
      const varName = params.name || params.variableName || params.variable || params.counter;
      const value = params.value ?? params.val;
      const operation = params.operation || 'set';

      if (varName) {
        if (operation === 'set') {
          // Direct assignment - we know the exact value
          state.constraints.set(varName, [{
            variable: varName,
            operator: '==',
            value: value,
          }]);
        } else if (operation === 'change') {
          // Increment/decrement - calculate new value from existing
          const existingConstraints = state.constraints.get(varName);
          let currentValue = 0; // Default value for unset counters

          if (existingConstraints && existingConstraints.length > 0) {
            const eqConstraint = existingConstraints.find(c => c.operator === '==');
            if (eqConstraint && typeof eqConstraint.value === 'number') {
              currentValue = eqConstraint.value;
            }
          }

          const changeAmount = typeof value === 'number' ? value : parseFloat(value) || 0;
          const newValue = currentValue + changeAmount;

          state.constraints.set(varName, [{
            variable: varName,
            operator: '==',
            value: newValue,
          }]);
        }
      }
    }

    if (type === 'addRemoveInventory' && this.config.trackInventory) {
      const item = params.item;
      const character = params.character || 'player';
      const action = params.action || 'add';

      if (item) {
        if (!state.inventory.has(character)) {
          state.inventory.set(character, new Set());
        }
        if (action === 'add') {
          state.inventory.get(character)!.add(item);
        } else {
          state.inventory.get(character)!.delete(item);
        }
      }
    }
  }

  /**
   * Clone a symbolic state
   */
  private cloneState(state: SymbolicState): SymbolicState {
    const newConstraints = new Map<string, VariableConstraint[]>();
    state.constraints.forEach((constraints, key) => {
      newConstraints.set(key, [...constraints]);
    });

    const newInventory = new Map<string, Set<string>>();
    state.inventory.forEach((items, key) => {
      newInventory.set(key, new Set(items));
    });

    return {
      constraints: newConstraints,
      visitedBeats: new Set(state.visitedBeats),
      visitCounts: new Map(state.visitCounts),
      visitedBeatConstraints: new Map(state.visitedBeatConstraints),
      inventory: newInventory,
      currentPath: [...state.currentPath],
    };
  }

  /**
   * Check if constraints have changed since the last visit to this beat
   */
  private hasConstraintsChangedSinceLastVisit(beatId: string, state: SymbolicState): boolean {
    const previousHash = state.visitedBeatConstraints.get(beatId);
    if (!previousHash) return true; // Never visited before, so "changed" from nothing

    const currentHash = this.getConstraintHash(state.constraints);
    return previousHash !== currentHash;
  }

  /**
   * Get a hash string representing the current constraint state
   */
  private getConstraintHash(constraints: Map<string, VariableConstraint[]>): string {
    return [...constraints.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.map(c => `${c.operator}${c.value}`).sort().join(',')}`)
      .join('|');
  }

  /**
   * Get a signature for a path based on the key decision points (for deduplication)
   * This captures the ORDER of major branches taken, not every single beat
   */
  private getPathSignature(beatIds: string[]): string {
    // Filter to only include "key" beats that represent branch decisions
    // These are typically: movementChoice, conditionBeat, dialogTree choices
    const keyBeats = beatIds.filter(id => {
      const beat = this.story.getBeat(id);
      if (!beat) return false;
      // Include beats that represent key branching points or state changes
      const keyTypes = ['movementChoice', 'conditionBeat', 'condition', 'setVariable', 'endScreen', 'pickProp'];
      return keyTypes.includes(beat.type);
    });
    return keyBeats.join('→');
  }

  /**
   * Save a path from the current state
   */
  private savePath(
    state: SymbolicState,
    endType: SymbolicPath['endType'],
    endBeatId?: string
  ): void {
    if (state.currentPath.length === 0) return;
    this.savePathFromIds(state.currentPath, state.constraints, endType, endBeatId);
  }

  /**
   * Save a path from beat IDs
   */
  private savePathFromIds(
    beatIds: string[],
    constraints: Map<string, VariableConstraint[]>,
    endType: SymbolicPath['endType'],
    endBeatId?: string
  ): void {
    if (beatIds.length === 0) return;

    // Only store limited paths for display - we still COUNT all paths
    if (this.collectedPaths.length >= this.config.maxStoredPaths) {
      return;
    }

    // Build path nodes
    const nodes: SymbolicPathNode[] = beatIds.map(beatId => {
      const beat = this.story.getBeat(beatId);
      return {
        beatId,
        beatName: beat?.name || beatId,
        beatType: beat?.type || 'unknown',
        constraintsAtEntry: this.formatConstraints(constraints),
      };
    });

    // Build constraint strings for the path
    const constraintStrings = this.formatConstraints(constraints);

    const path: SymbolicPath = {
      id: `symbolic_path_${this.pathIdCounter++}`,
      nodes,
      length: nodes.length,
      endType,
      endBeatId,
      constraints: constraintStrings,
    };

    this.collectedPaths.push(path);
  }

  /**
   * Format constraints as human-readable strings
   */
  private formatConstraints(constraints: Map<string, VariableConstraint[]>): string[] {
    const result: string[] = [];
    constraints.forEach((constraintList, variable) => {
      for (const c of constraintList) {
        result.push(`${c.variable} ${c.operator} ${c.value}`);
      }
    });
    return result;
  }

  /**
   * Create a hash of the current state for memoization
   */
  private hashState(beatId: string, state: SymbolicState): string {
    // Simple hash: beat + sorted constraints
    const constraintStr = [...state.constraints.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.map(c => `${c.operator}${c.value}`).sort().join(',')}`)
      .join('|');

    return `${beatId}#${constraintStr}`;
  }

  /**
   * Cache state results (with size limit)
   */
  private cacheState(hash: string, endings: Set<string>): void {
    if (this.stateCache.size >= this.config.maxStates) {
      // Simple eviction: clear oldest entries (first 10%)
      const toDelete = Math.floor(this.config.maxStates * 0.1);
      const keys = [...this.stateCache.keys()].slice(0, toDelete);
      keys.forEach(k => this.stateCache.delete(k));
    }
    this.stateCache.set(hash, endings);
  }

  /**
   * Create empty result
   */
  private createEmptyResult(analysisTime: number): SymbolicPathResult {
    return {
      feasiblePaths: 0,
      paths: [],
      uniqueEndings: [],
      reachableBeats: [],
      unreachableBeats: [],
      constraintConflicts: 0,
      statesCached: 0,
      analysisTime,
    };
  }
}
