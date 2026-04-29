/**
 * Authored initial affect (mood + sentiments) is seeded from the story's
 * Character records into the runtime state on context creation, on
 * setStory(), and on reset. Once seeded, runtime changes (UpdateAffect
 * beats) own those slots — re-seeding never overwrites in-flight values
 * unless reset() has cleared them first.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

function makeStoryStub(characters: any[]) {
  return { getCharacters: () => characters, getFirstBeatId: () => '0' } as any;
}

const grannyAnxious = {
  id: 'char_1',
  name: 'Granny',
  initialMood: { valence: -0.4, arousal: 0.5 },
  initialSentiments: [
    { toEntityRef: 'wolf', emotion: 'fear', strength: 0.7 },
    { toEntityRef: 'player', emotion: 'trust', strength: 0.3 },
  ],
};
const wolfNeutral = { id: 'char_2', name: 'Wolf' };

describe('Character affect seeding', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('seeds mood and sentiments on context creation when story is provided', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([grannyAnxious, wolfNeutral]));
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: -0.4, arousal: 0.5 });
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBe(0.7);
    expect(ctx.getSentimentTo('char_1', 'player', 'trust')).toBe(0.3);
  });

  it('characters without authored affect get neutral defaults', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([wolfNeutral]));
    expect(ctx.getCharacterMood('char_2')).toEqual({ valence: 0, arousal: 0 });
    expect(ctx.getCharacterSentiments('char_2')).toEqual([]);
  });

  it('seeds when setStory is called after construction', () => {
    const ctx = new StoryContext();
    ctx.setStory(makeStoryStub([grannyAnxious]));
    expect(ctx.getCharacterMood('char_1').valence).toBeCloseTo(-0.4);
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBe(0.7);
  });

  it('does not overwrite an existing runtime mood', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([grannyAnxious]));
    // Simulate an UpdateAffect mid-game shift
    ctx.setCharacterMood('char_1', { valence: 0.8, arousal: -0.2 });
    // Re-seed (e.g. story object swapped) — runtime value preserved
    ctx.seedCharacterAffectFromStory();
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: 0.8, arousal: -0.2 });
  });

  it('does not duplicate sentiments when re-seeded', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([grannyAnxious]));
    ctx.seedCharacterAffectFromStory();
    ctx.seedCharacterAffectFromStory();
    expect(ctx.getCharacterSentiments('char_1')).toHaveLength(2);
  });

  it('does not overwrite a sentiment that was already strengthened at runtime', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([grannyAnxious]));
    // Granny's fear of the wolf seeded at 0.7. UpdateAffect bumps to 0.9.
    ctx.addCharacterSentiment('char_1', 'wolf', 'fear', 0.2);
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(0.9);
    ctx.seedCharacterAffectFromStory();
    // Re-seed leaves the strengthened value alone (matching row already exists).
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(0.9);
  });

  it('reset() clears runtime state and re-seeds from authored values', () => {
    const ctx = new StoryContext(undefined, makeStoryStub([grannyAnxious]));
    // Drift mid-game
    ctx.setCharacterMood('char_1', { valence: 0.9, arousal: 0.9 });
    ctx.addCharacterSentiment('char_1', 'wolf', 'fear', 0.3);
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(1);
    ctx.reset();
    // Back to authored starting point.
    expect(ctx.getCharacterMood('char_1')).toEqual({ valence: -0.4, arousal: 0.5 });
    expect(ctx.getSentimentTo('char_1', 'wolf', 'fear')).toBe(0.7);
  });

  it('clamps authored values that exceed [-1, 1]', () => {
    const wild = {
      id: 'char_x',
      name: 'Wild',
      initialMood: { valence: 5, arousal: -3 },
      initialSentiments: [{ toEntityRef: 'player', emotion: 'rage', strength: 7 }],
    };
    const ctx = new StoryContext(undefined, makeStoryStub([wild]));
    expect(ctx.getCharacterMood('char_x')).toEqual({ valence: 1, arousal: -1 });
    expect(ctx.getSentimentTo('char_x', 'player', 'rage')).toBe(1);
  });
});
