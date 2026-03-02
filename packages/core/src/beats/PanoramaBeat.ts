import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { PanoramaHotspot } from '../generated/beat-types';

export class PanoramaBeat extends Beat {
  public panoramaAssetId: string;
  public projectionType: 'equirectangular' | 'cylindrical';
  public hotspots: PanoramaHotspot[];
  public initialPitch: number;
  public initialYaw: number;
  public hfov: number;
  public autoRotate: number;
  public prompt: string;
  public promptDisplay: 'static' | 'pinned';

  constructor(config: BeatConfig & {
    parameters?: Partial<{
      panoramaAssetId: string;
      projectionType: 'equirectangular' | 'cylindrical';
      hotspots: PanoramaHotspot[];
      initialPitch: number;
      initialYaw: number;
      hfov: number;
      autoRotate: number;
      prompt: string;
      promptDisplay: 'static' | 'pinned';
    }>;
  }) {
    super(config);
    this.panoramaAssetId = config.parameters?.panoramaAssetId || '';
    this.projectionType = config.parameters?.projectionType || 'equirectangular';
    this.hotspots = config.parameters?.hotspots || [];
    this.initialPitch = config.parameters?.initialPitch ?? 0;
    this.initialYaw = config.parameters?.initialYaw ?? 0;
    this.hfov = config.parameters?.hfov ?? 75;
    this.autoRotate = config.parameters?.autoRotate ?? 0;
    this.prompt = config.parameters?.prompt || '';
    this.promptDisplay = config.parameters?.promptDisplay || 'static';
  }

  getParameters(): Record<string, any> {
    return {
      panoramaAssetId: this.panoramaAssetId,
      projectionType: this.projectionType,
      hotspots: this.hotspots,
      initialPitch: this.initialPitch,
      initialYaw: this.initialYaw,
      hfov: this.hfov,
      autoRotate: this.autoRotate,
      prompt: this.prompt,
      promptDisplay: this.promptDisplay,
      node: this.node,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.panoramaAssetId !== undefined) this.panoramaAssetId = params.panoramaAssetId;
    if (params.projectionType !== undefined) this.projectionType = params.projectionType;
    if (params.hotspots !== undefined) {
      this.hotspots = params.hotspots;
      // Rebuild connections from hotspots to keep graph in sync
      this.clearConnections();
      for (const hotspot of this.hotspots) {
        if (hotspot.target) {
          this.addConnection({
            targetId: hotspot.target,
            label: hotspot.text || hotspot.id
          });
        }
      }
    }
    if (params.initialPitch !== undefined) this.initialPitch = params.initialPitch;
    if (params.initialYaw !== undefined) this.initialYaw = params.initialYaw;
    if (params.hfov !== undefined) this.hfov = params.hfov;
    if (params.autoRotate !== undefined) this.autoRotate = params.autoRotate;
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.promptDisplay !== undefined) this.promptDisplay = params.promptDisplay;
    if (params.node !== undefined) this.node = params.node;
  }

  /**
   * Override getConnections to extract connections from hotspots dynamically
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    if (this.hotspots && Array.isArray(this.hotspots)) {
      for (const hotspot of this.hotspots) {
        if (hotspot.target) {
          connections.push({
            targetId: hotspot.target,
            label: hotspot.text || hotspot.id,
            condition: hotspot.conditions
          });
        }
      }
    }

    // Also include regular connections from base class (if any)
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
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
    // Set panorama asset ID on renderer state so it can resolve the URL
    renderer.setState('panoramaAssetId', this.panoramaAssetId);
    // The renderer resolves the URL via its asset resolver (same pattern as backgroundAssetId)
    const panoramaUrl = renderer.getState('panoramaAssetUrl') || '';

    // Filter hotspots based on conditions
    const availableHotspots = this.hotspots.filter(hotspot => {
      if (!hotspot.conditions) return true;
      return hotspot.conditions.every(condition => context.checkCondition(condition));
    });

    if (availableHotspots.length === 0) {
      console.warn(`[PanoramaBeat] No available hotspots for beat ${this.id}`);
      return this.getNextBeat(context);
    }

    // Process text with variable interpolation
    const processedPrompt = this.prompt ? this.processText(this.prompt, context) : '';

    if (renderer.renderPanorama) {
      // Enrich hotspot data with visual properties from beat.locations
      const enrichedHotspots = availableHotspots.map(h => {
        const loc = this.locations.get(h.text) || this.locations.get(h.id);
        return {
          id: h.id,
          pitch: h.pitch,
          yaw: h.yaw,
          text: this.processText(h.displayText || h.text, context),
          ...(loc ? {
            width: loc.width,
            height: loc.height,
            scale: loc.scale,
            rotation: loc.rotation,
            sound: loc.sound,
          } : {}),
        };
      });

      // Collect non-hotspot locations (props, characters) for overlay rendering
      // Convert stage x,y → yaw,pitch so the renderer can position them as panorama hotspots
      // Stage dimensions default to 1024x768 (matching project defaults and VE conventions)
      const stageW = 1024;
      const stageH = 768;
      const RAD_TO_DEG = 180 / Math.PI;
      const overlayLocations = Array.from(this.locations.values())
        .filter(loc => {
          if (loc.kind === 'hotspot') return false;
          // Include text/dialog locations only in pinned mode
          if (loc.kind === 'text' || loc.kind === 'dialog') return this.promptDisplay === 'pinned';
          return true;
        })
        .map(loc => {
          const centerX = loc.x + loc.width / 2;
          const centerY = loc.y + loc.height / 2;
          // Stage → yaw/pitch conversion (same formulas as builder/panoramaCoordinates.ts)
          let yaw: number, pitch: number;
          if (this.projectionType === 'cylindrical') {
            const imgAspect = 4; // default cylindrical aspect
            const halfYawDeg = 0.5 * imgAspect * RAD_TO_DEG;
            const maxPitchDeg = Math.atan(0.5) * RAD_TO_DEG;
            yaw = halfYawDeg * (1 - 2 * centerX / stageW);
            pitch = maxPitchDeg * (1 - 2 * centerY / stageH);
          } else {
            yaw = 180 - (centerX / stageW) * 360;
            pitch = 90 - (centerY / stageH) * 180;
          }
          return { ...loc, yaw, pitch };
        });

      const selectedHotspotId = await renderer.renderPanorama(panoramaUrl, {
        hotspots: enrichedHotspots,
        initialPitch: this.initialPitch,
        initialYaw: this.initialYaw,
        hfov: this.hfov,
        projectionType: this.projectionType,
        prompt: processedPrompt,
        promptDisplay: this.promptDisplay,
        locations: overlayLocations.length > 0 ? overlayLocations : undefined,
      });

      // Find selected hotspot
      const selectedHotspot = availableHotspots.find(h => h.id === selectedHotspotId);

      if (selectedHotspot) {
        // Record choice for AI context
        context.recordChoice({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'panorama',
          choiceText: selectedHotspot.text,
          choiceContext: this.prompt || '360° panorama exploration',
        });

        // Apply effects from hotspot
        if (selectedHotspot.effects) {
          selectedHotspot.effects.forEach(effect => context.applyEffect(effect));
        }

        return selectedHotspot.target;
      }
    } else {
      console.warn(`[PanoramaBeat] Renderer does not support renderPanorama`);
    }

    return this.getNextBeat(context);
  }
}
