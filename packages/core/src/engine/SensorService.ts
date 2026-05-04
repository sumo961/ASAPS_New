/**
 * SensorService — unified sensor access for XR beats.
 *
 * Wraps platform-specific APIs (Geolocation, Bluetooth Web,
 * DeviceOrientationEvent, getUserMedia) behind a stable interface that
 * beats can rely on regardless of platform. Two implementations:
 *
 *   - WebSensorService — production path. Real sensors via browser APIs.
 *     PWA / mobile-browser playback uses this.
 *   - MockSensorService — desktop authoring path. Returns values seeded
 *     from the project's LocationSettings.mockLocation plus runtime
 *     overrides from the PreviewWindow's MockSensorPanel.
 *
 * The runtime picks one via `createSensorService` based on capability
 * detection at startup (and an explicit `mockMode` override for the
 * PreviewWindow).
 *
 * ## Critical correctness property — shared underlying watchers
 *
 * Multiple beat subscribers must share ONE underlying watcher per
 * sensor. A story with 10 GPS-watch beats running concurrently has
 * to produce ONE `navigator.geolocation.watchPosition` call, fanned
 * out to all subscribers — not 10 independent watchers. Otherwise
 * mobile battery dies in 30 minutes during real playback.
 *
 * The implementation enforces this via:
 *   - Lazy: the underlying watcher starts on the first subscribe()
 *   - Reference-counted teardown: the underlying watcher is cleared
 *     when the last subscriber unsubscribes
 *   - Set-based subscriber tracking: re-subscribing the same callback
 *     doesn't double-register
 *
 * The unit-test suite specifically exercises this property — see
 * SensorService.test.ts.
 */

import { EventEmitter } from 'eventemitter3';

// =============================================================================
// Reading types
// =============================================================================

/**
 * GPS reading. Fields mirror the Geolocation API's `Position.coords`
 * with normalised optional-vs-null semantics.
 */
export interface GpsReading {
  /** Latitude in degrees, WGS84. */
  lat: number;
  /** Longitude in degrees, WGS84. */
  lng: number;
  /** Horizontal accuracy in metres (Geolocation API spec). */
  accuracy: number;
  /** Optional altitude in metres above WGS84 ellipsoid. */
  altitude?: number;
  /** Heading in degrees (0=N, 90=E), null if not moving. */
  heading?: number | null;
  /** Ground speed in m/s, null if not moving. */
  speed?: number | null;
  /** Reading timestamp in ms since epoch. */
  timestamp: number;
}

/**
 * Bluetooth-beacon reading. Covers iBeacon (uuid + major + minor) and
 * Eddystone (uuid only). RSSI is the raw signal strength; `distance` is
 * an estimated metres value derived from RSSI when calibration is known.
 */
export interface BeaconReading {
  /** iBeacon UUID, Eddystone namespace, or vendor-specific id. */
  uuid: string;
  /** Optional iBeacon major / minor for further filtering. */
  major?: number;
  minor?: number;
  /** Received signal strength in dBm. Closer to 0 = stronger signal. */
  rssi: number;
  /**
   * Estimated distance in metres, derived from RSSI if calibration is
   * known. Useful for fuzzy-proximity triggers; absolute accuracy is
   * highly variable (1-3m typical, 5-10m in cluttered environments).
   */
  distance?: number;
  timestamp: number;
}

/**
 * Device orientation reading. Field semantics from the
 * DeviceOrientationEvent spec.
 */
export interface OrientationReading {
  /**
   * Compass heading in degrees, 0=N. May be null on iOS Safari
   * before `DeviceOrientationEvent.requestPermission()` has been
   * granted.
   */
  alpha: number | null;
  /** Front-back tilt in degrees. Forward-tilt > 0. */
  beta: number;
  /** Left-right tilt in degrees. Right-tilt > 0. */
  gamma: number;
  /**
   * Whether `alpha` is referenced to true north (vs. an arbitrary
   * device-startup heading). Android exposes this; iOS sometimes does
   * not. Beats that need true-north should check this flag.
   */
  absolute: boolean;
  timestamp: number;
}

/**
 * What the current SensorService implementation can do on this
 * platform. Beats use this to decide whether to render a feature or
 * fall back gracefully.
 */
export interface SensorCapabilities {
  /** Geolocation API present. */
  gps: boolean;
  /** Bluetooth Web API present (v1 always false on Web — full impl in v2). */
  beacons: boolean;
  /** DeviceOrientationEvent present. */
  orientation: boolean;
  /** getUserMedia present (used by AR beat). */
  camera: boolean;
  /** True when this is the MockSensorService (authoring context). */
  mock: boolean;
}

/**
 * Permission state for a sensor / device capability (v0.9.48 / S3+).
 *
 *   - `'granted'`     — already permitted; readings will work.
 *   - `'denied'`      — explicitly refused; XR beats should fall back.
 *   - `'prompt'`      — not yet asked; calling getCurrentLocation /
 *                       getUserMedia / requestPermission will trigger
 *                       the platform UI.
 *   - `'unavailable'` — the underlying API doesn't exist on this
 *                       platform (e.g., Bluetooth Web on iOS Safari).
 */
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Capability names addressable by the permission state API. */
export type SensorPermissionName = 'gps' | 'camera' | 'orientation' | 'beacons';

// =============================================================================
// Service interface
// =============================================================================

/**
 * Unified sensor access for XR beats. See module docstring for the
 * de-dupe-shared-watcher correctness property.
 */
export interface SensorService {
  /**
   * One-shot location read. Resolves null if denied or unavailable.
   * Use this for "where is the player right now?" — not a continuous
   * stream.
   */
  getCurrentLocation(): Promise<GpsReading | null>;

  /**
   * Subscribe to continuous location updates. Returns an unsubscribe
   * function. Multiple subscribers SHARE one underlying watcher.
   */
  watchLocation(
    callback: (reading: GpsReading) => void,
    opts?: { accuracy?: 'high' | 'low'; intervalMs?: number },
  ): () => void;

  /**
   * Subscribe to beacon scan results. Returns an unsubscribe function.
   * v1 stub on Web — full Bluetooth Web API integration ships in v2
   * along with IndoorLocationBeat. The MockSensorService implements
   * this fully so authoring can proceed without real hardware.
   */
  scanBeacons(callback: (beacons: BeaconReading[]) => void): () => void;

  /**
   * Subscribe to device orientation updates. Returns an unsubscribe
   * function. Multiple subscribers share one underlying listener.
   */
  watchOrientation(callback: (reading: OrientationReading) => void): () => void;

  /** What this service can do on this platform. */
  getCapabilities(): SensorCapabilities;

  // ---- cached-reading getters (S3+) ----

  /**
   * Synchronous read of the most recent location. Returns null when
   * no reading has been observed yet. Condition evaluators (which run
   * synchronously) use this — the underlying watcher must already be
   * active. Call ensureLocationCacheActive() once if you need to be
   * sure a fresh reading is being collected.
   */
  getLastKnownLocation(): GpsReading | null;

  /** Synchronous read of the most recent orientation. */
  getLastKnownOrientation(): OrientationReading | null;

  /** Synchronous read of the most recent beacon list. */
  getLastKnownBeacons(): BeaconReading[];

  /**
   * Ensure a passive watcher is running so getLastKnownLocation has a
   * fresh value to return. Idempotent — repeated calls don't spawn
   * extra watchers (the de-dupe property still holds). The returned
   * unsubscribe stops *this* call's interest; the underlying watcher
   * stays alive while any subscriber, passive or active, holds a ref.
   */
  ensureLocationCacheActive(): () => void;
  ensureOrientationCacheActive(): () => void;
  ensureBeaconCacheActive(): () => void;

  // ---- permission state API (S3+) ----

  /**
   * Probe the current permission state for a sensor capability without
   * triggering a prompt. Returns 'unavailable' if the underlying API
   * doesn't exist on this platform.
   */
  getPermissionState(name: SensorPermissionName): Promise<PermissionState>;

  /**
   * Trigger the platform's permission prompt for a capability. Resolves
   * with the post-prompt state — typically 'granted' or 'denied'. If
   * the platform doesn't support proactive prompting (e.g., Geolocation
   * has no requestPermission API; the prompt happens on first
   * getCurrentPosition call), this method calls the underlying API to
   * trigger the prompt as a side-effect.
   */
  requestPermission(name: SensorPermissionName): Promise<PermissionState>;

  // ---- mock-injection methods (no-op on production WebSensorService) ----

  /**
   * Override the current mock location. WebSensorService logs a warning
   * and ignores; MockSensorService updates the cached reading and
   * notifies all subscribers immediately.
   */
  setMockLocation(loc: GpsReading): void;

  /** Override the current mock beacon list. See setMockLocation. */
  setMockBeacons(beacons: BeaconReading[]): void;

  /** Override the current mock orientation. See setMockLocation. */
  setMockOrientation(reading: OrientationReading): void;

  /**
   * Override the mock permission state for a sensor (MockSensorService only).
   * Useful in unit tests and the Mock panel's "simulate denial" flow.
   */
  setMockPermissionState(name: SensorPermissionName, state: PermissionState): void;
}

// =============================================================================
// WebSensorService — production
// =============================================================================

/**
 * @internal Use createSensorService — direct construction is reserved
 * for tests. The internal marker is a soft contract; the class is
 * exported so test code can spy on it.
 */
export class WebSensorService extends EventEmitter implements SensorService {
  private locationWatchId: number | null = null;
  private locationSubscribers = new Set<(r: GpsReading) => void>();
  private orientationSubscribers = new Set<(r: OrientationReading) => void>();
  private orientationListenerInstalled = false;
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  // S3 cache — populated by the same underlying watcher that fans
  // readings out to active subscribers. Synchronous condition evaluators
  // read these directly without awaiting.
  private lastLocation: GpsReading | null = null;
  private lastOrientation: OrientationReading | null = null;
  // The Bluetooth stub keeps an empty beacon cache for symmetry; v2 will
  // populate it when scanBeacons gains a real implementation.
  private lastBeacons: BeaconReading[] = [];

  async getCurrentLocation(): Promise<GpsReading | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(this.normalizePosition(pos)),
        () => resolve(null),  // permission denied / unavailable
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    });
  }

  watchLocation(
    callback: (reading: GpsReading) => void,
    opts?: { accuracy?: 'high' | 'low'; intervalMs?: number },
  ): () => void {
    this.locationSubscribers.add(callback);
    // Lazy: only start the underlying watcher when the first subscriber arrives.
    if (this.locationWatchId === null && typeof navigator !== 'undefined' && navigator.geolocation) {
      this.locationWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const reading = this.normalizePosition(pos);
          this.lastLocation = reading;  // S3 — keep the cache fresh
          // Snapshot the subscriber list — defensive against unsubscribe-during-iterate.
          for (const sub of Array.from(this.locationSubscribers)) sub(reading);
        },
        (err) => console.warn('[SensorService] watchLocation error', err),
        {
          enableHighAccuracy: opts?.accuracy !== 'low',
          timeout: 30_000,
          maximumAge: opts?.intervalMs ?? 1000,
        },
      );
    }
    return () => {
      this.locationSubscribers.delete(callback);
      // Tear down when the last subscriber leaves — see the
      // de-dupe-shared-watcher correctness property in the module docstring.
      if (this.locationSubscribers.size === 0 && this.locationWatchId !== null) {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.clearWatch(this.locationWatchId);
        }
        this.locationWatchId = null;
      }
    };
  }

  scanBeacons(_callback: (beacons: BeaconReading[]) => void): () => void {
    // Bluetooth Web API integration deferred to v2 (with IndoorLocationBeat).
    // The shape is locked in here so the v2 implementation can land without
    // breaking subscribers. See docs/XR-Roadmap.md.
    console.warn('[SensorService] Bluetooth scanning not yet implemented (v2)');
    return () => {};
  }

  watchOrientation(callback: (reading: OrientationReading) => void): () => void {
    this.orientationSubscribers.add(callback);
    if (!this.orientationListenerInstalled && typeof window !== 'undefined') {
      this.orientationHandler = (e: DeviceOrientationEvent) => {
        const reading: OrientationReading = {
          alpha: e.alpha,
          beta: e.beta ?? 0,
          gamma: e.gamma ?? 0,
          absolute: e.absolute ?? false,
          timestamp: Date.now(),
        };
        this.lastOrientation = reading;  // S3 — keep the cache fresh
        for (const sub of Array.from(this.orientationSubscribers)) sub(reading);
      };
      window.addEventListener('deviceorientation', this.orientationHandler);
      this.orientationListenerInstalled = true;
    }
    return () => {
      this.orientationSubscribers.delete(callback);
      if (
        this.orientationSubscribers.size === 0 &&
        this.orientationListenerInstalled &&
        this.orientationHandler &&
        typeof window !== 'undefined'
      ) {
        window.removeEventListener('deviceorientation', this.orientationHandler);
        this.orientationListenerInstalled = false;
        this.orientationHandler = null;
      }
    };
  }

  getCapabilities(): SensorCapabilities {
    return {
      gps: typeof navigator !== 'undefined' && !!navigator.geolocation,
      beacons: false,  // not in v1 — see scanBeacons stub
      orientation: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
      camera: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      mock: false,
    };
  }

  // ---- cached-reading getters (S3) ----

  getLastKnownLocation(): GpsReading | null { return this.lastLocation; }
  getLastKnownOrientation(): OrientationReading | null { return this.lastOrientation; }
  getLastKnownBeacons(): BeaconReading[] { return this.lastBeacons; }

  /**
   * Start a passive watcher that keeps the cache fresh. Reuses the
   * existing watchLocation plumbing — the no-op subscriber callback is
   * just a hook that bumps the subscriber count so the underlying
   * watcher stays alive. Returns an unsubscribe.
   */
  ensureLocationCacheActive(): () => void {
    return this.watchLocation(() => { /* cache-keeper */ });
  }

  ensureOrientationCacheActive(): () => void {
    return this.watchOrientation(() => { /* cache-keeper */ });
  }

  ensureBeaconCacheActive(): () => void {
    return this.scanBeacons(() => { /* cache-keeper */ });
  }

  // ---- permission state API (S3) ----

  async getPermissionState(name: SensorPermissionName): Promise<PermissionState> {
    const caps = this.getCapabilities();
    if (
      (name === 'gps' && !caps.gps) ||
      (name === 'orientation' && !caps.orientation) ||
      (name === 'camera' && !caps.camera) ||
      (name === 'beacons' && !caps.beacons)
    ) {
      return 'unavailable';
    }
    // Try the standard Permissions API first — gives granted/denied/prompt
    // without triggering a UI prompt. Coverage varies: Chromium has
    // 'geolocation' and 'camera' but not 'beacons' or 'orientation'.
    if (typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
      const queryName = mapPermissionName(name);
      if (queryName) {
        try {
          const status = await (navigator as any).permissions.query({ name: queryName });
          // PermissionStatus.state is exactly 'granted' | 'denied' | 'prompt'.
          return status.state as PermissionState;
        } catch {
          // Some browsers throw on unknown permission names; fall through.
        }
      }
    }
    // Fallback for capabilities without a Permissions-API mapping:
    // we can't know without prompting, so default to 'prompt'. The
    // first call to the real underlying API will surface the platform's
    // native dialog.
    return 'prompt';
  }

  async requestPermission(name: SensorPermissionName): Promise<PermissionState> {
    const initial = await this.getPermissionState(name);
    if (initial === 'granted' || initial === 'denied' || initial === 'unavailable') {
      return initial;  // no prompt needed / nothing we can do
    }
    // Trigger the prompt via the appropriate underlying API.
    if (name === 'gps') {
      // getCurrentLocation surfaces the GPS prompt. Resolves with reading
      // (granted) or null (denied / dismissed).
      const reading = await this.getCurrentLocation();
      return reading ? 'granted' : 'denied';
    }
    if (name === 'camera') {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach((t) => t.stop());  // probe-and-release
          return 'granted';
        } catch {
          return 'denied';
        }
      }
      return 'unavailable';
    }
    if (name === 'orientation') {
      // iOS 13+ requires DeviceOrientationEvent.requestPermission().
      const evt = (typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined);
      if (evt?.requestPermission) {
        try {
          const result = await evt.requestPermission();
          return result === 'granted' ? 'granted' : 'denied';
        } catch {
          return 'denied';
        }
      }
      // Non-iOS — orientation events are available without an explicit prompt.
      return 'granted';
    }
    return 'unavailable';
  }

  // Mock-injection methods are no-ops on the production service. Logged at
  // warn so accidental mock-call from a non-MockSensorService context surfaces
  // during development.
  setMockLocation(_loc: GpsReading): void {
    console.warn('[SensorService] setMockLocation ignored on WebSensorService');
  }
  setMockBeacons(_b: BeaconReading[]): void {
    console.warn('[SensorService] setMockBeacons ignored on WebSensorService');
  }
  setMockOrientation(_r: OrientationReading): void {
    console.warn('[SensorService] setMockOrientation ignored on WebSensorService');
  }
  setMockPermissionState(_n: SensorPermissionName, _s: PermissionState): void {
    console.warn('[SensorService] setMockPermissionState ignored on WebSensorService');
  }

  private normalizePosition(pos: GeolocationPosition): GpsReading {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude ?? undefined,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    };
  }
}

/**
 * Map our friendly capability names to the Permissions API string. Returns
 * null when there's no canonical mapping (e.g., 'beacons' has no spec'd
 * Permissions-API name; 'orientation' is unspec'd in most browsers).
 */
function mapPermissionName(name: SensorPermissionName): string | null {
  switch (name) {
    case 'gps':    return 'geolocation';
    case 'camera': return 'camera';
    default:       return null;
  }
}

// =============================================================================
// MockSensorService — desktop authoring
// =============================================================================

/**
 * @internal Use createSensorService.
 *
 * Returns values seeded from LocationSettings.mockLocation plus runtime
 * overrides from the PreviewWindow's MockSensorPanel. Subscribers receive
 * the current cached value immediately on subscribe so they don't have
 * to wait for the next mutation.
 */
export class MockSensorService extends EventEmitter implements SensorService {
  private currentLocation: GpsReading | null = null;
  private currentBeacons: BeaconReading[] = [];
  private currentOrientation: OrientationReading = {
    alpha: 0, beta: 0, gamma: 0, absolute: false, timestamp: Date.now(),
  };
  private locationSubscribers = new Set<(r: GpsReading) => void>();
  private beaconSubscribers = new Set<(b: BeaconReading[]) => void>();
  private orientationSubscribers = new Set<(r: OrientationReading) => void>();
  // S3 — permission states default to 'granted' so authoring just works.
  // The Mock panel can flip individual permissions to 'denied' / 'prompt'
  // for testing the fallback paths.
  private permissionStates: Record<SensorPermissionName, PermissionState> = {
    gps: 'granted',
    camera: 'granted',
    orientation: 'granted',
    beacons: 'granted',
  };

  /**
   * Seed initial location from the project's LocationSettings. Called
   * by StoryContext at construction time (after the story is set), and
   * whenever the project's mockLocation changes.
   */
  seedFromSettings(loc?: { lat: number; lng: number }): void {
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      this.currentLocation = {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: 5,
        timestamp: Date.now(),
      };
    }
  }

  async getCurrentLocation(): Promise<GpsReading | null> {
    return this.currentLocation;
  }

  watchLocation(callback: (reading: GpsReading) => void): () => void {
    this.locationSubscribers.add(callback);
    // Emit current value immediately so subscribers don't wait for the next change.
    if (this.currentLocation) callback(this.currentLocation);
    return () => { this.locationSubscribers.delete(callback); };
  }

  scanBeacons(callback: (beacons: BeaconReading[]) => void): () => void {
    this.beaconSubscribers.add(callback);
    callback(this.currentBeacons);
    return () => { this.beaconSubscribers.delete(callback); };
  }

  watchOrientation(callback: (reading: OrientationReading) => void): () => void {
    this.orientationSubscribers.add(callback);
    callback(this.currentOrientation);
    return () => { this.orientationSubscribers.delete(callback); };
  }

  getCapabilities(): SensorCapabilities {
    // Mock mode reports everything available — the panel can simulate any reading.
    return { gps: true, beacons: true, orientation: true, camera: false, mock: true };
  }

  setMockLocation(loc: GpsReading): void {
    this.currentLocation = loc;
    for (const sub of Array.from(this.locationSubscribers)) sub(loc);
    this.emit('mockLocationChanged', loc);
  }

  setMockBeacons(beacons: BeaconReading[]): void {
    this.currentBeacons = beacons;
    for (const sub of Array.from(this.beaconSubscribers)) sub(beacons);
    this.emit('mockBeaconsChanged', beacons);
  }

  setMockOrientation(reading: OrientationReading): void {
    this.currentOrientation = reading;
    for (const sub of Array.from(this.orientationSubscribers)) sub(reading);
    this.emit('mockOrientationChanged', reading);
  }

  // ---- cached-reading getters (S3) ----

  getLastKnownLocation(): GpsReading | null { return this.currentLocation; }
  getLastKnownOrientation(): OrientationReading | null { return this.currentOrientation; }
  getLastKnownBeacons(): BeaconReading[] { return this.currentBeacons; }

  // Mock service is in-memory — caches are always "active" and there's
  // no underlying watcher to spawn. Return a no-op unsubscribe.
  ensureLocationCacheActive(): () => void { return () => {}; }
  ensureOrientationCacheActive(): () => void { return () => {}; }
  ensureBeaconCacheActive(): () => void { return () => {}; }

  // ---- permission state API (S3) ----

  async getPermissionState(name: SensorPermissionName): Promise<PermissionState> {
    return this.permissionStates[name] ?? 'granted';
  }

  async requestPermission(name: SensorPermissionName): Promise<PermissionState> {
    // Mock always grants on request unless an explicit deny was set.
    const current = this.permissionStates[name] ?? 'granted';
    if (current === 'prompt') {
      this.permissionStates[name] = 'granted';
      return 'granted';
    }
    return current;
  }

  setMockPermissionState(name: SensorPermissionName, state: PermissionState): void {
    this.permissionStates[name] = state;
    this.emit('mockPermissionChanged', { name, state });
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Construct the appropriate SensorService for the runtime context.
 *
 * `mockMode: true` forces MockSensorService — used by the PreviewWindow
 * during desktop authoring. `mockMode: false` (or absent) returns
 * WebSensorService when navigator.geolocation is available, MockSensorService
 * otherwise (so SSR / test environments don't choke).
 */
export function createSensorService(opts?: { mockMode?: boolean }): SensorService {
  if (opts?.mockMode) return new MockSensorService();
  if (typeof navigator !== 'undefined' && navigator.geolocation) return new WebSensorService();
  // Headless / SSR / test fallback — never crash, just give a no-op-ish service.
  return new MockSensorService();
}
