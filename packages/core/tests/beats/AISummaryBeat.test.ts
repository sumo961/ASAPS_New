/**
 * Tests for AISummaryBeat — the end-of-story AI reflection beat.
 *
 * Three main responsibilities:
 *   1. Generate a summary (AI when available, static fallback otherwise)
 *   2. Render it via renderAISummary or fall back to renderEndScreen
 *   3. Handle the restart button — with the configurable, granular
 *      state-reset matrix
 *
 * Coverage focus:
 *   - constructor defaults + parameter resolution
 *   - AI-available + generateContent → AI summary
 *   - AI-available + throws → static fallback (never crashes the player)
 *   - AI-unavailable → static fallback path
 *   - prefetched summary skips the generation call
 *   - renderAISummary preferred when available; renderEndScreen otherwise
 *   - records AI output in StoryContext for the timeline / session log
 *   - restart button + restartTarget routes to the target
 *   - restart button without restartTarget routes to the story's first beat
 *   - resetOnRestart false leaves state untouched
 *   - resetOnRestart true with all-true sub-flags calls context.reset()
 *   - resetOnRestart true with partial flags calls selectiveReset
 */
import { describe, it, expect, vi } from 'vitest';
import { AISummaryBeat } from '../../src/beats/AISummaryBeat';
import { makeRenderer, makeContext, makeAIService } from '../helpers/beatHarness';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

/**
 * Story.getFirstBeatId() only honors `metadata.firstBeatId` when a
 * beat with that id is actually present in the story. Tests that
 * verify the "no restartTarget → first beat" routing need a real
 * beat at the configured id, otherwise getFirstBeatId falls through
 * to its auto-detect → '0' default and the test asserts the wrong id.
 */
function storyWithFirstBeat(firstBeatId: string): Story {
  const story = new Story({ title: 'T', author: 'T', firstBeatId });
  story.addBeat(createTestBeat({
    id: firstBeatId,
    name: 'First',
    type: 'titleScreen',
    parameters: { title: 'x' },
  }));
  return story;
}

describe('AISummaryBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('defaults to a sensible end-of-story shape', () => {
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      expect(beat.title).toBe('Your Journey');
      expect(beat.summaryStyle).toBe('narrative');
      expect(beat.maxLength).toBe('medium');
      expect(beat.showRestart).toBe(true);
      expect(beat.showCredits).toBe(false);
      expect(beat.restartText).toBe('Play Again');
      expect(beat.creditsText).toBe('Credits');
    });

    it('defaults includeVariables/visitedBeats/choiceHistory true; inventory/counters false', () => {
      // The defaults reflect "summarize what happened" — variables
      // and beat path are the meat; raw inventory and counters are
      // off because they're rarely narratively interesting.
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      expect(beat.includeVariables).toBe(true);
      expect(beat.includeVisitedBeats).toBe(true);
      expect(beat.includeChoiceHistory).toBe(true);
      expect(beat.includeInventory).toBe(false);
      expect(beat.includeCounters).toBe(false);
    });

    it('defaults resetOnRestart true + all reset sub-flags true', () => {
      // "Play Again" means "start over fresh" by default. Authors
      // can opt into a persistent counter (resetCounters:false)
      // for runs across replays.
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      expect(beat.resetOnRestart).toBe(true);
      expect(beat.resetVariables).toBe(true);
      expect(beat.resetCounters).toBe(true);
      expect(beat.resetInventory).toBe(true);
      expect(beat.resetTimers).toBe(true);
      expect(beat.resetFictionalTime).toBe(true);
      expect(beat.resetVisitedTracking).toBe(true);
      expect(beat.resetHistory).toBe(true);
    });

    it('respects explicit showRestart=false (?? guard)', () => {
      // Same false-vs-undefined trap as the other beats.
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: { showRestart: false },
      } as any);
      expect(beat.showRestart).toBe(false);
    });

    it('reads all configurable fields from nested parameters', () => {
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: {
          prompt: 'Custom prompt',
          title: 'Final Reflection',
          summaryStyle: 'reflection',
          maxLength: 'long',
          restartText: 'Try Again',
          creditsText: 'Show Credits',
          restartTarget: 'specific-restart-beat',
          resetOnRestart: false,
          creditsPageBody: 'Crafted by X',
        },
      } as any);
      expect(beat.prompt).toBe('Custom prompt');
      expect(beat.title).toBe('Final Reflection');
      expect(beat.summaryStyle).toBe('reflection');
      expect(beat.maxLength).toBe('long');
      expect(beat.restartText).toBe('Try Again');
      expect(beat.creditsText).toBe('Show Credits');
      expect(beat.restartTarget).toBe('specific-restart-beat');
      expect(beat.resetOnRestart).toBe(false);
      expect(beat.creditsPageBody).toBe('Crafted by X');
    });
  });

  describe('AI generation path', () => {
    it('uses AI summary when generateContent succeeds', async () => {
      const ai = makeAIService({ generateContent: 'A heartfelt summary' });
      const { renderer, methods } = makeRenderer({
        renderAISummary: 'restart',
      }, { aiService: ai.service });
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(c => c.setVariable('x', '1'), story);

      await beat.execute(ctx, renderer);

      expect(ai.generateContent).toHaveBeenCalledOnce();
      // The summary was rendered.
      expect(methods.renderAISummary).toHaveBeenCalledOnce();
      const [payload] = methods.renderAISummary.mock.calls[0];
      expect(payload.summary).toBe('A heartfelt summary');
    });

    it('falls back to static summary when AI generateContent throws', async () => {
      // Critical safety: end-of-story is the WORST place to crash.
      // A failed AI call must still render a meaningful summary —
      // the static fallback walks the player's state and choices.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ai = makeAIService();
      ai.generateContent.mockRejectedValue(new Error('rate limit'));
      const { renderer, methods } = makeRenderer({
        renderAISummary: 'restart',
      }, { aiService: ai.service });
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(c => {
        c.setVariable('played', 'true');
      }, story);

      await beat.execute(ctx, renderer);

      // renderAISummary still got called with SOME summary text.
      expect(methods.renderAISummary).toHaveBeenCalledOnce();
      const [payload] = methods.renderAISummary.mock.calls[0];
      expect(payload.summary).toBeTruthy();
      expect(typeof payload.summary).toBe('string');
      errSpy.mockRestore();
    });
  });

  describe('AI unavailable path (static fallback)', () => {
    it('skips AI generation when no aiService is set', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer, methods } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(() => {}, story);

      await beat.execute(ctx, renderer);

      // renderAISummary still rendered SOMETHING (the static fallback).
      expect(methods.renderAISummary).toHaveBeenCalledOnce();
      const [payload] = methods.renderAISummary.mock.calls[0];
      expect(payload.summary).toBeTruthy();
      warn.mockRestore();
    });

    it('skips when aiService is partial (no generateContent)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { renderer } = makeRenderer({ renderAISummary: 'restart' }, {
        aiService: { classifyContent: vi.fn() }, // partial
      });
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(() => {}, story);

      const result = await beat.execute(ctx, renderer);
      // doesn't crash; renders static
      expect(result).toBeDefined();
      warn.mockRestore();
    });
  });

  describe('renderer selection', () => {
    it('prefers renderAISummary when available', async () => {
      const { renderer, methods } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({ id: 'b1' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(() => {}, story);

      await beat.execute(ctx, renderer);

      expect(methods.renderAISummary).toHaveBeenCalledOnce();
      expect(methods.renderEndScreen).not.toHaveBeenCalled();
    });

    it('falls back to renderEndScreen when renderAISummary is missing', async () => {
      const { renderer, methods } = makeRenderer({ renderEndScreen: 'restart' });
      // Force renderAISummary missing — simulates an older player.
      (renderer as any).renderAISummary = undefined;
      const beat = new AISummaryBeat({ id: 'b1', title: 'My title' } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first' });
      const ctx = makeContext(() => {}, story);

      await beat.execute(ctx, renderer);

      expect(methods.renderEndScreen).toHaveBeenCalledOnce();
      const [fullMessage] = methods.renderEndScreen.mock.calls[0];
      // Title + double-newline + summary text in one big string.
      expect(fullMessage).toContain('My title');
    });
  });

  describe('records AI output in StoryContext', () => {
    it('records the summary text via recordAIOutput', async () => {
      const ai = makeAIService({ generateContent: 'Once upon a time, you chose...' });
      const recordSpy = vi.fn();
      const { renderer } = makeRenderer({
        renderAISummary: 'restart',
      }, { aiService: ai.service });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: { resetOnRestart: false },
      } as any);
      const ctx = makeContext(() => {}, storyWithFirstBeat('first'));
      // Spy on recordAIOutput at the context level — we want to verify
      // the call happened with the correct shape regardless of the
      // exact timeline event type.
      (ctx as any).recordAIOutput = recordSpy;

      await beat.execute(ctx, renderer);

      expect(recordSpy).toHaveBeenCalled();
      const callArg = recordSpy.mock.calls[0][0];
      expect(callArg.beatType).toBe('aiSummary');
      expect(callArg.beatId).toBe('b1');
      expect(callArg.text).toBeTruthy();
    });
  });

  describe('restart routing', () => {
    it('routes to restartTarget when configured', async () => {
      const { renderer } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: {
          restartTarget: 'custom-restart-beat',
          resetOnRestart: false, // skip the reset machinery
        },
      } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'first-beat-id' });
      const ctx = makeContext(() => {}, story);

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('custom-restart-beat');
    });

    it('routes to the story\'s first beat when no restartTarget', async () => {
      // Default behavior — "Play Again" loops back to titleScreen.
      const { renderer } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: { resetOnRestart: false },
      } as any);
      const ctx = makeContext(() => {}, storyWithFirstBeat('beat-zero'));

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('beat-zero');
    });

    it('matches "restart" / "play" / "again" in the renderer result (case-insensitive)', async () => {
      // The render result is a button label fragment — the loop
      // matches case-insensitively against any of three strings so
      // localized buttons ("Play Again", "Restart Story", "Try
      // Again") all route correctly.
      const cases = ['Restart', 'PLAY AGAIN', 'Try Again'];
      for (const labelResult of cases) {
        const { renderer } = makeRenderer({ renderAISummary: labelResult });
        const beat = new AISummaryBeat({
          id: 'b1',
          parameters: { resetOnRestart: false },
        } as any);
        const ctx = makeContext(() => {}, storyWithFirstBeat('start'));

        const next = await beat.execute(ctx, renderer);
        expect(next).toBe('start');
      }
    });

    it('empty action with showRestart-only does NOT phantom-restart (regression)', async () => {
      // Same bug class as EndScreenBeat: the "any click → restart"
      // single-button shortcut at the bottom of the loop must NOT
      // fire on an empty action. An empty string means the renderer
      // resolved without a click; restarting would loop forever
      // through the same EndScreen.
      const { renderer, methods } = makeRenderer({ renderAISummary: '' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: {
          resetOnRestart: false,
          showRestart: true,  // single-button mode
          showCredits: false,
        },
      } as any);
      const ctx = makeContext(() => {}, storyWithFirstBeat('start'));

      const next = await beat.execute(ctx, renderer);

      // Empty action falls through to getNextBeat (not doRestart).
      // No connections + no defaultTarget → null.
      expect(next).toBeNull();
      // Sanity: the loop didn't iterate forever — renderer called once.
      expect(methods.renderAISummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset matrix on restart', () => {
    it('resetOnRestart:false leaves state intact', async () => {
      const { renderer } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: { resetOnRestart: false },
      } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
      const ctx = makeContext(c => {
        c.setVariable('persistent', 'value');
        c.addToInventory('keepsake');
      }, story);

      await beat.execute(ctx, renderer);

      // Variables and inventory should still be intact.
      expect(ctx.getVariable('persistent')).toBe('value');
      expect(ctx.getInventory()).toContain('keepsake');
    });

    it('resetOnRestart:true with all-true subflags performs a full reset', async () => {
      const { renderer } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: {
          resetOnRestart: true,
          resetVariables: true,
          resetCounters: true,
          resetInventory: true,
          resetTimers: true,
          resetFictionalTime: true,
          resetVisitedTracking: true,
          resetHistory: true,
        },
      } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
      const ctx = makeContext(c => {
        c.setVariable('temp', 'gone');
        c.addToInventory('lost');
      }, story);

      await beat.execute(ctx, renderer);

      // Full reset wipes variables + inventory.
      expect(ctx.getVariable('temp')).toBeUndefined();
      expect(ctx.getInventory()).not.toContain('lost');
    });

    it('resetOnRestart:true with selective subflags keeps the opted-out state', async () => {
      // The persistent-counter pattern: keep counters across replays
      // for a "highest score over all runs" arc, reset everything
      // else. This is the published author footgun from the
      // Blackwood story memory.
      const { renderer } = makeRenderer({ renderAISummary: 'restart' });
      const beat = new AISummaryBeat({
        id: 'b1',
        parameters: {
          resetOnRestart: true,
          resetVariables: true,
          resetCounters: false,   // KEEP counters across replays
          resetInventory: true,
          resetTimers: true,
          resetFictionalTime: true,
          resetVisitedTracking: true,
          resetHistory: true,
        },
      } as any);
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
      const ctx = makeContext(c => {
        c.setVariable('temp', 'wipes');
        c.setCounter('persistent', 5);
      }, story);

      await beat.execute(ctx, renderer);

      expect(ctx.getVariable('temp')).toBeUndefined();
      // Counter persisted across the "reset."
      expect(ctx.getCounter('persistent')).toBe(5);
    });
  });
});
