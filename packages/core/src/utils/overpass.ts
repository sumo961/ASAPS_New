/**
 * Walkable-point sampling via the OpenStreetMap Overpass API.
 *
 * The random-scatter mechanic can place points inside buildings, on rooftops,
 * or in water. This module fetches the *walkable* geometry near a center
 * (footways / paths / pedestrian & residential streets, plus parks and other
 * open leisure areas) and samples points ALONG lines / INSIDE polygons — so
 * the points are accessible-on-foot by construction rather than by rejection.
 *
 * Shared by the runtime (SetGpsLocation scatter + placement:'walkable') and the
 * builder (authoring-time curation). Both `fetch` and the RNG are injectable so
 * the sampler is deterministic + offline-testable. Every failure path (network
 * error, timeout, empty result) resolves to an empty array so callers can fall
 * back to pure uniform scatter and never stall the story.
 */

import type { GeoPoint } from '../types';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const M_PER_DEG_LAT = 111_320;

/** Minimal fetch typing so core doesn't need the DOM lib. */
type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface WalkableSampleOptions {
  /** Radius (metres) stamped on each returned point (its geofence size). */
  perPointRadius?: number;
  /** Injectable RNG in [0,1) for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
  /** Injectable fetch (defaults to globalThis.fetch). */
  fetchImpl?: FetchLike;
  /** Overpass endpoint override. */
  endpoint?: string;
  /** Abort after this many ms (default 12000). */
  timeoutMs?: number;
  /** External abort signal (composed with the timeout). */
  signal?: any;
}

interface OverpassGeomNode { lat: number; lon: number }
interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomNode[];
}

/** A sampled feature: a walk line or a walk area, with a sampling weight. */
interface Feature {
  kind: 'line' | 'area';
  ring: Array<{ lat: number; lng: number }>;
  weight: number; // length (m) for lines, area (m²) for polygons
}

/** Metres between two nearby WGS84 points (flat-earth approx; fine at these scales). */
function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dN = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dE = (b.lng - a.lng) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dN * dN + dE * dE);
}

/** Shoelace area in m² (relative weight; longitude scaled by cos(lat)). */
function polygonAreaM2(ring: Array<{ lat: number; lng: number }>): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0].lat;
  const kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng * kx, yi = ring[i].lat * ky;
    const xj = ring[j].lng * kx, yj = ring[j].lat * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a) / 2;
}

function pointInPolygon(pt: { lat: number; lng: number }, ring: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lng;
    const yj = ring[j].lat, xj = ring[j].lng;
    const intersect = (yi > pt.lat) !== (yj > pt.lat) &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** The Overpass QL query: walkable ways + open leisure/landuse areas near center. */
export function buildWalkableQuery(lat: number, lng: number, radiusMeters: number, timeoutSec = 25): string {
  const r = Math.max(1, Math.round(radiusMeters));
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:${timeoutSec}];(` +
    `way["highway"~"^(footway|path|pedestrian|living_street|residential|track|steps|cycleway|service|unclassified|tertiary)$"]${a};` +
    `way["leisure"~"^(park|garden|common|playground|pitch|recreation_ground|dog_park)$"]${a};` +
    `way["landuse"~"^(recreation_ground|grass|village_green)$"]${a};` +
    `);out geom;`;
}

/** Turn Overpass ways into weighted samplable features. */
function toFeatures(ways: OverpassWay[]): Feature[] {
  const features: Feature[] = [];
  for (const w of ways) {
    const geom = w.geometry;
    if (!Array.isArray(geom) || geom.length < 2) continue;
    const ring = geom.map(g => ({ lat: g.lat, lng: g.lon }));
    const closed = ring.length >= 4 &&
      Math.abs(ring[0].lat - ring[ring.length - 1].lat) < 1e-9 &&
      Math.abs(ring[0].lng - ring[ring.length - 1].lng) < 1e-9;
    const isAreaTag = !!(w.tags && (w.tags.leisure || w.tags.landuse));
    if (closed && isAreaTag) {
      const weight = polygonAreaM2(ring);
      if (weight > 0) features.push({ kind: 'area', ring, weight });
    } else {
      let len = 0;
      for (let i = 1; i < ring.length; i++) len += distMeters(ring[i - 1], ring[i]);
      if (len > 0) features.push({ kind: 'line', ring, weight: len });
    }
  }
  return features;
}

function pickWeighted(features: Feature[], total: number, rng: () => number): Feature | null {
  if (features.length === 0 || total <= 0) return null;
  let u = rng() * total;
  for (const f of features) { u -= f.weight; if (u <= 0) return f; }
  return features[features.length - 1];
}

/** Sample one point on a line (uniform by length) or inside a polygon. */
function samplePointIn(f: Feature, rng: () => number): { lat: number; lng: number } | null {
  if (f.kind === 'line') {
    const total = f.weight;
    let target = rng() * total;
    for (let i = 1; i < f.ring.length; i++) {
      const segLen = distMeters(f.ring[i - 1], f.ring[i]);
      if (target <= segLen || i === f.ring.length - 1) {
        const t = segLen > 0 ? target / segLen : 0;
        return {
          lat: f.ring[i - 1].lat + (f.ring[i].lat - f.ring[i - 1].lat) * t,
          lng: f.ring[i - 1].lng + (f.ring[i].lng - f.ring[i - 1].lng) * t,
        };
      }
      target -= segLen;
    }
    return f.ring[0];
  }
  // area: bounding-box rejection sampling
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of f.ring) {
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
  }
  for (let tries = 0; tries < 24; tries++) {
    const cand = { lat: minLat + rng() * (maxLat - minLat), lng: minLng + rng() * (maxLng - minLng) };
    if (pointInPolygon(cand, f.ring)) return cand;
  }
  return null; // couldn't land inside (thin/degenerate polygon)
}

/**
 * Fetch walkable features near a center. Returns [] on any failure so callers
 * can degrade gracefully. Exposed separately so the builder can preview the raw
 * geometry / cache it before sampling.
 */
export async function fetchWalkableWays(
  center: { lat: number; lng: number },
  radiusMeters: number,
  opts: WalkableSampleOptions = {}
): Promise<OverpassWay[]> {
  const fetchImpl: FetchLike | undefined = opts.fetchImpl ?? (globalThis as any).fetch?.bind(globalThis);
  if (!fetchImpl) return [];
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const query = buildWalkableQuery(center.lat, center.lng, radiusMeters);

  // Compose an internal timeout with any caller signal.
  const controller = typeof (globalThis as any).AbortController !== 'undefined' ? new (globalThis as any).AbortController() : null;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (opts.signal && controller) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener?.('abort', () => controller.abort());
  }
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller?.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    const els = Array.isArray(json?.elements) ? json.elements : [];
    return els.filter((e: any) => e?.type === 'way' && Array.isArray(e.geometry)) as OverpassWay[];
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Sample `count` walkable points within `radiusMeters` of `center`. Points are
 * placed along walkable ways / inside open areas and clamped to the radius.
 * Returns fewer points (or []) if OSM coverage is thin or the query fails —
 * callers should fall back to uniform scatter when the result is short.
 */
export async function sampleWalkablePoints(
  center: { lat: number; lng: number },
  radiusMeters: number,
  count: number,
  opts: WalkableSampleOptions = {}
): Promise<GeoPoint[]> {
  const rng = opts.rng ?? Math.random;
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];

  const ways = await fetchWalkableWays(center, radiusMeters, opts);
  const features = toFeatures(ways);
  const total = features.reduce((s, f) => s + f.weight, 0);
  if (features.length === 0 || total <= 0) return [];

  const out: GeoPoint[] = [];
  let attempts = 0;
  const maxAttempts = n * 12; // bounded so a bad geometry set can't spin forever
  while (out.length < n && attempts < maxAttempts) {
    attempts++;
    const f = pickWeighted(features, total, rng);
    if (!f) break;
    const pt = samplePointIn(f, rng);
    if (!pt) continue;
    if (distMeters(center, pt) > radiusMeters) continue; // clamp to the requested radius
    out.push(opts.perPointRadius != null ? { ...pt, radiusMeters: opts.perPointRadius } : pt);
  }
  return out;
}
