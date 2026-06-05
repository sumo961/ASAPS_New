import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { QrScanParameters } from '../generated/beat-types';

/**
 * QRScanBeat - Opens the camera and waits for the player to scan a QR
 * code. The decoded string is stored in a story variable, then the beat
 * continues to its target.
 *
 * Phase 1 of the camera/AR work — establishes the `camera` slot role and
 * IPermissionManager flow that the AR beat will reuse.
 */
export class QRScanBeat extends Beat {
  public prompt: string;
  public saveTo: string;
  public facing: 'rear' | 'front';
  public matchPatterns: string[];
  public helperText?: string;
  public cancelButtonText: string;
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<QrScanParameters>;
  } & Partial<QrScanParameters>) {
    super(config);

    const p = config.parameters ?? ({} as Partial<QrScanParameters>);
    this.prompt = config.prompt || p.prompt || 'Point your camera at the QR code';
    this.saveTo = (config as any).saveTo || (p as any).saveTo || 'scannedCode';
    const facing = (config as any).facing ?? p.facing;
    this.facing = facing === 'front' ? 'front' : 'rear';
    this.matchPatterns = Array.isArray((config as any).matchPatterns)
      ? (config as any).matchPatterns
      : Array.isArray(p.matchPatterns) ? p.matchPatterns : [];
    this.helperText = (config as any).helperText ?? p.helperText;
    this.cancelButtonText = (config as any).cancelButtonText || p.cancelButtonText || 'Skip';
    this.node = config.node || (p as any).node;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      saveTo: this.saveTo,
      facing: this.facing,
      matchPatterns: this.matchPatterns,
      helperText: this.helperText,
      cancelButtonText: this.cancelButtonText,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.saveTo !== undefined) this.saveTo = params.saveTo;
    if (params.facing !== undefined) {
      this.facing = params.facing === 'front' ? 'front' : 'rear';
    }
    if (params.matchPatterns !== undefined) {
      this.matchPatterns = Array.isArray(params.matchPatterns) ? params.matchPatterns : [];
    }
    if (params.helperText !== undefined) this.helperText = params.helperText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Renderers that haven't yet implemented camera support get a clean
    // fallthrough — the beat just advances to its target rather than
    // hanging on an unavailable surface. Lets older players + tests
    // keep working without a camera dependency.
    if (!renderer.renderQRScan) {
      console.warn(`[QRScanBeat ${this.id}] renderer.renderQRScan unavailable; skipping scan`);
      return this.getNextBeat(context);
    }

    const processedPrompt = this.processText(this.prompt, context);
    const processedHelper = this.helperText ? this.processText(this.helperText, context) : undefined;

    const locations = Array.from(this.locations.values());

    const result = await renderer.renderQRScan(
      processedPrompt,
      {
        facing: this.facing,
        matchPatterns: this.matchPatterns.length > 0 ? this.matchPatterns : undefined,
        cancelButtonText: this.cancelButtonText,
        helperText: processedHelper,
      },
      locations
    );

    // Reserved sentinels for runtime states. Anything else is the
    // decoded payload, which gets persisted to the story variable.
    if (result === 'cancelled' || result === 'permission_denied') {
      console.log(`[QRScanBeat ${this.id}] scan ended without a code: ${result}`);
      // Still record the outcome for AI/timeline context.
      context.recordTimelineEvent({
        type: 'choice',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'qrScan',
        text: result === 'cancelled' ? 'Cancelled QR scan' : 'Camera permission denied',
      });
      return this.getNextBeat(context);
    }

    if (this.saveTo) {
      context.setVariable(this.saveTo, result);
    }

    context.recordChoice({
      beatId: this.id,
      beatName: this.name || this.id,
      beatType: 'qrScan',
      choiceText: `Scanned: ${result}`,
      choiceContext: this.prompt,
    });

    return this.getNextBeat(context);
  }
}
