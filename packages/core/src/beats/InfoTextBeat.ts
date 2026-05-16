import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { InfoTextParameters } from '../generated/beat-types';

export class InfoTextBeat extends Beat {
  public text: string;
  public textVariations?: string[];
  public buttonText?: string;
  public locs: any[];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    textVariations?: string[];
    parameters?: Partial<InfoTextParameters & { textVariations?: string[] }>;
  } & Partial<InfoTextParameters>) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
    this.textVariations = config.textVariations || config.parameters?.textVariations;
    this.buttonText = config.buttonText || config.parameters?.buttonText;
    this.locs = config.locs || config.parameters?.locs || [];
    this.backgroundSound = config.backgroundSound || config.parameters?.backgroundSound;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    // NOTE: locs is an internal visual field, only include if non-empty
    const params: Record<string, any> = {
      text: this.text,
      buttonText: this.buttonText,
      node: this.node,
      backgroundSound: this.backgroundSound
    };
    if (this.textVariations && this.textVariations.length > 0) {
      params.textVariations = this.textVariations;
    }
    if (this.locs && this.locs.length > 0) {
      params.locs = this.locs;
    }
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.textVariations !== undefined) this.textVariations = params.textVariations;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
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
    const processedButtonText = this.processText(this.buttonText || 'Continue', context);

    // Declare our own beat type so renderText() resolves schema-driven
    // behavior for THIS beat, not a stale value left by a prior
    // aiInfoText/onlineContent beat (which would wrongly route a plain
    // infoText through responsive slot mode). infoText is not slot-mode in
    // the schema, so this keeps it on the unchanged absolute path.
    renderer.setState('currentBeatType', 'infoText');

    const locations = Array.from(this.locations.values());
    await renderer.renderText(processedText, processedButtonText, locations);
    return this.getNextBeat(context);
  }
}
