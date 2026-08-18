# The Field App — Self-Contained Mobile Player with Embedded LLM and Geo-AR

> **Status:** Plan for decision (2026-08-18), expanding Tier-5 item 15 per
> Hartmut's direction: a self-contained iOS/Android app that embeds an LLM
> (Gemma-class) for runtime functions, plus an expanded AR capability — full
> camera view with markers placed in a GPS-traced environment. This
> supersedes the "mobile: explicitly parked" recommendation in
> `Embedded-AI-Design.md`; that doc's Phase 0/1 (desktop) remain valid and
> independent.

## 1. Vision

One artifact class ASAPS cannot produce today: **a story that runs entirely
on a phone in the field** — AI beats answered on-device, no key, no relay, no
signal required — where the physical world is the stage: the player raises
the phone and sees the story's markers standing in the camera view at real
GPS positions, walks to them, and plays.

This is the mobile counterpart of the HTML export, not a variant of it. The
HTML export's ceiling is the browser: no guaranteed camera+orientation
stack, no on-device model, no offline maps. A native app owns all three.

## 2. What already exists (the plan builds on, not from zero)

| Piece | State |
|---|---|
| `apps/player-mobile` | Real Capacitor 6 app, iOS + Android projects, wired to `@asaps/core` + `@asaps/player` + `@asaps/renderer`, storage/AI service scaffolding. **Missing:** `@capacitor/geolocation`, camera permission plumbing. |
| Runtime AI seam | `RuntimeTransport = (body) => Promise<any>` with 4 factories. Embedded LLM = a 5th factory; **zero call-site changes** (the entire point of the 2026-07 adapter consolidation). |
| GPS machinery | `setGpsLocation` capture/scatter (walkable, OSM), named `geoPoints` sets, geofence entries (`xrLocations`: pointName/target/radius/effects), SensorService + MockSensorPanel (position + orientation sliders), Leaflet map view, the Ordinary Wonders template and the GPS field kit as test stories. |
| AR today | `arBeat` = MindAR **image-marker** tracking in the webview (camera via getUserMedia, works in WKWebView/Chrome webview). Verification kit + compiled `.mind` pipeline exist. |
| Model guidance | The per-function audit already establishes: runtime jobs are conversation, direction evaluation, short texts — **small-model territory**. Generation/translation stay authoring-time and are out of scope on device. |

## 3. The three workstreams

### A. App chassis — from demo to field player

- **A1. Sensors:** add `@capacitor/geolocation` (+ native camera/motion
  permissions). Bridge SensorService to native watch — webview geolocation
  works but native survives screen-dim and is what background-tolerant
  walks need.
- **A2. Story intake:** the app opens `.asaps` / `.asapst` files (share
  sheet, Files app, file association — the same copy-on-import semantics as
  the builder). One **generic Field Player** first; a per-story branded app
  ("export as app") is a later build recipe on the same chassis, not a
  separate product.
- **A3. Offline honesty:** assets already travel in the zip; map tiles do
  not. Either cache tiles for the story's operating radius on first open, or
  design geo-AR screens to not need the map at all (the camera view IS the
  map). Decide per-beat, not globally.
- **Deliverable / gate:** Ordinary Wonders plays end-to-end on a real phone
  outdoors — which also finally closes the standing "real device GPS test"
  item.

### B. Embedded LLM — Gemma on device, behind the existing seam

- **B1. Inference runtime:** two candidates, decided by a spike, not by
  argument:
  - **MediaPipe LLM Inference API** — Google's on-device stack, first-class
    Gemma support (task bundles), GPU delegation, Android + iOS. The aligned
    path if Gemma is the blessed family.
  - **llama.cpp via a thin Capacitor plugin** — GGUF freedom (any small
    model), more of the burden on us (Metal/NNAPI config, threading).
- **B2. Model tier:** **Gemma 3n (E2B/E4B)** is the design-center — built
  for phones, ~2-3 GB footprint; Gemma 3 4B int4 as the fallback; a 1B
  text-only floor for low-end devices. Acceptance test is not a benchmark:
  **the rehearsal template's conversation must hold persona, and direction
  evaluation must route correctly, on a mid-range device at usable latency
  (~10 tok/s).**
- **B3. Transport:** `createEmbeddedTransport` — webview → Capacitor plugin
  → native inference, answering the OpenAI-chat shape the adapter already
  emits. Falls back to the story's configured transport (relay/key) when the
  model isn't present.
- **B4. Weight delivery:** download-on-first-AI-story with consent, size
  and battery warnings (reuse the export size-warning UX patterns);
  bundling-in-app via Play Asset Delivery / On-Demand Resources only if a
  deployment demands zero-download.
- **B5. License/ops:** Gemma's terms allow redistribution with terms
  pass-through — the download consent screen carries them. Model version is
  pinned per app release.

### C. Geo-AR — markers standing in the world

The design principle: **geo-AR is a new *view* over the existing location
model, not a new location model.** Markers are placed where `geoPoints`
already live — authored pins, captured positions, scattered walkable points.
Everything the GPS beats learned (honest skip exits, mock sensors, field
kits) carries over.

- **C1. Authoring model:** a new visible beat `geoArScene`: binds to point
  sets by `pointName` (exactly like `gpsLocation`), each entry with
  name/target/radius/effects, plus per-entry marker visual (icon/sprite from
  assets, label, optional distance readout). Authored with the existing
  GpsPointCurator + XRLocationsEditor surfaces.
- **C2. Tier 1 — sensor-fusion AR (webview, works everywhere):** camera
  feed + device orientation (compass + pitch) + GPS → project each point
  onto the screen by bearing/elevation; billboarded markers, tap to trigger.
  Accuracy is GPS (3-10 m) + compass (±10-20°) — **right for "see the
  glowing marker 40 m ahead, walk to it"**, wrong for "pin a label on that
  doorknob". This tier is pure webview (getUserMedia + DeviceOrientation),
  so it also reaches **HTML exports on Android and iOS Safari** — the app is
  the best home, not the only one.
- **C3. Tier 2 — precision AR (app-only, later):** ARCore **Geospatial
  API** (Android + iOS via ARCore; VPS gives sub-meter pose in covered
  areas — Stockholm is covered) behind a Capacitor plugin with a native AR
  view. Same beat, same entries — the tier is a renderer capability, chosen
  at runtime by availability, falling back to Tier 1. ARKit ARGeoAnchor is
  the iOS-native alternative but city coverage is narrower than VPS.
- **C4. Authoring without a street walk:** extend MockSensorPanel with a
  heading control; a preview "geo-AR simulator" renders the same projection
  math over a neutral backdrop, so the beat is authorable and testable at a
  desk. Field verification gets its own kit story (`geo-ar-field-test`), the
  proven pattern.
- **C5. Renderer contract:** `IRenderer.renderGeoArScene(...)`, shaped like
  `renderMap` — including the lessons already paid for (per-mount keys so
  consecutive AR/map beats never share instance state; honest skip exit
  first in connections; permission-denied → fallback target, never a fake
  arrival).

## 4. Phasing and gates

| Phase | Scope | Gate to proceed |
|---|---|---|
| **P0** (~1-2 wk) | Chassis: geolocation plugin, file intake, Ordinary Wonders end-to-end outdoors on both platforms | It plays. Real-device GPS item closed. |
| **P1** (~2-3 wk) | Tier-1 geo-AR: `geoArScene` beat + webview renderer + authoring + mock/preview + field kit. Ships value to HTML exports too. | Field kit passes outdoors; a marker walked-to triggers its target. |
| **P2** (~2-4 wk) | Embedded LLM: runtime spike (MediaPipe vs llama.cpp), plugin + `createEmbeddedTransport`, weight-download UX | Rehearsal template holds persona on a mid-range phone, offline. |
| **P3** (eval) | Tier-2 precision AR (ARCore Geospatial), per-story branded app pipeline, store distribution strategy | A concrete deployment that needs sub-meter anchoring or store presence. |

**Why AR before LLM:** P1's camera/sensor/permission stack is the riskier
unknown and benefits every artifact (HTML export included); P2 is app-only
and its seam is already proven. Swappable if an AI-first deployment appears.

## 5. Risks, named

- **Camera + GPS + compass + LLM stack thermally.** A 30-minute walk with
  all four running is the real test — budget it in P2's gate, and design
  beats so the camera is only live during geoArScene.
- **Compass near buildings** wobbles ±20°+; Tier-1 UX must communicate
  looseness (floating markers, not surgical pins).
- **iOS specifics:** DeviceOrientation needs a user-gesture permission
  prompt; WKWebView getUserMedia is fine (iOS 14.3+); App Store review of a
  model-downloading app is untested territory — TestFlight/sideload covers
  studies long before store distribution matters.
- **Weight size** (~2-3 GB) on cellular — download only on Wi-Fi by
  default.
- **VPS coverage** varies by deployment site — Tier 2 must always degrade
  to Tier 1 without authoring changes.

## 6. Decisions requested

1. **Phase order** — AR-first (as argued) or LLM-first?
2. **Generic Field Player vs per-story app** as the P0 target (plan assumes
   generic first).
3. **Gemma commitment** — bless Gemma 3n as the family (→ MediaPipe spike
   first), or keep the runtime model-agnostic (→ llama.cpp spike first)?
4. **Tier-1 geo-AR in HTML exports too** — it's nearly free once the
   renderer view exists; include in P1 or hold for the app?
