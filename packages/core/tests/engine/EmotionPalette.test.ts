/**
 * Tests for EmotionPalette — author-editable emotion catalog. Each
 * entry is the per-emotion contract that drives mood deltas when
 * fireCharacterEmotion runs.
 *
 * Coverage focus:
 *   - DEFAULT_EMOTION_PALETTE shape: the documented 9 emotions
 *     (Ekman 6 + pride/shame/interest), all weights in valid
 *     ranges, all decay rates in [0,1]
 *   - findEmotionDefinition case-insensitive lookup
 *   - findEmotionDefinition defensive paths (null/empty inputs)
 *   - DEFAULTS pinned for the high-arousal vs low-arousal emotions
 *     (joy = pleasant+active; sadness = unpleasant+subdued, etc.)
 *     so a future weight-table tweak is a visible, deliberate
 *     change
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EMOTION_PALETTE,
  findEmotionDefinition,
} from '../../src/engine/EmotionPalette';

describe('DEFAULT_EMOTION_PALETTE', () => {
  it('ships the documented nine emotions (Ekman 6 + pride/shame/interest)', () => {
    // The "sensible default" set from the design doc. If anyone
    // adds or removes, this lights up — adjust on purpose.
    const names = DEFAULT_EMOTION_PALETTE.map(e => e.name);
    expect(names).toEqual([
      'joy', 'anger', 'fear', 'sadness',
      'surprise', 'disgust',
      'pride', 'shame', 'interest',
    ]);
  });

  it('every entry has all required fields', () => {
    for (const e of DEFAULT_EMOTION_PALETTE) {
      expect(typeof e.name).toBe('string');
      expect(e.name.length).toBeGreaterThan(0);
      expect(typeof e.weightToValence).toBe('number');
      expect(typeof e.weightToArousal).toBe('number');
      expect(typeof e.decayRate).toBe('number');
    }
  });

  it('every weightToValence is in [-1, 1]', () => {
    for (const e of DEFAULT_EMOTION_PALETTE) {
      expect(e.weightToValence).toBeGreaterThanOrEqual(-1);
      expect(e.weightToValence).toBeLessThanOrEqual(1);
    }
  });

  it('every weightToArousal is in [-1, 1]', () => {
    for (const e of DEFAULT_EMOTION_PALETTE) {
      expect(e.weightToArousal).toBeGreaterThanOrEqual(-1);
      expect(e.weightToArousal).toBeLessThanOrEqual(1);
    }
  });

  it('every decayRate is in [0, 1]', () => {
    for (const e of DEFAULT_EMOTION_PALETTE) {
      expect(e.decayRate).toBeGreaterThanOrEqual(0);
      expect(e.decayRate).toBeLessThanOrEqual(1);
    }
  });

  it('all names are unique', () => {
    // Duplicate names would silently shadow each other in the
    // editor and findEmotionDefinition.
    const names = DEFAULT_EMOTION_PALETTE.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all names are lowercase (the convention)', () => {
    for (const e of DEFAULT_EMOTION_PALETTE) {
      expect(e.name).toBe(e.name.toLowerCase());
    }
  });

  describe('mood-axis intuition (per emotion-circumplex theory)', () => {
    // Pin the rough quadrants so a refactor that flips a sign is
    // visible. We don't pin the exact magnitudes — those are
    // tunable — but the SIGN must stay correct.
    const byName = Object.fromEntries(
      DEFAULT_EMOTION_PALETTE.map(e => [e.name, e]),
    );

    it('joy: pleasant + active', () => {
      expect(byName.joy.weightToValence).toBeGreaterThan(0);
      expect(byName.joy.weightToArousal).toBeGreaterThan(0);
    });

    it('anger: unpleasant + active', () => {
      expect(byName.anger.weightToValence).toBeLessThan(0);
      expect(byName.anger.weightToArousal).toBeGreaterThan(0);
    });

    it('sadness: unpleasant + subdued', () => {
      expect(byName.sadness.weightToValence).toBeLessThan(0);
      expect(byName.sadness.weightToArousal).toBeLessThan(0);
    });

    it('fear: unpleasant + active', () => {
      expect(byName.fear.weightToValence).toBeLessThan(0);
      expect(byName.fear.weightToArousal).toBeGreaterThan(0);
    });

    it('shame: unpleasant + subdued (low-arousal negative)', () => {
      expect(byName.shame.weightToValence).toBeLessThan(0);
      expect(byName.shame.weightToArousal).toBeLessThan(0);
    });

    it('surprise: arousal-only (high), valence neutral', () => {
      expect(byName.surprise.weightToArousal).toBeGreaterThan(0);
      // 0 — neutral. Matches the design comment "weightToValence 0".
      expect(byName.surprise.weightToValence).toBe(0);
    });

    it('surprise decays faster than most other emotions', () => {
      // Documented as "startled — fast decay" in the source. Pin
      // the relative property: it has the highest or one of the
      // highest decay rates.
      const maxDecay = Math.max(...DEFAULT_EMOTION_PALETTE.map(e => e.decayRate));
      expect(byName.surprise.decayRate).toBe(maxDecay);
    });
  });
});

describe('findEmotionDefinition', () => {
  it('finds an emotion by exact name', () => {
    const result = findEmotionDefinition(DEFAULT_EMOTION_PALETTE, 'joy');
    expect(result?.name).toBe('joy');
  });

  it('is case-insensitive', () => {
    // Authors typing "Joy" or "JOY" should still resolve.
    expect(findEmotionDefinition(DEFAULT_EMOTION_PALETTE, 'Joy')?.name).toBe('joy');
    expect(findEmotionDefinition(DEFAULT_EMOTION_PALETTE, 'JOY')?.name).toBe('joy');
    expect(findEmotionDefinition(DEFAULT_EMOTION_PALETTE, 'JoY')?.name).toBe('joy');
  });

  it('returns null for an unknown name', () => {
    // Per the source: callers should treat null as "unrecognised
    // emotion" rather than crashing.
    expect(findEmotionDefinition(DEFAULT_EMOTION_PALETTE, 'jealousy')).toBeNull();
  });

  it('returns null when palette is null', () => {
    expect(findEmotionDefinition(null, 'joy')).toBeNull();
  });

  it('returns null when palette is undefined', () => {
    expect(findEmotionDefinition(undefined, 'joy')).toBeNull();
  });

  it('returns null when name is empty string', () => {
    // Empty string is "no name supplied", not "find one with empty
    // name". The early-return guards both.
    expect(findEmotionDefinition(DEFAULT_EMOTION_PALETTE, '')).toBeNull();
  });

  it('works on a custom palette', () => {
    const custom = [
      { name: 'awe', weightToValence: 0.6, weightToArousal: 0.7, decayRate: 0.2 },
    ];
    expect(findEmotionDefinition(custom, 'AWE')?.name).toBe('awe');
  });
});
