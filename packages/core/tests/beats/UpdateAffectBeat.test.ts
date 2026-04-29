import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateAffectBeat } from '../../src/beats/UpdateAffectBeat';
import { StoryContext } from '../../src/engine/StoryContext';

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
});
