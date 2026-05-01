import { describe, it, expect } from 'vitest';
import { summarizeChoiceEffects } from '../summarizeChoiceEffects';
import type { Effect } from '@asaps/core';

const characters = [
  { id: 'char_alex', displayName: 'Alex' },
  { id: 'char_jordan', displayName: 'Jordan' },
];

describe('summarizeChoiceEffects', () => {
  it('returns empty string for an empty effect list', () => {
    expect(summarizeChoiceEffects([])).toBe('');
  });

  it('describes a positive mood nudge using "feels happier"', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0.3, arousalDelta: 0 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('Alex: feels happier');
  });

  it('describes a negative mood nudge using "feels sadder"', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: -0.3, arousalDelta: 0 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('feels sadder');
  });

  it('combines multiple mood nudges into the net delta', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0.5 } as any,
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: -0.3 } as any,
    ];
    // Net is +0.2 — should still read as "happier"
    expect(summarizeChoiceEffects(fx, characters)).toContain('feels happier');
  });

  it('drops mood mention when net delta is below noise threshold', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0.03 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).not.toContain('feels');
  });

  it('describes fireEmotion calls with intensity qualifier', () => {
    const fx: Effect[] = [
      { type: 'fireEmotion', target: 'char_alex', emotion: 'fear', emotionDelta: 0.5 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('fear spikes sharply');
  });

  it('describes negative fireEmotion as "softens"', () => {
    const fx: Effect[] = [
      { type: 'fireEmotion', target: 'char_alex', emotion: 'fear', emotionDelta: -0.3 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('fear softens');
  });

  it('describes addSentiment toward another character with display name', () => {
    const fx: Effect[] = [
      { type: 'addSentiment', target: 'char_alex', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.4 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('trust toward the player grows');
  });

  it('describes self-directed sentiment with the self- prefix', () => {
    const fx: Effect[] = [
      { type: 'addSentiment', target: 'char_alex', sentimentTarget: 'char_alex', sentimentEmotion: 'shame', strengthDelta: -0.05 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('self-shame eases');
  });

  it('describes counter increments compactly', () => {
    const fx: Effect[] = [
      { type: 'incrementCounter', target: 'supportScore', value: 2 } as any,
      { type: 'incrementCounter', target: 'maxSupport', value: 1 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('+2 supportScore');
    expect(summarizeChoiceEffects(fx, characters)).toContain('+1 maxSupport');
  });

  it('handles a full Alex-template-shaped bundle', () => {
    const fx: Effect[] = [
      { type: 'incrementCounter', target: 'supportScore', value: 2 } as any,
      { type: 'incrementCounter', target: 'maxSupport', value: 1 } as any,
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0.30, arousalDelta: -0.10 } as any,
      { type: 'fireEmotion', target: 'char_alex', emotion: 'joy', emotionDelta: 0.30 } as any,
      { type: 'fireEmotion', target: 'char_alex', emotion: 'fear', emotionDelta: -0.20 } as any,
      { type: 'addSentiment', target: 'char_alex', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.40 } as any,
      { type: 'addSentiment', target: 'char_alex', sentimentTarget: 'char_alex', sentimentEmotion: 'shame', strengthDelta: -0.05 } as any,
    ];
    const out = summarizeChoiceEffects(fx, characters);
    expect(out).toContain('Alex:');
    expect(out).toContain('feels happier');
    expect(out).toContain('joy spikes');
    expect(out).toContain('fear softens');
    expect(out).toContain('trust toward the player grows');
    expect(out).toContain('self-shame eases');
    expect(out).toContain('+2 supportScore');
  });

  it('groups effects by target character into separate clauses', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0.3 } as any,
      { type: 'nudgeMood', target: 'char_jordan', valenceDelta: -0.2 } as any,
    ];
    const out = summarizeChoiceEffects(fx, characters);
    expect(out).toMatch(/Alex:.*feels happier/);
    expect(out).toMatch(/Jordan:.*feels sadder/);
  });

  it("falls back to character ref when no matching record is in `characters`", () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_unknown', valenceDelta: 0.3 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toContain('char_unknown: feels happier');
  });

  it('describes setGoalStatus and setCharacterVariant changes', () => {
    const fx: Effect[] = [
      { type: 'setGoalStatus', target: 'char_alex', goalId: 'find-grail', goalStatus: 'met' } as any,
      { type: 'setCharacterVariant', target: 'char_alex', variantId: 'free-spirit' } as any,
    ];
    const out = summarizeChoiceEffects(fx, characters);
    expect(out).toContain("goal 'find-grail' marked met");
    expect(out).toContain("switches to variant 'free-spirit'");
  });

  it('truncates long reflection text to keep the summary terse', () => {
    const longText = 'A very long reflection text that goes on and on and on past sixty characters easily.';
    const fx: Effect[] = [
      { type: 'addReflection', target: 'char_alex', reflectionText: longText, reflectionSalience: 0.5 } as any,
    ];
    const out = summarizeChoiceEffects(fx, characters);
    expect(out).toContain('reflects:');
    expect(out).toContain('…');
    // Truncated body should be at most ~60 chars long
    expect(out.length).toBeLessThan(120);
  });

  it('skips effects with zero / undefined deltas', () => {
    const fx: Effect[] = [
      { type: 'nudgeMood', target: 'char_alex', valenceDelta: 0, arousalDelta: 0 } as any,
      { type: 'fireEmotion', target: 'char_alex', emotion: 'joy', emotionDelta: 0 } as any,
      { type: 'addSentiment', target: 'char_alex', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0 } as any,
    ];
    expect(summarizeChoiceEffects(fx, characters)).toBe('');
  });
});
