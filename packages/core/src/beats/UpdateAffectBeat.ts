/**
 * UpdateAffectBeat — invisible beat that applies one or more affect Effects
 * (mood nudges, emotion fires, sentiment adds, reflection records, goal
 * status flips, variant switches, plus the v0.9.45 bookmarkAffectState).
 *
 * v0.9.45 onward, the canonical authoring surface is the `effects: Effect[]`
 * parameter — same shape as a choice's effects, which lets the editor reuse
 * ChoiceEffectsEditor (templates, live summary, palette auto-complete,
 * bookmark snapshots all come along for free).
 *
 * Legacy single-row authoring (mood deltas + one sentiment + one emotion
 * fire) is still honoured at runtime when no `effects` array is set, so
 * existing projects keep working unchanged. When the editor first opens
 * a legacy beat, it synthesises an `effects` array from the legacy fields
 * so the author sees one row per non-empty slot — saving the beat then
 * persists the migrated form.
 */

import { Beat } from './Beat';
import type { BeatConfig, Effect, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

/**
 * Local input shape for UpdateAffectBeat's constructor.
 *
 * The canonical schema-derived shape lives in generated/beat-types.ts as
 * `UpdateAffectParameters` (auto-generated from beat-definitions/core-beats.json).
 * This local interface is a superset that adds the v0.9.45 `effects` field
 * so the constructor can accept the new multi-row authoring shape without
 * waiting for a schema regeneration cycle.
 */
interface UpdateAffectInput {
  /** v0.9.45+ — preferred shape. Multi-row Effect[] applied in order. */
  effects?: Effect[];
  /** Legacy single-row authoring path. */
  character?: string;
  moodValenceDelta?: number;
  moodArousalDelta?: number;
  sentimentTarget?: string;
  sentimentEmotion?: string;
  sentimentDelta?: number;
  emotion?: string;
  emotionDelta?: number;
}

export class UpdateAffectBeat extends Beat {
  private effects?: Effect[];
  private character: string;
  private moodValenceDelta?: number;
  private moodArousalDelta?: number;
  private sentimentTarget?: string;
  private sentimentEmotion?: string;
  private sentimentDelta?: number;
  private emotion?: string;
  private emotionDelta?: number;

  constructor(config: BeatConfig & {
    parameters?: Partial<UpdateAffectInput>;
  } & Partial<UpdateAffectInput>) {
    super(config);
    const p = (config.parameters || {}) as Partial<UpdateAffectInput>;
    this.effects = (config as any).effects ?? p.effects;
    this.character = (config as any).character ?? p.character ?? 'player';
    this.moodValenceDelta = (config as any).moodValenceDelta ?? p.moodValenceDelta;
    this.moodArousalDelta = (config as any).moodArousalDelta ?? p.moodArousalDelta;
    this.sentimentTarget = (config as any).sentimentTarget ?? p.sentimentTarget;
    this.sentimentEmotion = (config as any).sentimentEmotion ?? p.sentimentEmotion;
    this.sentimentDelta = (config as any).sentimentDelta ?? p.sentimentDelta;
    this.emotion = (config as any).emotion ?? p.emotion;
    this.emotionDelta = (config as any).emotionDelta ?? p.emotionDelta;
  }

  getParameters(): Record<string, any> {
    return {
      character: this.character,
      ...(this.effects !== undefined ? { effects: this.effects } : {}),
      ...(this.moodValenceDelta !== undefined ? { moodValenceDelta: this.moodValenceDelta } : {}),
      ...(this.moodArousalDelta !== undefined ? { moodArousalDelta: this.moodArousalDelta } : {}),
      ...(this.sentimentTarget !== undefined ? { sentimentTarget: this.sentimentTarget } : {}),
      ...(this.sentimentEmotion !== undefined ? { sentimentEmotion: this.sentimentEmotion } : {}),
      ...(this.sentimentDelta !== undefined ? { sentimentDelta: this.sentimentDelta } : {}),
      ...(this.emotion !== undefined ? { emotion: this.emotion } : {}),
      ...(this.emotionDelta !== undefined ? { emotionDelta: this.emotionDelta } : {}),
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.effects !== undefined) this.effects = params.effects;
    if (params.character !== undefined) this.character = params.character;
    if (params.moodValenceDelta !== undefined) this.moodValenceDelta = params.moodValenceDelta;
    if (params.moodArousalDelta !== undefined) this.moodArousalDelta = params.moodArousalDelta;
    if (params.sentimentTarget !== undefined) this.sentimentTarget = params.sentimentTarget;
    if (params.sentimentEmotion !== undefined) this.sentimentEmotion = params.sentimentEmotion;
    if (params.sentimentDelta !== undefined) this.sentimentDelta = params.sentimentDelta;
    if (params.emotion !== undefined) this.emotion = params.emotion;
    if (params.emotionDelta !== undefined) this.emotionDelta = params.emotionDelta;
  }

  protected async performAction(
    context: StoryContext,
    _renderer: IRenderer,
  ): Promise<string | null> {
    // v0.9.45+ preferred path: apply each Effect via the unified dispatcher.
    if (this.effects && this.effects.length > 0) {
      for (const effect of this.effects) {
        try {
          context.applyEffect(effect);
        } catch (err) {
          console.warn(
            `UpdateAffectBeat ${this.id}: applyEffect threw for ${effect.type}`, err,
          );
        }
      }
      return this.getNextBeat(context);
    }

    // Legacy fallback — single-row authoring fields. Kept so existing
    // projects keep working before the author migrates them.
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

    if (this.emotion && this.emotionDelta !== undefined && this.emotionDelta !== 0) {
      const next = context.fireCharacterEmotion(this.character, this.emotion, this.emotionDelta);
      console.log(
        `UpdateAffectBeat ${this.id}: ${this.character}.emotion[${this.emotion}] now ${next.toFixed(2)}`,
      );
    } else if (this.emotion || this.emotionDelta !== undefined) {
      console.warn(
        `UpdateAffectBeat ${this.id}: partial emotion fields — need both emotion + emotionDelta to fire`,
      );
    }

    return this.getNextBeat(context);
  }
}

/**
 * Synthesise an Effect[] from a legacy UpdateAffectBeat's single-row fields.
 * Used by the editor when opening a legacy beat for the first time so the
 * author sees their existing values as effect rows. Returns an empty array
 * when no legacy fields are populated.
 *
 * Exported as a free helper rather than a class method so the editor can
 * call it without instantiating the beat.
 */
export function synthesizeEffectsFromLegacyParams(params: Partial<UpdateAffectInput>): Effect[] {
  const out: Effect[] = [];
  const char = params.character || 'player';
  const dV = Number(params.moodValenceDelta ?? 0);
  const dA = Number(params.moodArousalDelta ?? 0);
  if (dV !== 0 || dA !== 0) {
    out.push({
      type: 'nudgeMood',
      target: char,
      valenceDelta: dV,
      arousalDelta: dA,
    } as Effect);
  }
  const sd = Number(params.sentimentDelta ?? 0);
  if (params.sentimentTarget && params.sentimentEmotion && sd !== 0) {
    out.push({
      type: 'addSentiment',
      target: char,
      sentimentTarget: params.sentimentTarget,
      sentimentEmotion: params.sentimentEmotion,
      strengthDelta: sd,
    } as Effect);
  }
  const ed = Number(params.emotionDelta ?? 0);
  if (params.emotion && ed !== 0) {
    out.push({
      type: 'fireEmotion',
      target: char,
      emotion: params.emotion,
      emotionDelta: ed,
    } as Effect);
  }
  return out;
}
