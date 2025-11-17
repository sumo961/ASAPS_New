import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { VideoBeatParameters } from '../generated/beat-types';


export class VideoBeat extends Beat {
  public videoFile: string;
  public autoplay: boolean;
  public controls: boolean;
  public skipButton: boolean;

  constructor(config: BeatConfig & {
    parameters?: Partial<VideoBeatParameters>;
  } & Partial<VideoBeatParameters>) {
    super(config);
    this.videoFile = config.videoFile || config.parameters?.videoFile || '';
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.controls = config.controls ?? config.parameters?.controls ?? true;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
  }

  getParameters(): Record<string, any> {
    return {
      videoFile: this.videoFile,
      autoplay: this.autoplay,
      controls: this.controls,
      skipButton: this.skipButton
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.videoFile !== undefined) this.videoFile = params.videoFile;
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.controls !== undefined) this.controls = params.controls;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
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

    if (!this.videoFile) {
      console.error(`VideoBeat ${this.id} has no video file specified`);
      return this.getNextBeat(context);
    }

    try {
      // Create video element and configure
      const video = document.createElement('video');
      video.src = this.videoFile;
      video.autoplay = this.autoplay;
      video.controls = this.controls;
      video.style.width = '100%';
      video.style.height = 'auto';
      
      // Clear renderer and add video
      renderer.clear();
      const container = document.getElementById('story-container');
      if (container) {
        container.appendChild(video);
        
        // Add skip button if enabled
        if (this.skipButton) {
          const skipBtn = document.createElement('button');
          skipBtn.textContent = 'Skip';
          skipBtn.className = 'skip-video-btn';
          skipBtn.onclick = () => {
            video.remove();
            skipBtn.remove();
          };
          container.appendChild(skipBtn);
        }
      }

      // Wait for video to end or be skipped
      return new Promise((resolve) => {
        video.onended = () => {
          video.remove();
          resolve(this.getNextBeat(context));
        };
        
        video.onerror = () => {
          console.error(`Failed to load video: ${this.videoFile}`);
          video.remove();
          resolve(this.getNextBeat(context));
        };
      });
      
    } catch (error) {
      console.error(`Error playing video in beat ${this.id}:`, error);
      return this.getNextBeat(context);
    }
  }
}
