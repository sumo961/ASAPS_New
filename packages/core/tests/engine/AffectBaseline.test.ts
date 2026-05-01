/**
 * Tests for v0.9.45 baseline-relative affect conditions and named bookmarks.
 *
 * Covers:
 *   - lazy first-touch capture of initial mood / emotion / sentiment values
 *   - delta-from-initial behaviour of mood / emotion / sentiment conditions
 *   - takeAffectBookmark snapshot semantics (all vs single character)
 *   - delta-from-bookmark condition evaluation
 *   - bookmarkAffectState effect dispatch
 *   - serialize/load round-trip preserves initials + bookmarks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';

function makeStoryStub(characters: Array<{ id: string; name?: string; displayName?: string; initialMood?: any; initialSentiments?: any[] }>) {
  return {
    getCharacters: () => characters,
    getFirstBeatId: () => '0',
  } as any;
}

describe('StoryContext — affect baselines (v0.9.45)', () => {
  let context: StoryContext;
  const alex = { id: 'char_alex', name: 'Alex' };

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub([alex]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial mood capture', () => {
    it('captures the pre-mutation mood value on first nudge', () => {
      // Default mood is {0, 0}; first nudge captures 0/0 as initial,
      // so a delta-from-initial condition checking valence ≥ 0.3 should
      // pass after a +0.4 nudge.
      context.nudgeCharacterMood('char_alex', 0.4);
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.3, baseline: 'initial',
      } as any)).toBe(true);
    });

    it('captures the seeded mood as the baseline (off-neutral start)', () => {
      // Re-init with a story whose Alex is seeded at valence -0.3.
      const seededStory = makeStoryStub([{
        id: 'char_alex', name: 'Alex',
        initialMood: { valence: -0.3, arousal: 0 },
      }]);
      context = new StoryContext(undefined, seededStory);
      // Current valence is -0.3. A literal "valence ≥ 0" check fails.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0, // literal
      } as any)).toBe(false);
      // After a +0.4 nudge, valence is +0.1.
      context.nudgeCharacterMood('char_alex', 0.4);
      // Literal still ≥ 0 holds.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0,
      } as any)).toBe(true);
      // Delta from initial (-0.3) is +0.4, so "improved by ≥ 0.3" holds.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.3, baseline: 'initial',
      } as any)).toBe(true);
    });

    it('does not re-capture initial after the first touch', () => {
      context.nudgeCharacterMood('char_alex', 0.4);
      context.nudgeCharacterMood('char_alex', 0.3);
      // Initial captured at first nudge (0); current = 0.7; delta = 0.7.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.65, baseline: 'initial',
      } as any)).toBe(true);
    });
  });

  describe('initial emotion capture', () => {
    it('fireCharacterEmotion captures pre-fire emotion level as initial', () => {
      context.fireCharacterEmotion('char_alex', 'fear', 0.6);
      // Initial fear was 0; current is 0.6; delta = 0.6.
      expect(context.checkCondition({
        type: 'emotion', character: 'char_alex', emotionName: 'fear',
        operator: '>=', value: 0.5, baseline: 'initial',
      } as any)).toBe(true);
    });

    it('captures separately per emotion', () => {
      context.fireCharacterEmotion('char_alex', 'fear', 0.5);
      context.fireCharacterEmotion('char_alex', 'joy', 0.3);
      // Both should have their own captured zero baselines.
      expect(context.checkCondition({
        type: 'emotion', character: 'char_alex', emotionName: 'joy',
        operator: '>=', value: 0.2, baseline: 'initial',
      } as any)).toBe(true);
    });
  });

  describe('initial sentiment capture', () => {
    it('captures sentiment of 0 at first add and reads delta', () => {
      context.addCharacterSentiment('char_alex', 'player', 'trust', 0.5);
      expect(context.checkCondition({
        type: 'sentiment', character: 'char_alex',
        sentimentTarget: 'player', sentimentEmotion: 'trust',
        operator: '>=', value: 0.4, baseline: 'initial',
      } as any)).toBe(true);
    });

    it('captures seeded sentiment as the baseline', () => {
      const seeded = makeStoryStub([{
        id: 'char_alex',
        initialSentiments: [{ toEntityRef: 'player', emotion: 'trust', strength: 0.3 }],
      }]);
      context = new StoryContext(undefined, seeded);
      // Current trust toward player is 0.3 (seeded). Delta from initial = 0.
      expect(context.checkCondition({
        type: 'sentiment', character: 'char_alex',
        sentimentTarget: 'player', sentimentEmotion: 'trust',
        operator: '>=', value: 0.1, baseline: 'initial',
      } as any)).toBe(false);
      // After a +0.2 boost, delta = 0.2.
      context.addCharacterSentiment('char_alex', 'player', 'trust', 0.2);
      expect(context.checkCondition({
        type: 'sentiment', character: 'char_alex',
        sentimentTarget: 'player', sentimentEmotion: 'trust',
        operator: '>=', value: 0.15, baseline: 'initial',
      } as any)).toBe(true);
    });

    it('handles separate (target, emotion) pairs independently', () => {
      context.addCharacterSentiment('char_alex', 'player', 'trust', 0.4);
      context.addCharacterSentiment('char_alex', 'player', 'fear', 0.2);
      // Trust delta 0.4, fear delta 0.2.
      expect(context.checkCondition({
        type: 'sentiment', character: 'char_alex',
        sentimentTarget: 'player', sentimentEmotion: 'trust',
        operator: '>=', value: 0.35, baseline: 'initial',
      } as any)).toBe(true);
      expect(context.checkCondition({
        type: 'sentiment', character: 'char_alex',
        sentimentTarget: 'player', sentimentEmotion: 'fear',
        operator: '>=', value: 0.35, baseline: 'initial',
      } as any)).toBe(false);
    });
  });

  describe('bookmarks', () => {
    it('takeAffectBookmark snapshots all character slots', () => {
      context.nudgeCharacterMood('char_alex', 0.5);
      context.fireCharacterEmotion('char_alex', 'joy', 0.4);
      context.addCharacterSentiment('char_alex', 'player', 'trust', 0.3);
      context.takeAffectBookmark('act-one-end');
      const snap = context.getAffectBookmark('act-one-end');
      expect(snap?.moods['char_alex'].valence).toBeCloseTo(0.5);
      expect(snap?.emotionLevels['char_alex'].joy).toBeCloseTo(0.4);
      expect(snap?.sentiments['char_alex'].find((s) => s.emotion === 'trust')?.strength).toBeCloseTo(0.3);
    });

    it('delta-from-bookmark computes against the snapshotted value', () => {
      // Lift mood to 0.4, bookmark, then drop back.
      context.nudgeCharacterMood('char_alex', 0.4);
      context.takeAffectBookmark('peak-moment');
      context.nudgeCharacterMood('char_alex', -0.3);
      // Current: 0.1. Bookmark: 0.4. Delta = -0.3. So "≥ -0.2" should be false.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: -0.2, baseline: { bookmark: 'peak-moment' },
      } as any)).toBe(false);
      // And "≤ -0.25" should be true.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '<=', value: -0.25, baseline: { bookmark: 'peak-moment' },
      } as any)).toBe(true);
    });

    it('missing bookmark resolves baseline as 0', () => {
      context.nudgeCharacterMood('char_alex', 0.5);
      // No bookmark named 'never-taken' — baseline = 0, delta = 0.5.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.4, baseline: { bookmark: 'never-taken' },
      } as any)).toBe(true);
    });

    it('scope: character snapshots only the requested target', () => {
      const wolf = { id: 'char_wolf' };
      context = new StoryContext(undefined, makeStoryStub([alex, wolf]));
      context.nudgeCharacterMood('char_alex', 0.4);
      context.nudgeCharacterMood('char_wolf', -0.3);
      // First a wide bookmark so a prior wolf entry exists.
      context.takeAffectBookmark('start');
      // Then a narrow bookmark of just alex.
      context.nudgeCharacterMood('char_alex', 0.2);
      context.applyEffect({ type: 'bookmarkAffectState', target: 'char_alex',
        bookmarkName: 'alex-only', scope: 'character' } as any);
      const snap = context.getAffectBookmark('alex-only');
      expect(snap?.moods['char_alex']).toBeDefined();
      // Wolf should NOT be in this scope-narrow snapshot.
      expect(snap?.moods['char_wolf']).toBeUndefined();
    });

    it('bookmarkAffectState effect dispatches a scope-all snapshot by default', () => {
      context.nudgeCharacterMood('char_alex', 0.4);
      context.applyEffect({ type: 'bookmarkAffectState', target: '',
        bookmarkName: 'whole-story-state' } as any);
      expect(context.getAffectBookmarkNames()).toContain('whole-story-state');
    });
  });

  describe('serialize / load round-trip', () => {
    it('preserves initial maps and bookmarks across save/load', () => {
      context.nudgeCharacterMood('char_alex', 0.4);
      context.fireCharacterEmotion('char_alex', 'fear', 0.3);
      context.addCharacterSentiment('char_alex', 'player', 'trust', 0.2);
      context.takeAffectBookmark('checkpoint');
      const saved = context.serialize();

      // Round-trip into a fresh context.
      const fresh = new StoryContext(undefined, makeStoryStub([alex]));
      fresh.loadFromSerialized(saved);

      // Initial-baseline conditions still resolve correctly.
      expect(fresh.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.3, baseline: 'initial',
      } as any)).toBe(true);
      // Bookmark-baseline conditions still resolve.
      expect(fresh.getAffectBookmarkNames()).toContain('checkpoint');
    });

    it('older saves without baseline maps load with empty defaults', () => {
      const minimal: any = {
        currentBeatId: '0',
        variables: {},
        counters: {},
        inventory: [],
        characterInventories: {},
        visitedBeats: [],
        timers: {},
        history: [],
      };
      // Should not throw and should default to empty maps.
      expect(() => context.loadFromSerialized(minimal)).not.toThrow();
      expect(context.getAffectBookmarkNames()).toEqual([]);
    });
  });

  describe('literal baseline (default behaviour)', () => {
    it('omitted baseline behaves as literal threshold', () => {
      context.nudgeCharacterMood('char_alex', 0.5);
      // Literal: current ≥ 0.4 = true.
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.4,
      } as any)).toBe(true);
    });

    it('explicit "literal" baseline behaves the same as omitted', () => {
      context.nudgeCharacterMood('char_alex', 0.5);
      expect(context.checkCondition({
        type: 'mood', character: 'char_alex', moodAxis: 'valence',
        operator: '>=', value: 0.4, baseline: 'literal',
      } as any)).toBe(true);
    });
  });
});
