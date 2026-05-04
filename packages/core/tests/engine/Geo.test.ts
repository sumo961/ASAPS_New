/**
 * Tests for the geo helpers (haversineMeters, bearingDegrees) used by
 * gpsProximity conditions and DirectionalSound spatial positioning.
 *
 * Hand-checked test coordinates against a couple of online great-circle
 * calculators (e.g. movable-type.co.uk/scripts/latlong.html). All
 * tolerances are wide enough to cover spherical-vs-WGS84 disagreement;
 * the helpers use the spherical model and target ±0.5% accuracy.
 */

import { describe, it, expect } from 'vitest';
import { haversineMeters, bearingDegrees } from '../../src/engine/StoryContext';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(51.5074, -0.1278, 51.5074, -0.1278)).toBeCloseTo(0, 5);
  });

  it('symmetric: A→B equals B→A', () => {
    const a = haversineMeters(40.7128, -74.0060, 51.5074, -0.1278);
    const b = haversineMeters(51.5074, -0.1278, 40.7128, -74.0060);
    expect(a).toBeCloseTo(b, 0);
  });

  it('approximates known distances within 1%', () => {
    // London → New York ≈ 5,570 km (straight-line great-circle).
    const meters = haversineMeters(51.5074, -0.1278, 40.7128, -74.0060);
    expect(meters / 1000).toBeGreaterThan(5500);
    expect(meters / 1000).toBeLessThan(5600);
  });

  it('handles short distances (small radii) correctly', () => {
    // Two points roughly 100 metres apart in San Francisco.
    // 0.0009° latitude ≈ 100m.
    const meters = haversineMeters(37.7749, -122.4194, 37.7758, -122.4194);
    expect(meters).toBeGreaterThan(95);
    expect(meters).toBeLessThan(105);
  });

  it('antipodal points: ~half Earth circumference', () => {
    // Earth circumference at the equator ≈ 40,030 km, so antipodal ≈ 20,015 km.
    const meters = haversineMeters(0, 0, 0, 180);
    expect(meters / 1000).toBeGreaterThan(20_000);
    expect(meters / 1000).toBeLessThan(20_030);
  });
});

describe('bearingDegrees', () => {
  it('returns 0 (north) for a point directly north', () => {
    // Same longitude, target latitude further north.
    const b = bearingDegrees(51.5, 0, 51.6, 0);
    expect(b).toBeCloseTo(0, 1);
  });

  it('returns ~180 (south) for a point directly south', () => {
    const b = bearingDegrees(51.5, 0, 51.4, 0);
    expect(b).toBeCloseTo(180, 1);
  });

  it('returns ~90 (east) for a nearby point directly east', () => {
    const b = bearingDegrees(51.5, 0, 51.5, 0.001);
    // Within 0.1° of east at this latitude.
    expect(b).toBeGreaterThan(89.5);
    expect(b).toBeLessThan(90.5);
  });

  it('returns ~270 (west) for a nearby point directly west', () => {
    const b = bearingDegrees(51.5, 0, 51.5, -0.001);
    expect(b).toBeGreaterThan(269.5);
    expect(b).toBeLessThan(270.5);
  });

  it('always returns a value in [0, 360)', () => {
    // A handful of mixed-quadrant pairs.
    const cases = [
      [40, -74, 35, -80],     // SW quadrant
      [40, -74, 50, -60],     // NE quadrant
      [-30, 150, -40, 140],   // SW from southern hemisphere
      [70, 180, 70, -180],    // crossing the antimeridian
    ];
    for (const [lat1, lng1, lat2, lng2] of cases) {
      const b = bearingDegrees(lat1, lng1, lat2, lng2);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it('London → New York is roughly 288° (WNW direction)', () => {
    // Hand-checked against an online great-circle calculator.
    const b = bearingDegrees(51.5074, -0.1278, 40.7128, -74.0060);
    expect(b).toBeGreaterThan(285);
    expect(b).toBeLessThan(290);
  });
});
