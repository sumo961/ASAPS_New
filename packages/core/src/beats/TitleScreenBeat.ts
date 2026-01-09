import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { TitleScreenParameters } from '../generated/beat-types';

export class TitleScreenBeat extends Beat {
  public title: string;
  public author?: string;
  public buttonText?: string;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<TitleScreenParameters>;
  } & Partial<TitleScreenParameters>) {
    super(config);
    this.title = config.title || config.parameters?.title || 'Untitled Story';
    this.author = config.author || config.parameters?.author;
    this.buttonText = config.buttonText || config.parameters?.buttonText;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      title: this.title,
      author: this.author,
      buttonText: this.buttonText,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.title !== undefined) this.title = params.title;
    if (params.author !== undefined) this.author = params.author;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Background is now handled centrally in Beat.execute()

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
