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
| Round 2 — runtime of generated story | ⬜ | |
| Round 3a — placed meter element in export | ✅ passed | live value + band in a real HTML export (2026-08-14) |
| Round 3b — band phrases translated | ✅ passed | "vertrauensvoll" in an exported story (2026-08-14) |
| Round 3b — placed-meter display | ⚠️ partly | 2 of 3 overlaps fixed (9d921ec1); HUD-over-content open, see below |
| Round 4 — MCP desktop server | ⬜ | needs Claude Desktop |
| Round 5 — device/layout matrix | ⬜ | |

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

## Round 2 — Runtime of what Round 1 produced

Play the generated story in the Preview Window (**close and reopen it after any rebuild**).

- [ ] Bound meters move from choices that never name a counter
- [ ] Band phrases change at the right thresholds
- [ ] A negative value grows the bar outward from the centre, not from the edge
- [ ] Zero renders as an empty bar, never half-full
- [ ] Two characters with screen-docked frames are distinguishable by name
- [ ] A words-only meter (`showLevelMeter: false` + `numericFormat: 'band'`) shows no bar

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

## Round 4 — MCP desktop server *(needs Claude Desktop)*

- [ ] Server starts and connects after the `mcp-server` retirement
- [ ] `asaps_get_beat_schema` returns all 34 beat types
- [ ] `asaps_inject_story` puts a story into the running Builder
- [ ] The affect-prompt block still matches `packages/core/src/prompts/affectPrompt.ts` *(the one remaining hand-mirrored copy)*

---

## Round 5 — Device and layout matrix

Per the standing rule that one-viewport-verified is not verified.

- [ ] Meter frame with name header at desktop, tablet portrait/landscape, phone portrait/landscape
- [ ] Both layout modes — responsive and fixed canvas
- [ ] Frame label truncates rather than overflowing on the narrowest viewport
- [ ] Stacked frames still clear each other at phone sizes

---

## What we keep

Following the kit pattern: generate a story, fix what breaks, and commit the **fixed** story as evidence under `examples/`, with CI tests pinning anything structural. A throwaway that proved something once and vanished is worth much less than a fixture that fails when the thing regresses.

---

## Open: screen-docked HUDs overlap stage content

Found while verifying 3b, fixed only in part. Two of the three overlaps in
that screenshot are closed (commit 9d921ec1): backfilled default elements now
step clear of authored ones, and a counter is no longer drawn both in the HUD
frame and as a placed element.

The third is a gap in the layout authority, not a bug in either fix. A
screen-docked HUD is drawn as a top-level overlay by PreviewWindow and
WebPlayer; the stage below it is laid out by `PositionedBeatView`, which knows
nothing about it. `adjustElementsForCollisions` does take a `hudBottomY`, but
it is computed only from the top-**centre** countdown meter, on the reasoning
recorded in the comment there: *"Corner HUDs (top-left, top-right timer) don't
overlap with centered content."* That held when a corner HUD was a timer chip.
A character meter frame with a name header and three or four counters is far
taller and wider, and on a 1024-wide stage it reaches under the default text
box: measured 137–792 × 203–405 for the box against 44–166 × 111–227 for the
frame, so the first word of every line clips.

The tempting cheap fix — have the meter-frame resolver hand its rect back for
screen-docked frames too, and fold that one rect into the collision pass — is
the same mistake `hudLayout.ts` was written to undo. Its own header records
that HUDs used to collide because *"three separate systems positioned these
and none knew about the others."* Estimating one HUD's rect in a second place
makes a fourth.

The fix is to extend the single authority: hoist the HUD box computation in
both players out of their render JSX into a memo, so the packed placements
from `layoutScreenHuds` are available before the stage renders, and pass those
rects into `PositionedBeatView` as reserved obstacles — lifting only text,
dialog and button elements that actually intersect one, exactly as `hudBottomY`
does today for the countdown.

Two caveats for whoever picks this up. Authored positions must keep winning:
an author who deliberately places text under a HUD corner is making a choice,
and the same principle that forbids runtime overrides elsewhere applies here —
the assist belongs in the Visual Editor, which already draws the HUD overlay.
And because this changes layout for every beat that shows a screen HUD, it
needs the full verification matrix, not one viewport.
