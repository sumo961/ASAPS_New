# XR Infrastructure: S1 + S2 — Implementation Plan

PR-ready plan for the first two pieces of the XR substrate:

- **S1 — `LocationSettings`** on the project, alongside `GlobalSettings`.
- **S2 — `SensorService`** runtime, parallel to `TimerManager`, with
  `WebSensorService` and `MockSensorService` implementations.

S3 (permissions) and S4 (beat execution model) are explicitly out of
scope here — they depend on S1+S2 landing first. Designed so that no
XR beat needs to ship in this PR; it's pure infrastructure.

Drafted: 2026-05-04. See [XR-Roadmap.md](XR-Roadmap.md) for the broader
context.

## Goals

1. Land the LocationSettings shape in `GlobalSettings` so authors
   can declare a story origin, indoor venue, default proximity radius,
   and mock location — ready to be referenced by every XR beat.
2. Land a `SensorService` interface plus two implementations
   (`WebSensorService` for PWA / mobile browsers, `MockSensorService`
   for desktop authoring) so beats have a uniform way to ask for GPS,
   beacons, and orientation without caring about the platform.
3. Wire the SensorService into `StoryContext` so beats access it the
   same way they access `TimerManager` today.
4. Add a `MockSensorPanel` to the Preview Window so authors can
   simulate location, beacon proximity, and orientation while testing
   on desktop.

Non-goals for this PR:
- No UI for editing `LocationSettings` in the GlobalSettings dialog
  (just the schema lands; the editor follows in S4).
- No XR beats. No condition-beat operators for location.
- No real Bluetooth scanning; `WebSensorService.scanBeacons` lands
  with a clear "not yet wired" stub. The shape is defined; the
  Bluetooth Web API integration ships in S5/v2.
- No permission UX. Browsers will prompt natively when
  `getCurrentLocation` is first called; that's good enough for now.

## File-level plan

### New files

```
packages/core/src/engine/SensorService.ts
packages/core/src/engine/__tests__/SensorService.test.ts
packages/builder/src/components/preview/MockSensorPanel.tsx
```

### Modified files

```
packages/builder/src/storage/types.ts         (add LocationSettings to GlobalSettings)
packages/core/src/engine/StoryContext.ts      (instantiate + expose SensorService)
packages/core/src/engine/index.ts             (export SensorService types)
packages/core/src/index.ts                    (re-export from engine)
packages/builder/src/pages/PreviewWindow.tsx  (mount MockSensorPanel during dev/preview)
docs/USER_GUIDE.md                            (one paragraph + screenshot in the project-settings section — defer to S4 once UI lands)
```

## S1 — `LocationSettings` schema

### Add to `packages/builder/src/storage/types.ts`

Append a new optional block to `GlobalSettings`. Keeping it optional
guarantees existing projects load unchanged — `globalSettings.location`
is read with `?.` everywhere it's referenced.

```typescript
/**
 * XR / location settings (v0.9.48+). Optional — projects without any XR
 * beats leave this undefined and pay no runtime cost. When XR beats are
 * present, they read origin / venue / mockLocation off this block.
 *
 * The story origin is a single GPS anchor used by:
 *   - GpsLocationBeat (default centre when no targetLat/targetLng given)
 *   - ARDisplayBeat (yaw=0 reference for 'origin-relative' anchorMode)
 *   - DirectionalSound (bearing reference for spatialPosition)
 *   - All proximity radii (haversine-from-origin shortcuts)
 */
location?: {
  /** Story origin / anchor — single GPS point. */
  originLat?: number;
  originLng?: number;

  /**
   * Indoor venue — for indoor-positioning beats. Floorplan dimensions
   * are in metres; the floorplan asset is rendered at scale on top of
   * the player's known beacon position.
   */
  venue?: {
    name: string;
    floorPlan?: string;        // assetId of the floorplan image
    floorWidth: number;        // metres
    floorHeight: number;       // metres
  };

  /**
   * Default radius (metres) for proximity triggers when an XR beat
   * doesn't specify its own. Typical values: 5m for room-scale,
   * 25m for "you've arrived at the building", 100m for "you're in
   * the right neighbourhood".
   */
  defaultProximityRadiusM?: number;

  /**
   * What the engine does when an XR beat requires a permission the
   * player has denied:
   *   - 'skip'     — fall through to the next beat (silent).
   *   - 'fallback' — redirect to fallbackBeatId (or to next beat if
   *                  fallbackBeatId is unset).
   *
   * This is the global default; individual beats can override.
   */
  onPermissionDenied?: 'skip' | 'fallback';
  fallbackBeatId?: string;

  /**
   * Mock location for desktop authoring / testing. The MockSensorService
   * uses this when no real GPS is available. The PreviewWindow's
   * MockSensorPanel surfaces editable fields seeded from this value.
   *
   * `floor` is an optional number for indoor venues (1 = ground, 2 =
   * first up, etc.); used by the indoor-position beat's mock path.
   */
  mockLocation?: { lat: number; lng: number; floor?: number };
};
```

### Migration

Zero-cost — the field is optional and missing on every existing
project. New projects don't get a default `location` block; it's
created lazily on first edit (when the GlobalSettings dialog grows
the XR section in S4).

### Tests

In `packages/builder/src/storage/__tests__/types.test.ts` (or the
existing GlobalSettings round-trip test if there is one), confirm:
- A project saved without `location` round-trips through serialize/load
  with `location` undefined.
- A project saved *with* a populated `location` block round-trips
  with all fields preserved.

The schema change is so minimal that this is mostly a type-system
verification — TypeScript catches most regressions at compile time.

## S2 — `SensorService` runtime

### Type signatures

In `packages/core/src/engine/SensorService.ts`:

```typescript
import { EventEmitter } from 'eventemitter3';

// =============================================================================
// Reading types
// =============================================================================

export interface GpsReading {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres, per the Geolocation API. */
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

export interface BeaconReading {
  /** iBeacon UUID, Eddystone namespace, or vendor-specific id. */
  uuid: string;
  /** Optional iBeacon major / minor for further filtering. */
  major?: number;
  minor?: number;
  /** Received signal strength in dBm. Closer to 0 = stronger signal. */
  rssi: number;
  /** Estimated distance in metres, derived from rssi if calibration known. */
  distance?: number;
  timestamp: number;
}

export interface OrientationReading {
  /** Compass heading in degrees, 0=N. May be null on iOS without permission. */
  alpha: number | null;
  /** Front-back tilt in degrees. Forward-tilt > 0. */
  beta: number;
  /** Left-right tilt in degrees. Right-tilt > 0. */
  gamma: number;
  /** Whether alpha is referenced to true north (vs. arbitrary). */
  absolute: boolean;
  timestamp: number;
}

export interface SensorCapabilities {
  gps: boolean;            // Geolocation API present
  beacons: boolean;        // Bluetooth Web API present
  orientation: boolean;    // DeviceOrientationEvent present
  camera: boolean;         // getUserMedia present (used by AR beat)
  /** True when this is the MockSensorService (authoring context). */
  mock: boolean;
}

// =============================================================================
// Service interface
// =============================================================================

/**
 * Unified sensor access for XR beats. Wraps platform-specific APIs
 * (Geolocation, Bluetooth Web, DeviceOrientationEvent) behind a stable
 * interface that beats can rely on regardless of platform.
 *
 * Two implementations:
 *   - WebSensorService — production, real sensors via browser APIs
 *   - MockSensorService — desktop authoring, returns values from the
 *     project's LocationSettings.mockLocation plus runtime overrides
 *     from the MockSensorPanel
 *
 * The runtime picks one based on capability detection at startup.
 *
 * Critical design constraint: subscribers SHARE underlying watchers.
 * A story with 10 GPS-watch beats running concurrently produces ONE
 * underlying navigator.geolocation.watchPosition call, fanned out
 * to all subscribers via the event emitter. Otherwise battery dies
 * in 30 minutes on real mobile playback.
 */
export interface SensorService {
  /** One-shot location read. Resolves null if denied / unavailable. */
  getCurrentLocation(): Promise<GpsReading | null>;

  /**
   * Subscribe to continuous location updates. Returns an unsubscribe
   * function. Multiple subscribers share one underlying watcher.
   */
  watchLocation(
    callback: (reading: GpsReading) => void,
    opts?: { accuracy?: 'high' | 'low'; intervalMs?: number },
  ): () => void;

  /**
   * Subscribe to beacon scan results. Returns an unsubscribe function.
   * v1: stub on Web — Bluetooth Web API integration ships in v2.
   */
  scanBeacons(callback: (beacons: BeaconReading[]) => void): () => void;

  /**
   * Subscribe to device orientation updates. Returns an unsubscribe
   * function. Multiple subscribers share one underlying listener.
   */
  watchOrientation(callback: (reading: OrientationReading) => void): () => void;

  /** What this service can do on this platform. */
  getCapabilities(): SensorCapabilities;

  // ---- mock-injection methods (no-op on production WebSensorService) ----
  setMockLocation(loc: GpsReading): void;
  setMockBeacons(beacons: BeaconReading[]): void;
  setMockOrientation(reading: OrientationReading): void;
}
```

### `WebSensorService` — implementation sketch

```typescript
export class WebSensorService extends EventEmitter implements SensorService {
  private locationWatchId: number | null = null;
  private locationSubscribers = new Set<(r: GpsReading) => void>();
  private orientationSubscribers = new Set<(r: OrientationReading) => void>();
  private orientationListenerInstalled = false;

  async getCurrentLocation(): Promise<GpsReading | null> {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(this.normalizePosition(pos)),
        () => resolve(null),  // permission denied / unavailable
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    });
  }

  watchLocation(callback, opts): () => void {
    this.locationSubscribers.add(callback);
    // Lazy: only start the underlying watcher when the first subscriber arrives.
    if (this.locationWatchId === null && navigator.geolocation) {
      this.locationWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const reading = this.normalizePosition(pos);
          for (const sub of this.locationSubscribers) sub(reading);
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
      // Tear down the underlying watcher when the last subscriber leaves.
      if (this.locationSubscribers.size === 0 && this.locationWatchId !== null) {
        navigator.geolocation.clearWatch(this.locationWatchId);
        this.locationWatchId = null;
      }
    };
  }

  scanBeacons(_callback): () => void {
    console.warn('[SensorService] Bluetooth scanning not yet implemented (v2)');
    return () => {};
  }

  watchOrientation(callback): () => void {
    this.orientationSubscribers.add(callback);
    if (!this.orientationListenerInstalled && typeof window !== 'undefined') {
      const handler = (e: DeviceOrientationEvent) => {
        const reading: OrientationReading = {
          alpha: e.alpha,
          beta: e.beta ?? 0,
          gamma: e.gamma ?? 0,
          absolute: e.absolute ?? false,
          timestamp: Date.now(),
        };
        for (const sub of this.orientationSubscribers) sub(reading);
      };
      window.addEventListener('deviceorientation', handler);
      this.orientationListenerInstalled = true;
    }
    return () => { this.orientationSubscribers.delete(callback); };
  }

  getCapabilities(): SensorCapabilities {
    return {
      gps: typeof navigator !== 'undefined' && !!navigator.geolocation,
      beacons: false,  // not in v1
      orientation: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
      camera: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      mock: false,
    };
  }

  // No-ops on production. Logged at warn so accidental mock-call from
  // a non-MockSensorService context surfaces during development.
  setMockLocation(_loc: GpsReading) { console.warn('[SensorService] setMockLocation ignored on WebSensorService'); }
  setMockBeacons(_b: BeaconReading[]) { console.warn('[SensorService] setMockBeacons ignored on WebSensorService'); }
  setMockOrientation(_r: OrientationReading) { console.warn('[SensorService] setMockOrientation ignored on WebSensorService'); }

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
```

### `MockSensorService` — implementation sketch

```typescript
export class MockSensorService extends EventEmitter implements SensorService {
  private currentLocation: GpsReading | null = null;
  private currentBeacons: BeaconReading[] = [];
  private currentOrientation: OrientationReading = {
    alpha: 0, beta: 0, gamma: 0, absolute: false, timestamp: Date.now(),
  };
  private locationSubscribers = new Set<(r: GpsReading) => void>();
  private beaconSubscribers = new Set<(b: BeaconReading[]) => void>();
  private orientationSubscribers = new Set<(r: OrientationReading) => void>();

  /**
   * Seed initial location from the project's LocationSettings. Called
   * by StoryContext at construction time after the story is set.
   */
  seedFromSettings(loc?: { lat: number; lng: number }) {
    if (loc) {
      this.currentLocation = {
        lat: loc.lat, lng: loc.lng,
        accuracy: 5, timestamp: Date.now(),
      };
    }
  }

  async getCurrentLocation(): Promise<GpsReading | null> {
    return this.currentLocation;
  }

  watchLocation(callback): () => void {
    this.locationSubscribers.add(callback);
    if (this.currentLocation) callback(this.currentLocation);  // emit immediately
    return () => { this.locationSubscribers.delete(callback); };
  }

  scanBeacons(callback): () => void {
    this.beaconSubscribers.add(callback);
    callback(this.currentBeacons);
    return () => { this.beaconSubscribers.delete(callback); };
  }

  watchOrientation(callback): () => void {
    this.orientationSubscribers.add(callback);
    callback(this.currentOrientation);
    return () => { this.orientationSubscribers.delete(callback); };
  }

  getCapabilities(): SensorCapabilities {
    // In mock mode, everything is available — the panel can simulate any reading.
    return { gps: true, beacons: true, orientation: true, camera: false, mock: true };
  }

  setMockLocation(loc: GpsReading): void {
    this.currentLocation = loc;
    for (const sub of this.locationSubscribers) sub(loc);
    this.emit('mockLocationChanged', loc);
  }

  setMockBeacons(beacons: BeaconReading[]): void {
    this.currentBeacons = beacons;
    for (const sub of this.beaconSubscribers) sub(beacons);
    this.emit('mockBeaconsChanged', beacons);
  }

  setMockOrientation(reading: OrientationReading): void {
    this.currentOrientation = reading;
    for (const sub of this.orientationSubscribers) sub(reading);
    this.emit('mockOrientationChanged', reading);
  }
}
```

### Selecting between Web and Mock at runtime

Two contexts:

- **PreviewWindow** (and the editor's in-app preview): use Mock.
  Authors are at a desktop testing the story.
- **HTML export / live PWA playback**: use Web.

The cleanest selector lives at SensorService construction time in
`StoryContext`:

```typescript
function createSensorService(opts: { mockMode?: boolean }): SensorService {
  if (opts.mockMode || !hasGeolocation()) return new MockSensorService();
  return new WebSensorService();
}
```

The PreviewWindow passes `mockMode: true` when constructing its
StoryContext. Production playback (HTMLExporter-generated bundles)
constructs `StoryContext` without that flag, so they get Web.

### Wire into `StoryContext`

```typescript
// In StoryContext.ts:
private sensorService: SensorService;

constructor(initialState?: Partial<StoryState>, story?: Story, opts?: { mockMode?: boolean }) {
  super();
  // ... existing initialization ...
  this.sensorService = createSensorService({ mockMode: opts?.mockMode });

  // Seed mock location from project's LocationSettings when in mock mode.
  if (opts?.mockMode && this.sensorService instanceof MockSensorService) {
    const mockLoc = (story as any)?.getGlobalSettings?.()?.location?.mockLocation;
    if (mockLoc) this.sensorService.seedFromSettings(mockLoc);
  }
}

getSensorService(): SensorService {
  return this.sensorService;
}
```

The `opts.mockMode` parameter is **additive** — every existing
caller of `new StoryContext(...)` works unchanged because the new
parameter is optional and defaults to capability-detected.

## MockSensorPanel — Preview Window UI

A small panel mounted in the PreviewWindow when the active story has
any XR beat. Surfaces editable fields seeded from the project's
`location.mockLocation` plus controls to nudge them at runtime so
authors can simulate "walking" toward a target.

Key controls:
- **Location** — lat/lng number inputs. "Snap to target" button when
  the next XR beat has one.
- **Walk** — directional nudge buttons (N / S / E / W, configurable
  step in metres) that mutate the mock location.
- **Beacons** — a multi-select of beacons authored in the project's
  IndoorLocationBeat instances; toggle "in range" with simulated RSSI.
- **Orientation** — three sliders (alpha 0-360, beta -90 to 90,
  gamma -90 to 90).

Calls `sensorService.setMockLocation` / `setMockBeacons` /
`setMockOrientation` on every change. The XR beats subscribed via
`watchLocation` etc. receive updates immediately and re-render.

### Visibility rule

Mount the panel in the PreviewWindow only when:
- The active story contains at least one beat with `category: 'xr'`
  (we'll ensure this category exists in the schema even though no
  beats land in this PR — the panel just won't appear until a beat
  is added).

This keeps the panel out of the way for non-XR stories.

## Tests

### `SensorService.test.ts` (core)

Unit tests for the service interface. Mock `navigator.geolocation`
and `window.addEventListener('deviceorientation', …)` via vitest's
`vi.stubGlobal`. Cover:

1. `WebSensorService.getCurrentLocation` resolves with normalised
   `GpsReading` from a mocked Geolocation success callback.
2. `WebSensorService.getCurrentLocation` resolves null when the mocked
   Geolocation calls the error callback.
3. `WebSensorService.watchLocation` subscribers all receive the same
   reading from a single underlying `watchPosition` call (de-dupe
   semantics — the critical correctness property).
4. `WebSensorService.watchLocation` clears the underlying watcher
   when the last subscriber unsubscribes.
5. `WebSensorService.getCapabilities` correctly reports gps:true /
   gps:false based on `navigator.geolocation` presence.
6. `MockSensorService.setMockLocation` immediately delivers the new
   reading to every active subscriber.
7. `MockSensorService.seedFromSettings` populates `getCurrentLocation`'s
   resolved value.
8. Subscribing then unsubscribing then re-subscribing doesn't leave
   ghost subscribers (regression test for `Set.delete`).

### Storage round-trip test

In whichever existing test exercises GlobalSettings serialize / load,
add a case that round-trips a fully-populated `location` block (all
fields set, including `venue` and `mockLocation`) and confirms equality.

## Sequence of work

The actual order I'd cut commits. Each step compiles and passes type-check
on its own — no half-broken intermediate states.

1. **Add `LocationSettings` to GlobalSettings** in
   `packages/builder/src/storage/types.ts`. Type-check passes immediately
   (the field is optional). Add the round-trip test. **~30 min.**

2. **Author SensorService.ts** with the interface, both implementations,
   and the `createSensorService` factory. No StoryContext wiring yet.
   Build core. **~3 hours.**

3. **Write SensorService.test.ts** with all 8 cases above. Run. Fix.
   **~1.5 hours.**

4. **Wire SensorService into StoryContext** (constructor, getter,
   mock-mode plumbing). Update the few callers that need to pass
   `{ mockMode: true }` from PreviewWindow. Confirm existing
   StoryContext tests still pass. **~1 hour.**

5. **Build MockSensorPanel** in
   `packages/builder/src/components/preview/MockSensorPanel.tsx`. Skip
   the visibility rule for now — always mount in PreviewWindow during
   dev and add the rule once a real XR beat exists to gate against.
   **~3 hours.**

6. **Smoke-test** end-to-end in the dev server: open a project, add
   a project-level `location` block manually (via the IndexedDB
   inspector since there's no UI yet), open PreviewWindow, see the
   MockSensorPanel pre-populated, drag the orientation alpha slider,
   confirm a console-log subscriber receives the events. **~30 min.**

7. **Document**. Update [XR-Roadmap.md](XR-Roadmap.md) with the
   shipped state of S1+S2 (move the relevant bullets from "planned"
   to "done"). One-line addition to Progress.md. README and
   VERSION_HISTORY get an entry only when the next user-facing piece
   ships (S4's UI / first XR beat).

**Total estimate: roughly 9 hours of focused work, plus the usual
dev-server smoke testing and follow-up review.** Comfortably one
release window if no XR beats also need to land in the same release.

## Risks and mitigations

### Battery drain from mis-implemented de-dupe

The single biggest correctness risk. If multiple subscribers each
spawn their own `watchPosition` call, mobile battery dies in 30
minutes. Mitigation: the test suite specifically exercises the
"multiple subscribers, one underlying watcher" property; we land
that test before any XR beat consumes the API.

### iOS DeviceOrientationEvent permission

iOS 13+ requires explicit user gesture to access
DeviceOrientationEvent (`requestPermission()`). The `WebSensorService`
should handle this transparently — likely a one-time permission
prompt fired from the first beat that needs orientation. **Defer the
prompt logic to S3 (permissions plumbing).** S2 ships with the
listener installed; if iOS hasn't been authorized, events just
don't arrive. Beats subscribing to `watchOrientation` see no
callbacks; that's acceptable v1 behaviour.

### Mock vs real-sensor coordinate-system mismatches

DeviceOrientationEvent's coordinate convention varies subtly across
iOS / Android / desktop. The Mock service explicitly uses absolute
true-north for alpha, but real Web readings on Android may be
relative to device-startup-orientation. **Defer cross-platform
calibration to v2.** Document the mock convention in the type
comment so beats author against a stable expectation.

### Web Bluetooth API gap

`scanBeacons` lands as a stub in v1. The Bluetooth Web API requires
a user-gesture-initiated `requestDevice` call and only works on a
subset of mobile browsers. **Real implementation deferred to v2
along with IndoorLocationBeat.** The service interface is locked
in now so v2 doesn't reshape it.

### TimerManager-shaped misuse

`TimerManager` is a concrete class, not an interface — beats
instantiate or inject it directly. We're shipping
`SensorService` as an interface with two implementations. Future
maintainers might mistakenly try to `new SensorService()`. The factory
function `createSensorService` is the canonical entry point;
class declarations stay marked `@internal` in JSDoc to discourage
direct construction.

## Done-criteria checklist

- [ ] `LocationSettings` block added to `GlobalSettings` interface
- [ ] Storage round-trip test for the new block passes
- [ ] `SensorService.ts` created in `@asaps/core/engine` with
      `WebSensorService`, `MockSensorService`, and
      `createSensorService` exports
- [ ] All 8 unit tests in `SensorService.test.ts` pass
- [ ] `StoryContext` exposes `getSensorService()` and accepts
      `{ mockMode?: boolean }` in its constructor
- [ ] PreviewWindow constructs StoryContext with `mockMode: true`
      and seeds the mock service from project settings
- [ ] `MockSensorPanel` mounts in PreviewWindow during dev, dragging
      the orientation slider triggers a console-log subscriber
- [ ] `npm run build:core` succeeds
- [ ] `npm run type-check` clean across all packages
- [ ] Progress.md gets a one-line entry referencing this PR
- [ ] [XR-Roadmap.md](XR-Roadmap.md) updated to mark S1+S2 done

## See also

- [docs/XR-Roadmap.md](XR-Roadmap.md) — the broader roadmap and the
  five XR beats that depend on this substrate.
- `packages/core/src/engine/TimerManager.ts` — pattern reference for
  the SensorService implementation (EventEmitter-based, lazy init,
  unsubscribe semantics).
- `packages/builder/src/storage/types.ts` lines 117-164 — pattern
  reference for the `LocationSettings` block within `GlobalSettings`.
