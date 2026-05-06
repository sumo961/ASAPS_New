/**
 * IndoorLocationBeat (v0.9.49+) — second XR beat, indoor-positioning twin
 * of GpsLocationBeat.
 *
 * Renders a floor-plan UI showing a target Bluetooth beacon and, in
 * trigger modes, waits for the player to walk into (or out of) a
 * radius around that beacon. The renderer reads beacon definitions
 * (UUID + display name + x/y on the floor plan) from
 * `globalSettings.location.venue.beacons` and live BeaconReadings from
 * the StoryContext's SensorService.
 *
 * Symmetric with GpsLocationBeat — same three modes, same five
 * resolution paths, same permission-policy integration. The only
 * differences are the sensor type (beacons vs GPS) and the rendering
 * surface (floor-plan image vs Leaflet map).
 *
 * Resolution paths (renderer returns one of these):
 *   - 'arrived'   — player walked within radiusMeters of the target beacon
 *   - 'departed'  — player walked beyond radiusMeters (trigger-on-departure)
 *   - 'continue'  — player clicked the continue button (display mode)
 *   - 'timeout'   — the optional timeout elapsed
 *   - 'skipped'   — player explicitly skipped the beat
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { ensureXRPermission } from '../utils/xrPermissions';

export interface IndoorLocationBeatParameters {
  /** Behaviour mode. Default: 'display'. */
  mode?: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  /** Target beacon UUID — must match a beacon defined in venue.beacons. */
  targetBeaconUuid?: string;
  /**
   * Proximity radius in metres. Defaults to the project's
   * `LocationSettings.defaultProximityRadiusM` if set, else 5m
   * (room-scale by default — indoor proximity is tighter than GPS).
   */
  radiusMeters?: number;
  /** Instructional text shown over the floor plan. */
  text?: string;
  /** Continue button label (display mode). */
  buttonText?: string;
  /** Optional explicit skip / cancel button label. */
  cancelButtonText?: string;
  /** Timeout in milliseconds — beat resolves with 'timeout' if no other resolution fires. */
  timeoutMs?: number;
}

export class IndoorLocationBeat extends Beat {
  public mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  public targetBeaconUuid?: string;
  public radiusMeters?: number;
  public text?: string;
  public buttonText?: string;
  public cancelButtonText?: string;
  public timeoutMs?: number;

  constructor(config: BeatConfig & {
    parameters?: Partial<IndoorLocationBeatParameters>;
  } & Partial<IndoorLocationBeatParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<IndoorLocationBeatParameters>;
    this.mode = (config as any).mode ?? p.mode ?? 'display';
    this.targetBeaconUuid = (config as any).targetBeaconUuid ?? p.targetBeaconUuid;
    this.radiusMeters = (config as any).radiusMeters ?? p.radiusMeters;
    this.text = (config as any).text ?? p.text;
    this.buttonText = (config as any).buttonText ?? p.buttonText;
    this.cancelButtonText = (config as any).cancelButtonText ?? p.cancelButtonText;
    this.timeoutMs = (config as any).timeoutMs ?? p.timeoutMs;
  }

  getParameters(): Record<string, any> {
    return {
      mode: this.mode,
      ...(this.targetBeaconUuid !== undefined ? { targetBeaconUuid: this.targetBeaconUuid } : {}),
      ...(this.radiusMeters !== undefined ? { radiusMeters: this.radiusMeters } : {}),
      ...(this.text !== undefined ? { text: this.text } : {}),
      ...(this.buttonText !== undefined ? { buttonText: this.buttonText } : {}),
      ...(this.cancelButtonText !== undefined ? { cancelButtonText: this.cancelButtonText } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.mode !== undefined) this.mode = params.mode;
    if (params.targetBeaconUuid !== undefined) this.targetBeaconUuid = params.targetBeaconUuid;
    if (params.radiusMeters !== undefined) this.radiusMeters = params.radiusMeters;
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.timeoutMs !== undefined) this.timeoutMs = params.timeoutMs;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer,
  ): Promise<string | null> {
    const story = (context as any).getStory?.();
    const locationSettings = (story as any)?.getSettings?.()?.location as
      | {
          onPermissionDenied?: 'skip' | 'fallback';
          fallbackBeatId?: string;
          defaultProximityRadiusM?: number;
          venue?: {
            name?: string;
            floorPlan?: string;
            floorWidth: number;
            floorHeight: number;
            beacons?: Array<{ uuid: string; displayName?: string; x: number; y: number }>;
          };
        }
      | undefined;

    // Permission probe — trigger modes need beacon scanning permission.
    if (this.mode !== 'display') {
      const verdict = await ensureXRPermission(context, ['beacons'], {
        onDenied: locationSettings?.onPermissionDenied,
      });
      if (verdict === 'fallback') {
        const fallback = locationSettings?.fallbackBeatId;
        if (fallback) {
          console.log(`[IndoorLocationBeat ${this.id}] beacon permission denied — falling back to ${fallback}`);
          return fallback;
        }
        console.warn(`[IndoorLocationBeat ${this.id}] beacon permission denied and no fallbackBeatId — advancing`);
        return this.getNextBeat(context);
      }
      if (verdict === 'skip') {
        console.log(`[IndoorLocationBeat ${this.id}] beacon permission denied — skipping`);
        return this.getNextBeat(context);
      }
    }

    if (!this.targetBeaconUuid) {
      console.warn(`[IndoorLocationBeat ${this.id}] missing targetBeaconUuid — skipping`);
      return this.getNextBeat(context);
    }

    // Indoor radius defaults are tighter than outdoor — 5m room-scale.
    const radius = this.radiusMeters ?? locationSettings?.defaultProximityRadiusM ?? 5;

    // Start beacon-cache watcher so renderer + downstream conditions see fresh reads.
    const unsubscribe = context.getSensorService().ensureBeaconCacheActive();

    // Push sensor service into renderer state for the floor-plan component.
    (renderer as any).setState?.('sensorService', context.getSensorService());

    try {
      if (!renderer.renderIndoorMap) {
        console.warn(`[IndoorLocationBeat ${this.id}] renderer doesn't implement renderIndoorMap — advancing`);
        return this.getNextBeat(context);
      }
      const venue = locationSettings?.venue
        ? {
            name: locationSettings.venue.name,
            floorPlanAssetId: locationSettings.venue.floorPlan,
            floorWidth: locationSettings.venue.floorWidth,
            floorHeight: locationSettings.venue.floorHeight,
          }
        : undefined;
      const result = await renderer.renderIndoorMap({
        mode: this.mode,
        targetBeaconUuid: this.targetBeaconUuid,
        radiusMeters: radius,
        text: this.text,
        buttonText: this.buttonText,
        cancelButtonText: this.cancelButtonText,
        timeoutMs: this.timeoutMs,
        venue,
        beacons: locationSettings?.venue?.beacons,
      });
      console.log(`[IndoorLocationBeat ${this.id}] resolved with: ${result}`);
    } finally {
      unsubscribe();
    }

    return this.getNextBeat(context);
  }
}
