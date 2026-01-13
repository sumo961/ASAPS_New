import { EventEmitter } from 'eventemitter3';

export interface ActiveTimer {
  name: string;
  remainingTime: number;
  totalTime: number;  // Original duration for progress bar calculation
  targetBeat?: string;
  intervalId?: number;
}

/**
 * TimerManager - Handles active countdown timers
 */
export class TimerManager extends EventEmitter {
  private timers: Map<string, ActiveTimer> = new Map();

  /**
   * Start a timer that counts down
   */
  startTimer(name: string, duration: number, targetBeat?: string): void {
    // Clear existing timer with same name
    this.stopTimer(name);

    const timer: ActiveTimer = {
      name,
      remainingTime: duration,
      totalTime: duration,
      targetBeat,
    };

    // Start countdown interval (1 second)
    timer.intervalId = window.setInterval(() => {
      timer.remainingTime--;
      
      this.emit('timerTick', { name, remainingTime: timer.remainingTime });

      if (timer.remainingTime <= 0) {
        this.emit('timerExpired', { name, targetBeat: timer.targetBeat });
        this.stopTimer(name);
      }
    }, 1000);

    this.timers.set(name, timer);
    this.emit('timerStarted', { name, duration, targetBeat });
  }

  /**
   * Stop a timer
   */
  stopTimer(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      if (timer.intervalId) {
        clearInterval(timer.intervalId);
      }
      this.timers.delete(name);
      this.emit('timerStopped', { name });
    }
  }

  /**
   * Stop all timers
   */
  stopAllTimers(): void {
    for (const [name] of this.timers) {
      this.stopTimer(name);
    }
  }

  /**
   * Get remaining time for a timer
   */
  getRemainingTime(name: string): number {
    return this.timers.get(name)?.remainingTime || 0;
  }

  /**
   * Check if timer exists
   */
  hasTimer(name: string): boolean {
    return this.timers.has(name);
  }

  /**
   * Get all active timers
   */
  getActiveTimers(): ActiveTimer[] {
    return Array.from(this.timers.values());
  }

  /**
   * Get timer target beat
   */
  getTimerTarget(name: string): string | undefined {
    return this.timers.get(name)?.targetBeat;
  }
}
