/**
 * Tests for SensorService — XR sensor abstraction (v0.9.48+).
 *
 * Critical correctness property exercised here: subscribers SHARE one
 * underlying watcher per sensor. A story with 10 GPS-watch beats running
 * concurrently must produce exactly ONE navigator.geolocation.watchPosition
 * call. Otherwise mobile battery dies in 30 minutes during real playback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WebSensorService,
  MockSensorService,
  createSensorService,
  type GpsReading,
  type OrientationReading,
} from '../../src/engine/SensorService';

// =============================================================================
// Helpers — Geolocation API mock
// =============================================================================

interface GeolocationStub {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  // Capture the success callback so tests can deliver readings synchronously.
  emitSuccess?: (pos: any) => void;
  emitError?: (err: any) => void;
}

function installGeolocationMock(): GeolocationStub {
  const stub: GeolocationStub = {
    getCurrentPosition: vi.fn((success, _error) => {
      // Default: deliver a canonical reading.
      success({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          heading: null,
          speed: null,
        },
        timestamp: 1_700_000_000_000,
      });
    }),
    watchPosition: vi.fn((success, error) => {
      stub.emitSuccess = success;
      stub.emitError = error;
      return 42;  // arbitrary watch id
    }),
    clearWatch: vi.fn(),
  };
  vi.stubGlobal('navigator', { geolocation: stub });
  return stub;
}

// =============================================================================
// WebSensorService
// =============================================================================

describe('WebSensorService', () => {
  let geo: GeolocationStub;
  let service: WebSensorService;

  beforeEach(() => {
    geo = installGeolocationMock();
    service = new WebSensorService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getCurrentLocation', () => {
    it('resolves with normalised GpsReading on Geolocation success', async () => {
      const reading = await service.getCurrentLocation();
      expect(reading).toEqual({
        lat: 37.7749,
        lng: -122.4194,
        accuracy: 10,
        altitude: undefined,
        heading: null,
        speed: null,
        timestamp: 1_700_000_000_000,
      });
    });

    it('resolves null when Geolocation calls the error callback', async () => {
      geo.getCurrentPosition.mockImplementationOnce((_success, error) => {
        error({ code: 1, message: 'denied' });
      });
      const reading = await service.getCurrentLocation();
      expect(reading).toBeNull();
    });

    it('resolves null when navigator.geolocation is absent', async () => {
      vi.stubGlobal('navigator', {});
      service = new WebSensorService();
      const reading = await service.getCurrentLocation();
      expect(reading).toBeNull();
    });
  });

  describe('watchLocation — shared underlying watcher', () => {
    it('starts ONE underlying watchPosition for many subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const cb3 = vi.fn();
      service.watchLocation(cb1);
      service.watchLocation(cb2);
      service.watchLocation(cb3);
      expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    });

    it('fans out the same reading to every subscriber', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.watchLocation(cb1);
      service.watchLocation(cb2);
      // Simulate a position update from the OS.
      geo.emitSuccess?.({
        coords: { latitude: 1, longitude: 2, accuracy: 5, altitude: null, heading: null, speed: null },
        timestamp: 1_700_000_001_000,
      });
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ lat: 1, lng: 2 }));
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ lat: 1, lng: 2 }));
    });

    it('clears the underlying watcher when the LAST subscriber unsubscribes', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const unsub1 = service.watchLocation(cb1);
      const unsub2 = service.watchLocation(cb2);
      // First unsub doesn't tear down — cb2 still active.
      unsub1();
      expect(geo.clearWatch).not.toHaveBeenCalled();
      // Last unsub tears down.
      unsub2();
      expect(geo.clearWatch).toHaveBeenCalledWith(42);
    });

    it('does NOT double-register the same callback (Set semantics)', () => {
      const cb = vi.fn();
      service.watchLocation(cb);
      service.watchLocation(cb);
      geo.emitSuccess?.({
        coords: { latitude: 1, longitude: 2, accuracy: 5, altitude: null, heading: null, speed: null },
        timestamp: 1,
      });
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh watcher after re-subscribe following full teardown', () => {
      const cb = vi.fn();
      const unsub = service.watchLocation(cb);
      unsub();
      expect(geo.watchPosition).toHaveBeenCalledTimes(1);
      service.watchLocation(cb);
      expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCapabilities', () => {
    it('reports gps:true when navigator.geolocation is present', () => {
      const caps = service.getCapabilities();
      expect(caps.gps).toBe(true);
      expect(caps.mock).toBe(false);
      expect(caps.beacons).toBe(false);  // v1: deferred to v2
    });

    it('reports gps:false when navigator.geolocation is absent', () => {
      vi.stubGlobal('navigator', {});
      service = new WebSensorService();
      expect(service.getCapabilities().gps).toBe(false);
    });
  });

  describe('mock-injection methods are no-ops', () => {
    it('setMockLocation logs a warning and does nothing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      service.setMockLocation({
        lat: 0, lng: 0, accuracy: 1, timestamp: 0,
      } as GpsReading);
      expect(warn).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// MockSensorService
// =============================================================================

describe('MockSensorService', () => {
  let service: MockSensorService;

  beforeEach(() => {
    service = new MockSensorService();
  });

  describe('seedFromSettings', () => {
    it('populates getCurrentLocation with the seeded value', async () => {
      service.seedFromSettings({ lat: 51.5, lng: -0.1 });
      const reading = await service.getCurrentLocation();
      expect(reading?.lat).toBe(51.5);
      expect(reading?.lng).toBe(-0.1);
      expect(reading?.accuracy).toBe(5);
    });

    it('is a no-op when given undefined or partial input', async () => {
      service.seedFromSettings(undefined);
      expect(await service.getCurrentLocation()).toBeNull();
    });
  });

  describe('setMockLocation', () => {
    it('immediately delivers the new reading to every active subscriber', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.watchLocation(cb1);
      service.watchLocation(cb2);
      cb1.mockClear();  // emit-on-subscribe fires once with currentLocation; ignore
      cb2.mockClear();
      const reading: GpsReading = {
        lat: 1, lng: 2, accuracy: 1, timestamp: Date.now(),
      };
      service.setMockLocation(reading);
      expect(cb1).toHaveBeenCalledWith(reading);
      expect(cb2).toHaveBeenCalledWith(reading);
    });

    it('emits current reading to a new subscriber on watchLocation', () => {
      service.setMockLocation({ lat: 1, lng: 2, accuracy: 1, timestamp: 0 });
      const cb = vi.fn();
      service.watchLocation(cb);
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ lat: 1, lng: 2 }));
    });
  });

  describe('setMockOrientation', () => {
    it('updates the cached orientation and notifies subscribers', () => {
      const cb = vi.fn();
      service.watchOrientation(cb);
      cb.mockClear();
      const reading: OrientationReading = {
        alpha: 90, beta: 0, gamma: 0, absolute: true, timestamp: Date.now(),
      };
      service.setMockOrientation(reading);
      expect(cb).toHaveBeenCalledWith(reading);
    });
  });

  describe('subscriber lifecycle', () => {
    it('does NOT leave ghost subscribers after subscribe/unsub/re-subscribe', () => {
      const cb = vi.fn();
      const unsub1 = service.watchLocation(cb);
      unsub1();
      service.watchLocation(cb);
      cb.mockClear();
      service.setMockLocation({ lat: 1, lng: 2, accuracy: 1, timestamp: 0 });
      // Should fire EXACTLY once — the second subscribe replaces, not duplicates.
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCapabilities', () => {
    it('reports mock:true and gps/beacons/orientation:true so the panel can simulate anything', () => {
      const caps = service.getCapabilities();
      expect(caps.mock).toBe(true);
      expect(caps.gps).toBe(true);
      expect(caps.beacons).toBe(true);
      expect(caps.orientation).toBe(true);
    });
  });
});

// =============================================================================
// createSensorService factory
// =============================================================================

describe('createSensorService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns MockSensorService when mockMode:true is set', () => {
    const svc = createSensorService({ mockMode: true });
    expect(svc.getCapabilities().mock).toBe(true);
  });

  it('returns WebSensorService when navigator.geolocation is present and mockMode is false', () => {
    installGeolocationMock();
    const svc = createSensorService({ mockMode: false });
    expect(svc.getCapabilities().mock).toBe(false);
    expect(svc.getCapabilities().gps).toBe(true);
  });

  it('falls back to MockSensorService when navigator.geolocation is absent (SSR/test)', () => {
    vi.stubGlobal('navigator', {});
    const svc = createSensorService();
    // Mock service is the safe fallback in headless contexts.
    expect(svc.getCapabilities().mock).toBe(true);
  });
});
