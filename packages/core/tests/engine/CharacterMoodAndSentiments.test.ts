/**
 * Tests for character mood + sentiments runtime state (Layer 3 / Step 4 MVP).
 *
 * Validates:
 *   - mood defaults to neutral, set/nudge clamp to [-1, 1] per axis
 *   - sentiments add and strengthen, strength clamped to [-1, 1]
 *   - getSentimentTo returns total strength across emotions when emotion is unspecified
 *   - all of it survives serialize/load round-trip
 *   - older saves without these slots load with empty defaults
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

describe('StoryContext — mood + sentiments', () => {
  let context: StoryContext;
  const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
  const wolf = { id: 'char_2', name: 'Wolf' };

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('mood', () => {
    it('defaults to neutral when unset', () => {
      expect(context.getCharacterMood('char_1')).toEqual({ valence: 0, arousal: 0 });
    });

    it('setCharacterMood replaces values, clamping per axis', () => {
      context.setCharacterMood('char_1', { valence: 0.5, arousal: -0.3 });
      expect(context.getCharacterMood('char_1')).toEqual({ valence: 0.5, arousal: -0.3 });
      context.setCharacterMood('char_1', { valence: 5.0, arousal: -10 });
      expect(context.getCharacterMood('char_1')).toEqual({ valence: 1, arousal: -1 });
    });

    it('preserves the unspecified axis when only one is set', () => {
      context.setCharacterMood('char_1', { valence: 0.7, arousal: 0.2 });
      context.setCharacterMood('char_1', { valence: -0.4 });
      expect(context.getCharacterMood('char_1')).toEqual({ valence: -0.4, arousal: 0.2 });
    });

    it('nudgeCharacterMood adds deltas, clamped', () => {
      context.nudgeCharacterMood('char_1', 0.4, 0.2);
      context.nudgeCharacterMood('char_1', 0.4, 0.2);
      const after = context.getCharacterMood('char_1');
      expect(after.valence).toBeCloseTo(0.8);
      expect(after.arousal).toBeCloseTo(0.4);
      // Pushing past 1 clamps without throwing
      context.nudgeCharacterMood('char_1', 5, 5);
      expect(context.getCharacterMood('char_1')).toEqual({ valence: 1, arousal: 1 });
    });

    it('resolves refs through name and displayName', () => {
      context.setCharacterMood('Granny', { valence: 0.6, arousal: 0 });
      expect(context.getCharacterMood('char_1').valence).toBe(0.6);
      expect(context.getCharacterMood('grandma').valence).toBe(0.6);
    });

    it('emits characterMoodChanged event', () => {
      const handler = vi.fn();
      context.on('characterMoodChanged', handler);
      context.setCharacterMood('Granny', { valence: 0.5, arousal: 0 });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        characterRef: 'char_1',
        mood: { valence: 0.5, arousal: 0 },
      }));
    });
  });

  describe('sentiments', () => {
    it('returns [] when no sentiments exist', () => {
      expect(context.getCharacterSentiments('char_1')).toEqual([]);
    });

    it('addCharacterSentiment creates a new entry with current strength clamped', () => {
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.7);
      const sentiments = context.getCharacterSentiments('char_1');
      expect(sentiments).toHaveLength(1);
      expect(sentiments[0]).toMatchObject({ toEntityRef: 'player', emotion: 'trust', strength: 0.7 });
      expect(typeof sentiments[0].createdAt).toBe('number');
    });

    it('strengthens an existing sentiment instead of duplicating', () => {
      const ts1 = context.addCharacterSentiment('char_1', 'player', 'trust', 0.4)!.createdAt;
      // Spin briefly so any timestamp diffs would be observable
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.3);
      const sentiments = context.getCharacterSentiments('char_1');
      expect(sentiments).toHaveLength(1);
      expect(sentiments[0].strength).toBeCloseTo(0.7);
      // createdAt of the original sentiment is preserved
      expect(sentiments[0].createdAt).toBe(ts1);
    });

    it('strength is clamped to [-1, 1] across multiple additions', () => {
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.6);
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.7);
      const s = context.getCharacterSentiments('char_1')[0];
      expect(s.strength).toBe(1);
    });

    it('different emotions toward the same target are separate rows', () => {
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.4);
      context.addCharacterSentiment('char_1', 'player', 'fear', 0.3);
      expect(context.getCharacterSentiments('char_1')).toHaveLength(2);
    });

    it('getSentimentTo returns the strength for a specific emotion', () => {
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.5);
      context.addCharacterSentiment('char_1', 'player', 'fear', -0.2);
      expect(context.getSentimentTo('char_1', 'player', 'trust')).toBe(0.5);
      expect(context.getSentimentTo('char_1', 'player', 'fear')).toBe(-0.2);
      expect(context.getSentimentTo('char_1', 'player', 'love')).toBe(0);
    });

    it('getSentimentTo without emotion sums across emotions toward the target', () => {
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.5);
      context.addCharacterSentiment('char_1', 'player', 'fear', -0.2);
      context.addCharacterSentiment('char_1', 'player', 'pride', 0.1);
      expect(context.getSentimentTo('char_1', 'player')).toBeCloseTo(0.4);
    });

    it('resolves refs through name when adding', () => {
      context.addCharacterSentiment('Granny', 'player', 'trust', 0.5);
      expect(context.getCharacterSentiments('char_1')).toHaveLength(1);
    });

    it('emits characterSentimentChanged event', () => {
      const handler = vi.fn();
      context.on('characterSentimentChanged', handler);
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.3);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        characterRef: 'char_1', toEntityRef: 'player', emotion: 'trust', strength: 0.3, delta: 0.3,
      }));
    });
  });

  describe('serialization round-trip', () => {
    it('preserves mood and sentiments through serialize → load', () => {
      context.setCharacterMood('char_1', { valence: 0.4, arousal: -0.2 });
      context.addCharacterSentiment('char_1', 'player', 'trust', 0.5);
      context.addCharacterSentiment('char_2', 'char_1', 'fear', 0.3);

      const dump = context.serialize();
      const next = new StoryContext(undefined, makeStoryStub([granny, wolf]));
      next.loadFromSerialized(dump);

      expect(next.getCharacterMood('char_1')).toEqual({ valence: 0.4, arousal: -0.2 });
      expect(next.getSentimentTo('char_1', 'player', 'trust')).toBe(0.5);
      expect(next.getSentimentTo('char_2', 'char_1', 'fear')).toBe(0.3);
    });

    it('older saves without mood/sentiments load with empty defaults', () => {
      const legacy: any = {
        currentBeatId: '0',
        variables: {},
        counters: {},
        inventory: [],
        characterInventories: {},
        visitedBeats: [],
        timers: {},
        history: [],
        // No characterMoods / characterSentiments — pre-Step 4 save
      };
      const next = new StoryContext(undefined, makeStoryStub([granny]));
      next.loadFromSerialized(legacy);
      expect(next.getCharacterMood('char_1')).toEqual({ valence: 0, arousal: 0 });
      expect(next.getCharacterSentiments('char_1')).toEqual([]);
    });
  });
});
