import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { TitleScreenParameters } from '../generated/beat-types';

export class TitleScreenBeat extends Beat {
  public title: string;
  public author?: string;
  public buttonText?: string;
  /** Bug 26 — per-beat override for the spatial layer's fit. Schema
   *  declares 'contain' as the type-level default; authors can pick
   *  'cover' here for an immersive backdrop that fills the stage. */
  public spatialFit?: 'contain' | 'cover';

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<TitleScreenParameters>;
  } & Partial<TitleScreenParameters>) {
    super(config);
    this.title = config.title || config.parameters?.title || 'Untitled Story';
    this.author = config.author || config.parameters?.author;
    this.buttonText = config.buttonText || config.parameters?.buttonText;
    const fit = (config.parameters as any)?.spatialFit;
    this.spatialFit = fit === 'cover' || fit === 'contain' ? fit : undefined;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      title: this.title,
      author: this.author,
      buttonText: this.buttonText,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
      spatialAnimations: this.spatialAnimations,
      spatialFit: this.spatialFit,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.title !== undefined) this.title = params.title;
    if (params.author !== undefined) this.author = params.author;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
    if (params.spatialAnimations !== undefined) this.spatialAnimations = params.spatialAnimations;
    if (params.spatialFit !== undefined) {
      this.spatialFit = params.spatialFit === 'cover' || params.spatialFit === 'contain'
        ? params.spatialFit : undefined;
    }
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
    // P3-anim-6 — spatial-layer motion. Sibling channel; SpatialFlowView
    // reads it and applies a CSS transform animation to data-layer="spatial".
    renderer.setState('spatialAnimations', this.spatialAnimations);
    // Bug 26 — per-beat spatial-fit override (contain | cover).
    renderer.setState('spatialFit', this.spatialFit);

    const locations = Array.from(this.locations.values());

    console.log(`[TitleScreenBeat] Rendering with ${locations.length} locations`);
    console.log(`[TitleScreenBeat] Background node: ${this.node || 'none'}`);

    // Process text with variable interpolation
    const processedTitle = this.processText(this.title, context);
    const processedAuthor = this.processText(this.author || '', context);
    const processedButtonText = this.processText(this.buttonText || 'Start', context);

    await renderer.renderTitleScreen(processedTitle, processedAuthor, processedButtonText, locations);

    return this.getNextBeat(context);
  }
}
