/**
 * GpsLocationBeat (v0.9.48 / S4+) — first XR beat.
 *
 * Renders a map UI showing a target GPS coordinate and, in trigger
 * modes, waits for the player to walk into (or out of) a radius
 * around that point. Validates the whole XR substrate landed in
 * S1+S2+S3:
 *
 *   - Reads `LocationSettings.onPermissionDenied` for the fallback
 *     policy and `defaultProximityRadiusM` for the radius default.
 *   - Probes GPS permission via `ensureXRPermission` in `onEnter`.
 *   - Subscribes to `SensorService.watchLocation` for live tracking,
 *     letting the renderer read the cache and display "you're 47m
 *     away" updates.
 *   - Uses the haversine-based `gpsProximity` semantics under the
 *     hood — the same comparison the gpsProximity Condition uses.
 *
 * Rendering is delegated to `IRenderer.renderMap`. The renderer
 * resolves with one of:
 *   - 'arrived'   — player crossed into the radius (trigger-on-arrival)
 *   - 'departed'  — player crossed out of the radius (trigger-on-departure)
 *   - 'continue'  — player clicked the continue button (display mode)
 *   - 'timeout'   — the optional timeout elapsed
 *   - 'skipped'   — player explicitly skipped the beat
 *
 * In every case the beat advances to its next-beat connection. The
 * resolution string is purely informational (logged, recorded in the
 * timeline). Stories that want to branch on "did the player arrive
 * or skip?" use a `gpsProximity` ConditionBeat afterward — same
 * sensor cache, same haversine.
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { ensureXRPermission } from '../utils/xrPermissions';

export interface GpsLocationBeatParameters {
  /** Behaviour mode. Default: 'display'. */
  mode?: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  /** Target latitude in degrees, WGS84. */
  targetLat?: number;
  /** Target longitude in degrees, WGS84. */
  targetLng?: number;
  /**
   * Proximity radius in metres. Defaults to the project's
   * `LocationSettings.defaultProximityRadiusM` if set, else 25m.
   */
  radiusMeters?: number;
  /** Instructional text shown over the map. */
  text?: string;
  /** Continue button label (display mode). */
  buttonText?: string;
  /** Optional explicit skip / cancel button label. */
  cancelButtonText?: string;
  /** Timeout in milliseconds — the beat resolves with 'timeout' if no other resolution fires. */
  timeoutMs?: number;
  /** Map visual style passed through to the renderer. */
  mapStyle?: 'streets' | 'satellite' | 'minimal';
  /** Whether to show the player's current position on the map. Default true. */
  showPlayerMarker?: boolean;
}

export class GpsLocationBeat extends Beat {
  public mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  public targetLat?: number;
  public targetLng?: number;
  public radiusMeters?: number;
  public text?: string;
  public buttonText?: string;
  public cancelButtonText?: string;
  public timeoutMs?: number;
  public mapStyle?: 'streets' | 'satellite' | 'minimal';
  public showPlayerMarker?: boolean;

  constructor(config: BeatConfig & {
    parameters?: Partial<GpsLocationBeatParameters>;
  } & Partial<GpsLocationBeatParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<GpsLocationBeatParameters>;
    this.mode = (config as any).mode ?? p.mode ?? 'display';
    this.targetLat = (config as any).targetLat ?? p.targetLat;
    this.targetLng = (config as any).targetLng ?? p.targetLng;
    this.radiusMeters = (config as any).radiusMeters ?? p.radiusMeters;
    this.text = (config as any).text ?? p.text;
    this.buttonText = (config as any).buttonText ?? p.buttonText;
    this.cancelButtonText = (config as any).cancelButtonText ?? p.cancelButtonText;
    this.timeoutMs = (config as any).timeoutMs ?? p.timeoutMs;
    this.mapStyle = (config as any).mapStyle ?? p.mapStyle;
    this.showPlayerMarker = (config as any).showPlayerMarker ?? p.showPlayerMarker;
  }

  getParameters(): Record<string, any> {
    return {
      mode: this.mode,
      ...(this.targetLat !== undefined ? { targetLat: this.targetLat } : {}),
      ...(this.targetLng !== undefined ? { targetLng: this.targetLng } : {}),
      ...(this.radiusMeters !== undefined ? { radiusMeters: this.radiusMeters } : {}),
      ...(this.text !== undefined ? { text: this.text } : {}),
      ...(this.buttonText !== undefined ? { buttonText: this.buttonText } : {}),
      ...(this.cancelButtonText !== undefined ? { cancelButtonText: this.cancelButtonText } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      ...(this.mapStyle !== undefined ? { mapStyle: this.mapStyle } : {}),
      ...(this.showPlayerMarker !== undefined ? { showPlayerMarker: this.showPlayerMarker } : {}),
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.mode !== undefined) this.mode = params.mode;
    if (params.targetLat !== undefined) this.targetLat = params.targetLat;
    if (params.targetLng !== undefined) this.targetLng = params.targetLng;
    if (params.radiusMeters !== undefined) this.radiusMeters = params.radiusMeters;
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.timeoutMs !== undefined) this.timeoutMs = params.timeoutMs;
    if (params.mapStyle !== undefined) this.mapStyle = params.mapStyle;
    if (params.showPlayerMarker !== undefined) this.showPlayerMarker = params.showPlayerMarker;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer,
  ): Promise<string | null> {
    // Read project-level XR settings for permission policy + radius default.
    const story = (context as any).getStory?.();
    const locationSettings = (story as any)?.getSettings?.()?.location as
      | { onPermissionDenied?: 'skip' | 'fallback'; fallbackBeatId?: string; defaultProximityRadiusM?: number }
      | undefined;

    // Permission probe — only meaningful in trigger modes; display mode
    // doesn't need GPS to render a map of a fixed point.
    if (this.mode !== 'display') {
      const verdict = await ensureXRPermission(context, ['gps'], {
        onDenied: locationSettings?.onPermissionDenied,
      });
      if (verdict === 'fallback') {
        const fallback = locationSettings?.fallbackBeatId;
        if (fallback) {
          console.log(`[GpsLocationBeat ${this.id}] GPS permission denied — falling back to ${fallback}`);
          return fallback;
        }
        // No fallback configured — degrade to skip.
        console.warn(`[GpsLocationBeat ${this.id}] GPS permission denied and no fallbackBeatId — advancing to next beat`);
        return this.getNextBeat(context);
      }
      if (verdict === 'skip') {
        console.log(`[GpsLocationBeat ${this.id}] GPS permission denied — skipping`);
        return this.getNextBeat(context);
      }
    }

    // Validate target coordinates. Without them there's nothing meaningful
    // to render — log and skip rather than render a beat pointing at (0,0).
    if (this.targetLat === undefined || this.targetLng === undefined) {
      console.warn(`[GpsLocationBeat ${this.id}] missing targetLat/targetLng — skipping`);
      return this.getNextBeat(context);
    }

    // Resolve the proximity radius — explicit beat value wins, then
    // project default, then 25m.
    const radius = this.radiusMeters ?? locationSettings?.defaultProximityRadiusM ?? 25;

    // Start the cache-keeping watcher so renderMap and any downstream
    // gpsProximity Condition see fresh readings. The unsubscribe runs
    // when the beat exits.
    const unsubscribe = context.getSensorService().ensureLocationCacheActive();

    // Propagate the sensor service into renderer state so the map
    // component can subscribe to live location updates without
    // needing direct StoryContext access. Mirrors how the TTS service
    // gets surfaced in PreviewWindow.
    (renderer as any).setState?.('sensorService', context.getSensorService());

    try {
      if (!renderer.renderMap) {
        console.warn(`[GpsLocationBeat ${this.id}] renderer doesn't implement renderMap — advancing`);
        return this.getNextBeat(context);
      }
      const result = await renderer.renderMap({
        mode: this.mode,
        targetLat: this.targetLat,
        targetLng: this.targetLng,
        radiusMeters: radius,
        text: this.text,
        buttonText: this.buttonText,
        cancelButtonText: this.cancelButtonText,
        timeoutMs: this.timeoutMs,
        mapStyle: this.mapStyle,
        showPlayerMarker: this.showPlayerMarker,
      });
      console.log(`[GpsLocationBeat ${this.id}] resolved with: ${result}`);
    } finally {
      unsubscribe();
    }

    return this.getNextBeat(context);
  }
}
