// @vitest-environment jsdom
/**
 * Tests for StoryEngine — the runtime orchestrator. Drives the
 * beat-execution loop: loads a story, walks beat→beat, surfaces
 * lifecycle events (storyLoaded / storyEnded / storyPaused /
 * storyResumed / stateLoaded), handles save/resume + timer
 * interrupt routing.
 *
 * The engine wires a Story + IRenderer + StoryContext together,
 * so tests use the beat harness's renderer mock + minimal story
 * fixtures. jsdom for window.setInterval (timer support).
 *
 * Coverage focus:
 *   - constructor mockMode flag plumbs to StoryContext
 *   - loadStory recreates context with new firstBeatId; preserves
 *     sensor service across the recreation
 *   - start() throws when no story loaded
 *   - start() walks beat → beat → ... → end via getNextBeat
 *   - currentBeatId tracked + context kept in sync
 *   - '__restart__' return value restarts from firstBeatId
 *   - missing beat id throws "Beat not found"
 *   - beat execution errors propagate + stop the engine
 *   - stop() / pause() / resume() lifecycle + isRunning/isPaused
 *   - getSerializedState round-trips through loadState
 *   - timer interrupt routes the engine to the configured target
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryEngine } from '../../src/engine/StoryEngine';
import { Story } from '../../src/engine/Story';
import { makeRenderer } from '../helpers/beatHarness';
import { createTestBeat } from '../test-utils';

/** Build a 3-beat linear story: a → b → end. */
function makeLinearStory(): Story {
  const story = new Story({ title: 'T', author: 'T', firstBeatId: 'a' });
  story.addBeat(createTestBeat({
    id: 'a', name: 'A', type: 'titleScreen',
    parameters: { title: 'A' },
    connections: [{ targetId: 'b' }],
  }));
  story.addBeat(createTestBeat({
    id: 'b', name: 'B', type: 'infoText',
    parameters: { text: 'B' },
    connections: [{ targetId: 'end' }],
  }));
  story.addBeat(createTestBeat({
    id: 'end', name: 'End', type: 'endScreen',
    // showRestart:false makes the EndScreen exit on any click. Default
    // is true, which routes ANY non-credits click back to first beat —
    // tests using a linear story would loop forever otherwise.
    parameters: { message: 'end', showRestart: false, showCredits: false },
  }));
  return story;
}

describe('StoryEngine', () => {
  let renderer: ReturnType<typeof makeRenderer>['renderer'];
  let mocks: ReturnType<typeof makeRenderer>['methods'];
  let engine: StoryEngine;

  beforeEach(() => {
    const r = makeRenderer({ renderEndScreen: 'done' });
    renderer = r.renderer;
    mocks = r.methods;
    engine = new StoryEngine(renderer);
  });

  describe('constructor', () => {
    it('starts non-running, non-paused', () => {
      expect(engine.isRunning()).toBe(false);
      expect(engine.isPaused()).toBe(false);
    });

    it('exposes the StoryContext via getContext()', () => {
      expect(engine.getContext()).toBeDefined();
    });

    it('mockMode flag plumbs through to the context\'s sensor service', () => {
      // Mock mode swaps the sensor service for the desktop-
      // authoring "fake the GPS / orientation" implementation.
      const realEngine = new StoryEngine(renderer);
      const mockEngine = new StoryEngine(renderer, { mockMode: true });
      // Just verify they're different instances — the mock path
      // wraps a different concrete service. We can't directly
      // assert the type without exporting it.
      expect(realEngine.getContext().getSensorService())
        .not.toBe(mockEngine.getContext().getSensorService());
    });
  });

  describe('loadStory', () => {
    it('emits storyLoaded with the story', async () => {
      const onLoaded = vi.fn();
      engine.on('storyLoaded', onLoaded);
      const story = makeLinearStory();
      await engine.loadStory(story);
      expect(onLoaded).toHaveBeenCalledWith(story);
    });

    it('makes getStory return the loaded story', async () => {
      const story = makeLinearStory();
      await engine.loadStory(story);
      expect(engine.getStory()).toBe(story);
    });

    it('preserves sensor service across context recreation', async () => {
      // Critical regression target: without preservation, the
      // renderer and audio adapter would end up subscribed to a
      // discarded MockSensorService while the panel writes to the
      // new one (silent state divergence).
      const beforeSensor = engine.getContext().getSensorService();
      await engine.loadStory(makeLinearStory());
      const afterSensor = engine.getContext().getSensorService();
      expect(afterSensor).toBe(beforeSensor);
    });
  });

  describe('start', () => {
    it('throws when no story is loaded', async () => {
      await expect(engine.start()).rejects.toThrow(/no story loaded/i);
    });

    it('walks the linear story from a → b → end', async () => {
      await engine.loadStory(makeLinearStory());
      await engine.start();
      // Renderer was invoked for each beat.
      expect(mocks.renderTitleScreen).toHaveBeenCalled();
      expect(mocks.renderText).toHaveBeenCalled();
      expect(mocks.renderEndScreen).toHaveBeenCalled();
    });

    it('emits storyEnded after the loop terminates', async () => {
      const onEnded = vi.fn();
      engine.on('storyEnded', onEnded);
      await engine.loadStory(makeLinearStory());
      await engine.start();
      expect(onEnded).toHaveBeenCalledOnce();
    });

    it('starts from explicit startBeatId when provided', async () => {
      // Jump straight to 'b' — the title screen never renders.
      await engine.loadStory(makeLinearStory());
      await engine.start('b');
      expect(mocks.renderTitleScreen).not.toHaveBeenCalled();
      expect(mocks.renderText).toHaveBeenCalled();
    });

    it('throws when the currentBeatId points at a missing beat', async () => {
      const story = makeLinearStory();
      await engine.loadStory(story);
      await expect(engine.start('does-not-exist'))
        .rejects.toThrow(/beat not found.*does-not-exist/i);
    });

    it('isRunning stays true after a natural end until stop() is called', async () => {
      // Surprising-but-actual behavior: the engine doesn't auto-
      // clear `running` when currentBeatId becomes null — only
      // explicit stop()/pause() flips it. Documents the actual
      // contract so a future "auto-stop on natural end" change is
      // a deliberate edit.
      await engine.loadStory(makeLinearStory());
      await engine.start();
      expect(engine.isRunning()).toBe(true);
      engine.stop();
      expect(engine.isRunning()).toBe(false);
    });
  });

  describe('error propagation', () => {
    it('beat execution errors stop the engine and re-throw', async () => {
      // A renderer that throws causes the beat to throw. Engine
      // must clear `running` and surface the error so the host
      // app can show a meaningful message.
      const story = makeLinearStory();
      mocks.renderTitleScreen.mockRejectedValue(new Error('boom'));
      await engine.loadStory(story);
      await expect(engine.start()).rejects.toThrow('boom');
      expect(engine.isRunning()).toBe(false);
    });
  });

  describe('__restart__ signal', () => {
    it('jumps to first beat when a beat returns "__restart__"', async () => {
      // Backward-compatibility sentinel for legacy beats that
      // signal restart via the return value instead of routing.
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });

      // 'start' beat counts how often it's entered; 'middle' returns
      // __restart__ once then advances; this verifies restart.
      let startCount = 0;
      let middleEntries = 0;
      story.addBeat(createTestBeat({
        id: 'start', name: 'Start', type: 'titleScreen',
        parameters: { title: 'x' },
        connections: [{ targetId: 'middle' }],
      }));
      story.addBeat(createTestBeat({
        id: 'middle', name: 'Mid', type: 'infoText',
        parameters: { text: 'mid' },
        connections: [{ targetId: 'end' }],
      }));
      story.addBeat(createTestBeat({
        id: 'end', name: 'End', type: 'endScreen',
        parameters: { message: 'end', showRestart: false, showCredits: false },
      }));

      // Patch start to count entries; middle to emit __restart__
      // the FIRST time, then advance normally the second time.
      const startBeat = story.getBeat('start')!;
      const origStart = startBeat.execute.bind(startBeat);
      startBeat.execute = async (...args: any) => {
        startCount++;
        return origStart(...args);
      };
      const midBeat = story.getBeat('middle')!;
      midBeat.execute = vi.fn().mockImplementation(async () => {
        middleEntries++;
        return middleEntries === 1 ? '__restart__' : 'end';
      });

      await engine.loadStory(story);
      await engine.start();

      // Start was entered TWICE: once initially, once after restart.
      expect(startCount).toBe(2);
      // Middle was entered twice too (the restart cycle and the
      // post-restart pass that actually went to 'end').
      expect(middleEntries).toBe(2);
    });
  });

  describe('stop', () => {
    it('emits storyStopped', () => {
      const onStopped = vi.fn();
      engine.on('storyStopped', onStopped);
      engine.stop();
      expect(onStopped).toHaveBeenCalledOnce();
    });

    it('clears running + paused flags', () => {
      // Even when called pre-load, flags settle to false.
      engine.stop();
      expect(engine.isRunning()).toBe(false);
      expect(engine.isPaused()).toBe(false);
    });
  });

  describe('pause / resume', () => {
    it('pause is a no-op when not running', () => {
      const onPaused = vi.fn();
      engine.on('storyPaused', onPaused);
      engine.pause();
      expect(onPaused).not.toHaveBeenCalled();
      expect(engine.isPaused()).toBe(false);
    });

    it('resume is a no-op when not paused', async () => {
      const onResumed = vi.fn();
      engine.on('storyResumed', onResumed);
      await engine.resume();
      expect(onResumed).not.toHaveBeenCalled();
    });
  });

  describe('save / load round-trip', () => {
    it('getSerializedState + loadState restores the currentBeatId', async () => {
      // Critical save/resume contract. After saving, loading the
      // state should restore the engine's notion of "where we
      // are" so future start(autoResume:false) picks up correctly.
      const story = makeLinearStory();
      await engine.loadStory(story);
      // Force currentBeatId to 'b' by serializing context, then
      // mutating, then loading.
      engine.getContext().setCurrentBeatId('b');
      const saved = engine.getSerializedState();
      saved.currentBeatId = 'b';

      // Make a fresh engine and load.
      const fresh = new StoryEngine(makeRenderer().renderer);
      await fresh.loadStory(story);
      await fresh.loadState(saved, false);
      expect(fresh.getCurrentBeatId()).toBe('b');
    });

    it('loadState throws when no story is loaded', async () => {
      const fresh = new StoryEngine(renderer);
      const fake = engine.getSerializedState();
      await expect(fresh.loadState(fake, false))
        .rejects.toThrow(/no story loaded/i);
    });

    it('emits stateLoaded with the serialized + beatId', async () => {
      const onLoaded = vi.fn();
      engine.on('stateLoaded', onLoaded);
      const story = makeLinearStory();
      await engine.loadStory(story);
      const saved = engine.getSerializedState();
      saved.currentBeatId = 'b';
      await engine.loadState(saved, false);
      expect(onLoaded).toHaveBeenCalledWith({
        serialized: saved,
        beatId: 'b',
      });
    });
  });

  describe('timer interrupt', () => {
    it('routes to the timer\'s target beat on next loop iteration', async () => {
      // The timer-expired event sets timerInterruptBeat; the next
      // loop iteration picks it up + redirects.
      const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
      story.addBeat(createTestBeat({
        id: 'start', name: 'Start', type: 'titleScreen',
        parameters: { title: 'x' },
        connections: [{ targetId: 'normal-next' }],
      }));
      story.addBeat(createTestBeat({
        id: 'normal-next', name: 'Normal', type: 'infoText',
        parameters: { text: 'normal' },
        connections: [{ targetId: 'end' }],
      }));
      story.addBeat(createTestBeat({
        id: 'timeout-target', name: 'Boom', type: 'infoText',
        parameters: { text: 'time' },
        connections: [{ targetId: 'end' }],
      }));
      story.addBeat(createTestBeat({
        id: 'end', name: 'End', type: 'endScreen',
        parameters: { message: 'end', showRestart: false, showCredits: false },
      }));

      await engine.loadStory(story);

      // Fire the timer event synchronously before the first beat
      // resolves to install the interrupt.
      const startBeat = story.getBeat('start')!;
      const origStart = startBeat.execute.bind(startBeat);
      startBeat.execute = async (ctx, rdr) => {
        // Set running = true is the engine's job; we just need to
        // simulate a timer firing while we're executing.
        engine.getContext().emit('timerExpired', {
          name: 'test-timer',
          targetBeat: 'timeout-target',
        });
        return origStart(ctx, rdr);
      };

      await engine.start();

      // The timeout-target beat was visited; the normal-next one
      // was skipped because the timer interrupt won.
      const visited = engine.getContext().getVisitedBeats();
      expect(visited).toContain('timeout-target');
      expect(visited).not.toContain('normal-next');
    });
  });
});
