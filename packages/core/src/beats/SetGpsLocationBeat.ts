/**
 * SetGpsLocationBeat (invisible / logic beat).
 *
 * Writes a named GPS point set into story state (`context.setGeoPoints`) that a
 * GpsLocation beat can then geofence dynamically (via an entry's `pointName`)
 * and a Condition beat can react to. One beat, three modes:
 *
 *   - 'capture' — pin the player's CURRENT position (from the sensor) as a
 *                 single point. Falls back to authored coords when the sensor
 *                 is unavailable / permission denied (desktop, indoors, no fix).
 *   - 'explicit'— store one author-entered lat/lng (+ optional radius).
 *   - 'scatter' — generate `count` random points uniformly within
 *                 `scatterRadiusMeters` of a center (the current position, a
 *                 previously-stored point set, or explicit coords). This is the
 *                 "distribute waypoints around where the player is" mechanic.
 *
 * Invisible: always advances to the next beat.
 */

import { Beat } from './Beat';
import type { BeatConfig, IRenderer, GeoPoint } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { scatterPointsAround } from '../utils/geo';
import { sampleWalkablePoints } from '../utils/overpass';

export type SetGpsLocationMode = 'capture' | 'explicit' | 'scatter';
export type ScatterCenterSource = 'current' | 'point' | 'explicit';
/** 'uniform' = pure math (offline); 'walkable' = snap onto OSM streets/parks. */
export type ScatterPlacement = 'uniform' | 'walkable';

export interface SetGpsLocationBeatParameters {
  mode?: SetGpsLocationMode;
  /** Geo-point set name to write (read back by GpsLocation `pointName`). */
  pointName?: string;
  /** Explicit / fallback coordinates. */
  lat?: number;
  lng?: number;
  /** Per-point geofence radius stamped onto stored points (metres). */
  pointRadiusMeters?: number;
  /** Used when the sensor is unavailable in capture / scatter-from-current. */
  fallbackLat?: number;
  fallbackLng?: number;
  // ---- scatter mode ----
  count?: number;
  scatterRadiusMeters?: number;
  centerSource?: ScatterCenterSource;
  /** Name of a previously-stored point set to center on (centerSource='point'). */
  centerPointName?: string;
  /** 'uniform' (default, offline) or 'walkable' (snap to OSM streets/parks). */
  placement?: ScatterPlacement;
}

export class SetGpsLocationBeat extends Beat {
  public gpsMode: SetGpsLocationMode;
  public pointName: string;
  public lat?: number;
  public lng?: number;
  public pointRadiusMeters?: number;
  public fallbackLat?: number;
  public fallbackLng?: number;
  public count: number;
  public scatterRadiusMeters: number;
  public centerSource: ScatterCenterSource;
  public centerPointName?: string;
  public placement: ScatterPlacement;

  constructor(config: BeatConfig & {
    parameters?: Partial<SetGpsLocationBeatParameters>;
  } & Partial<SetGpsLocationBeatParameters>) {
    super(config);
    const p = (config.parameters || {}) as Partial<SetGpsLocationBeatParameters>;
    const pick = <K extends keyof SetGpsLocationBeatParameters>(k: K) =>
      (config as any)[k] ?? p[k];
    this.gpsMode = pick('mode') ?? 'capture';
    this.pointName = (pick('pointName') ?? '').toString().trim();
    this.lat = pick('lat');
    this.lng = pick('lng');
    this.pointRadiusMeters = pick('pointRadiusMeters');
    this.fallbackLat = pick('fallbackLat');
    this.fallbackLng = pick('fallbackLng');
    this.count = Number(pick('count') ?? 3);
    this.scatterRadiusMeters = Number(pick('scatterRadiusMeters') ?? 100);
    this.centerSource = pick('centerSource') ?? 'current';
    this.centerPointName = pick('centerPointName');
    this.placement = pick('placement') ?? 'uniform';
  }

  getParameters(): Record<string, any> {
    return {
      mode: this.gpsMode,
      pointName: this.pointName,
      lat: this.lat,
      lng: this.lng,
      pointRadiusMeters: this.pointRadiusMeters,
      fallbackLat: this.fallbackLat,
      fallbackLng: this.fallbackLng,
      count: this.count,
      scatterRadiusMeters: this.scatterRadiusMeters,
      centerSource: this.centerSource,
      centerPointName: this.centerPointName,
      placement: this.placement,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.mode !== undefined) this.gpsMode = params.mode;
    if (params.pointName !== undefined) this.pointName = String(params.pointName).trim();
    if (params.lat !== undefined) this.lat = params.lat;
    if (params.lng !== undefined) this.lng = params.lng;
    if (params.pointRadiusMeters !== undefined) this.pointRadiusMeters = params.pointRadiusMeters;
    if (params.fallbackLat !== undefined) this.fallbackLat = params.fallbackLat;
    if (params.fallbackLng !== undefined) this.fallbackLng = params.fallbackLng;
    if (params.count !== undefined) this.count = Number(params.count);
    if (params.scatterRadiusMeters !== undefined) this.scatterRadiusMeters = Number(params.scatterRadiusMeters);
    if (params.centerSource !== undefined) this.centerSource = params.centerSource;
    if (params.centerPointName !== undefined) this.centerPointName = params.centerPointName;
    if (params.placement !== undefined) this.placement = params.placement;
  }

  /** Read the current sensor position, or null if unavailable. Never throws. */
  private async readCurrentPosition(context: StoryContext): Promise<{ lat: number; lng: number } | null> {
    try {
      const svc = context.getSensorService?.();
      const reading = svc ? await svc.getCurrentLocation() : null;
      if (reading && typeof reading.lat === 'number' && typeof reading.lng === 'number') {
        return { lat: reading.lat, lng: reading.lng };
      }
    } catch (err) {
      console.warn(`[SetGpsLocationBeat ${this.id}] getCurrentLocation failed:`, err);
    }
    return null;
  }

  /** Fallback coords from authored fallbackLat/Lng, or null. */
  private fallback(): { lat: number; lng: number } | null {
    return typeof this.fallbackLat === 'number' && typeof this.fallbackLng === 'number'
      ? { lat: this.fallbackLat, lng: this.fallbackLng }
      : null;
  }

  protected async performAction(
    context: StoryContext,
    _renderer: IRenderer
  ): Promise<string | null> {
    if (!this.pointName) {
      console.error(`[SetGpsLocationBeat ${this.id}] no pointName specified — skipping`);
      return this.getNextBeat(context);
    }

    try {
      let points: GeoPoint[] = [];

      if (this.gpsMode === 'explicit') {
        if (typeof this.lat === 'number' && typeof this.lng === 'number') {
          points = [{ lat: this.lat, lng: this.lng, ...(this.pointRadiusMeters != null ? { radiusMeters: this.pointRadiusMeters } : {}) }];
        } else {
          console.warn(`[SetGpsLocationBeat ${this.id}] explicit mode without lat/lng — storing empty`);
        }
      } else if (this.gpsMode === 'capture') {
        const pos = (await this.readCurrentPosition(context)) ?? this.fallback();
        if (pos) {
          points = [{ lat: pos.lat, lng: pos.lng, ...(this.pointRadiusMeters != null ? { radiusMeters: this.pointRadiusMeters } : {}) }];
        } else {
          console.warn(`[SetGpsLocationBeat ${this.id}] capture mode: no sensor position and no fallback — storing empty`);
        }
      } else {
        // scatter
        let center: { lat: number; lng: number } | null = null;
        if (this.centerSource === 'explicit') {
          center = typeof this.lat === 'number' && typeof this.lng === 'number' ? { lat: this.lat, lng: this.lng } : null;
        } else if (this.centerSource === 'point') {
          const stored = this.centerPointName ? context.getGeoPoints(this.centerPointName) : [];
          center = stored.length > 0 ? { lat: stored[0].lat, lng: stored[0].lng } : null;
        } else {
          center = (await this.readCurrentPosition(context)) ?? this.fallback();
        }
        center = center ?? this.fallback();
        if (center) {
          if (this.placement === 'walkable') {
            // Snap onto real streets/parks via OSM. Thin coverage or a failed
            // query returns fewer than requested — top up with uniform scatter
            // so the count is always met and the story never stalls.
            let walk: GeoPoint[] = [];
            try {
              walk = await sampleWalkablePoints(center, this.scatterRadiusMeters, this.count, {
                perPointRadius: this.pointRadiusMeters,
              });
            } catch (err) {
              console.warn(`[SetGpsLocationBeat ${this.id}] walkable sampling failed:`, err);
            }
            if (walk.length >= this.count) {
              points = walk.slice(0, this.count);
            } else {
              const fill = scatterPointsAround(center, this.scatterRadiusMeters, this.count - walk.length, {
                perPointRadius: this.pointRadiusMeters,
              });
              points = [...walk, ...fill];
              console.warn(`[SetGpsLocationBeat ${this.id}] walkable: ${walk.length}/${this.count} on-network, ${fill.length} filled uniformly`);
            }
          } else {
            points = scatterPointsAround(center, this.scatterRadiusMeters, this.count, {
              perPointRadius: this.pointRadiusMeters,
            });
          }
        } else {
          console.warn(`[SetGpsLocationBeat ${this.id}] scatter mode: no resolvable center — storing empty`);
        }
      }

      context.setGeoPoints(this.pointName, points);
      console.log(`[SetGpsLocationBeat ${this.id}] ${this.gpsMode} → '${this.pointName}' = ${points.length} point(s)`);
    } catch (err) {
      console.error(`[SetGpsLocationBeat ${this.id}] error:`, err);
    }

    return this.getNextBeat(context);
  }
}
