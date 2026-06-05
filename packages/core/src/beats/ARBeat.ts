import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { ArBeatParameters } from '../generated/beat-types';
import { parseAsapsUri } from '../utils/asapsUri';

/**
 * ARBeat — augmented-reality scene. The player aims the camera at a
 * printed marker (or, in Phase 2, scans the world); overlay anchors
 * attached to the marker are tappable. Each anchor's onTap value is
 * either a bare target beat id or an `asaps://` URI — the beat applies
 * it directly so authors get tap-to-discover behavior without writing
 * routing ConditionBeats.
 *
 * Phase 1 supports marker tracking via MindAR (lazy-loaded in the
 * renderer). Phase 2 extends to world/face tracking + 3D model
 * anchors; the schema reserves the verbs.
 */
export interface ARAnchor {
  id: string;
  label?: string;
  assetId?: string;
  anchoredTo?: string;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  onTap?: string;
}

export class ARBeat extends Beat {
  public prompt: string;
  public trackingMode: 'marker' | 'world' | 'face';
  public markerAssetId?: string;
  public anchors: ARAnchor[];
  public cancelButtonText: string;
  public fallbackTarget?: string;
  public backgroundSound?: string;

  constructor(config: BeatConfig & {
    node?: string;
    parameters?: Partial<ArBeatParameters>;
  } & Partial<ArBeatParameters>) {
    super(config);
    const p = config.parameters ?? ({} as Partial<ArBeatParameters>);
    this.prompt = (config as any).prompt || p.prompt || 'Aim your camera at the marker';
    const tm = (config as any).trackingMode ?? p.trackingMode;
    this.trackingMode = (tm === 'world' || tm === 'face') ? tm : 'marker';
    this.markerAssetId = (config as any).markerAssetId ?? p.markerAssetId;
    this.anchors = Array.isArray((config as any).anchors)
      ? (config as any).anchors
      : Array.isArray(p.anchors) ? (p.anchors as ARAnchor[]) : [];
    this.cancelButtonText = (config as any).cancelButtonText || p.cancelButtonText || 'Skip';
    this.fallbackTarget = (config as any).fallbackTarget ?? p.fallbackTarget;
    this.node = config.node || (p as any).node;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      trackingMode: this.trackingMode,
      markerAssetId: this.markerAssetId,
      anchors: this.anchors,
      cancelButtonText: this.cancelButtonText,
      fallbackTarget: this.fallbackTarget,
      node: this.node,
      slotIntent: this.slotIntent,
      slotAnimations: this.slotAnimations,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.trackingMode !== undefined) {
      const tm = params.trackingMode;
      this.trackingMode = (tm === 'world' || tm === 'face') ? tm : 'marker';
    }
    if (params.markerAssetId !== undefined) this.markerAssetId = params.markerAssetId;
    if (params.anchors !== undefined) {
      this.anchors = Array.isArray(params.anchors) ? params.anchors : [];
      // Rebuild connections from anchors so the graph wiring stays in
      // sync — same pattern as movementChoice/pickProp. An anchor's
      // onTap can be either a bare beat id or an asaps:// URI; only
      // bare beat ids create graph edges (URIs are resolved at
      // runtime by parseAsapsUri).
      this.clearConnections();
      for (const a of this.anchors) {
        if (a.onTap && !a.onTap.startsWith('asaps://')) {
          this.addConnection({ targetId: a.onTap, label: a.label || a.id });
        }
      }
    }
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.fallbackTarget !== undefined) this.fallbackTarget = params.fallbackTarget;
    if (params.node !== undefined) this.node = params.node;
    if (params.slotIntent !== undefined) this.slotIntent = params.slotIntent;
    if (params.slotAnimations !== undefined) this.slotAnimations = params.slotAnimations;
  }

  /**
   * Override getConnections to expose anchor.onTap targets — the
   * routing logic mirrors movementChoice but understands the bare-id
   * vs asaps:// URI split (URIs don't create graph edges).
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    for (const a of this.anchors) {
      if (a.onTap && !a.onTap.startsWith('asaps://')) {
        connections.push({ targetId: a.onTap, label: a.label || a.id });
      }
    }
    if (this.fallbackTarget) {
      connections.push({ targetId: this.fallbackTarget, label: 'Skip / no anchor' });
    }
    const base = super.getConnections();
    for (const conn of base) {
      if (!connections.some(c => c.targetId === conn.targetId && c.label === conn.label)) {
        connections.push(conn);
      }
    }
    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!renderer.renderAR) {
      console.warn(`[ARBeat ${this.id}] renderer.renderAR unavailable; skipping`);
      return this.fallbackTarget || this.getNextBeat(context);
    }

    const processedPrompt = this.processText(this.prompt, context);
    const locations = Array.from(this.locations.values());

    // Asset ids are passed through; the renderer resolves them via its
    // registered asset resolver (same shape as PanoramaBeat). This
    // keeps platform-specific resolution (web blob URLs vs native
    // bundle paths) inside the renderer.
    const anchorsForRenderer = this.anchors.map(a => ({
      id: a.id,
      label: a.label ? this.processText(a.label, context) : undefined,
      assetId: a.assetId,
      anchoredTo: a.anchoredTo,
      offsetX: a.offsetX,
      offsetY: a.offsetY,
      scale: a.scale,
      onTap: a.onTap,
    }));

    const result = await renderer.renderAR(
      {
        prompt: processedPrompt,
        trackingMode: this.trackingMode,
        markerAssetId: this.markerAssetId,
        anchors: anchorsForRenderer,
        cancelButtonText: this.cancelButtonText,
      },
      locations
    );

    if (result === 'cancelled' || result === 'permission_denied') {
      context.recordTimelineEvent({
        type: 'choice',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'arBeat',
        text: result === 'cancelled' ? 'Skipped AR scene' : 'Camera permission denied',
      });
      return this.fallbackTarget || this.getNextBeat(context);
    }

    // result is the tapped anchor's onTap value. Apply ASAPS URI logic
    // (same as qrScan) — direct beat jump, variable set, inventory op,
    // event — or fall through to treating it as a bare beat id.
    const parsed = parseAsapsUri(result);
    if (parsed) {
      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'arBeat',
        choiceText: `Tapped anchor (ASAPS): ${result}`,
        choiceContext: this.prompt,
      });
      switch (parsed.kind) {
        case 'beat':
          return parsed.target;
        case 'variable':
          context.setVariable(parsed.name, parsed.value);
          return this.getNextBeat(context);
        case 'inventory':
          if (parsed.op === 'add') context.addToInventory(parsed.item);
          else context.removeFromInventory(parsed.item);
          return this.getNextBeat(context);
        case 'event':
          return this.getNextBeat(context);
      }
    }

    // Bare beat id from the anchor's onTap (or any other non-URI).
    context.recordChoice({
      beatId: this.id,
      beatName: this.name || this.id,
      beatType: 'arBeat',
      choiceText: `Tapped anchor: ${result}`,
      choiceContext: this.prompt,
    });
    return result;
  }
}
