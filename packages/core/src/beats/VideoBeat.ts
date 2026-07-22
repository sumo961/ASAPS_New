import { Beat } from './Beat';
import type { BeatConfig, VideoCaption } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { VideoBeatParameters } from '../generated/beat-types';


export class VideoBeat extends Beat {
  public videoFile: string;
  public videoAssetId?: string;
  public autoplay: boolean;
  public controls: boolean;
  public skipButton: boolean;
  /** Caption/subtitle cues (start/end seconds + text; displayText per language). */
  public captions: VideoCaption[];
  public captionsEnabled: boolean;
  /** Per-language alternate video, resolved to videoAssetId at the data layer. */
  public videoTranslations?: Record<string, { videoAssetId?: string }>;

  constructor(config: BeatConfig & {
    parameters?: Partial<VideoBeatParameters>;
  } & Partial<VideoBeatParameters>) {
    super(config);
    this.videoFile = config.videoFile || config.parameters?.videoFile || '';
    this.videoAssetId = config.videoAssetId || config.parameters?.videoAssetId;
    this.autoplay = config.autoplay ?? config.parameters?.autoplay ?? true;
    this.controls = config.controls ?? config.parameters?.controls ?? true;
    this.skipButton = config.skipButton ?? config.parameters?.skipButton ?? true;
    const rawCaptions = (config as any).captions ?? config.parameters?.captions ?? [];
    this.captions = Array.isArray(rawCaptions) ? (rawCaptions as VideoCaption[]) : [];
    this.captionsEnabled = config.parameters?.captionsEnabled ?? (config as any).captionsEnabled ?? true;
    this.videoTranslations = (config as any).videoTranslations ?? config.parameters?.videoTranslations;
  }

  getParameters(): Record<string, any> {
    return {
      videoFile: this.videoFile,
      videoAssetId: this.videoAssetId,
      autoplay: this.autoplay,
      controls: this.controls,
      skipButton: this.skipButton,
      captions: this.captions,
      captionsEnabled: this.captionsEnabled,
      videoTranslations: this.videoTranslations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.videoFile !== undefined) this.videoFile = params.videoFile;
    if (params.videoAssetId !== undefined) this.videoAssetId = params.videoAssetId;
    if (params.autoplay !== undefined) this.autoplay = params.autoplay;
    if (params.controls !== undefined) this.controls = params.controls;
    if (params.skipButton !== undefined) this.skipButton = params.skipButton;
    if (params.captions !== undefined) this.captions = Array.isArray(params.captions) ? params.captions : [];
    if (params.captionsEnabled !== undefined) this.captionsEnabled = params.captionsEnabled;
    if (params.videoTranslations !== undefined) this.videoTranslations = params.videoTranslations;
    if (params.node !== undefined) this.node = params.node;
  }

  /**
   * Resolve caption cues for playback: use the translated `displayText` when
   * present (active non-source language), else the source `text`. Empty/blank
   * cues and non-finite times are dropped so the generated VTT stays valid.
   */
  private resolvedCaptions(): Array<{ start: number; end: number; text: string }> {
    if (!this.captionsEnabled || !Array.isArray(this.captions)) return [];
    return this.captions
      .map(c => ({
        start: Number(c.start) || 0,
        end: Number(c.end) || 0,
        text: (c.displayText || c.text || '').trim(),
      }))
      .filter(c => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
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
      await renderer.renderVideo(videoUrl, this.autoplay, this.controls, locations, this.skipButton, this.resolvedCaptions());
    } catch (error) {
      console.error(`Error playing video in beat ${this.id}:`, error);
    }

    return this.getNextBeat(context);
  }
}
