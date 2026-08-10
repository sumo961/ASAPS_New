# Counter Binding — "Counter as Display, Not Mechanic"

*Status: **design proposal, nothing built**. Written 2026-08-09 for review. Follows the character-template disclosure work (`8eb87681`) and the unified HUD layout authority (v0.9.87).*

## The problem

> "Counters can be simplified stand-ins for a full affect system — a trust counter is much easier to implement and communicate to an interactor than a full affect system modelling trust. My point is that counters and the affect systems can be mutually exclusive but are not always. It could be possible to have a counter meter display in simple way what is actually a full affect system in the background. This would mean *counter as display, but not actual mechanic*."

Today ASAPS has two unconnected ways for a character to carry a felt quantity:

| | Mechanic | How the interactor sees it |
|---|---|---|
| **Counter** | `characterCounters[char][name]`, integer-ish, moved by explicit `setCounter` / `changeCounter` effects the author writes | meter frame (bar + optional number) |
| **Sentiment** | `characterSentiments[char][]`, `{toEntityRef, emotion, strength ∈ [−1,1]}`, moved by the affect runtime (appraisal, trait modulation, decay) | nothing, unless the author writes prose |
| **Emotion level** | `characterEmotionLevels[char][name] ∈ [0,1]`, fired by `fireCharacterEmotion`, trait-modulated, decaying | nothing |
| **Mood** | `characterMoods[char]`, `{valence, arousal}` | mood token / disc |

### Intensities and stances are different quantities

The runtime already draws the distinction that decides how a bound meter should read, and the clamps are the evidence:

- `fireCharacterEmotion` clamps to **[0, 1]** — emotion levels are *intensities*. Fear has no opposite; "negative fear" is not a state.
- `addCharacterSentiment` clamps to **[−1, 1]** — sentiments are *stances*. Negative trust is distrust, a real and nameable condition.

So a word like **"wary" is neither an emotion nor a sentiment name** — it is a *region of the trust axis*. Authoring `{emotion: 'wary', strength: −0.45}` yields "the opposite of wary", which nobody can name. Because `emotion` on a sentiment is free text, nothing currently stops that; bands are the fix, letting one bipolar quantity (`trust`) carry the whole vocabulary from hostile to trusting without inventing a second emotion for its negative half.

One caveat the stores don't settle: sentiments are directed but not all bipolar — *"fear of the wolf"* is a legitimate directed sentiment where negative is as meaningless as negative wariness. Polarity therefore genuinely varies per word within sentiments, which is why `min` carries meaning (below) and why the editor assists rather than guesses.

So an author who wants **a trust bar** must hand-author every trust change, and an author who wants **modelled trust** gets no display at all beyond a mood blob that doesn't say *trust*. The two are treated as rival systems when they are in fact a **mechanic** and a **display**, which vary independently.

## The proposal in one line

A counter gains an optional **`source`**. When absent (today's behaviour, and every existing project) the counter is authored. When present, the counter becomes a **read-only window onto affect state** — it renders exactly like any other meter, but its value is derived.

```ts
export interface CharacterCounter {
  name: string;
  displayName: string;
  value: number;            // authored value; ignored when `source` is set
  min?: number; max?: number;
  // …existing display fields (showLevelMeter, numericFormat, color…) unchanged
  /** Omitted (default) = authored counter, moved only by effects.
   *  Present = derived display; `value` is computed each render. */
  source?: CounterSource;
  /** Optional named ranges rendered as a phrase. Applies to authored
   *  counters too — nothing here is affect-specific. */
  bands?: Array<{ from: number; label: string }>;
}

type CounterSource =
  | {
      kind: 'sentiment';          // characterSentiments — directed, [−1, +1]
      toEntityRef: string;
      emotion: string;
      /** Whose sentiment is shown. Omitted = the counter's own character.
       *  Set it to point a meter at another character — the player-facing
       *  "how much does the caseworker trust you" bar. */
      fromCharacterRef?: string;
    }
  | { kind: 'emotion'; emotion: string }              // characterEmotionLevels — undirected, [0, 1]
  | { kind: 'mood'; axis: 'valence' | 'arousal' };    // characterMoods — [−1, +1] per axis
```

That is the whole data change. Everything else — meter frames, HUD packing, `visible`, colours, labels, translations — keeps working untouched, because a derived counter is still a `CharacterCounter`.

**Why on the counter and not the frame:** `meterFrame` is pure presentation (dock mode, anchor, bar geometry) and renders whichever counters are `visible`. Binding belongs to the quantity, not to the box it's drawn in. This also means a character can mix authored and derived meters in one frame, which is the realistic case — *Gold: 42* next to *Trust: ▓▓▓░░*.

## Projection: the bar originates at zero

Sentiment strength and mood axes are **signed, [−1, 1]**. Counters are typically **0…100**. Any binding therefore projects, and the author must be able to predict the result — otherwise a bar that moves the "wrong way" is undebuggable.

There is **one rule**, and no setting:

> The bar originates at zero — wherever zero falls in `[min, max]` — and grows toward the value.

```
zero sits at (0 − min) / (max − min) of the bar width
value      = strength ≥ 0 ? strength × max : strength × |min|
```

That single rule produces every reading the author might want, selected entirely by the `min`/`max` they already set:

**`min: 0, max: 100`** — zero is the left edge, so the bar grows rightward from it. The familiar gauge. Negative strength clamps to an empty bar, which is the honest reading of "I don't model distrust": *nothing yet*.

```
Trust         0 ──────────────── 100
  trusting   [▓▓▓▓▓▓▓▓▓▓░░░░░░]   62
  wary       [░░░░░░░░░░░░░░░░]    0   (clamped)
```

**`min: -100, max: 100`** — zero is the centre, so the bar grows *outward from the centre*. Distrust reads as distrust rather than as "a bit less trust".

```
Trust        −1 ────────┼──────── +1
  wary       [░░░░▓▓▓▓│░░░░░░░░]   −0.45
  trusting   [░░░░░░░░│▓▓▓▓▓░░░]   +0.62
```

Asymmetric ranges (`min: -50, max: 100`) fall out of the same formula with zero a third of the way in.

**`min` is therefore a semantic declaration, not just a display bound**: setting `min: 0` says *this word has no opposite*. An `{kind: 'emotion'}` source is unipolar by construction and needs no decision — the store is already [0, 1]. For a sentiment source the editor assists: when the author types a name matching a palette emotion (fear, anger, shame…), it proposes `min: 0` and says why. It does **not** clamp an authored negative at runtime — silently flooring an explicitly-authored value is exactly the runtime override this project rules out; the assist belongs at authoring time, where the author can see and overrule it.

Note what this rule rules *out*: remapping −1…+1 onto 0…100 so that neutral sits at half-full. That moves the origin away from zero, so a character who feels nothing shows a half-filled bar reading as a partial score. Rejected.

A second colour for the negative direction is **optional polish**, not a requirement — direction already carries the sign, and the band phrase carries it in words.

The formula still belongs **in the editor UI next to the control**, not only in this document — a live readout showing *sentiment 0.62 → meter 62 / 100* removes the entire class of "why is it showing that number" support questions.

## Qualitative bands

A counter may carry author-defined **bands**: named ranges rendered as a phrase where the number would otherwise go.

```ts
bands?: Array<{ from: number; label: string }>;
// e.g. −100 "strong distrust", −60 "wary", −20 "neutral", 20 "trusting", 60 "deep trust"
```

Bands make a derived meter readable without teaching anyone the underlying model, and they carry the qualitative flip in words — *wary* → *trusting* — which bar geometry alone only implies. They apply to authored counters too; nothing about them is affect-specific.

**They reuse the existing display fields — no new plumbing.** `numericFormat` gains a fourth option:

| want | `showLabels` | `showLevelMeter` | `numericFormat` |
|---|---|---|---|
| bar + number (today) | on | on | `value` |
| bar + phrase | on | on | `band` |
| phrase only — the helper's "a phrase" answer | off | off | `band` |

So the display is three independent parts — **label · bar · readout** — all already controllable.

### Only one string changes

The band phrase is the changing string. The axis label is **not** also swapped per pole (negative half relabelled "Distrust", positive "Trust"), even though that would smooth the slightly odd read of *"Trust: strong distrust"*. Two independently changing strings is a second mechanism for a problem the first already solves: let the band phrases be self-describing — *"strong distrust"* names its own dimension — and switch the axis label off.

### Suggested ladders, never imposed

The editor proposes a ladder seeded from the bound source, with the emotion name substituted in (binding `respect` proposes *contempt · dismissive · neutral · respectful · deep respect*). Every entry is editable and deletable; deleting them all returns a bare number.

| source | proposed ladder |
|---|---|
| bipolar sentiment | strong distrust · wary · neutral · trusting · deep trust |
| unipolar emotion | none · slight · moderate · strong |
| mood axis | unpleasant · flat · pleasant |

**Whatever the opening value is, check what word it lands on.** Bands partition by last-threshold-≤-value, so every point always resolves to a label — there is no undefined gap. The thing to watch is subtler: a ladder without a neutral band puts *some* judgemental word on the opening value, and that word is the first characterisation the interactor ever receives.

Whether that's a defect depends entirely on whether the opening value is intentional:

- **Seeded stance** — a guarded character opening on "wary" is *characterisation*, and a useful one. It tells the interactor who they are dealing with before they have acted. A ladder without a neutral band is fine, even preferable.
- **Unseeded (today's default)** — the sentiment starts at exactly 0 and the same word now asserts a suspicion nobody has earned.

Today the second case is the common one. Archetypes deliberately seed **self-directed sentiments only** (`PersonalityArchetypes.ts`: "a project-agnostic preset cannot know the cast"), and `seedCharacterAffectFromStory` seeds only what the author hand-wrote in `initialSentiments` — so even a fully-specified personality starts at zero toward everyone. Hence: propose the neutral band by default, and drop it without complaint when the author has seeded a stance.

Unipolar ladders sidestep this entirely — zero genuinely is "none".

> **Follow-on, out of scope here:** derive an *opening* stance from traits, so characters don't all start neutral toward the cast. `Interpersonal-Stance-Model.md` already establishes warmth ≈ the compassion aspect of agreeableness, so the mapping exists. It must be **suggested, not automatic** — an opening stance toward the player is an authorial decision — and it changes affect seeding, so it does not belong in counter binding.

### Translation

Band labels are **player-facing strings**. They must ride through both extractors — `StoryTranslator.ts` and the embedded copy in `HtmlExporter.ts` — or they render in the authoring language inside an exported translated story.

## Derived meters are read-only in the effects editor

If `setCounter('trust', 90)` were allowed on a derived counter, the next appraisal tick would overwrite it and the author would have discovered a bug, not a feature. So:

- The effect editor's counter dropdown **excludes** derived counters, with the reason shown inline (*"Trust is derived from sentiment — change it with an affect effect"*), not silently filtered.
- Alongside it, the affect effect that *does* move the underlying quantity is offered as the obvious substitute — `addSentiment` (target/emotion/`strengthDelta`) for a sentiment binding, `nudgeMood` for a mood binding. Both already exist and need no changes.

**Write-back is rejected.** A meter that both displays and mutates a modelled sentiment would make the meter a second authority over affect state, and the two would fight on every appraisal. The author who wants direct control already has the right tool: an authored counter, with no `source`.

Conditions are the opposite case and stay open: reading a derived counter in a condition is safe and useful, and should keep working exactly as it does now (`getCharacterCounter` resolves the derived value).

## Consequence for the affect opt-out

An author who wants nothing to do with affect is unaffected: with no `source`, nothing changes anywhere. More importantly, **the binding UI must not advertise affect to characters that have none.**

A character created from *Blank Character* has no `traits` and no `initialMood`. For that character the source picker should offer only "authored", with derived options disabled and one line of explanation (*"This character has no personality or mood set up"*) plus a link to add it. Enabling affect stays a deliberate act.

This is the same principle as the template-disclosure fix: the affect system should never arrive by side effect, and it should never be *concealed* when it does arrive.

## What the character helper asks

The helper must not ask authors to rank their own ambition. "Full emotion system or simple representation?" reliably produces "full" — nobody picks the option labelled lesser, and the author then owns a model they didn't want. Two questions, both about the fiction rather than the machinery, and deliberately **separate** because they are independent:

**1 — How does this quantity move?**

> - **You set it at specific moments** — you decide exactly when trust rises and by how much.
> - **It responds to what happens** — trust shifts on its own from events, and this character's personality shapes how much.

No tier language, no "simple", no "advanced". The first answer produces an authored counter; the second produces a sentiment plus a derived counter.

**2 — How does the interactor see it?**

> - **A meter** — a labelled bar (*Trust*).
> - **A mood token** — the character's overall feeling, no number.
> - **A phrase** — "wary", "warming up".
> - **Nothing** — it shapes what happens, but the interactor infers it.

This is where the design's central idea becomes a UI affordance: *responds to what happens* + *a meter* is precisely "counter as display, not mechanic", and it is now reachable in two clicks instead of being unrepresentable. Equally, *responds to what happens* + *nothing* is a legitimate and common answer — modelled affect with no HUD at all.

The four display answers map to: derived counter with `showLevelMeter`; `moodFrame.displayStyle: 'token'`; a derived counter with `bands` and the bar hidden; no frame at all.

## Migration

None. `source` is optional and absent everywhere, so every existing project keeps identical behaviour with no version bump and no deserializer change beyond carrying one more field.

Note the standing trap, which applies to the *counter* whitelists exactly as it does to beats: a new field that isn't carried through save → load → preview serialization is silently dropped and reads `undefined` at runtime. `CharacterCounter` is serialized as part of the character record rather than through the beat path, so it needs checking on the character save/load and the preview payload, plus `handleSelectTemplate` in `CharacterManager` — the same instantiation copy-list that would have swallowed `traits` last week.

## Decisions (2026-08-10)

Settled in review; the sections above already reflect them.

1. **Qualitative bands — yes**, author-set thresholds. Adds `bands`, reuses `numericFormat: 'band'` for display, applies to authored counters too.
2. **Aggregate sources — not now.** One emotion toward one target: the bar means exactly one thing. `resolveSentimentBaseline` already aggregates when the emotion is omitted, so an `{kind: 'sentimentOverall'}` source can be added later with no migration.
3. **Projection — no setting.** The bar originates at zero wherever zero falls in `[min, max]`. This replaced an earlier proposal of two selectable projections (`centered` / `remapped`); the remapped reading is rejected outright because it moves the origin off zero. `min: 0` clamping negatives to empty is a consequence of the rule, not a special case.
4. **Cross-character binding — yes**, optional `fromCharacterRef`. The player-facing "does she trust me" bar is the central case in the rehearsal scenario.
5. **Emotion-level source added.** The polarity discussion showed the first draft had only two of the three affect stores. `{kind: 'emotion'}` covers unipolar intensities and is the correct home for fear / anger / shame.
6. **Assist, don't impose.** Suggested band ladders and a suggested `min` — both overridable, neither enforced, and no runtime clamping of authored values.
7. **Neutral band is a default, not a rule.** It matters only because opening sentiments are currently always zero; an author who seeds a stance should drop it, since "wary" then reads as characterisation rather than as an unearned accusation.

Nothing here is built yet.

**Noted for later, deliberately not in this design:** trait-derived opening stances toward the cast (see the follow-on note under *Suggested ladders*). It would make characters open in-character rather than uniformly neutral, but it changes affect seeding and must be author-confirmed, so it is its own piece of work.

## Estimated shape of the work

Small, and mostly UI.

- **Core** — derive-on-read in the counter accessor across the three stores, plus the origin-at-zero projection and the band lookup. One file, a clean pure-function seam, easy to test exhaustively.
- **Builder** — source picker in the counter editor; the live readout (*sentiment 0.62 → meter 62/100 → "trusting"*); the band ladder editor with its seeded suggestion; effect-dropdown exclusion with the reason shown; the `min: 0` suggestion for unipolar names. This is the bulk of the work.
- **Renderer** — zero-origin bar (one geometry change, not a new component) and `numericFormat: 'band'`.
- **Translation** — band labels into both extractors.

The affect runtime itself needs **no changes at all**: every quantity this binds to is already computed and updated every beat. That claim survived the polarity discussion only because the unipolar assist was kept at authoring time — a runtime clamp would have broken it.
