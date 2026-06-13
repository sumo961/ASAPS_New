/**
 * Tests for sensorAdapter — bridges @asaps/core SensorService to the
 * `subscribeToSensor` shape that AudioManager.playSpatialSound takes.
 * The adapter merges watchLocation + watchOrientation into a single
 * stream so the panner update path doesn't need two separate
 * subscriptions.
 *
 * Coverage focus:
 *   - Emits combined snapshot on location updates (lat/lng populated)
 *   - Emits combined snapshot on orientation updates (compassAlpha
 *     populated)
 *   - State persists across emits (a location update doesn't wipe
 *     compass; an orientation update doesn't wipe location)
 *   - Unsubscribe tears down BOTH watchers (no leak)
 *   - First emit doesn't crash when only one source has yet fired
 *     (snapshot fields are optional)
 *   - Updater receives a fresh object each call (not the same
 *     reference — consumers may mutate)
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSensorAdapter } from '../src/audio/sensorAdapter';

function makeService() {
  let locCb: ((r: { lat: number; lng: number }) => void) | null = null;
  let oriCb: ((r: { alpha: number | null }) => void) | null = null;
  const unsubLoc = vi.fn();
  const unsubOri = vi.fn();

  const service = {
    watchLocation: vi.fn((cb: any) => { locCb = cb; return unsubLoc; }),
    watchOrientation: vi.fn((cb: any) => { oriCb = cb; return unsubOri; }),
  };
  return {
    service,
    fireLocation: (lat: number, lng: number) => locCb?.({ lat, lng }),
    fireOrientation: (alpha: number | null) => oriCb?.({ alpha }),
    unsubLoc, unsubOri,
  };
}

describe('buildSensorAdapter', () => {
  it('returns a function (the subscribeToSensor adapter)', () => {
    const { service } = makeService();
    const subscribe = buildSensorAdapter(service);
    expect(typeof subscribe).toBe('function');
  });

  describe('subscription side effects', () => {
    it('calls watchLocation + watchOrientation when subscribed', () => {
      const { service } = makeService();
      const subscribe = buildSensorAdapter(service);
      subscribe(vi.fn());
      expect(service.watchLocation).toHaveBeenCalledOnce();
      expect(service.watchOrientation).toHaveBeenCalledOnce();
    });

    it('does NOT subscribe until the returned function is called', () => {
      const { service } = makeService();
      buildSensorAdapter(service); // build doesn't subscribe
      expect(service.watchLocation).not.toHaveBeenCalled();
      expect(service.watchOrientation).not.toHaveBeenCalled();
    });
  });

  describe('snapshot emission', () => {
    it('emits playerLat / playerLng on location update', () => {
      const { service, fireLocation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireLocation(52.5, 13.4);
      expect(updater).toHaveBeenCalledWith({
        playerLat: 52.5,
        playerLng: 13.4,
      });
    });

    it('emits compassAlpha on orientation update', () => {
      const { service, fireOrientation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireOrientation(90);
      expect(updater).toHaveBeenCalledWith({ compassAlpha: 90 });
    });

    it('emits a fresh object each call (not the same reference)', () => {
      // Critical for callers that might mutate or destructure
      // the snapshot — sharing a reference would let one consumer
      // accidentally affect the next.
      const { service, fireLocation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireLocation(1, 2);
      fireLocation(3, 4);
      const first = updater.mock.calls[0][0];
      const second = updater.mock.calls[1][0];
      expect(first).not.toBe(second);
    });

    it('orientation alpha=null still emits (heading unknown is valid state)', () => {
      // Compass returning null means heading is unknown but the
      // event still fires. Pass through so the consumer can see
      // "we have a position but no heading".
      const { service, fireOrientation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireOrientation(null);
      expect(updater).toHaveBeenCalledWith({ compassAlpha: null });
    });
  });

  describe('snapshot persistence', () => {
    it('a location update does NOT wipe compassAlpha', () => {
      // The adapter maintains a small in-memory snapshot, so a
      // location-only update preserves previously-received
      // orientation data.
      const { service, fireLocation, fireOrientation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireOrientation(45);
      fireLocation(52.5, 13.4);

      const lastCall = updater.mock.calls[updater.mock.calls.length - 1][0];
      expect(lastCall).toEqual({
        compassAlpha: 45,
        playerLat: 52.5,
        playerLng: 13.4,
      });
    });

    it('an orientation update does NOT wipe location', () => {
      const { service, fireLocation, fireOrientation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireLocation(52.5, 13.4);
      fireOrientation(90);

      const lastCall = updater.mock.calls[updater.mock.calls.length - 1][0];
      expect(lastCall).toEqual({
        playerLat: 52.5,
        playerLng: 13.4,
        compassAlpha: 90,
      });
    });

    it('repeated location updates overwrite previous lat/lng', () => {
      const { service, fireLocation } = makeService();
      const updater = vi.fn();
      buildSensorAdapter(service)(updater);
      fireLocation(1, 2);
      fireLocation(3, 4);

      const lastCall = updater.mock.calls[updater.mock.calls.length - 1][0];
      expect(lastCall).toEqual({ playerLat: 3, playerLng: 4 });
    });
  });

  describe('unsubscribe', () => {
    it('returned unsubscribe tears down BOTH underlying watchers', () => {
      const { service, unsubLoc, unsubOri } = makeService();
      const unsubscribe = buildSensorAdapter(service)(vi.fn());
      unsubscribe();
      expect(unsubLoc).toHaveBeenCalledOnce();
      expect(unsubOri).toHaveBeenCalledOnce();
    });
  });
});
