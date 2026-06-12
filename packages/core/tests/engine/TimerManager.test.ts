// @vitest-environment jsdom
/**
 * Tests for TimerManager — countdown timers fired during story
 * playback (used by SetTimer beats and the optional HUD overlay).
 *
 * Each timer counts down 1 unit per second via window.setInterval,
 * emitting 'timerTick' every step, 'timerExpired' on hit-zero, and
 * 'timerStopped' on manual stop. The jsdom environment supplies
 * window.* primitives; we drive time with vi.useFakeTimers().
 *
 * Coverage focus:
 *   - startTimer initial state + 'timerStarted' event
 *   - tick decrements + 'timerTick' events
 *   - expiry emits 'timerExpired' AND stops the timer (one-shot)
 *   - stopTimer clears the interval + emits 'timerStopped'
 *   - same-name restart cancels the previous one
 *   - stopAllTimers wipes everything
 *   - accessor methods (getRemainingTime, hasTimer, getActiveTimers,
 *     getTimerTarget)
 *   - safety: stopping a non-existent timer is a no-op (no events,
 *     no crash)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerManager } from '../../src/engine/TimerManager';

describe('TimerManager', () => {
  let mgr: TimerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new TimerManager();
  });

  afterEach(() => {
    mgr.stopAllTimers();
    vi.useRealTimers();
  });

  describe('startTimer', () => {
    it('emits "timerStarted" with name + duration', () => {
      const onStarted = vi.fn();
      mgr.on('timerStarted', onStarted);
      mgr.startTimer('boss-fight', 30, 'beat-after');
      expect(onStarted).toHaveBeenCalledWith({
        name: 'boss-fight',
        duration: 30,
        targetBeat: 'beat-after',
      });
    });

    it('makes hasTimer return true', () => {
      mgr.startTimer('t', 10);
      expect(mgr.hasTimer('t')).toBe(true);
    });

    it('records initial remaining time as the full duration', () => {
      mgr.startTimer('t', 30);
      expect(mgr.getRemainingTime('t')).toBe(30);
    });

    it('records the target beat', () => {
      mgr.startTimer('t', 10, 'next-beat');
      expect(mgr.getTimerTarget('t')).toBe('next-beat');
    });

    it('appears in getActiveTimers', () => {
      mgr.startTimer('a', 10);
      mgr.startTimer('b', 20, 'beat-x');
      const active = mgr.getActiveTimers();
      expect(active).toHaveLength(2);
      expect(active.map(t => t.name).sort()).toEqual(['a', 'b']);
    });

    it('starting a timer with the same name cancels the previous one', () => {
      // Same-name restart is a common pattern when an author
      // re-enters a Timer beat. Old timer must not keep ticking
      // alongside the new one.
      const onStopped = vi.fn();
      mgr.on('timerStopped', onStopped);
      mgr.startTimer('t', 10);
      mgr.startTimer('t', 5); // same name
      // Old timer was stopped before being replaced.
      expect(onStopped).toHaveBeenCalledWith({ name: 't' });
      expect(mgr.getRemainingTime('t')).toBe(5);
    });
  });

  describe('tick + expiry', () => {
    it('emits "timerTick" each second with the new remaining time', () => {
      const onTick = vi.fn();
      mgr.on('timerTick', onTick);
      mgr.startTimer('t', 3);

      vi.advanceTimersByTime(1000);
      expect(onTick).toHaveBeenCalledWith({ name: 't', remainingTime: 2 });
      vi.advanceTimersByTime(1000);
      expect(onTick).toHaveBeenCalledWith({ name: 't', remainingTime: 1 });
    });

    it('decrements getRemainingTime on each tick', () => {
      mgr.startTimer('t', 5);
      vi.advanceTimersByTime(1000);
      expect(mgr.getRemainingTime('t')).toBe(4);
      vi.advanceTimersByTime(2000);
      expect(mgr.getRemainingTime('t')).toBe(2);
    });

    it('emits "timerExpired" when the timer reaches zero', () => {
      const onExpired = vi.fn();
      mgr.on('timerExpired', onExpired);
      mgr.startTimer('boss', 2, 'death-screen');
      vi.advanceTimersByTime(2000);
      expect(onExpired).toHaveBeenCalledWith({
        name: 'boss',
        targetBeat: 'death-screen',
      });
    });

    it('stops the timer once it expires (one-shot)', () => {
      const onTick = vi.fn();
      mgr.on('timerTick', onTick);
      mgr.startTimer('t', 2);
      vi.advanceTimersByTime(5000);
      // Total ticks: 2 (one for each second). Expired at 0.
      // No further ticks because the interval was cleared.
      expect(onTick).toHaveBeenCalledTimes(2);
      expect(mgr.hasTimer('t')).toBe(false);
    });

    it('does NOT emit "timerExpired" before reaching zero', () => {
      const onExpired = vi.fn();
      mgr.on('timerExpired', onExpired);
      mgr.startTimer('t', 5);
      vi.advanceTimersByTime(3000);
      expect(onExpired).not.toHaveBeenCalled();
    });

    it('passes the targetBeat through to the timerExpired event when omitted at start', () => {
      const onExpired = vi.fn();
      mgr.on('timerExpired', onExpired);
      mgr.startTimer('t', 1); // no targetBeat
      vi.advanceTimersByTime(1000);
      expect(onExpired).toHaveBeenCalledWith({
        name: 't',
        targetBeat: undefined,
      });
    });
  });

  describe('stopTimer', () => {
    it('emits "timerStopped" when stopping an active timer', () => {
      const onStopped = vi.fn();
      mgr.on('timerStopped', onStopped);
      mgr.startTimer('t', 10);
      mgr.stopTimer('t');
      expect(onStopped).toHaveBeenCalledWith({ name: 't' });
    });

    it('makes hasTimer return false after stop', () => {
      mgr.startTimer('t', 10);
      mgr.stopTimer('t');
      expect(mgr.hasTimer('t')).toBe(false);
    });

    it('halts the countdown (no further ticks)', () => {
      const onTick = vi.fn();
      mgr.on('timerTick', onTick);
      mgr.startTimer('t', 10);
      vi.advanceTimersByTime(1000); // 1 tick
      mgr.stopTimer('t');
      vi.advanceTimersByTime(5000); // no ticks expected
      expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('stopping a non-existent timer is a no-op (no events, no crash)', () => {
      const onStopped = vi.fn();
      mgr.on('timerStopped', onStopped);
      expect(() => mgr.stopTimer('never-existed')).not.toThrow();
      expect(onStopped).not.toHaveBeenCalled();
    });
  });

  describe('stopAllTimers', () => {
    it('stops every active timer and emits stopped events for each', () => {
      const onStopped = vi.fn();
      mgr.on('timerStopped', onStopped);
      mgr.startTimer('a', 10);
      mgr.startTimer('b', 20);
      mgr.startTimer('c', 30);
      mgr.stopAllTimers();
      expect(onStopped).toHaveBeenCalledTimes(3);
      expect(mgr.getActiveTimers()).toHaveLength(0);
    });

    it('is a no-op when no timers are running', () => {
      expect(() => mgr.stopAllTimers()).not.toThrow();
    });
  });

  describe('accessors', () => {
    it('getRemainingTime returns 0 for unknown timer', () => {
      // Defensive — querying a never-started or already-expired
      // timer falls back to 0 instead of undefined or throwing.
      expect(mgr.getRemainingTime('nope')).toBe(0);
    });

    it('hasTimer is false for unknown timer', () => {
      expect(mgr.hasTimer('nope')).toBe(false);
    });

    it('getActiveTimers returns empty array when no timers', () => {
      expect(mgr.getActiveTimers()).toEqual([]);
    });

    it('getTimerTarget returns undefined for unknown timer', () => {
      expect(mgr.getTimerTarget('nope')).toBeUndefined();
    });
  });

  describe('isolation across timers', () => {
    it('stopping one timer doesn\'t affect the other', () => {
      mgr.startTimer('a', 10);
      mgr.startTimer('b', 20);
      mgr.stopTimer('a');
      expect(mgr.hasTimer('a')).toBe(false);
      expect(mgr.hasTimer('b')).toBe(true);
      expect(mgr.getRemainingTime('b')).toBe(20);
    });

    it('one timer\'s expiry doesn\'t affect another', () => {
      const onExpired = vi.fn();
      mgr.on('timerExpired', onExpired);
      mgr.startTimer('short', 2);
      mgr.startTimer('long', 100);
      vi.advanceTimersByTime(2000);
      expect(onExpired).toHaveBeenCalledWith({ name: 'short', targetBeat: undefined });
      expect(mgr.hasTimer('long')).toBe(true);
      expect(mgr.getRemainingTime('long')).toBe(98);
    });
  });
});
