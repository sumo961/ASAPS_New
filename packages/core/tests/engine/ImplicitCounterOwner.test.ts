/**
 * Bare counter names route to the unique OWNING character.
 *
 * Red Story regression (2026-08): the author defined friendly/aggressive/
 * flirtatious ON Red (with HUD meters), but the legacy dialog effects and
 * condition beats reference them by bare name — they predate scoped
 * counters. Bare references went to the story-global store, so the meters
 * (which read Red's scoped store, seeded 0) never moved while the debug
 * rail showed the global value climbing.
 *
 * Rule under test: a bare name routes to a character's scoped store iff
 * EXACTLY ONE character defines a counter of that name; otherwise the
 * historical global behavior is unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

function makeStoryStub(characters: any[]) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

const red = {
  id: 'red',
  name: 'Red',
  counters: [
    { name: 'friendly', value: 0 },
    { name: 'aggressive', value: 0 },
  ],
};
const wolf = { id: 'wolf', name: 'Wolf', counters: [{ name: 'hunger', value: 1 }] };
// Both define 'shared' — ambiguous, must stay global.
const twinA = { id: 'a', name: 'A', counters: [{ name: 'shared' }] };
const twinB = { id: 'b', name: 'B', counters: [{ name: 'shared' }] };

describe('StoryContext — implicit counter owner resolution', () => {
  let context: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    });
    context = new StoryContext(undefined, makeStoryStub([red, wolf, twinA, twinB]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes a bare increment to the unique owning character', () => {
    context.incrementCounter('aggressive', 2);
    expect(context.getCharacterCounter('red', 'aggressive')).toBe(2);
    // nothing lands in the global store
    expect(context.getCounters()['aggressive']).toBeUndefined();
  });

  it('reads back through the same routing (conditions see effect writes)', () => {
    context.incrementCounter('aggressive', 3);
    expect(context.getCounter('aggressive')).toBe(3);
  });

  it('routes bare setCounter to the owner', () => {
    context.setCounter('hunger', 7);
    expect(context.getCharacterCounter('wolf', 'hunger')).toBe(7);
    expect(context.getCounter('hunger')).toBe(7);
  });

  it('keeps names owned by SEVERAL characters global (ambiguous)', () => {
    context.incrementCounter('shared', 1);
    expect(context.getCounters()['shared']).toBe(1);
    expect(context.getCharacterCounter('a', 'shared')).toBe(0);
    expect(context.getCharacterCounter('b', 'shared')).toBe(0);
  });

  it('keeps unowned names global (historical behavior)', () => {
    context.incrementCounter('score', 10);
    expect(context.getCounters()['score']).toBe(10);
    expect(context.getCounter('score')).toBe(10);
  });

  it('applies effects with bare names to the owning character', () => {
    context.applyEffect({ type: 'incrementCounter', target: 'aggressive', value: 2 } as any);
    expect(context.getCharacterCounter('red', 'aggressive')).toBe(2);
  });

  it('an explicit effect.character still wins over implicit resolution', () => {
    context.applyEffect({ type: 'incrementCounter', target: 'aggressive', value: 2, character: 'wolf' } as any);
    expect(context.getCharacterCounter('wolf', 'aggressive')).toBe(2);
    expect(context.getCharacterCounter('red', 'aggressive')).toBe(0);
  });

  it('bare counter CONDITIONS read the owned value', () => {
    context.incrementCounter('aggressive', 2);
    const result = context.checkCondition({
      type: 'counter',
      variableName: 'aggressive',
      operator: '>=',
      value: 2,
    } as any);
    expect(result).toBe(true);
  });

  it('works without a story (everything global)', () => {
    const bare = new StoryContext();
    bare.incrementCounter('aggressive', 2);
    expect(bare.getCounters()['aggressive']).toBe(2);
  });
});
