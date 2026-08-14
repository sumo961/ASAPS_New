/**
 * toMeterCounterData — the one place that decides what a meter currently
 * reads. The branch that matters is derived vs authored: a derived counter
 * has no stored value, so any call site that forgot the branch would render
 * a permanent zero (or worse, a stale authored placeholder).
 */
import { describe, it, expect } from 'vitest';
import { toMeterCounterData, resolveMeterFrame, type MeterCounterDef } from '../../src/utils/meterData';
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

describe('resolveMeterFrame', () => {
  const meter = (over = {}) => ({ name: 'trust', visible: true, showLevelMeter: true, ...over });

  it('returns the authored frame untouched — an author always wins', () => {
    const authored = { dockMode: 'character', anchor: 'bottom' } as any;
    expect(resolveMeterFrame({ meterFrame: authored, counters: [meter()] })).toBe(authored);
  });

  it('supplies a screen-docked frame when meters are visible but no frame exists', () => {
    // The generated story that exposed this: a bound trust counter, visible,
    // showLevelMeter true, and no frame — so it rendered nowhere while an
    // explanation beat told the player to watch it.
    const frame = resolveMeterFrame({ counters: [meter()] });
    expect(frame?.dockMode).toBe('screen');
    expect(frame?.screenPosition).toBe('screen-top-left');
  });

  it('stays silent when nothing asked to be shown', () => {
    expect(resolveMeterFrame({ counters: [meter({ visible: false })] })).toBeNull();
    expect(resolveMeterFrame({ counters: [meter({ showLevelMeter: false })] })).toBeNull();
    expect(resolveMeterFrame({ counters: [] })).toBeNull();
    expect(resolveMeterFrame(null)).toBeNull();
  });

  it('treats an absent `visible` as visible, matching the counter default', () => {
    expect(resolveMeterFrame({ counters: [{ name: 'x', showLevelMeter: true } as any] })).not.toBeNull();
  });

  it('hands back a copy, so one character cannot mutate another\'s fallback', () => {
    const a = resolveMeterFrame({ counters: [meter()] })!;
    const b = resolveMeterFrame({ counters: [meter()] })!;
    expect(a).not.toBe(b);
    a.screenPosition = 'screen-bottom-right';
    expect(b.screenPosition).toBe('screen-top-left');
  });
});

describe('band words show without a second flag', () => {
  const banded = (over = {}): MeterCounterDef => ({
    name: 'trust', displayName: 'Trust', min: -100, max: 100,
    numericFormat: 'band',
    bands: [{ from: -100, label: 'wary' }, { from: 20, label: 'trusting' }],
    ...over,
  });

  it('shows the phrase when a ladder was written but showNumericValue was omitted', () => {
    // The generated story hit this: numericFormat 'band' with four bands and
    // no showNumericValue, so formatValue() returned null and the ladder was
    // silently unused.
    expect(toMeterCounterData(banded(), 'ada', null).showNumericValue).toBe(true);
  });

  it('still respects an explicit false — a bare bar stays bare', () => {
    expect(toMeterCounterData(banded({ showNumericValue: false }), 'ada', null).showNumericValue).toBe(false);
  });

  it('does not turn numbers on for the other formats', () => {
    // 'value'/'fraction'/'percentage' keep defaulting off; someone may want
    // a bar with no digits.
    const plain: MeterCounterDef = { name: 'gold', numericFormat: 'value' };
    expect(toMeterCounterData(plain, 'ada', null).showNumericValue).toBe(false);
  });

  it('does not show words when the format is band but no ladder exists', () => {
    expect(toMeterCounterData(banded({ bands: [] }), 'ada', null).showNumericValue).toBe(false);
  });
});
