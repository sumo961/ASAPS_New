/**
 * Small geospatial helpers for the Set GPS Location beat's random-scatter mode.
 * Coordinates are WGS84 degrees; distances are metres. The RNG is injectable so
 * the scatter is deterministic under test.
 */

import type { GeoPoint } from '../types';

/** Metres per degree of latitude (near-constant on the WGS84 ellipsoid). */
const METERS_PER_DEG_LAT = 111_320;

/**
 * Offset a point by (north, east) metres, returning the new lat/lng. Uses the
 * equirectangular small-distance approximation — accurate to well under a metre
 * at the geofence scales this feature targets (tens to hundreds of metres).
 */
export function offsetMeters(lat: number, lng: number, north: number, east: number): { lat: number; lng: number } {
  const dLat = north / METERS_PER_DEG_LAT;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = east / (METERS_PER_DEG_LAT * (Math.abs(cos) < 1e-9 ? 1e-9 : cos));
  return { lat: lat + dLat, lng: lng + dLng };
}

/**
 * Scatter `count` points uniformly (by area) within `radiusMeters` of a center.
 * Each point gets a random bearing and a sqrt-weighted distance so density is
 * even across the disc rather than clustered at the middle. `perPointRadius`
 * (if given) is stamped on each generated point as its own geofence radius.
 */
export function scatterPointsAround(
  center: { lat: number; lng: number },
  radiusMeters: number,
  count: number,
  opts: { perPointRadius?: number; rng?: () => number } = {}
): GeoPoint[] {
  const rng = opts.rng ?? Math.random;
  const n = Math.max(0, Math.floor(count));
  const R = Math.max(0, radiusMeters);
  const out: GeoPoint[] = [];
  for (let i = 0; i < n; i++) {
    const bearing = rng() * 2 * Math.PI;
    const dist = R * Math.sqrt(rng()); // sqrt → uniform over the disc's area
    const north = dist * Math.cos(bearing);
    const east = dist * Math.sin(bearing);
    const { lat, lng } = offsetMeters(center.lat, center.lng, north, east);
    out.push(opts.perPointRadius != null ? { lat, lng, radiusMeters: opts.perPointRadius } : { lat, lng });
  }
  return out;
}
