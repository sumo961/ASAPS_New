import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { DurScreenParameters } from '../generated/beat-types';
import {
  normalizeDurationToSeconds,
  durationSecondsToMs,
  suggestDurationSeconds,
} from '../utils/duration';

export class DurScreenBeat extends Beat {
  public text: string;
  public textVariations?: string[];
  public duration: number;

  constructor(config: BeatConfig & {
    node?: string;
    textVariations?: string[];
    parameters?: Partial<DurScreenParameters & { textVariations?: string[] }>;
  } & Partial<DurScreenParameters>) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
    this.textVariations = config.textVariations || config.parameters?.textVariations;
    // Canonical unit is SECONDS. normalizeDurationToSeconds applies the
    // legacy-ms migration heuristic (value > 60 → ÷1000). If no duration was
    // authored, suggest one from the text's word count so a new/AI beat is
    // never under-timed (the original 3000 default was ms = 3s, and the AI
    // emitted bare seconds the runtime then read as ms — both fixed here).
    const rawDuration = config.duration ?? config.parameters?.duration;
    this.duration = rawDuration != null
      ? normalizeDurationToSeconds(rawDuration)
      : suggestDurationSeconds(this.text);
    if (!this.duration || this.duration <= 0) {
      this.duration = suggestDurationSeconds(this.text);
    }
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    const params: Record<string, any> = {
      text: this.text,
      duration: this.duration,
      node: this.node
    };
    if (this.textVariations && this.textVariations.length > 0) {
      params.textVariations = this.textVariations;
    }
    params.slotIntent = this.slotIntent;
    params.slotAnimations = this.slotAnimations;
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.textVariations !== undefined) this.textVariations = params.textVariations;
    if (params.duration !== undefined) {
      this.duration = normalizeDurationToSeconds(params.duration);
    }
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  /**
   * Select text from variations (if any) or return main text.
   * Combines main text with variations array for random selection.
   */
  private selectText(): string {
    if (this.textVariations && this.textVariations.length > 0) {
      // Combine main text with variations
      const allOptions = [this.text, ...this.textVariations];
      const randomIndex = Math.floor(Math.random() * allOptions.length);
      return allOptions[randomIndex];
    }
    return this.text;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

    // P3-anim — push responsive motion intent through the renderer-state
    // channel so renderPositionedBeat's slot branch forwards it to
    // SlotFlowView. Absent → no animation (unchanged).
    renderer.setState('slotAnimations', this.slotAnimations);

    // Select text (handles random variation selection)
    const selectedText = this.selectText();

    // Process text with variable interpolation
    const processedText = this.processText(selectedText, context);

    const locations = Array.from(this.locations.values());
    // this.duration is canonical seconds; the renderer contract is ms.
    await renderer.renderDurScreen(processedText, durationSecondsToMs(this.duration), locations);
    return this.getNextBeat(context);
  }
}
