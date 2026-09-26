/**
 * In-story restarts (End Screen / AI Summary "Restart") keep what the author
 * marked "keep across restarts" and count the playthrough; story variables
 * start at their Project Settings value (2026-09-26 — the runtime used to
 * ignore defaultValue entirely).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const clare = {
  id: 'char_clare', name: 'clare', displayName: 'Clare', keepVariantOnRestart: true,
  initialMood: { valence: 0, arousal: 0 },
  counters: [
    { name: 'candor', value: 0, keepOnRestart: true },
    { name: 'sleepLost', value: 0 },
  ],
  variants: [{ id: 'guarded', name: 'Guarded', initialMood: { valence: -0.4, arousal: 0.2 } }],
};

function context() {
  const story = new Story();
  story.setSettings({
    variables: [
      { name: 'chosenPath', type: 'string', defaultValue: 'none', keepOnRestart: true },
      { name: 'visited', type: 'boolean', defaultValue: false },
      { name: 'score', type: 'number', defaultValue: 10 },
    ],
  });
  story.setCharacters([clare] as any);
  return new StoryContext(undefined, story);
}

describe('story variables start at their default', () => {
  it('seeds defaultValue and the playthrough count', () => {
    const ctx = context();
    expect(ctx.getVariable('chosenPath')).toBe('none');
    expect(ctx.getVariable('visited')).toBe(false);
    expect(ctx.getVariable('score')).toBe(10);
    expect(ctx.getPlaythrough()).toBe(1);
    expect(ctx.checkCondition({ type: 'variable', variableName: 'playthrough', operator: '==', value: 1 } as any)).toBe(true);
  });
});

describe('restartPlaythrough', () => {
  it('a full reset keeps the marked variable, counter and variant, and counts the run', () => {
    const ctx = context();
    ctx.setVariable('chosenPath', 'north');
    ctx.setVariable('score', 42);
    ctx.setCharacterCounter('char_clare', 'candor', 3);
    ctx.setCharacterCounter('char_clare', 'sleepLost', 5);
    ctx.setActiveCharacterVariant('char_clare', 'guarded');

    ctx.restartPlaythrough('all');

    expect(ctx.getVariable('chosenPath')).toBe('north');   // kept
    expect(ctx.getVariable('score')).toBe(10);             // back to its default
    expect(ctx.getCharacterCounter('char_clare', 'candor')).toBe(3);    // kept
    expect(ctx.getCharacterCounter('char_clare', 'sleepLost')).toBe(0); // reset
    expect(ctx.getActiveCharacterVariant('char_clare')).toBe('guarded');
    expect(ctx.getCharacterMood('char_clare').valence).toBeCloseTo(-0.4); // the kept persona's start
    expect(ctx.getPlaythrough()).toBe(2);
    ctx.restartPlaythrough('all');
    expect(ctx.getPlaythrough()).toBe(3);
  });

  it('a selective reset of variables re-seeds defaults and keeps the marked ones', () => {
    const ctx = context();
    ctx.setVariable('chosenPath', 'south');
    ctx.setVariable('visited', true);
    ctx.restartPlaythrough({ variables: true });
    expect(ctx.getVariable('chosenPath')).toBe('south');
    expect(ctx.getVariable('visited')).toBe(false);
    expect(ctx.getPlaythrough()).toBe(2);
  });

  it('with reset off, only the playthrough count moves', () => {
    const ctx = context();
    ctx.setVariable('score', 7);
    ctx.restartPlaythrough(null);
    expect(ctx.getVariable('score')).toBe(7);
    expect(ctx.getPlaythrough()).toBe(2);
  });

  it('a host restart (reset) is a fresh start: nothing kept, playthrough 1', () => {
    const ctx = context();
    ctx.setVariable('chosenPath', 'north');
    ctx.restartPlaythrough('all');
    ctx.reset();
    expect(ctx.getVariable('chosenPath')).toBe('none');
    expect(ctx.getPlaythrough()).toBe(1);
  });
});

describe('playthrough is built in, not a stored variable', () => {
  it('reads in text/conditions, stays out of the variable list, and survives save/load', () => {
    const ctx = context();
    expect(ctx.getVariable('playthrough')).toBe(1);
    expect(Object.keys(ctx.getState().variables)).not.toContain('playthrough');
    ctx.restartPlaythrough('all');
    const saved = ctx.serialize();
    const other = context();
    other.loadFromSerialized(saved);
    expect(other.getPlaythrough()).toBe(2);
  });
});

describe('the ending that restarted is not "visited" in the new run', () => {
  it('skips the ending\'s own exit mark once, then records visits normally', () => {
    const ctx = context();
    ctx.markBeatVisited('beat_a');
    (ctx as any).state.currentBeatId = 'beat_end';
    ctx.restartPlaythrough('all');
    ctx.markBeatVisited('beat_end');            // Beat.execute's exit mark
    expect(ctx.getVisitedBeats()).not.toContain('beat_end');
    expect(ctx.getVisitedBeats()).not.toContain('beat_a');
    ctx.markBeatVisited('beat_end');            // reached again in the new run
    expect(ctx.getVisitedBeats()).toContain('beat_end');
  });
});

describe('partial reset reaches the characters', () => {
  it('"counters" also resets character counters back to their starting value', () => {
    const ctx = context();
    ctx.setCharacterCounter('char_clare', 'sleepLost', 5);
    ctx.selectiveReset({ counters: true });
    expect(ctx.getCharacterCounter('char_clare', 'sleepLost')).toBe(0);
  });

  it('"characters" resets feelings and the variant; unticked, they are remembered', () => {
    const ctx = context();
    ctx.nudgeCharacterMood('char_clare', 0.6, 0);
    ctx.setActiveCharacterVariant('char_clare', 'guarded', { seedAffect: false });
    ctx.selectiveReset({ variables: true });            // characters not ticked
    expect(ctx.getActiveCharacterVariant('char_clare')).toBe('guarded');
    expect(ctx.getCharacterMood('char_clare').valence).toBeCloseTo(0.6);

    ctx.selectiveReset({ characters: true });
    expect(ctx.getActiveCharacterVariant('char_clare')).toBeUndefined();
    expect(ctx.getCharacterMood('char_clare').valence).toBeCloseTo(0);
  });

  it('keepVariantOnRestart still wins over a characters reset', () => {
    const ctx = context();
    ctx.setActiveCharacterVariant('char_clare', 'guarded');
    ctx.restartPlaythrough({ characters: true });
    expect(ctx.getActiveCharacterVariant('char_clare')).toBe('guarded');
  });
});

describe('the restarting ending is named by the beat itself', () => {
  it('skips the ending\'s exit mark even when currentBeatId points elsewhere (timer path)', () => {
    const ctx = context();
    (ctx as any).state.currentBeatId = 'beat_interrupted';
    ctx.restartPlaythrough('all', 'beat_end');
    ctx.markBeatVisited('beat_end');
    expect(ctx.getVisitedBeats()).not.toContain('beat_end');
    ctx.markBeatVisited('beat_interrupted');                // not swallowed
    expect(ctx.getVisitedBeats()).toContain('beat_interrupted');
  });

  it('a host reset clears the marker', () => {
    const ctx = context();
    ctx.restartPlaythrough('all', 'beat_end');
    ctx.reset();
    ctx.markBeatVisited('beat_end');
    expect(ctx.getVisitedBeats()).toContain('beat_end');
  });
});
