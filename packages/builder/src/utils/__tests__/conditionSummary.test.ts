/**
 * Guard summaries — the text that renders ON the edge a condition gates
 * ("logic visible where it acts"). Pinned because both the flowchart edge
 * and the condition editor display it.
 */
import { describe, it, expect } from 'vitest';
import { summarizeCondition, summarizeConditions } from '../conditionSummary';

describe('summarizeCondition', () => {
  it('inventory: has / lacks', () => {
    expect(summarizeCondition({ type: 'inventory', operator: 'contains', item: 'key' } as any)).toBe('has key');
    expect(summarizeCondition({ type: 'inventory', operator: 'not', item: 'key' } as any)).toBe('lacks key');
  });

  it('variable and counter comparisons use math glyphs', () => {
    expect(summarizeCondition({ type: 'variable', operator: '==', variableName: 'mood', value: 'calm' } as any))
      .toBe('mood = "calm"');
    expect(summarizeCondition({ type: 'counter', operator: '>=', variableName: 'trust', value: 2 } as any))
      .toBe('trust ≥ 2');
  });

  it('visitedBeat resolves the beat name when a resolver is given', () => {
    const nameOf = (id: string) => (id === 'b7' ? 'The Cellar' : undefined);
    expect(summarizeCondition({ type: 'visitedBeat', operator: '==', beatId: 'b7' } as any, nameOf))
      .toBe('visited "The Cellar"');
    expect(summarizeCondition({ type: 'visitedBeat', operator: 'not', beatId: 'b7' } as any, nameOf))
      .toBe('not visited "The Cellar"');
  });

  it('joins multiple conditions with a middle dot (AND semantics)', () => {
    const s = summarizeConditions([
      { type: 'inventory', operator: 'contains', item: 'key' },
      { type: 'counter', operator: '>=', variableName: 'trust', value: 2 },
    ] as any);
    expect(s).toBe('has key · trust ≥ 2');
  });

  it('returns null for empty or missing lists', () => {
    expect(summarizeConditions(undefined)).toBeNull();
    expect(summarizeConditions([])).toBeNull();
  });
});
