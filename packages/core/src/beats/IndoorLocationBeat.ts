/**
 * IndoorLocationBeat (v0.9.49+) — multi-location indoor twin of
 * GpsLocationBeat. Each location references a beacon UUID; the beat
 * resolves on first crossing, fires that location's Effects, and
 * advances to its target.
 *
 * Modes mirror GpsLocationBeat. Backward compatibility kept via the
 * legacy `targetBeaconUuid` field — beats authored with the v0.9.49
 * single-target form synthesize a one-element location array at runtime.
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer, Effect, XRLocationEntry } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { ensureXRPermission } from '../utils/xrPermissions';

export interface IndoorLocationBeatParameters {
  mode?: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  /**
   * Multi-location array. Each entry has a beaconUuid + target + effects.
   * Named `xrLocations` (not `locations`) to avoid clashing with
   * BeatConfig.locations.
   */
  xrLocations?: XRLocationEntry[];
  /** Display-mode continue / timeout / skip target. */
  defaultTarget?: string;
  /** Beat-level radius default — used when a location doesn't override. */
  radiusMeters?: number;
  text?: string;
  buttonText?: string;
  cancelButtonText?: string;
  timeoutMs?: number;
  /** @deprecated use `locations[0].beaconUuid`. Kept for backward compat. */
  targetBeaconUuid?: string;
}

export class IndoorLocationBeat extends Beat {
  public mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  // Renamed from `locations` to avoid clashing with Beat.locations
  // (the legacy Map<string, Location> on the base class). Serialized
  // parameter key is still `locations`.
  public xrLocations?: XRLocationEntry[];
  public defaultTarget?: string;
  public radiusMeters?: number;
  public text?: string;
  public buttonText?: string;
  public cancelButtonText?: string;
  public timeoutMs?: number;
  public targetBeaconUuid?: string;

  constructor(config: BeatConfig & {
    parameters?: Partial<IndoorLocationBeatParameters>;
  } & Partial<IndoorLocationBeatParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<IndoorLocationBeatParameters>;
    this.mode = (config as any).mode ?? p.mode ?? 'display';
    this.xrLocations = (config as any).xrLocations ?? p.xrLocations;
    this.defaultTarget = (config as any).defaultTarget ?? p.defaultTarget;
    this.radiusMeters = (config as any).radiusMeters ?? p.radiusMeters;
    this.text = (config as any).text ?? p.text;
    this.buttonText = (config as any).buttonText ?? p.buttonText;
    this.cancelButtonText = (config as any).cancelButtonText ?? p.cancelButtonText;
    this.timeoutMs = (config as any).timeoutMs ?? p.timeoutMs;
    this.targetBeaconUuid = (config as any).targetBeaconUuid ?? p.targetBeaconUuid;
  }

  getParameters(): Record<string, any> {
    return {
      mode: this.mode,
      ...(this.xrLocations !== undefined ? { xrLocations: this.xrLocations } : {}),
      ...(this.defaultTarget !== undefined ? { defaultTarget: this.defaultTarget } : {}),
      ...(this.radiusMeters !== undefined ? { radiusMeters: this.radiusMeters } : {}),
      ...(this.text !== undefined ? { text: this.text } : {}),
      ...(this.buttonText !== undefined ? { buttonText: this.buttonText } : {}),
      ...(this.cancelButtonText !== undefined ? { cancelButtonText: this.cancelButtonText } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      ...(this.targetBeaconUuid !== undefined ? { targetBeaconUuid: this.targetBeaconUuid } : {}),
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.mode !== undefined) this.mode = params.mode;
    if (params.xrLocations !== undefined) this.xrLocations = params.xrLocations;
    if (params.defaultTarget !== undefined) this.defaultTarget = params.defaultTarget;
    if (params.radiusMeters !== undefined) this.radiusMeters = params.radiusMeters;
    if (params.text !== undefined) this.text = params.text;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.cancelButtonText !== undefined) this.cancelButtonText = params.cancelButtonText;
    if (params.timeoutMs !== undefined) this.timeoutMs = params.timeoutMs;
    if (params.targetBeaconUuid !== undefined) this.targetBeaconUuid = params.targetBeaconUuid;
  }

  private getEffectiveLocations(): XRLocationEntry[] {
    if (this.xrLocations && this.xrLocations.length > 0) return this.xrLocations;
    if (this.targetBeaconUuid) {
      return [{
        id: 'legacy',
        beaconUuid: this.targetBeaconUuid,
        radiusMeters: this.radiusMeters,
        target: '',
      }];
    }
    return [];
  }

  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    const seen = new Set<string>();
    if (this.xrLocations) {
      for (const loc of this.xrLocations) {
        if (loc.target && !seen.has(loc.target)) {
          connections.push({ targetId: loc.target, label: loc.name || loc.id });
          seen.add(loc.target);
        }
      }
    }
    if (this.defaultTarget && !seen.has(this.defaultTarget)) {
      connections.push({ targetId: this.defaultTarget, label: 'Default' });
      seen.add(this.defaultTarget);
    }
    for (const conn of super.getConnections()) {
      if (!seen.has(conn.targetId)) {
        connections.push(conn);
        seen.add(conn.targetId);
      }
    }
    return connections;
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

    if (this.mode !== 'display') {
      const verdict = await ensureXRPermission(context, ['beacons'], {
        onDenied: locationSettings?.onPermissionDenied,
      });
      if (verdict === 'fallback') {
        const fallback = locationSettings?.fallbackBeatId;
        if (fallback) return fallback;
        return this.getNextBeat(context);
      }
      if (verdict === 'skip') return this.getNextBeat(context);
    }

    const effective = this.getEffectiveLocations();
    if (effective.length === 0) {
      console.warn(`[IndoorLocationBeat ${this.id}] no locations configured — skipping`);
      return this.getNextBeat(context);
    }
    const valid = effective.filter((l) => !!l.beaconUuid);
    if (valid.length === 0) {
      console.warn(`[IndoorLocationBeat ${this.id}] no valid beaconUuid on any location — skipping`);
      return this.getNextBeat(context);
    }

    const projectDefault = locationSettings?.defaultProximityRadiusM ?? 5;
    const renderLocations = valid.map((loc) => ({
      id: loc.id,
      name: loc.name,
      beaconUuid: loc.beaconUuid!,
      radiusMeters: loc.radiusMeters ?? this.radiusMeters ?? projectDefault,
    }));

    const unsubscribe = context.getSensorService().ensureBeaconCacheActive();
    (renderer as any).setState?.('sensorService', context.getSensorService());

    let result: { path: string; locationId?: string };
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
      result = await renderer.renderIndoorMap({
        mode: this.mode,
        locations: renderLocations,
        text: this.text,
        buttonText: this.buttonText,
        cancelButtonText: this.cancelButtonText,
        timeoutMs: this.timeoutMs,
        venue,
        beacons: locationSettings?.venue?.beacons,
      });
    } finally {
      unsubscribe();
    }

    if (result.locationId) {
      const matched = valid.find((l) => l.id === result.locationId);
      if (matched) {
        if (matched.effects && matched.effects.length > 0) {
          for (const eff of matched.effects) {
            try { context.applyEffect(eff as Effect); }
            catch (err) { console.warn(`[IndoorLocationBeat ${this.id}] applyEffect failed:`, err); }
          }
        }
        if (matched.target) return matched.target;
      }
    }

    if (this.defaultTarget) return this.defaultTarget;
    return this.getNextBeat(context);
  }
}
