# Testing Protocol — Experimental & Hardware Beats

Coverage:
- **QR Scan** (`qrScan`, experimental)
- **Web View** (`webView`, experimental)
- **AR Scene** (`arBeat`, experimental)
- **GPS Location** (`gpsLocation`)
- **Indoor Location** (`indoorLocation`)

These beats either talk to hardware (camera, GPS, Bluetooth) or rely on
runtime conditions we can't unit-test (network, marker recognition,
geolocation drift). The protocol below is what we do instead — manual
verification on real devices with documented pass/fail criteria.

---

## Equipment checklist

| Need | Beats that need it | Notes |
|---|---|---|
| Modern phone with camera + browser | QR, AR, GPS, Indoor | Android Chrome or iOS Safari. iOS needs HTTPS or local mDNS for camera/location. |
| Printer (color, A4 / Letter) | QR, AR | For markers + QR sheets |
| Web hosting (Netlify / Vercel / GitHub Pages) | Web View, AR, QR | Or local mkcert HTTPS — phone-side needs HTTPS for camera & geolocation. |
| MindAR compiler (web tool) | AR | <https://hiukim.github.io/mind-ar-js-doc/tools/compile> — turns a JPG into the `.mind` binary |
| Bluetooth beacons (optional) | Indoor | Skippable: MockSensorPanel covers the authoring side end-to-end |
| Outdoor space with mapped points | GPS | A short loop with 3-5 GPS waypoints 10-20 m apart |
| Indoor space + floor plan image | Indoor | A floor plan PNG + measurements |

---

## Test story fixtures

For each beat under test, build the **smallest possible story** in the
editor that exercises it. Same skeleton each time so the visual indicator
of pass / fail is consistent:

```
titleScreen [Start the test]
  ↓
infoText "About to test <beat>"
  ↓
<beat under test>     ← what we're verifying
  ↓ (success branch)
infoText "✓ PASS: <expected outcome>"
  ↓
endScreen
  ↓ (failure / cancel branch)
infoText "✗ FAIL: <unexpected — note what happened>"
  ↓
endScreen
```

Successful runs land on a clearly-labeled Pass screen; wrong paths land
on Fail with room for notes.

---

## QR Scan

### Setup

Print 4 QR codes using the in-editor generator (qrScan beat → Inspector
→ QR generator panel):

- **A**: `asaps://beat/<id-of-pass-beat>` — direct beat jump
- **B**: `asaps://variable/scanned/red` — set variable
- **C**: `asaps://inventory/add/badge` — add inventory item
- **D**: Plain text `WORLD42` — non-asaps payload

### Test story structure

```
titleScreen
  → infoText "Scan one of the test QR codes"
    → qrScan (interpretAsapsUri: true, saveTo: "scanned", matchPatterns: [])
      → infoText "✓ PASS: routed via QR"
        → endScreen
      → infoText "✗ FAIL: cancel exit (note which QR was scanned)"
        → endScreen
```

### Tests (in order)

1. **Camera permission** — open the story on the device. qrScan triggers — camera prompt appears? Allow → camera feed visible.
2. **Scan A** — hold the QR sheet up. Routes to the Pass beat? (`asaps://beat` verb)
3. **Scan B** — fresh run; scan B. Variable `scanned` ends up as `red`? Verify via a ConditionBeat or display.
4. **Scan C** — fresh run; scan C. Badge lands in inventory? Verify via inventory display or "has badge" condition.
5. **Scan D** — fresh run with `interpretAsapsUri: false`; scan D. Does `saveTo` variable get `WORLD42`?
6. **Pattern match** — configure `matchPatterns: ['^WORLD\\d+$']`. Scan D again — passes. Scan an unrelated QR (any package label) — rejected, helperText hints to retry.
7. **Cancel** — tap Cancel — routes via cancel exit?
8. **Permission denied** — deny camera permission. Routes via denied exit (or fallback)? Warning text visible?

### Platform coverage

Repeat tests 1-3 on Electron desktop (laptop webcam) and on a PW HTML
export hosted somewhere with HTTPS (iOS Safari).

---

## Web View

### Setup

Create three test pages and host them (a Netlify drop or `gh-pages`
branch is fastest):

- **page-static**: just `<h1>Hello</h1>` and nothing else
- **page-exit**: `<script>setTimeout(() => location.href = 'https://example.com/done', 3000)</script>`
- **page-postmessage**: button that calls `parent.postMessage('done-via-message', '*')`

### Test story structure

```
titleScreen
  → infoText "Loading external page"
    → webView (url: <page-url>, exitUrlPattern: '...', doneButtonText: 'Done')
      → infoText "✓ PASS: webView exited cleanly"
        → endScreen
      → infoText "✗ FAIL: unexpected exit"
        → endScreen
```

### Tests (in order)

1. **Slot mode embed** — `url: page-static`. Loads inside the responsive slot? Done button visible? Tap → exits cleanly to next beat.
2. **Exit URL pattern** — `url: page-exit`, `exitUrlPattern: 'example.com/done'`. After 3 s does the beat auto-exit and route forward?
3. **postMessage exit** — `url: page-postmessage`. Click the in-page button. Beat exits?
4. **passContext** — set a variable in the prior beat; configure `passContext: ['playerName']`. In the loaded page, check `location.hash` — should contain `playerName=…`.
5. **Fixed mode** — switch the beat to fixed-locations mode with a baked rectangle. Repeat tests 1-3 in fixed-locations mode.
6. **CORS-blocked URL** — load a site that blocks iframes (Google, Twitter). Web / PW should be blank (X-Frame-Options). Electron's `<webview>` should load. Confirm the difference matches the docs.
7. **Cross-platform** — run web preview, Electron, and PW export. Electron should be more permissive (via `<webview>` over iframe).

---

## AR Scene

### Setup

Slowest setup but the most rewarding once it works:

1. Pick a printable marker image — high contrast pattern, NOT a photo with low-contrast areas. MindAR's docs include sample images.
2. Upload to <https://hiukim.github.io/mind-ar-js-doc/tools/compile>, download the `.mind` file.
3. Print the source image at A5 or larger on **white, matte** paper (NOT glossy). Tape it flat to a surface that won't move.
4. Upload the `.mind` file to your test story as an asset.
5. Author 2 anchors in the arBeat inspector:
   - **Anchor 1**: text label "Found you!" at offset (0, 0, 0), `onTap` = bare beat id `pass-beat`
   - **Anchor 2**: text label "Right side" at offset (0.3, 0, 0), `onTap` = `asaps://variable/picked/right`

### Test story structure

```
titleScreen
  → infoText "Point your camera at the marker"
    → arBeat (trackingMode: 'marker', markerAssetId: <.mind file>, anchors: [...])
      → infoText "✓ PASS: tapped Anchor 1"  (target of Anchor 1's onTap)
        → endScreen
      → infoText "✓ PASS: scanned Anchor 2 (picked=right)"  (after asaps://variable/picked/right)
        → endScreen
      → infoText "✗ Cancel — Skip pressed"
        → endScreen
```

### Tests (in order)

1. **MindAR load** — open story on phone. Beat shows "Loading AR tracker…" briefly, then "Aim at the marker". If it shows "AR tracker unavailable" + "Use simple overlay" button, CDN load failed — falls back to Phase 1a screen-space cards.
2. **Marker detection** — aim camera at the printed marker. Both anchor cards appear?
3. **Marker lost** — tilt camera away. Both cards disappear?
4. **Anchor tap** — with marker visible, tap Anchor 1. Routes to pass beat?
5. **`asaps://` onTap** — fresh run; tap Anchor 2. Variable `picked` ends up `right`?
6. **Cancel** — tap Skip — routes via cancel exit?
7. **Fallback path** — deliberately break by uploading a corrupt `.mind` file. Error overlay appears with "Use simple overlay". Tap → falls back to flat anchor cards (Phase 1a). Tap Anchor 1 → still routes correctly.
8. **Multiple anchors** — add a third anchor at offset (-0.3, 0, 0). All three visible / tappable when marker is in frame.

---

## GPS Location

### Setup

1. Pick 3 outdoor waypoints 10-20 m apart. Get lat/lng from Google Maps (right-click → copy coordinates).
2. In the story, GpsLocationBeat with three locations matching those coordinates. Each location has its own next-beat target and a small Effect (e.g., set variable `visited_<n> = true`).
3. Set `proximityRadius` to 5 m initially (tight), then 15 m on a second pass (loose) to compare.
4. Configure `permissionDeniedPolicy: 'fallback'` with a fallback target.

### Test story structure

```
titleScreen
  → infoText "Walk to one of the three waypoints"
    → gpsLocation (locations: [<3 waypoints>], proximityRadius: 5)
      → infoText "✓ PASS: hit waypoint 1"  → endScreen
      → infoText "✓ PASS: hit waypoint 2"  → endScreen
      → infoText "✓ PASS: hit waypoint 3"  → endScreen
      → infoText "✗ Permission denied (fallback fired)" → endScreen
```

### Desktop authoring pass (no walking required)

Open the test story in the editor or web preview with **MockSensorPanel**
enabled (Tools menu → Mock Sensors).

1. **First-location-wins** — set mock GPS coordinates to one waypoint. That location's Effects fire and the next-beat target routes?
2. **Walk simulation** — use the MockSensorPanel N/S/E/W buttons (5 m steps) to "walk" across the 3 waypoints. Each fires in order? Effects cumulative?
3. **No-match** — set coordinates far from all three. Nothing fires? (No false positives.)

### Outdoor walking test

Requires the phone, ideally on a clear day with sky visibility.

4. **Permission** — navigate to the story URL on phone (HTTPS or local mDNS). Geolocation permission prompts?
5. **Real GPS** — stand on/near waypoint 1. Within ~10-20 seconds, that location's Effects fire? (GPS lock can take a moment.)
6. **Drift** — walk a slow loop touching each waypoint. Each Effects bundle runs once?
7. **Denied** — deny geolocation permission. Routes via the fallback target?

---

## Indoor Location

The trickiest beat to fully verify — Bluetooth beacons need real hardware
OR a serious mock setup. **Recommended scope: MockSensorPanel only.**
Leave physical beacon testing as a future deep-dive when you have
beacons in hand.

### Setup (mock)

1. Floor plan PNG — any image (even a hand-drawn sketch works). Set dimensions in metres in the beat config.
2. Place 3 indoor location markers on the floor plan at known (x, y) coordinates.
3. Each location gets a fake beacon UUID (`beacon-a`, `beacon-b`, `beacon-c`) registered in the project's IndoorVenue config.
4. Each location has its own next-beat target.

### Test story structure

```
titleScreen
  → infoText "Approach one of the three beacon zones"
    → indoorLocation (floorPlan: <png>, locations: [<3 zones>], beacons: {a,b,c})
      → infoText "✓ PASS: zone A" → endScreen
      → infoText "✓ PASS: zone B" → endScreen
      → infoText "✓ PASS: zone C" → endScreen
```

### Tests (MockSensorPanel)

1. **Editor render** — floor plan visible in the beat's Visual Editor? Markers placeable / draggable?
2. **Beacon distance sliders** — slide `beacon-a` distance to 1 m, others to 50 m. The location nearest beacon-a fires?
3. **Switch** — change which beacon is closest. A different location fires?
4. **Equidistant** — set two beacons at the same distance. Deterministic behavior (first declared wins, or sorted order — match the docs)?

### Physical beacon test (optional, future)

Skip the Bluetooth Web API live test unless you have physical beacons —
serious time sink for the current experimental tier.

---

## Reporting template

For each test case, log:

| Test | Platform | Device / browser | Result | Notes |
|---|---|---|---|---|
| QR Scan #1 — Camera permission | Web preview | iOS 18 Safari | ✓ Pass | Prompt appeared on first run |
| QR Scan #2 — Scan A (asaps://beat) | Web preview | iOS 18 Safari | ✗ Fail | Routed to fallback; decoded string was malformed |
| ... | | | | |

A separate markdown table per beat is sufficient. After the round,
failures become the punch list for the next QA-and-fix session, and the
EXP pill can drop on any beat that passes cleanly across the platform
matrix.

---

## Recommended order

Prioritized by user value and setup overhead:

1. **QR Scan** (~30 min) — fastest, in-editor generator makes setup zero-friction
2. **Web View** (~45 min) — needs test pages but Netlify drop is cheap
3. **GPS Location MockSensorPanel pass** (~20 min) — desktop only, no outdoor needed
4. **AR Scene** (~60 min) — biggest setup (MindAR compile + print + flat-paste) but the most fun once it works
5. **Indoor Location mock pass** (~30 min)
6. **GPS outdoor walk** (~30 min on a clear day)

Total: half a day for a thorough sweep, or pick-and-choose for a focused
round.

---

## When a beat passes

Drop the `experimental: true` flag in `beat-definitions/core-beats.json`
for that beat, regenerate types (`npm run generate:types`), commit. The
EXP pill on the palette disappears and the per-beat User Guide callout
can be updated.

When a beat fails: leave the EXP flag, file the bug, add the failure
mode to the relevant beat's section here so the next sweep starts from
the known-broken state instead of cold.
