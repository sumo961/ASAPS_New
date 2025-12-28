/**
 * ConstraintSet - Core types and utilities for constraint-based path analysis
 *
 * Key insight: Instead of enumerating all paths (exponential), we track
 * constraint sets that represent "classes of execution". Paths with the
 * same constraints and outcome are merged.
 */

import type { Condition } from '../types';

/**
 * Represents a constraint on a numeric variable (counter)
 */
export interface NumericRange {
  type: 'numeric';
  min?: number;    // Lower bound (inclusive), undefined = -infinity
  max?: number;    // Upper bound (inclusive), undefined = +infinity
  exact?: number;  // Known exact value (if set, min/max are ignored)
}

/**
 * Represents a constraint on a non-numeric variable
 */
export interface ValueConstraint {
  type: 'value';
  equals?: any;       // Must equal this value
  notEquals?: any[];  // Must not equal any of these values
}

/**
 * Union type for variable constraints
 */
export type VariableConstraint = NumericRange | ValueConstraint;

/**
 * Represents a set of constraints that must be true for a path class
 */
export interface ConstraintSet {
  // Variable constraints: variable name -> constraint
  variables: Map<string, VariableConstraint>;

  // Inventory requirements: character -> { has: items that must exist, notHas: items that must not exist }
  inventory: Map<string, { has: Set<string>; notHas: Set<string> }>;

  // Beats that MUST have been visited (required by visitedBeat conditions)
  requiredVisits: Set<string>;

  // Beats that must NOT have been visited
  forbiddenVisits: Set<string>;
}

/**
 * Represents an outcome group - paths that end at the same beat
 */
export interface OutcomeGroup {
  endingBeatId: string;
  endingBeatName: string;
  endType: 'ending' | 'deadEnd' | 'cycle';

  // Different constraint sets that can lead to this ending (disjunction)
  constraintSets: ConstraintSet[];

  // Representative path for visualization (one example)
  representativePath: PathStep[];

  // Statistics
  minPathLength: number;
  maxPathLength: number;
}

/**
 * A step in a path
 */
export interface PathStep {
  beatId: string;
  beatName: string;
  beatType: string;
  decisionMade?: string;  // For choice beats: which choice was made
  conditionResult?: boolean;  // For condition beats: true/false branch taken
}

/**
 * Result of constraint-based path analysis
 */
export interface ConstraintPathResult {
  outcomes: OutcomeGroup[];
  totalOutcomes: number;
  totalConstraintSets: number;  // Sum of constraint sets across all outcomes
  reachableBeats: string[];        // All beats reachable from start
  unreachableBeats: string[];      // Beats that cannot be reached
  uniqueEndings: string[];         // Unique ending beat IDs
  statesExplored: number;          // Number of states explored during analysis
  analysisTime: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty constraint set
 */
export function createEmptyConstraintSet(): ConstraintSet {
  return {
    variables: new Map(),
    inventory: new Map(),
    requiredVisits: new Set(),
    forbiddenVisits: new Set(),
  };
}

/**
 * Clone a constraint set (deep copy)
 */
export function cloneConstraintSet(cs: ConstraintSet): ConstraintSet {
  const cloned: ConstraintSet = {
    variables: new Map(),
    inventory: new Map(),
    requiredVisits: new Set(cs.requiredVisits),
    forbiddenVisits: new Set(cs.forbiddenVisits),
  };

  for (const [k, v] of cs.variables) {
    cloned.variables.set(k, { ...v } as VariableConstraint);
  }

  for (const [char, inv] of cs.inventory) {
    cloned.inventory.set(char, {
      has: new Set(inv.has),
      notHas: new Set(inv.notHas),
    });
  }

  return cloned;
}

/**
 * Add a constraint from a Condition to a ConstraintSet
 * Returns null if the constraint conflicts (making this path impossible)
 */
export function addConditionConstraint(
  cs: ConstraintSet,
  condition: Condition,
  branchTaken: boolean  // true = condition was true, false = condition was false
): ConstraintSet | null {
  const result = cloneConstraintSet(cs);

  if (condition.type === 'visitedBeat') {
    const beatId = condition.beatId || (condition as any).left;
    if (!beatId) return result;

    const checkingVisited = condition.operator === '==' || condition.operator === 'contains';

    if (branchTaken === checkingVisited) {
      // Must have visited
      if (result.forbiddenVisits.has(beatId)) return null; // Conflict
      result.requiredVisits.add(beatId);
    } else {
      // Must NOT have visited
      if (result.requiredVisits.has(beatId)) return null; // Conflict
      result.forbiddenVisits.add(beatId);
    }
    return result;
  }

  if (condition.type === 'inventory') {
    const character = (condition as any).character || 'player';
    const item = condition.variableName || (condition as any).item || (condition as any).left;
    if (!item) return result;

    const checkHas = condition.operator === '==' || condition.operator === 'contains' || condition.operator === 'has' as any;
    const mustHaveItem = branchTaken === checkHas;

    if (!result.inventory.has(character)) {
      result.inventory.set(character, { has: new Set(), notHas: new Set() });
    }
    const inv = result.inventory.get(character)!;

    if (mustHaveItem) {
      if (inv.notHas.has(item)) return null; // Conflict
      inv.has.add(item);
    } else {
      if (inv.has.has(item)) return null; // Conflict
      inv.notHas.add(item);
    }
    return result;
  }

  // Variable/counter conditions
  const varName = condition.variableName || (condition as any).left || (condition as any).variable;
  if (!varName) return result;

  const value = condition.value ?? (condition as any).val ?? (condition as any).right;
  let operator = condition.operator || '==';

  // If branch not taken, invert the operator
  if (!branchTaken) {
    operator = invertOperator(operator);
  }

  // Try to add/merge the constraint
  const existing = result.variables.get(varName);
  const newConstraint = operatorToConstraint(operator, value);

  if (!newConstraint) return result; // Unknown operator, can't constrain

  if (!existing) {
    result.variables.set(varName, newConstraint);
    return result;
  }

  // Merge constraints
  const merged = mergeConstraints(existing, newConstraint);
  if (merged === null) return null; // Conflict

  result.variables.set(varName, merged);
  return result;
}

type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not';

/**
 * Invert a comparison operator (for when condition is false)
 */
function invertOperator(op: string): ComparisonOperator {
  switch (op) {
    case '==': case '=': return '!=';
    case '!=': case '<>': return '==';
    case '>': return '<=';
    case '>=': return '<';
    case '<': return '>=';
    case '<=': return '>';
    default: return op as ComparisonOperator;
  }
}

/**
 * Convert an operator and value to a constraint
 */
function operatorToConstraint(operator: string, value: any): VariableConstraint | null {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  const isNumeric = !isNaN(numValue);

  switch (operator) {
    case '==':
    case '=':
      if (isNumeric) {
        return { type: 'numeric', exact: numValue };
      }
      return { type: 'value', equals: value };

    case '!=':
    case '<>':
      if (isNumeric) {
        // != to a number is hard to represent as a range, use value constraint
        return { type: 'value', notEquals: [value] };
      }
      return { type: 'value', notEquals: [value] };

    case '>':
      if (isNumeric) {
        return { type: 'numeric', min: numValue + 1 };
      }
      return null;

    case '>=':
      if (isNumeric) {
        return { type: 'numeric', min: numValue };
      }
      return null;

    case '<':
      if (isNumeric) {
        return { type: 'numeric', max: numValue - 1 };
      }
      return null;

    case '<=':
      if (isNumeric) {
        return { type: 'numeric', max: numValue };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Merge two constraints on the same variable
 * Returns null if they conflict (impossible to satisfy both)
 */
function mergeConstraints(a: VariableConstraint, b: VariableConstraint): VariableConstraint | null {
  // If either has exact value
  if (a.type === 'numeric' && a.exact !== undefined) {
    return mergeWithExact(a.exact, b);
  }
  if (b.type === 'numeric' && b.exact !== undefined) {
    return mergeWithExact(b.exact, a);
  }

  // Both are ranges
  if (a.type === 'numeric' && b.type === 'numeric') {
    const min = Math.max(a.min ?? -Infinity, b.min ?? -Infinity);
    const max = Math.min(a.max ?? Infinity, b.max ?? Infinity);

    if (min > max) return null; // Empty range = conflict
    if (min === max) {
      return { type: 'numeric', exact: min };
    }
    return {
      type: 'numeric',
      min: min === -Infinity ? undefined : min,
      max: max === Infinity ? undefined : max,
    };
  }

  // Value constraints
  if (a.type === 'value' && b.type === 'value') {
    // Helper to merge and deduplicate notEquals arrays
    const mergeNotEquals = (arr1?: any[], arr2?: any[]): any[] | undefined => {
      if (!arr1 && !arr2) return undefined;
      const combined = [...(arr1 || []), ...(arr2 || [])];
      return [...new Set(combined)];
    };

    // Both have equals
    if (a.equals !== undefined && b.equals !== undefined) {
      if (a.equals !== b.equals) return null; // Conflict
      return { type: 'value', equals: a.equals, notEquals: mergeNotEquals(a.notEquals, b.notEquals) };
    }

    // One has equals, check it's not in other's notEquals
    if (a.equals !== undefined) {
      if (b.notEquals?.includes(a.equals)) return null;
      return { type: 'value', equals: a.equals, notEquals: b.notEquals };
    }
    if (b.equals !== undefined) {
      if (a.notEquals?.includes(b.equals)) return null;
      return { type: 'value', equals: b.equals, notEquals: a.notEquals };
    }

    // Both just have notEquals - merge and deduplicate
    return { type: 'value', notEquals: mergeNotEquals(a.notEquals, b.notEquals) };
  }

  // Mixed types - check for conflicts
  if (a.type === 'numeric' && b.type === 'value') {
    if (b.equals !== undefined) {
      const numVal = typeof b.equals === 'number' ? b.equals : parseFloat(b.equals);
      if (!isNaN(numVal)) {
        if ((a.min !== undefined && numVal < a.min) || (a.max !== undefined && numVal > a.max)) {
          return null; // Conflict
        }
        return { type: 'numeric', exact: numVal };
      }
    }
    return a; // Keep numeric constraint
  }

  if (a.type === 'value' && b.type === 'numeric') {
    return mergeConstraints(b, a);
  }

  return a; // Default: keep first
}

/**
 * Merge an exact value with another constraint
 */
function mergeWithExact(exact: number, other: VariableConstraint): VariableConstraint | null {
  if (other.type === 'numeric') {
    if (other.exact !== undefined && other.exact !== exact) return null;
    if (other.min !== undefined && exact < other.min) return null;
    if (other.max !== undefined && exact > other.max) return null;
    return { type: 'numeric', exact };
  }

  if (other.type === 'value') {
    if (other.equals !== undefined && other.equals !== exact) return null;
    if (other.notEquals?.includes(exact)) return null;
    return { type: 'numeric', exact };
  }

  return { type: 'numeric', exact };
}

/**
 * Check if a constraint set is satisfied by a concrete state
 */
export function constraintSetSatisfied(
  cs: ConstraintSet,
  state: {
    variables: Map<string, any>;
    inventory: Map<string, Set<string>>;
    visitedBeats: Set<string>;
  }
): boolean {
  // Check variable constraints
  for (const [varName, constraint] of cs.variables) {
    const value = state.variables.get(varName);
    if (!satisfiesConstraint(value, constraint)) return false;
  }

  // Check inventory
  for (const [char, inv] of cs.inventory) {
    const charInv = state.inventory.get(char) || new Set();
    for (const item of inv.has) {
      if (!charInv.has(item)) return false;
    }
    for (const item of inv.notHas) {
      if (charInv.has(item)) return false;
    }
  }

  // Check visits
  for (const beatId of cs.requiredVisits) {
    if (!state.visitedBeats.has(beatId)) return false;
  }
  for (const beatId of cs.forbiddenVisits) {
    if (state.visitedBeats.has(beatId)) return false;
  }

  return true;
}

function satisfiesConstraint(value: any, constraint: VariableConstraint): boolean {
  if (value === undefined) return false;

  if (constraint.type === 'numeric') {
    const numVal = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numVal)) return false;

    if (constraint.exact !== undefined) return numVal === constraint.exact;
    if (constraint.min !== undefined && numVal < constraint.min) return false;
    if (constraint.max !== undefined && numVal > constraint.max) return false;
    return true;
  }

  if (constraint.type === 'value') {
    if (constraint.equals !== undefined && value !== constraint.equals) return false;
    if (constraint.notEquals?.includes(value)) return false;
    return true;
  }

  return true;
}

/**
 * Convert a constraint set to human-readable strings
 */
export function constraintSetToStrings(cs: ConstraintSet): string[] {
  const strings: string[] = [];

  for (const [varName, constraint] of cs.variables) {
    strings.push(constraintToString(varName, constraint));
  }

  for (const [char, inv] of cs.inventory) {
    for (const item of inv.has) {
      strings.push(`${char} has "${item}"`);
    }
    for (const item of inv.notHas) {
      strings.push(`${char} doesn't have "${item}"`);
    }
  }

  for (const beatId of cs.requiredVisits) {
    strings.push(`visited beat ${beatId}`);
  }
  for (const beatId of cs.forbiddenVisits) {
    strings.push(`not visited beat ${beatId}`);
  }

  return strings;
}

function constraintToString(varName: string, c: VariableConstraint): string {
  if (c.type === 'numeric') {
    if (c.exact !== undefined) return `${varName} = ${c.exact}`;
    if (c.min !== undefined && c.max !== undefined) {
      return `${c.min} <= ${varName} <= ${c.max}`;
    }
    if (c.min !== undefined) return `${varName} >= ${c.min}`;
    if (c.max !== undefined) return `${varName} <= ${c.max}`;
    return `${varName} (any)`;
  }

  if (c.type === 'value') {
    if (c.equals !== undefined) return `${varName} = "${c.equals}"`;
    if (c.notEquals?.length) {
      return `${varName} != ${c.notEquals.map(v => `"${v}"`).join(', ')}`;
    }
    return `${varName} (any)`;
  }

  return `${varName} (unknown)`;
}

/**
 * Create a hash of a constraint set for comparison/memoization
 */
export function hashConstraintSet(cs: ConstraintSet): string {
  const parts: string[] = [];

  // Sort variables for consistent hashing
  const sortedVars = [...cs.variables.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, c] of sortedVars) {
    parts.push(`v:${name}=${constraintToString(name, c)}`);
  }

  // Sort inventory
  const sortedInv = [...cs.inventory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [char, inv] of sortedInv) {
    const has = [...inv.has].sort().join(',');
    const notHas = [...inv.notHas].sort().join(',');
    parts.push(`i:${char}=[${has}]/[${notHas}]`);
  }

  // Sort visits
  parts.push(`req:${[...cs.requiredVisits].sort().join(',')}`);
  parts.push(`forbid:${[...cs.forbiddenVisits].sort().join(',')}`);

  return parts.join('|');
}

/**
 * Check if two constraint sets are compatible (can be merged)
 */
export function constraintSetsCompatible(a: ConstraintSet, b: ConstraintSet): boolean {
  // Check variable constraints
  for (const [varName, constraintA] of a.variables) {
    const constraintB = b.variables.get(varName);
    if (constraintB && mergeConstraints(constraintA, constraintB) === null) {
      return false;
    }
  }

  // Check inventory
  for (const [char, invA] of a.inventory) {
    const invB = b.inventory.get(char);
    if (invB) {
      // Check if any "has" in A conflicts with "notHas" in B
      for (const item of invA.has) {
        if (invB.notHas.has(item)) return false;
      }
      for (const item of invA.notHas) {
        if (invB.has.has(item)) return false;
      }
    }
  }

  // Check visits
  for (const beatId of a.requiredVisits) {
    if (b.forbiddenVisits.has(beatId)) return false;
  }
  for (const beatId of a.forbiddenVisits) {
    if (b.requiredVisits.has(beatId)) return false;
  }

  return true;
}

/**
 * Merge two compatible constraint sets
 */
export function mergeConstraintSets(a: ConstraintSet, b: ConstraintSet): ConstraintSet | null {
  if (!constraintSetsCompatible(a, b)) return null;

  const result = cloneConstraintSet(a);

  // Merge variables
  for (const [varName, constraintB] of b.variables) {
    const constraintA = result.variables.get(varName);
    if (constraintA) {
      const merged = mergeConstraints(constraintA, constraintB);
      if (merged === null) return null;
      result.variables.set(varName, merged);
    } else {
      result.variables.set(varName, { ...constraintB } as VariableConstraint);
    }
  }

  // Merge inventory
  for (const [char, invB] of b.inventory) {
    if (!result.inventory.has(char)) {
      result.inventory.set(char, { has: new Set(), notHas: new Set() });
    }
    const inv = result.inventory.get(char)!;
    for (const item of invB.has) inv.has.add(item);
    for (const item of invB.notHas) inv.notHas.add(item);
  }

  // Merge visits
  for (const beatId of b.requiredVisits) result.requiredVisits.add(beatId);
  for (const beatId of b.forbiddenVisits) result.forbiddenVisits.add(beatId);

  return result;
}
