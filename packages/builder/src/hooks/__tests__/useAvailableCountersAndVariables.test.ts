/**
 * Tests for the dropdown-source derivation hooks: counters/inventory from
 * characters, variables from global settings, and the combined numeric/string
 * option lists. All pure useMemo transforms, driven via renderHook. Covers the
 * displayName→name fallbacks, the "characterName: label" fullName format, and
 * the numeric(counters+number vars)/string(string vars) partitioning.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useAvailableCounters,
  useAvailableVariables,
  useAvailableInventoryItems,
  useAvailableCountersAndVariables,
} from '../useAvailableCountersAndVariables';

const char = (over: any = {}) => ({ id: 'c1', name: 'eve', displayName: 'Eve', counters: [], inventory: [], ...over }) as any;

describe('useAvailableCounters', () => {
  it('collects counters with displayName + fullName, falling back to name', () => {
    const chars = [
      char({ id: 'c1', displayName: 'Eve', counters: [{ name: 'trust', displayName: 'Trust', min: 0, max: 10 }] }),
      char({ id: 'c2', name: 'bob', displayName: undefined, counters: [{ name: 'hp' }] }),
    ];
    const { result } = renderHook(() => useAvailableCounters(chars));
    expect(result.current).toEqual([
      { name: 'trust', displayName: 'Trust', characterId: 'c1', characterName: 'Eve', min: 0, max: 10, fullName: 'Eve: Trust', derived: false, derivedWriteReason: undefined },
      { name: 'hp', displayName: 'hp', characterId: 'c2', characterName: 'bob', min: undefined, max: undefined, fullName: 'bob: hp', derived: false, derivedWriteReason: undefined },
    ]);
  });

  it('handles characters with no counters', () => {
    const { result } = renderHook(() => useAvailableCounters([char({ counters: undefined })]));
    expect(result.current).toEqual([]);
  });
});

describe('useAvailableVariables', () => {
  it('returns [] for null or variable-less settings', () => {
    expect(renderHook(() => useAvailableVariables(null)).result.current).toEqual([]);
    expect(renderHook(() => useAvailableVariables({} as any)).result.current).toEqual([]);
  });

  it('maps declared variables', () => {
    const settings = { variables: [{ name: 'score', type: 'number', defaultValue: 0, description: 'pts' }] } as any;
    expect(renderHook(() => useAvailableVariables(settings)).result.current).toEqual([
      { name: 'score', type: 'number', defaultValue: 0, description: 'pts' },
    ]);
  });
});

describe('useAvailableInventoryItems', () => {
  it('collects inventory items with displayName fallback + fullName', () => {
    const chars = [char({ displayName: 'Eve', inventory: [{ name: 'key', displayName: 'Brass Key' }, { name: 'map' }] })];
    const { result } = renderHook(() => useAvailableInventoryItems(chars));
    expect(result.current).toEqual([
      { name: 'key', displayName: 'Brass Key', characterId: 'c1', characterName: 'Eve', fullName: 'Eve: Brass Key' },
      { name: 'map', displayName: 'map', characterId: 'c1', characterName: 'Eve', fullName: 'Eve: map' },
    ]);
  });
});

describe('useAvailableCountersAndVariables (combined)', () => {
  it('partitions numeric (counters + number vars) and string (string vars) options', () => {
    const chars = [char({ displayName: 'Eve', counters: [{ name: 'trust', displayName: 'Trust' }] })];
    const settings = {
      variables: [
        { name: 'score', type: 'number', description: 'pts' },
        { name: 'playerName', type: 'string' },
        { name: 'flag', type: 'boolean' },
      ],
    } as any;
    const { result } = renderHook(() => useAvailableCountersAndVariables(chars, settings));

    expect(result.current.counters).toHaveLength(1);
    expect(result.current.variables).toHaveLength(3);

    expect(result.current.allNumericOptions).toEqual([
      { name: 'trust', label: 'Eve: Trust', type: 'counter' },
      { name: 'score', label: 'score (pts)', type: 'variable' },
    ]);
    expect(result.current.allStringOptions).toEqual([{ name: 'playerName', label: 'playerName', type: 'variable' }]);
  });

  it('handles empty inputs', () => {
    const { result } = renderHook(() => useAvailableCountersAndVariables([], null));
    expect(result.current).toEqual({ counters: [], variables: [], allNumericOptions: [], allStringOptions: [] });
  });
});

describe('derived counters are annotated, not filtered', () => {
  // The same list feeds reads and writes. Removing derived counters here
  // would break conditions, which may legitimately read one.
  it('flags a bound counter and names the effect that does move it', () => {
    const chars = [char({
      counters: [
        { name: 'gold', displayName: 'Gold' },
        { name: 'trust', displayName: 'Trust', source: { kind: 'sentiment', toEntityRef: 'p', emotion: 'trust' } },
        { name: 'fear', displayName: 'Fear', source: { kind: 'emotion', emotion: 'fear' } },
        { name: 'spirits', displayName: 'Spirits', source: { kind: 'mood', axis: 'valence' } },
      ],
    })];
    const { result } = renderHook(() => useAvailableCounters(chars));

    expect(result.current.map(c => c.derived)).toEqual([false, true, true, true]);
    // Still present — a condition may read any of them.
    expect(result.current).toHaveLength(4);

    expect(result.current[0].derivedWriteReason).toBeUndefined();
    expect(result.current[1].derivedWriteReason).toContain('Add Sentiment');
    expect(result.current[2].derivedWriteReason).toContain('Fire Emotion');
    expect(result.current[3].derivedWriteReason).toContain('Nudge Mood');
  });
});
