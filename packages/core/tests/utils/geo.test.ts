import { describe, it, expect } from 'vitest';
import { offsetMeters, scatterPointsAround } from '../../src/utils/geo';

// Deterministic RNG so the scatter is reproducible under test.
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approximate ground distance (metres) between two nearby WGS84 points.
function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const mPerDeg = 111_320;
  const dN = (b.lat - a.lat) * mPerDeg;
  const dE = (b.lng - a.lng) * mPerDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dN * dN + dE * dE);
}

describe('geo', () => {
  const center = { lat: 35.8989, lng: 14.5146 }; // Valletta-ish

  it('offsetMeters moves north/east by the requested distance', () => {
    const north = offsetMeters(center.lat, center.lng, 100, 0);
    expect(distM(center, north)).toBeCloseTo(100, 0);
    const east = offsetMeters(center.lat, center.lng, 0, 100);
    expect(distM(center, east)).toBeCloseTo(100, 0);
    // north increases latitude; east increases longitude
    expect(north.lat).toBeGreaterThan(center.lat);
    expect(east.lng).toBeGreaterThan(center.lng);
  });

  it('scatters exactly `count` points, all within the radius', () => {
    const pts = scatterPointsAround(center, 200, 25, { rng: mulberry32(42) });
    expect(pts).toHaveLength(25);
    for (const p of pts) {
      expect(distM(center, p)).toBeLessThanOrEqual(200 + 0.5);
    }
  });

  it('is deterministic for a given RNG seed', () => {
    const a = scatterPointsAround(center, 150, 5, { rng: mulberry32(7) });
    const b = scatterPointsAround(center, 150, 5, { rng: mulberry32(7) });
    expect(a).toEqual(b);
  });

  it('stamps perPointRadius on each point when given', () => {
    const pts = scatterPointsAround(center, 100, 4, { perPointRadius: 15, rng: mulberry32(1) });
    expect(pts.every(p => p.radiusMeters === 15)).toBe(true);
  });

  it('count <= 0 yields an empty set', () => {
    expect(scatterPointsAround(center, 100, 0)).toEqual([]);
    expect(scatterPointsAround(center, 100, -3)).toEqual([]);
  });

  it('spreads points by area (not clustered at the center)', () => {
    const pts = scatterPointsAround(center, 300, 200, { rng: mulberry32(99) });
    const outerHalf = pts.filter(p => distM(center, p) > 150).length; // outer ring = 3/4 of the area
    expect(outerHalf / pts.length).toBeGreaterThan(0.5);
  });
});
