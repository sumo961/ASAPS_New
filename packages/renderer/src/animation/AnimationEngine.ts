/**
 * AnimationEngine - Manages playback of animation paths
 *
 * Features:
 * - RequestAnimationFrame-based playback
 * - Play, pause, stop, seek controls
 * - Support for looping and speed control
 * - Frame-by-frame position callbacks
 * - Completion callbacks
 */

import type { AnimationPath, AnimationState, AnimationPlayOptions } from '@asaps/core';
import { calculatePositionAtTime } from './PathInterpolator';

export class AnimationEngine {
  private animationState: AnimationState | null = null;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private options: AnimationPlayOptions = {};

  /**
   * Play an animation
   *
   * @param animation The animation to play
   * @param options Playback options
   */
  play(animation: AnimationPath, options: AnimationPlayOptions = {}): void {
    console.log('[AnimationEngine] play() called, animation:', animation.id, 'waypoints:', animation.waypoints?.length, 'duration:', animation.duration);
    // Stop any currently playing animation
    this.stop();

    this.options = options;

    // Initialize animation state
    this.animationState = {
      animation,
      currentTime: options.startTime || 0,
      isPlaying: true,
      isPaused: false,
      isCompleted: false,
      currentWaypointIndex: 0,
      currentPosition: { x: 0, y: 0 },
    };

    // Start playback
    this.startTime = performance.now() - (options.startTime || 0);
    console.log('[AnimationEngine] Starting animation loop');
    this.animate();
  }

  /**
   * Pause the current animation
   */
  pause(): void {
    if (!this.animationState || !this.animationState.isPlaying) {
      return;
    }

    this.animationState.isPlaying = false;
    this.animationState.isPaused = true;
    this.pauseTime = this.animationState.currentTime;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Resume a paused animation
   */
  resume(): void {
    if (!this.animationState || this.animationState.isPlaying || !this.animationState.isPaused) {
      return;
    }

    this.animationState.isPlaying = true;
    this.animationState.isPaused = false;
    this.startTime = performance.now() - this.pauseTime;
    this.animate();
  }

  /**
   * Stop the current animation
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.animationState) {
      this.animationState.isPlaying = false;
      this.animationState.isPaused = false;
      this.animationState.isCompleted = true;
    }
  }

  /**
   * Seek to a specific time in the animation
   *
   * @param time Time in milliseconds
   */
  seek(time: number): void {
    if (!this.animationState) {
      return;
    }

    const wasPlaying = this.animationState.isPlaying;

    if (wasPlaying) {
      this.pause();
    }

    this.animationState.currentTime = Math.max(0, Math.min(time, this.animationState.animation.duration));
    this.pauseTime = this.animationState.currentTime;

    // Update position
    this.updatePosition();

    if (wasPlaying) {
      this.resume();
    }
  }

  /**
   * Get current animation state
   */
  getState(): AnimationState | null {
    return this.animationState;
  }

  /**
   * Check if an animation is currently playing
   */
  isPlaying(): boolean {
    return this.animationState?.isPlaying || false;
  }

  /**
   * Main animation loop
   */
  private animate = (): void => {
    if (!this.animationState || !this.animationState.isPlaying) {
      console.log('[AnimationEngine] animate() early return - not playing');
      return;
    }

    const now = performance.now();
    const speed = this.options.speed || 1.0;
    const elapsed = (now - this.startTime) * speed;

    this.animationState.currentTime = elapsed;
    console.log('[AnimationEngine] animate() frame, elapsed:', elapsed.toFixed(0), 'duration:', this.animationState.animation.duration);

    // Check if animation is complete
    if (elapsed >= this.animationState.animation.duration) {
      if (this.animationState.animation.loop) {
        // Loop back to start
        this.startTime = now;
        this.animationState.currentTime = 0;
      } else {
        // Complete the animation
        this.animationState.currentTime = this.animationState.animation.duration;
        this.animationState.isPlaying = false;
        this.animationState.isCompleted = true;

        // Update to final position
        this.updatePosition();

        // Call completion callback
        if (this.options.onComplete) {
          this.options.onComplete();
        }

        return;
      }
    }

    // Update position
    this.updatePosition();

    // Call update callback
    if (this.options.onUpdate) {
      this.options.onUpdate(this.animationState);
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * Update current position based on current time
   */
  private updatePosition(): void {
    if (!this.animationState) {
      return;
    }

    const position = calculatePositionAtTime(
      this.animationState.animation.waypoints,
      this.animationState.currentTime,
      this.animationState.animation.type
    );

    if (position) {
      this.animationState.currentPosition = { x: position.x, y: position.y };

      // Always update currentTransform to include sprite animation state
      // This allows tracking when sprite animations should start/stop
      this.animationState.currentTransform = {
        scale: position.scale,
        rotation: position.rotation,
        opacity: position.opacity,
        flipX: position.flipX,
        flipY: position.flipY,
        spriteAnimation: position.spriteAnimation,
        spriteFrames: position.spriteFrames,
        spriteFrameDuration: position.spriteFrameDuration,
      };

      // Update current waypoint index
      this.updateWaypointIndex();
    }
  }

  /**
   * Update the current waypoint index based on time
   */
  private updateWaypointIndex(): void {
    if (!this.animationState) {
      return;
    }

    const waypoints = this.animationState.animation.waypoints;
    let accumulatedTime = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const nextWaypoint = waypoints[i + 1];
      const segmentDuration = nextWaypoint.duration;

      if (this.animationState.currentTime <= accumulatedTime + segmentDuration) {
        this.animationState.currentWaypointIndex = i;
        return;
      }

      accumulatedTime += segmentDuration;
    }

    // Past the end
    this.animationState.currentWaypointIndex = waypoints.length - 1;
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose(): void {
    this.stop();
    this.animationState = null;
    this.options = {};
  }
}

/**
 * Global animation manager for managing multiple concurrent animations
 */
export class AnimationManager {
  private engines: Map<string, AnimationEngine> = new Map();

  /**
   * Play an animation
   *
   * @param id Unique identifier for this animation instance
   * @param animation The animation to play
   * @param options Playback options
   */
  play(id: string, animation: AnimationPath, options: AnimationPlayOptions = {}): void {
    let engine = this.engines.get(id);

    if (!engine) {
      engine = new AnimationEngine();
      this.engines.set(id, engine);
    }

    engine.play(animation, options);
  }

  /**
   * Pause an animation
   */
  pause(id: string): void {
    const engine = this.engines.get(id);
    if (engine) {
      engine.pause();
    }
  }

  /**
   * Resume an animation
   */
  resume(id: string): void {
    const engine = this.engines.get(id);
    if (engine) {
      engine.resume();
    }
  }

  /**
   * Stop an animation
   */
  stop(id: string): void {
    const engine = this.engines.get(id);
    if (engine) {
      engine.stop();
      this.engines.delete(id);
    }
  }

  /**
   * Stop all animations
   */
  stopAll(): void {
    this.engines.forEach((engine) => engine.stop());
    this.engines.clear();
  }

  /**
   * Get animation state
   */
  getState(id: string): AnimationState | null {
    const engine = this.engines.get(id);
    return engine ? engine.getState() : null;
  }

  /**
   * Check if an animation is playing
   */
  isPlaying(id: string): boolean {
    const engine = this.engines.get(id);
    return engine ? engine.isPlaying() : false;
  }

  /**
   * Get all active animation IDs
   */
  getActiveAnimations(): string[] {
    return Array.from(this.engines.keys());
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.engines.forEach((engine) => engine.dispose());
    this.engines.clear();
  }
}

// Global singleton instance
let globalAnimationManager: AnimationManager | null = null;

/**
 * Get the global AnimationManager instance
 */
export function getAnimationManager(): AnimationManager {
  if (!globalAnimationManager) {
    globalAnimationManager = new AnimationManager();
  }
  return globalAnimationManager;
}

/**
 * Dispose the global AnimationManager
 */
export function disposeAnimationManager(): void {
  if (globalAnimationManager) {
    globalAnimationManager.dispose();
    globalAnimationManager = null;
  }
}
