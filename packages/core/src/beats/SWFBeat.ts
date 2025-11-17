import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export class SWFBeat extends Beat {
  public swfFile: string;
  public autoplay: boolean;
  public skipButton: boolean;

  constructor(config: BeatConfig & {
    swfFile?: string;
    file?: string;
    autoplay?: boolean;
    skipButton?: boolean;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.swfFile = config.swfFile || config.file || config.parameters?.swfFile || config.parameters?.file || '';
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
  }

  getParameters(): Record<string, any> {
    return {
      swfFile: this.swfFile,
      autoplay: this.autoplay,
      skipButton: this.skipButton
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.swfFile !== undefined) this.swfFile = params.swfFile;
    if (params.file !== undefined) this.swfFile = params.file; // Backward compatibility
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Note: SWF files are deprecated - convert to video
    console.warn(`SWFBeat is deprecated. Converting ${this.swfFile} to video playback.`);
    
    // Try to play as video with .mp4 extension
    const videoFile = this.swfFile.replace(/\.swf$/i, '.mp4');
    
    try {
      // Call renderVideo with the three separate arguments expected by the interface
      // Map skipButton to controls parameter for backward compatibility
      await renderer.renderVideo(videoFile, this.autoplay, this.skipButton);
    } catch (error) {
      console.error(`Failed to play converted video: ${videoFile}`, error);
      // Show a message instead
      await renderer.renderText(
        `Legacy Flash content (${this.swfFile}) cannot be played. Please convert to modern video format.`,
        'Continue'
      );
      await renderer.waitForUserInput();
    }
    
    return this.getNextBeat(context);
  }
}
