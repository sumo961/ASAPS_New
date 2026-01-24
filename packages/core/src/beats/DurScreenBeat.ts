import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { DurScreenParameters } from '../generated/beat-types';

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
    this.duration = config.duration || config.parameters?.duration || 3000;
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
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.textVariations !== undefined) this.textVariations = params.textVariations;
    if (params.duration !== undefined) this.duration = params.duration;
    if (params.node !== undefined) this.node = params.node;
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

    // Select text (handles random variation selection)
    const selectedText = this.selectText();

    // Process text with variable interpolation
    const processedText = this.processText(selectedText, context);

    const locations = Array.from(this.locations.values());
    await renderer.renderDurScreen(processedText, this.duration, locations);
    return this.getNextBeat(context);
  }
}
