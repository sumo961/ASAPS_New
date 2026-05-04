# XR Beats Roadmap

A planning document for adding spatial / location / sensor beats to ASAPS,
targeted at mobile platforms (PWA in v1, possibly Capacitor or React Native
wrappers in v2+).

Drafted: 2026-05-04. Living document — update as decisions firm up.

## Goals

Bring three new authoring primitives into ASAPS:

1. **GPS-based** beats and triggers — outdoor location stories, treasure
   hunts, audio tours.
2. **Indoor positioning** — Bluetooth-beacon-driven proximity for museum
   exhibits, escape rooms, hotel apps.
3. **AR display** — live camera feed with placed clickable objects, reusing
   the 360° Panorama plumbing where possible.

Plus two enabling extras:

4. **Directional sound** — pan audio based on the position of a source vs.
   the device's heading.
5. **Project-level location settings** + a `gpsProximity` /
   `indoorProximity` ConditionBeat operator so authors can branch on
   location without halting on a visible map.

## The five beats

### XR1. GpsLocationBeat (visible)

Renders an interactive map. Three modes:
- `'display'` — show a location with a continue button. No waiting.
- `'trigger-on-arrival'` — wait until the player walks within `radiusMeters`.
- `'trigger-on-departure'` — wait until the player leaves the radius.

Author parameters: `targetLat`, `targetLng`, `radiusMeters`, `mapStyle`
(`'streets'` / `'satellite'` / `'minimal'`), `showPlayerMarker`,
`customMarker` (asset id), `text` (instructional overlay), `timeout`
(optional max wait → fallthrough).

Uses Leaflet for v1 (free, OpenStreetMap tiles, ~40KB). Mock mode in
PreviewWindow / editor surfaces a "Simulate arrival" button.

Permissions: GPS only.

### XR2. IndoorLocationBeat (visible)

Bluetooth-beacon-driven proximity. Author parameters: `triggerType`
(`'beacon'` only in v1; `'uwb'` and `'rfid'` reserved in schema but not
implemented), `beaconUuid` + `major` + `minor`, `triggerRssi` (signal-
strength threshold), `text`, `timeout`, optional `floorPlanAsset` to
overlay the venue map with the beacon's known position.

**Reality check on UWB / RFID for v1:** both deferred. UWB needs
CoreNearby on iOS and Android `RangingResult` — both require native
modules. RFID/NFC on iOS only allows ID/passport reading, not arbitrary
tag scanning. Schema reserves the trigger types so the field can grow
later without breaking changes.

Permissions: Bluetooth scanning (and on Android, also Location, because
that's how Google licenses Bluetooth scanning).

### XR3. ARDisplayBeat (visible)

Live camera feed with clickable objects placed in 3D space. Reuses the
360° Panorama plumbing — see [Panorama / AR reuse](#panorama--ar-reuse)
below.

Author parameters: `hotspots` (extends PanoramaHotspot with optional
`worldPos: { x, y, z }`), `anchorMode` (`'compass'` — yaw is north;
`'origin-relative'` — yaw is relative to story origin; `'image-tracking'`
deferred to v3), `text`, `timeout`, `requireMovementMeters` (optional
"player must walk N metres" gate).

Permissions: Camera, motion/orientation (iOS-specific permission).

Defer for v1: image-target tracking. Needs MindAR or 8th Wall, big lift,
niche use, can come in a follow-up.

### XR4. DirectionalSound

Two flavours, very different scope:

**(a) Per-beat audio attached to a 3D position.** Sound pans left/right
based on the bearing from the device to the source. Trivial implementation
via Web Audio API's `PannerNode`. Ship as a `spatialPosition` property
on existing video / sound configs.

**(b) Standalone DirectionalSoundBeat.** "Follow the sound to the next
location" — plays panned audio while polling GPS, fires next beat when
the player gets close.

**v1 ships (a). (b) deferred to v2** — needs its own runtime loop and
edge-case handling.

### XR5. Project location settings + ConditionBeat operators

The settings surface lives in the new `LocationSettings` block (see
[S1 below](#s1-locationsettings)). The condition-beat operators are
new entries in the existing ConditionBeat dispatcher:

```typescript
type: 'gpsProximity' | 'indoorProximity' | 'permissionGranted'
```

Invisible beats — they sample the sensor service synchronously, compare
to a threshold, route to `trueTarget` / `falseTarget`. Fits the existing
affect-condition pattern from v0.9.45 (same operator dropdown, same
inspector UI infrastructure).

## Shared substrate

Four pieces of infrastructure must land before any XR beat ships. Each
beat depends on at least three of them, so building a beat without them
just creates a one-off that can't be maintained.

### S1. LocationSettings

A new block on the project, alongside the existing `GlobalSettings`:

```typescript
interface LocationSettings {
  // Story origin — single GPS anchor. Used by AR beat for orientation,
  // by map beat for default centre, by proximity radii.
  originLat?: number;
  originLng?: number;

  // Indoor venue — for indoor-positioning beats.
  venue?: {
    name: string;
    floorPlan?: string;        // assetId of the indoor floorplan image
    floorWidth: number;        // metres
    floorHeight: number;       // metres
  };

  // Default radius (metres) for proximity triggers when not overridden.
  defaultProximityRadiusM?: number;

  // What to do when a required permission is denied. 'skip' falls
  // through to the next beat; 'fallback' redirects to fallbackBeatId.
  onPermissionDenied?: 'skip' | 'fallback';
  fallbackBeatId?: string;

  // Mock location for desktop authoring / testing. PreviewWindow's
  // mock-sensor service uses this when no real GPS is available.
  mockLocation?: { lat: number; lng: number; floor?: number };
}
```

### S2. SensorService

A new runtime service in `@asaps/core/engine/SensorService.ts`, parallel
to `TimerManager`. Wraps platform sensors behind a uniform interface:

```typescript
interface SensorService {
  // GPS — Geolocation API in browser/PWA, native bridge later.
  getCurrentLocation(): Promise<GpsReading | null>;
  watchLocation(
    callback: (r: GpsReading) => void,
    opts?: { accuracy?: 'high' | 'low'; intervalMs?: number },
  ): () => void;  // returns unsubscribe

  // Indoor — Bluetooth scanning + beacon distance estimation.
  scanBeacons(callback: (beacons: BeaconReading[]) => void): () => void;

  // Device orientation/motion.
  watchOrientation(callback: (r: OrientationReading) => void): () => void;

  // What's available on this platform.
  getCapabilities(): SensorCapabilities;

  // Mock injection for desktop authoring.
  setMockLocation(loc: GpsReading): void;
  setMockBeacon(beacons: BeaconReading[]): void;
}
```

Two implementations:
- `WebSensorService` — Geolocation API, Bluetooth Web API (limited),
  DeviceOrientationEvent, getUserMedia for camera. PWA / mobile browsers.
- `MockSensorService` — desktop authoring fallback. Returns values from
  the project's `mockLocation` plus an in-app "simulate location" debug
  panel.

The runtime picks one based on capability detection. **Desktop authoring
uses Mock by default; players on mobile get Web automatically.**

Critical design constraint: **de-dupe underlying watchers**. A story
with 10 GPS-watch beats running concurrently must produce one underlying
`navigator.geolocation.watchPosition` call, fanned out to subscribers.
Otherwise the player's battery dies in 30 minutes.

### S3. Permissions plumbing

Each XR beat needs to reason about what permissions it requires and
what to do when denied. Three pieces:

1. **Probe permissions before the beat enters.** During `onEnter`,
   check the permission state for every sensor the beat will use. If
   any required permission isn't granted, prompt-or-fallback per the
   project's `onPermissionDenied` setting.
2. **Surface permission state in `StoryContext`** so condition beats
   can branch on it: `condition: { type: 'permissionGranted', permissions: ['gps', 'camera'] }`.
3. **Honour the project-level fallback chain.** `'skip'` advances to
   the next beat (silent fall-through); `'fallback'` redirects to the
   `fallbackBeatId`.

This is the single biggest source of "works on simulator, breaks on
device" bugs in mobile dev. Centralising it in S3 — rather than
re-implementing in every beat — is how we avoid that whole class.

### S4. The beat execution model

XR beats blur the visible/invisible line. A GPS proximity trigger is
*invisible* in the sense that it just waits — but *visible* in the
sense that it shows a map UI while waiting. New `xr` category in
`beat-definitions/core-beats.json`:

```json
"category": "xr"
```

Inspector groups XR beats into their own palette section. IRenderer
gets new methods: `renderMap`, `renderAR`, `renderProximityWait`. A new
`XRRenderer` extends ReactRenderer with the actual implementations.

## Panorama / AR reuse

Yes — there's real architectural overlap. Both PanoramaBeat and
ARDisplayBeat are "spherical / spatial environment with clickable
hotspots." The differences:

| | PanoramaBeat | ARDisplayBeat |
|---|---|---|
| Source | static equirectangular image | live camera feed |
| Pose tracking | yaw + pitch from drag/scroll | yaw + pitch + roll from gyroscope; position from VPS or IMU |
| Hotspots | placed in 2D image coords | placed in 3D world coords (relative to origin or detected anchors) |
| Coordinate system | spherical | local-tangent-plane around origin |

Concretely: extract a shared `SpatialHotspotsView` React component that
renders hotspots given the current pose and an array of points with
azimuth/elevation. PanoramaBeat passes a static texture as the
backdrop; ARDisplayBeat passes a `<video>` element from
`navigator.mediaDevices.getUserMedia`. Both compute hotspot positions
on screen from current pose. **~60% code reuse — a real win**, but the
extraction has to happen *first*, before ARDisplayBeat is built. Doing
it the other way means a forked codebase that's hard to merge later.

Tactical sequence: build XR3 in v2, with the first task being to
extract `SpatialHotspotsView` from PanoramaBeat (refactor, no behaviour
change). Then build ARDisplayBeat on top.

## Suggested ship order

### v1 — one release window, ~2-3 weeks of work
1. **S1**: project location settings ✅ *(landed 2026-05-04)*
2. **S2**: SensorService skeleton with mock + web implementations ✅ *(landed 2026-05-04)*
3. **S3**: permissions plumbing + condition operators ✅ *(landed 2026-05-04)*
4. **GpsLocationBeat (XR1)** — placeholder UI, full runtime, MockSensorPanel-driven ✅ *(landed 2026-05-04)*. Leaflet integration deferred to its own commit.
5. **gpsProximity ConditionBeat operator (XR5)** ✅ *(landed alongside S3)*
6. **DirectionalSound option (a)** — `spatialPosition` on existing sound configs ✅ *(landed 2026-05-04)*. Geographic (lat/lng) and azimuth modes via Web Audio PannerNode. Editor UI for sound configs deferred to a follow-up.

**v1 of the XR roadmap is functionally complete.** Authors can build location-anchored stories end-to-end: configure project location settings, place GPS-proximity beats, gate logic with `gpsProximity` Conditions, attach directional sound to specific real-world coordinates. The remaining work is polish (Leaflet for the GPS beat's UI, editor surface for `spatialPosition` on sounds) and v2 features (IndoorLocationBeat, ARDisplayBeat).
4. **GpsLocationBeat** (XR1) — simplest of the five, validates the whole stack (days 7-9)
5. **gpsProximity ConditionBeat operator** (XR5) — comes practically free once S2 lands (day 10)
6. **DirectionalSound option (a)** — `spatialPosition` on existing sound configs (days 11-12)

### v2
7. **IndoorLocationBeat** (XR2, beacon-only) — needs Bluetooth Web API debugged on real Android hardware
8. **ARDisplayBeat** (XR3) — first extract `SpatialHotspotsView` from PanoramaBeat, then build AR on top

### v3
9. **DirectionalSoundBeat standalone** option (b)
10. UWB / RFID / image-target tracking — scoped only after the v1+v2 stack proves stable in real playtests

## Open questions

### Q1. Mobile-first vs PWA-first?

A native iOS/Android wrapper has way better permission UX (Bluetooth,
motion, location all behave more predictably). A PWA is one codebase
for desktop + mobile. **Decision: start PWA — Web APIs are good enough
to validate the design — then evaluate whether to wrap with Capacitor
or React Native after a real mobile playtest.**

### Q2. Mapping library?

- **Leaflet** — free, OpenStreetMap tiles, ~40KB, MIT licensed.
- **Mapbox GL** — better UX, GPU-accelerated tiles, paid above 50K loads/month.
- **Google Maps** — heaviest, locked-in.

**Decision: Leaflet for v1.** Cost-free for any user volume, good
enough for the proximity-trigger use case. If polish becomes an issue
post-launch, Mapbox is a localised swap.

### Q3. Story portability across devices

A story that requires GPS + camera + Bluetooth on a desktop preview is
broken by definition. The mock-location authoring story matters a lot.
**Design the PreviewWindow to fully support mock-everything before
shipping any XR beat.** This is what the `MockSensorService` exists for.

### Q4. Where does pose tracking live?

Naive answer: "in the AR beat's renderer." Better answer: "in
`SensorService`, expose pose as another stream like location, so
multiple beats can subscribe." That's also more upfront work.
**Decision: start inside the AR beat, refactor out into SensorService
if and when a second consumer appears.**

### Q5. Battery and privacy

A story with 10 GPS-watch beats *will* destroy a phone's battery if
each starts an independent watcher. `SensorService` must de-dupe — one
underlying watcher per sensor, fan out to subscribers. **Designed in
from day one (see [S2](#s2-sensorservice)).** Privacy: every sensor
access surfaces a permission prompt to the player, and the project's
`LocationSettings.onPermissionDenied` controls graceful degradation.

## See also

- [docs/XR-S1-S2-Plan.md](XR-S1-S2-Plan.md) — concrete PR-ready plan
  for the first two infrastructure pieces (LocationSettings + SensorService).
