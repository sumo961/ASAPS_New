/**
 * Step 5 — emotion nodes runtime. Tests the emotion-level state, the
 * fire-with-mood-side-effect behaviour, decay on beat-enter, and dossier
 * integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import { DEFAULT_EMOTION_PALETTE } from '../../src/engine/EmotionPalette';

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

function makeStory() {
  const story = new Story();
  story.setCharacters([granny, wolf]);
  return story;
}

describe('Story.getEmotionPalette', () => {
  it('defaults to the Ekman 6 + pride/shame/interest palette', () => {
    const story = new Story();
    const palette = story.getEmotionPalette();
    const names = palette.map(e => e.name);
    expect(names).toEqual([
      'joy', 'anger', 'fear', 'sadness', 'surprise', 'disgust',
      'pride', 'shame', 'interest',
    ]);
  });

  it('setEmotionPalette replaces the palette', () => {
    const story = new Story();
    story.setEmotionPalette([
      { name: 'curiosity', weightToValence: 0.4, weightToArousal: 0.5, decayRate: 0.2 },
    ]);
    expect(story.getEmotionPalette().map(e => e.name)).toEqual(['curiosity']);
  });

  it('clones each entry on set so callers cannot mutate by reference', () => {
    const story = new Story();
    const input = [{ name: 'x', weightToValence: 0.5, weightToArousal: 0.5, decayRate: 0.1 }];
    story.setEmotionPalette(input);
    input[0].name = 'mutated';
    expect(story.getEmotionPalette()[0].name).toBe('x');
  });
});

describe('StoryContext — emotion state', () => {
  let context: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStory());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults each emotion to 0', () => {
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(0);
    expect(context.getCharacterEmotions('char_1')).toEqual({});
  });

  it('setCharacterEmotion replaces the level (clamped to [0, 1])', () => {
    context.setCharacterEmotion('char_1', 'joy', 0.5);
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(0.5);
    context.setCharacterEmotion('char_1', 'joy', 5);
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(1);
    context.setCharacterEmotion('char_1', 'joy', -2);
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(0);
  });

  it('matches emotion names case-insensitively', () => {
    context.setCharacterEmotion('char_1', 'Joy', 0.5);
    expect(context.getCharacterEmotion('char_1', 'JOY')).toBe(0.5);
  });

  it('fireCharacterEmotion bumps level AND nudges mood by palette weights', () => {
    // joy weight: valence +0.7, arousal +0.4.
    context.fireCharacterEmotion('char_1', 'joy', 0.5);
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(0.5);
    const mood = context.getCharacterMood('char_1');
    expect(mood.valence).toBeCloseTo(0.35);  // 0.7 * 0.5
    expect(mood.arousal).toBeCloseTo(0.20);  // 0.4 * 0.5
  });

  it('clamps level on accumulated firings', () => {
    context.fireCharacterEmotion('char_1', 'joy', 0.7);
    context.fireCharacterEmotion('char_1', 'joy', 0.7);
    expect(context.getCharacterEmotion('char_1', 'joy')).toBe(1);
  });

  it('does NOT nudge mood for unknown emotions (typos are caught)', () => {
    context.fireCharacterEmotion('char_1', 'made_up_emotion', 0.5);
    // Level updates anyway (so authors can use freeform emotions if they want)
    expect(context.getCharacterEmotion('char_1', 'made_up_emotion')).toBe(0.5);
    // But mood stays neutral (no palette weights)
    expect(context.getCharacterMood('char_1')).toEqual({ valence: 0, arousal: 0 });
  });

  it('emits characterEmotionChanged on set/fire', () => {
    const handler = vi.fn();
    context.on('characterEmotionChanged', handler);
    context.fireCharacterEmotion('char_1', 'fear', 0.4);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      characterRef: 'char_1', emotion: 'fear', value: 0.4, delta: 0.4,
    }));
  });

  it('decayCharacterEmotions reduces every level by its rate', () => {
    context.setCharacterEmotion('char_1', 'joy', 0.6);     // decayRate 0.20 → 0.48
    context.setCharacterEmotion('char_1', 'fear', 0.5);    // decayRate 0.20 → 0.40
    context.setCharacterEmotion('char_1', 'surprise', 0.3); // decayRate 0.40 → 0.18
    context.decayCharacterEmotions();
    expect(context.getCharacterEmotion('char_1', 'joy')).toBeCloseTo(0.48);
    expect(context.getCharacterEmotion('char_1', 'fear')).toBeCloseTo(0.40);
    expect(context.getCharacterEmotion('char_1', 'surprise')).toBeCloseTo(0.18);
  });

  it('removes emotions from state when they decay below 0.005', () => {
    context.setCharacterEmotion('char_1', 'joy', 0.01);
    context.decayCharacterEmotions();  // 0.01 * 0.8 = 0.008
    context.decayCharacterEmotions();  // 0.008 * 0.8 = 0.0064
    context.decayCharacterEmotions();  // 0.0064 * 0.8 = 0.00512
    context.decayCharacterEmotions();  // 0.00512 * 0.8 = 0.00410 — below threshold
    expect(context.getCharacterEmotions('char_1')).toEqual({});
  });

  it('decay is scoped to one character when ref is given', () => {
    context.setCharacterEmotion('char_1', 'joy', 0.5);
    context.setCharacterEmotion('char_2', 'joy', 0.5);
    context.decayCharacterEmotions('char_1');
    expect(context.getCharacterEmotion('char_1', 'joy')).toBeCloseTo(0.4);
    expect(context.getCharacterEmotion('char_2', 'joy')).toBe(0.5); // untouched
  });

  it('decays automatically on markBeatVisited (beat-enter tick)', () => {
    context.setCharacterEmotion('char_1', 'joy', 0.5);
    context.markBeatVisited('beat_a');
    expect(context.getCharacterEmotion('char_1', 'joy')).toBeCloseTo(0.4);
    context.markBeatVisited('beat_b');
    expect(context.getCharacterEmotion('char_1', 'joy')).toBeCloseTo(0.32);
  });

  it('serialize → loadFromSerialized round-trips emotion levels', () => {
    context.fireCharacterEmotion('char_1', 'fear', 0.6);
    context.fireCharacterEmotion('char_2', 'joy', 0.4);
    const dump = context.serialize();
    const next = new StoryContext(undefined, makeStory());
    next.loadFromSerialized(dump);
    expect(next.getCharacterEmotion('char_1', 'fear')).toBeCloseTo(0.6);
    expect(next.getCharacterEmotion('char_2', 'joy')).toBeCloseTo(0.4);
  });

  it('older saves without emotion levels load with empty defaults', () => {
    const legacy: any = {
      currentBeatId: '0', variables: {}, counters: {}, inventory: [],
      characterInventories: {}, visitedBeats: [], timers: {}, history: [],
    };
    const next = new StoryContext(undefined, makeStory());
    next.loadFromSerialized(legacy);
    expect(next.getCharacterEmotions('char_1')).toEqual({});
  });
});

describe('Default emotion palette weights', () => {
  it('pleasant emotions push valence positive', () => {
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'joy')!.weightToValence).toBeGreaterThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'pride')!.weightToValence).toBeGreaterThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'interest')!.weightToValence).toBeGreaterThan(0);
  });
  it('unpleasant emotions push valence negative', () => {
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'anger')!.weightToValence).toBeLessThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'fear')!.weightToValence).toBeLessThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'sadness')!.weightToValence).toBeLessThan(0);
  });
  it('activating emotions push arousal positive', () => {
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'surprise')!.weightToArousal).toBeGreaterThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'anger')!.weightToArousal).toBeGreaterThan(0);
  });
  it('subduing emotions push arousal negative', () => {
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'sadness')!.weightToArousal).toBeLessThan(0);
    expect(DEFAULT_EMOTION_PALETTE.find(e => e.name === 'shame')!.weightToArousal).toBeLessThan(0);
  });
});
