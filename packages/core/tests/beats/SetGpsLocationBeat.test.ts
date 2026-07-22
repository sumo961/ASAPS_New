import { describe, it, expect, beforeEach } from 'vitest';
import { SetGpsLocationBeat } from '../../src/beats/SetGpsLocationBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

const noopRenderer = { setState: () => {}, getState: () => null } as unknown as IRenderer;

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const m = 111_320;
  const dN = (b.lat - a.lat) * m;
  const dE = (b.lng - a.lng) * m * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dN * dN + dE * dE);
}

/** Point the context's sensor at a fixed reading (or null). */
function stubSensor(ctx: StoryContext, reading: { lat: number; lng: number } | null) {
  (ctx as any).getSensorService = () => ({
    getCurrentLocation: async () => (reading ? { ...reading, accuracy: 5, timestamp: 0 } : null),
    ensureLocationCacheActive: () => () => {},
  });
}

describe('SetGpsLocationBeat', () => {
  let context: StoryContext;
  beforeEach(() => { context = new StoryContext(); });

  it('explicit mode stores one authored point (with optional radius)', async () => {
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'explicit', pointName: 'gate', lat: 35.9, lng: 14.5, pointRadiusMeters: 20 } as any,
    });
    await beat.execute(context, noopRenderer);
    expect(context.getGeoPoints('gate')).toEqual([{ lat: 35.9, lng: 14.5, radiusMeters: 20 }]);
  });

  it('capture mode pins the current sensor position', async () => {
    stubSensor(context, { lat: 35.8989, lng: 14.5146 });
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'capture', pointName: 'here' } as any,
    });
    await beat.execute(context, noopRenderer);
    expect(context.getGeoPoints('here')).toEqual([{ lat: 35.8989, lng: 14.5146 }]);
  });

  it('capture falls back to authored coords when the sensor has no fix', async () => {
    stubSensor(context, null);
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'capture', pointName: 'here', fallbackLat: 1, fallbackLng: 2 } as any,
    });
    await beat.execute(context, noopRenderer);
    expect(context.getGeoPoints('here')).toEqual([{ lat: 1, lng: 2 }]);
  });

  it('scatter mode distributes `count` points within the radius of the current position', async () => {
    const center = { lat: 35.8989, lng: 14.5146 };
    stubSensor(context, center);
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'scatter', pointName: 'caches', count: 8, scatterRadiusMeters: 150, centerSource: 'current' } as any,
    });
    await beat.execute(context, noopRenderer);
    const pts = context.getGeoPoints('caches');
    expect(pts).toHaveLength(8);
    for (const p of pts) expect(distM(center, p)).toBeLessThanOrEqual(150 + 0.5);
  });

  it('scatter can center on another stored point set', async () => {
    context.setGeoPoints('base', [{ lat: 10, lng: 20 }]);
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'scatter', pointName: 'ring', count: 5, scatterRadiusMeters: 50, centerSource: 'point', centerPointName: 'base' } as any,
    });
    await beat.execute(context, noopRenderer);
    const pts = context.getGeoPoints('ring');
    expect(pts).toHaveLength(5);
    for (const p of pts) expect(distM({ lat: 10, lng: 20 }, p)).toBeLessThanOrEqual(50 + 0.5);
  });

  it('skips (no write) when pointName is missing, but still advances', async () => {
    const beat = new SetGpsLocationBeat({
      id: 'g', type: 'setGpsLocation',
      parameters: { mode: 'explicit', lat: 1, lng: 2 } as any,
      connections: [{ targetId: 'next' } as any],
    });
    const result = await beat.execute(context, noopRenderer);
    expect(context.getGeoPoints('')).toEqual([]);
    expect(result).toBe('next');
  });

  it('round-trips params through get/updateParameters', () => {
    const beat = new SetGpsLocationBeat({ id: 'g', type: 'setGpsLocation' });
    beat.updateParameters({ mode: 'scatter', pointName: 'x', count: 12, scatterRadiusMeters: 300, centerSource: 'explicit', lat: 5, lng: 6 });
    const p = beat.getParameters();
    expect(p.mode).toBe('scatter');
    expect(p.pointName).toBe('x');
    expect(p.count).toBe(12);
    expect(p.scatterRadiusMeters).toBe(300);
    expect(p.centerSource).toBe('explicit');
  });
});

describe('StoryContext geoPoints state', () => {
  it('round-trips geoPoints through serialize / loadFromSerialized', () => {
    const ctx = new StoryContext();
    ctx.setGeoPoints('a', [{ lat: 1, lng: 2 }, { lat: 3, lng: 4, radiusMeters: 10 }]);
    const snap = ctx.serialize();
    const ctx2 = new StoryContext();
    ctx2.loadFromSerialized(snap);
    expect(ctx2.getGeoPoints('a')).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4, radiusMeters: 10 }]);
  });

  it('getGeoPoints returns a copy (no external mutation of state)', () => {
    const ctx = new StoryContext();
    ctx.setGeoPoints('a', [{ lat: 1, lng: 2 }]);
    const got = ctx.getGeoPoints('a');
    got[0].lat = 999;
    expect(ctx.getGeoPoints('a')[0].lat).toBe(1);
  });
});
