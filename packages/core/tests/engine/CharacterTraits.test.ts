/**
 * Step 6 — integration tests: trait modulation reaches fireCharacterEmotion,
 * the trait condition operator branches correctly, and the dossier renders
 * personality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';
import { buildDossier } from '../../src/utils/dossier';

const granny = { id: 'char_1', name: 'Granny', traits: { neuroticism: 1, agreeableness: 0.5 } };
const cabin = { id: 'char_2', name: 'Cabin', traits: { neuroticism: 0, extraversion: 1 } };
const neutral = { id: 'char_3', name: 'Neutral', traits: { neuroticism: 0.5, extraversion: 0.5 } };

describe('Trait modulation reaches fireCharacterEmotion', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([granny, cabin, neutral]);
    ctx = new StoryContext(undefined, story);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('high-neuroticism character receives a larger fear delta', () => {
    // Base 0.4 fear → with neuroticism=1, expected ~0.6.
    const next = ctx.fireCharacterEmotion('char_1', 'fear', 0.4);
    expect(next).toBeCloseTo(0.6);
  });

  it('low-neuroticism character receives a smaller fear delta', () => {
    const next = ctx.fireCharacterEmotion('char_2', 'fear', 0.4);
    expect(next).toBeCloseTo(0.2);
  });

  it('neutral-trait character behaves identically to a trait-less one', () => {
    const next = ctx.fireCharacterEmotion('char_3', 'fear', 0.4);
    expect(next).toBeCloseTo(0.4);
  });

  it('mood nudge is also amplified by traits', () => {
    // Joy weights: valence +0.7, arousal +0.4.
    // Cabin traits: extraversion=1 (joy +0.4), neuroticism=0 (joy −0.2,
    // centered −1 → +0.2 contribution).
    // Scale = 1 + 0.4 + 0.2 = 1.6 → effective delta 0.8 → mood (0.56, 0.32).
    ctx.fireCharacterEmotion('char_2', 'joy', 0.5);
    const mood = ctx.getCharacterMood('char_2');
    expect(mood.valence).toBeCloseTo(0.56);
    expect(mood.arousal).toBeCloseTo(0.32);
  });

  it('decay still uses palette rate regardless of traits', () => {
    ctx.fireCharacterEmotion('char_1', 'fear', 0.5);  // → 0.75 after modulation
    ctx.decayCharacterEmotions('char_1');             // fear decay 0.20 → 0.6
    const next = ctx.getCharacterEmotion('char_1', 'fear');
    expect(next).toBeCloseTo(0.6);
  });
});

describe('Trait condition evaluation', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([granny, cabin, neutral]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('evaluates trait conditions against the Character.traits bag', () => {
    expect(ctx.checkCondition({
      type: 'trait', operator: '>=', character: 'char_1', traitName: 'neuroticism', value: 0.7,
    })).toBe(true);
    expect(ctx.checkCondition({
      type: 'trait', operator: '<=', character: 'char_2', traitName: 'neuroticism', value: 0.2,
    })).toBe(true);
    expect(ctx.checkCondition({
      type: 'trait', operator: '>', character: 'char_3', traitName: 'neuroticism', value: 0.5,
    })).toBe(false);
  });

  it('treats missing traits as 0', () => {
    expect(ctx.checkCondition({
      type: 'trait', operator: '==', character: 'char_1', traitName: 'creativity', value: 0,
    })).toBe(true);
  });

  it('returns false when character or traitName is missing', () => {
    expect(ctx.checkCondition({ type: 'trait', operator: '>=', value: 0.5 } as any)).toBe(false);
    expect(ctx.checkCondition({ type: 'trait', operator: '>=', character: 'char_1', value: 0.5 } as any)).toBe(false);
  });
});

describe('Dossier renders personality', () => {
  it('includes a Personality line for non-neutral traits', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'Granny', description: 'old', traits: { neuroticism: 0.9, extraversion: 0.2 } },
    );
    expect(dossier).toContain('Personality:');
    expect(dossier).toContain('very high neuroticism');
    expect(dossier).toContain('low extraversion');
  });

  it('omits the Personality line for a neutral trait bag', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'Mid', description: 'middling', traits: { neuroticism: 0.5, extraversion: 0.5 } },
    );
    expect(dossier).not.toContain('Personality:');
  });

  it('renders only the diverging traits, not all of them', () => {
    const dossier = buildDossier(
      { id: 'c1', displayName: 'X', description: 'd',
        traits: { neuroticism: 0.5, extraversion: 0.9, openness: 0.5, agreeableness: 0.1 } },
    );
    expect(dossier).toContain('Personality:');
    expect(dossier).toContain('extraversion');
    expect(dossier).toContain('agreeableness');
    expect(dossier).not.toContain('neuroticism');  // neutral, dropped
    expect(dossier).not.toContain('openness');     // neutral, dropped
  });
});
