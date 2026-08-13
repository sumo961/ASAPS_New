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
| Round 1c–1e — other AI surfaces | ⬜ | |
| Round 2 — runtime of generated story | ⬜ | |
| Round 3a — placed meter element in export | ⬜ | |
| Round 3b — band phrases in a translated export | ⬜ | |
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

### 1c. Co-Designer
- [ ] "Add a trust meter to Ada" → an `updateCharacter` proposal with a **complete** binding
- [ ] Against a story that already has a bound counter: **does not** propose writing to it
- [ ] The digest shows `[reads sentiment, read-only]` for bound counters

### 1d. Beat suggestions
- [ ] Suggests `multiChoice` for ordinary branching, not `dialogTree`
- [ ] Offers affect effects, not only counter shorthand

### 1e. Dialog generation
- [ ] Uses the `effects` array, including affect effects
- [ ] Gets `target` right in both senses — counter name for counter effects, **character** for affect effects
- [ ] Uses `layoutTemplate` if it mentions layout at all

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

- [ ] Fixed-canvas story with a placed meter element bound to a counter
- [ ] Export to HTML → the meter reads the live value, **not 0**
- [ ] Same meter with bands → shows the phrase

### 3b. Translated export
Exercises both extractors, including the embedded copy in `HtmlExporter.ts` that has to stay in sync with `StoryTranslator.ts`.

- [ ] A story with band phrases, translated to a second language
- [ ] Export → band phrases appear **translated**, not in the authoring language
- [ ] Thresholds unchanged (numbers are not text)

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
