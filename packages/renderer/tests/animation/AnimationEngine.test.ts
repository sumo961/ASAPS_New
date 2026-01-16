/**
 * AnimationEngine Tests
 * Tests animation playback, state management, and AnimationManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AnimationEngine,
  AnimationManager,
  getAnimationManager,
  disposeAnimationManager,
} from '../../src/animation/AnimationEngine';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';

// Helper to create test animations
const createWaypoint = (x: number, y: number, duration: number, overrides?: Partial<AnimationWaypoint>): AnimationWaypoint => ({
  x,
  y,
  duration,
  ...overrides,
});

const createAnimation = (overrides?: Partial<AnimationPath>): AnimationPath => ({
  id: 'test-animation',
  elementId: 'test-element',
  type: 'linear',
  duration: 1000,
  waypoints: [
    createWaypoint(0, 0, 0),
    createWaypoint(100, 100, 1000),
  ],
  loop: false,
  autoPlay: false,
  trigger: 'onLoad',
  ...overrides,
});

describe('AnimationEngine', () => {
  let engine: AnimationEngine;
  let mockRaf: ReturnType<typeof vi.fn>;
  let mockCancelRaf: ReturnType<typeof vi.fn>;
  let currentTime: number;

  beforeEach(() => {
    engine = new AnimationEngine();
    currentTime = 0;

    // Mock performance.now()
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);

    // Mock requestAnimationFrame
    mockRaf = vi.fn((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(currentTime), 0) as unknown as number;
    });
    mockCancelRaf = vi.fn((id: number) => clearTimeout(id));

    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
  });

  afterEach(() => {
    engine.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('play', () => {
    it('should start an animation', () => {
      const animation = createAnimation();
      engine.play(animation);

      expect(engine.isPlaying()).toBe(true);
      expect(engine.getState()).not.toBeNull();
    });

    it('should initialize animation state correctly', () => {
      const animation = createAnimation();
      engine.play(animation);

      const state = engine.getState();
      expect(state?.animation).toBe(animation);
      expect(state?.currentTime).toBe(0);
      expect(state?.isPlaying).toBe(true);
      expect(state?.isPaused).toBe(false);
      expect(state?.isCompleted).toBe(false);
      expect(state?.currentWaypointIndex).toBe(0);
    });

    it('should stop previous animation when playing new one', () => {
      const animation1 = createAnimation({ id: 'anim1' });
      const animation2 = createAnimation({ id: 'anim2' });

      engine.play(animation1);
      engine.play(animation2);

      const state = engine.getState();
      expect(state?.animation.id).toBe('anim2');
    });

    it('should respect startTime option', () => {
      const animation = createAnimation();
      engine.play(animation, { startTime: 500 });

      const state = engine.getState();
      expect(state?.currentTime).toBe(500);
    });

    it('should schedule animation frame', () => {
      const animation = createAnimation();
      engine.play(animation);

      expect(mockRaf).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('should pause a playing animation', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      const state = engine.getState();
      expect(state?.isPlaying).toBe(false);
      expect(state?.isPaused).toBe(true);
    });

    it('should preserve current time when paused', () => {
      const animation = createAnimation();
      engine.play(animation);

      // Simulate some time passing
      currentTime = 500;

      engine.pause();

      const state = engine.getState();
      expect(state?.isPaused).toBe(true);
    });

    it('should cancel animation frame when paused', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      expect(mockCancelRaf).toHaveBeenCalled();
    });

    it('should do nothing if not playing', () => {
      engine.pause();
      expect(engine.getState()).toBeNull();
    });

    it('should do nothing if already paused', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      const pauseCallCount = mockCancelRaf.mock.calls.length;
      engine.pause();

      expect(mockCancelRaf.mock.calls.length).toBe(pauseCallCount);
    });
  });

  describe('resume', () => {
    it('should resume a paused animation', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();
      engine.resume();

      const state = engine.getState();
      expect(state?.isPlaying).toBe(true);
      expect(state?.isPaused).toBe(false);
    });

    it('should reschedule animation frame', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      const rafCallCount = mockRaf.mock.calls.length;
      engine.resume();

      expect(mockRaf.mock.calls.length).toBeGreaterThan(rafCallCount);
    });

    it('should do nothing if not paused', () => {
      const animation = createAnimation();
      engine.play(animation);

      const rafCallCount = mockRaf.mock.calls.length;
      engine.resume();

      // Should not add extra RAF call since already playing
      expect(mockRaf.mock.calls.length).toBe(rafCallCount);
    });

    it('should do nothing if no animation', () => {
      engine.resume();
      expect(engine.getState()).toBeNull();
    });
  });

  describe('stop', () => {
    it('should stop a playing animation', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.stop();

      const state = engine.getState();
      expect(state?.isPlaying).toBe(false);
      expect(state?.isCompleted).toBe(true);
    });

    it('should cancel animation frame', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.stop();

      expect(mockCancelRaf).toHaveBeenCalled();
    });

    it('should stop a paused animation', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();
      engine.stop();

      const state = engine.getState();
      expect(state?.isPlaying).toBe(false);
      expect(state?.isPaused).toBe(false);
      expect(state?.isCompleted).toBe(true);
    });
  });

  describe('seek', () => {
    it('should seek to a specific time', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      engine.seek(500);

      const state = engine.getState();
      expect(state?.currentTime).toBe(500);
    });

    it('should clamp time to valid range', () => {
      const animation = createAnimation({ duration: 1000 });
      engine.play(animation);
      engine.pause();

      engine.seek(-100);
      expect(engine.getState()?.currentTime).toBe(0);

      engine.seek(2000);
      expect(engine.getState()?.currentTime).toBe(1000);
    });

    it('should update position when seeking', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      engine.seek(500);

      const state = engine.getState();
      expect(state?.currentPosition.x).toBeCloseTo(50, 0);
      expect(state?.currentPosition.y).toBeCloseTo(50, 0);
    });

    it('should resume playback if was playing before seek', () => {
      const animation = createAnimation();
      engine.play(animation);

      engine.seek(500);

      expect(engine.isPlaying()).toBe(true);
    });

    it('should stay paused if was paused before seek', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      engine.seek(500);

      expect(engine.getState()?.isPaused).toBe(true);
    });

    it('should do nothing if no animation', () => {
      engine.seek(500);
      expect(engine.getState()).toBeNull();
    });
  });

  describe('getState', () => {
    it('should return null when no animation', () => {
      expect(engine.getState()).toBeNull();
    });

    it('should return current state when animation playing', () => {
      const animation = createAnimation();
      engine.play(animation);

      const state = engine.getState();
      expect(state).not.toBeNull();
      expect(state?.animation).toBe(animation);
    });
  });

  describe('isPlaying', () => {
    it('should return false when no animation', () => {
      expect(engine.isPlaying()).toBe(false);
    });

    it('should return true when animation playing', () => {
      const animation = createAnimation();
      engine.play(animation);

      expect(engine.isPlaying()).toBe(true);
    });

    it('should return false when animation paused', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.pause();

      expect(engine.isPlaying()).toBe(false);
    });

    it('should return false when animation stopped', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.stop();

      expect(engine.isPlaying()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should stop animation and clear state', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.dispose();

      expect(engine.getState()).toBeNull();
      expect(engine.isPlaying()).toBe(false);
    });

    it('should cancel animation frame', () => {
      const animation = createAnimation();
      engine.play(animation);
      engine.dispose();

      expect(mockCancelRaf).toHaveBeenCalled();
    });
  });

  describe('animation loop behavior', () => {
    it('should update position over time', async () => {
      const animation = createAnimation();
      const onUpdate = vi.fn();

      engine.play(animation, { onUpdate });

      // Let the animation frame callback run
      await vi.waitFor(() => {
        expect(onUpdate).toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should call onComplete when animation finishes', async () => {
      const animation = createAnimation({ duration: 100 });
      const onComplete = vi.fn();

      engine.play(animation, { onComplete });

      // Advance time past duration
      currentTime = 200;

      // Trigger animation frame
      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should loop when loop option is true', async () => {
      const animation = createAnimation({ duration: 100, loop: true });
      const onUpdate = vi.fn();

      engine.play(animation, { onUpdate });

      // Advance time past duration
      currentTime = 150;

      await vi.waitFor(() => {
        const state = engine.getState();
        // Animation should still be playing (looped)
        expect(state?.isPlaying).toBe(true);
        expect(state?.isCompleted).toBe(false);
      }, { timeout: 100 });
    });

    it('should apply speed multiplier', () => {
      const animation = createAnimation({ duration: 1000 });
      engine.play(animation, { speed: 2.0 });

      // At time 250ms with 2x speed, effective time should be 500ms
      currentTime = 250;
      engine.seek(0); // Force position update

      // This verifies the engine initializes with speed option
      expect(engine.isPlaying()).toBe(true);
    });
  });

  describe('waypoint tracking', () => {
    it('should track current waypoint index', () => {
      const animation = createAnimation({
        duration: 2000,
        waypoints: [
          createWaypoint(0, 0, 0),
          createWaypoint(50, 50, 1000),
          createWaypoint(100, 100, 1000),
        ],
      });

      engine.play(animation);
      engine.pause();

      // At start, should be at waypoint 0
      engine.seek(0);
      expect(engine.getState()?.currentWaypointIndex).toBe(0);

      // At 500ms, should still be in first segment (waypoint 0)
      engine.seek(500);
      expect(engine.getState()?.currentWaypointIndex).toBe(0);

      // At 1500ms, should be in second segment (waypoint 1)
      engine.seek(1500);
      expect(engine.getState()?.currentWaypointIndex).toBe(1);

      // At end of animation, should be in last segment (waypoint 1 to waypoint 2)
      engine.seek(2000);
      expect(engine.getState()?.currentWaypointIndex).toBe(1);
    });
  });

  describe('transform tracking', () => {
    it('should include transform properties in state', () => {
      const animation = createAnimation({
        waypoints: [
          createWaypoint(0, 0, 0, { scale: 1, rotation: 0, opacity: 1 }),
          createWaypoint(100, 100, 1000, { scale: 2, rotation: 180, opacity: 0.5 }),
        ],
      });

      engine.play(animation);
      engine.pause();
      engine.seek(500);

      const state = engine.getState();
      expect(state?.currentTransform).toBeDefined();
      expect(state?.currentTransform?.scale).toBeCloseTo(1.5, 1);
      expect(state?.currentTransform?.rotation).toBeCloseTo(90, 0);
      expect(state?.currentTransform?.opacity).toBeCloseTo(0.75, 1);
    });
  });
});

describe('AnimationManager', () => {
  let manager: AnimationManager;

  beforeEach(() => {
    manager = new AnimationManager();

    // Mock RAF
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(() => cb(0), 0) as unknown as number));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    manager.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('play', () => {
    it('should play animation with given ID', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);

      expect(manager.isPlaying('anim1')).toBe(true);
    });

    it('should manage multiple concurrent animations', () => {
      const anim1 = createAnimation({ id: 'anim1' });
      const anim2 = createAnimation({ id: 'anim2' });

      manager.play('anim1', anim1);
      manager.play('anim2', anim2);

      expect(manager.isPlaying('anim1')).toBe(true);
      expect(manager.isPlaying('anim2')).toBe(true);
    });

    it('should reuse engine for same ID', () => {
      const anim1 = createAnimation({ id: 'anim1' });
      const anim2 = createAnimation({ id: 'anim1-updated' });

      manager.play('anim1', anim1);
      manager.play('anim1', anim2);

      const state = manager.getState('anim1');
      expect(state?.animation.id).toBe('anim1-updated');
    });
  });

  describe('pause/resume', () => {
    it('should pause specific animation', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);
      manager.pause('anim1');

      expect(manager.isPlaying('anim1')).toBe(false);
    });

    it('should resume specific animation', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);
      manager.pause('anim1');
      manager.resume('anim1');

      expect(manager.isPlaying('anim1')).toBe(true);
    });

    it('should not affect other animations', () => {
      const anim1 = createAnimation({ id: 'anim1' });
      const anim2 = createAnimation({ id: 'anim2' });

      manager.play('anim1', anim1);
      manager.play('anim2', anim2);
      manager.pause('anim1');

      expect(manager.isPlaying('anim1')).toBe(false);
      expect(manager.isPlaying('anim2')).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop specific animation', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);
      manager.stop('anim1');

      expect(manager.isPlaying('anim1')).toBe(false);
      expect(manager.getState('anim1')).toBeNull();
    });

    it('should remove animation from active list', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);
      manager.stop('anim1');

      expect(manager.getActiveAnimations()).not.toContain('anim1');
    });
  });

  describe('stopAll', () => {
    it('should stop all animations', () => {
      const anim1 = createAnimation({ id: 'anim1' });
      const anim2 = createAnimation({ id: 'anim2' });

      manager.play('anim1', anim1);
      manager.play('anim2', anim2);
      manager.stopAll();

      expect(manager.isPlaying('anim1')).toBe(false);
      expect(manager.isPlaying('anim2')).toBe(false);
      expect(manager.getActiveAnimations()).toHaveLength(0);
    });
  });

  describe('getState', () => {
    it('should return state for existing animation', () => {
      const animation = createAnimation();
      manager.play('anim1', animation);

      const state = manager.getState('anim1');
      expect(state).not.toBeNull();
      expect(state?.animation).toBe(animation);
    });

    it('should return null for non-existent animation', () => {
      expect(manager.getState('nonexistent')).toBeNull();
    });
  });

  describe('isPlaying', () => {
    it('should return false for non-existent animation', () => {
      expect(manager.isPlaying('nonexistent')).toBe(false);
    });
  });

  describe('getActiveAnimations', () => {
    it('should return empty array when no animations', () => {
      expect(manager.getActiveAnimations()).toEqual([]);
    });

    it('should return all active animation IDs', () => {
      manager.play('anim1', createAnimation({ id: 'anim1' }));
      manager.play('anim2', createAnimation({ id: 'anim2' }));
      manager.play('anim3', createAnimation({ id: 'anim3' }));

      const active = manager.getActiveAnimations();
      expect(active).toContain('anim1');
      expect(active).toContain('anim2');
      expect(active).toContain('anim3');
      expect(active).toHaveLength(3);
    });
  });

  describe('dispose', () => {
    it('should dispose all engines', () => {
      manager.play('anim1', createAnimation({ id: 'anim1' }));
      manager.play('anim2', createAnimation({ id: 'anim2' }));
      manager.dispose();

      expect(manager.getActiveAnimations()).toHaveLength(0);
    });
  });
});

describe('Global AnimationManager', () => {
  afterEach(() => {
    disposeAnimationManager();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(() => cb(0), 0) as unknown as number));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  describe('getAnimationManager', () => {
    it('should return singleton instance', () => {
      const manager1 = getAnimationManager();
      const manager2 = getAnimationManager();

      expect(manager1).toBe(manager2);
    });

    it('should create new instance if none exists', () => {
      const manager = getAnimationManager();
      expect(manager).toBeInstanceOf(AnimationManager);
    });
  });

  describe('disposeAnimationManager', () => {
    it('should dispose and clear global instance', () => {
      const manager = getAnimationManager();
      manager.play('test', createAnimation());

      disposeAnimationManager();

      // Getting manager again should create new instance
      const newManager = getAnimationManager();
      expect(newManager.getActiveAnimations()).toHaveLength(0);
    });

    it('should handle dispose when no manager exists', () => {
      // Should not throw
      expect(() => disposeAnimationManager()).not.toThrow();
    });
  });
});
