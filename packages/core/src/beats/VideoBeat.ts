import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { VideoBeatParameters } from '../generated/beat-types';


export class VideoBeat extends Beat {
  public videoFile: string;
  public videoAssetId?: string;
  public autoplay: boolean;
  public controls: boolean;
  public skipButton: boolean;

  constructor(config: BeatConfig & {
    parameters?: Partial<VideoBeatParameters>;
  } & Partial<VideoBeatParameters>) {
    super(config);
    this.videoFile = config.videoFile || config.parameters?.videoFile || '';
    this.videoAssetId = config.videoAssetId || config.parameters?.videoAssetId;
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.controls = config.controls ?? config.parameters?.controls ?? true;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
  }

  getParameters(): Record<string, any> {
    return {
      videoFile: this.videoFile,
      videoAssetId: this.videoAssetId,
      autoplay: this.autoplay,
      controls: this.controls,
      skipButton: this.skipButton
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.videoFile !== undefined) this.videoFile = params.videoFile;
    if (params.videoAssetId !== undefined) this.videoAssetId = params.videoAssetId;
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.controls !== undefined) this.controls = params.controls;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Set videoAssetId on renderer state so renderer can resolve a fresh URL
    // (blob URLs from the builder expire across window boundaries)
    if (this.videoAssetId) {
      renderer.setState('videoAssetId', this.videoAssetId);
    }

    // Use stored videoFile as fallback (may be a blob URL that's still valid)
    const videoUrl = this.videoFile || this.node || '';

    if (!videoUrl) {
      console.error(`VideoBeat ${this.id} has no video file specified`);
      return this.getNextBeat(context);
    }

    try {
      const locations = Array.from(this.locations.values());
      await renderer.renderVideo(videoUrl, this.autoplay, this.controls, locations, this.skipButton);
    } catch (error) {
      console.error(`Error playing video in beat ${this.id}:`, error);
    }

    return this.getNextBeat(context);
  }
}
