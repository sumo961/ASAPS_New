/**
 * Tests for v0.9.48 / S3+ XR conditions and the ensureXRPermission helper.
 *
 * Covers:
 *   - gpsProximity condition: haversine distance + within / outside modes
 *   - indoorProximity condition: beacon UUID match + RSSI threshold
 *   - permissionGranted condition: cache-driven all-of evaluation
 *   - ensureXRPermission helper: probe, prompt-then-record, fallback policy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { MockSensorService } from '../../src/engine/SensorService';
import { ensureXRPermission } from '../../src/utils/xrPermissions';

function makeStoryStub() {
  return {
    getCharacters: () => [],
    getFirstBeatId: () => '0',
  } as any;
}

describe('gpsProximity condition', () => {
  let context: StoryContext;
  let sensor: MockSensorService;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
    sensor = context.getSensorService() as MockSensorService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when player is within radius of target (default proximityMode)', () => {
    // San Francisco City Hall ↔ Civic Center plaza, ~50m apart.
    sensor.setMockLocation({ lat: 37.7793, lng: -122.4193, accuracy: 5, timestamp: 0 });
    expect(context.checkCondition({
      type: 'gpsProximity',
      operator: '==',  // operator is unused for proximity; the comparison is built into the condition
      targetLat: 37.7798,
      targetLng: -122.4190,
      radiusMeters: 100,
    } as any)).toBe(true);
  });

  it('returns false when player is outside radius (default proximityMode = within)', () => {
    sensor.setMockLocation({ lat: 37.7793, lng: -122.4193, accuracy: 5, timestamp: 0 });
    expect(context.checkCondition({
      type: 'gpsProximity',
      operator: '==',
      targetLat: 40.7128,  // NYC — much farther than any radius we'd set
      targetLng: -74.0060,
      radiusMeters: 100,
    } as any)).toBe(false);
  });

  it('proximityMode "outside" inverts the within check', () => {
    sensor.setMockLocation({ lat: 37.7793, lng: -122.4193, accuracy: 5, timestamp: 0 });
    // Player IS at SF; target is NYC; radius is small. "outside" → true.
    expect(context.checkCondition({
      type: 'gpsProximity',
      operator: '==',
      targetLat: 40.7128,
      targetLng: -74.0060,
      radiusMeters: 100,
      proximityMode: 'outside',
    } as any)).toBe(true);
  });

  it('returns false when no cached location is available (fail-closed)', () => {
    // No setMockLocation called — sensor cache is empty.
    expect(context.checkCondition({
      type: 'gpsProximity',
      operator: '==',
      targetLat: 37.7793,
      targetLng: -122.4193,
      radiusMeters: 100,
    } as any)).toBe(false);
  });

  it('returns false when targetLat/targetLng/radius are missing or invalid', () => {
    sensor.setMockLocation({ lat: 37.7793, lng: -122.4193, accuracy: 5, timestamp: 0 });
    expect(context.checkCondition({
      type: 'gpsProximity', operator: '==', radiusMeters: 100,
    } as any)).toBe(false);
    expect(context.checkCondition({
      type: 'gpsProximity', operator: '==', targetLat: 0, targetLng: 0, radiusMeters: 0,
    } as any)).toBe(false);
  });
});

describe('indoorProximity condition', () => {
  let context: StoryContext;
  let sensor: MockSensorService;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
    sensor = context.getSensorService() as MockSensorService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when matching beacon is detected at sufficient RSSI', () => {
    sensor.setMockBeacons([
      { uuid: 'museum-room-A', rssi: -55, timestamp: 0 },
    ]);
    expect(context.checkCondition({
      type: 'indoorProximity',
      operator: '==',
      beaconUuid: 'museum-room-A',
      minRssi: -65,  // -55 ≥ -65 (closer to 0 = stronger)
    } as any)).toBe(true);
  });

  it('returns false when matching beacon is too far (RSSI below threshold)', () => {
    sensor.setMockBeacons([
      { uuid: 'museum-room-A', rssi: -90, timestamp: 0 },
    ]);
    expect(context.checkCondition({
      type: 'indoorProximity',
      operator: '==',
      beaconUuid: 'museum-room-A',
      minRssi: -65,
    } as any)).toBe(false);
  });

  it('returns false when no matching beacon is in the cache', () => {
    sensor.setMockBeacons([
      { uuid: 'museum-room-B', rssi: -55, timestamp: 0 },
    ]);
    expect(context.checkCondition({
      type: 'indoorProximity',
      operator: '==',
      beaconUuid: 'museum-room-A',
      minRssi: -65,
    } as any)).toBe(false);
  });

  it('filters by major / minor when specified', () => {
    sensor.setMockBeacons([
      { uuid: 'shared-uuid', major: 1, minor: 1, rssi: -55, timestamp: 0 },
      { uuid: 'shared-uuid', major: 1, minor: 2, rssi: -55, timestamp: 0 },
    ]);
    expect(context.checkCondition({
      type: 'indoorProximity', operator: '==',
      beaconUuid: 'shared-uuid', beaconMajor: 1, beaconMinor: 2, minRssi: -65,
    } as any)).toBe(true);
    expect(context.checkCondition({
      type: 'indoorProximity', operator: '==',
      beaconUuid: 'shared-uuid', beaconMajor: 1, beaconMinor: 99, minRssi: -65,
    } as any)).toBe(false);
  });
});

describe('permissionGranted condition', () => {
  let context: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when an empty permission list is provided', () => {
    expect(context.checkCondition({
      type: 'permissionGranted', operator: '==', permissions: [],
    } as any)).toBe(true);
  });

  it('returns false when no permission has been recorded yet (fail-closed)', () => {
    expect(context.checkCondition({
      type: 'permissionGranted', operator: '==', permissions: ['gps'],
    } as any)).toBe(false);
  });

  it('returns true when all listed permissions are recorded as granted', () => {
    context.recordPermissionState('gps', 'granted');
    context.recordPermissionState('camera', 'granted');
    expect(context.checkCondition({
      type: 'permissionGranted', operator: '==', permissions: ['gps', 'camera'],
    } as any)).toBe(true);
  });

  it('returns false when any single listed permission is denied / unavailable', () => {
    context.recordPermissionState('gps', 'granted');
    context.recordPermissionState('camera', 'denied');
    expect(context.checkCondition({
      type: 'permissionGranted', operator: '==', permissions: ['gps', 'camera'],
    } as any)).toBe(false);
  });
});

describe('ensureXRPermission helper', () => {
  let context: StoryContext;
  let sensor: MockSensorService;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    context = new StoryContext(undefined, makeStoryStub(), { mockMode: true });
    sensor = context.getSensorService() as MockSensorService;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "granted" and records every permission when all are granted', async () => {
    const verdict = await ensureXRPermission(context, ['gps', 'camera']);
    expect(verdict).toBe('granted');
    expect(context.getCachedPermissionState('gps')).toBe('granted');
    expect(context.getCachedPermissionState('camera')).toBe('granted');
  });

  it('returns "fallback" by default when at least one permission is denied', async () => {
    sensor.setMockPermissionState('gps', 'denied');
    const verdict = await ensureXRPermission(context, ['gps', 'camera']);
    expect(verdict).toBe('fallback');
    expect(context.getCachedPermissionState('gps')).toBe('denied');
  });

  it('returns "skip" when policy.onDenied is "skip"', async () => {
    sensor.setMockPermissionState('gps', 'denied');
    const verdict = await ensureXRPermission(context, ['gps'], { onDenied: 'skip' });
    expect(verdict).toBe('skip');
  });

  it('prompts on "prompt"-state permissions when policy.prompt is true (default)', async () => {
    sensor.setMockPermissionState('gps', 'prompt');
    const verdict = await ensureXRPermission(context, ['gps']);
    // Mock service auto-grants on requestPermission for prompt-state.
    expect(verdict).toBe('granted');
    expect(context.getCachedPermissionState('gps')).toBe('granted');
  });

  it('does NOT prompt when policy.prompt is false', async () => {
    sensor.setMockPermissionState('gps', 'prompt');
    const verdict = await ensureXRPermission(context, ['gps'], { prompt: false });
    // Without prompting, 'prompt' state is not 'granted' → fallback.
    expect(verdict).toBe('fallback');
    expect(context.getCachedPermissionState('gps')).toBe('prompt');
  });

  it('returns "granted" for an empty permissions list (trivial)', async () => {
    expect(await ensureXRPermission(context, [])).toBe('granted');
  });

  it('records "unavailable" permissions and yields fallback', async () => {
    sensor.setMockPermissionState('beacons', 'unavailable');
    const verdict = await ensureXRPermission(context, ['beacons']);
    expect(verdict).toBe('fallback');
    expect(context.getCachedPermissionState('beacons')).toBe('unavailable');
  });
});
