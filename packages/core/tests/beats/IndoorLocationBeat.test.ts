/**
 * Tests for IndoorLocationBeat (v0.9.49+) — second XR beat, indoor twin
 * of GpsLocationBeat.
 *
 * Mirrors the GpsLocationBeat test coverage with beacon semantics:
 *   - parameter handling (top-level vs nested, getParameters / updateParameters)
 *   - display mode renders without permission probe
 *   - trigger modes probe 'beacons' permission
 *   - permission denied + fallback policy returns fallbackBeatId
 *   - permission denied + skip policy advances without rendering
 *   - radius defaults: explicit > project default > 5m room-scale
 *   - missing targetBeaconUuid → skipped with warning
 *   - SensorService is propagated into renderer state
 *
 * Renderer is stubbed — UI is a renderer-package concern. We confirm
 * the beat invokes renderIndoorMap with the right arguments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndoorLocationBeat } from '../../src/beats/IndoorLocationBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { MockSensorService } from '../../src/engine/SensorService';

const TEST_UUID = 'aabbccdd-1122-3344-5566-77889900aabb';

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
  const normalised = typeof resolveValue === 'string'
    ? { path: resolveValue }
    : resolveValue;
  return {
    renderIndoorMap: vi.fn(async (options: any) => {
      calls.push(options);
      return normalised;
    }),
    setState: (k: string, v: any) => stateMap.set(k, v),
    getState: (k: string) => stateMap.get(k),
    calls,
    stateMap,
  } as any;
}

describe('IndoorLocationBeat', () => {
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
      const beat = new IndoorLocationBeat({ id: 'b1', name: 'Indoor', type: 'indoorLocation' } as any);
      expect(beat.mode).toBe('display');
    });

    it('reads parameters from top-level config OR nested parameters object', () => {
      const a = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        targetBeaconUuid: TEST_UUID, radiusMeters: 3, mode: 'trigger-on-arrival',
      } as any);
      const b = new IndoorLocationBeat({
        id: 'b2', name: 'Indoor', type: 'indoorLocation',
        parameters: { targetBeaconUuid: TEST_UUID, radiusMeters: 8, mode: 'trigger-on-departure' },
      } as any);
      expect(a.targetBeaconUuid).toBe(TEST_UUID);
      expect(a.mode).toBe('trigger-on-arrival');
      expect(b.radiusMeters).toBe(8);
      expect(b.mode).toBe('trigger-on-departure');
    });

    it('roundtrips through getParameters / updateParameters', () => {
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'trigger-on-arrival',
          targetBeaconUuid: TEST_UUID,
          radiusMeters: 4,
          text: 'Find the artefact',
          buttonText: 'Continue',
        },
      } as any);
      const params = beat.getParameters();
      expect(params).toMatchObject({
        mode: 'trigger-on-arrival',
        targetBeaconUuid: TEST_UUID,
        radiusMeters: 4,
        text: 'Find the artefact',
        buttonText: 'Continue',
      });
      beat.updateParameters({ radiusMeters: 7, text: 'New text' });
      expect(beat.radiusMeters).toBe(7);
      expect(beat.text).toBe('New text');
      expect(beat.targetBeaconUuid).toBe(TEST_UUID);
    });
  });

  describe('display mode', () => {
    it('skips permission probe and renders immediately', async () => {
      const renderer = makeRenderer('continue');
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID, radiusMeters: 5 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderIndoorMap).toHaveBeenCalledTimes(1);
      expect(renderer.calls[0]).toMatchObject({ mode: 'display' });
      // Legacy single-target params synthesize a one-element locations array.
      expect(renderer.calls[0].locations).toEqual([
        expect.objectContaining({ beaconUuid: TEST_UUID, radiusMeters: 5 }),
      ]);
    });

    it('propagates SensorService into renderer state', async () => {
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.getState('sensorService')).toBe(context.getSensorService());
    });
  });

  describe('trigger modes', () => {
    it('proceeds and renders when beacons permission is granted', async () => {
      const renderer = makeRenderer('arrived');
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'trigger-on-arrival', targetBeaconUuid: TEST_UUID, radiusMeters: 3 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderIndoorMap).toHaveBeenCalledTimes(1);
      expect(context.getCachedPermissionState('beacons')).toBe('granted');
    });

    it('returns fallbackBeatId when beacons denied + onPermissionDenied: "fallback"', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: {
          location: { onPermissionDenied: 'fallback', fallbackBeatId: 'beat_no_beacons' },
        },
      }), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('beacons', 'denied');

      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'trigger-on-arrival', targetBeaconUuid: TEST_UUID, radiusMeters: 3 },
      } as any);
      const result = await (beat as any).performAction(context, renderer);
      expect(result).toBe('beat_no_beacons');
      expect(renderer.renderIndoorMap).not.toHaveBeenCalled();
    });

    it('skips to next beat when beacons denied + onPermissionDenied: "skip"', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: { location: { onPermissionDenied: 'skip' } },
      }), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('beacons', 'denied');

      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'trigger-on-arrival', targetBeaconUuid: TEST_UUID, radiusMeters: 3 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderIndoorMap).not.toHaveBeenCalled();
    });

    it('degrades to skip when denied with default policy + no fallbackBeatId', async () => {
      context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
      const sensor = context.getSensorService() as MockSensorService;
      sensor.setMockPermissionState('beacons', 'denied');

      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'trigger-on-arrival', targetBeaconUuid: TEST_UUID, radiusMeters: 3 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderIndoorMap).not.toHaveBeenCalled();
    });
  });

  describe('radius defaulting', () => {
    it('uses explicit radiusMeters when set', async () => {
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID, radiusMeters: 2 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(2);
    });

    it('falls through to project defaultProximityRadiusM when beat has no radius', async () => {
      context = new StoryContext(undefined, makeStoryStub({
        globalSettings: { location: { defaultProximityRadiusM: 10 } },
      }), { mockMode: true });
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(10);
    });

    it('falls through to 5m room-scale default when neither beat nor project sets a radius', async () => {
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID },
      } as any);
      await (beat as any).performAction(context, renderer);
      // Indoor default is 5m (tighter than GPS's 25m).
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('skips with a warning when targetBeaconUuid is missing', async () => {
      const renderer = makeRenderer();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display' },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderIndoorMap).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('skips when renderer doesn\'t implement renderIndoorMap', async () => {
      const renderer: any = { setState: vi.fn(), getState: vi.fn() };  // no renderIndoorMap
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: { mode: 'display', targetBeaconUuid: TEST_UUID, radiusMeters: 5 },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('multi-location', () => {
    const UUID_A = '11111111-1111-1111-1111-111111111111';
    const UUID_B = '22222222-2222-2222-2222-222222222222';

    it('forwards all locations to the renderer', async () => {
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'display',
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, radiusMeters: 3, name: 'Reception', target: 'b-reception' },
            { id: 'loc-b', beaconUuid: UUID_B, radiusMeters: 7, name: 'Stairs', target: 'b-stairs' },
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations).toHaveLength(2);
      expect(renderer.calls[0].locations[0]).toMatchObject({ id: 'loc-a', beaconUuid: UUID_A, radiusMeters: 3 });
      expect(renderer.calls[0].locations[1]).toMatchObject({ id: 'loc-b', beaconUuid: UUID_B, radiusMeters: 7 });
    });

    it('returns the matched location\'s target on resolution', async () => {
      const renderer = makeRenderer({ path: 'arrived', locationId: 'loc-b' });
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'trigger-on-arrival',
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, target: 'b-reception' },
            { id: 'loc-b', beaconUuid: UUID_B, target: 'b-stairs' },
          ],
        },
      } as any);
      const result = await (beat as any).performAction(context, renderer);
      expect(result).toBe('b-stairs');
    });

    it('applies the matched location\'s effects on resolution', async () => {
      const renderer = makeRenderer({ path: 'arrived', locationId: 'loc-b' });
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'trigger-on-arrival',
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, target: 'a' },
            {
              id: 'loc-b',
              beaconUuid: UUID_B,
              target: 'b',
              effects: [
                { type: 'incrementCounter', target: 'visited_stairs', value: 1 },
              ],
            },
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      // Counter should have been incremented from 0 → 1.
      expect(context.getCounter('visited_stairs')).toBe(1);
    });

    it('falls back to defaultTarget on display-mode continue', async () => {
      const renderer = makeRenderer({ path: 'continue' });
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'display',
          defaultTarget: 'b-overview-next',
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, target: 'a' },
            { id: 'loc-b', beaconUuid: UUID_B, target: 'b' },
          ],
        },
      } as any);
      const result = await (beat as any).performAction(context, renderer);
      expect(result).toBe('b-overview-next');
    });

    it('per-location radius overrides beat-level radius', async () => {
      const renderer = makeRenderer();
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          mode: 'display',
          radiusMeters: 10, // beat-level default
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, target: 'a' }, // inherits 10
            { id: 'loc-b', beaconUuid: UUID_B, radiusMeters: 2, target: 'b' }, // override
          ],
        },
      } as any);
      await (beat as any).performAction(context, renderer);
      expect(renderer.calls[0].locations[0].radiusMeters).toBe(10);
      expect(renderer.calls[0].locations[1].radiusMeters).toBe(2);
    });

    it('exposes one connection per location via getConnections', () => {
      const beat = new IndoorLocationBeat({
        id: 'b1', name: 'Indoor', type: 'indoorLocation',
        parameters: {
          xrLocations: [
            { id: 'loc-a', beaconUuid: UUID_A, target: 'b-reception', name: 'Reception' },
            { id: 'loc-b', beaconUuid: UUID_B, target: 'b-stairs', name: 'Stairs' },
          ],
        },
      } as any);
      const connections = beat.getConnections();
      const targets = connections.map((c: any) => c.targetId);
      expect(targets).toContain('b-reception');
      expect(targets).toContain('b-stairs');
    });
  });
});
