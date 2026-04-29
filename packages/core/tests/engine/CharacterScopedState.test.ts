/**
 * Tests for character-scoped state on StoryContext (Layer 2 of the rich-character roadmap).
 *
 * Validates that:
 *   - counters / variables / flags can be namespaced by character ref
 *   - refs resolve through the story's character list (id, name, displayName)
 *   - unknown refs still get coherent storage (used as bucket key directly)
 *   - state survives serialize / loadFromSerialized round-trip
 *   - global counters/variables remain independent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

// Minimal Story-shaped stub: only what the resolver and reset paths read.
function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string }>) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

describe('StoryContext — character-scoped state', () => {
  let context: StoryContext;
  const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
  const wolf = { id: 'char_2', name: 'Wolf' };

  beforeEach(() => {
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext(undefined, makeStoryStub([granny, wolf]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('counters', () => {
    it('default to 0 when unset', () => {
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(0);
    });

    it('store and retrieve by id', () => {
      context.setCharacterCounter('char_1', 'trust', 5);
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(5);
    });

    it('resolve by name and displayName to the same bucket as id', () => {
      context.setCharacterCounter('Granny', 'trust', 3);
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(3);
      expect(context.getCharacterCounter('grandma', 'trust')).toBe(3);
    });

    it('namespace by character — different characters keep independent values', () => {
      context.setCharacterCounter('char_1', 'trust', 5);
      context.setCharacterCounter('char_2', 'trust', -2);
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(5);
      expect(context.getCharacterCounter('char_2', 'trust')).toBe(-2);
    });

    it('increment delta-style', () => {
      expect(context.incrementCharacterCounter('char_1', 'trust', 2)).toBe(2);
      expect(context.incrementCharacterCounter('char_1', 'trust', 3)).toBe(5);
      expect(context.incrementCharacterCounter('char_1', 'trust', -1)).toBe(4);
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(4);
    });

    it('emit characterCounterChanged on set', () => {
      const handler = vi.fn();
      context.on('characterCounterChanged', handler);
      context.setCharacterCounter('Granny', 'trust', 7);
      expect(handler).toHaveBeenCalledWith({
        characterRef: 'char_1',
        name: 'trust',
        value: 7,
        previous: 0,
      });
    });

    it('store under the original ref when no character matches (inline persona / legacy)', () => {
      context.setCharacterCounter('Stranger', 'mood', 1);
      expect(context.getCharacterCounter('Stranger', 'mood')).toBe(1);
    });

    it('do not collide with global un-namespaced counters', () => {
      context.setCounter('trust', 100);
      context.setCharacterCounter('char_1', 'trust', 5);
      expect(context.getCounter('trust')).toBe(100);
      expect(context.getCharacterCounter('char_1', 'trust')).toBe(5);
    });
  });

  describe('variables', () => {
    it('store and retrieve any value', () => {
      context.setCharacterVariable('char_1', 'mood', 'curious');
      context.setCharacterVariable('char_1', 'metPlayerCount', 3);
      expect(context.getCharacterVariable('char_1', 'mood')).toBe('curious');
      expect(context.getCharacterVariable('char_1', 'metPlayerCount')).toBe(3);
    });

    it('return undefined when unset', () => {
      expect(context.getCharacterVariable('char_1', 'unknown')).toBeUndefined();
    });

    it('resolve refs through name / displayName', () => {
      context.setCharacterVariable('Wolf', 'lastSeen', 'forest');
      expect(context.getCharacterVariable('char_2', 'lastSeen')).toBe('forest');
    });
  });

  describe('flags', () => {
    it('default to false', () => {
      expect(context.getCharacterFlag('char_1', 'metPlayer')).toBe(false);
    });

    it('toggle on/off', () => {
      context.setCharacterFlag('char_1', 'metPlayer', true);
      expect(context.getCharacterFlag('char_1', 'metPlayer')).toBe(true);
      context.setCharacterFlag('char_1', 'metPlayer', false);
      expect(context.getCharacterFlag('char_1', 'metPlayer')).toBe(false);
    });

    it('resolve refs', () => {
      context.setCharacterFlag('Grandma', 'hasAccused', true);
      expect(context.getCharacterFlag('char_1', 'hasAccused')).toBe(true);
    });
  });

  describe('getCharacterState', () => {
    it('aggregates counters + variables + flags for a character', () => {
      context.setCharacterCounter('char_1', 'trust', 5);
      context.setCharacterVariable('char_1', 'mood', 'happy');
      context.setCharacterFlag('char_1', 'metPlayer', true);
      const state = context.getCharacterState('Granny');
      expect(state).toEqual({
        counters: { trust: 5 },
        variables: { mood: 'happy' },
        flags: { metPlayer: true },
      });
    });

    it('returns empty objects for an empty / unknown character', () => {
      expect(context.getCharacterState('char_2')).toEqual({ counters: {}, variables: {}, flags: {} });
    });
  });

  describe('serialization round-trip', () => {
    it('survives serialize → loadFromSerialized', () => {
      context.setCharacterCounter('char_1', 'trust', 5);
      context.setCharacterVariable('char_2', 'goal', 'eat');
      context.setCharacterFlag('char_1', 'metPlayer', true);

      const dump = context.serialize();
      const next = new StoryContext(undefined, makeStoryStub([granny, wolf]));
      next.loadFromSerialized(dump);

      expect(next.getCharacterCounter('char_1', 'trust')).toBe(5);
      expect(next.getCharacterVariable('char_2', 'goal')).toBe('eat');
      expect(next.getCharacterFlag('char_1', 'metPlayer')).toBe(true);
    });

    it('handles older serialized state without character-scoped fields', () => {
      // Older saves predate Layer 2 — loader must default missing fields to {}.
      const legacyDump: any = {
        currentBeatId: '0',
        variables: {},
        counters: {},
        inventory: [],
        characterInventories: {},
        visitedBeats: [],
        timers: {},
        history: [],
      };
      const next = new StoryContext(undefined, makeStoryStub([granny]));
      next.loadFromSerialized(legacyDump);
      expect(next.getCharacterCounter('char_1', 'trust')).toBe(0);
      expect(next.getCharacterVariable('char_1', 'mood')).toBeUndefined();
      expect(next.getCharacterFlag('char_1', 'met')).toBe(false);
    });
  });
});
