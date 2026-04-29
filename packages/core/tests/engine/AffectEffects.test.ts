/**
 * Affect-as-Effect — Step 4 / Phase A. Validates that StoryContext.applyEffect
 * handles the new 'nudgeMood' and 'addSentiment' effect types so dialog
 * choices, dialog nodes, and any other effect host can update character
 * affect inline without needing a separate UpdateAffect beat in the graph.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { Effect } from '../../src/types';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return { getCharacters: () => characters, getFirstBeatId: () => '0' } as any;
}

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('applyEffect — nudgeMood', () => {
  let ctx: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    ctx = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies valence and arousal deltas, clamped per axis', () => {
    ctx.applyEffect({
      type: 'nudgeMood', target: 'char_1',
      valenceDelta: 0.4, arousalDelta: -0.2,
    } as Effect);
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: 0.4, arousal: -0.2 });

    // Repeat: delta accumulates and clamps at [-1, 1] per axis
    for (let i = 0; i < 5; i++) {
      ctx.applyEffect({ type: 'nudgeMood', target: 'char_1', valenceDelta: 0.5 } as Effect);
    }
    expect(ctx.getCharacterMood('char_1').valence).toBe(1);
  });

  it('resolves the target through name / displayName', () => {
    ctx.applyEffect({ type: 'nudgeMood', target: 'Granny', valenceDelta: 0.3 } as Effect);
    expect(ctx.getCharacterMood('char_1').valence).toBe(0.3);
  });

  it('is a no-op when both deltas are zero or unset', () => {
    ctx.applyEffect({ type: 'nudgeMood', target: 'char_1' } as Effect);
    ctx.applyEffect({ type: 'nudgeMood', target: 'char_1', valenceDelta: 0, arousalDelta: 0 } as Effect);
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: 0, arousal: 0 });
  });

  it('coerces string deltas (legacy data / form inputs)', () => {
    ctx.applyEffect({
      type: 'nudgeMood', target: 'char_1',
      valenceDelta: '0.5' as any, arousalDelta: '-0.2' as any,
    } as Effect);
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: 0.5, arousal: -0.2 });
  });
});

describe('applyEffect — addSentiment', () => {
  let ctx: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    ctx = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records a new sentiment with the given strength delta', () => {
    ctx.applyEffect({
      type: 'addSentiment', target: 'char_1',
      sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.6,
    } as Effect);
    expect(ctx.getSentimentTo('char_1', 'player', 'trust')).toBe(0.6);
  });

  it('strengthens an existing (target, emotion) row across multiple effects', () => {
    const eff: Effect = {
      type: 'addSentiment', target: 'char_1',
      sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.3,
    };
    ctx.applyEffect(eff);
    ctx.applyEffect(eff);
    expect(ctx.getSentimentTo('char_1', 'player', 'trust')).toBeCloseTo(0.6);
  });

  it('skips when any of (sentimentTarget, sentimentEmotion, strengthDelta) is missing', () => {
    ctx.applyEffect({ type: 'addSentiment', target: 'char_1', sentimentEmotion: 'trust', strengthDelta: 0.5 } as Effect);
    ctx.applyEffect({ type: 'addSentiment', target: 'char_1', sentimentTarget: 'player', strengthDelta: 0.5 } as Effect);
    ctx.applyEffect({ type: 'addSentiment', target: 'char_1', sentimentTarget: 'player', sentimentEmotion: 'trust' } as Effect);
    expect(ctx.getCharacterSentiments('char_1')).toEqual([]);
  });

  it('resolves the holder through name / displayName', () => {
    ctx.applyEffect({
      type: 'addSentiment', target: 'Granny',
      sentimentTarget: 'wolf', sentimentEmotion: 'fear', strengthDelta: 0.5,
    } as Effect);
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBe(0.5);
  });

  it('handles negative strength deltas (weaken / invert sentiment)', () => {
    ctx.addCharacterSentiment('char_1', 'wolf', 'fear', 0.7);
    ctx.applyEffect({
      type: 'addSentiment', target: 'char_1',
      sentimentTarget: 'wolf', sentimentEmotion: 'fear', strengthDelta: -0.3,
    } as Effect);
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(0.4);
  });
});

describe('applyEffect — fireEmotion (Step 5)', () => {
  let ctx: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    // Use a real Story so the EmotionPalette is available for the side-effect.
    const story = new Story();
    story.setCharacters([granny, wolf]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bumps the emotion level and auto-nudges mood via palette weights', () => {
    ctx.applyEffect({ type: 'fireEmotion', target: 'char_1', emotion: 'joy', emotionDelta: 0.5 } as Effect);
    expect(ctx.getCharacterEmotion('char_1', 'joy')).toBe(0.5);
    // joy weights: valence +0.7, arousal +0.4
    expect(ctx.getCharacterMood('char_1').valence).toBeCloseTo(0.35);
    expect(ctx.getCharacterMood('char_1').arousal).toBeCloseTo(0.20);
  });

  it('skips when emotion or delta is missing', () => {
    ctx.applyEffect({ type: 'fireEmotion', target: 'char_1', emotionDelta: 0.5 } as Effect);
    ctx.applyEffect({ type: 'fireEmotion', target: 'char_1', emotion: 'joy' } as Effect);
    ctx.applyEffect({ type: 'fireEmotion', target: 'char_1', emotion: 'joy', emotionDelta: 0 } as Effect);
    expect(ctx.getCharacterEmotion('char_1', 'joy')).toBe(0);
  });

  it('resolves the holder through name / displayName', () => {
    ctx.applyEffect({ type: 'fireEmotion', target: 'Granny', emotion: 'fear', emotionDelta: 0.4 } as Effect);
    expect(ctx.getCharacterEmotion('char_1', 'fear')).toBe(0.4);
  });
});
