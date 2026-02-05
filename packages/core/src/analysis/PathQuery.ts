/**
 * PathQuery - Query system for path analysis
 *
 * Allows asking questions like:
 * - "Which outcomes have adult > 7?"
 * - "Which paths pass through beat X?"
 * - "What can I reach if I have item Y?"
 */

import type { Condition } from '../types';
import {
  ConstraintSet,
  OutcomeGroup,
  PathStep,
  NumericRange,
  ValueConstraint,
  constraintSetToStrings,
} from './ConstraintSet';
import type { ConstraintPathResult } from './ConstraintPathAnalyzer';

/**
 * Query types
 */
export type PathQueryType =
  | 'hasConstraint'     // Outcomes where a constraint is satisfied
  | 'passesThrough'     // Outcomes that pass through a specific beat
  | 'reachesEnding'     // Outcomes that reach a specific ending
  | 'hasInventory'      // Outcomes where player has specific item
  | 'avoids'            // Outcomes that don't visit a specific beat
  ;

/**
 * A query for filtering outcomes
 */
export interface PathQuery {
  type: PathQueryType;

  // For hasConstraint: the constraint to check
  constraint?: {
    variable: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
    value: any;
  };

  // For passesThrough, avoids, reachesEnding: beat ID
  beatId?: string;

  // For hasInventory: item name (and optionally character)
  item?: string;
  character?: string;
}

/**
 * Result of a query
 */
export interface QueryResult {
  query: PathQuery;
  matchingOutcomes: OutcomeGroup[];
  totalMatches: number;
  humanReadableQuery: string;
}

/**
 * PathQueryEngine - Execute queries on path analysis results
 */
export class PathQueryEngine {
  private analysisResult: ConstraintPathResult;

  constructor(analysisResult: ConstraintPathResult) {
    this.analysisResult = analysisResult;
  }

  /**
   * Execute a query
   */
  public query(q: PathQuery): QueryResult {
    const humanReadable = this.queryToString(q);
    let matching: OutcomeGroup[];

    switch (q.type) {
      case 'hasConstraint':
        matching = this.filterByConstraint(q);
        break;

      case 'passesThrough':
        matching = this.filterByPassesThrough(q);
        break;

      case 'reachesEnding':
        matching = this.filterByEnding(q);
        break;

      case 'hasInventory':
        matching = this.filterByInventory(q);
        break;

      case 'avoids':
        matching = this.filterByAvoids(q);
        break;

      default:
        matching = [];
    }

    return {
      query: q,
      matchingOutcomes: matching,
      totalMatches: matching.length,
      humanReadableQuery: humanReadable,
    };
  }

  /**
   * Parse a query string into a PathQuery
   * Supports formats like:
   * - "adult > 7"
   * - "adult == 5"
   * - "has axe"
   * - "visits beat-123"
   * - "ends at ending-456"
   */
  public parseQuery(queryString: string): PathQuery | null {
    const trimmed = queryString.trim().toLowerCase();

    // Check for inventory query
    const hasMatch = trimmed.match(/^has\s+["']?([^"']+)["']?$/i);
    if (hasMatch) {
      return {
        type: 'hasInventory',
        item: hasMatch[1],
        character: 'player',
      };
    }

    // Check for "visits" query
    const visitsMatch = trimmed.match(/^visits\s+(.+)$/i);
    if (visitsMatch) {
      return {
        type: 'passesThrough',
        beatId: visitsMatch[1],
      };
    }

    // Check for "ends at" query
    const endsMatch = trimmed.match(/^ends\s+(?:at\s+)?(.+)$/i);
    if (endsMatch) {
      return {
        type: 'reachesEnding',
        beatId: endsMatch[1],
      };
    }

    // Check for "avoids" query
    const avoidsMatch = trimmed.match(/^avoids\s+(.+)$/i);
    if (avoidsMatch) {
      return {
        type: 'avoids',
        beatId: avoidsMatch[1],
      };
    }

    // Check for variable constraint
    const constraintMatch = trimmed.match(/^(\w+)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);
    if (constraintMatch) {
      const operator: '==' | '!=' | '>' | '<' | '>=' | '<=' =
        constraintMatch[2] === '=' ? '==' : constraintMatch[2] as '==' | '!=' | '>' | '<' | '>=' | '<=';

      let value: any = constraintMatch[3].trim();
      // Try to parse as number
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        value = numValue;
      } else {
        // Remove quotes if present
        value = value.replace(/^["']|["']$/g, '');
      }

      return {
        type: 'hasConstraint',
        constraint: {
          variable: constraintMatch[1],
          operator,
          value,
        },
      };
    }

    return null;
  }

  /**
   * Filter outcomes by variable constraint
   */
  private filterByConstraint(q: PathQuery): OutcomeGroup[] {
    if (!q.constraint) return [];

    const { variable, operator, value } = q.constraint;

    return this.analysisResult.outcomes.filter((outcome: OutcomeGroup) => {
      return outcome.constraintSets.some((cs: ConstraintSet) => {
        return this.constraintSetImplies(cs, variable, operator, value);
      });
    });
  }

  /**
   * Check if a constraint set implies a condition
   */
  private constraintSetImplies(
    cs: ConstraintSet,
    variable: string,
    operator: string,
    value: any
  ): boolean {
    const constraint = cs.variables.get(variable);
    if (!constraint) {
      // Variable not constrained - could be anything, so it MIGHT satisfy
      // Return true to be inclusive (show outcomes where this could be true)
      return true;
    }

    const numValue = typeof value === 'number' ? value : parseFloat(value);
    const isNumericValue = !isNaN(numValue);

    if (constraint.type === 'numeric') {
      if (!isNumericValue) return false;

      // Check if the constraint range satisfies the query condition
      if (constraint.exact !== undefined) {
        return this.evaluateCondition(constraint.exact, operator, numValue);
      }

      // Range constraint
      const min = constraint.min ?? -Infinity;
      const max = constraint.max ?? Infinity;

      switch (operator) {
        case '==':
          return min <= numValue && numValue <= max;
        case '!=':
          return min > numValue || max < numValue;
        case '>':
          return max > numValue;
        case '>=':
          return max >= numValue;
        case '<':
          return min < numValue;
        case '<=':
          return min <= numValue;
        default:
          return false;
      }
    }

    if (constraint.type === 'value') {
      if (constraint.equals !== undefined) {
        return this.evaluateCondition(constraint.equals, operator, value);
      }

      // notEquals constraint
      if (constraint.notEquals?.length) {
        if (operator === '!=' && constraint.notEquals.includes(value)) {
          return true;  // We know it's not equal to this value
        }
        if (operator === '==' && constraint.notEquals.includes(value)) {
          return false;  // We know it CAN'T equal this value
        }
      }

      return true;  // Unknown - might satisfy
    }

    return true;
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case '==': return actual === expected || String(actual) === String(expected);
      case '!=': return actual !== expected && String(actual) !== String(expected);
      case '>': return actual > expected;
      case '>=': return actual >= expected;
      case '<': return actual < expected;
      case '<=': return actual <= expected;
      default: return false;
    }
  }

  /**
   * Filter outcomes by beat they pass through
   */
  private filterByPassesThrough(q: PathQuery): OutcomeGroup[] {
    if (!q.beatId) return [];

    return this.analysisResult.outcomes.filter((outcome: OutcomeGroup) => {
      // Check representative path
      return outcome.representativePath.some((step: PathStep) => step.beatId === q.beatId);
    });
  }

  /**
   * Filter outcomes by ending beat
   */
  private filterByEnding(q: PathQuery): OutcomeGroup[] {
    if (!q.beatId) return [];

    return this.analysisResult.outcomes.filter((outcome: OutcomeGroup) => {
      return outcome.endingBeatId === q.beatId ||
             outcome.endingBeatName.toLowerCase().includes(q.beatId!.toLowerCase());
    });
  }

  /**
   * Filter outcomes by inventory
   */
  private filterByInventory(q: PathQuery): OutcomeGroup[] {
    if (!q.item) return [];

    const character = q.character || 'player';
    const item = q.item.toLowerCase();

    return this.analysisResult.outcomes.filter((outcome: OutcomeGroup) => {
      return outcome.constraintSets.some((cs: ConstraintSet) => {
        const inv = cs.inventory.get(character);
        if (!inv) return true;  // Unknown inventory, might have it

        // Check if we MUST have the item
        for (const hasItem of inv.has) {
          if (hasItem.toLowerCase() === item) return true;
        }

        // Check if we definitely DON'T have it
        for (const notHasItem of inv.notHas) {
          if (notHasItem.toLowerCase() === item) return false;
        }

        return true;  // Unknown
      });
    });
  }

  /**
   * Filter outcomes that avoid a beat
   */
  private filterByAvoids(q: PathQuery): OutcomeGroup[] {
    if (!q.beatId) return [];

    return this.analysisResult.outcomes.filter((outcome: OutcomeGroup) => {
      // Check representative path
      return !outcome.representativePath.some((step: PathStep) => step.beatId === q.beatId);
    });
  }

  /**
   * Convert query to human-readable string
   */
  private queryToString(q: PathQuery): string {
    switch (q.type) {
      case 'hasConstraint':
        if (q.constraint) {
          const { variable, operator, value } = q.constraint;
          return `${variable} ${operator} ${value}`;
        }
        return 'Unknown constraint';

      case 'passesThrough':
        return `Passes through "${q.beatId}"`;

      case 'reachesEnding':
        return `Ends at "${q.beatId}"`;

      case 'hasInventory':
        return `${q.character || 'Player'} has "${q.item}"`;

      case 'avoids':
        return `Avoids "${q.beatId}"`;

      default:
        return 'Unknown query';
    }
  }

  /**
   * Get suggested queries based on the analysis result
   */
  public getSuggestedQueries(): PathQuery[] {
    const suggestions: PathQuery[] = [];

    // Collect all variables mentioned in constraint sets
    const variables = new Set<string>();
    for (const outcome of this.analysisResult.outcomes) {
      for (const cs of outcome.constraintSets) {
        for (const varName of cs.variables.keys()) {
          variables.add(varName);
        }
      }
    }

    // Suggest queries for each variable
    for (const varName of variables) {
      suggestions.push({
        type: 'hasConstraint',
        constraint: { variable: varName, operator: '>', value: 0 },
      });
    }

    // Suggest ending queries
    const endings = new Set<string>();
    for (const outcome of this.analysisResult.outcomes) {
      if (outcome.endType === 'ending') {
        endings.add(outcome.endingBeatId);
      }
    }

    for (const endingId of endings) {
      suggestions.push({
        type: 'reachesEnding',
        beatId: endingId,
      });
    }

    return suggestions.slice(0, 10);  // Limit suggestions
  }
}
