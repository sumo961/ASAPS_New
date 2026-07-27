# Example Stories

This directory contains example interactive narratives that demonstrate various features of the ASAPS Builder.

## Available Examples

### RED: A Modern Tale
**File:** `red-riding-hood-modern.json`

A modern retelling of Little Red Riding Hood where the player is Riley, a 16-year-old girl navigating identity, peer pressure, and self-discovery.

**Features Demonstrated:**
- Multiple branching paths (3 major routes)
- DialogTree conversations with emotional depth
- MovementChoice beats for path selection
- Timing features (choiceDelay for dramatic tension)
- Multiple endings based on player choices
- Modern themes: social media pressure, toxic friendships, authenticity

**Story Statistics:**
- 23 interactive beats
- 3 major endings
- 6 dialog tree interactions
- Beat types used: TitleScreen, IntroText, MovementChoice, DialogTree, EndScreen

**Themes:**
- Identity vs. Performance
- True Connection vs. Superficial Relationships
- Recognizing Modern "Red Flags" (gossip, exclusion, conditional acceptance)
- Generational Wisdom

**How to Import:**
1. In the ASAPS Builder, go to File → Import ZIP
2. Select `red-riding-hood-modern.asaps.zip` from this directory
3. The story will load into the visual editor with all 23 beats

**For More Information:**
See `/RED-STORY-GUIDE.md` in the project root for a comprehensive guide including:
- How to enhance the story with AI features
- Story flow map and key moments
- Extension ideas
- Teaching points

### GPS Location — Verification
**File:** `gps-location-verification.json`

A manual **verification** story (not narrative) for the GPS beats. Import the
`.asaps.zip` (**Import → Project (ZIP)**), open **Tools → Mock Sensors**, and
run it in Preview to exercise the **Set GPS Location** beat (capture, scatter in
both placements, preset) plus the **GpsLocation** geofence binding in one pass.
The flat `.json` beside it is the human-readable source, not the import target.

**What it covers:**
- **A** — `preset` points + a `trigger-on-arrival` geofence bound by `pointName` (set the mock position to 51.5080, -0.1281 to trigger the PASS branch)
- **B** — `scatter` (uniform placement) shown on a `display` map
- **C** — `scatter` with **walkable** placement (snaps onto OpenStreetMap streets/parks; needs internet; falls back to uniform offline)
- **D** — `capture` the current position, with an authored fallback

All coordinates are around Trafalgar Square, London (dense OSM coverage). Full
per-step pass/fail criteria live in `docs/TESTING_EXPERIMENTAL_BEATS.md` →
*Set GPS Location*.

### GPS Field Test (your location)
**File:** `gps-field-test.asaps.zip`

The **live outdoor** companion to the verification story above — fully
**location-agnostic** (zero authored coordinates; everything centers on
wherever the player is standing, so it works anywhere without editing).

- **Test A** — captures your position and geofences it (should trigger on the
  spot within seconds; proves live GPS + the capture → geofence loop)
- **Test B** — scatters 3 points onto nearby streets/parks (OpenStreetMap),
  shows them on a map, then asks you to walk to any one — arrival triggers
  the geofence. The geocaching mechanic, live.

**Deploy to a phone:** Import → **Export → HTML → Single File** → drop the file
on any HTTPS host (Netlify Drop is ~30 s) → open in iPhone Safari → allow
location. Local `file://` or plain `http://<lan-ip>` will NOT work on iOS
(no JS in QuickLook; geolocation needs a secure context). Details in
`docs/TESTING_EXPERIMENTAL_BEATS.md` → *Outdoor walking test*.

### QR Scan — Verification
**Files:** `qr-scan-verification.asaps.zip` + `qr-scan-verification-codes.html`

Manual verification kit for the **QR Scan** beat (EXP). Import the zip
(**Import → Project (ZIP)**), open the codes HTML in any browser and **print
it** (or show it on a second screen), then run the story in Preview or an
HTML export on a phone and scan the code each station asks for:

- **A** — `asaps://beat/…` direct beat jump (also the rejection probe at station D)
- **B** — `asaps://variable/scanned/red`, verified by a Condition beat
- **C** — `asaps://inventory/add/badge`, verified by a Condition beat
- **D** — plain payload `WORLD42` with a `^WORLD\d+$` accept pattern (code A must be rejected here)

Cancel at any station routes to that station's fail screen. Pass/fail criteria:
`docs/TESTING_EXPERIMENTAL_BEATS.md` → *QR Scan*.

### Web View — Verification
**Files:** `web-view-verification.asaps.zip` + `web-view-test-pages/` (folder)

Manual verification kit for the **Web View** beat (EXP). Deploy the
`web-view-test-pages/` folder to any HTTPS host (drag it onto
<https://app.netlify.com/drop>), import the zip, and enter the deployed base
URL when the story asks — the page URLs are `${baseUrl}`-substituted, so
nothing is hardcoded. Four stations:

- **A** — embed + Done button, with `passContext` displayed by the page (playerName=Verifier)
- **B** — postMessage exit (`{asaps:'result', value:…}`), condition-verified via `saveTo`
- **C** — `exitUrlPattern` auto-advance — **desktop app only** (browser iframes can't report navigation; Done there is expected)
- **D** — blocked-site probe (google.com): browser shows a blank/refused frame and must stay stable; the desktop app may load it

Pass/fail criteria: `docs/TESTING_EXPERIMENTAL_BEATS.md` → *Web View*.

### AR Scene — Verification
**Files:** `ar-scene-verification.asaps.zip` + `ar-scene-marker.html` (+ `ar-marker.png` / `ar-marker.mind`)

Manual verification kit for the **AR Scene** beat (EXP) — with the compiled
MindAR tracker **already bundled in the zip**, so no external compile step.

1. Import the zip (**Import → Project (ZIP)** — the `.mind` asset rides along).
2. Open `ar-scene-marker.html` in a browser and **print it** (A5 or larger,
   matte, taped flat) or show it on a second screen. The marker is generated
   deterministically, and the bundled tracker was compiled from that exact
   image (MindAR 1.2.5, matching the renderer's pinned version).
3. Run the story (Preview with a webcam, or an HTTPS-hosted HTML export on a
   phone), allow camera:
   - **A** — both anchor cards appear pinned to the marker (tilt away → they
     vanish); tapping the LEFT card jumps the story (bare-beat-id `onTap`)
   - **B** — tapping the RIGHT card fires `asaps://variable/picked/right`,
     verified by a Condition beat
   - **C (optional)** — reload offline: the "simple overlay" fallback's flat
     cards must still route

Pass/fail criteria: `docs/TESTING_EXPERIMENTAL_BEATS.md` → *AR Scene*.

## Creating Your Own Examples

To add new example stories to this directory:

1. Create your story in the ASAPS Builder
2. Export the project as JSON
3. Place the JSON file in this directory
4. Add an entry to this README describing the example

Example stories should demonstrate specific features or storytelling techniques to help new users learn the system.
