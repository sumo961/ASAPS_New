/**
 * GpsLocationBeat (v0.9.48 / S4+, v0.9.49 multi-location refactor).
 *
 * Map-based XR beat that lets the player walk to one of several
 * geo-anchored target points. Each location has its own next-beat
 * target and optional Effects bundle (counters, mood, sentiment, etc),
 * mirroring MovementChoice. The first location the player crosses
 * into (or out of, in trigger-on-departure mode) wins: its effects
 * fire and its target is taken.
 *
 * Modes:
 *   - 'display'             — show all locations on the map; Continue
 *                             advances to `defaultTarget`.
 *   - 'trigger-on-arrival'  — resolve on first arrival within radius.
 *   - 'trigger-on-departure'— resolve on first departure beyond radius.
 *
 * Backward compatibility: legacy beats with `targetLat/targetLng/radiusMeters`
 * but no `locations` array are read as a single-element location set,
 * so existing v0.9.48 stories keep working unchanged.
 *
 * Connection model: the beat exposes one connection per location plus
 * an optional `defaultTarget`. The graph editor renders multiple
 * outgoing edges, one per location, just like MovementChoice's choices.
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer, Effect, XRLocationEntry } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { ensureXRPermission } from '../utils/xrPermissions';

export interface GpsLocationBeatParameters {
  mode?: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  /**
   * Multi-location array (v0.9.49+). Preferred over single-target params.
   * Named `xrLocations` (rather than `locations`) to avoid clashing with
   * BeatConfig.locations — the legacy positioned-rendering Location[] on
   * the base class.
   */
  xrLocations?: XRLocationEntry[];
  /** Where to advance on display-mode Continue / timeout / skip. */
  defaultTarget?: string;
  /** Beat-level radius default — used when a location doesn't override. */
  radiusMeters?: number;
  /** Instructional text shown over the map. */
  text?: string;
  buttonText?: string;
  cancelButtonText?: string;
  timeoutMs?: number;
  mapStyle?: 'streets' | 'satellite' | 'minimal';
  showPlayerMarker?: boolean;

  // ---- legacy single-location params (v0.9.48) ----
  /** @deprecated use `locations[0].lat`. Kept for backward compat. */
  targetLat?: number;
  /** @deprecated use `locations[0].lng`. Kept for backward compat. */
  targetLng?: number;
}

export class GpsLocationBeat extends Beat {
  public mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  // Renamed from `locations` to avoid clashing with Beat.locations
  // (the legacy Map<string, Location> on the base class). The serialized
  // parameter key is still `locations`, so existing data + editor flows
  // are unchanged.
  public xrLocations?: XRLocationEntry[];
  public defaultTarget?: string;
  public radiusMeters?: number;
  public text?: string;
  public buttonText?: string;
  public cancelButtonText?: string;
  public timeoutMs?: number;
  public mapStyle?: 'streets' | 'satellite' | 'minimal';
  public showPlayerMarker?: boolean;

  // Legacy fields for backward compat with v0.9.48 single-location beats.
  public targetLat?: number;
  public targetLng?: number;

  constructor(config: BeatConfig & {
    parameters?: Partial<GpsLocationBeatParameters>;
  } & Partial<GpsLocationBeatParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<GpsLocationBeatParameters>;
    this.mode = (config as any).mode ?? p.mode ?? 'display';
    this.xrLocations = (config as any).xrLocations ?? p.xrLocations;
    this.defaultTarget = (config as any).defaultTarget ?? p.defaultTarget;
    this.radiusMeters = (config as any).radiusMeters ?? p.radiusMeters;
    this.text = (config as any).text ?? p.text;
    this.buttonText = (config as any).buttonText ?? p.buttonText;
    this.cancelButtonText = (config as any).cancelButtonText ?? p.cancelButtonText;
    this.timeoutMs = (config as any).timeoutMs ?? p.timeoutMs;
    this.mapStyle = (config as any).mapStyle ?? p.mapStyle;
    this.showPlayerMarker = (config as any).showPlayerMarker ?? p.showPlayerMarker;
    this.targetLat = (config as any).targetLat ?? p.targetLat;
    this.targetLng = (config as any).targetLng ?? p.targetLng;
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
      ...(this.mapStyle !== undefined ? { mapStyle: this.mapStyle } : {}),
      ...(this.showPlayerMarker !== undefined ? { showPlayerMarker: this.showPlayerMarker } : {}),
      // Legacy fields preserved on roundtrip so old saves don't lose info.
      ...(this.targetLat !== undefined ? { targetLat: this.targetLat } : {}),
      ...(this.targetLng !== undefined ? { targetLng: this.targetLng } : {}),
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
    if (params.mapStyle !== undefined) this.mapStyle = params.mapStyle;
    if (params.showPlayerMarker !== undefined) this.showPlayerMarker = params.showPlayerMarker;
    if (params.targetLat !== undefined) this.targetLat = params.targetLat;
    if (params.targetLng !== undefined) this.targetLng = params.targetLng;
  }

  /**
   * Effective locations array for runtime + renderer. Prefers the
   * authored `locations` array; falls back to a synthesized
   * single-element array from legacy targetLat/targetLng for
   * backward compat with v0.9.48 stories.
   */
  private getEffectiveLocations(): XRLocationEntry[] {
    if (this.xrLocations && this.xrLocations.length > 0) return this.xrLocations;
    if (this.targetLat !== undefined && this.targetLng !== undefined) {
      return [{
        id: 'legacy',
        lat: this.targetLat,
        lng: this.targetLng,
        radiusMeters: this.radiusMeters,
        target: '', // legacy beats use the regular connection — set below
      }];
    }
    return [];
  }

  /**
   * Override getConnections so each location's `target` shows up as
   * a separate outgoing edge in the graph. Same pattern as
   * MovementChoiceBeat.
   */
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
    // Also include any base-class connections (legacy single-location target).
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
      | { onPermissionDenied?: 'skip' | 'fallback'; fallbackBeatId?: string; defaultProximityRadiusM?: number }
      | undefined;

    if (this.mode !== 'display') {
      const verdict = await ensureXRPermission(context, ['gps'], {
        onDenied: locationSettings?.onPermissionDenied,
      });
      if (verdict === 'fallback') {
        const fallback = locationSettings?.fallbackBeatId;
        if (fallback) return fallback;
        return this.getNextBeat(context);
      }
      if (verdict === 'skip') {
        return this.getNextBeat(context);
      }
    }

    const effective = this.getEffectiveLocations();
    if (effective.length === 0) {
      console.warn(`[GpsLocationBeat ${this.id}] no locations configured — skipping`);
      return this.getNextBeat(context);
    }

    // Validate every entry has lat/lng. Drop entries that don't.
    const valid = effective.filter((loc) => loc.lat !== undefined && loc.lng !== undefined);
    if (valid.length === 0) {
      console.warn(`[GpsLocationBeat ${this.id}] no valid lat/lng on any location — skipping`);
      return this.getNextBeat(context);
    }

    // Resolve effective radius per location. Per-location wins, then beat-level,
    // then project default, then 25m.
    const projectDefault = locationSettings?.defaultProximityRadiusM ?? 25;
    const renderLocations = valid.map((loc) => ({
      id: loc.id,
      name: loc.name,
      lat: loc.lat!,
      lng: loc.lng!,
      radiusMeters: loc.radiusMeters ?? this.radiusMeters ?? projectDefault,
    }));

    const unsubscribe = context.getSensorService().ensureLocationCacheActive();
    (renderer as any).setState?.('sensorService', context.getSensorService());

    let result: { path: string; locationId?: string };
    try {
      if (!renderer.renderMap) {
        console.warn(`[GpsLocationBeat ${this.id}] renderer doesn't implement renderMap — advancing`);
        return this.getNextBeat(context);
      }
      result = await renderer.renderMap({
        mode: this.mode,
        locations: renderLocations,
        text: this.text,
        buttonText: this.buttonText,
        cancelButtonText: this.cancelButtonText,
        timeoutMs: this.timeoutMs,
        mapStyle: this.mapStyle,
        showPlayerMarker: this.showPlayerMarker,
      });
    } finally {
      unsubscribe();
    }

    // Apply the matched location's effects + return its target.
    if (result.locationId) {
      const matched = valid.find((l) => l.id === result.locationId);
      if (matched) {
        if (matched.effects && matched.effects.length > 0) {
          for (const eff of matched.effects) {
            try { context.applyEffect(eff as Effect); }
            catch (err) { console.warn(`[GpsLocationBeat ${this.id}] applyEffect failed:`, err); }
          }
        }
        if (matched.target) return matched.target;
      }
    }

    // Display-mode continue / timeout / skip / unmatched: take defaultTarget
    // first, fall back to the legacy single connection.
    if (this.defaultTarget) return this.defaultTarget;
    return this.getNextBeat(context);
  }
}
