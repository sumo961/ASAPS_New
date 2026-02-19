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

    // Background is now handled centrally in Beat.execute()

    // Set button text in renderer state so it can be used by schema mapping
    // buttonText is legacy - treat it as restartText if restartText not set
    // Process all text through processText() for variable interpolation
    const effectiveRestartText = this.restartText || this.buttonText;
    if (effectiveRestartText) {
      renderer.setState('restartText', this.processText(effectiveRestartText, context));
    }
    if (this.creditsText) {
      renderer.setState('creditsText', this.processText(this.creditsText, context));
    }
    if (this.buttonText) {
      renderer.setState('buttonText', this.processText(this.buttonText, context));
    }

    // Process text with variable interpolation
    const processedMessage = this.processText(this.message, context);

    const locations = Array.from(this.locations.values());
    console.log('[EndScreenBeat] Rendering with locations:', locations.map(l => ({ name: l.name, kind: l.kind })));
    console.log('[EndScreenBeat] showRestart:', this.showRestart, 'showCredits:', this.showCredits);

    const action = await renderer.renderEndScreen(processedMessage, this.showRestart, this.showCredits, locations);
    console.log('[EndScreenBeat] Received action from renderer:', JSON.stringify(action));

    // Check if user clicked restart (action could be 'restart', 'Play Again', 'restartButton', 'button1', etc.)
    // Return the action so the engine/player can handle it
    const actionLower = (action || '').toLowerCase();
    console.log('[EndScreenBeat] Action lower:', actionLower);

    // Check for explicit restart patterns
    if (actionLower.includes('restart') || actionLower.includes('play') || actionLower.includes('again')) {
      console.log('[EndScreenBeat] User requested restart (explicit pattern) - returning __restart__');
      return '__restart__';  // Special signal for engine to restart
    }

    // Check for credits patterns
    if (actionLower.includes('credit')) {
      if (this.showCredits) {
        console.log('[EndScreenBeat] User requested credits');
        await this.showCreditsScreen(context, renderer);
      }
      console.log('[EndScreenBeat] Credits clicked, returning null');
      return null;
    }

    // Handle generic button names from visual editor (button1, button2, etc.)
    // button1 is typically restart, button2 is typically credits
    if (actionLower === 'button1' || actionLower === 'button 1') {
      if (this.showRestart) {
        console.log('[EndScreenBeat] User clicked button1 with showRestart=true - returning __restart__');
        return '__restart__';
      }
    }

    if (actionLower === 'button2' || actionLower === 'button 2') {
      if (this.showCredits) {
        console.log('[EndScreenBeat] User clicked button2 with showCredits=true - showing credits');
        await this.showCreditsScreen(context, renderer);
      }
      console.log('[EndScreenBeat] Button2/credits clicked, returning null');
      return null;
    }

    // If only one button exists and showRestart is true, any button click should restart
    if (this.showRestart && !this.showCredits) {
      console.log('[EndScreenBeat] Single button with showRestart=true - returning __restart__');
      return '__restart__';
    }

    console.log('[EndScreenBeat] No restart detected, returning null');
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
