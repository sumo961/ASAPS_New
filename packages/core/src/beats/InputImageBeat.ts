import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { InputImageParameters } from '../generated/beat-types';

/**
 * InputImageBeat - Lets the player submit a photo (camera capture or file
 * upload). The image is sent to the configured AI service's vision model
 * together with the author's analysisPrompt; the AI's answer text is
 * stored in a story variable, then the beat continues to its target.
 *
 * The image itself is never persisted — only the analysis text. Free-text
 * mode only (v1); authors branch on the result with a downstream
 * aiCondition/condition beat.
 */
export class InputImageBeat extends Beat {
  public prompt: string;
  public analysisPrompt: string;
  public saveTo: string;
  public imageSource: 'upload' | 'camera' | 'both';
  public buttonText: string;
  public cancelButtonText: string;
  public fallbackValue: string;
  public timeout: number;
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<InputImageParameters>;
  } & Partial<InputImageParameters>) {
    super(config);

    const p = config.parameters ?? ({} as Partial<InputImageParameters>);
    this.prompt = config.prompt || p.prompt || 'Take or choose a photo:';
    this.analysisPrompt = (config as any).analysisPrompt || p.analysisPrompt
      || 'Describe what is shown in this image in one or two sentences.';
    this.saveTo = (config as any).saveTo || (p as any).saveTo || 'imageAnalysis';
    const source = (config as any).imageSource ?? p.imageSource;
    this.imageSource = source === 'upload' || source === 'camera' ? source : 'both';
    this.buttonText = (config as any).buttonText || p.buttonText || 'Analyze';
    this.cancelButtonText = (config as any).cancelButtonText || p.cancelButtonText || 'Skip';
    this.fallbackValue = (config as any).fallbackValue ?? p.fallbackValue ?? '';
    this.timeout = (config as any).timeout ?? p.timeout ?? 30000;
    this.node = config.node || (p as any).node;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      analysisPrompt: this.analysisPrompt,
      saveTo: this.saveTo,
      imageSource: this.imageSource,
      buttonText: this.buttonText,
      cancelButtonText: this.cancelButtonText,
      fallbackValue: this.fallbackValue,
      timeout: this.timeout,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.analysisPrompt !== undefined) this.analysisPrompt = params.analysisPrompt;
    if (params.saveTo !== undefined) this.saveTo = params.saveTo;
    if (params.imageSource !== undefined) {
      this.imageSource = params.imageSource === 'upload' || params.imageSource === 'camera'
        ? params.imageSource : 'both';
    }
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.fallbackValue !== undefined) this.fallbackValue = params.fallbackValue;
    if (params.timeout !== undefined) this.timeout = params.timeout;
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Renderers without image-input support get a clean fallthrough —
    // the beat stores the fallback and advances rather than hanging.
    if (!renderer.renderInputImage) {
      console.warn(`[InputImageBeat ${this.id}] renderer.renderInputImage unavailable; skipping`);
      this.storeResult(context, this.fallbackValue);
      return this.getNextBeat(context);
    }

    const processedPrompt = this.processText(this.prompt, context);
    const locations = Array.from(this.locations.values());

    const result = await renderer.renderInputImage(
      processedPrompt,
      {
        imageSource: this.imageSource,
        buttonText: this.buttonText,
        cancelButtonText: this.cancelButtonText,
      },
      locations
    );

    if (result === 'cancelled') {
      console.log(`[InputImageBeat ${this.id}] player skipped image input`);
      this.storeResult(context, this.fallbackValue);
      context.recordTimelineEvent({
        type: 'choice',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'inputImage',
        text: 'Skipped image input',
      });
      return this.getNextBeat(context);
    }

    // The renderer resolves with a data URL: data:<mediaType>;base64,<data>
    const parsed = this.parseDataUrl(result);
    if (!parsed) {
      console.warn(`[InputImageBeat ${this.id}] unexpected renderer result; using fallback`);
      this.storeResult(context, this.fallbackValue);
      return this.getNextBeat(context);
    }

    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.analyzeImage !== 'function') {
      console.warn(`[InputImageBeat ${this.id}] AI service has no image analysis; using fallback`);
      this.storeResult(context, this.fallbackValue);
      return this.getNextBeat(context);
    }

    try {
      renderer.renderLoading?.('Analyzing image...', { subMessage: 'This may take a moment' });

      const analysis = await Promise.race([
        aiService.analyzeImage(
          { base64: parsed.base64, mediaType: parsed.mediaType },
          this.processText(this.analysisPrompt, context)
        ),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        ),
      ]);

      renderer.hideLoading?.();

      const text = typeof analysis === 'string' ? analysis.trim() : '';
      console.log(`[InputImageBeat ${this.id}] saving analysis to variable "${this.saveTo}"`);
      this.storeResult(context, text || this.fallbackValue);

      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'inputImage',
        choiceText: `Submitted an image; AI analysis: ${text.slice(0, 200)}`,
        choiceContext: this.prompt,
      });
    } catch (error) {
      renderer.hideLoading?.();
      console.error(`[InputImageBeat ${this.id}] image analysis failed:`, error);
      this.storeResult(context, this.fallbackValue);
    }

    return this.getNextBeat(context);
  }

  private storeResult(context: StoryContext, value: string): void {
    if (this.saveTo) {
      context.setVariable(this.saveTo, value);
    }
  }

  private parseDataUrl(value: string): { base64: string; mediaType: string } | null {
    const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
    if (!match) return null;
    return { mediaType: match[1], base64: match[2] };
  }
}
