/**
 * toMeterCounterData — the one place that decides what a meter currently
 * reads. The branch that matters is derived vs authored: a derived counter
 * has no stored value, so any call site that forgot the branch would render
 * a permanent zero (or worse, a stale authored placeholder).
 */
import { describe, it, expect } from 'vitest';
import { toMeterCounterData, type MeterCounterDef } from '../../src/utils/meterData';
import type { AffectReader } from '@asaps/core';

const reader = (sentiment: number): AffectReader => ({
  getSentimentTo: () => sentiment,
  getCharacterEmotion: () => sentiment,
  getCharacterMood: () => ({ valence: sentiment, arousal: 0 }),
});

const TRUST: MeterCounterDef = {
  name: 'trust',
  displayName: 'Trust',
  min: -100,
  max: 100,
  source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' },
  bands: [{ from: -100, label: 'wary' }, { from: -20, label: 'neutral' }, { from: 20, label: 'trusting' }],
};

describe('toMeterCounterData', () => {
  it('projects live affect state for a derived counter', () => {
    const data = toMeterCounterData(TRUST, 'ada', reader(0.62));
    expect(data.value).toBeCloseTo(62);
    expect(data.min).toBe(-100);
    expect(data.max).toBe(100);
    expect(data.bands).toHaveLength(3);
  });

  it('ignores runtime counter state for a derived counter', () => {
    // A counter of the same name in the scoped store must not leak into a
    // bound meter — the binding is the only authority for its value.
    const data = toMeterCounterData(TRUST, 'ada', reader(0.62), { trust: 999 });
    expect(data.value).toBeCloseTo(62);
  });

  it('reads zero, not the authored placeholder, when no story is running', () => {
    // The visual editor has no engine. Showing `value` would present an
    // authored number as if it were live affect.
    const stale: MeterCounterDef = { ...TRUST, value: 77 };
    expect(toMeterCounterData(stale, 'ada', null).value).toBe(0);
  });

  it('leaves authored counters exactly as they behaved before', () => {
    const gold: MeterCounterDef = { name: 'gold', displayName: 'Gold', value: 42 };
    const data = toMeterCounterData(gold, 'ada', reader(0.9), { gold: 7 });
    expect(data.value).toBe(7);              // runtime value wins
    expect(data.min).toBe(0);                // legacy defaults preserved
    expect(data.max).toBe(100);
    expect(data.numericFormat).toBe('value');
  });

  it('falls back through scoped → global → authored for an authored counter', () => {
    const gold: MeterCounterDef = { name: 'gold', displayName: 'Gold', value: 42 };
    expect(toMeterCounterData(gold, 'ada', null, {}, () => 5).value).toBe(5);
    expect(toMeterCounterData(gold, 'ada', null, {}, () => undefined).value).toBe(42);
  });
});
