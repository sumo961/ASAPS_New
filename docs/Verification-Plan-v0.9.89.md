# Verification Plan — v0.9.89 and the AI-generation sweep

*Opened 2026-08-13. Records what has been proven in practice, as opposed to proven by unit test. Update the status column as rounds complete; a round is not "done" because it was attempted.*

## Why this exists

Two categories of change landed close together:

1. **Counter binding** (v0.9.89) — mostly verified in the running app while it was built.
2. **The AI-generation sweep** — five prompt surfaces rewritten, plus the Co-Designer proposal path. **None of it has been run against a real model.**

The second category is the reason for this document. Its failure mode is not an error: a stale or misunderstood prompt produces a *plausible* story that quietly can't use half the app, or one that writes to a counter whose writes are discarded. Nothing goes red. The only detector is deliberately looking.

The repo's own history supports the effort: every prior verification kit found at least one real bug.

## Status

| Area | Status | Evidence |
|---|---|---|
| Counter binding — editor, projection preview, bands | ✅ passed | driven live during build |
| Write gate (derived counters disabled for writes, open for reads) | ✅ passed | driven live: `setVariable` vs Condition Check |
| Frame labelling, two stacked frames | ✅ passed | live, `10px` / `176px`, no overlap |
| Templates — starter + character template | ✅ passed | live; template round-trips through `.asapst` |
| Explanation beat placement in the palette | ✅ passed | live; catch-all group now empty |
| **Screen-docked meter frame in an HTML export** | ✅ passed | Safari, `file://`, all four counter kinds correct (2026-08-13) |
| Round 0 — preflight | ✅ passed | build 5/5, 3 suites green, MCP server drives over stdio (2026-08-13) |
| Round 1a — story generation | ⚠️ passed with one finding | `Someone Made Her Promises`, 16 beats (2026-08-13) |
| Round 1b — character helper | ✅ passed after 2 fixes | picked *Respect*, not a default (2026-08-13) |
| Round 1c — Co-Designer | ✅ passed, 1 data-loss bug found | refused the bad ask, caught mid-apply (2026-08-13) |
| Round 1d — beat suggestions | ✅ passed | multiChoice offered as the default (2026-08-13) |
| Round 1e — dialog generation | ✅ passed clean | affect effects, correct target, no counter writes (2026-08-14) |
| Round 2 — runtime of generated story | ⚠️ passed, 1 blocking bug found | all 6 meter checks pass; the story dead-ends at Decision 1 (2026-08-16) |
| Round 3a — placed meter element in export | ✅ passed | live value + band in a real HTML export (2026-08-14) |
| Round 3b — band phrases translated | ✅ passed | "vertrauensvoll" in an exported story (2026-08-14) |
| Round 3b — placed-meter display | ✅ passed | all three overlaps fixed; see the HUD work in v0.9.90 |
| Round 4 — MCP desktop server | ✅ passed | 34 beat types live, affect survived the inject (2026-08-16) |
| Round 5 — device/layout matrix | ✅ passed | 2 modes × 6 viewports measured; found + fixed responsive HUD overlap (2026-08-14) |

---

## Round 0 — Preflight — ✅ PASSED (2026-08-13)

- [x] Clean build — 5/5 packages
- [x] Suites green — core 2663, renderer 549, builder 2424; type-check clean
- [x] `mcp-server-desktop` builds standalone (`dist/` rebuilt from scratch with `tsc`)
- [x] No dangling reference to the deleted `mcp-server` — only the deliberate history note in README
- [x] **MCP server driven over stdio**: `initialize` → protocol `2025-11-25`, `serverInfo: asaps-desktop`, `capabilities: { tools }`; `tools/list` → all 6 tools. The retirement did not break it.
- [ ] Dev Electron boots to the project browser *(not run — deferred, needs a desktop session)*

### Finding — `asaps_inject_story` under-advertises what it accepts

Its `inputSchema` describes a character as `{id, name, displayName, role, counters, inventory}`, with counters limited to `{name, displayName, value, min, max}`. It advertises **no** `source` or `bands`, and **no** `traits` / `initialMood` / `initialSentiments` / `variants`.

The handler forwards `characters` verbatim to `/api/stories/inject`, so nothing is *dropped* — a model that sent those fields would have them applied. But no model will send what the schema does not describe.

This contradicts the server's own `asaps_get_affect_guide` tool, which returns the full rich-character guide. The server teaches Claude Desktop how to author interiority and then offers a shape that cannot express it — the same gap the Co-Designer had before `updateCharacter` learned counters.

**Severity:** medium. Nothing is broken; injected stories simply arrive flat, with no affect and no bound counters, which is exactly the outcome this release set out to make easy.

**FIXED 2026-08-13.** The schema now advertises counters with `source`, `bands`, `visible`, `showLevelMeter`, `numericFormat` and `color`, plus `traits`, `initialMood`, `initialSentiments` and `meterFrame` on the character. Verified over stdio: `source.kind` enumerates sentiment/emotion/mood and `numericFormat` includes `band`. The descriptions carry the judgement calls too — when to bind rather than store, why a negative `min` only suits a feeling with an opposite, and why a bipolar ladder needs a band covering zero.

---

## Round 1 — AI surfaces *(costs real tokens)*

The spine. One brief that demands the new features and needs no external assets:

> A two-hander in a social-services office. A caseworker and a client who has been let down before. What the player says should change how much she trusts them, and the interactor should be able to see that trust shift.

Run each surface once. **The negative checks matter more than the positive ones** — they are exactly what the new warnings were written for, and a model ignoring a warning is the failure this round exists to catch.

### 1a. Story generation — ⚠️ PASSED with one finding (2026-08-13)

Model: `claude-opus-4-8`, effort `xhigh`, automatic budget. Result: *Someone Made Her Promises*, 16 beats.

- [x] Bound counter with a sensible source — Mara carries `trust`, `min: -100 / max: 100`, `source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' }`, four bands, `numericFormat: 'band'`
- [x] Uses `layoutTemplate` (`"conversation"`); **no** `presentationMode`, **no** `"positioned"` anywhere in the story
- [x] **Zero** counter writes against the bound counter — all 41 effects are `addSentiment` / `nudgeMood` / `fireEmotion`
- [x] **No** asset-dependent beats emitted (`gpsLocation`, `arBeat`, `indoorLocation`, `setGpsLocation` all absent)
- [x] Band ladder correct — and better than the check anticipated (see below)
- [x] Unprompted bonus: used the **`explanation`** beat, guidance added only days earlier

**The band ladder was right, and my check was wrong.** The ladder is `-100 "Braced to leave" / -30 "Wary" / 20 "Opening up" / 60 "Trusting you"` — no band covering zero, which the plan flagged as a risk. But the model also seeded `initialSentiments: [{ emotion: 'trust', strength: -0.3 }]`, which projects to exactly **-30**: the "Wary" boundary. So the story opens reading *Wary* deliberately, for a character who has been let down before — precisely the case `Counter-Binding-Design.md` describes as legitimate ("if you HAVE seeded an opening stance, delete the neutral band without a second thought"). It even wrote a caption saying so.

### FINDING — a visible bound counter renders nowhere without a `meterFrame`

Mara's `trust` counter is `visible: true`, `showLevelMeter: true`, bound — and the character has **no `meterFrame`**. Confirmed by playing it: no `[data-meter-frame]`, no `[data-meter-fill]` on stage.

The symptom is sharp: the generated `explanation` beat says *"This is Mara's trust in you… watch it shift as the conversation goes"* — **explaining a meter that is not on screen.**

The prompt does say a visible meter needs a frame. The model followed every other rule including all four negatives, and missed this one — which is unsurprising, because the omission is invisible in the data and only shows up at runtime. A human author would miss it the same way.

**Candidate fixes:**
- **App-side (preferred):** when a character has a counter with `visible && showLevelMeter` and no `meterFrame`, fall back to `DEFAULT_METER_FRAME_CONFIG` docked to a screen corner. Supplying a default for an *absent* value is not an override of authored intent — `visible: true, showLevelMeter: true` **is** the intent to show it. Caveat: this changes runtime rendering for any existing project in the same state, where the meters are currently invisible despite being marked visible.
- **Editor-side:** warn in the Counters tab when a counter is set to show and no frame is enabled. Zero risk, but does nothing for generated stories, which is the case at hand.
- **Prompt-side:** make the requirement more emphatic. Weakest — the guidance was already present and everything else was followed.

### 1b. Character helper — ✅ PASSED after two fixes (2026-08-13)

Brief chosen so the natural quantity was **respect**, not trust — a test of whether the model reads the brief or reaches for a default.

- [x] Returns `trackedQuantity` — *after* the fixes below; the first two runs returned nothing
- [x] Fits the brief: **"Track Respect toward the player — his respect decides whether he bends rules or goes by the book"**
- [x] Accepting writes a correct counter: `respect`, `min: -100 / max: 100`, `source: { kind: 'sentiment', toEntityRef: 'player', emotion: 'respect' }`, a five-rung ladder (`strong disrespect / wary / neutral / respect / deep respect`) with a band covering zero, `numericFormat: 'band'`, `showLevelMeter: false` (words-only, matching the chosen display), **and** a screen-docked `meterFrame`
- [x] Declining writes no counters (unit-tested)

**Two fixes were needed, and the second was the real cause.**

1. The prompt offered an escape hatch — *"Omit the whole field if nothing fits"* — under an "Also propose" framing that read as secondary. Now the key is required, with `null` as the explicit "nothing fits" answer and a note that null should be rare.
2. **The whitelist trap, again.** `normalizeGeneratedProfile` builds its result from an explicit field list and never named `trackedQuantity`, so the model's answer was discarded before the UI could see it. Fixed with validation (a proposal with no usable emotion is dropped rather than offering a binding that reads nothing).

Fix 2 is almost certainly what broke both earlier runs — the prompt may have been landing all along. This is the fourth time in this codebase that a hand-maintained copy-list has silently eaten a new field.

**Not a product bug:** a run failed with "Configure an AI provider" while the config was intact. Cause was HMR after a source edit leaving the hook holding a stale service instance; a hard reload fixed it. Same class as the stale dev-server resolution error — an artefact of editing while the app is live, not something a user hits.

### 1c. Co-Designer — ✅ PASSED, with a data-loss bug found (2026-08-13)

Asked deliberately for something wrong: *"add a fear meter, and make the blunt choice knock her trust down by 20 points"* — a direct counter-write against a bound meter.

- [x] **Refused the bad ask and redirected**, in the author's terms: *"the trust meter is bound to sentiment, which runs roughly on a −1…1 scale, not 0–100. A '−20 points' instinct maps to about −0.20."* It proposed raising the existing `addSentiment` `strengthDelta` from −0.15 to −0.20 — the affect effect, never a counter write.
- [x] Proposed the new counter correctly: fear bound to the emotion, **`min: 0`** (no opposite), with bands — the polarity rule landing unprompted.
- [x] Used `get_beat_content` to read the real beat before proposing, and corrected the digest's own choice count.
- [x] Emitted a well-formed block that parsed into two reviewable proposals.

### BUG — a partial counter proposal destroyed an authored band ladder

`updateCharacter` replaced the counter list wholesale. Asked to add `fear`, the model had to restate `trust` alongside it — and restated it **without its four bands**, because the digest named the counter but never its bands or bounds. It flagged its own uncertainty in prose (*"tell me and I'll match them, so you don't lose that setup"*) and then dropped them anyway.

Applying would have silently destroyed an authored ladder. Caught before applying.

**Fixed on both sides:**
- **Counters now MERGE by name at apply time.** Fields the proposal states win; fields it omits are kept; counters it never mentions are untouched rather than deleted. A partial proposal is now safe, which matches how an author reads it — "add fear" should not rewrite trust.
- **The digest now reports bounds and band count** (`Trust [reads sentiment, read-only; -100..100; 4 bands]`), so the model can see there is authored wording to preserve instead of guessing.

### 1d. Beat suggestions — ✅ PASSED (2026-08-13)

- [x] Suggested `multiChoice` at 74%, described as *"the default way to hand the player agency right after setup"* — the guidance landed.
- [x] `dialogTree` ranked higher (82%) but for a defensible reason: *"the story already leans heavily on dialogTree (5 existing), so this matches the established narrative style."* Matching an established style is sound design advice, not a reach for the heavier beat.
- **Check withdrawn:** "offers affect effects" was mis-specified for this surface. Beat suggestions propose a beat *skeleton* — type, name, reasoning, parameter names — and the author fills the content. Effects live on choices inside a beat, which is 1e's territory.

### 1e. Dialog generation — ✅ PASSED CLEAN (2026-08-14)

The only surface that needed no fix.

- [x] Uses the `effects` array with **affect effects throughout** — `addSentiment`, `nudgeMood`, `fireEmotion`
- [x] **`target` correct in the hard sense**: every affect effect targets `char_mara`, the CHARACTER — not the counter name. This is the single easiest mistake in the vocabulary and the reason the warning was written.
- [x] **Zero counter writes** — it moved feelings rather than numbers, which is what the guidance asks for in a relationship scene
- [x] `layoutTemplate: "conversation"` — the current field, not legacy `presentationMode`
- [x] Deltas are proportionate and signed sensibly: warm opening `+0.25` trust, defensive `-0.2` trust plus `fireEmotion anger +0.3`, the strongest repair `+0.35`

**On failure:** fix the prompt, re-run *that* surface only. Record what the model actually emitted — a wrong output is the useful artefact, not the fact that it was wrong.

---

## Round 2 — Runtime of what Round 1 produced — ⚠️ PASSED, ONE BLOCKING BUG (2026-08-16)

Played `Someone Made Her Promises` in the Preview Window, measuring bar
geometry rather than reading labels — the failure mode this round exists to
catch (a bipolar meter remapped onto 0..100) looks perfectly plausible in text
and is obvious in pixels.

The story is a good fixture by accident: **33 affect effects across 12 choices
and not one effect naming a counter**, so any meter movement is necessarily
derived.

- [x] Bound meters move from choices that never name a counter
- [x] Band phrases change at the right thresholds
- [x] A negative value grows the bar outward from the centre, not from the edge
- [x] Zero renders as an empty bar, never half-full
- [x] Two characters with screen-docked frames are distinguishable by name
- [x] A words-only meter (`showLevelMeter: false` + `numericFormat: 'band'`) shows no bar

### Measured

Mara's trust, bands `[-100 "Braced to leave", -30 "Wary", 20 "Opening up", 60 "Trusting you"]`,
seeded at −0.3. Track 107px, centre 53.5.

| after | fill span | signed value | band |
|---|---|---|---|
| start (seed −0.3) | 37.7 → **53.5** | −29.5 | Wary |
| "That should never have happened." | 48.2 → **53.5** | −9.9 | Wary |
| "I can't promise I'm different." | **53.5** → 58.8 | +9.9 | Wary |
| "You share only what you're comfortable with" | **53.5** → 66.7 | +24.7 | Opening up |
| "This week I'll file an emergency…" | **53.5** → 77.2 | +44.3 | Opening up |

Every fill terminates at the centre and grows outward — leftward while
negative, rightward while positive, on the same bar as the value crosses zero.
The band flips between +9.9 and +24.7, which is exactly the `from: 20`
boundary. The seeded −30 landing on the `from: -30` boundary and reading
"Wary" also confirms bands are inclusive at `from` — the thing a false alarm in
Round 1a turned on.

Zero was measured on a throwaway with the seed removed, since nothing in the
story sits at exactly zero: **0.8px of fill at the centre** on a 107px track —
the origin marker, not a value. A 0..100 remap would have drawn 53.5px.

Marek supplies the last two: his frame is stacked in the same corner as Mara's
and headed with his name, and his Respect counter (`showLevelMeter: false`,
`numericFormat: 'band'`) renders **zero bars** — the phrase alone.

### Blocking bug — the generated story dead-ends at Decision 1

Three of the fifteen dialogTree leaf choices target **`beat_intake`, which does
not exist**; the beats are numbered `beat_0…beat_15`. All three are `beat_3`'s
exits, so every path through "Decision 1 — How you open" stops there. Clicking
does nothing at all — no error, no movement. Round 1a called this story a pass
because it was never played past its opening.

`aiStoryValidator` **already catches this**. It walks dialogTree leaf targets
and raises a `missing_beat` error for exactly this case, with a test covering
it. The problem is what happens next in `App.tsx`:

```js
if (!validation.valid) {
  console.warn('[App] AI story has validation errors:');
  validation.errors.forEach(e => console.warn('  -', e.message));
  // Continue importing despite errors - user can fix in builder
}
```

The diagnosis is correct, complete, and written to a console the author will
never open. The Twine and Ren'Py importers surface their validation errors in
the UI; AI-generated stories do not. So the safety net fires silently and the
author meets the fault mid-playthrough instead.

That is the finding worth acting on — not the model inventing an id, which it
will always occasionally do, but a validator whose output nobody sees.


---

## Round 3 — Export paths

### 3a. Placed meter element *(the fix that is still unproven)*

The passing web-player result above used a **screen-docked character meter frame**, which reaches the renderer through `toMeterCounterData` directly. Placed meter elements — `kind: 'meter'` locations on a fixed canvas — go through `PlayerEngine.setupRendererResolvers` instead, which never set a counter resolver at all until this sweep. The two look identical on screen and are wired completely differently.

- [x] Fixed-canvas fixture with a placed `kind: 'meter'` element bound to Ada's `trust` counter, character-anchored frame removed and all counters hidden so only the placed element could render
- [x] Exported single-file HTML, opened from `file://` — the meter reads the **live** value, not 0
- [x] Bands render: the readout showed **"trusting"**, with the fill at `left 50% / width 18%` — zero-origin geometry growing rightward from the centre

This is the path `PlayerEngine.setupRendererResolvers` feeds, distinct from the screen-docked frame already proven. It was rendering 0 before this sweep.

*(The beat's text is absent in that export because the fixture only placed a meter location on a fixed canvas — a limitation of the fixture, not a defect.)*

### 3b. Translated export
Exercises both extractors, including the embedded copy in `HtmlExporter.ts` that has to stay in sync with `StoryTranslator.ts`.

- [x] **Extractor verified against the live project**, not just unit tests: `extractTranslatableStrings` returns 65 strings including **9 band keys** — `project.story.characters.1.counters.1.bands.0.label = "strong distrust"` through `bands.4.label = "deep trust"` — alongside the four counter display names.
- [x] Thresholds are absent from the key set, as intended: a number is not text.
- [x] **Full round-trip verified.** German added through the real UI (not by injecting a record — that path is known to brick project load), translated with the AI path to 100%, exported as single-file HTML, opened from `file://`, and switched to German in the player's language gate. The placed meter rendered **"vertrauensvoll"**.
- [x] The stored ladder is fully translated: `starkes Misstrauen · vorsichtig · neutral · vertrauensvoll · tiefes Vertrauen`, each with `status: "translated"`.
- [x] Both extractors are therefore exercised — the builder's at export time and the embedded copy at runtime, which is what actually resolves the phrase in the player.

Two notes from doing it:
- The single-file export **encodes its payload**, so grepping the HTML for `bands` returns zero — as does `counters`. That is not evidence of absence; it was the grep being meaningless.
- **Band labels have no manual translation surface.** The character editor's Translations tab covers display names only, and the Counters tab edits source values even when another language is active. The AI path fills them correctly, so nothing is broken, but a translator working by hand cannot reach them. Worth considering separately.

---

## Round 4 — MCP desktop server — ✅ PASSED (2026-08-16)

- [x] Server starts and connects after the `mcp-server` retirement
- [x] `asaps_get_beat_schema` returns all 34 beat types
- [x] `asaps_inject_story` puts a story into the running Builder
- [x] The affect-prompt block still matches `packages/core/src/prompts/affectPrompt.ts` *(the one remaining hand-mirrored copy)*

Driven over stdio against `dist/` rebuilt from source, with the desktop Builder
running and serving its API on `127.0.0.1:3001`. Claude Desktop turned out not
to be needed: the transport is stdio JSON-RPC either way, so the server can be
driven directly and the Builder is the thing that has to be live.

- **Handshake**: protocol `2025-11-25`, `serverInfo: asaps-desktop`,
  `capabilities: { tools }`, all six tools listed. The `mcp-server` retirement
  did not break it.
- **Schema**: exactly **34** beat types, fetched live from the running Builder
  rather than from a bundled copy — so this also proves the server↔Builder link,
  not merely that the server boots.
- **Mirrored prompt**: both `AFFECT_CATALOG` blocks are byte-identical (3557
  characters). The one hand-maintained copy has not drifted.

### The inject carried affect, which is the part worth checking

Injecting three beats only proves transport. The payload therefore also
exercised the Round-0 finding and its fix (`44d00d15`): Mara carries Big Five
traits, an initial mood, `initialSentiments` seeding trust toward the player at
**−0.25**, and a Trust counter *bound* to that sentiment with a five-band
ladder.

The check is one word. A bound meter reads its band from live affect, so if the
sentiment had been dropped anywhere between the MCP schema, the API and the
Builder, the meter would sit at its origin and read **"neutral"**. It reads
**"wary"** — the seeded value survived the whole trip and the binding is
projecting it.

No confirmation dialog appeared, which is correct rather than a gap: the
workspace guard only fires when there are beats to protect, and the Builder had
been started without a project open.


---

## Round 5 — Device and layout matrix — ✅ PASSED (2026-08-14)

Per the standing rule that one-viewport-verified is not verified.

- [x] Meter frame with name header at desktop, tablet portrait/landscape, phone portrait/landscape
- [x] Both layout modes — responsive and fixed canvas
- [x] Frame label truncates rather than overflowing on the narrowest viewport
- [x] Stacked frames still clear each other at phone sizes

Run against a purpose-built fixture (`ZZ Device Matrix`, one copy per layout
mode): Ada with a screen-docked meter frame **and** an inventory frame in the
*same* corner, so the packer has to stack them, and a deliberately long
display name ("Ada Lovelace-Fitzgerald") to force the truncation case.

Measured rather than eyeballed — a DOM harness reporting pairwise overlap
areas, stage-bounds overflow, and clipped text. Two false alarms came out of
the harness before any of it was trustworthy, both worth remembering:

* Walking up from a text node to find its "box" climbed **past the stage**
  into page ancestors, which are all painted — every element then reported the
  same rect and the numbers looked catastrophic. Element lookups must be
  scoped inside the stage.
* `getBoundingClientRect()` ignores the scroller clipping it. Text inside an
  `overflow: auto` body reported a 653px box overlapping the button, when the
  painted region was 317px and overlapped nothing. Intersect with every
  clipping ancestor before calling anything a collision.

### Result — fixed canvas

Clean at auto / desktop / tablet-landscape / tablet-portrait: no overlaps, and
the HUD stack is identical in canvas coordinates at every size (meter 10,10
146×174; inventory 20,225 120×52 — a 41px gap, so stacked frames clear each
other everywhere).

Phone sizes show cropped content, which is the **mode's contract, not a
regression**: `previewWidth` is consumed only by `SlotFlowView` /
`SpatialFlowView`, so a fixed canvas does not reflow for a device preset — it
crops. A 1024×768 canvas viewed at 390×740 shows its top-left corner. The
author's remedy is responsive mode.

### Finding — responsive mode reserved nothing, at every viewport

The reserved-rect fix (9f3d7724) went into `PositionedBeatView`, which slot
mode does not use. Responsive beats therefore started their flow at y≈37 while
the meter frame occupied y 10–184 — overlapping at **all six** viewports,
worst on narrow ones (19992px² at phone portrait). One layout mode verified is
not verified either.

Fixed by reserving the HUD band as padding on the slot root. Padding is the
right shape here precisely because slot mode reflows: the column simply begins
below the top HUD band and ends above the bottom one, rather than lifting
individual elements. Re-measured: zero overlap at all six viewports in both
modes.

Two things that fix turned up:

* `previewHeight` is not passed at every `SlotFlowView` call site in
  `ReactRenderer` (2 of 4 lack it). Anything deriving from it silently fell
  back to `window.innerHeight` — which is the *window*, not the emulated
  device — so the cap below did nothing where it was needed most. The slot
  root now measures its own height via `ResizeObserver`.
* Uncapped, the reservation is dangerous on short viewports. Two stacked
  frames are 277px of fixed-size HUD; on a 740×360 phone-landscape stage that
  left the body **zero visible text** — a screen with no story on it. Capped
  at 40% of stage height per edge; past that, content wins and may run under
  the lowest HUD, because text partly behind a meter is readable and
  scrollable while an empty screen is neither.

### Correction — the "cannot be recovered" claim was wrong

The first write-up of this round said a 740×360 stage simply could not hold the
content, and that no layout rule would recover it. Both halves were wrong, and
the fixture was to blame: it stacked a second HUD frame in the same corner
*and* used the longest beat in the story.

Isolating the two, with the meter frame alone:

| At 740×360, responsive | visible body text |
|---|---|
| meter frame + inventory frame | 0px |
| meter frame alone (4 counters) | 192px |

So most of the starvation was the second frame — an adversarial fixture, not a
property of the viewport.

### Landscape: content beside the HUD, choices in two columns

What remained was a layout that never used the width it had. Two fixes:

*Choices wrapped into two columns on short, wide stages.* Buttons stack
vertically by design — a column reads as a list of things you might say, a row
reads as a toolbar — but four choices are ~200px of column against a 360px
stage, so the list ran off the bottom while half the width sat empty. Short and
wide now lays them out 2×2, still in reading order.

*A narrow corner HUD is stepped around, not under.* A full-width reserved band
is right when the content column spans the stage. On a short, wide stage it
cost the frame's entire height for a HUD occupying a fifth of the width. The
reserve now becomes a side inset there, so the column starts at the top and
begins past the frame.

An intermediate attempt — skipping the reserve entirely for narrow corner HUDs
— is worth recording as a wrong turn: it assumed the centred column would not
reach the corner. It does, and the text ran straight under the frame. Reserving
the HUD's *width* is the fix; reserving nothing is not.

Result at 740×360: 260px of visible text where there was 0, no overlap at any
of the six viewports in either mode.

### The reservation was a race, and passed by luck

Found while verifying the above. `setReservedHudRects` only stored its value,
in the shape of the other renderer setters. But the host computes the HUD
layout in an effect — after the paint that needed it — while the renderer
paints the moment the beat changes. So the rects arrived after the render that
should have used them, and nothing re-rendered: the reservation applied a beat
late, or never.

It measured correctly several times during this round purely because some
unrelated state change forced a second render. That is the worst failure mode
to test for — it passes whenever you poke at it.

Now an initial-value-plus-subscribe pair, the same contract `ReactRenderer`
already uses for timer-HUD state, consumed through `useReservedHudRects`.

### Remaining authoring-side limitation

Two frames stacked in one corner is 277px of fixed-size HUD. That still does
not fit a 360px-tall stage alongside a long beat, and no layout rule invents
the space. It is an authoring decision that only fails on the smallest target.

Recommended follow-up (not built): now that the Visual Editor draws screen
HUDs, it is the natural place to warn when a character's HUD stack exceeds a
share of the project's smallest target viewport — the same "flag it while
authoring" shape as the ⚠ shown twice badge, rather than a runtime override.

---

## What we keep — ✅ DONE (2026-08-16)

The plan's original doctrine (the section was lost in an earlier edit of this
file, restated here): generate a story, fix what breaks, and commit the
**fixed** story as evidence under `examples/`, with CI tests pinning anything
structural. A throwaway that proved something once and vanished is worth much
less than a fixture that fails when the thing regresses.

Done: the Round-1 story's three dead links (`beat_3` exits → `beat_intake`)
were repaired to point at Decision 2, and the story ships as
`packages/builder/public/examples/someone-made-her-promises.asaps.zip` in the
real export envelope. `promisesFixture.test.ts` pins what it is evidence of:
no dangling links (the Round-2 bug, held shut by `storyLinks` — the walk that
bug produced), Mara's sentiment-bound bipolar banded meter with its −0.3 seed,
Marek's words-only band counter, and the fact that not one choice effect names
a counter — every meter movement in the story is derived from affect.

With this, every round and every follow-up in this plan is closed.
