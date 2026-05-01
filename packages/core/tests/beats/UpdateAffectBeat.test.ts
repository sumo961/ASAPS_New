import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateAffectBeat, synthesizeEffectsFromLegacyParams } from '../../src/beats/UpdateAffectBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('UpdateAffectBeat', () => {
  let context: StoryContext;
  const renderer: any = {};

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads parameters from top-level config OR nested parameters object', () => {
    const beatA = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      character: 'char_1', moodValenceDelta: 0.4,
    } as any);
    const beatB = new UpdateAffectBeat({
      id: 'b2', name: 't', type: 'updateAffect',
      parameters: { character: 'char_2', moodArousalDelta: -0.3 },
    } as any);
    expect(beatA.getParameters()).toMatchObject({ character: 'char_1', moodValenceDelta: 0.4 });
    expect(beatB.getParameters()).toMatchObject({ character: 'char_2', moodArousalDelta: -0.3 });
  });

  it('nudges mood by the configured deltas (clamped per axis)', async () => {
    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: { character: 'Granny', moodValenceDelta: 0.7, moodArousalDelta: 0.2 },
    } as any);
    await (beat as any).performAction(context, renderer);
    expect(context.getCharacterMood('char_1')).toEqual({ valence: 0.7, arousal: 0.2 });
    // Repeat: clamps at 1
    await (beat as any).performAction(context, renderer);
    await (beat as any).performAction(context, renderer);
    expect(context.getCharacterMood('char_1').valence).toBe(1);
  });

  it('records a sentiment when target + emotion + delta are all set', async () => {
    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: {
        character: 'char_1',
        sentimentTarget: 'player',
        sentimentEmotion: 'trust',
        sentimentDelta: 0.5,
      },
    } as any);
    await (beat as any).performAction(context, renderer);
    expect(context.getSentimentTo('char_1', 'player', 'trust')).toBe(0.5);
  });

  it('strengthens an existing sentiment when fired twice', async () => {
    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: {
        character: 'char_1', sentimentTarget: 'player', sentimentEmotion: 'trust', sentimentDelta: 0.3,
      },
    } as any);
    await (beat as any).performAction(context, renderer);
    await (beat as any).performAction(context, renderer);
    expect(context.getSentimentTo('char_1', 'player', 'trust')).toBeCloseTo(0.6);
  });

  it('skips sentiment recording when only some sentiment fields are set', async () => {
    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: { character: 'char_1', sentimentTarget: 'player' /* no emotion or delta */ },
    } as any);
    await (beat as any).performAction(context, renderer);
    expect(context.getCharacterSentiments('char_1')).toEqual([]);
  });

  it('mood and sentiment can be updated in one beat', async () => {
    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: {
        character: 'char_1',
        moodValenceDelta: -0.4,
        sentimentTarget: 'wolf',
        sentimentEmotion: 'fear',
        sentimentDelta: 0.7,
      },
    } as any);
    await (beat as any).performAction(context, renderer);
    expect(context.getCharacterMood('char_1').valence).toBeCloseTo(-0.4);
    expect(context.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(0.7);
  });

  it('updateParameters mutates fields cleanly', () => {
    const beat = new UpdateAffectBeat({ id: 'b1', name: 't', type: 'updateAffect' } as any);
    beat.updateParameters({ character: 'char_2', moodValenceDelta: 0.3 });
    expect(beat.getParameters()).toMatchObject({ character: 'char_2', moodValenceDelta: 0.3 });
  });

  it('fires an emotion when emotion + emotionDelta are set, auto-nudging mood', async () => {
    // Use a real Story so the EmotionPalette is in scope for the side-effect.
    const story = new Story();
    story.setCharacters([granny, wolf]);
    const ctxWithStory = new StoryContext(undefined, story);

    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: { character: 'char_1', emotion: 'joy', emotionDelta: 0.5 },
    } as any);
    await (beat as any).performAction(ctxWithStory, renderer);
    expect(ctxWithStory.getCharacterEmotion('char_1', 'joy')).toBe(0.5);
    // joy weights: valence +0.7, arousal +0.4 → mood = (0.35, 0.20)
    expect(ctxWithStory.getCharacterMood('char_1').valence).toBeCloseTo(0.35);
    expect(ctxWithStory.getCharacterMood('char_1').arousal).toBeCloseTo(0.20);
  });

  it('skips emotion firing when only one of emotion / emotionDelta is set', async () => {
    const story = new Story();
    story.setCharacters([granny]);
    const ctxWithStory = new StoryContext(undefined, story);

    const beatA = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: { character: 'char_1', emotion: 'joy' /* no delta */ },
    } as any);
    const beatB = new UpdateAffectBeat({
      id: 'b2', name: 't', type: 'updateAffect',
      parameters: { character: 'char_1', emotionDelta: 0.5 /* no name */ },
    } as any);
    await (beatA as any).performAction(ctxWithStory, renderer);
    await (beatB as any).performAction(ctxWithStory, renderer);
    expect(ctxWithStory.getCharacterEmotions('char_1')).toEqual({});
  });

  it('combines mood / sentiment / emotion in a single beat', async () => {
    const story = new Story();
    story.setCharacters([granny, wolf]);
    const ctxWithStory = new StoryContext(undefined, story);

    const beat = new UpdateAffectBeat({
      id: 'b1', name: 't', type: 'updateAffect',
      parameters: {
        character: 'char_1',
        moodValenceDelta: -0.2,
        sentimentTarget: 'wolf', sentimentEmotion: 'fear', sentimentDelta: 0.5,
        emotion: 'pride', emotionDelta: 0.4,
      },
    } as any);
    await (beat as any).performAction(ctxWithStory, renderer);
    expect(ctxWithStory.getSentimentTo('char_1', 'wolf', 'fear')).toBeCloseTo(0.5);
    expect(ctxWithStory.getCharacterEmotion('char_1', 'pride')).toBeCloseTo(0.4);
    // Mood: explicit -0.2 valence + pride's auto +0.5 × 0.4 = +0.2 → net 0
    expect(ctxWithStory.getCharacterMood('char_1').valence).toBeCloseTo(0);
    // pride's arousal weight 0.2 × 0.4 = +0.08
    expect(ctxWithStory.getCharacterMood('char_1').arousal).toBeCloseTo(0.08);
  });

  // v0.9.45 — UpdateAffectBeat now also accepts an effects[] array.
  // Each row is dispatched through context.applyEffect, so the same
  // bundles authors compose for choices apply standalone too.
  describe('v0.9.45 effects[] path', () => {
    it('applies a multi-row effects[] in order via context.applyEffect', async () => {
      const beat = new UpdateAffectBeat({
        id: 'b1', name: 't', type: 'updateAffect',
        parameters: {
          // No legacy fields — just the new effects array.
          effects: [
            { type: 'nudgeMood', target: 'char_1', valenceDelta: 0.3, arousalDelta: -0.1 },
            { type: 'addSentiment', target: 'char_1',
              sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.4 },
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(context.getCharacterMood('char_1')).toEqual({ valence: 0.3, arousal: -0.1 });
      expect(context.getSentimentTo('char_1', 'player', 'trust')).toBeCloseTo(0.4);
    });

    it('takes a bookmark via the bookmarkAffectState effect row', async () => {
      const beat = new UpdateAffectBeat({
        id: 'b1', name: 't', type: 'updateAffect',
        parameters: {
          effects: [
            { type: 'nudgeMood', target: 'char_1', valenceDelta: 0.5 },
            { type: 'bookmarkAffectState', target: '', bookmarkName: 'act-one-end' },
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(context.getAffectBookmarkNames()).toContain('act-one-end');
      const snap = context.getAffectBookmark('act-one-end');
      expect(snap?.moods['char_1'].valence).toBeCloseTo(0.5);
    });

    it('prefers effects[] over legacy single-row fields when both are set', async () => {
      // Legacy field would produce a -0.4 nudge; effects[] produces +0.3.
      // The new effects[] should win — runtime ignores legacy when effects present.
      const beat = new UpdateAffectBeat({
        id: 'b1', name: 't', type: 'updateAffect',
        parameters: {
          character: 'char_1',
          moodValenceDelta: -0.4,
          effects: [
            { type: 'nudgeMood', target: 'char_1', valenceDelta: 0.3 },
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(context.getCharacterMood('char_1').valence).toBeCloseTo(0.3);
    });

    it('synthesizeEffectsFromLegacyParams converts a legacy beat into an Effect[]', () => {
      const synth = synthesizeEffectsFromLegacyParams({
        character: 'char_1',
        moodValenceDelta: 0.3,
        moodArousalDelta: -0.1,
        sentimentTarget: 'player',
        sentimentEmotion: 'trust',
        sentimentDelta: 0.4,
        emotion: 'joy',
        emotionDelta: 0.2,
      });
      expect(synth).toHaveLength(3);
      expect(synth[0]).toMatchObject({ type: 'nudgeMood', target: 'char_1', valenceDelta: 0.3, arousalDelta: -0.1 });
      expect(synth[1]).toMatchObject({ type: 'addSentiment', target: 'char_1',
        sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.4 });
      expect(synth[2]).toMatchObject({ type: 'fireEmotion', target: 'char_1', emotion: 'joy', emotionDelta: 0.2 });
    });

    it('synthesizeEffectsFromLegacyParams returns empty when no legacy fields populated', () => {
      expect(synthesizeEffectsFromLegacyParams({})).toEqual([]);
      // Zero deltas are also no-ops.
      expect(synthesizeEffectsFromLegacyParams({
        character: 'char_1', moodValenceDelta: 0, moodArousalDelta: 0,
      })).toEqual([]);
    });

    it('synthesizeEffectsFromLegacyParams skips partial sentiment / emotion rows', () => {
      // Sentiment without target → skip.
      expect(synthesizeEffectsFromLegacyParams({
        character: 'char_1', sentimentEmotion: 'trust', sentimentDelta: 0.3,
      })).toEqual([]);
      // Emotion without name → skip.
      expect(synthesizeEffectsFromLegacyParams({
        character: 'char_1', emotionDelta: 0.5,
      })).toEqual([]);
    });
  });
});
