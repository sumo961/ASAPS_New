/**
 * Tests for the mood-tracker visibility predicate: the Preview Window's
 * affect panel must only appear when the story actually uses the affect
 * system (authored signals) or affect moved at runtime (live fallback).
 */
import { describe, it, expect } from 'vitest';
import { storyUsesAffect, anyLiveAffect } from '../storyUsesAffect';

describe('storyUsesAffect (authored signals)', () => {
  it('false for a story with characters but no affect usage', () => {
    expect(storyUsesAffect([{ id: 'c1', name: 'Elena' }], [{ type: 'infoText' }])).toBe(false);
  });

  it('true when any beat is updateAffect', () => {
    expect(storyUsesAffect([], [{ type: 'infoText' }, { type: 'updateAffect' }])).toBe(true);
  });

  it('true for authored character affect config', () => {
    expect(storyUsesAffect([{ id: 'c', initialMood: { valence: 0.5, arousal: 0 } }], [])).toBe(true);
    expect(
      storyUsesAffect([{ id: 'c', initialSentiments: [{ toEntityRef: 'p', emotion: 'trust', strength: 1 }] }], [])
    ).toBe(true);
    expect(storyUsesAffect([{ id: 'c', moodFrame: { enabled: true } }], [])).toBe(true);
  });

  it('ignores a disabled moodFrame and empty sentiment lists', () => {
    expect(storyUsesAffect([{ id: 'c', moodFrame: { enabled: false }, initialSentiments: [] }], [])).toBe(false);
  });

  it('handles null/undefined inputs', () => {
    expect(storyUsesAffect(null, undefined)).toBe(false);
  });
});

describe('anyLiveAffect (runtime fallback)', () => {
  const neutral = {
    getCharacterMood: () => ({ valence: 0, arousal: 0 }),
    getCharacterSentiments: () => [],
    getCharacterEmotions: () => ({}),
  };

  it('false when every character is neutral with no sentiments/emotions', () => {
    expect(anyLiveAffect([{ id: 'a' }, { id: 'b' }], neutral)).toBe(false);
  });

  it('true when a mood left neutral', () => {
    expect(
      anyLiveAffect([{ id: 'a' }], { ...neutral, getCharacterMood: () => ({ valence: 0.2, arousal: 0 }) })
    ).toBe(true);
  });

  it('true when sentiments exist', () => {
    expect(
      anyLiveAffect([{ id: 'a' }], { ...neutral, getCharacterSentiments: () => [{ emotion: 'fear' }] })
    ).toBe(true);
  });

  it('true when an emotion intensity is non-zero', () => {
    expect(
      anyLiveAffect([{ id: 'a' }], { ...neutral, getCharacterEmotions: () => ({ joy: 0.4 }) })
    ).toBe(true);
  });
});
