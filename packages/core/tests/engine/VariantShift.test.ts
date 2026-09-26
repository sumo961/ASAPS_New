/**
 * A mid-story variant switch keeps what the character lived through and
 * applies the authored change on top (2026-09-26, Hartmut's option 1). It
 * used to reseed: Late Light's Act I trust arc was erased at Nathan's
 * transition, so the Visit could never happen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const nathan = {
  id: 'char_nathan', name: 'nathan', displayName: 'Nathan',
  initialMood: { valence: -0.3, arousal: 0.1 },
  initialSentiments: [{ toEntityRef: 'player', emotion: 'trust', strength: 0.3 }],
  variants: [{ id: 'resurfaced', name: 'Resurfaced', initialMood: { valence: -0.2, arousal: -0.2 },
    initialSentiments: [{ toEntityRef: 'player', emotion: 'gratitude', strength: 0.4 }] }],
};

function context() {
  const story = new Story();
  story.setCharacters([nathan] as any);
  return new StoryContext(undefined, story);
}

describe('setCharacterVariant mid-story', () => {
  it('keeps accumulated feelings and adds the variant difference on top', () => {
    const ctx = context();
    ctx.applyEffect({ type: 'addSentiment', target: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.5 } as any);
    ctx.nudgeCharacterMood('char_nathan', 0.4, 0);
    ctx.applyEffect({ type: 'setCharacterVariant', target: 'char_nathan', variantId: 'resurfaced' } as any);
    expect(ctx.getSentimentTo('char_nathan', 'player', 'trust')).toBeCloseTo(0.8);    // lived trust kept
    expect(ctx.getSentimentTo('char_nathan', 'player', 'gratitude')).toBeCloseTo(0.4); // new in the variant
    const mood = ctx.getCharacterMood('char_nathan');
    expect(mood.valence).toBeCloseTo(-0.3 + 0.4 + 0.1); // lived +0.4, variant shift +0.1
    expect(mood.arousal).toBeCloseTo(0.1 - 0.3);
    // "since the start" still means since the story start
    expect(ctx.checkCondition({ type: 'sentiment', character: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', operator: '>=', value: 0.3, baseline: 'initial' } as any)).toBe(true);
  });

  it('suppressSeed changes no feelings; an explicit reseed still resets', () => {
    const a = context();
    a.applyEffect({ type: 'addSentiment', target: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.5 } as any);
    a.applyEffect({ type: 'setCharacterVariant', target: 'char_nathan', variantId: 'resurfaced', suppressSeed: true } as any);
    expect(a.getSentimentTo('char_nathan', 'player', 'gratitude')).toBe(0);
    expect(a.getSentimentTo('char_nathan', 'player', 'trust')).toBeCloseTo(0.8);
    const b = context();
    b.applyEffect({ type: 'addSentiment', target: 'char_nathan', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.5 } as any);
    b.setActiveCharacterVariant('char_nathan', 'resurfaced'); // story-start style reseed: the variant's list replaces
    expect(b.getSentimentTo('char_nathan', 'player', 'trust')).toBe(0);
    expect(b.getSentimentTo('char_nathan', 'player', 'gratitude')).toBeCloseTo(0.4);
  });
});
