import { describe, it, expect } from 'vitest';
import {
  modulateEmotionDelta,
  DEFAULT_TRAIT_VALUES,
  DEFAULT_TRAIT_MODULATIONS,
} from '../../src/engine/PersonalityTraits';

describe('modulateEmotionDelta', () => {
  it('returns the base delta when traits or modulations are missing', () => {
    expect(modulateEmotionDelta(0.5, 'fear', null, DEFAULT_TRAIT_MODULATIONS)).toBe(0.5);
    expect(modulateEmotionDelta(0.5, 'fear', { neuroticism: 1 }, null)).toBe(0.5);
    expect(modulateEmotionDelta(0.5, 'fear', undefined, undefined)).toBe(0.5);
  });

  it('returns 0 untouched (no math churn)', () => {
    expect(modulateEmotionDelta(0, 'fear', { neuroticism: 1 }, DEFAULT_TRAIT_MODULATIONS)).toBe(0);
  });

  it('a perfectly neutral character produces no change', () => {
    expect(modulateEmotionDelta(0.4, 'fear', DEFAULT_TRAIT_VALUES, DEFAULT_TRAIT_MODULATIONS))
      .toBeCloseTo(0.4);
    expect(modulateEmotionDelta(0.4, 'joy', DEFAULT_TRAIT_VALUES, DEFAULT_TRAIT_MODULATIONS))
      .toBeCloseTo(0.4);
  });

  it('high neuroticism amplifies fear', () => {
    // weight for (neuroticism, fear) = 0.5; trait centered = 1.0 → scale = 1 + 0.5 = 1.5
    const out = modulateEmotionDelta(0.4, 'fear', { neuroticism: 1 }, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBeCloseTo(0.6);
  });

  it('low neuroticism dampens fear', () => {
    // trait centered = -1.0 → scale = 1 + (-1)(0.5) = 0.5
    const out = modulateEmotionDelta(0.4, 'fear', { neuroticism: 0 }, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBeCloseTo(0.2);
  });

  it('high agreeableness dampens anger', () => {
    // weight = -0.4, centered = +1 → scale = 0.6
    const out = modulateEmotionDelta(0.5, 'anger', { agreeableness: 1 }, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBeCloseTo(0.3);
  });

  it('high extraversion amplifies joy and pride', () => {
    expect(modulateEmotionDelta(0.4, 'joy', { extraversion: 1 }, DEFAULT_TRAIT_MODULATIONS))
      .toBeCloseTo(0.56);  // 1 + 1 * 0.4 = 1.4
    expect(modulateEmotionDelta(0.4, 'pride', { extraversion: 1 }, DEFAULT_TRAIT_MODULATIONS))
      .toBeCloseTo(0.52);  // 1 + 1 * 0.3 = 1.3
  });

  it('combines multiple traits additively', () => {
    // anger weights: neuroticism +0.3, agreeableness -0.4
    // both traits at 1 → centered +1 each → scale = 1 + 0.3 + (-0.4) = 0.9
    const out = modulateEmotionDelta(0.5, 'anger',
      { neuroticism: 1, agreeableness: 1 }, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBeCloseTo(0.45);
  });

  it('clamps the scale floor to 0 (cannot flip polarity)', () => {
    // extraversion at 0 → centered -1, joy weight 0.4 → -0.4
    // neuroticism at 1 → centered +1, joy weight -0.2 → -0.2
    // openness has no joy weight
    // scale would be 1 - 0.4 - 0.2 = 0.4 — still positive, not at floor.
    // Force it to floor with an extreme custom modulation.
    const extreme = [{ trait: 'spite', emotion: 'joy', weight: -2 }];
    const out = modulateEmotionDelta(0.5, 'joy', { spite: 1 }, extreme);
    expect(out).toBe(0);  // 1 + (-2)(1) = -1 → clamped to 0
  });

  it('clamps the scale ceiling to 4 (cannot blow up)', () => {
    const extreme = [
      { trait: 'a', emotion: 'joy', weight: 2 },
      { trait: 'b', emotion: 'joy', weight: 2 },
      { trait: 'c', emotion: 'joy', weight: 2 },
    ];
    const out = modulateEmotionDelta(0.5, 'joy', { a: 1, b: 1, c: 1 }, extreme);
    expect(out).toBe(2);  // scale clamped 7 → 4 → 0.5 * 4 = 2
  });

  it('is case-insensitive on emotion name', () => {
    const out = modulateEmotionDelta(0.4, 'FEAR', { neuroticism: 1 }, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBeCloseTo(0.6);
  });

  it('ignores trait values that are not numbers', () => {
    const traits = { neuroticism: 'high' as any };
    const out = modulateEmotionDelta(0.4, 'fear', traits, DEFAULT_TRAIT_MODULATIONS);
    expect(out).toBe(0.4);  // ignored, scale stays 1
  });

  it('ignores modulation rows whose trait is missing from the bag', () => {
    // anger has neuroticism + agreeableness rows; supply only neuroticism.
    const out = modulateEmotionDelta(0.5, 'anger', { neuroticism: 1 }, DEFAULT_TRAIT_MODULATIONS);
    // scale = 1 + (1 * 0.3) = 1.3
    expect(out).toBeCloseTo(0.65);
  });
});
