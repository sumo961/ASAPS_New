import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { IntroTextParameters } from '../generated/beat-types';

export class IntroTextBeat extends Beat {
  public text: string;
  public buttonText?: string;
  public locs: any[];
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    locs?: any[];
    backgroundSound?: string;
    parameters?: Partial<IntroTextParameters>;
  } & Partial<IntroTextParameters>) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
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
    if (this.locs && this.locs.length > 0) {
      params.locs = this.locs;
    }
    return params;
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.locs !== undefined) this.locs = params.locs;
    if (params.backgroundSound !== undefined) this.backgroundSound = params.backgroundSound;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

    // Process text with variable interpolation
    const processedText = this.processText(this.text, context);
    const processedButtonText = this.processText(this.buttonText || 'Continue', context);

    const locations = Array.from(this.locations.values());
    await renderer.renderText(processedText, processedButtonText, locations);
    return this.getNextBeat(context);
  }
}
