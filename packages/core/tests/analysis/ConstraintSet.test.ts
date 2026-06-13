/**
 * Tests for ConstraintSet — pure algebra over symbolic path
 * conditions. Used by ConstraintPathAnalyzer to track "classes of
 * execution" without enumerating all paths (the exponential blow-up
 * the source warns about). Wrong algebra produces wrong reachability
 * answers — the editor will tell authors a path doesn't exist when
 * it does, or vice versa.
 *
 * Coverage focus:
 *   - createEmptyConstraintSet / cloneConstraintSet identity + isolation
 *   - constraintSetSatisfied: variables (numeric exact/min/max,
 *     value equals/notEquals), inventory has/notHas, required +
 *     forbidden visits
 *   - constraintSetToStrings: each constraint variety renders
 *   - hashConstraintSet: deterministic + position-independent
 *     (same content + different insertion order → same hash)
 *   - constraintSetsCompatible / mergeConstraintSets: conflicting
 *     visits + inventory cause null; non-conflicting merge to a
 *     superset
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyConstraintSet,
  cloneConstraintSet,
  constraintSetSatisfied,
  constraintSetToStrings,
  hashConstraintSet,
  constraintSetsCompatible,
  mergeConstraintSets,
  type ConstraintSet,
} from '../../src/analysis/ConstraintSet';

/** Build a runtime state matching the satisfied() signature. */
function state(opts: {
  variables?: Record<string, any>;
  inventory?: Record<string, string[]>;
  visited?: string[];
}) {
  return {
    variables: new Map(Object.entries(opts.variables ?? {})),
    inventory: new Map(
      Object.entries(opts.inventory ?? {}).map(([c, items]) => [c, new Set(items)]),
    ),
    visitedBeats: new Set(opts.visited ?? []),
  };
}

describe('createEmptyConstraintSet', () => {
  it('returns a constraint set with empty maps / sets', () => {
    const cs = createEmptyConstraintSet();
    expect(cs.variables.size).toBe(0);
    expect(cs.inventory.size).toBe(0);
    expect(cs.requiredVisits.size).toBe(0);
    expect(cs.forbiddenVisits.size).toBe(0);
  });

  it('returns distinct instances each call (no shared state)', () => {
    // Critical for the path-analyzer which calls this in a hot
    // loop. Sharing state would let one branch's constraints
    // leak into another.
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    expect(b.requiredVisits.has('beat1')).toBe(false);
  });
});

describe('cloneConstraintSet', () => {
  it('preserves variables', () => {
    const cs = createEmptyConstraintSet();
    cs.variables.set('hp', { type: 'numeric', exact: 5 });
    const cloned = cloneConstraintSet(cs);
    expect(cloned.variables.get('hp')).toEqual({ type: 'numeric', exact: 5 });
  });

  it('clones variables to a new map (mutation isolation)', () => {
    const cs = createEmptyConstraintSet();
    cs.variables.set('hp', { type: 'numeric', exact: 5 });
    const cloned = cloneConstraintSet(cs);
    cloned.variables.set('hp', { type: 'numeric', exact: 10 });
    expect(cs.variables.get('hp')).toEqual({ type: 'numeric', exact: 5 });
  });

  it('clones inventory sets deeply', () => {
    const cs = createEmptyConstraintSet();
    cs.inventory.set('player', { has: new Set(['key']), notHas: new Set(['poison']) });
    const cloned = cloneConstraintSet(cs);
    cloned.inventory.get('player')!.has.add('sword');
    // Original NOT affected.
    expect(cs.inventory.get('player')!.has.has('sword')).toBe(false);
  });

  it('clones requiredVisits + forbiddenVisits', () => {
    const cs = createEmptyConstraintSet();
    cs.requiredVisits.add('beat1');
    cs.forbiddenVisits.add('beat2');
    const cloned = cloneConstraintSet(cs);
    cloned.requiredVisits.add('beat3');
    expect(cs.requiredVisits.has('beat3')).toBe(false);
  });
});

describe('constraintSetSatisfied', () => {
  describe('variable constraints', () => {
    it('numeric exact match → satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', exact: 5 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 5 } }))).toBe(true);
    });

    it('numeric exact mismatch → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', exact: 5 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 6 } }))).toBe(false);
    });

    it('numeric range: value within bounds → satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', min: 1, max: 10 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 5 } }))).toBe(true);
    });

    it('numeric range: below min → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', min: 1 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 0 } }))).toBe(false);
    });

    it('numeric range: above max → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', max: 10 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 11 } }))).toBe(false);
    });

    it('parses string values as numbers for numeric constraints', () => {
      // Variables may be stored as strings ("5") but compared as
      // numbers. Pin so a future strict-type refactor is visible.
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', exact: 5 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: '5' } }))).toBe(true);
    });

    it('NaN-string variable → not satisfied for numeric constraint', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', exact: 5 });
      expect(constraintSetSatisfied(cs, state({ variables: { hp: 'not a number' } }))).toBe(false);
    });

    it('undefined variable → not satisfied', () => {
      // Constrained-but-unset variable is a non-match.
      const cs = createEmptyConstraintSet();
      cs.variables.set('hp', { type: 'numeric', exact: 5 });
      expect(constraintSetSatisfied(cs, state({}))).toBe(false);
    });

    it('value equals match', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('mood', { type: 'value', equals: 'happy' });
      expect(constraintSetSatisfied(cs, state({ variables: { mood: 'happy' } }))).toBe(true);
    });

    it('value equals mismatch', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('mood', { type: 'value', equals: 'happy' });
      expect(constraintSetSatisfied(cs, state({ variables: { mood: 'sad' } }))).toBe(false);
    });

    it('value notEquals: any forbidden value → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.variables.set('mood', { type: 'value', notEquals: ['sad', 'angry'] });
      expect(constraintSetSatisfied(cs, state({ variables: { mood: 'sad' } }))).toBe(false);
      expect(constraintSetSatisfied(cs, state({ variables: { mood: 'happy' } }))).toBe(true);
    });
  });

  describe('inventory constraints', () => {
    it('required item present → satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.inventory.set('player', { has: new Set(['key']), notHas: new Set() });
      expect(constraintSetSatisfied(cs, state({ inventory: { player: ['key'] } }))).toBe(true);
    });

    it('required item missing → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.inventory.set('player', { has: new Set(['key']), notHas: new Set() });
      expect(constraintSetSatisfied(cs, state({ inventory: { player: [] } }))).toBe(false);
    });

    it('forbidden item present → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.inventory.set('player', { has: new Set(), notHas: new Set(['poison']) });
      expect(constraintSetSatisfied(cs, state({ inventory: { player: ['poison'] } }))).toBe(false);
    });

    it('character missing from state inventory → empty set treated as no items', () => {
      // Defensive — querying for a character not in state should
      // treat as "has no items". Required items would fail; forbidden
      // would pass.
      const cs = createEmptyConstraintSet();
      cs.inventory.set('alice', { has: new Set(['key']), notHas: new Set() });
      expect(constraintSetSatisfied(cs, state({}))).toBe(false);

      const cs2 = createEmptyConstraintSet();
      cs2.inventory.set('alice', { has: new Set(), notHas: new Set(['poison']) });
      expect(constraintSetSatisfied(cs2, state({}))).toBe(true);
    });
  });

  describe('visit constraints', () => {
    it('required visit present → satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.requiredVisits.add('beat1');
      expect(constraintSetSatisfied(cs, state({ visited: ['beat1'] }))).toBe(true);
    });

    it('required visit missing → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.requiredVisits.add('beat1');
      expect(constraintSetSatisfied(cs, state({ visited: [] }))).toBe(false);
    });

    it('forbidden visit present → not satisfied', () => {
      const cs = createEmptyConstraintSet();
      cs.forbiddenVisits.add('badbeat');
      expect(constraintSetSatisfied(cs, state({ visited: ['badbeat'] }))).toBe(false);
    });
  });

  describe('empty constraint set', () => {
    it('always satisfied (no constraints to check)', () => {
      const cs = createEmptyConstraintSet();
      expect(constraintSetSatisfied(cs, state({}))).toBe(true);
    });
  });
});

describe('constraintSetToStrings', () => {
  it('renders variables with constraint summary', () => {
    const cs = createEmptyConstraintSet();
    cs.variables.set('hp', { type: 'numeric', exact: 5 });
    const strings = constraintSetToStrings(cs);
    expect(strings.length).toBe(1);
    expect(strings[0]).toContain('hp');
    expect(strings[0]).toContain('5');
  });

  it('renders inventory has + notHas', () => {
    const cs = createEmptyConstraintSet();
    cs.inventory.set('player', {
      has: new Set(['key']),
      notHas: new Set(['poison']),
    });
    const strings = constraintSetToStrings(cs);
    expect(strings.some(s => s.includes('has') && s.includes('key'))).toBe(true);
    expect(strings.some(s => s.includes("doesn't have") && s.includes('poison'))).toBe(true);
  });

  it('renders required + forbidden visits', () => {
    const cs = createEmptyConstraintSet();
    cs.requiredVisits.add('beat1');
    cs.forbiddenVisits.add('beat2');
    const strings = constraintSetToStrings(cs);
    expect(strings).toContain('visited beat beat1');
    expect(strings).toContain('not visited beat beat2');
  });

  it('returns empty array for empty set', () => {
    expect(constraintSetToStrings(createEmptyConstraintSet())).toEqual([]);
  });
});

describe('hashConstraintSet', () => {
  it('returns the same hash for two equal sets', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('b1');
    b.requiredVisits.add('b1');
    expect(hashConstraintSet(a)).toBe(hashConstraintSet(b));
  });

  it('insertion-order-independent (sorted internally)', () => {
    // Critical for memoization: hashing the same content in
    // different insertion orders must produce the same hash.
    const a = createEmptyConstraintSet();
    a.variables.set('hp', { type: 'numeric', exact: 5 });
    a.variables.set('mp', { type: 'numeric', exact: 10 });

    const b = createEmptyConstraintSet();
    b.variables.set('mp', { type: 'numeric', exact: 10 });
    b.variables.set('hp', { type: 'numeric', exact: 5 });

    expect(hashConstraintSet(a)).toBe(hashConstraintSet(b));
  });

  it('different constraints → different hashes', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.variables.set('hp', { type: 'numeric', exact: 5 });
    b.variables.set('hp', { type: 'numeric', exact: 6 });
    expect(hashConstraintSet(a)).not.toBe(hashConstraintSet(b));
  });

  it('different requiredVisits → different hashes', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    b.requiredVisits.add('beat2');
    expect(hashConstraintSet(a)).not.toBe(hashConstraintSet(b));
  });
});

describe('constraintSetsCompatible', () => {
  it('two empty sets are compatible', () => {
    expect(constraintSetsCompatible(
      createEmptyConstraintSet(), createEmptyConstraintSet(),
    )).toBe(true);
  });

  it('required visit in A conflicts with forbidden in B', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    b.forbiddenVisits.add('beat1');
    expect(constraintSetsCompatible(a, b)).toBe(false);
  });

  it('required item in A conflicts with notHas in B', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.inventory.set('player', { has: new Set(['key']), notHas: new Set() });
    b.inventory.set('player', { has: new Set(), notHas: new Set(['key']) });
    expect(constraintSetsCompatible(a, b)).toBe(false);
  });

  it('compatible inventories merge cleanly', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.inventory.set('player', { has: new Set(['key']), notHas: new Set() });
    b.inventory.set('player', { has: new Set(['sword']), notHas: new Set() });
    expect(constraintSetsCompatible(a, b)).toBe(true);
  });
});

describe('mergeConstraintSets', () => {
  it('returns null when sets are incompatible', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    b.forbiddenVisits.add('beat1');
    expect(mergeConstraintSets(a, b)).toBeNull();
  });

  it('merges compatible inventory has-sets (union)', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.inventory.set('player', { has: new Set(['key']), notHas: new Set() });
    b.inventory.set('player', { has: new Set(['sword']), notHas: new Set() });
    const merged = mergeConstraintSets(a, b);
    expect(merged).not.toBeNull();
    const items = [...merged!.inventory.get('player')!.has];
    expect(items.sort()).toEqual(['key', 'sword']);
  });

  it('merges compatible required-visits (union)', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    b.requiredVisits.add('beat2');
    const merged = mergeConstraintSets(a, b);
    expect(merged).not.toBeNull();
    expect([...merged!.requiredVisits].sort()).toEqual(['beat1', 'beat2']);
  });

  it('does NOT mutate inputs (immutable merge)', () => {
    const a = createEmptyConstraintSet();
    const b = createEmptyConstraintSet();
    a.requiredVisits.add('beat1');
    b.requiredVisits.add('beat2');
    mergeConstraintSets(a, b);
    // Inputs unchanged.
    expect([...a.requiredVisits]).toEqual(['beat1']);
    expect([...b.requiredVisits]).toEqual(['beat2']);
  });
});
