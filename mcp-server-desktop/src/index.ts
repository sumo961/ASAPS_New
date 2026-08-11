#!/usr/bin/env node

/**
 * ASAPS MCP Server for Claude Desktop
 *
 * Model Context Protocol server that enables Claude Desktop to directly
 * create and inject stories into a running ASAPS Builder instance.
 *
 * Unlike the AI-powered MCP server, this one requires NO API keys.
 * Claude Desktop does all the reasoning - this server just provides:
 * - Beat schema documentation
 * - Example stories
 * - Story injection endpoint
 *
 * Architecture:
 * Claude Desktop <-> MCP Server <-> ASAPS Builder (localhost:3001)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const ASAPS_API_URL = process.env.ASAPS_API_URL || 'http://localhost:3001';

// =====================================================================
// SYNC SOURCE: packages/core/src/prompts/affectPrompt.ts
//
// This server doesn't depend on @asaps/core (it's standalone for
// portability), so this affect-prompt content is duplicated here. The
// canonical source is packages/core/src/prompts/affectPrompt.ts — when it
// changes, mirror the change into this block; the copy should stay
// byte-identical to it.
//
// This is the LAST hand-mirrored prompt copy. Everything else this server
// needs it fetches live from the running Builder (/api/schema/beats), which
// is why it can't drift on beat types the way the retired mcp-server did.
// =====================================================================

function buildAffectPromptSection(
  depth: 'auto' | 'sparse' | 'standard' | 'rich' = 'auto'
): string {
  const parts: string[] = [];
  parts.push(LAYER2_FOUNDATIONS);
  if (depth !== 'sparse') {
    parts.push(AFFECT_CATALOG);
    parts.push(EFFECTS_CONDITIONS_REFERENCE);
    parts.push(DOSSIER_POLICY_HEURISTIC);
  }
  parts.push(buildDepthDialGuidance(depth));
  return parts.join('\n\n');
}

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

function buildDepthDialGuidance(depth: 'auto' | 'sparse' | 'standard' | 'rich'): string {
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

// =====================================================================
// END SYNC SOURCE block
// =====================================================================

/**
 * HTTP client for ASAPS Builder API
 */
async function fetchAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${ASAPS_API_URL}${endpoint}`;
  console.error(`[ASAPS MCP Desktop] Fetching: ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch failed')) {
      throw new Error(
        `Cannot connect to ASAPS Builder at ${ASAPS_API_URL}. ` +
        'Make sure the Builder is running with API server enabled.'
      );
    }
    throw error;
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Check if ASAPS Builder is running and accessible
 */
const checkConnectionTool: Tool = {
  name: 'asaps_check_connection',
  description:
    'Check if the ASAPS Builder is running and accessible. ' +
    'Call this first to verify the connection before creating stories.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Get comprehensive beat type schema
 */
const getBeatSchemaTool: Tool = {
  name: 'asaps_get_beat_schema',
  description:
    'Get the complete schema for all ASAPS beat types. ' +
    'This tells you what beat types are available, their parameters, ' +
    'and how to structure story data. Visible beats support an optional "speaker" parameter ' +
    '(character displayName) to attribute text to a character. Call this before creating a story.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Get an example story structure
 */
const getExampleStoryTool: Tool = {
  name: 'asaps_get_example_story',
  description:
    'Get an example story structure showing the correct format ' +
    'for beats, connections, characters, and metadata. Includes character definitions ' +
    'with speaker assignments on beats. Use this as a template.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Get available visual themes
 */
const getThemesTool: Tool = {
  name: 'asaps_get_themes',
  description:
    'Get information about available visual themes. ' +
    'Themes control the visual presentation (colors, fonts, text animation). ' +
    'Use this to recommend the best theme for a story based on its genre.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Inject a complete story into ASAPS Builder
 */
const injectStoryTool: Tool = {
  name: 'asaps_inject_story',
  description:
    'Inject a complete interactive story into the running ASAPS Builder. ' +
    'The story will immediately appear in the visual editor. ' +
    'Use the beat schema and example to structure your story correctly.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        description: 'Story metadata',
        properties: {
          title: { type: 'string', description: 'Story title' },
          author: { type: 'string', description: 'Author name' },
          description: { type: 'string', description: 'Story description' },
        },
        required: ['title'],
      },
      beats: {
        type: 'array',
        description: 'Array of beat objects. Each beat needs: id, type, name, parameters, x, y. Visible beats can include a "speaker" parameter (character displayName) to attribute text.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique beat ID (e.g., "beat_0", "beat_1")' },
            type: {
              type: 'string',
              description: 'Beat type (titleScreen, infoText, dialogTree, movementChoice, pickProp, endScreen, etc.)',
            },
            name: { type: 'string', description: 'Display name in editor' },
            parameters: {
              type: 'object',
              description: 'Beat-specific parameters (varies by type)',
            },
            x: { type: 'number', description: 'X position in editor (use ~300px spacing)' },
            y: { type: 'number', description: 'Y position in editor (use ~200px spacing)' },
          },
          required: ['id', 'type', 'parameters'],
        },
      },
      connections: {
        type: 'array',
        description: 'Array of connections between beats',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source beat ID' },
            target: { type: 'string', description: 'Target beat ID' },
            label: { type: 'string', description: 'Optional connection label' },
          },
          required: ['source', 'target'],
        },
      },
      characters: {
        type: 'array',
        description:
          'Optional array of character definitions. Each character has an id, name, displayName, and role. ' +
          'The displayName is used as the "speaker" value on beats to attribute text to that character. ' +
          '"Narrator" is the default speaker when none is specified. ' +
          'The player character (role: "player") represents the interactor.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique character ID (e.g., "char_player")' },
            name: { type: 'string', description: 'Internal name' },
            displayName: { type: 'string', description: 'Display name shown in-game and used as speaker value on beats' },
            role: { type: 'string', description: 'Character role: "player", "npc", or "companion"' },
            counters: {
              type: 'array',
              description: 'Numeric counters for tracking values (health, trust, etc.)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  displayName: { type: 'string' },
                  value: { type: 'number' },
                  min: { type: 'number' },
                  max: { type: 'number' },
                },
              },
            },
            inventory: { type: 'array', description: 'Starting inventory items', items: { type: 'object' } },
          },
        },
      },
      suggestedTheme: {
        type: 'object',
        description: 'Recommended visual theme for this story. Use asaps_get_themes to see available themes.',
        properties: {
          themeId: {
            type: 'string',
            description: 'Theme ID: "builtin-visual-novel", "builtin-twine", or "builtin-point-and-click"',
          },
          reason: {
            type: 'string',
            description: 'Brief explanation of why this theme fits the story',
          },
        },
        required: ['themeId', 'reason'],
      },
      translations: {
        type: 'array',
        description:
          'Optional translations for multi-language stories. Write the story in one language, ' +
          'then provide translations for additional languages. Use "displayName" on pickProp props ' +
          'and "displayText" on movementChoice choices for translation-safe labels.',
        items: {
          type: 'object',
          properties: {
            languageCode: { type: 'string', description: 'ISO language code (e.g., "de", "fr", "es")' },
            languageName: { type: 'string', description: 'Human-readable language name (e.g., "German")' },
            strings: {
              type: 'object',
              description:
                'Key-value map of translation keys to translated strings. ' +
                'Keys use format: "beat:{beatId}.parameters.{field}" for beat text, ' +
                '"project.story.metadata.title" for story title, ' +
                '"project.story.characters.{index}.name" for character names.',
            },
          },
          required: ['languageCode', 'languageName', 'strings'],
        },
      },
    },
    required: ['metadata', 'beats'],
  },
};

/**
 * Get the affect-system author guide (v0.9.46+).
 *
 * Returns the same affect-prompt content the in-app generation uses,
 * scaled by an `affectDepth` parameter. Call this once per generation
 * session to learn how to author rich-character / affect annotations
 * (mood, sentiments, emotions, traits, goals, variants, dossier
 * policies, baseline-relative conditions, bookmarks). The depth
 * parameter controls how much detail you get — 'auto' is the default
 * and includes everything for you to pick from based on the user's
 * story prompt; explicit tiers force the prompt to focus on that depth.
 */
const getAffectGuideTool: Tool = {
  name: 'asaps_get_affect_guide',
  description:
    'Get the canonical author-guide for the rich-character / affect system. ' +
    'Returns Markdown content covering: characters as runtime entities, ' +
    'mood / emotion / sentiment / trait / goal / variant slots, affect-aware ' +
    'Effects and Conditions, baseline-relative comparisons, bookmarks, ' +
    'dossier policies, and the depth-dial guidance for picking how much affect ' +
    'to deploy. Call this when generating a story so you know how to author ' +
    'character interiority correctly. The "depth" parameter scales the guide: ' +
    '"sparse" returns just the foundations and depth-dial; "standard" / "rich" ' +
    'return the full system; "auto" (default) returns everything for you to pick from.',
  inputSchema: {
    type: 'object',
    properties: {
      depth: {
        type: 'string',
        description:
          'Optional depth filter. "auto" (default) returns the full guide; ' +
          '"sparse" returns only foundations + depth-dial; "standard" or "rich" ' +
          'return the same full guide with the matching tier marked active.',
        enum: ['auto', 'sparse', 'standard', 'rich'],
      },
    },
    required: [],
  },
};

// All tools
const tools: Tool[] = [
  checkConnectionTool,
  getBeatSchemaTool,
  getExampleStoryTool,
  getThemesTool,
  getAffectGuideTool,
  injectStoryTool,
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleCheckConnection(): Promise<any> {
  try {
    const health = await fetchAPI('/health');
    return {
      success: true,
      connected: true,
      status: health.status,
      websocket: health.websocket,
      message: 'ASAPS Builder is running and ready to receive stories.',
      apiUrl: ASAPS_API_URL,
    };
  } catch (error) {
    return {
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message:
        'Cannot connect to ASAPS Builder. Please start the builder with API server enabled:\n' +
        '  cd packages/builder && npm run api:start',
      apiUrl: ASAPS_API_URL,
    };
  }
}

async function handleGetBeatSchema(): Promise<any> {
  try {
    const schema = await fetchAPI('/api/schema/beats');
    return {
      success: true,
      schema,
      message:
        'Beat schema retrieved. Use these beat types and parameters to create your story.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to get beat schema. Is ASAPS Builder running?',
    };
  }
}

async function handleGetExampleStory(): Promise<any> {
  try {
    const example = await fetchAPI('/api/schema/example');
    return {
      success: true,
      example,
      message:
        'Example story retrieved. Use this as a template for your story structure.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to get example story. Is ASAPS Builder running?',
    };
  }
}

async function handleGetThemes(): Promise<any> {
  // Theme information is static - no need to fetch from API
  const themes = {
    themes: [
      {
        id: 'builtin-visual-novel',
        name: 'Visual Novel',
        description: 'Classic visual novel style inspired by Ren\'Py',
        bestFor: ['romance', 'drama', 'character-driven stories', 'anime-style narratives'],
        characteristics: [
          'Semi-transparent text box at bottom of screen',
          'Character name highlights in golden color',
          'Typewriter text animation (characters appear one by one)',
          'Dark overlay for backgrounds',
          'Serif fonts for elegance',
        ],
      },
      {
        id: 'builtin-twine',
        name: 'Text Adventure',
        description: 'Minimal text adventure style inspired by Twine/SugarCube',
        bestFor: ['interactive fiction', 'literary narratives', 'mystery stories', 'text-heavy games'],
        characteristics: [
          'Minimal UI with no visible text box frame',
          'Blue hyperlink-style choices (like web links)',
          'Serif typography (Georgia) for literary feel',
          'Dark background with light text',
          'Fade text animation',
          'Centered text layout',
        ],
      },
      {
        id: 'builtin-point-and-click',
        name: 'Point & Click Adventure',
        description: 'Classic adventure game style inspired by LucasArts',
        bestFor: ['adventure games', 'puzzle stories', 'exploration', 'mystery with locations'],
        characteristics: [
          'Golden text on dark blue surfaces',
          'Prominent hotspot indicators (always visible)',
          'Sharp corners, pixelated aesthetic',
          'Faster typewriter animation',
          'Dissolve scene transitions',
          'Inventory/exploration focus',
        ],
      },
    ],
    recommendationGuide: {
      'romance': 'builtin-visual-novel',
      'drama': 'builtin-visual-novel',
      'mystery (text-based)': 'builtin-twine',
      'mystery (exploration)': 'builtin-point-and-click',
      'horror': 'builtin-twine or builtin-visual-novel',
      'fantasy (epic)': 'builtin-visual-novel',
      'fantasy (adventure)': 'builtin-point-and-click',
      'sci-fi': 'builtin-twine or builtin-visual-novel',
      'comedy': 'builtin-visual-novel',
      'adventure/exploration': 'builtin-point-and-click',
      'literary/experimental': 'builtin-twine',
    },
    usage: 'Include a suggestedTheme object in your story with themeId and reason fields.',
    translationSupport: {
      description: 'ASAPS supports multi-language stories. Write the story in one language, then provide translations.',
      howTo: [
        'Write the story content in the primary language',
        'Add a "translations" array with objects for each additional language',
        'Each translation has languageCode, languageName, and strings (key-value pairs)',
        'Use displayName on pickProp props and displayText on movementChoice choices for translation-safe labels',
        'Translation keys: "beat:{beatId}.parameters.{field}" for beat text, "project.story.metadata.title" for title',
      ],
      example: {
        languageCode: 'de',
        languageName: 'German',
        strings: {
          'project.story.metadata.title': 'Mord im Blackwood Manor',
          'beat:beat_0.parameters.title': 'Mord im Blackwood Manor',
          'beat:beat_1.parameters.text': 'Sie kommen als Detektiv im Blackwood Manor an...',
        },
      },
    },
  };

  return {
    success: true,
    ...themes,
    message:
      'Theme information retrieved. Choose a theme based on your story genre and include it in the suggestedTheme field when injecting.',
  };
}

/**
 * Return the affect-system author guide. Hands Claude Desktop the same
 * Markdown content the in-app generation embeds in its system prompt,
 * so the connected Claude Desktop instance can author rich-character /
 * affect annotations correctly when generating stories. Depth filter
 * matches the canonical module's semantics — see affectPromptForDesktop
 * below.
 */
async function handleGetAffectGuide(args: any): Promise<any> {
  const depth = (args?.depth ?? 'auto') as 'auto' | 'sparse' | 'standard' | 'rich';
  const guide = buildAffectPromptSection(depth);
  return {
    depth,
    guide,
    message:
      'Affect-system author guide. Read this carefully before authoring a ' +
      'story so that character interiority (mood, traits, goals, etc.) is ' +
      'deployed correctly. The guide includes a depth-dial section that ' +
      'tells you how to pick a deployment tier from the user\'s prompt.',
  };
}

async function handleInjectStory(args: any): Promise<any> {
  const { metadata, beats, connections, characters, suggestedTheme, translations } = args;

  // Log injection attempt with timestamp for debugging duplicates
  const injectionTimestamp = new Date().toISOString();
  console.error(`[ASAPS MCP Desktop] handleInjectStory called at ${injectionTimestamp}`);
  console.error(`[ASAPS MCP Desktop] Story title: "${metadata?.title}", beats: ${beats?.length || 0}`);

  // Validate required fields
  if (!metadata?.title) {
    return {
      success: false,
      error: 'metadata.title is required',
      message: 'Please provide a title for your story.',
    };
  }

  if (!beats || !Array.isArray(beats) || beats.length === 0) {
    return {
      success: false,
      error: 'beats array is required and must not be empty',
      message: 'Please provide at least one beat for your story.',
    };
  }

  // Validate beat structure
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (!beat.id) {
      return {
        success: false,
        error: `Beat at index ${i} is missing required field: id`,
        message: 'Every beat needs a unique ID (e.g., "beat_0", "beat_1").',
      };
    }
    if (!beat.type) {
      return {
        success: false,
        error: `Beat "${beat.id}" is missing required field: type`,
        message: 'Every beat needs a type (e.g., "titleScreen", "infoText").',
      };
    }
  }

  try {
    console.error(`[ASAPS MCP Desktop] Sending POST to /api/stories/inject...`);
    if (suggestedTheme) {
      console.error(`[ASAPS MCP Desktop] Including suggestedTheme: ${suggestedTheme.themeId}`);
    }
    const result = await fetchAPI('/api/stories/inject', {
      method: 'POST',
      body: JSON.stringify({
        metadata,
        beats,
        connections: connections || [],
        characters: characters || [],
        suggestedTheme: suggestedTheme || undefined,
        translations: translations || undefined,
      }),
    });

    console.error(`[ASAPS MCP Desktop] Injection API response:`, JSON.stringify(result));

    return {
      success: true,
      data: result,
      message:
        `Story "${metadata.title}" successfully injected into ASAPS Builder! ` +
        `Created ${beats.length} beats and ${connections?.length || 0} connections` +
        (translations?.length ? ` with ${translations.length} translation(s)` : '') +
        '. Check the Builder window to see your story.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message:
        'Failed to inject story. Make sure ASAPS Builder is running ' +
        'and the API server is enabled.',
    };
  }
}

// ============================================================================
// Main Server
// ============================================================================

async function main() {
  console.error('[ASAPS MCP Desktop] Starting server...');
  console.error(`[ASAPS MCP Desktop] API URL: ${ASAPS_API_URL}`);

  const server = new Server(
    {
      name: 'asaps-desktop',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error('[ASAPS MCP Desktop] Listing tools');
    return { tools };
  });

  // Execute tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    console.error(`[ASAPS MCP Desktop] Executing: ${name}`);
    if (args && Object.keys(args).length > 0) {
      console.error(`[ASAPS MCP Desktop] Args: ${JSON.stringify(args, null, 2)}`);
    }

    try {
      let result: any;

      switch (name) {
        case 'asaps_check_connection':
          result = await handleCheckConnection();
          break;

        case 'asaps_get_beat_schema':
          result = await handleGetBeatSchema();
          break;

        case 'asaps_get_example_story':
          result = await handleGetExampleStory();
          break;

        case 'asaps_get_themes':
          result = await handleGetThemes();
          break;

        case 'asaps_get_affect_guide':
          result = await handleGetAffectGuide(args);
          break;

        case 'asaps_inject_story':
          result = await handleInjectStory(args);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      console.error(`[ASAPS MCP Desktop] Result: ${result.success ? 'success' : 'failed'}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[ASAPS MCP Desktop] Error:`, error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[ASAPS MCP Desktop] Server running');
}

main().catch((error) => {
  console.error('[ASAPS MCP Desktop] Fatal error:', error);
  process.exit(1);
});
