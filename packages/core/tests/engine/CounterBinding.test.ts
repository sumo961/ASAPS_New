/**
 * Counter binding — derive-on-read, origin-at-zero projection, band lookup.
 *
 * The projection rules are the whole design (docs/Counter-Binding-Design.md),
 * so they get exhaustive coverage here: this is a pure seam, and every bug
 * caught at this level is one that would otherwise surface as a meter that
 * "moves the wrong way" with no obvious cause.
 */
import { describe, it, expect } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import {
  isDerivedCounter,
  counterRange,
  projectStrength,
  zeroOffsetRatio,
  barFill,
  resolveBand,
  readSourceStrength,
  resolveCounterValue,
  resolveCounter,
  type AffectReader,
  type BindableCounter,
} from '../../src/engine/counterBinding';

/** Reader stub — records nothing, returns whatever the test seeds. */
function reader(seed: {
  sentiments?: Record<string, number>;
  emotions?: Record<string, number>;
  moods?: Record<string, { valence: number; arousal: number }>;
} = {}): AffectReader {
  return {
    getSentimentTo: (from, to, emotion) => seed.sentiments?.[`${from}|${to}|${emotion}`] ?? 0,
    getCharacterEmotion: (ref, emotion) => seed.emotions?.[`${ref}|${emotion}`] ?? 0,
    getCharacterMood: (ref) => seed.moods?.[ref],
  };
}

const BIPOLAR = { min: -100, max: 100 };
const UNIPOLAR = { min: 0, max: 100 };

describe('isDerivedCounter', () => {
  it('distinguishes authored from derived', () => {
    expect(isDerivedCounter({ name: 'gold', value: 42 })).toBe(false);
    expect(isDerivedCounter({ name: 'trust', source: { kind: 'mood', axis: 'valence' } })).toBe(true);
    expect(isDerivedCounter(undefined)).toBe(false);
  });
});

describe('counterRange', () => {
  it('honours authored min/max', () => {
    expect(counterRange({ name: 'x', min: -50, max: 20 })).toEqual({ min: -50, max: 20 });
  });

  it('defaults signed stores to bipolar so negative state is never hidden', () => {
    // Defaulting a sentiment to [0,100] would floor real negative strength —
    // the meter would under-read while the underlying value kept drifting.
    expect(counterRange({ name: 'trust', source: { kind: 'sentiment', toEntityRef: 'p', emotion: 'trust' } }))
      .toEqual({ min: -100, max: 100 });
    expect(counterRange({ name: 'mood', source: { kind: 'mood', axis: 'valence' } }))
      .toEqual({ min: -100, max: 100 });
  });

  it('defaults emotion levels to unipolar — the store cannot go below zero', () => {
    expect(counterRange({ name: 'fear', source: { kind: 'emotion', emotion: 'fear' } }))
      .toEqual({ min: 0, max: 100 });
  });

  it('defaults an authored counter to 0..100', () => {
    expect(counterRange({ name: 'gold' })).toEqual({ min: 0, max: 100 });
  });

  it('repairs a degenerate range rather than emitting NaN downstream', () => {
    expect(counterRange({ name: 'x', min: 10, max: 10 })).toEqual({ min: 10, max: 11 });
    expect(counterRange({ name: 'x', min: 50, max: 10 })).toEqual({ min: 50, max: 51 });
    // The repaired range must still produce finite geometry.
    expect(Number.isFinite(zeroOffsetRatio(counterRange({ name: 'x', min: 10, max: 10 })))).toBe(true);
  });
});

describe('projectStrength', () => {
  it('scales each half against its own bound', () => {
    expect(projectStrength(0.62, BIPOLAR)).toBeCloseTo(62);
    expect(projectStrength(-0.45, BIPOLAR)).toBeCloseTo(-45);
  });

  it('clamps negatives to empty when min is 0 — a consequence, not a special case', () => {
    expect(projectStrength(-0.45, UNIPOLAR)).toBe(0);
    expect(projectStrength(0.62, UNIPOLAR)).toBeCloseTo(62);
  });

  it('handles asymmetric ranges', () => {
    const range = { min: -50, max: 100 };
    expect(projectStrength(1, range)).toBeCloseTo(100);
    expect(projectStrength(-1, range)).toBeCloseTo(-50);
    expect(projectStrength(-0.5, range)).toBeCloseTo(-25);
  });

  it('never remaps zero away from zero', () => {
    // The rejected "remapped" reading would put neutral at half-full.
    for (const range of [BIPOLAR, UNIPOLAR, { min: -50, max: 100 }]) {
      expect(projectStrength(0, range)).toBe(0);
    }
  });

  it('rounds away floating-point noise — the value reaches players verbatim', () => {
    // -0.44 * 100 is -43.99999999999999 in IEEE754, which showed up in a
    // live meter readout as exactly that.
    expect(projectStrength(-0.44, BIPOLAR)).toBe(-44);
    expect(projectStrength(0.07, { min: 0, max: 3 })).toBe(0.21);
  });

  it('clamps out-of-contract strengths and survives NaN', () => {
    expect(projectStrength(5, BIPOLAR)).toBe(100);
    expect(projectStrength(-5, BIPOLAR)).toBe(-100);
    expect(projectStrength(NaN, BIPOLAR)).toBe(0);
  });
});

describe('zeroOffsetRatio', () => {
  it('puts the origin where zero actually falls', () => {
    expect(zeroOffsetRatio(UNIPOLAR)).toBe(0);          // left edge
    expect(zeroOffsetRatio(BIPOLAR)).toBeCloseTo(0.5);  // centre
    expect(zeroOffsetRatio({ min: -50, max: 100 })).toBeCloseTo(1 / 3);
  });

  it('clamps when the range excludes zero entirely', () => {
    expect(zeroOffsetRatio({ min: 20, max: 100 })).toBe(0);
    expect(zeroOffsetRatio({ min: -100, max: -20 })).toBe(1);
  });
});

describe('barFill', () => {
  it('grows outward from the centre on a bipolar range', () => {
    const pos = barFill(62, BIPOLAR);
    expect(pos.start).toBeCloseTo(0.5);
    expect(pos.end).toBeCloseTo(0.81);
    expect(pos.negative).toBe(false);

    const neg = barFill(-45, BIPOLAR);
    expect(neg.start).toBeCloseTo(0.275);
    expect(neg.end).toBeCloseTo(0.5);
    expect(neg.negative).toBe(true);
  });

  it('degenerates to a left-filling gauge when zero is the left edge', () => {
    const fill = barFill(62, UNIPOLAR);
    expect(fill.start).toBe(0);
    expect(fill.end).toBeCloseTo(0.62);
  });

  it('renders zero as an empty span in both polarities', () => {
    for (const range of [BIPOLAR, UNIPOLAR]) {
      const fill = barFill(0, range);
      expect(fill.end - fill.start).toBeCloseTo(0);
    }
  });

  it('never emits a span outside the bar or an inverted one', () => {
    for (const value of [-1000, -45, 0, 62, 1000, NaN]) {
      for (const range of [BIPOLAR, UNIPOLAR, { min: -50, max: 100 }]) {
        const fill = barFill(value, range);
        expect(fill.start).toBeGreaterThanOrEqual(0);
        expect(fill.end).toBeLessThanOrEqual(1);
        expect(fill.end).toBeGreaterThanOrEqual(fill.start);
      }
    }
  });
});

describe('resolveBand', () => {
  const LADDER = [
    { from: -100, label: 'strong distrust' },
    { from: -60, label: 'wary' },
    { from: -20, label: 'neutral' },
    { from: 20, label: 'trusting' },
    { from: 60, label: 'deep trust' },
  ];

  it('picks the last band whose threshold the value has passed', () => {
    expect(resolveBand(-80, LADDER)).toBe('strong distrust');
    expect(resolveBand(-45, LADDER)).toBe('wary');
    expect(resolveBand(0, LADDER)).toBe('neutral');
    expect(resolveBand(62, LADDER)).toBe('deep trust');
  });

  it('treats a threshold as inclusive', () => {
    expect(resolveBand(-60, LADDER)).toBe('wary');
    expect(resolveBand(20, LADDER)).toBe('trusting');
  });

  it('sorts bands the author entered out of order', () => {
    const shuffled = [LADDER[3], LADDER[0], LADDER[4], LADDER[1], LADDER[2]];
    expect(resolveBand(0, shuffled)).toBe('neutral');
    expect(resolveBand(-80, shuffled)).toBe('strong distrust');
  });

  it('never blanks out below the lowest threshold', () => {
    // A readout that empties at the bottom of its own range is a rendering
    // bug, not an authoring signal.
    expect(resolveBand(-500, LADDER)).toBe('strong distrust');
  });

  it('returns undefined only when there are no usable bands', () => {
    expect(resolveBand(0, [])).toBeUndefined();
    expect(resolveBand(0, undefined)).toBeUndefined();
    expect(resolveBand(0, [{ from: 'x' as unknown as number, label: 'bad' }])).toBeUndefined();
  });

  it('opens on a neutral word when a ladder covers zero', () => {
    // Every sentiment currently starts at 0, so the opening label is the
    // first characterisation the interactor ever receives.
    expect(resolveBand(0, LADDER)).toBe('neutral');
    const noNeutral = [
      { from: -100, label: 'strong distrust' },
      { from: -60, label: 'wary' },
      { from: 20, label: 'trusting' },
    ];
    // Documented consequence, not an accident: without a neutral band an
    // unseeded character opens on a negative word.
    expect(resolveBand(0, noNeutral)).toBe('wary');
  });
});

describe('readSourceStrength', () => {
  it('reads a sentiment held by the counter owner by default', () => {
    const r = reader({ sentiments: { 'ada|player|trust': 0.62 } });
    expect(readSourceStrength({ kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' }, 'ada', r))
      .toBeCloseTo(0.62);
  });

  it('points at another character when fromCharacterRef is set', () => {
    // The player-facing "how much does the caseworker trust you" bar.
    const r = reader({ sentiments: { 'caseworker|player|trust': 0.4 } });
    const value = readSourceStrength(
      { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust', fromCharacterRef: 'caseworker' },
      'player',
      r,
    );
    expect(value).toBeCloseTo(0.4);
  });

  it('reads emotion levels and both mood axes', () => {
    const r = reader({
      emotions: { 'ada|fear': 0.8 },
      moods: { ada: { valence: -0.3, arousal: 0.7 } },
    });
    expect(readSourceStrength({ kind: 'emotion', emotion: 'fear' }, 'ada', r)).toBeCloseTo(0.8);
    expect(readSourceStrength({ kind: 'mood', axis: 'valence' }, 'ada', r)).toBeCloseTo(-0.3);
    expect(readSourceStrength({ kind: 'mood', axis: 'arousal' }, 'ada', r)).toBeCloseTo(0.7);
  });

  it('reads zero for absent state rather than throwing', () => {
    const r = reader();
    expect(readSourceStrength({ kind: 'mood', axis: 'valence' }, 'nobody', r)).toBe(0);
    expect(readSourceStrength({ kind: 'emotion', emotion: 'joy' }, 'nobody', r)).toBe(0);
  });
});

describe('resolveCounterValue', () => {
  it('returns an authored value untouched — binding must not disturb existing counters', () => {
    const gold: BindableCounter = { name: 'gold', value: 42, min: 0, max: 1000 };
    expect(resolveCounterValue(gold, 'ada', reader())).toBe(42);
  });

  it('defaults a valueless authored counter to zero', () => {
    expect(resolveCounterValue({ name: 'gold' }, 'ada', reader())).toBe(0);
  });

  it('ignores the authored value entirely once a source is set', () => {
    const counter: BindableCounter = {
      name: 'trust',
      value: 999,
      min: -100,
      max: 100,
      source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' },
    };
    const r = reader({ sentiments: { 'ada|player|trust': 0.62 } });
    expect(resolveCounterValue(counter, 'ada', r)).toBeCloseTo(62);
  });

  it('clamps a negative sentiment to empty on an author-declared unipolar range', () => {
    const counter: BindableCounter = {
      name: 'fear',
      min: 0,
      max: 100,
      source: { kind: 'sentiment', toEntityRef: 'wolf', emotion: 'fear' },
    };
    const r = reader({ sentiments: { 'ada|wolf|fear': -0.4 } });
    expect(resolveCounterValue(counter, 'ada', r)).toBe(0);
  });
});

describe('the live runtime satisfies AffectReader', () => {
  // The stub above proves the arithmetic. This proves the seam actually
  // lines up with StoryContext — without it, every test here could pass
  // while the binding fails against the real engine.
  function context(characters: Array<{ id: string; name?: string }>) {
    return new StoryContext(undefined, {
      getCharacters: () => characters,
      getFirstBeatId: () => '0',
    } as never);
  }

  it('accepts StoryContext directly as a reader', () => {
    const ctx = context([{ id: 'ada', name: 'Ada' }]);
    const asReader: AffectReader = ctx; // compile-time proof of the contract
    expect(asReader.getCharacterEmotion('ada', 'fear')).toBe(0);
  });

  it('derives a meter from sentiment state the engine actually recorded', () => {
    const ctx = context([{ id: 'ada', name: 'Ada' }, { id: 'player', name: 'Player' }]);
    ctx.addCharacterSentiment('ada', 'player', 'trust', 0.62);

    const counter: BindableCounter = {
      name: 'trust',
      min: -100,
      max: 100,
      source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' },
      bands: [{ from: -100, label: 'wary' }, { from: -20, label: 'neutral' }, { from: 20, label: 'trusting' }],
    };

    expect(resolveCounter(counter, 'ada', ctx).band).toBe('trusting');

    // …and it tracks the state as the story moves it, which is the whole point.
    ctx.addCharacterSentiment('ada', 'player', 'trust', -1);
    const after = resolveCounter(counter, 'ada', ctx);
    expect(after.value).toBeLessThan(0);
    expect(after.band).toBe('wary');
    expect(after.fill.negative).toBe(true);
  });

  it('derives a meter from an emotion level, which the engine clamps at zero', () => {
    const ctx = context([{ id: 'ada', name: 'Ada' }]);
    ctx.fireCharacterEmotion('ada', 'fear', 0.8);
    const counter: BindableCounter = { name: 'fear', source: { kind: 'emotion', emotion: 'fear' } };
    expect(resolveCounter(counter, 'ada', ctx).value).toBeCloseTo(80);

    // The store floors at 0, so the meter empties rather than going negative.
    ctx.fireCharacterEmotion('ada', 'fear', -5);
    expect(resolveCounter(counter, 'ada', ctx).value).toBe(0);
  });

  it('resolves a character by name, not only by id', () => {
    // Meters are authored against whichever ref the author had to hand.
    const ctx = context([{ id: 'char_1', name: 'Ada' }]);
    ctx.setCharacterMood('Ada', { valence: 0.5, arousal: 0 });
    const counter: BindableCounter = { name: 'mood', source: { kind: 'mood', axis: 'valence' } };
    expect(resolveCounter(counter, 'Ada', ctx).value).toBeCloseTo(50);
    expect(resolveCounter(counter, 'char_1', ctx).value).toBeCloseTo(50);
  });
});

describe('resolveCounter', () => {
  it('resolves value, geometry and phrase in one consistent read', () => {
    const counter: BindableCounter = {
      name: 'trust',
      min: -100,
      max: 100,
      source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' },
      bands: [
        { from: -100, label: 'strong distrust' },
        { from: -20, label: 'neutral' },
        { from: 20, label: 'trusting' },
      ],
    };
    const r = reader({ sentiments: { 'ada|player|trust': 0.62 } });
    const resolved = resolveCounter(counter, 'ada', r);

    expect(resolved.value).toBeCloseTo(62);
    expect(resolved.band).toBe('trusting');
    expect(resolved.derived).toBe(true);
    expect(resolved.fill.start).toBeCloseTo(0.5);
    expect(resolved.fill.negative).toBe(false);
  });

  it('leaves an authored counter with no band and no derived flag', () => {
    const resolved = resolveCounter({ name: 'gold', value: 42 }, 'ada', reader());
    expect(resolved.value).toBe(42);
    expect(resolved.band).toBeUndefined();
    expect(resolved.derived).toBe(false);
  });

  it('agrees with itself — the number, the bar and the phrase describe one value', () => {
    const counter: BindableCounter = {
      name: 'trust',
      min: -100,
      max: 100,
      source: { kind: 'mood', axis: 'valence' },
      bands: [{ from: -100, label: 'low' }, { from: 0, label: 'high' }],
    };
    for (const valence of [-0.9, -0.1, 0, 0.1, 0.9]) {
      const resolved = resolveCounter(counter, 'ada', reader({ moods: { ada: { valence, arousal: 0 } } }));
      expect(resolved.fill.negative).toBe(resolved.value < 0);
      expect(resolved.band).toBe(resolved.value >= 0 ? 'high' : 'low');
    }
  });
});
