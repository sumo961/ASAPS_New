/**
 * UpdateAffectBeat — invisible beat that nudges a character's mood and/or
 * adds/strengthens a sentiment. Step 4 / Layer 3 authoring surface for the
 * mood + sentiments runtime.
 *
 * Author parameters:
 *   character          — the character whose affect changes (id, name, or
 *                        displayName; resolved via resolveCharacterKey).
 *   moodValenceDelta?  — added to the character's mood.valence, clamped.
 *   moodArousalDelta?  — added to the character's mood.arousal, clamped.
 *   sentimentTarget?   — entity (Character.id, item name, beat id, tag) the
 *                        sentiment is directed at. Optional.
 *   sentimentEmotion?  — emotion label. Required when sentimentTarget is set.
 *   sentimentDelta?    — strength delta added to the matching sentiment row,
 *                        clamped to [-1, 1]. Required when sentimentTarget set.
 *
 * All parameters are optional individually; at minimum one of mood deltas or
 * sentiment fields must be set, otherwise the beat is a no-op.
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export interface UpdateAffectParameters {
  character?: string;
  moodValenceDelta?: number;
  moodArousalDelta?: number;
  sentimentTarget?: string;
  sentimentEmotion?: string;
  sentimentDelta?: number;
}

export class UpdateAffectBeat extends Beat {
  private character: string;
  private moodValenceDelta?: number;
  private moodArousalDelta?: number;
  private sentimentTarget?: string;
  private sentimentEmotion?: string;
  private sentimentDelta?: number;

  constructor(config: BeatConfig & {
    parameters?: Partial<UpdateAffectParameters>;
  } & Partial<UpdateAffectParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<UpdateAffectParameters>;
    this.character = (config as any).character ?? p.character ?? 'player';
    this.moodValenceDelta = (config as any).moodValenceDelta ?? p.moodValenceDelta;
    this.moodArousalDelta = (config as any).moodArousalDelta ?? p.moodArousalDelta;
    this.sentimentTarget = (config as any).sentimentTarget ?? p.sentimentTarget;
    this.sentimentEmotion = (config as any).sentimentEmotion ?? p.sentimentEmotion;
    this.sentimentDelta = (config as any).sentimentDelta ?? p.sentimentDelta;
  }

  getParameters(): Record<string, any> {
    return {
      character: this.character,
      ...(this.moodValenceDelta !== undefined ? { moodValenceDelta: this.moodValenceDelta } : {}),
      ...(this.moodArousalDelta !== undefined ? { moodArousalDelta: this.moodArousalDelta } : {}),
      ...(this.sentimentTarget !== undefined ? { sentimentTarget: this.sentimentTarget } : {}),
      ...(this.sentimentEmotion !== undefined ? { sentimentEmotion: this.sentimentEmotion } : {}),
      ...(this.sentimentDelta !== undefined ? { sentimentDelta: this.sentimentDelta } : {}),
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.character !== undefined) this.character = params.character;
    if (params.moodValenceDelta !== undefined) this.moodValenceDelta = params.moodValenceDelta;
    if (params.moodArousalDelta !== undefined) this.moodArousalDelta = params.moodArousalDelta;
    if (params.sentimentTarget !== undefined) this.sentimentTarget = params.sentimentTarget;
    if (params.sentimentEmotion !== undefined) this.sentimentEmotion = params.sentimentEmotion;
    if (params.sentimentDelta !== undefined) this.sentimentDelta = params.sentimentDelta;
  }

  protected async performAction(
    context: StoryContext,
    _renderer: IRenderer,
  ): Promise<string | null> {
    if (!this.character) {
      console.warn(`UpdateAffectBeat ${this.id}: no character set, skipping`);
      return this.getNextBeat(context);
    }

    const dV = this.moodValenceDelta ?? 0;
    const dA = this.moodArousalDelta ?? 0;
    if (dV !== 0 || dA !== 0) {
      const next = context.nudgeCharacterMood(this.character, dV, dA);
      console.log(
        `UpdateAffectBeat ${this.id}: nudged ${this.character} mood by (${dV}, ${dA}); now (${next.valence.toFixed(2)}, ${next.arousal.toFixed(2)})`,
      );
    }

    if (this.sentimentTarget && this.sentimentEmotion && this.sentimentDelta !== undefined) {
      const result = context.addCharacterSentiment(
        this.character,
        this.sentimentTarget,
        this.sentimentEmotion,
        this.sentimentDelta,
      );
      if (result) {
        console.log(
          `UpdateAffectBeat ${this.id}: ${this.character}.sentiment[${this.sentimentEmotion} → ${this.sentimentTarget}] now ${result.strength.toFixed(2)}`,
        );
      }
    } else if (this.sentimentTarget || this.sentimentEmotion || this.sentimentDelta !== undefined) {
      console.warn(
        `UpdateAffectBeat ${this.id}: partial sentiment fields — need all of target+emotion+delta to record a sentiment`,
      );
    }

    return this.getNextBeat(context);
  }
}
