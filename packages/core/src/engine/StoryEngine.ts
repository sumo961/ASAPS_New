import  { EventEmitter } from 'eventemitter3';
import { Story } from './Story';
import { StoryContext, SerializedStoryState } from './StoryContext';
import type { IRenderer } from '../types';

export class StoryEngine extends EventEmitter {
  private story: Story | null = null;
  private context: StoryContext;
  private renderer: IRenderer;
  private running: boolean = false;
  private paused: boolean = false;
  private currentBeatId: string | null = null;
  private timerInterruptBeat: string | null = null;

  /**
   * v0.9.48+ — `opts.mockMode` forces the StoryContext to use the
   * MockSensorService for XR sensor access. PreviewWindow / desktop
   * authoring passes `true` so authors can simulate location and
   * orientation without real hardware. Production playback omits this
   * and gets WebSensorService via capability detection.
   */
  private mockMode: boolean;

  constructor(renderer: IRenderer, opts?: { mockMode?: boolean }) {
    super();
    this.renderer = renderer;
    this.mockMode = !!opts?.mockMode;
    this.context = new StoryContext(undefined, undefined, { mockMode: this.mockMode });

    // Listen to timer expiration events
    this.context.on('timerExpired', this.handleTimerExpired.bind(this));
  }

  private handleTimerExpired(data: { name: string; targetBeat?: string }): void {
    if (data.targetBeat && this.running) {
      console.log(`Timer ${data.name} expired, jumping to ${data.targetBeat}`);
      this.emit('timerExpired', data);
      
      // Set timer interrupt - will be processed in next loop iteration
      this.timerInterruptBeat = data.targetBeat;
    }
  }

  async loadStory(story: Story): Promise<void> {
    this.story = story;
    this.context = new StoryContext(
      { currentBeatId: story.getFirstBeatId() },
      story,
      { mockMode: this.mockMode },
    );

    // Re-attach timer listener after context recreation
    this.context.on('timerExpired', this.handleTimerExpired.bind(this));

    this.emit('storyLoaded', story);
  }

  async start(startBeatId?: string): Promise<void> {
    if (!this.story) {
      throw new Error('No story loaded');
    }

    this.running = true;
    this.currentBeatId = startBeatId || this.story.getFirstBeatId();
    // Keep context in sync for save/load
    this.context.setCurrentBeatId(this.currentBeatId);

    while (this.running && this.currentBeatId) {
      // Check for timer interrupts
      if (this.timerInterruptBeat) {
        this.currentBeatId = this.timerInterruptBeat;
        this.context.setCurrentBeatId(this.currentBeatId);
        this.timerInterruptBeat = null;
      }

      const beat = this.story.getBeat(this.currentBeatId);
      if (!beat) {
        throw new Error(`Beat not found: ${this.currentBeatId}`);
      }

      try {
        console.log(`[StoryEngine] Executing beat ${this.currentBeatId} (type: ${beat.type})`);
        const nextBeatId = await beat.execute(this.context, this.renderer);
        console.log(`[StoryEngine] Beat ${this.currentBeatId} returned nextBeatId:`, JSON.stringify(nextBeatId));

        // Check for restart signal (backward compatibility)
        if (nextBeatId === '__restart__') {
          console.log('[StoryEngine] Restart signal - restarting from first beat');
          this.currentBeatId = this.story.getFirstBeatId();
          this.context.setCurrentBeatId(this.currentBeatId);
          continue;
        }

        // Check again for timer interrupt after beat execution
        if (this.timerInterruptBeat) {
          this.currentBeatId = this.timerInterruptBeat;
          this.timerInterruptBeat = null;
        } else {
          this.currentBeatId = nextBeatId || null;
        }
        // Keep context in sync for save/load
        if (this.currentBeatId) {
          this.context.setCurrentBeatId(this.currentBeatId);
        }
      } catch (error) {
        console.error('Story execution error:', error);
        this.running = false;
        throw error;
      }
    }

    this.emit('storyEnded');
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    // Stop all timers when story stops
    this.context.getTimerManager().stopAllTimers();
    this.emit('storyStopped');
  }

  /**
   * Pause story execution
   * The story loop will exit but state is preserved
   */
  pause(): void {
    if (this.running && !this.paused) {
      this.paused = true;
      this.running = false;
      // Pause all timers
      this.context.getTimerManager().stopAllTimers();
      this.emit('storyPaused', { beatId: this.currentBeatId });
    }
  }

  /**
   * Resume from paused state
   */
  async resume(): Promise<void> {
    if (this.paused && this.currentBeatId) {
      this.paused = false;
      // Restart any active timers from saved state
      const timers = this.context.getTimers();
      for (const [name, timer] of Object.entries(timers)) {
        if (timer.value > 0) {
          this.context.getTimerManager().startTimer(name, timer.value, timer.target);
        }
      }
      this.emit('storyResumed', { beatId: this.currentBeatId });
      await this.start(this.currentBeatId);
    }
  }

  /**
   * Check if the engine is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Check if the engine is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Load state from a serialized save and optionally resume
   * @param serialized The serialized story state
   * @param autoResume If true, automatically resume playing from the saved beat
   */
  async loadState(serialized: SerializedStoryState, autoResume: boolean = false): Promise<void> {
    console.log(`[StoryEngine] loadState called, autoResume=${autoResume}, currentBeatId=${serialized.currentBeatId}`);
    if (!this.story) {
      throw new Error('No story loaded. Call loadStory() first.');
    }

    // Stop any current execution
    console.log(`[StoryEngine] Stopping current execution, running=${this.running}`);
    this.stop();

    // Load the serialized state into context
    console.log(`[StoryEngine] Loading serialized state into context`);
    this.context.loadFromSerialized(serialized);

    // Update engine's current beat ID
    this.currentBeatId = serialized.currentBeatId;
    console.log(`[StoryEngine] Updated currentBeatId to: ${this.currentBeatId}`);

    this.emit('stateLoaded', { serialized, beatId: this.currentBeatId });

    // Optionally resume playing
    if (autoResume && this.currentBeatId) {
      console.log(`[StoryEngine] Auto-resuming from beat: ${this.currentBeatId}`);
      await this.start(this.currentBeatId);
      console.log(`[StoryEngine] start() completed`);
    }
  }

  /**
   * Get the current serialized state for saving
   */
  getSerializedState(): SerializedStoryState {
    return this.context.serialize();
  }

  /**
   * Get the loaded story
   */
  getStory(): Story | null {
    return this.story;
  }

  getContext(): StoryContext {
    return this.context;
  }

  getCurrentBeatId(): string | null {
    return this.currentBeatId;
  }
}
