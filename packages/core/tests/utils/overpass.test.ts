import { describe, it, expect } from 'vitest';
import { buildWalkableQuery, sampleWalkablePoints } from '../../src/utils/overpass';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A footway line at lat=0 (lng -0.0005..0.0005) + a small park square to the north.
const LINE = {
  type: 'way', id: 1, tags: { highway: 'footway' },
  geometry: [{ lat: 0, lon: -0.0005 }, { lat: 0, lon: 0.0005 }],
};
const PARK = {
  type: 'way', id: 2, tags: { leisure: 'park' },
  geometry: [
    { lat: 0.0008, lon: -0.0002 }, { lat: 0.0012, lon: -0.0002 },
    { lat: 0.0012, lon: 0.0002 }, { lat: 0.0008, lon: 0.0002 },
    { lat: 0.0008, lon: -0.0002 },
  ],
};

function mockFetch(elements: any[], opts: { ok?: boolean; throws?: boolean } = {}) {
  return async () => {
    if (opts.throws) throw new Error('network down');
    return { ok: opts.ok !== false, status: 200, json: async () => ({ elements }) } as any;
  };
}

const center = { lat: 0, lng: 0 };
const onLine = (p: { lat: number; lng: number }) => Math.abs(p.lat) < 1e-9 && p.lng >= -0.0005 - 1e-9 && p.lng <= 0.0005 + 1e-9;
const inPark = (p: { lat: number; lng: number }) => p.lat >= 0.0008 && p.lat <= 0.0012 && p.lng >= -0.0002 && p.lng <= 0.0002;

describe('overpass walkable sampler', () => {
  it('builds a query scoped to the radius with walkable tags', () => {
    const q = buildWalkableQuery(35.9, 14.5, 150);
    expect(q).toContain('around:150,35.9,14.5');
    expect(q).toContain('highway');
    expect(q).toContain('leisure');
    expect(q).toContain('out geom;');
  });

  it('samples the requested count, every point on a walkable feature and within radius', async () => {
    const pts = await sampleWalkablePoints(center, 200, 10, {
      rng: mulberry32(3),
      fetchImpl: mockFetch([LINE, PARK]),
    });
    expect(pts).toHaveLength(10);
    for (const p of pts) {
      expect(onLine(p) || inPark(p)).toBe(true);
    }
  });

  it('stamps perPointRadius on each sampled point', async () => {
    const pts = await sampleWalkablePoints(center, 200, 5, {
      rng: mulberry32(1), perPointRadius: 12, fetchImpl: mockFetch([LINE, PARK]),
    });
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(p => p.radiusMeters === 12)).toBe(true);
  });

  it('returns [] on network failure (caller falls back to uniform)', async () => {
    expect(await sampleWalkablePoints(center, 200, 5, { fetchImpl: mockFetch([], { throws: true }) })).toEqual([]);
    expect(await sampleWalkablePoints(center, 200, 5, { fetchImpl: mockFetch([], { ok: false }) })).toEqual([]);
  });

  it('returns [] when OSM has no walkable geometry nearby', async () => {
    expect(await sampleWalkablePoints(center, 200, 5, { fetchImpl: mockFetch([]) })).toEqual([]);
  });

  it('is deterministic for a fixed RNG seed + response', async () => {
    const a = await sampleWalkablePoints(center, 200, 6, { rng: mulberry32(9), fetchImpl: mockFetch([LINE, PARK]) });
    const b = await sampleWalkablePoints(center, 200, 6, { rng: mulberry32(9), fetchImpl: mockFetch([LINE, PARK]) });
    expect(a).toEqual(b);
  });
});
