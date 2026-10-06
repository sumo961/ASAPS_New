# Character Roles (recastable cast) — Design

**Status: APPROVED in part (Hartmut, 2026-10-06): D1, D3, D7, D9 decided; phase 0 in progress. D2, D4, D5, D6, D8 open until phase 1.**
**Date: 2026-10-05 · Author: session work after the Field App location fixes**

## The question

Can a story refer to *a role* instead of a specific character, so that who
fills the role is decided at runtime? Two motivating cases:

1. **The NPC depends on earlier decisions.** The AI conversation partner in
   scene 7 is whoever the interactor sided with in scene 2: Mara or Jonas,
   each with their own name, portrait, voice, history and feelings.
2. **The interactor picks who to play.** "Choose your character" at the
   start, and the whole story follows that person.

Both can be built today with duplicated branches. That copies every beat
that differs only in *who* is present, and the copies drift apart. Roles
would let the story stay one story while the person changes.

## Roles vs. variants

| | Variant | Role |
|---|---|---|
| What changes | the disposition of **one person** | **which person** |
| Identity (id, name, history) | the same | different |
| Stats, feelings, counters | shared by all variants | belong to each character |
| Example | Alex introvert vs. extrovert | "the confidant" = Mara or Jonas |

Using variants to fake different people (the `CharacterVariant` doc comment
even suggests "Player-man vs Player-woman") breaks as soon as state
matters: trust built with "Mara" would carry over to "Jonas", because both
are one character record. Roles and variants combine: a role's holder still
has their own active variant.

## Naming

**Role** (decided, D1): it is the established word in theatre, games and
interactive narrative ("cast a role", "choose your role"), and "part" would
collide with story structure ("Part 2"). The existing `Character.role`
(`'player' | 'npc' | 'companion'`, `builder/src/types/character.ts:16`)
means *kind of character*; its Character Editor label and card tag become
**Kind**. Only the label changes: the stored field keeps its name, so no
project needs migrating. Cast roles live at story level (`roles[]`), so
the two never share an object.

## What exists today (verified in code, 2026-10-05)

- **One resolution path, mostly.** `resolveCharacter` / `resolveCharacterKey`
  (`core/src/utils/characterRef.ts`) match id → name → displayName.
  `StoryContext.resolveCharRef` (:786) feeds every character-state store
  (counters, inventory, affect, variants, HUD reveal). `Beat.linkedSpeakerName`
  (`Beat.ts:652`) resolves speakers variant-aware via `getMergedCharacter`.
- **Lookups that bypass it**, all keyed by the *speaker string*:
  - speaker portraits in the builder preview (`builder/src/utils/speakerUtils.ts:63`,
    wired at `PreviewWindow.tsx:1050`) and in the player
    (`player/src/PlayerEngine.ts:772`), through
    `ReactRenderer.setCharacterPortraitResolver`. Both ignore variants today.
  - TTS voices: `globalSettings.tts.speakerVoices[provider][speakerString]`
    (`TTSService.ts:88`, `WebTTSProvider.ts:118`). Voice is not a character field.
- **AI conversation NPC** (`AIConversationBeat`): `npcName` holds a character
  id or free text; the runtime builds the character's dossier from it
  (`buildDossierForRef`, :476) *and* sends `npcPersonality` alongside it
  (:497, :737, :773, :825). The Inspector **copies** the linked character's
  description into `npcPersonality` when the character is picked
  (`SchemaFormGenerator.tsx:754`) and writes edits back to the character
  on blur (:421).
- **Placeholders** (`Beat.processText`, :595): `${name}` resolves a variable,
  then a counter; the only built-in is `playthrough`. No dotted syntax.
- **The implicit `'player'` key**: global inventory (`StoryContext.ts:670–758`),
  conditions (`ConditionBeat.ts:121,187`), add/remove inventory,
  `UpdateAffectBeat` (:63), `trackedQuantity.ts:102`; AI info/summary beats
  filter it out of character lists.
- **No pronoun or gender field** on Character.
- **Analyzers**: `StateSimulationAnalyzer.initialStatesForRun` (:246) explores
  the product of *random* variants (capped at 16 combos);
  `ReachabilityAnalyzer` has no variant handling.
- **"Player picks a variant"** exists only as a `setCharacterVariant` effect on
  a choice (`ChoiceEffectsEditor.tsx`); there is no persona-picker beat.
- **Storage**: characters live in the serialized story inside `project.json`
  (`projectZipManager.ts:125`), normalized by `normalizeCharacter`.

## Proposal

### Data model

Story-level, next to `characters`:

```ts
interface CastRole {
  id: string;                 // 'confidant' — referenced as '@confidant'
  name: string;               // 'The confidant' (author-facing, translatable)
  description?: string;       // what the role does in the story (author + AI)
  candidates: string[];       // character ids that may fill it (≥ 1)
  defaultCharacterId?: string;// holder when nothing has cast it yet
  selection: 'cast' | 'random' | 'fixed';
  //   cast   — the story casts it with a castRole effect (choices, beats)
  //   random — drawn from candidates at story start (like variant policy)
  //   fixed  — always the default (lets an author stage a role before
  //            writing the alternatives)
  recastable?: boolean;       // default false — see "State" below
  keepOnRestart?: boolean;    // mirrors keepVariantOnRestart
}
```

Runtime state: `StoryContext.state.roleHolders: Record<partId, characterId>`.

New effect: `{ type: 'castRole', role: 'confidant', character: 'char_mara' }`,
usable everywhere effects are (choices, links, beats, random branches).

### References

A field that takes a character also takes `@partId`: `speaker`, `npcName`,
`characterRef`, counter `owner`, condition `character`, affect `character`,
inventory `character`. Resolution happens in **one** new step in front of
the existing path:

```
'@confidant' → state.roleHolders.confidant
             ?? role.defaultCharacterId
             ?? role.candidates[0]          (+ review finding: used before cast)
           → resolveCharacter / resolveCharRef as today
```

`StoryContext.resolveCharRef` gains this step, so every state store follows
automatically. The context-free `resolveCharacter` stays as it is; its
callers that have a context (≈7 files) call `context.resolveRoleRef` first.

**The speaker-string lookups must move into core.** Portraits and TTS voices
are found by the speaker string *after* core hands it to the renderer, so
`@confidant` would find nothing. Core should hand the renderer the resolved
holder (id + display name + merged portrait), and the two portrait resolvers
and the TTS lookup should key by the character id, with the speaker string
as a fallback for free-text speakers. Side benefit: speaker portraits start
honouring variants, which they don't today.

### Text

Two new placeholder forms in `processText`:

- `${@confidant.name}` (display name of the current holder; `.name` is the
  default, so `${@confidant}` works too)
- pronouns: `${@confidant.they}`, `.them`, `.their`, `.theirs`, `.themself`

Pronouns need a new optional field on Character, `pronouns`, with presets
(she/her, he/him, they/them) plus custom. English verb agreement ("she is"
/ "they are") is not solved by this; authors rephrase, or we add `.is`/`.has`
helpers (D5).

The honest limit: prose written with one person in mind often doesn't fit
another. Roles suit stories where the role-dependent lines are short (names,
a pronoun) or AI-written (conversations, AI text beats). For a few lines
that truly differ, authors keep using conditions on `@confidant` (below).
Translations are harder still: gendered adjectives and case endings in
other languages don't follow from a pronoun set. A translated story with
roles will need per-language attention; the translation extractors
(StoryTranslator.ts and its copy in HtmlExporter.ts) must leave the
placeholders intact.

### Conditions

New condition `{ type: 'roleHolder', role: 'confidant', character: 'char_mara' }`
("the confidant is Mara"), for the places where a story needs a different
line, image, or branch per holder.

### State belongs to characters

Counters, feelings, inventory, variants and goals stay on the **character**.
An effect written against `@confidant` lands on whoever holds the role *at
that moment*. If Mara holds it, trust goes to Mara; if the role later moves
to Jonas, Jonas starts from his own values and Mara keeps hers.

Recasting is therefore deliberate: a `castRole` on an already-cast role
replaces the holder only when the role is `recastable`; otherwise the review
flags it as an error at authoring time (D3). The runtime does not silently
ignore it: per "respect authorial intent", the author is told while
authoring, and the runtime applies what was authored.

### AI conversation NPC fields

Changed meaning, with a migration:

- **Who the NPC is** comes only from `npcName`: a character id, `@role`, or a
  free-text name (unchanged behaviour for free text).
- **`npcPersonality` becomes "In this scene"** (label and schema description;
  the wire name stays for compatibility): how the NPC behaves *here*, e.g.
  "in a hurry, suspicious of you". The prompts say "How {name} behaves in
  this scene:" instead of presenting it as identity.
- **No more copying.** The Inspector stops auto-filling it from the
  character's description and stops writing edits back to the character.
  Identity edits belong in the Character Editor or the "Develop character"
  helper.
- **Migration on load** (beats with a linked character only):
  - text equal to the linked character's description (trimmed) → dropped;
    it duplicates the dossier;
  - edited text → kept as scene notes;
  - free-text NPCs → untouched.

  This fixes a duplication that exists today regardless of roles.
- With `@role` in `npcName`, the "Develop character" helper asks which
  candidate to work on.
- Review finding: a role used as an AI NPC whose candidate has no
  description and the beat has no scene notes — the conversation would
  run on a bare name.

### Player role (phase 2)

When a story defines a role with id `player`, the implicit `'player'` key
becomes an alias for it: inventory, conditions, affect and HUDs follow the
chosen protagonist. Candidates are characters with `role: 'player'`.

- Inventory: the protagonist's bag follows the **role** (today's global
  `'player'` inventory), not the character, so picking up the key doesn't
  depend on who you play (D6).
- HUD reveal: the holder counts as present from the start.
- A **"Choose your character"** beat (D7): candidates' portraits, display
  names and descriptions, one tap casts the role. Schema-driven, so the
  phone layout and translations come for free.

This touches every place that hard-codes `'player'` (≈10 runtime sites and
the analyzers), which is why it comes second.

### Authoring UI

- **Character Manager → Roles** tab: name, description, candidates
  (multi-select of characters), selection, default, recastable.
- **Pickers** (speaker, NPC, owner, condition character) list roles above
  characters, shown as "@ The confidant".
- **Preview as**: a casting selector in the Inspector header, the VE and the
  Preview Window's debug panel ("The confidant: Mara ▾"), so authors see each
  version. The Inspector shows "currently: Mara" next to a role reference.
- Flowchart: beats that cast a role get a small badge.

### Analysis

- `StateSimulationAnalyzer` explores castings the way it explores random
  variants: each `random` role's candidates at story start, and each
  `castRole` effect as a state change. The product of roles × variants
  needs a higher cap or sampling; the current 16-combo cap would be hit
  quickly (D8).
- `ReachabilityAnalyzer` treats `roleHolder` conditions as satisfiable by
  any candidate (it has no variant handling either).
- New review findings: role used before it can be cast (no default);
  `castRole` naming a non-candidate; recast of a non-recastable role;
  role placeholder in text of a beat whose language has no pronoun forms;
  AI NPC role with no description (above).
- The link-walk parity tripwire needs no change (roles don't add targets).

### AI generation (same change, per CLAUDE.md)

- `core-beats.json`: descriptions for `@role` references, `castRole`,
  `roleHolder`, the "In this scene" meaning of `npcPersonality`, and
  `roles[]` in the story shape.
- Prose guidance: `storyGenerationEnhanced.ts` (Character & Speaker
  System section ~934–990, npc fields ~745–772), `dialogGeneration.ts`,
  Co-Designer `systemPrompt.ts` (+ tools `defineRole`, `setRoleCandidates`,
  and `castRole` as an effect in the existing wiring vocabulary),
  `ideator/systemPrompt.ts`; the MCP desktop server's prompt copy.
- `applyGeneratedStory` imports `roles[]`; the generation review validates
  them.
- Generator rule: identity goes into the cast, scene behaviour into
  `npcPersonality`. Today generated stories put identity into
  `npcPersonality`, which is exactly what the migration then has to sort out.

### Storage and exports

`roles` serialize with the story in `project.json`; `normalizeStory` gets a
`normalizeRoles`; old projects have none. Exports (HTML, Field App, player)
carry the story as is; the player's portrait and TTS paths get the
id-based lookup from above. ASML 1.0 import is unaffected.

## Phases

| Phase | Contents | Rough size |
|---|---|---|
| 0 | `npcPersonality` → "In this scene" + migration + no copy (useful alone) | small |
| 1 | NPC roles: data model, `castRole`, `@role` resolution, speaker/portrait/TTS move to core, placeholders + pronouns, `roleHolder`, Roles tab, pickers, Preview-as, analyzers, findings, generation guidance, UG | large (several sessions) |
| 2 | Player role + "Choose your character" beat | medium |

Phase 0 can ship on its own; it removes a duplication in every AI
conversation with a linked character.

## Decisions

Decided 2026-10-06:

- **D1 Name: Role.** The old `Character.role` is relabelled **Kind** in the
  UI (stored name unchanged).
- **D3 Recasting: opt-in per role.** Off by default; the author ticks
  "can be recast". Recasting a role that doesn't allow it is flagged while
  authoring.
- **D7 Choose-your-character: a dedicated beat** showing the candidates'
  portraits, names and descriptions.
- **D9 Phase 0 first:** `npcPersonality` becomes "In this scene" notes, no
  more copying, migration — shipped before roles.

Open until phase 1:

- **D2 Reference syntax.** `@confidant` in character fields and
  `${@confidant.name}` in text?
- **D4 Uncast role.** Default holder, else first candidate + review finding
  (proposed), or should the story stop with an error?
- **D5 Pronouns.** Pronoun sets only, or also `.is`/`.has`/`.was` agreement
  helpers for English?
- **D6 Protagonist's inventory.** Follows the role (proposed) or the
  character?
- **D8 Analyzer budget.** Raise the combination cap or sample castings?

## Risks

- **Prose that only fits one person.** The main authoring cost; the UI
  (Preview-as) makes it visible but can't fix it.
- **Translations** of role-dependent text in gendered languages.
- **Combinatorial analysis** once several roles and variants combine.
- **String-keyed lookups elsewhere.** Anything still matching characters by
  speaker string (beyond the three found) will silently show the role id.
  A tripwire test should render one beat per type with a `@role` speaker
  and assert no `@` reaches the screen.
