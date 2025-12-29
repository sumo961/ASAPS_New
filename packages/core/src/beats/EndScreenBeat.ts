import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';
import type { EndScreenParameters } from '../generated/beat-types';

export class EndScreenBeat extends Beat {
  public message: string;
  public showRestart: boolean;
  public showCredits: boolean;
  public reset: boolean;
  public restartText?: string;
  public creditsText?: string;
  public buttonText?: string;

  constructor(config: BeatConfig & {
    node?: string;
    buttonText?: string;  // Legacy support
    parameters?: Partial<EndScreenParameters>;
  } & Partial<EndScreenParameters>) {
    super(config);
    this.message = config.message || config.parameters?.message || 'The End';
    this.showRestart = config.showRestart ?? config.parameters?.showRestart ?? true;
    this.showCredits = config.showCredits ?? config.parameters?.showCredits ?? false;
    this.reset = config.reset ?? config.parameters?.reset ?? false;
    this.restartText = config.restartText || config.parameters?.restartText;
    this.creditsText = config.creditsText || config.parameters?.creditsText;
    this.buttonText = config.buttonText || config.parameters?.buttonText;
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      message: this.message,
      showRestart: this.showRestart,
      showCredits: this.showCredits,
      reset: this.reset,
      restartText: this.restartText,
      creditsText: this.creditsText,
      buttonText: this.buttonText,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.message !== undefined) this.message = params.message;
    if (params.showRestart !== undefined) this.showRestart = params.showRestart;
    if (params.showCredits !== undefined) this.showCredits = params.showCredits;
    if (params.reset !== undefined) this.reset = params.reset;
    if (params.restartText !== undefined) this.restartText = params.restartText;
    if (params.creditsText !== undefined) this.creditsText = params.creditsText;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (this.reset) {
      context.reset();
    }

    // Set background asset ID in renderer state so it can be resolved
    if (this.node) {
      renderer.setState('backgroundAssetId', this.node);
    }

    // Set button text in renderer state so it can be used by schema mapping
    // buttonText is legacy - treat it as restartText if restartText not set
    const effectiveRestartText = this.restartText || this.buttonText;
    if (effectiveRestartText) {
      renderer.setState('restartText', effectiveRestartText);
    }
    if (this.creditsText) {
      renderer.setState('creditsText', this.creditsText);
    }
    if (this.buttonText) {
      renderer.setState('buttonText', this.buttonText);
    }

    // Process text with variable interpolation
    const processedMessage = this.processText(this.message, context);

    const locations = Array.from(this.locations.values());
    await renderer.renderEndScreen(processedMessage, this.showRestart, this.showCredits, locations);

    if (this.showCredits) {
      await this.showCreditsScreen(context, renderer);
    }

    return null;
  }

  private async showCreditsScreen(context: StoryContext, renderer: IRenderer): Promise<void> {
    const story = context.getStory();
    const metadata = story.getMetadata();
    const creditsText = `
      ${metadata.title || 'Untitled Story'}
      
      Created by: ${metadata.author || 'Anonymous'}
      
      Thank you for playing!
    `;
    await renderer.renderText(creditsText, 'Close', []);
  }
}
