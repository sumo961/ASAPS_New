/**
 * Shared affect-prompt module — one source of truth for what AI generation
 * paths should know about characters-as-runtime-entities (Layer 2) and the
 * full affect stack (Layer 3+: mood, sentiments, emotions, traits, goals,
 * variants, dossier policies, baselines, bookmarks).
 *
 * Both AI generation paths (the in-app provider stack and the standalone
 * MCP servers) compose their system prompts by including the output of
 * `buildAffectPromptSection(depth)`. The MCP servers, which don't take a
 * dependency on @asaps/core, keep a copy of this content marked with a
 * `SYNC SOURCE: packages/core/src/prompts/affectPrompt.ts` comment — drift
 * between them is the maintenance hazard CLAUDE.md flags as the prompt-sync
 * concern.
 *
 * Design (v0.9.45 round 3): tiered always-on, no global on/off toggle.
 * Authors get an `affectDepth` knob — 'auto' (default), 'sparse',
 * 'standard', 'rich' — that scales how much of the affect system the
 * generated output uses. The full system is taught at every tier; the
 * tier just controls how much the AI is asked to deploy. The 'auto' mode
 * tells the AI to read the user's story prompt and pick depth itself.
 *
 * Why no checkbox: a binary toggle implies the affect system is exotic
 * or off-by-default, which contradicts the work landed across v0.9.43 —
 * v0.9.45. Tiered depth keeps lean output available for puzzle / quiz /
 * minimal-story prompts without saying "this advanced feature is hidden."
 */

/**
 * Affect deployment depth for AI story generation.
 *
 *   - `'auto'` (default) — AI reads the user prompt and picks depth itself,
 *     between sparse (puzzles, quizzes, linear branching with no character
 *     interiority) and rich (emotional drama, character development arcs).
 *   - `'sparse'` — explicit minimal mode. Characters are speakers; no mood,
 *     no traits, no goals, no affect-aware conditions. Lean output, lean
 *     prompt token cost.
 *   - `'standard'` — affect annotations on emotionally salient choices,
 *     mood seeds for major characters, optional goals. No traits or
 *     variants unless the prompt explicitly calls for them.
 *   - `'rich'` — full affect deployment: traits, goals with priorities,
 *     variant overlays where appropriate, dossier policy = reflection on
 *     characters meant to evolve, effect templates and condition templates
 *     liberally, bookmark important emotional checkpoints.
 */
export type AffectDepth = 'auto' | 'sparse' | 'standard' | 'rich';

/**
 * Compose the affect-aware section of an AI generation system prompt.
 *
 * Always includes Layer-2 foundations (characters as runtime entities) and
 * the depth-dial guidance. The affect catalog, effects/conditions
 * reference, and dossier policy heuristic are gated to standard+ to keep
 * sparse mode lean.
 *
 * Returns plain Markdown-flavoured text suitable for concatenation into a
 * larger system prompt. Stable string output — callers can assume newlines
 * normalise.
 */
export function buildAffectPromptSection(depth: AffectDepth = 'auto'): string {
  const parts: string[] = [];

  // ---- Layer 2 foundations (always) -----------------------------------
  parts.push(LAYER2_FOUNDATIONS);

  // ---- Affect catalog (standard+) -------------------------------------
  if (depth === 'auto' || depth === 'standard' || depth === 'rich') {
    parts.push(AFFECT_CATALOG);
  }

  // ---- Effects & conditions reference (standard+) ---------------------
  if (depth === 'auto' || depth === 'standard' || depth === 'rich') {
    parts.push(EFFECTS_CONDITIONS_REFERENCE);
  }

  // ---- Dossier policy heuristic (standard+) ---------------------------
  if (depth === 'auto' || depth === 'standard' || depth === 'rich') {
    parts.push(DOSSIER_POLICY_HEURISTIC);
  }

  // ---- Depth dial guidance (always) -----------------------------------
  parts.push(buildDepthDialGuidance(depth));

  return parts.join('\n\n');
}

// =====================================================================
// Section: Layer 2 foundations — always included
// =====================================================================

const LAYER2_FOUNDATIONS = `## Characters Are Runtime Entities (foundation)

A character is not just a name in dialogue — every \`Character.id\` is a
stable runtime entity the engine tracks across the whole story. Treat ids
as canonical: rename via \`displayName\`, never via \`id\`. The engine
resolves operators (mood, sentiment, emotion, trait, goal, characterVariant)
against the canonical id, so once a character has an id, all references
across beats, choices, conditions, and effects use that same id.

The \`'player'\` ref is a sentinel. Use it as the sentiment-target for
"feelings toward the player" or as the holder of a generic
\`requires.character\` check, even when the player has no \`Character\`
record. Project-level state (counters, variables, inventory) can live
either at story-scope (no \`character\` field) or scoped to a specific
character via \`character: '<id>'\` — character-scoped state isolates
per-character flags so two NPCs each track their own counter independently.`;

// =====================================================================
// Section: Affect catalog — standard+
// =====================================================================

const AFFECT_CATALOG = `## Affect Catalog (mood, emotion, sentiment, trait, goal, variant)

Every character carries six runtime affect slots that you can author
initial values for and modify via Effects, then read back via Conditions:

**Mood** — 2D vector \`{ valence, arousal }\` ∈ [-1, 1] each. Russell's
circumplex: positive valence = pleasant, positive arousal = activated.
Set initial mood on the character; nudge via \`nudgeMood\` Effect; check
with \`mood\` Condition (axis: 'valence' | 'arousal'). Optional on-stage
HUD renders the live mood pad.

**Sentiments** — directed emotional memories: \`{ toEntityRef, emotion,
strength }\`. Strength clamped to [-1, 1]. Self-directed sentiments
(target = the holder character) read as \`self-shame\`, \`self-trust\`,
etc. — useful for guilt / self-esteem arcs. Author initial sentiments
on the character; modify via \`addSentiment\` Effect; check with
\`sentiment\` Condition.

**Emotion levels** — runtime intensity per emotion (\`fear\`, \`joy\`,
\`pride\`, etc.) ∈ [0, 1], decaying per beat. Default palette is Ekman 6
+ pride/shame/interest, but the project's palette is editable. Fire via
\`fireEmotion\` Effect (auto-nudges mood by palette weights); check with
\`emotion\` Condition.

**Traits** — static Big Five bag per character: \`openness\`,
\`conscientiousness\`, \`extraversion\`, \`agreeableness\`,
\`neuroticism\` ∈ [0, 1] each. Traits modulate emotion deltas at runtime
(high-neuroticism characters feel fear more strongly, etc.). Check with
\`trait\` Condition. Use the 10 archetype presets when appropriate
(narcissist, anxious-introvert, conscientious-leader, free-spirit,
recluse, hothead, peacekeeper, stoic, trickster, balanced).

**Goals** — authored objectives \`{ id, name, description?, priority?,
satisfaction? }\`. Optional satisfaction predicates auto-flip status;
runtime fires GAMYGDALA-style emotions on status changes (pride+joy on
\`met\`, shame+sadness on \`failed\`, scaled by priority and modulated by
traits). Check with \`goal\` Condition; flip via \`setGoalStatus\` Effect.

**Variants** — partial overlays on a Character record (alternate
persona / portrait / displayName / mood seed / trait values). Same id,
same beats, only the affect slice swaps. Use for "play as introvert /
extrovert" branches, or for character development arcs that need an
atomic before/after switch (an awakening, a revelation, a death of
innocence). Switch via \`setCharacterVariant\` Effect; check with
\`characterVariant\` Condition.
A variant whose identity is interpersonal (hostile, cooperative,
withdrawn, leading…) should also carry a \`stance\` — its position on the
interpersonal circumplex: \`"stance": { "warmth": -1..1, "dominance": -1..1 }\`
(cold↔warm, submissive↔dominant). Keep the variant's Big Five consistent
with its stance: extraversion tracks friendly dominance and agreeableness
tracks warm submissiveness — shift the BASE character's values by roughly
0.35 × (dominance+warmth)/1.41 for extraversion and
0.35 × (warmth−dominance)/1.41 for agreeableness, so a hostile variant of
a shy character stays recognizably shy.
Characters whose variants are dispositions for REPLAY VARIETY (the
"different client every session" training/rehearsal pattern) should set
\`"variantSelectionPolicy": "random"\` on the character — the runtime then
draws a variant at random at every story start, and each restart can meet
a different disposition. Narrative variants picked by the player or by an
authored \`setCharacterVariant\` Effect keep the default fixed behavior
(set \`defaultVariantId\` instead).`;

// =====================================================================
// Section: Effects & conditions reference — standard+
// =====================================================================

const EFFECTS_CONDITIONS_REFERENCE = `## Affect-Aware Effects & Conditions

Effects and Conditions both target the affect slots. Use them on choices,
in standalone \`updateAffect\` beats, on \`conditionBeat\` branches, and
on per-beat \`requires\` annotations.

**Affect-related Effect types:** \`nudgeMood\` (valenceDelta,
arousalDelta), \`fireEmotion\` (emotion, emotionDelta), \`addSentiment\`
(sentimentTarget, sentimentEmotion, strengthDelta), \`addReflection\`
(reflectionText, reflectionSalience? — Mode B only), \`setGoalStatus\`
(goalId, goalStatus), \`setCharacterVariant\` (variantId), and the new
\`bookmarkAffectState\` (bookmarkName, scope?).

**Affect-related Condition operators:** \`mood\`, \`emotion\`, \`sentiment\`,
\`trait\`, \`goal\`, \`characterVariant\`. The first three accept a
\`baseline\` field that switches comparison mode:

  - \`'literal'\` (default) — current value vs. \`value\` (legacy threshold).
  - \`'initial'\` — \`(current - story-start value)\` vs. \`value\`. The
    runtime captures initial values on first-touch *and* at seed time, so
    off-neutral seeded characters get the right baseline. Use this to
    phrase "trust toward player has grown by ≥ 0.3 since the story began."
  - \`{ bookmark: 'name' }\` — \`(current - bookmarked value)\` vs. \`value\`.
    Pair with a \`bookmarkAffectState\` Effect placed at the moment the
    snapshot should be taken (an act break, a reunion scene, a confrontation).

**Authoring rhythm**: prefer **multi-row Effect bundles** on choices and
\`updateAffect\` beats — a single empathetic-max-support choice typically
emits 5-9 effect rows (mood nudge + emotion fires + sentiment shifts +
counter increments). Don't try to express affect change with a single
nudge; the layered effect is closer to how feelings actually work.

**Templates** are starting points, not contracts. Eight effect templates
ship by default (empathetic-max, empathetic-partial, pushy-dismissive,
silent-failed, boundary-respecting, validating, defensive-overreach,
recovery-quiet). Twenty-eight condition templates ship covering both
threshold and delta-from-initial flavours. Authors apply a template,
then fine-tune individual values.

**State requirements** (\`requires\` on any beat) and the \`Update Affect\`
beat both accept the same Effect / Condition shapes — the editor is the
same as a choice's effects.

### 🚨 SYMMETRY RULE: Effects and Conditions must match

If you author affect Effects, you MUST also use affect Conditions to
read them — otherwise the affect data is decorative and the player's
emotional choices don't actually shape the story. Concretely:

  - **If you author ≥ 3 affect Effects (\`nudgeMood\`, \`fireEmotion\`,
    \`addSentiment\`, \`setGoalStatus\`) targeting a character, at least
    one downstream conditionBeat MUST branch on that character's affect
    — not on a derived flag.** Don't author \`addSentiment\` on every
    choice and then check \`hasComfortedMara: true\`. Branch directly on
    \`sentiment\` toward the player.
  - **Use \`baseline: 'initial'\` for "X has grown / improved / changed"
    semantics.** Off-neutral seeded characters (Mara starting at
    \`valence: -0.55\`) need delta-from-initial comparisons, not literal
    thresholds, or the condition fires for the wrong reason.
  - **Pair every \`bookmarkAffectState\` Effect with at least one later
    condition referencing that bookmark** — otherwise the bookmark is
    dead code. If you can't think of what to compare against the
    bookmark, you don't need the bookmark.
  - **And the reverse: every condition with \`baseline: { bookmark: "X" }\`
    MUST have an upstream \`bookmarkAffectState\` Effect with
    \`bookmarkName: "X"\` reachable on every path that leads to the
    condition.** Orphan bookmark references are a silent bug — the
    runtime resolves the missing snapshot to 0, so the condition
    becomes a literal threshold against zero, not what the author
    intended. Names must match exactly. Use a clear naming convention
    (\`act1_end\`, \`reunion_scene\`, \`first_betrayal\`) and reuse the
    same name in the Effect and the Condition.

### Worked example: trust-evolution branch

The player's choices nudge Mara's trust toward the player up or down
across the story. After three acts, you want to branch on whether the
relationship grew. Author it like this:

\`\`\`json
{
  "id": "beat_choice_act1",
  "type": "dialogTree",
  "parameters": {
    "dialogTree": {
      "choices": [
        {
          "text": "Stay quiet and listen.",
          "target": "beat_act2_open",
          "effects": [
            { "type": "nudgeMood", "target": "mara", "valenceDelta": 0.15, "arousalDelta": -0.10 },
            { "type": "fireEmotion", "target": "mara", "emotion": "joy", "emotionDelta": 0.20 },
            { "type": "addSentiment", "target": "mara", "sentimentTarget": "player",
              "sentimentEmotion": "trust", "strengthDelta": 0.30 }
          ]
        }
      ]
    }
  }
}
\`\`\`

Then **before the ending**, branch on whether trust actually grew:

\`\`\`json
{
  "id": "beat_check_trust",
  "type": "conditionBeat",
  "parameters": {
    "condition": {
      "type": "sentiment",
      "character": "mara",
      "sentimentTarget": "player",
      "sentimentEmotion": "trust",
      "operator": ">=",
      "value": 0.3,
      "baseline": "initial"
    },
    "trueConnection": { "target": "beat_warm_ending" },
    "falseConnection": { "target": "beat_distant_ending" }
  }
}
\`\`\`

Note \`baseline: "initial"\` — value 0.3 reads as "trust has grown by
≥ 0.3 from where Mara started", not "trust is now ≥ 0.3 absolute". For
a character seeded with \`initialSentiments: [{toEntityRef: 'player',
emotion: 'trust', strength: -0.2}]\`, the literal threshold would
require the player to win Mara back from negative AND get her to
positive 0.3 — almost unattainable. The delta version means "you moved
her by 0.3 in either direction" — the actual story question.

### Worked example: bookmarks are TWO-STEP

\`baseline: 'initial'\` is automatic — the runtime captures it for you.
Bookmarks are NOT automatic. They are a strict two-step authoring
protocol. **You must emit the Effect first, then you can reference the
bookmark in a Condition.** Skipping step 1 makes step 2 silently
broken.

**Step 1: Take the bookmark at the act break.** Emit a
\`bookmarkAffectState\` Effect on the *first beat* of the new act, OR
on a transition beat between acts. The simplest place: an
\`updateAffect\` beat sitting between Act 1 and Act 2 whose only job is
to snapshot state.

\`\`\`json
{
  "id": "beat_act1_to_act2",
  "type": "updateAffect",
  "parameters": {
    "effects": [
      {
        "type": "bookmarkAffectState",
        "target": "",
        "bookmarkName": "act1_end",
        "scope": "all"
      }
    ]
  }
}
\`\`\`

Or inline on the choice that exits Act 1:

\`\`\`json
{
  "text": "Walk away.",
  "target": "beat_act2_open",
  "effects": [
    { "type": "nudgeMood", "target": "mara", "valenceDelta": -0.10 },
    { "type": "bookmarkAffectState", "target": "", "bookmarkName": "act1_end", "scope": "all" }
  ]
}
\`\`\`

**Step 2: Reference the bookmark in a later Condition.** Use the SAME
name (\`act1_end\`) in \`baseline: { bookmark: "..." }\`:

\`\`\`json
{
  "id": "beat_check_growth",
  "type": "conditionBeat",
  "parameters": {
    "condition": {
      "type": "sentiment",
      "character": "mara",
      "sentimentTarget": "player",
      "sentimentEmotion": "trust",
      "operator": ">=",
      "value": 0.2,
      "baseline": { "bookmark": "act1_end" }
    },
    "trueConnection": { "target": "beat_warm_finale" },
    "falseConnection": { "target": "beat_distant_finale" }
  }
}
\`\`\`

This reads as: "Has Mara's trust toward the player grown by ≥ 0.2
since the act-1 bookmark?" — the actual question for an act-3 finale.

**Common mistake to avoid**: authoring a Condition with
\`baseline: { bookmark: "act1_end" }\` *without* an upstream
\`bookmarkAffectState\` Effect with the same name. That's the orphan
bug — the runtime resolves the missing snapshot to 0, the condition
fires for the wrong reason, and your "growth gate" becomes random.
**Whenever you write \`bookmark: "X"\` in a Condition, audit the beats
upstream and confirm an Effect with \`bookmarkName: "X"\` is reachable
on every path that leads to it.**`;

// =====================================================================
// Section: Dossier policy heuristic — standard+
// =====================================================================

const DOSSIER_POLICY_HEURISTIC = `## Dossier Policy Selection

Each character has a \`dossierPolicy\` field that controls how AI-runtime
beats (\`aiDialogTree\`, \`aiConversation\`, \`aiSummary\`) see them:

  - \`'reAnchor'\` (default — pick this for most characters) — every turn,
    the dossier rebuilds from structured state (mood + sentiments + goal
    statuses + active variant). No drift; the character's "personality"
    is the structured data. Cheap, deterministic, recommended unless you
    have a specific reason otherwise.
  - \`'reflection'\` — accumulates per-turn reflections (short narrative
    notes about what just happened) into a 32-entry FIFO ring with
    salience-aware eviction. The dossier reads recent reflections so the
    character grows / remembers. More expensive (token cost grows over
    play length); use only when the character is *meant* to evolve across
    the story (a mentor figure who learns from the player, a redemption
    arc, a character with explicit memory of past choices).

**Default to \`reAnchor\`. Use \`reflection\` only when the prompt mentions
character development, growth, evolution, or memory.** Pair \`reflection\`
characters with \`addReflection\` Effects on key emotional beats so the
memory has content to draw on.`;

// =====================================================================
// Section: Depth dial guidance — always
// =====================================================================

function buildDepthDialGuidance(depth: AffectDepth): string {
  const explicitMode = depth !== 'auto'
    ? `\n\n**Active depth: \`${depth}\`** — emit at this tier regardless of prompt content.`
    : '';

  return `## Affect Depth Dial${explicitMode}

Three deployment tiers, distinguished by how much of the affect system the
generated story uses. **In \`auto\` mode (default), read the user prompt
and pick the tier yourself.** Authors override via the \`affectDepth\`
parameter when they want to force a tier.

### Sparse — pick when the prompt is:
- a puzzle / quiz / educational module
- a strictly linear or trivially branching narrative
- explicitly minimal ("a simple story about…")
- a system test / template / placeholder

**At sparse**: characters are speakers and inventory holders. Skip
\`initialMood\`, \`traits\`, \`goals\`, \`variants\`, and dossier-policy
overrides. Use only the classic Condition operators (counter, variable,
inventory, visitedBeat). No \`nudgeMood\` / \`fireEmotion\` /
\`addSentiment\` Effects. No \`updateAffect\` beats. Lean and structural.

### Standard — pick when the prompt is:
- most narrative prompts that don't explicitly call for either extreme
- "tell a story about…" without a specifically minimal framing
- has emotionally salient moments (a friend in trouble, a confrontation,
  a small kindness, a lie that lands or doesn't)

**At standard**: deploy mood seeds for major characters (\`initialMood\`
on 2-4 emotionally salient characters; the rest stay neutral).
\`addSentiment\` Effects on key relationship moments. \`fireEmotion\`
Effects on emotionally significant choices. Use \`mood\` and
\`sentiment\` Conditions on at least one branch — typically near a
mid-story decision or before an ending. Skip \`traits\` and \`variants\`
unless the prompt explicitly calls for personality / multiple personas.
Keep \`dossierPolicy\` at default \`reAnchor\` for everyone.

### Rich — pick when the prompt mentions:
- character development, growth, or arcs
- emotional drama, mental health, relationships at the foreground
- multiple personas / playable identities (gender, archetype,
  background) for the protagonist
- "interactive drama" / "explorable story" framing

**At rich**: deploy the full system.

- **\`traits\` is REQUIRED** on every character who appears in more than
  one beat — at least 3 of the 5 Big Five dimensions populated. Map the
  character description to traits explicitly ("disciplined, settled life"
  → high conscientiousness; "depressive silences" → high neuroticism;
  "funny, brilliant, restless" → high openness + extraversion). Use an
  archetype preset (anxious-introvert, conscientious-leader, recluse,
  hothead, etc.) when one fits, or hand-tune. Without traits, runtime
  emotion-modulation is uniform across the cast and the rich tier
  collapses into decorated-standard.
- **\`goals\`** with priorities for major characters.
- **\`variants\` REQUIRED when you bookmark a character transition.** If
  you emit a \`bookmarkAffectState\` whose name describes a character's
  state change (e.g. \`after_disclosure\`, \`after_depressive\`,
  \`post_betrayal\`), you must also define a variant on that character
  with a visibly distinct displayName, shifted initialMood, and at least
  one shifted initialSentiment — and a \`setCharacterVariant\` Effect at
  the transition. The bookmark is the runtime snapshot; the variant is
  the authorial shift the player sees. Other variants (multiple
  personas, archetype switches) remain optional. When a variant's
  identity is interpersonal, give it a \`stance\` (see the Variants
  catalog entry) and keep its extraversion/agreeableness consistent
  with it; for rehearsal/training stories where the character should
  show up differently every playthrough, author 3-4 disposition
  variants and set \`variantSelectionPolicy: "random"\` on the character.
- **\`dossierPolicy: 'reflection'\`** on characters meant to evolve,
  paired with \`addReflection\` Effects on important moments.
- **Effect templates** (empathetic-max, boundary-respecting, etc.) as
  the basis for choice effects. Multi-row effect bundles on emotionally
  significant choices.

**Conditions must match the Effects** — see the SYMMETRY RULE above.
A rich-tier story without affect-aware conditionBeats is just decorated
flag-flow; the player's emotional choices have no narrative consequence.
Required at rich:
  - At least one conditionBeat per major emotional thread MUST branch
    on \`sentiment\` / \`mood\` / \`emotion\` / \`goal\`, not on a flag
    derived from those effects.
  - Use \`baseline: 'initial'\` ("X has improved since story start") on
    at least one of those conditions — this is *the* idiom for
    relationship-evolution stories. Threshold-style is the wrong tool
    for off-neutral seeded characters.
  - For multi-act stories: emit a \`bookmarkAffectState\` Effect at
    each act-break beat (e.g. \`bookmarkName: "act1_end"\`) AND
    reference at least one of those bookmarks via
    \`baseline: { bookmark: "..." }\` in a later condition. A bookmark
    without a referencing condition is dead code — don't author it.

### Across all tiers
- Ids and the \`player\` sentinel work the same way (Layer 2 foundations
  always apply).
- Character-scoped state (\`character: '<id>'\` on counters / variables /
  inventory) is available at every tier — use when state should be
  per-character rather than story-global.
- The non-affect parts of the story (beat structure, choice text,
  narrative voice) are not reduced at sparse — only the affect overlay is.`;
}
