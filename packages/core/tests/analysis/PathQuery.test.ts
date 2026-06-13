/**
 * Tests for PathQueryEngine — query system over constraint-path
 * analysis results. The pure parseQuery + query-string interface
 * is testable in isolation; deep engine routing is exercised by
 * the ConstraintPathAnalyzer integration tests already.
 *
 * Coverage focus:
 *   - parseQuery: every supported syntax (has X, visits B, ends at
 *     E, avoids B, var op value); returns null for unparseable
 *     input
 *   - Numeric vs string value parsing
 *   - Operator coverage including the '=' → '==' coercion
 *   - Quote handling for strings + items with spaces
 *   - Case insensitivity
 *   - query() returns the original query + match count
 *   - Empty / no-match queries return an empty results array
 *     without crashing
 */
import { describe, it, expect } from 'vitest';
import { PathQueryEngine } from '../../src/analysis/PathQuery';
import type { ConstraintPathResult } from '../../src/analysis/ConstraintPathAnalyzer';

function emptyResult(): ConstraintPathResult {
  return {
    outcomes: [],
    uniqueEndings: [],
    statistics: {
      totalOutcomes: 0,
      totalConstraintSets: 0,
      uniqueEndingCount: 0,
      reachableEndingCount: 0,
    },
  } as any;
}

const engine = new PathQueryEngine(emptyResult());

describe('parseQuery', () => {
  describe('inventory queries', () => {
    it('parses "has X"', () => {
      expect(engine.parseQuery('has key')).toEqual({
        type: 'hasInventory',
        item: 'key',
        character: 'player',
      });
    });

    it('parses "has X" with quoted item', () => {
      expect(engine.parseQuery('has "golden key"')).toEqual({
        type: 'hasInventory',
        item: 'golden key',
        character: 'player',
      });
    });

    it('parses "has X" with single quotes', () => {
      expect(engine.parseQuery("has 'magic wand'")).toEqual({
        type: 'hasInventory',
        item: 'magic wand',
        character: 'player',
      });
    });

    it('is case-insensitive on the "has" keyword', () => {
      expect(engine.parseQuery('HAS key')?.type).toBe('hasInventory');
    });
  });

  describe('visit queries', () => {
    it('parses "visits B"', () => {
      expect(engine.parseQuery('visits beat-123')).toEqual({
        type: 'passesThrough',
        beatId: 'beat-123',
      });
    });

    it('is case-insensitive on the "visits" keyword', () => {
      expect(engine.parseQuery('VISITS X')?.type).toBe('passesThrough');
    });
  });

  describe('endings queries', () => {
    it('parses "ends at E"', () => {
      expect(engine.parseQuery('ends at ending-456')).toEqual({
        type: 'reachesEnding',
        beatId: 'ending-456',
      });
    });

    it('parses "ends E" (without "at")', () => {
      // The regex is `ends\s+(?:at\s+)?(.+)` so the `at` is optional.
      expect(engine.parseQuery('ends finale')).toEqual({
        type: 'reachesEnding',
        beatId: 'finale',
      });
    });
  });

  describe('avoid queries', () => {
    it('parses "avoids B"', () => {
      expect(engine.parseQuery('avoids dead-end')).toEqual({
        type: 'avoids',
        beatId: 'dead-end',
      });
    });
  });

  describe('variable constraint queries', () => {
    it('parses "var > N"', () => {
      expect(engine.parseQuery('adult > 7')).toEqual({
        type: 'hasConstraint',
        constraint: { variable: 'adult', operator: '>', value: 7 },
      });
    });

    it('parses "var == N"', () => {
      expect(engine.parseQuery('hp == 5')).toEqual({
        type: 'hasConstraint',
        constraint: { variable: 'hp', operator: '==', value: 5 },
      });
    });

    it('coerces single "=" to "==" (loose-equality forgiveness)', () => {
      // Users often type a single = for equality. The parser
      // accepts and rewrites to the canonical == operator.
      const result = engine.parseQuery('hp = 5');
      expect(result?.constraint?.operator).toBe('==');
    });

    it('parses all six numeric operators', () => {
      const ops = ['==', '!=', '>', '<', '>=', '<='];
      for (const op of ops) {
        const result = engine.parseQuery(`hp ${op} 5`);
        expect(result?.constraint?.operator, op).toBe(op);
      }
    });

    it('keeps non-numeric value as a string', () => {
      expect(engine.parseQuery('mood == happy')?.constraint?.value).toBe('happy');
    });

    it('strips quotes from quoted string values', () => {
      // The author wrote a quoted value to be safe; the parser
      // unwraps so the query matches the actual stored value.
      const result = engine.parseQuery('mood == "happy"');
      expect(result?.constraint?.value).toBe('happy');
    });

    it('parses negative numbers', () => {
      const result = engine.parseQuery('hp >= -5');
      expect(result?.constraint?.value).toBe(-5);
    });

    it('parses float values', () => {
      const result = engine.parseQuery('score >= 0.5');
      expect(result?.constraint?.value).toBe(0.5);
    });

    it('is case-insensitive on variable names (the input is lowercased)', () => {
      // Source lowercases via `.toLowerCase()` before matching.
      // This is a known limitation: case-sensitive variable
      // names ("Score" vs "score") would collide in query.
      // Pin so a future case-preserving refactor is deliberate.
      expect(engine.parseQuery('SCORE > 10')?.constraint?.variable).toBe('score');
    });
  });

  describe('unparseable input', () => {
    it('returns null for empty string', () => {
      expect(engine.parseQuery('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(engine.parseQuery('   ')).toBeNull();
    });

    it('returns null for "random text"', () => {
      // Without a known keyword (has/visits/ends/avoids) AND
      // without a comparison operator, the input isn't a query.
      expect(engine.parseQuery('random text without operator')).toBeNull();
    });

    it('returns null for "==" alone (no variable + value)', () => {
      expect(engine.parseQuery('==')).toBeNull();
    });
  });

  describe('precedence between rules', () => {
    it('"has X" is treated as inventory query, not constraint with var "has"', () => {
      // The keyword rules run BEFORE the generic constraint rule.
      const result = engine.parseQuery('has key');
      expect(result?.type).toBe('hasInventory');
    });
  });
});

describe('query()', () => {
  it('returns the original query in result.query', () => {
    const q: any = { type: 'passesThrough', beatId: 'b1' };
    const result = engine.query(q);
    expect(result.query).toBe(q);
  });

  it('returns 0 matches against an empty analysis result', () => {
    const result = engine.query({ type: 'passesThrough', beatId: 'b1' });
    expect(result.totalMatches).toBe(0);
    expect(result.matchingOutcomes).toEqual([]);
  });

  it('produces a human-readable query string', () => {
    const result = engine.query({ type: 'passesThrough', beatId: 'b1' });
    expect(typeof result.humanReadableQuery).toBe('string');
    expect(result.humanReadableQuery.length).toBeGreaterThan(0);
  });

  it('handles unknown query type with an empty match list (no crash)', () => {
    // Defensive — a future query type added to the union without
    // a matching case shouldn't crash; returns no matches.
    const result = engine.query({ type: 'unknown-future-type' } as any);
    expect(result.totalMatches).toBe(0);
  });
});
