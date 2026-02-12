import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { SetTimerParameters } from '../generated/beat-types';

export class SetTimerBeat extends Beat {
  private timerName: string;
  private timerValue: number;
  private timerTarget: string;
  private continueTarget: string = '';

  constructor(config: BeatConfig & {
    target?: string;
    continueTarget?: string;
    timerName?: string;  // Legacy support
    parameters?: Partial<SetTimerParameters>;
  } & Partial<SetTimerParameters>) {
    super(config);
    const params = config.parameters || {};

    // Support multiple parameter names for compatibility
    // Note: config.name is the beat display name, NOT the timer name - don't use it as fallback
    this.timerName = params.name || params.timerName || config.timerName || '';
    this.timerValue = params.value ?? config.value ?? 0;
    this.timerTarget = params.timerTarget || config.target || config.timerTarget || '';
  }

  getParameters(): Record<string, any> {
    return {
      timerName: this.timerName || '',
      value: this.timerValue || 60,
      timerTarget: this.timerTarget || '',
      continueTarget: this.continueTarget || ''
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.timerName !== undefined) this.timerName = params.timerName;
    if (params.name !== undefined) this.timerName = params.name;
    if (params.value !== undefined) this.timerValue = params.value;
    if (params.timerTarget !== undefined) this.timerTarget = params.timerTarget;
    if (params.continueTarget !== undefined) this.continueTarget = params.continueTarget;
    if (params.target !== undefined) this.continueTarget = params.target; // alias
    
    // Don't manage connections here - let Inspector handle them
    // The timer target is stored as a parameter, not a connection
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.timerName) {
      console.error(`SetTimerBeat ${this.id} has no timer name specified`);
      return this.getNextBeat(context);
    }

    if (!this.timerTarget) {
      console.error(`SetTimerBeat ${this.id} has no timer target specified`);
      return this.getNextBeat(context);
    }

    // If value is 0, clear the timer
    if (this.timerValue === 0) {
      context.clearTimer(this.timerName);
      console.log(`SetTimerBeat ${this.id}: Cleared timer '${this.timerName}'`);
    } else {
      // Set the timer with value (in seconds) and target beat
      context.setTimer(this.timerName, this.timerValue, this.timerTarget);
      console.log(`SetTimerBeat ${this.id}: Set timer '${this.timerName}' to ${this.timerValue} seconds -> ${this.timerTarget}`);
    }

    // IMPORTANT: SetTimer should continue to next beat immediately
    // The timer runs in the background and fires when it expires
    // The continue connection should be the only connection
    return this.getNextBeat(context);
  }

  /**
   * Override getNextBeat to return the continue connection (empty label)
   * instead of the timer target connection (labeled "Timer Target")
   */
  getNextBeat(context: StoryContext): string | null {
    // Look for the continue connection (connection with no label or empty label)
    const continueConnection = this.connections.find(
      conn => !conn.label || conn.label === ''
    );

    if (continueConnection) {
      return continueConnection.targetId;
    }

    // Fallback to defaultTarget if no continue connection found
    // Don't use super.getNextBeat() as it would return the timer target connection
    if (this.defaultTarget) {
      return this.defaultTarget;
    }

    return null;
  }
}
