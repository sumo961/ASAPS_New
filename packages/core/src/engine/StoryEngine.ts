import  { EventEmitter } from 'eventemitter3';
import { Story } from './Story';
import { StoryContext } from './StoryContext';
import type { IRenderer } from '../types';

export class StoryEngine extends EventEmitter {
  private story: Story | null = null;
  private context: StoryContext;
  private renderer: IRenderer;
  private running: boolean = false;
  private currentBeatId: string | null = null;
  private timerInterruptBeat: string | null = null;

  constructor(renderer: IRenderer) {
    super();
    this.renderer = renderer;
    this.context = new StoryContext();
    
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
    this.context = new StoryContext({
      currentBeatId: story.getFirstBeatId()
    }, story);
    
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
    
    while (this.running && this.currentBeatId) {
      // Check for timer interrupts
      if (this.timerInterruptBeat) {
        this.currentBeatId = this.timerInterruptBeat;
        this.timerInterruptBeat = null;
      }

      const beat = this.story.getBeat(this.currentBeatId);
      if (!beat) {
        throw new Error(`Beat not found: ${this.currentBeatId}`);
      }
      
      try {
        const nextBeatId = await beat.execute(this.context, this.renderer);
        
        // Check again for timer interrupt after beat execution
        if (this.timerInterruptBeat) {
          this.currentBeatId = this.timerInterruptBeat;
          this.timerInterruptBeat = null;
        } else {
          this.currentBeatId = nextBeatId || null;
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
    // Stop all timers when story stops
    this.context.getTimerManager().stopAllTimers();
    this.emit('storyStopped');
  }

  getContext(): StoryContext {
    return this.context;
  }

  getCurrentBeatId(): string | null {
    return this.currentBeatId;
  }
}
