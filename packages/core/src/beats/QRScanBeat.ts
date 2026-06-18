import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { QrScanParameters } from '../generated/beat-types';
import { parseAsapsUri } from '../utils/asapsUri';

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
  public interpretAsapsUri: boolean;
  public facing: 'rear' | 'front';
  public matchPatterns: string[];
  public helperText?: string;
  public cancelButtonText: string;
  public backgroundSound?: string;
  /** Authoring metadata only (not used at runtime): beat IDs that printed
   *  asaps://beat/<id> QR codes jump to. Persisted so the flowchart can draw
   *  these otherwise-invisible jumps as dashed edges. */
  public qrJumpTargets: string[];

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<QrScanParameters>;
  } & Partial<QrScanParameters>) {
    super(config);

    const p = config.parameters ?? ({} as Partial<QrScanParameters>);
    this.prompt = config.prompt || p.prompt || 'Point your camera at the QR code';
    this.saveTo = (config as any).saveTo || (p as any).saveTo || 'scannedCode';
    const iau = (config as any).interpretAsapsUri ?? (p as any).interpretAsapsUri;
    this.interpretAsapsUri = iau !== false; // default true
    const facing = (config as any).facing ?? p.facing;
    this.facing = facing === 'front' ? 'front' : 'rear';
    this.matchPatterns = Array.isArray((config as any).matchPatterns)
      ? (config as any).matchPatterns
      : Array.isArray(p.matchPatterns) ? p.matchPatterns : [];
    this.helperText = (config as any).helperText ?? p.helperText;
    this.cancelButtonText = (config as any).cancelButtonText || p.cancelButtonText || 'Skip';
    this.qrJumpTargets = Array.isArray((config as any).qrJumpTargets)
      ? (config as any).qrJumpTargets
      : Array.isArray((p as any).qrJumpTargets) ? (p as any).qrJumpTargets : [];
    this.node = config.node || (p as any).node;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      saveTo: this.saveTo,
      interpretAsapsUri: this.interpretAsapsUri,
      facing: this.facing,
      matchPatterns: this.matchPatterns,
      helperText: this.helperText,
      cancelButtonText: this.cancelButtonText,
      qrJumpTargets: this.qrJumpTargets,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.saveTo !== undefined) this.saveTo = params.saveTo;
    if (params.interpretAsapsUri !== undefined) this.interpretAsapsUri = params.interpretAsapsUri !== false;
    if (params.facing !== undefined) {
      this.facing = params.facing === 'front' ? 'front' : 'rear';
    }
    if (params.matchPatterns !== undefined) {
      this.matchPatterns = Array.isArray(params.matchPatterns) ? params.matchPatterns : [];
    }
    if (params.helperText !== undefined) this.helperText = params.helperText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.qrJumpTargets !== undefined) {
      this.qrJumpTargets = Array.isArray(params.qrJumpTargets) ? params.qrJumpTargets : [];
    }
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

    // ASAPS URI interpretation — when the QR encodes a story-level
    // intent (asaps://beat/<id>, asaps://variable/<n>/<v>, etc.) apply
    // it directly instead of forcing the author to write a routing
    // ConditionBeat. Non-ASAPS payloads (or interpretAsapsUri:false)
    // fall through to the standard save-to-variable + branch path
    // below — existing usage stays unchanged.
    if (this.interpretAsapsUri) {
      const parsed = parseAsapsUri(result);
      if (parsed) {
        context.recordChoice({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'qrScan',
          choiceText: `Scanned ASAPS URI: ${result}`,
          choiceContext: this.prompt,
        });
        switch (parsed.kind) {
          case 'beat':
            // Direct jump — overrides the beat's configured next target.
            // The story engine validates the target id exists.
            return parsed.target;
          case 'variable':
            context.setVariable(parsed.name, parsed.value);
            return this.getNextBeat(context);
          case 'inventory':
            if (parsed.op === 'add') context.addToInventory(parsed.item);
            else context.removeFromInventory(parsed.item);
            return this.getNextBeat(context);
          case 'event':
            // Events surface in the AI/timeline context but don't have
            // a runtime dispatch yet. recordTimelineEvent above already
            // captured the URI; continue to next beat.
            return this.getNextBeat(context);
        }
      }
      // Parser returned null — fall through to raw-string save path.
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
