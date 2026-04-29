/**
 * StoryContext.checkCondition for the new mood / sentiment condition types
 * (Step 4 part 3). Validates the threshold-comparison logic, axis selection,
 * emotion-filtered vs summed sentiment lookup, and missing-field guards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import type { Condition } from '../../src/types';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return { getCharacters: () => characters, getFirstBeatId: () => '0' } as any;
}

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('checkCondition — mood', () => {
  let context: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the valence axis by default', () => {
    context.setCharacterMood('char_1', { valence: 0.6, arousal: -0.2 });
    const cond: Condition = { type: 'mood', operator: '>=', character: 'char_1', value: 0.5 };
    expect(context.checkCondition(cond)).toBe(true);
    cond.value = 0.7;
    expect(context.checkCondition(cond)).toBe(false);
  });

  it('reads the arousal axis when moodAxis is "arousal"', () => {
    context.setCharacterMood('char_1', { valence: 0.6, arousal: -0.2 });
    const cond: Condition = { type: 'mood', operator: '<=', character: 'char_1', moodAxis: 'arousal', value: -0.1 };
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('resolves character refs through name', () => {
    context.setCharacterMood('Granny', { valence: 0.4, arousal: 0 });
    const cond: Condition = { type: 'mood', operator: '>', character: 'Granny', value: 0.3 };
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('returns false when character is missing', () => {
    const cond: Condition = { type: 'mood', operator: '>', value: 0 };
    expect(context.checkCondition(cond)).toBe(false);
  });

  it('treats a never-set mood as zero', () => {
    const cond: Condition = { type: 'mood', operator: '==', character: 'char_2', value: 0 };
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('supports all comparison operators', () => {
    context.setCharacterMood('char_1', { valence: 0.5, arousal: 0 });
    for (const [op, expected] of [
      ['==', false], ['!=', true], ['>', true], ['<', false], ['>=', true], ['<=', false],
    ] as [Condition['operator'], boolean][]) {
      const cond: Condition = { type: 'mood', operator: op, character: 'char_1', value: 0.4 };
      expect(context.checkCondition(cond)).toBe(expected);
    }
  });
});

describe('checkCondition — sentiment', () => {
  let context: StoryContext;
  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('compares the strength of a specific (target, emotion) row', () => {
    context.addCharacterSentiment('char_1', 'player', 'trust', 0.6);
    const cond: Condition = {
      type: 'sentiment', operator: '>=',
      character: 'char_1', sentimentTarget: 'player', sentimentEmotion: 'trust',
      value: 0.5,
    };
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('sums strengths across emotions when sentimentEmotion is omitted', () => {
    context.addCharacterSentiment('char_1', 'player', 'trust', 0.4);
    context.addCharacterSentiment('char_1', 'player', 'fear', -0.2);
    context.addCharacterSentiment('char_1', 'player', 'pride', 0.3);
    const cond: Condition = {
      type: 'sentiment', operator: '>',
      character: 'char_1', sentimentTarget: 'player',
      value: 0.4,
    };
    // 0.4 + (-0.2) + 0.3 = 0.5 > 0.4
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('returns 0 when no matching sentiment exists', () => {
    const cond: Condition = {
      type: 'sentiment', operator: '==',
      character: 'char_1', sentimentTarget: 'player', sentimentEmotion: 'trust',
      value: 0,
    };
    expect(context.checkCondition(cond)).toBe(true);
  });

  it('returns false when character or sentimentTarget is missing', () => {
    expect(context.checkCondition({ type: 'sentiment', operator: '>', value: 0 } as Condition)).toBe(false);
    expect(context.checkCondition({ type: 'sentiment', operator: '>', character: 'char_1', value: 0 } as Condition)).toBe(false);
  });

  it('handles negative-strength sentiments correctly', () => {
    context.addCharacterSentiment('char_1', 'wolf', 'fear', 0.7);
    const cond: Condition = {
      type: 'sentiment', operator: '>=',
      character: 'char_1', sentimentTarget: 'wolf', sentimentEmotion: 'fear',
      value: 0.5,
    };
    expect(context.checkCondition(cond)).toBe(true);

    context.addCharacterSentiment('char_2', 'player', 'trust', -0.5);
    const cond2: Condition = {
      type: 'sentiment', operator: '<',
      character: 'char_2', sentimentTarget: 'player', sentimentEmotion: 'trust',
      value: 0,
    };
    expect(context.checkCondition(cond2)).toBe(true);
  });
});
