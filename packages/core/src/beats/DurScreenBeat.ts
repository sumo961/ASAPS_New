import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { DurScreenParameters } from '../generated/beat-types';

export class DurScreenBeat extends Beat {
  public text: string;
  public duration: number;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<DurScreenParameters>;
  } & Partial<DurScreenParameters>) {
    super(config);
    this.text = config.text || config.parameters?.text || '';
    this.duration = config.duration || config.parameters?.duration || 3000;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      text: this.text,
      duration: this.duration,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.text !== undefined) this.text = params.text;
    if (params.duration !== undefined) this.duration = params.duration;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

    // Process text with variable interpolation
    const processedText = this.processText(this.text, context);

    const locations = Array.from(this.locations.values());
    await renderer.renderDurScreen(processedText, this.duration, locations);
    return this.getNextBeat(context);
  }
}
