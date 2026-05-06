/**
 * Tests for GpsLocationBeat (v0.9.48 / S4+) — first XR beat.
 *
 * Exercises:
 *   - display mode → renderer is called once, beat resolves to next beat
 *   - trigger-on-arrival / trigger-on-departure → renderer is called,
 *     resolution string is logged, beat advances
 *   - missing target coordinates → skipped with a console warning
 *   - GPS permission denied + project's onPermissionDenied: 'fallback' →
 *     beat returns the configured fallbackBeatId
 *   - GPS permission denied + onPermissionDenied: 'skip' →
 *     beat advances to next without rendering
 *   - radius default falls through: explicit beat value > project's
 *     defaultProximityRadiusM > 25m
 *   - the SensorService is propagated to the renderer's state slot
 *
 * Renderer is stubbed — we don't exercise the placeholder UI here;
 * that's a renderer-package concern. We confirm the beat invokes
 * renderMap with the right arguments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GpsLocationBeat } from '../../src/beats/GpsLocationBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { MockSensorService } from '../../src/engine/SensorService';

function makeStoryStub(opts: {
  globalSettings?: any;
  beats?: Array<{ id: string; name?: string }>;
} = {}) {
  return {
    getCharacters: () => [],
    getFirstBeatId: () => '0',
    getSettings: () => opts.globalSettings,
    getBeat: (id: string) => opts.beats?.find((b) => b.id === id),
  } as any;
}

function makeRenderer(
  resolveValue:
    | string
    | { path: string; locationId?: string }
    = { path: 'continue' },
) {
  const calls: any[] = [];
  const stateMap = new Map<string, any>();
  // Accept legacy string resolveValue (just 'continue', 'arrived', etc) so
  // older tests stay readable; convert to the new {path, locationId?} shape.
  const normalised = typeof resolveValue === 'string'
    ? { path: resolveValue }
    : resolveValue;
  return {
    renderMap: vi.fn(async (options: any) => {
      calls.push(options);
      return normalised;
    }),
    setState: (k: string, v: any) => stateMap.set(k, v),
    getState: (k: string) => stateMap.get(k),
    calls,
    stateMap,
  } as any;
}

describe('GpsLocationBeat', () => {
  let context: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('parameter handling', () => {
    it('defaults mode to "display" when not specified', () => {
      const beat = new GpsLocationBeat({ id: 'b1', name: 'Map', type: 'gpsLocation' } as any);
      expect(beat.mode).toBe('display');
    });

    it('reads parameters from top-level config OR nested parameters object', () => {
      const a = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        targetLat: 51.5, targetLng: -0.1, radiusMeters: 10, mode: 'trigger-on-arrival',
      } as any);
      const b = new GpsLocationBeat({
        id: 'b2', name: 'Map', type: 'gpsLocation',
        parameters: {
          targetLat: 40.7, targetLng: -74.0, radiusMeters: 50, mode: 'trigger-on-departure',
        },
      } as any);
      expect(a.targetLat).toBe(51.5);
      expect(a.mode).toBe('trigger-on-arrival');
      expect(b.targetLng).toBe(-74.0);
      expect(b.mode).toBe('trigger-on-departure');
    });

    it('roundtrips through getParameters / updateParameters', () => {
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: {
          mode: 'trigger-on-arrival',
          targetLat: 51.5, targetLng: -0.1, radiusMeters: 30,
          text: 'Walk to the meeting point', buttonText: 'Continue',
        },
      } as any);
      const params = beat.getParameters();
      expect(params).toMatchObject({
        mode: 'trigger-on-arrival',
        targetLat: 51.5, targetLng: -0.1, radiusMeters: 30,
        text: 'Walk to the meeting point', buttonText: 'Continue',
      });
      beat.updateParameters({ radiusMeters: 100, text: 'New text' });
      expect(beat.radiusMeters).toBe(100);
      expect(beat.text).toBe('New text');
      // Other fields preserved.
      expect(beat.targetLat).toBe(51.5);
    });
  });

  describe('display mode', () => {
    it('skips permission probe and renders immediately', async () => {
      const renderer = makeRenderer('continue');
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 51.5, targetLng: -0.1, radiusMeters: 25 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderMap).toHaveBeenCalledTimes(1);
      expect(renderer.calls[0]).toMatchObject({ mode: 'display' });
      // Legacy single-target params synthesize a one-element locations array.
      expect(renderer.calls[0].locations).toEqual([
        expect.objectContaining({ lat: 51.5, lng: -0.1, radiusMeters: 25 }),
      ]);
    });

    it('propagates SensorService into renderer state', async () => {
      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 0, targetLng: 0, radiusMeters: 10 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.getState('sensorService')).toBe(context.getSensorService());
    });
  });

  describe('trigger modes', () => {
    it('proceeds and renders when GPS permission is granted', async () => {
      const renderer = makeRenderer('arrived');
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'trigger-on-arrival', targetLat: 51.5, targetLng: -0.1, radiusMeters: 25 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderMap).toHaveBeenCalledTimes(1);
      // Permission cache was populated by ensureXRPermission.
      expect(context.getCachedPermissionState('gps')).toBe('granted');
    });

    it('returns fallbackBeatId when GPS denied + onPermissionDenied: "fallback"', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: {
          location: { onPermissionDenied: 'fallback', fallbackBeatId: 'beat_no_gps' },
        },
      }), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('gps', 'denied');

      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'trigger-on-arrival', targetLat: 51.5, targetLng: -0.1, radiusMeters: 25 },
      } as any);
      const result = await (beat as any).performAction(context, renderer);
      expect(result).toBe('beat_no_gps');
      expect(renderer.renderMap).not.toHaveBeenCalled();
    });

    it('skips to next beat when GPS denied + onPermissionDenied: "skip"', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: { location: { onPermissionDenied: 'skip' } },
      }), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('gps', 'denied');

      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'trigger-on-arrival', targetLat: 51.5, targetLng: -0.1, radiusMeters: 25 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderMap).not.toHaveBeenCalled();
    });

    it('falls back to "advance to next" when GPS denied but no fallbackBeatId set', async () => {
      // Default policy is 'fallback', but no fallbackBeatId → degrades to skip.
      context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('gps', 'denied');

      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'trigger-on-arrival', targetLat: 51.5, targetLng: -0.1, radiusMeters: 25 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderMap).not.toHaveBeenCalled();
    });
  });

  describe('radius defaulting', () => {
    it('uses explicit radiusMeters when set', async () => {
      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 0, targetLng: 0, radiusMeters: 7 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(7);
    });

    it('falls through to project defaultProximityRadiusM when beat has no radius', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: { location: { defaultProximityRadiusM: 100 } },
      }), { mockMode: true });
      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 0, targetLng: 0 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(100);
    });

    it('falls through to 25m when neither beat nor project sets a radius', async () => {
      const renderer = makeRenderer();
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 0, targetLng: 0 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(25);
    });
  });

  describe('edge cases', () => {
    it('skips with a warning when targetLat / targetLng are missing', async () => {
      const renderer = makeRenderer();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display' },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderMap).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('skips when renderer doesn\'t implement renderMap', async () => {
      const renderer: any = { setState: vi.fn(), getState: vi.fn() };  // no renderMap
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const beat = new GpsLocationBeat({
        id: 'b1', name: 'Map', type: 'gpsLocation',
        parameters: { mode: 'display', targetLat: 0, targetLng: 0, radiusMeters: 10 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(warn).toHaveBeenCalled();
    });
  });
});
