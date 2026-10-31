# AI-assisted Story Logic: plan

*2026-10-31. Replaces the "Narrative Consistency Checker" section of
`dev_docs/Advanced Debugging Features with AI Integration.md` (local). The rest of that plan is
superseded: presets come from path simulation, fixes go through the checked
review, and Debug is a pop-out window.*

## What it is for

The Debug window's Story Logic tab warns when text assumes something the
player may not have, e.g. "with the evidence you gathered…" on a beat that
some ways in reach without evidence. It finds these with about 18 English
keyword patterns. It misses everything the patterns don't name. That
includes:
- other languages;
- "Tomas thanks you again" after a path where Tomas was never thanked;
- a character who knows something they weren't told;
- a warm line from someone whose trust is at rock bottom;
- a choice whose words promise something its outcome doesn't deliver.

The panel has promised "AI-powered semantic analysis" since v0.9.43, and
Hartmut wants it built (v0.9.122 note).

The aim: an AI reads each beat that can be reached in different states, next
to the states that actually arrive there, and reports where the text and the
state disagree. Every finding carries the evidence. Nothing is changed
without the author.

## Principles

These are kept from the old plan.

1. **Code-based checks first, shown at once.** The keyword checks stay. The AI
   adds findings; it never replaces them.
2. **Run by the author.** A **Check with AI** button shows its estimated cost
   before it runs, a progress bar while it runs, and Cancel. Nothing runs on
   its own.
3. **Grounded, not guessed.** The model is told which states arrive at a beat;
   the path simulator works them out. It judges text against facts; it does
   not reconstruct the story's logic itself. Its findings fall in the scope
   the simulator covers.
4. **Checked before shown.**
   - A finding must quote words that are really in the beat.
   - It must name a beat that exists.
   - It must point to one of the arriving states it was given.
   - Anything else is dropped (the same kind of check as `findingFixService`).
5. **Fixes only through the existing review.** "Propose a fix" uses
   `requestAIFix` (at most 4 edits, replayed on a copy) and the before/after
   card. Applied fixes go into the AI edits ledger (`generation/ai-edits.json`),
   with a new source `'story-logic'`.
6. **Remembered.**
   - Results are cached per beat by a hash of its text and its arriving
     states, so a re-run only checks what changed.
   - "Not a problem" dismissals are saved and not raised again.

## What exists to build on

| Need | Already there |
|---|---|
| States arriving at a beat | `StateSimulationAnalyzer.analyzeRaw()`: `steps[i-1].stateAfter` is the arrival state at `steps[i]`, the convention `PathBasedPresetGenerator` uses. It covers variables, counters, items per character, visited beats and feelings. |
| Which state matters at a beat | `relevantState(story, beatId)` in `PathBasedPresetGenerator` |
| Story context for the model | `buildStoryDigest` (`utils/storyDigest.ts`), the Co-Designer's text digest, plus the Knowledge Graph's `buildStructuralSummary` |
| Calling the model | `useAI()` / `AIService.generateConversationTurn`: structured output (`schema`) on Claude, `systemContext` after a cached system prompt, `route` for usage accounting, `signal` to cancel. OpenAI ignores `schema`, so fall back to `parseJSONWithRepair`. |
| Provider in the Debug window | It loads the same preload and `machineStorage`, so `useAI()` configures itself there as it does in the Co-Designer and Knowledge Graph windows. |
| Fix with diff preview | `services/findingFixService.ts` (`requestAIFix`, `validateAIFix`), `AIFixCard` |
| Applying edits from a pop-out | Co-Designer's `APPLY_PROPOSALS` / `APPLY_RESULT` messages (`CoDesignerWindowManager.ts`). The Debug window has no such channel yet. |
| A deterministic precedent | `utils/clockProseFindings.ts` checks story-clock prose against the state on every way in |

## Phases

### Phase 0: groundwork (no AI; it improves the tab on its own)

- **Arrival states in one pass.** Add `arrivalStates(paths)` to core. For each
  beat it returns the distinct arriving states (deduplicated by what can
  matter there, using `relevantState`), each with a sample path. Path
  Analysis, Story Logic and the presets then share one simulation. Today
  `PathVisualization` simulates twice, and the presets simulate once per beat.
- **Hubs by state, not by link count.** A beat counts as a hub when it is
  reached in *different* states, not just from more than one beat. The hub
  cards show what differs ("arrives with or without the notebook; Tomas's
  trust 0.2 to 0.8"). Today they only look at the previous beat's own
  effects (`LogicValidationReport.buildHubAnalysis`).
- **The keyword check uses the states.** "With the evidence you gathered" is
  flagged only when some arriving state lacks evidence-like items or
  variables. Fewer false alarms.
- **Gate on a configured provider.** `useAIFeatures()` only reads the "Show
  AI features" preference. The button needs a provider that is actually set
  up.
- Done 2026-10-31 (unreleased): the Debug window now receives characters,
  settings and the feelings model. Before, it simulated stories without them.

### Phase 1: Check with AI (beats reached in different states)

- **Which beats.** Every beat that Phase 0 says is reached in different
  states, plus every beat the keyword check flags. Order them by how many
  paths pass through and how much the states differ. Default cap: 40 beats
  per run, shown up front with the estimate.
- **What the model sees, per beat:**
  - the beat's words: text, Dialog Tree lines, choice texts, `${…}`
    placeholders;
  - the speaker and who holds each role;
  - each distinct arriving state in plain words, for example "has: lantern;
    Tomas trusts the player 0.6; has seen: The argument";
  - the text of the beat before it on each way in (one hop, two along
    straight chains).
- **What it doesn't see:** the whole story every time. The story digest goes
  once into the cached system context, and several beats share one call.
- **Prompt:** `services/prompts/storyLogicReview.ts`, with a test file like
  the other prompts.
- **Output schema:** `findings[]`, each with:
  - `beatId` and `kind`, one of:
    - `assumes-missing-state`
    - `contradicts-earlier-text`
    - `character-knows-too-much`
    - `feeling-mismatch`
    - `choice-promise-broken`
    - `dangling-reference`
  - `quote`
  - `state` (the index of the arriving state that breaks it)
  - `why` (one sentence)
  - `severity` (`problem` | `worth a look`)
  - `suggestion`
- **In the tab:** an "AI findings" section under the keyword warnings.
  - Each finding shows the quote, the arriving state that breaks it (with
    "Show this path" to highlight it in the flowchart), the reason and the
    suggestion.
  - Its buttons are **Propose a fix**, **Not a problem** and **Go to beat**.
  - Go to beat selects and centres the beat; today debug clicks only
    highlight it (UX-Eval note).
- **Applying a fix** needs a channel from the Debug window back to the
  builder, modelled on Co-Designer's `APPLY_PROPOSALS`. The builder applies
  the fix as one undoable step and records it in the ledger.
- **Saved with the project:** `generation/story-logic.json` holds dismissals
  and the cache keys. Findings themselves are cheap to recompute from the
  cache, so they aren't stored.

### Phase 2: whole-path threads

These are things one beat can't show:
- set-ups never paid off (an item never used, "I'll come back for you" with
  no return);
- a character's voice or what they know drifting along one path;
- endings that contradict how the player got there.

- **What the model sees:** a small set of representative paths, chosen with
  `pathTree`: one per ending and the most different routes to it. Each is a
  numbered sequence of beat summaries with the choices made and the state
  changes.
- **Findings** name a span of beats, not a single beat.
- This phase is more expensive: one path per call, a separate button
  ("Check story threads").

### Phase 3: in the flow of work

- Re-check only the beats changed since the last run, using the cache.
- After AI generation, offer the check from the review banner.
- "Discuss with Co-Designer" passes a finding over as context.

## Testing

- Fixture stories with planted problems and clean twins. One is a Last Ferry
  copy where "the notebook you read" can be reached without reading it. Others
  are a German beat and a warm line under low trust. Measure how many planted
  problems are found and how many clean beats are flagged; keep the numbers
  as a small eval to compare prompt changes.
- Unit tests:
  - the check on findings (quote not in the beat, unknown beat, bad state
    index);
  - batching and the cache key;
  - the Debug-to-builder apply channel (one undo step, ledger entry).
- Release checklist: run it on a generated story with the desktop app's
  configured provider.

## Decisions for Hartmut

1. **Where findings appear.** In the Debug window only, or also as a notice
   in the main window? Recommended: Debug window. Phase 3 adds the review
   banner after generation.
2. **Dismissals travel with the project?** In `generation/` (shared with a
   group through Git) or on this computer only. Recommended: with the
   project, so a group doesn't re-triage the same findings.
3. **Default cap and model.** Recommended: 40 beats per run, using the model
   set for authoring, with the cost shown before running. An option could
   use a cheaper model.
4. **Keyword checks once AI is on.** Recommended: keep them. They're free,
   instant and work offline.
5. **Phase order.** Phase 0 is worth shipping alone: fewer false alarms and
   state-based hubs. Phase 1 builds on it.

## Rough size

- Phase 0: about a day.
- Phase 1: two to three days, including the apply channel and the eval.
- Phase 2: about two days.
- Phase 3: a day.

Per CLAUDE.md, the new prompt is written against today's beat, condition and
feelings vocabulary. Changes to how a story plays update it in the same
change.
