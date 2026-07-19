# ASAPS Modern - Progress Log

## 2026-07-20: Background fit for all beats, one-name project rename, VE/Preview parity + docs screenshots (v0.9.80)

### Overview

Field-testing release: everything in it came from live authoring sessions on real projects. Two long-standing inconsistencies fell — renaming a project from the main window now actually renames it everywhere (one-name model), and the Visual Editor now renders slot-mode backgrounds identically to the Preview Window, closing a three-layer divergence that ended at a subtle React style-diffing hazard. On top: a **Background fit** control (cover / letterbox) for every beat type, a legibility pass on the stance pad, and the User Guide screenshot session for the v0.9.78/79 features.

### Background fit control (cover / letterbox) for all beats

- The **Background fit** select (next to "Change Background") was gated to the four spatial beats; endScreen and every other slot-mode beat had no sizing control and always cropped (cover). It now appears for **every beat type except panorama** — *Contain — show whole image (letterbox)* vs *Cover — fill stage, crop edges* — with the default label reflecting each render path's true default (spatial: contain, slot: cover).
- `spatialFit` became a base `Beat` field: parsed generically, pushed into renderer state on every execute (which also clears stale values so one beat's fit can't leak into the next — a latent bug), and persisted via base `toJSON` — no per-class plumbing for the ~15 slot-mode types. SlotFlowView gained the `backgroundFit` prop (contain letterboxes with theme-colored bars); ReactRenderer's slot branch and the VE preview pass the per-beat value. Preview, VE, and HTML exports (player bundle rebuilt) all honor it.

**Files modified:**
- `packages/core/src/beats/Beat.ts`, `packages/renderer/src/components/SlotFlowView.tsx`, `packages/renderer/src/renderers/ReactRenderer.tsx`, `packages/builder/src/components/visual/VisualWorkspace.tsx`, `packages/builder/src/components/visual/VisualPropertiesPanel.tsx`

### VE ↔ Preview parity: the background divergence, root-caused

Reported as "the endScreen has a background image but it doesn't show in the VE" — three stacked causes:

1. **Unresolved asset URL**: the VE's responsive slot preview passed the raw ASML-only `backgroundUrl` state to SlotFlowView/ChatDialogView without the `backgroundAssetId → asset URL` resolution the fixed and spatial paths already perform — asset-backed backgrounds were invisible in the responsive VE for every slot-mode beat type. Both call sites now resolve the asset first.
2. **Stale compiled renderer**: the builder was running a week-old renderer dist (the monorepo's compiled-dist import). Rebuilt; a reminder that renderer changes need `npm run build`.
3. **React shorthand/longhand wipe** (the deep one): SlotFlowView's root mixed the `background` shorthand (gradient themes) with `background-size/repeat/position` longhands. The VE mounts the component before the background URL resolves and re-renders when it arrives; React removes the then-undefined shorthand, the browser clears EVERY background longhand, and React's diff doesn't re-set the ones whose values "didn't change" — size/repeat/position vanished while background-image survived, leaving the image at natural size with the sky row repeating (the phantom "band" under the stage). The Preview mounts with the URL present and never transitioned. Fix: longhands only — gradients go through `backgroundImage`, plain colors through `backgroundColor`; the renderer was swept for the same hazard elsewhere (clean). House rule now documented in the code: never mix a conditional CSS shorthand with its longhands in a React style object.

**Files modified:**
- `packages/builder/src/components/visual/VisualWorkspace.tsx`, `packages/renderer/src/components/SlotFlowView.tsx`, `packages/builder/public/player-web.js` (rebuilt)

### One-name project rename

- Renaming in the main window's title box silently didn't rename the project: the header edits the STORY title, but the project NAME is what the library cards, Currently-Editing banner, and window title show — and it never followed. Worse, the Browser card's rename-in-place had the mirror bug: renaming the OPEN project there was clobbered by the next auto-save writing the old in-memory name back.
- Now a **one-name model**: both edit points write both fields. `updateProjectStory` makes the project name follow the story title on save; `handleRenameProject` writes the story title (metadata + plain) and updates the in-memory title when renaming the open project. Verified live with a full round-trip into the library card and banner.

**Files modified:**
- `packages/builder/src/contexts/PersistenceContext.tsx`, `packages/builder/src/App.tsx`

### Stance pad legibility + User Guide screenshots

- **StancePad enlarged** after a legibility report: default 180→220px (Character Editor pads 240px, AI-helper preview pads 130→180px), axis words ~2× with medium weight, octant labels +35% at higher opacity, bigger dots and readouts.
- **User Guide screenshot session** (flagged by the user-guide-qa pass): new captures for the template gallery (48), a variant card's stance pad with the hostile disposition (49), and the AI character helper's brief + preview stages (50, 51); the Project Browser shot (45) re-captured to include the template shelf. Captions wired in; stale "predates this feature" annotations updated. Screenshots 49/51 re-taken after the pad enlargement.

**Files modified:**
- `packages/builder/src/components/characters/StancePad.tsx`, `CharacterEditor.tsx`, `CharacterDevelopmentDialog.tsx`, `docs/USER_GUIDE.md`, `docs/images/45,48-51`

### Verification

All three suites green after every change (2532 core / 2323 builder / 483 renderer); every fix verified live in the running app against the reporting project — rename round-trip through the library, endScreen background cover/contain/default in the VE matching the Preview, stance pad readability confirmed via re-captured screenshots.

---

## 2026-07-19: Project templates (.asapst) + stance visualization + file-open and AI-conversation fixes (v0.9.79)

### Overview

Completes the Södertörn character-work arc that v0.9.78 began: the rehearsal scenario the focus group asked for now ships as the first entry of a **project template system** — worked example projects instantiated as copies, with a distributable `.asapst` file format modeled on Word's `.dotx` so a lecturer can hand a scenario to thirty students and every double-click creates that student's own project. The interpersonal stance model from v0.9.78 becomes **visible and manipulable** (an interactive Leary's Rose in the character editor and the AI helper). Plus three fixes from field testing: Windows/cold-start double-click-to-open, misleading "visited" beats in the preview debug panel, and case-sensitive AI-conversation keywords.

### Template system + .asapst format

- **`.asapst` templates**: same zip as `.asaps`, but project.json carries `projectType: 'template'`. The flag — not the extension — is the source of truth (a renamed file keeps its behavior); importing a template ALWAYS instantiates a fresh copy (forced new project id, overwrite impossible, flag stripped) so a distributed master can never be edited in place. Electron gains the `.asapst` file association; all import accept-lists and the drag-drop guard take the new extension.
- **Template gallery**: "Start from a template" as the 4th card in the Start-a-new-project picker → gallery modal with description, "What this shows" blurb, feature tags, and an AI badge for templates that need a provider. The Project Browser gains an **adaptive template shelf** under the create row: full cards while the library is small (the first-run audience that needs the showcase), a slim "TEMPLATES … browse →" line once it's established.
- **"Export as Template (.asapst)"** in the Export menu — build a scenario, export, distribute; every import creates the recipient's own copy.
- **First bundled template — "Rehearsal: The Difficult Client"**: a social-work training scenario (caseworker briefing → AI conversation with client Karin Lindqvist → debrief with reflection prompts). Karin has four stance-grounded disposition variants (cooperative / hostile / avoidant / ambivalent) on the random selection policy — every restart meets a different Karin. CI tests keep the registry, the source JSON, the zipped `.asapst`, and the circumplex-derived trait values consistent.

**Files modified:**
- `packages/builder/src/utils/projectZipManager.ts`, `packages/builder/src/components/TemplateGallery.tsx` (new), `packages/builder/src/components/NewProjectPicker.tsx`, `packages/builder/src/components/ProjectLibrary.tsx`, `packages/builder/src/components/Header.tsx`, `packages/builder/src/App.tsx`, `packages/builder/src/components/MergeStoryDialog.tsx`, `packages/builder/public/templates/*` (new), `apps/builder-desktop/package.json`, `packages/builder/src/utils/__tests__/bundledTemplates.test.ts` (new)

### Interpersonal stance visualization (StancePad)

- New **StancePad** — an interactive Leary's Rose (warmth × dominance, octant labels hostile / leading / withdrawn / cooperative), the visual sibling of the MoodPad. Three surfaces:
  - **Variant cards** (Character Editor, Affect tab): dragging writes the variant's stance AND re-derives its extraversion + agreeableness via the circumplex rotation — the trait sliders follow the dot, making the coupling visible. Variants without an authored stance show a dashed trait-derived dot; a hollow "traits" ghost marker appears when hand-tuned sliders drift from the authored stance.
  - **Base personality section**: a pure two-way lens — the dot mirrors the E/A sliders, dragging sets both at once via the full-scale inverse rotation (new `stanceToBigFive`).
  - **AI helper preview cards**: per-variant pads plus a base-card lens whose drag re-derives every stance-bearing variant from the new base, keeping the disposition family consistent before accepting.
- `describeStance()` supplies qualitative readouts ("cold-dominant (hostile)"). Theory documentation extended (`docs/Interpersonal-Stance-Model.md`).

**Files modified:**
- `packages/builder/src/components/characters/StancePad.tsx` (new), `packages/builder/src/components/characters/CharacterEditor.tsx`, `packages/builder/src/components/characters/CharacterDevelopmentDialog.tsx`, `packages/builder/src/services/prompts/interpersonalStance.ts`, `docs/Interpersonal-Stance-Model.md`

### Fixes

- **Windows / cold-start file open**: double-clicking a `.asaps`/`.asapst` file now works on every platform and timing. The Electron main process parses `second-instance` argv (Windows/Linux, app running) and `process.argv` (cold start), and no longer drops macOS `open-file` events that arrive before the window exists; a pending file is stashed and collected by the renderer via a signal-based `project:get-pending-open` IPC handshake after its listener registers — no load-timing race. The renderer also splits paths on both separators so Windows filenames keep the `.asapst` template detection.
- **Preview debug panel — seeded beats**: starting preview from a mid-story beat injects the simulated path's visited beats (so visited-beat conditions behave correctly) — but the debug panel presented them as actually visited. Injected beats are now badged **seeded** with an explanatory header ("3 seeded by start state") and tooltips; the start beat itself is not badged.
- **AI Conversation keyword matching**: "Topic Mentioned" direction triggers are judged by the LLM, and the evaluation prompt gave no matching guidance — capitalized keywords ("Goddess") read as proper nouns and lowercase mentions were missed. The prompt now carries explicit MATCHING RULES: case-insensitive, singular/plural/inflected forms count, clear paraphrases count, NOT-conditions invert after matching.

**Files modified:**
- `apps/builder-desktop/src/main/index.ts`, `apps/builder-desktop/src/preload/index.ts`, `packages/builder/src/App.tsx`, `packages/builder/src/pages/PreviewWindow.tsx`, `packages/core/src/utils/ConversationPromptBuilder.ts`

### Documentation

- **User Guide** audited and updated (+91/−16) for everything above plus v0.9.78's character helper — every claim verified against the actual components (button labels, card counts, visibility conditions). New Templates and AI Character Development sections, stance-pad and variant-policy coverage, seeded-badge explanation, FAQ entry on sharing projects with students, glossary entries.

### Verification

54 new tests (template semantics incl. flag-forces-copy and renamed-extension fallback, bundled-template consistency incl. circumplex-derivation check, StancePad interaction, stance round-trips, prompt matching rules); 2323 builder + 2532 core tests green; TypeScript clean. Template flow verified live end-to-end (picker → gallery → instantiate → 5 beats + Karin's 4 variants intact); both editor stance pads verified against the rotation math exactly. Windows file-open verified by review only — needs one real double-click test on a Windows build.

---

## 2026-07-18: AI character helper — disposition variants, adaptive interview, interpersonal stance model (v0.9.78)

### Overview

Third slice of the Södertörn-review response, building the two character ideas from the stakeholder discussion into one feature: the focus group asked for emotional unpredictability in rehearsal scenarios ("I never know how the client will show up today"), and the answer is **one character with N disposition variants** — not an ensemble cast — drawn at random each playthrough, plus an **AI character-development helper** that makes setting this up a two-minute task instead of a trait-sliders session. Disposition variants are theoretically grounded on the interpersonal circumplex (Leary/Wiggins), keeping AI-generated and manually-authored characters in ONE Big Five trait model — rationale and references in `docs/Interpersonal-Stance-Model.md`.

### Variant selection policy (replay variety)

- New per-character `variantSelectionPolicy: 'fixed' | 'random'`. With `random`, story start draws uniformly from the character's variants; `reset()` wipes the draw, so every restart/replay meets a different disposition. An authored `setCharacterVariant` effect still overrides — instructors keep controlled sessions ("today we practice hostile") while self-directed practice stays unpredictable.
- Applied at the single story-start hook (`seedCharacterAffectFromStory`); the draw does not mark the variant as explicitly set.
- CharacterEditor variants section gains an "At story start" dropdown (shown at 2+ variants): *Use default variant* / *Pick randomly each playthrough*.

**Files modified:**
- `packages/core/src/engine/StoryContext.ts`, `packages/core/src/types/index.ts`, `packages/builder/src/types/character.ts`, `packages/builder/src/components/characters/CharacterEditor.tsx`, `packages/core/tests/engine/CharacterVariants.test.ts`

### AI character development helper

- **CharacterDevelopmentDialog** — progressive disclosure over the existing Character/variant model: a seeded free-text brief ("Who is this person?") with disposition chips (Cooperative, Hostile, Avoidant, Ambivalent, + custom) → an **optional adaptive-questions stage** where the AI asks 2-3 behavior-focused follow-ups with tappable answers (always skippable) → **preview cards** refined by free-text direction ("more passive-aggressive"), never by sliders. Accept writes a real Character; nitty-gritty stays editable in CharacterEditor.
- **Two entry points, one dialog**: "✨ Develop character with AI…" in the AI-conversation beat's NPC field (seeded from scenario + personality, generates immediately, links the accepted character back to the beat and fills `npcPersonality`) and "Generate with AI" in the Character Manager's template picker (blank brief, questions on by default).
- Accept follows the editor's variant convention: with variants, personality lives per-variant and the base owns identity; 2+ variants default to the random policy (checkbox), a single variant becomes the default variant.
- New prompt module `characterGeneration.ts` with pure, unit-tested normalizers (traits clamped to [0,1], mood to [-1,1], variant ids slugified + deduped); variant descriptions are prompted self-contained because a variant overlay *replaces* the base description at runtime.

**Files modified:**
- `packages/builder/src/components/characters/CharacterDevelopmentDialog.tsx` (new), `packages/builder/src/services/prompts/characterGeneration.ts` (new), `packages/builder/src/services/AIService.ts`, `packages/builder/src/App.tsx`, `packages/builder/src/components/Inspector.tsx`, `packages/builder/src/components/SchemaFormGenerator.tsx`, `packages/builder/src/components/characters/CharacterManager.tsx`

### Interpersonal stance model (one character model, not two)

- Disposition variants are modeled as **interpersonal stances** on the Leary/Wiggins circumplex (warmth × dominance axes). Since the circumplex axes are ~30° rotations of Big Five extraversion/agreeableness (McCrae & Costa 1989), stances and trait presets provably live in one space — no model fork between AI-generated and manually-authored characters.
- Each suggested disposition chip carries authored circumplex coordinates plus Brown-Levinson politeness *manifestation* hints for the prompt (hostile → bald-on-record face threats; avoidant → off-record withdrawal moves). Speech-act guidance shapes the generated prose; it is not a stored model dimension.
- A variant's agreeableness + extraversion are **derived** from the base character's traits plus the stance rotation (weight 0.35, tunable) — a shy person turned hostile stays shy; the AI authors only openness/conscientiousness/neuroticism and the descriptions. Custom dispositions get AI-placed coordinates in the same space. The stance persists on `CharacterVariant.stance` for future stance-aware features (e.g. Leary complementarity feedback).
- Theory, precedent (TARDIS job-interview trainer), and full references: `docs/Interpersonal-Stance-Model.md`.

**Files modified:**
- `packages/builder/src/services/prompts/interpersonalStance.ts` (new), `docs/Interpersonal-Stance-Model.md` (new), `packages/builder/src/services/prompts/characterGeneration.ts`, `packages/core/src/types/index.ts`

### Verification

40 new tests (7 core variant-policy, 33 prompt/normalizer/stance/dialog); 2300 builder + 2531 core tests green; TypeScript clean. Verified live via chrome-devtools including two real end-to-end generations: the adaptive questions were sharp and behavior-focused, generated variants restated identity correctly per the overlay semantics, the accepted character carried `variantSelectionPolicy: 'random'` + 4 slugified variants, and every derived trait value matched the circumplex rotation exactly (base E 0.15 → hostile 0.10, cooperative 0.27, avoidant 0.00 clamped — the shy character stayed shy in every disposition).

---

## 2026-07-16: Workspace flexibility + project setup — vertical resize, large dialog editor, language & culture up front (v0.9.77)

### Overview

Second slice of the Södertörn-review response, tackling the three medium-effort findings deferred from v0.9.76: workspace areas that couldn't be resized vertically (finding 9), complex dialog editing cramped in the inspector column (finding 10), and the project language buried in settings (finding 14) — plus a new optional **Cultural setting** step in the New Project dialog that doubles as the Knowledge-Graph opt-in, resolving the "the KG toggle lives inside the project you haven't created yet" catch-22.

### Vertical panel resize (finding 9)

- The Inspector's fixed AI-suggestions footer gets a row-resize drag divider: pull down to reclaim height for the properties column, up to expand suggestions; double-click resets to natural height. Position persists (localStorage) like the inspector width.
- The Sidebar's clusters/unclustered divider — which already existed but reset on every reload — now persists its position too. A drag handle that forgets is likely why reviewers read vertical resizing as absent.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx`, `packages/builder/src/components/Sidebar.tsx`

### Expanded dialog editor (finding 10)

- New "Open large editor" button on the dialog-tree section opens the same `DialogTreeEditor` in a large modal (max-w-6xl, 5/6 viewport height) — same component, same `onChange` path via a single shared render helper, so edits flow continuously and closing loses nothing.
- The component's dormant `expanded` prop (present since its extraction, never wired) now controls the tree scroll-box height (500px cap → modal height) and widens nesting indentation for clearer hierarchy.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx`, `packages/builder/src/editors/DialogTreeEditor.tsx`

### Story language up front + one language catalog (finding 14)

- New Project dialog gains a **Story Language** select (default English) writing the existing `translation.sourceLanguage` setting — the field always existed in Settings → Translation but was effectively invisible there.
- The language list is extracted to a shared `languageCatalog.ts` (COMMON_LANGUAGES / ALL_LANGUAGES / getLanguageDisplayName); the translation LanguageSelector, the new dialog field, and the settings select (previously its own hardcoded 20-language list) all consume it.
- Fixed en route: the Header's language selector hardcoded "Source (English)" and the translation manifest always assumed English — `TranslationContext` now carries `sourceLanguage` + `setSourceLanguage`, synced from `globalSettings` by the App (the provider mounts above the App and can't read settings itself).

**Files modified:**
- `packages/builder/src/utils/languageCatalog.ts` (new), `packages/builder/src/components/NewProjectDialog.tsx`, `packages/builder/src/components/translation/LanguageSelector.tsx`, `packages/builder/src/components/settings/GlobalSettingsInspector.tsx`, `packages/builder/src/contexts/TranslationContext.tsx`, `packages/builder/src/components/Header.tsx`, `packages/builder/src/App.tsx`

### Cultural setting at project creation (KG opt-in)

- Collapsed "Cultural setting (optional)" section in the New Project dialog: reference-profile dropdown (Sweden / Sri Lanka / Custom…) + culture/region/language fields. Filling anything writes `globalSettings.culture` **and** enables `features.showKnowledgeGraph` for the new project — declaring a culture only has meaning through the KG pipeline, so it IS the opt-in. Left empty, neither is written.
- Collapsed-with-value shows a summary chip (e.g. "Sweden") so the choice stays visible; the expanded panel states explicitly that setting a culture enables the Knowledge Graph view.
- Fields extracted to a shared `CultureSettingFields` component consumed by both the dialog and Settings → Translation (which keeps its KG-flag gating). Wording: "Region or community" replaces "Region or ethnicity".

**Files modified:**
- `packages/builder/src/components/settings/CultureSettingFields.tsx` (new), `packages/builder/src/components/NewProjectDialog.tsx`, `packages/builder/src/components/settings/GlobalSettingsInspector.tsx`

### Verification

All 2267 builder tests green; TypeScript clean. Every surface verified live via chrome-devtools: suggestions divider (drag 109→189px, persisted, double-click reset), dialog modal (opens 1152×788 with the full editor, closes cleanly), Story Language field (33 options, Swedish present), cultural section (collapsed by default, profile pick auto-fills, summary chip).

---

## 2026-07-15: Stakeholder-report response — scope clarity + three HIGH bugs resolved (v0.9.76)

### Overview

Direct response to the Södertörn University expert review (17 findings) and social-worker focus group. The review's best cross-cutting observation — *"the system does not always communicate the scope or outcome of an action"* — drives this release: five friction findings fixed (AI Suggestions scope, emotion-add feedback, character delete wording, AI-vs-manual translation paths, language search placement), plus a bounded reproduction pass on the review's three HIGH bugs: one confirmed and guarded (AI generation silently replacing the workspace), one root-caused and fixed (dead Add button on AI-generated Movement Choice beats — duplicate choice ids), one verified as already-solved with an adjacent leak fixed (ghost beats in Unclustered Beats). Several other findings were already addressed before the report arrived: multi-select shipped in v0.9.73, and the "Ideator can't see my project" request is the Co-Designer (v0.9.75).

### Communicate scope and outcome (findings 4, 5, 6, 8, 13)

- **AI Suggestions renamed to "Suggest Next Beat"** with an explicit hint ("Proposes new beats to follow ‹beat› — the selected beat itself is not changed") and button "Suggest Next Beats". Authors expected suggestions to rewrite the selected beat; the feature always created a *next* beat — now the UI says so.
- **Emotion palette**: clicking "Add emotion" now scrolls to the new row, focuses it, and selects the placeholder name — visible even in a long, scrolled list. The header now states the palette is **project-wide** (available to all characters), which was the report's real confusion about "where emotions attach".
- **Character delete confirmation names the character** ("Remove character \"Elena\"?…") and states the consequence for beats that reference it. (Card-body click-to-edit and delete confirmation already existed — the report evaluated a version predating them.)
- **Translation actions labeled**: the sparkle/pen icon pair in "Add Translation" now reads **AI** / **Manual** with a legend ("AI translates for you" / "Manual — you write the text").
- **Language search moved to the top** of the Add Translation menu, always visible, auto-focused on open; the full language list shows until you type.

**Files modified:**
- `packages/builder/src/components/ai/BeatSuggestions.tsx`, `packages/builder/src/components/Inspector.tsx`
- `packages/builder/src/components/characters/{EmotionPaletteEditor,CharacterManager}.tsx`
- `packages/builder/src/components/translation/LanguageSelector.tsx`

### HIGH bug 1 (confirmed + fixed): generated stories replaced the workspace without warning

`handleStoryGenerated` unconditionally cleared the workspace before loading a generated story. The old project survives in the Project Library — which is exactly why reporters observed "closing and reopening restores expected behaviour" — but mid-session the swap read as *"the AI deleted my manually added beats"*. Loading a generated story into a non-empty workspace now asks first, naming the beat count and where the current project remains.

**Files modified:**
- `packages/builder/src/App.tsx`

### HIGH bug 3 (root-caused + fixed): dead Add button on AI-generated Movement Choice beats

Not the suspected parameter-shape mismatch (AI and inspector both use `choices`). The real cause: AI normalization derived missing choice ids from choice *text*, so two choices with identical text got identical ids → duplicate React keys and id/index desync in the inspector, making Add/edit/remove appear to do nothing on precisely those beats. AI-normalized ids are now guaranteed unique per beat, and the inspector's row key is collision-proof.

**Files modified:**
- `packages/builder/src/services/AIService.ts`, `packages/builder/src/components/Inspector.tsx`

### HIGH bug 2 (version-stale, adjacent leak fixed): ghost beats in Unclustered Beats

The Unclustered Beats sidebar derives live from the beats store (`useMemo` over `beats`), so deleted beats cannot linger there in current builds. The investigation did surface a real orphan: `deleteBeat` never pruned spatial-cluster `containerBeatPositions`, leaving stale entries for deleted beats until reload — now cleaned up in the same state update.

**Files modified:**
- `packages/builder/src/hooks/useStoryBuilder.ts`

### Verification

All 2267 builder tests green (143 files); TypeScript clean. UI changes verified live against the running dev app via chrome-devtools (suggestion panel labels, emotion add focus/scroll, translation menu structure, search filter + auto-focus).

---

## 2026-07-14: The Co-Designer — an AI collaborator for your existing story (v0.9.75)

### Overview

This release introduces the **Co-Designer**, the design-phase counterpart to the Ideator: where the Ideator helps you shape a brand-new idea, the Co-Designer works WITH you on the story you have open. Ask it anything from "where does this story branch meaningfully?" to "I want the protagonist more sinister — what are my options?", and when you say "implement that", it produces **reviewable change proposals** you accept per item — never applied automatically, always undoable, with an automatic safety backup. Its understanding is grounded in a live snapshot of your story: full beat text, a knowledge-graph-derived structural summary (state dependencies, choice inventory, endings, flow warnings), and an on-demand full-content tool for very large stories.

### Co-Designer: conversation grounded in YOUR story (AI menu → "Design with Co-Designer")

- Pop-out chat (teal, next to the purple Ideator) scoped to the open project; per-project session history with resume.
- Story snapshot captured on open; ↻ requests a fresh snapshot from live state at any time; menu-reopen and every apply refresh it automatically.
- The digest carries FULL beat text by default (240k-char budget ≈ 60k tokens); genuinely huge stories degrade to marked snippets and the model gains a `get_beat_content` tool to fetch any beat's complete parameters/notes/connections mid-conversation (tool-calling providers; rendered as teal chips in the transcript).
- **STORY STRUCTURE section** derived from the systemic knowledge graph: per-counter/variable owners, writers, and gates; choices per beat; narrative vectors (conditions + endings); FLOW WARNINGS for dead ends and unreachable beats. Computed, not summarized — the model treats it as ground truth and raises warnings proactively.

**Files:** `packages/builder/src/components/ai/codesigner/*` (store, hook, prompt, session store, composer, header, sessions panel), `packages/builder/src/pages/CoDesignerWindow.tsx`, `packages/builder/src/services/CoDesignerWindowManager.ts`, `packages/builder/src/utils/{storyDigest,structuralSummary}.ts`, Electron IPC in `apps/builder-desktop/src/{main,preload}/index.ts`

### Co-Designer: apply mode (structured change proposals)

- On explicit request ("ok, implement both"), the model emits a machine-readable proposal batch; the pop-out renders a review card — per-proposal checkboxes, rationale, value previews. "Apply N selected" sends only your selection to the main window.
- Proposal kinds: editText, updateParams, addBeat (with graph wiring, positioned beside its anchor), addNote (a "[Co-Designer]" note on the beat for changes too big to make mechanically).
- Safety: proposals are validated against LIVE state per item (missing beats error without blocking the batch); a batch from a stale snapshot of a DIFFERENT project is refused outright; the first apply per project per day creates a library backup copy ("X (before Co-Designer …)", skipped under VCS); every applied change is one undo step.

**Files:** `packages/builder/src/components/ai/codesigner/{types,proposalParsing,ProposalCard,beatContentTool}.ts(x)`, `packages/builder/src/utils/applyChangeProposals.ts`

### Fixes surfaced by the Co-Designer work

- **Cross-window reference poisoning** (pre-existing since v0.9.53): the Ideator manager captured the sender of ANY message reaching the main window, so an open Preview window (which pings constantly) could hijack its pop-out reference — after which "Ideate with Ideator" focused the Preview instead of opening. Capture is now gated to each manager's own message types (Co-Designer manager included).
- **Preview dead-click made visible**: `startPreview` silently ignored clicks when an init race left the engine/renderer unready — the "Click to preview…" overlay looked alive but did nothing. A blocked start now shows a banner naming what's still initializing.
- Same-document hash navigation on named pop-out windows (no reload on menu-reopen) handled explicitly via pushed snapshot refreshes.

**Files:** `packages/builder/src/services/{IdeatorWindowManager,CoDesignerWindowManager}.ts`, `packages/builder/src/pages/PreviewWindow.tsx`

---

## 2026-07-14: AI on existing stories — transformations + beat suggestions repaired (v0.9.74)

### Overview

First slice of the "AI works on your existing story" roadmap. **Transformation commands and beat suggestions now actually work on modern models** — live verification with a real Anthropic key exposed that the helper-command AI parse was broken on every current provider, and beat suggestions silently returned nothing on GPT-5.x. Both features are also now schema-driven: the beat-type vocabulary that the deterministic parser, the AI prompts, and the suggestions system share is derived from `beat-definitions/core-beats.json`, so new beat types are automatically known everywhere. Plus: exported stories opened in Apple's QuickLook preview (tapping the file in Messages/Mail/Files on iOS) now explain themselves instead of spinning forever, and 3 new undici Dependabot alerts were cleared.

### Schema-driven transformation vocabulary (helper commands)

New `services/beatSchemaVocabulary.ts` — beat-type ids, visible/invisible classification, per-type parameter names, alias resolution (schema ids + display names + curated shorthands like "timed" → durScreen), and a compact per-type prompt digest, all statically derived from the canonical schema JSON. Consumers rewired:

- `DeterministicCommandParser`: the hardcoded 13-type list and hand alias map are gone — all 32 schema types parse (`multiChoice`, `inputImage`, `keypad`, `updateAffect`, `webView`, `panorama`, …)
- `HelperCommandInput`'s AI context: visible/invisible lists schema-derived
- the helper-command AI prompt now carries the per-type parameter digest, so `setProperty` can target any schema parameter (the executor always could — the vocabulary just never said so)

**Files modified:**
- `packages/builder/src/services/beatSchemaVocabulary.ts` (new, + tests)
- `packages/builder/src/services/DeterministicCommandParser.ts` (+ tests), `packages/builder/src/components/ai/HelperCommandInput.tsx`, `packages/builder/src/services/AIService.ts`

### Helper-command AI parse: broken on every modern model (fixed)

`AIService.makeDirectAICall` hand-rolled raw-client request bodies that bypassed the provider layer: Claude received the deprecated `temperature` (Anthropic 400s), OpenAI received `max_tokens` + `temperature` (both rejected by gpt-5.x reasoning models) with no reasoning headroom — and neither branch worked behind the CORS proxy. This was the sixth deprecated-temperature Claude body; the v0.9.53 sweep removed five. Now routes through the provider's `generateConversationTurn` (correct per-provider bodies, token floors, proxy transport). Verified live with Claude Opus 4.8: "change the continue button text to 'Onward' on all info text beats" parsed at 95% confidence, previewed both infoText beats, applied cleanly.

**Files modified:**
- `packages/builder/src/services/AIService.ts` (+ regression test)

### Beat suggestions: five stacked causes fixed

1. **Reasoning-token starvation** — `OpenAIProvider.buildChatRequest` passed app-default budgets through verbatim; on gpt-5.x the hidden reasoning consumed the whole 3000-token suggestion budget and content came back empty. Defaults now get the `effectiveMaxTokens` floor (explicit user-configured maxTokens untouched) — this blanket-fixes every OpenAI-path feature with small defaults.
2. **Local providers never restored** — `useAI` auto-restore required an apiKey, so Ollama-style configs (baseUrl, no key) reported "AI Not Configured" for suggestions/helper commands even while the Preview Window worked.
3. The suggestions system prompt serialized the entire ~150KB schema JSON into every request; it now sends the ~10KB digest.
4. Suggested parameters now run through core's `normalizeBeat` (same pipeline as AI story generation) so pre-filled params land in canonical shape.
5. Metadata was fake (title "Current Story", genre = the string "visible") — real story title threaded through, bogus genre dropped.

Suggestion budgets 3000 → 8000 in both providers. Verified live on BOTH provider families: Ollama (3 suggestions, Add auto-connected the new beat) and Claude Opus 4.8 (3 suggestions incl. a `multiChoice` — a type the old prompt never knew).

**Files modified:**
- `packages/builder/src/services/providers/{OpenAIProvider,ClaudeProvider}.ts` (+ tests), `packages/builder/src/services/prompts/beatSuggestions.ts` (+ tests), `packages/builder/src/hooks/useAI.ts`, `packages/builder/src/components/Inspector.tsx`, `packages/builder/src/App.tsx`

### Export: iMessage/QuickLook "stuck at Loading story" explained

Tapping an exported .html attachment in Messages/Mail/Files on iOS opens Apple's QuickLook preview, which renders HTML with JavaScript disabled — the splash (with its CSS-animated spinner) is the file's only static content, so recipients saw a convincing but permanent loading screen, with no way to open a local file in real Safari. Both export templates now carry a `<noscript>` block inside the splash (renders exactly when scripting is off) telling recipients what they're looking at and to ask for a hosted link or open the file in a desktop browser.

**Files modified:**
- `packages/builder/src/export/HtmlExporter.ts`

### Maintenance

- 17 pinning tests added for the consolidated runtime AI adapter (request/response behavior for both provider families across all six service methods + the three transports' wire contracts).
- `undici` 6.26.0 → 6.27.0 (transitive dev dep via electron-builder) — clears the 3 Dependabot alerts that appeared 2026-06-23; the remaining 36 stay intentionally deferred (all dev tooling; every vite fix requires the deferred ≥6.4.2 major upgrade).

**Files modified:**
- `packages/core/tests/ai/runtimeAdapter.test.ts` (new), `package-lock.json`

---

## 2026-07-12: GPT-5.6 + pro reasoning, beat multi-selection, cluster fixes, one AI adapter (v0.9.73)

### Overview

A wide release. **AI provider support catches up with OpenAI's GPT-5.6 tier family (Sol/Terra/Luna) including the new pro reasoning mode**, and the long-planned adapter unification landed: all six drifted copies of the runtime AI orchestration now live once in `@asaps/core`. Authoring gets **beat multi-selection** (marquee/cmd-click, group drag into clusters, multi-duplicate with connections intact, multi-delete), a set of **cluster quality fixes** (autosize to members, no more overlap with outside beats, crash-free cluster deletion, beats can be taken back out), and several polish items: the preview mood tracker only appears when a story actually uses affect, the screen-docked counter HUD now renders in both layout modes, and freshly-converted static projects no longer trigger a false "corrupted project" repair alert.

### OpenAI GPT-5.6 family + pro reasoning (Responses API)

- Model tier support: `gpt-5.6-sol` (new default), `gpt-5.6-terra`, `gpt-5.6-luna`, bare `gpt-5.6` alias. Reasoning-model quirks (max_completion_tokens, temperature omission, effort tiers none–xhigh) extend to the whole family via the shared core quirk helpers.
- **Pro reasoning mode**: an opt-in "Reasoning mode" select (Standard/Pro) in the OpenAI AI settings. Pro routes through OpenAI's Responses API (`reasoning: {mode: 'pro'}`) — the only way to reach GPT-5.6's deepest tier. Triple-gated so OpenAI-compatible endpoints never break: explicit opt-in AND a gpt-5.6 model AND the official api.openai.com endpoint; anything else takes the untouched chat-completions path. Responses are normalized back to chat shape internally; both AI proxies route `_endpoint: 'responses'` bodies to `/responses` (the vite proxy also parses its streaming SSE deltas).

**Files modified:**
- `packages/core/src/ai/providerQuirks.ts` (+ tests) — 5.6 family coverage; `supportsProReasoning`, `buildResponsesRequestBody`, `extractResponsesOutputText`
- `packages/builder/src/services/providers/OpenAIProvider.ts` — `proReasoningActive()` gate, pro request branch, response normalization
- `packages/builder/src/api/vite-ai-proxy.ts`, `packages/builder/src/api/server.ts` — `/responses` routing
- `packages/builder/src/components/ai/AIConfigDialog.tsx`, `packages/builder/src/hooks/useAI.ts`, `packages/builder/src/types/ai.ts` — reasoningMode config plumbing + UI
- `packages/player-web/src/WebAIProvider.ts` — gpt-5.6-sol defaults

### One runtime AI adapter (phase 2 of the unification)

- `@asaps/core/ai/runtimeAdapter.ts`: `createRuntimeAIService()` — the single IAIService powering runtime AI beats, with pluggable transports (direct Anthropic fetch, direct OpenAI-compatible fetch, or the builder's CORS proxy). PreviewWindow, the deprecated StoryPreview, and the exported player's WebAIProvider are now thin wiring (net −1,655 lines); the exported player inherits fixes it never had (thinking-block stripping, reasoning-token headroom, analyzeImage parity).
- `@asaps/core/ai/jsonExtraction.ts`: the one blessed extractJSON/repair chain. Unification exposed two latent bugs in the historical copies, both fixed with pinning tests: the interior-quote repair corrupted JSON keys whenever it ran (missing `:` in its structural set), and truncation closing used counters instead of a LIFO stack so mixed nesting closed in the wrong order.

**Files modified:**
- `packages/core/src/ai/runtimeAdapter.ts`, `packages/core/src/ai/jsonExtraction.ts` (new, + tests)
- `packages/builder/src/pages/PreviewWindow.tsx`, `packages/builder/src/components/preview/StoryPreview.tsx`, `packages/builder/src/services/providers/{OpenAIProvider,ClaudeProvider,openai-utils}.ts`, `packages/player-web/src/WebAIProvider.ts`

### Beat multi-selection (graph editor)

- Shift+drag marquee on the canvas or cmd/ctrl/shift+click to select multiple beats (selection now survives node re-syncs — the sync effect used to wipe it, which is why multi-select never appeared to work).
- Group drag moves the whole selection; members dropped inside an expanded cluster all join it in one gesture.
- Right-click a selected beat → **Duplicate N beats** / **Delete N beats** (single confirm; one undo step per beat). Multi-duplicate clones the subgraph with fresh ids and deep-rewrites all internal references — connections, defaultTarget, choice/dialog targets inside parameters — so the copies are wired to each other; links to unselected beats keep pointing at the originals.
- Backspace no longer ghost-deletes nodes (it only removed them from ReactFlow's local view; story state was untouched and they reappeared on the next sync). Deletion is explicit now.

**Files modified:**
- `packages/builder/src/components/graph/GraphEditor.tsx` — selection tracking/preservation, multi-drag, multi context menu
- `packages/builder/src/utils/duplicateBeats.ts` (new, + tests), `packages/builder/src/utils/projectMerge.ts` — deepRewrite/uniqueId exported and reused
- `packages/builder/src/App.tsx`, `packages/builder/src/components/{WorkspaceView,Canvas}.tsx` — handler plumbing

### Cluster quality fixes

- **Deleting a cluster no longer crashes the app** (`beat.getParameters is not a function`): removeCluster rest-spread its member Beats into plain objects, stripping the class prototype. Members now survive intact — delete-cluster-keep-beats works as intended.
- **Beats can be taken back out of a cluster**: a hover ⏏ button on each contained beat, and the sidebar's "Unclustered Beats" section is a drop target (rendered with a hint whenever clusters exist).
- **Clusters autosize to their members**: containers grow to fit the in-container member grid whenever a beat joins; story-merge clusters size to their member count (22-beat merges used to overflow the fixed 800×600 box); the AI pipeline sizes boxes for the member grid instead of the meaningless global-position bbox.
- **AI-generated stories auto-arrange**: after AI story injection, the cluster-aware auto-arrange (sizes containers, resolves overlaps with outside beats) runs automatically via a signal-based deferred effect — previously it only ran from the toolbar button, which is why AI-generated clusters overlapped beats.

**Files modified:**
- `packages/builder/src/hooks/useStoryBuilder.ts` (+ tests) — removeCluster fix, removeBeatFromCluster, grow-on-add
- `packages/builder/src/utils/clusterAutosize.ts` (new, + tests), `packages/core/src/normalize/normalizeStory.ts` (+ test)
- `packages/builder/src/components/graph/ClusterContainerNode.tsx`, `packages/builder/src/components/Sidebar.tsx`, `packages/builder/src/App.tsx`

### Layout-mode conversion: no more false "corrupted project" alert

Converting responsive→fixed baked the schema-default locations in the builder's `type` format without the renderer's canonical `kind` — the corruption detector then flagged every freshly-converted project as "legacy format" on its next load. The migrator now writes canonical locations (kind alongside type); previously-converted projects are healed once by the existing repair-on-load. Also fixed the stale "Box Visibility (Editor & Preview)" settings label (the setting applies everywhere since v0.9.71).

**Files modified:**
- `packages/builder/src/utils/projectLayoutMigrator.ts` (+ tests incl. an end-to-end detectProjectCorruption guard)
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx`

### HUD + preview polish

- **Counter HUD in both layout modes**: screen-docked meter frames hoisted to the top-level HUD overlay (same layer as the mood pad) in the Preview Window AND the exported player — they now render on every beat, in fixed and responsive mode, whether or not the character is on stage. This is also the first time HTML exports render the counter HUD at all (the meter resolver was never wired into the web player). Character-anchored frames unchanged.
- **Mood tracker only when used**: the preview's Character Affect panel appears only when the story has authored affect signals (updateAffect beats, initial mood/sentiments, enabled mood pad) or affect actually moved at runtime — no more dead sidebar space in mood-free stories.

**Files modified:**
- `packages/builder/src/pages/PreviewWindow.tsx`, `packages/player-web/src/WebPlayer.tsx`, `packages/renderer/src/index.ts`
- `packages/builder/src/utils/storyUsesAffect.ts` (new, + tests)

### Docs

- User Guide audited and updated for v0.9.70–0.9.72 features + pro reasoning (Input Image, story merge, GPT-5.6 tiers, setVariable calculations, text-box visibility, Responsive vs Static creation choice, translation coverage), with all control names verified against the UI.

---

## 2026-07-10: Static projects get static VE options + clearer layout choice (v0.9.72)

### Overview

A focused fix release for the fixed-canvas (static) authoring experience. **The Visual Editor now shows the static variety of options in static projects** — previously, after switching a project to Fixed canvas, the VE kept presenting the responsive controls (the "On stage (from slots)" rows with per-slot anchor/pin intent and the Action layout group) next to a pixel-positioned canvas, making it look like the switch hadn't happened. And per author request, the **New Project dialog now explains the Responsive vs Static choice in plain author terms**, with a note that the mode can be changed later.

### Visual Editor: mode-consistent options (the bug)

Two divergent gates caused the mismatch:

- **`VisualPropertiesPanel` rendered slot rows whenever the beat TYPE declares slots**, deliberately ignoring the instance's layout mode. In absolute (fixed) mode those controls only affect the responsive renderer and duplicate the baked elements list — so static projects looked permanently responsive. The panel now returns no slot rows for `layoutMode: 'absolute'`; the baked elements list (with z-order/lock/visibility) is the stage content there.
- **The panel's `layoutMode` prop disagreed with the canvas gates**: the prop used `!beatHasAuthorLocations` alone while the canvas uses `projectIsResponsive || !beatHasAuthorLocations`. Aligned, so panel and canvas always agree on the mode.

Verified live with browser automation + screenshots: responsive project → slot panel + viewport preview; Settings → Fixed canvas → migrator bakes schema-default positions and the VE shows the static options (element rows, 1024×768 pixel stage); switching back restores the responsive editor. The layout-mode migrator itself was confirmed working in both directions ("baked 2 schema-default positions" / "cleared 2 baked positions, inferred slotIntent").

**Files modified:**
- `packages/builder/src/components/visual/VisualPropertiesPanel.tsx` — slot rows are responsive/spatial-mode UI only
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — panel layoutMode prop mirrors the canvas gates

### New Project dialog: clear Responsive vs Static choice

- The layout-mode picker's copy no longer speaks renderer jargon ("Slot + spatial layout"). Two cards now explain the authoring contract: **Responsive** ("text, buttons, and images flow and adapt to any screen — you guide the layout; the player's device decides exact placement; best for stories played on many devices") vs **Static (fixed canvas)** ("you place every element at exact pixel positions on a fixed stage — what you see in the editor is exactly what the player sees; best for precise, hand-crafted compositions").
- A ✓ selected marker on the active card and a footnote that the mode can be switched later in Settings → Project via the one-shot migrator.

**Files modified:**
- `packages/builder/src/components/NewProjectDialog.tsx`
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.72.

---

## 2026-07-10: Story merge + calculations + full i18n coverage + cross-machine fixes (v0.9.71)

### Overview

A big authoring release with two new capabilities and a set of long-standing bugs fixed. **Story Merge** (Import → Merge Story): combine another exported story into the open project without conflicts — incoming beats arrive as their own cluster beside the existing graph, character collisions are decided per character (same person vs. keep both), and every ID/reference is remapped safely. **setVariable calculations**: values starting with '=' are evaluated as arithmetic (`= (var1 + var2) / 100`) with variables, counters, and character-scoped counters — no new beat type needed. Alongside these: text-box **visibility/opacity settings now work everywhere** (they were Visual-Editor-only), **character images survive .asaps export across machines** (the "Windows project loses character images on Mac" report), and the translation audit closed **every remaining gap** — a new runtime UI-string catalog means even renderer chrome and AI loading spinners translate, in the preview and in exports.

### Story Merge (new feature)

- **Import → "Merge Story (.asaps)"** merges an exported story into the open project. Design: incoming beats land as a disconnected group in a new organizational cluster placed beside the existing graph (author wires the stories together afterwards); current project's settings/theme win.
- **Per-character collision decisions** in the merge dialog: "same character — reuse" rewires all incoming references to the existing character; "keep both" renames the incoming one ("Elena 2" / slug `elena_2`). Collision detection compares both the machine name and displayName, normalized — `environmental_consultant` collides with "Environmental Consultant". Undecided collisions default to keep-both (never silently fuse).
- **Conflict-free by construction**: beat/character/asset IDs keep their values unless they collide (then suffixed); all references in incoming content are rewritten via a value-equality deep walk (connections, nested dialog trees, condition targets, asset refs). Character name references (speaker etc.) rewrite through a curated field list so story prose is never touched. Variables union by name.
- Verified live end-to-end: 20-beat project + 2-beat story → 22 beats, collision dialog, reuse honored, cluster created.

**Files modified:**
- `packages/builder/src/utils/projectMerge.ts` (new), `__tests__/projectMerge.test.ts` (new, 11 tests)
- `packages/builder/src/components/MergeStoryDialog.tsx` (new), `Header.tsx`, `App.tsx`
- `packages/builder/src/hooks/useStoryBuilder.ts` — new `mergeBeats` bulk action
- `packages/builder/src/utils/projectZipManager.ts` — `readAssetsFromZip` extracted as shared pure reader

### setVariable calculations (new)

- **Values starting with `=` are evaluated as arithmetic**: `= (var1 + var2) / 100`. Supports + − × ÷, parentheses, unary minus, all variable-reference syntaxes (`${name}`, `$name$`, `{name}`, bare identifier) and character-scoped counters as `owner.counter` (e.g. `alice.trust`). Safe evaluator (no eval); division by zero / unknown names fail cleanly to the legacy behavior with a console warning — never NaN in story state. Existing stories unaffected ('=' is opt-in; `"5+3"` stays a literal).
- Works for both the variable path and the counter path (all operations: set/change/add/subtract/multiply/divide, incl. character-scoped targets).

**Files modified:**
- `packages/core/src/utils/expression.ts` (new, 31 tests), `SetVariableBeat.ts` (+11 tests), `beat-definitions/core-beats.json`

### Text box settings fixed (visibility + opacity)

- **Settings → Text Box → "Box Visibility" now works in the Preview Window, the exported player, and slot-mode (responsive) beats** — it was only wired into the Visual Editor. The setting now rides the theme: both theme converters pass it, the renderer derives its hide flags from it, slot-mode cards and buttons honor it (hideText strips text/dialog cards; hideAll also renders bare button labels). PlayerEngine's converter also gained the previously missing `hideTitleTextBox` passthrough.
- Opacity confirmed working end-to-end at the same time (verified via DOM assertions: 25% opacity → `rgba(15,52,96,0.25)`).

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx`, `SlotFlowView.tsx`, `renderers/ReactRenderer.tsx`
- `packages/builder/src/utils/themeConverter.ts`, `packages/player/src/PlayerEngine.ts`

### Character images survive .asaps round-trips (Windows → Mac report)

- Root cause: the exporter's referenced-but-unlinked asset safety net only accepted **UUID-format asset IDs**, but every in-app upload path generates timestamp-format IDs (`asset_<ts>_<suffix>`). A character image that had fallen out of the project's linked-asset list was silently omitted from the .asaps — invisible on the origin machine (asset still in local storage), lost after import elsewhere.
- Also fixed while tracing: the import never scanned the `videos/` folder the exporter writes (video assets vanished on import), and zip-entry asset-ID extraction now prefix-matches against shipped metadata IDs (handles alphanumeric ID suffixes the old regexes couldn't).

**Files modified:**
- `packages/builder/src/utils/projectZipManager.ts`, `__tests__/projectZipManager.test.ts` (3 new round-trip tests)

### Translation: every known gap closed

- **New runtime UI-string catalog** (`@asaps/core/i18n/uiStrings`): renderer chrome that was hardcoded English now translates — conversation input placeholder and "Listening...", inventory HUD title/expand hint, all image-picker texts, Continue/Play Again/Credits fallbacks, and all 19 AI loading messages ("Thinking...", "{name} is getting ready to speak..."). Preview Window batch-AI-translates the catalog per active language; HTML exports seed it into `globalSettings.uiStrings` (translated by both export flows); the exported player installs it and wraps renderLoading — loading spinners finally translate in exports.
- **Authored-text extraction gaps**: `aiConversation.openingLine` (the NPC's scripted first message) and `arBeat.anchors[].label` now extracted by both extractors; multiChoice choice labels translate via the movementChoice displayText pattern (routing by id — safe); qrScan helper/cancel, arBeat cancel, webView done labels; the exported player's on-the-fly extractor now covers inventory items, character/counter display names, and HUD labels (matching the builder-side extractor).

**Files modified:**
- `packages/core/src/i18n/uiStrings.ts` (new, 9 tests), `packages/core/src/beats/MultiChoiceBeat.ts`
- `packages/builder/src/export/StoryTranslator.ts`, `HtmlExporter.ts`, `pages/PreviewWindow.tsx`
- `packages/renderer/src/components/ImageInputElement.tsx`, `CharacterInventoryFrame.tsx`, `SlotFlowView.tsx`, `renderers/ReactRenderer.tsx`
- `packages/player-web/src/WebPlayer.tsx`, `packages/builder/public/player-web.js` (rebuilt)

### CI

- Test pipeline fully green again (a stale fixture in `projectDeserializer.test.ts` had been failing since the v0.9.68 auto-repair feature). Suites at release: core 2482, renderer 483, builder 2192 — all passing.
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.71.

---

## 2026-07-09: Input Image beat — AI vision analysis of player photos (v0.9.70)

### Overview

A feature release adding a new beat type: **Input Image**. The player submits a photo — the OS camera on mobile (via the file-input `capture` attribute) or a file picker on desktop — the image is analyzed by the configured AI provider's vision model against an author-defined analysis prompt, and the AI's answer text is stored in a story variable. It is the visual sibling of Input Text: same "collect input → variable" contract, with AI perception in the middle. V1 is deliberately free-text-only; branching on the result composes with the existing AI Condition beat. The design keeps authors and players safe from every failure mode: no vision-capable provider, a skipped photo, a timeout, or an API error all resolve to an author-set fallback value and the story continues — never a softlock. Verified end-to-end in the Preview Window: photo upload → Claude vision analysis → result in the variable.

### The beat (core)

- **`InputImageBeat`** (`packages/core/src/beats/InputImageBeat.ts`) — parameters: player-facing `prompt`, AI-facing `analysisPrompt`, `saveTo` variable, `imageSource` (camera / upload / both), button labels, `fallbackValue`, and `timeout` (default 30s). Follows the qrScan pattern: slot-mode schema, `recordChoice`/timeline events, graceful fallthrough when the renderer lacks image support.
- **Fallback at every step** — missing `renderInputImage`, player Skip, missing `aiService`, provider without `analyzeImage`, timeout, or API error each store `fallbackValue` and advance to the next beat.
- **Schema-driven everywhere** — new `inputImage` entry in `beat-definitions/core-beats.json` (slots: speaker / prompt / imageInput) + regenerated `beat-types.ts`; the inspector, palette metadata, and slot layout all derive from the schema.
- **Interface additions** — `IAIService.analyzeImage?()` (optional: non-vision providers simply omit it) and `IRenderer.renderInputImage?()`, which resolves with the image as a data URL or the `'cancelled'` sentinel.

**Files modified:**
- `packages/core/src/beats/InputImageBeat.ts` (new), `BeatRegistry.ts`, `beats/index.ts`
- `beat-definitions/core-beats.json`, `packages/core/src/generated/beat-types.ts`
- `packages/core/src/types/index.ts` — `analyzeImage` + `renderInputImage` interface methods

### Renderer

- **New `imageInput` slot role** and **`ImageInputElement`** — file picker (camera capture on mobile), preview thumbnail (tap to re-pick), own Analyze/Skip buttons (KeypadElement precedent). Crucially, it **downscales via canvas to max 1568px JPEG before base64-encoding**, so a 12 MB phone photo fits vision-API request limits and image-token budgets on every supported model.
- **Editor-mode placeholder** in `SlotFlowView` (like the camera slot) so authoring never opens a file dialog; `renderInputImage` in `ReactRenderer` follows the renderQRScan promise pattern; `EditableReactRenderer` gets the editor override.

**Files modified:**
- `packages/renderer/src/components/ImageInputElement.tsx` (new), `SlotFlowView.tsx`
- `packages/renderer/src/renderers/ReactRenderer.tsx`, `EditableReactRenderer.tsx`
- `packages/renderer/src/utils/slotLayout.ts` — `imageInput` role

### AI adapters (all three runtime surfaces)

- **Preview Window** — `analyzeImage` in both provider branches: Claude (base64 image content block) and OpenAI-compatible (`image_url` data URL), each on both the direct and proxy paths; the language-aware wrapper passes it through with a respond-in-target-language directive.
- **Exported stories** — `WebAIProvider.analyzeImage` (Anthropic + OpenAI-compatible), and the `player-web` bundle was rebuilt so HTML exports ship it.
- **Provider support**: all current Claude models and recent OpenAI models are vision-capable; local/Ollama works with vision models (llava, qwen2.5-vl, gemma3, llama3.2-vision…) and falls back cleanly on text-only ones.

**Files modified:**
- `packages/builder/src/pages/PreviewWindow.tsx`, `packages/player-web/src/WebAIProvider.ts`, `packages/builder/public/player-web.js` (rebuilt)

### Builder & i18n

- Palette: **Input Image** in the Single Choice → Input group with the AI pill.
- `StoryTranslator`: player-facing `prompt`/`buttonText`/`cancelButtonText`/`fallbackValue` are translated; **`analysisPrompt` intentionally stays in the source language** (it's an AI instruction, not player-facing text) — the language-aware preview adapter handles answer-language instead.

**Files modified:**
- `packages/builder/src/components/graph/BeatPalette.tsx`, `packages/builder/src/export/StoryTranslator.ts`

### Tests & verification

- **15 new tests** (`packages/core/tests/beats/InputImageBeat.test.ts`) covering constructor/migration paths, every fallback branch, data-URL parsing into base64+mediaType, variable interpolation in both prompts, and the happy path. Shared `beatHarness` gains `renderInputImage` + `analyzeImage` mocks.
- Full core (2437) and renderer (483) suites pass; type-check clean across workspaces. Live verification via browser automation: beat created from the palette, previewed, image injected, Claude analyzed it, variable populated.
- Known pre-existing failure (not this release): `projectDeserializer.test.ts › should preserve locations` — the v0.9.68 auto-repair removes the test's legacy-shaped location fixture; tracked as its own fix.

**Files modified:**
- `packages/core/tests/beats/InputImageBeat.test.ts` (new), `packages/core/tests/helpers/beatHarness.ts`
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.70.

---

## 2026-07-09: OpenAI request correctness — Ideator + packaged-app fixes (v0.9.69)

### Overview

A targeted fix release for the OpenAI provider and the packaged (Electron) app. The headline: **Ideator story generation now works with OpenAI models.** On the packaged macOS app, the same OpenAI config made the runtime *beat* functions work while *Ideator* generation failed — because two `OpenAIProvider` methods bypassed the shared, already-correct request builder and sent the legacy `max_tokens` field (rejected by `gpt-5.5` and the whole GPT‑5 / o‑series / gpt‑4o family) plus a `response_format: json_object` on free-text replies (which both mangles the reply and 400s when the prompt has no "json"). The same round also fixes the AI-schema fetch under `file://` (it was 404ing in the packaged app and silently downgrading to a possibly-stale fallback) and hardens the translate/export OpenAI paths. A separate corporate-network symptom (Zscaler blocking `api.openai.com`) was diagnosed as a network-policy block — not an app bug — with a Local-model workaround.

### Ideator × OpenAI: generation now works

- **Tool-call loop sends the correct token parameter.** `generateChatWithTools` — the loop the Ideator drives generation through — hand-built its request body and always sent `max_tokens`, so `gpt-5.5` returned `400: 'max_tokens' is not supported … use 'max_completion_tokens'`. It now mirrors `buildChatRequest`: `max_completion_tokens` for models that require it (GPT‑5 / o‑series / gpt‑4o / Kimi‑K2), with `reasoning_effort` passthrough. This is why the beat functions (which already went through `buildChatRequest`) worked while the Ideator didn't, on one identical config.
- **Free-text conversation turns opt out of JSON mode.** `generateConversationTurn` returns prose, but `buildChatRequest` unconditionally forced `response_format: json_object` whenever `useJsonFormat` was on — which both distorts the reply and triggers `400: 'messages' must contain the word 'json'` when the prompt lacks it. Added a `jsonMode` opt-out; conversation turns pass `false`. **Claude is unaffected** — it runs through the separate `ClaudeProvider`, which correctly uses `max_tokens` (the Anthropic field) and its own methods.

### Packaged-app (file://) schema loading

- **`AIValidator` resolves the beat schema relative to the document.** It fetched the absolute `/beat-definitions/core-beats.json`, which under `file://` resolves to the filesystem root (`net::ERR_FILE_NOT_FOUND`) and silently fell back to the possibly-stale API server. Now uses `new URL('beat-definitions/core-beats.json', document.baseURI)` so it resolves correctly on the dev server AND in the packaged app.

### Translate / export OpenAI paths hardened

- **`StoryTranslator`** routed its OpenAI request through the shared `buildChatRequestBody` (correct token param + reasoning-model temperature handling) and now guarantees the literal word "json" is present when `json_object` is requested.
- **`HtmlExporter`** applies the same "json"-in-messages guard and a model-aware token field to the AI code it emits into exported HTML.

### Known limitation (diagnosed, not a code bug)

- **Zscaler / corporate security proxies** can block `api.openai.com` and return a 403 HTML page, which surfaces as a confusing parse error. This is a network-policy block, not fixable in the request. Workaround: use the built-in **Local** provider (Ollama on `localhost`) or a corporate-approved endpoint. A clear-error detection for block-page responses is a possible follow-up.

### Verification

- Builder type-check clean. Fixes are isolated to the OpenAI/validator/translate paths; the Claude provider and the runtime beat paths were confirmed untouched.

**Files modified:**
- `packages/builder/src/services/providers/OpenAIProvider.ts` — `max_completion_tokens` in the tool loop + `jsonMode` opt-out for conversation turns.
- `packages/builder/src/services/AIValidator.ts` — document-relative schema fetch (file:// fix).
- `packages/builder/src/export/StoryTranslator.ts`, `HtmlExporter.ts` — shared request builder + json_object "json"-in-messages guard.
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.69.

---

## 2026-07-08: Corrupted-project auto-repair + AI beat fixes (v0.9.68)

### Overview

A robustness release driven by real bugs. The headline is **automatic detection and repair of corrupted projects on load**: an imported story with a partial `globalSettings` (only `{ project, debug }`) and legacy-format layout elements previously crashed the preview *and* the Settings panel outright, then — once the crash was patched — rendered blank. The app now detects that damage, resets missing display settings to full defaults, salvages each beat's layout elements, deletes the parts that can't be salvaged, and tells the author (once) so they can save the repaired project. Alongside that, the **AI Dialog Tree** no longer collapses to a single level, and several **AI Conversation** authoring bugs were fixed (comma-separated keywords, deterministic variable/turn-count exit conditions, and the interactor's message now appears the instant it's sent). The experimental **knowledge-graph cultural-adaptation** feature landed behind a settings flag, and CI now runs the full test suite.

### Corrupted-project detection & auto-repair (headline)

A pragmatic detect → reset → salvage → delete flow, applied on the universal project-load path:

- **Detect** — `detectProjectCorruption()` flags an incomplete `globalSettings` (missing `colors` / `fonts` / `textbox` / `textEffects` / `hotspots`) and beat layout elements stored in the builder's legacy `type` format (or otherwise malformed).
- **Reset settings** — `normalizeGlobalSettings()` fills every missing section with sane defaults while preserving any valid values, applied at all `globalSettings` load sites. No consumer ever sees a partial object again — this fixes, at the source, the `Cannot read properties of undefined (reading 'pcolor')` crashes in both the theme converters and the Settings inspector.
- **Salvage beats** — `salvageBeatLocations()` upgrades legacy layout elements (`type` → the renderer's canonical `kind`) while preserving their geometry/text, in `deserializeBeats`.
- **Delete corrupted parts** — layout elements with no recoverable kind are dropped so they regenerate cleanly instead of rendering as nothing.
- **Notify** — `notifyIfCorrupted()` alerts the author once per project that a repair happened and to save to persist it.

### Preview robustness

- **No crash on partial `globalSettings`.** `convertGlobalSettingsToTheme` now normalises each settings sub-object over defaults before use.
- **Baked `type`-format locations render.** The renderer keys everything off `kind`; the visual editor converted `type→kind` before rendering but the preview/runtime path did not, so baked locations were dropped entirely (`Processing 0 text elements, 0 buttons`). Normalised at `renderPositionedBeat`, the shared choke point.
- **Bare-stage text stays readable.** When a text box is hidden, the text sits directly on the stage but used the box-derived colour, so a titleScreen title could render black on a dark stage and vanish. `readableOnStage()` keeps authored colours that already contrast and flips only the near-invisible ones.

### AI Dialog Tree: no longer collapses to one level

The model was building a correct multi-level tree, but a turn-1 choice still exited immediately. Root cause: `AIDialogTreeBeat` matched the chosen choice **only by `c.id`** while `renderChoices` resolves with the choice **text**, so `chosen` was `undefined` and the beat took its exit fallback — the regular `DialogTreeBeat` already had the text fallback. Supporting fixes: raised the `generateDialog` token budget so trees aren't truncated, strengthened the generation prompt to force full nesting, and made runtime navigation prefer a nested `dialogNode` over a stamped exit target. Verified live (turn 1 → turn 2 descent confirmed).

### AI Conversation fixes

- **Keywords field accepts a comma-separated list** again (Conversation Directions) instead of stopping after one word.
- **Variable-check and turn-count exit conditions are evaluated deterministically** in code (fuzzy topic/sentiment/custom triggers still route to the LLM), so a `misogyny == true` exit fires reliably.
- **The interactor's message appears the instant they hit Send**, before the AI reply arrives.
- **NPC id resolves to the display name** and the character picker shows all characters.

### Knowledge Graph (experimental, behind a flag)

Landed the experimental two-layer knowledge-graph cultural-adaptation scaffold behind a settings toggle (`features.showKnowledgeGraph`), with anonymized KG test fixtures.

### CI

- The **core + renderer + builder test suites now run in CI** on every push.
- GitHub Actions bumped off the deprecated Node 20 runtime.

### Verification

- Builder type-check clean; new logic covered by regression tests (theme normalisation, project repair/salvage, AI dialog-tree navigation, AI conversation triggers/keywords).
- Repair flow verified live: the detection alert fires on load with the correct issue list, Settings › Colors opens without crashing, and the settings reset to defaults.

**Files modified:**
- `packages/builder/src/utils/projectRepair.ts` (new) — detection, location salvage, and the one-time notice.
- `packages/builder/src/utils/themeConverter.ts` — `normalizeGlobalSettings` + defensive `convertGlobalSettingsToTheme`.
- `packages/builder/src/utils/projectDeserializer.ts`, `App.tsx` — wire salvage + settings normalisation into the load path.
- `packages/renderer/src/renderers/ReactRenderer.tsx` — `type→kind` normalisation at `renderPositionedBeat`.
- `packages/renderer/src/components/PositionedBeatView.tsx` — `readableOnStage` bare-stage text contrast.
- `packages/core/src/beats/AIDialogTreeBeat.ts` — text-fallback choice matching, `dialogNode` precedence, nesting prompt/tokens.
- `packages/core/src/beats/AIConversationBeat.ts`, `packages/core/src/utils/dossier.ts` — conversation trigger/keyword/NPC-name fixes.
- `.github/workflows/*` — run test suites; Node runtime bump.
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.68.

---

## 2026-07-07: Visual-editor fixes + QR/ASML correctness + more coverage (v0.9.67)

### Overview

A correctness-and-polish release. The headline is a set of **Visual Editor fixes**: the per-beat element-add buttons (Character / Prop / Text) had become invisible in slot/spatial (responsive) beats, and the toolbar **Characters** button crashed on selection. Alongside these, QR-Scan target-beat handling was clarified and its jumps are now drawn on the flowchart, the ASML importer round-trips project/variable metadata it previously dropped, and the test suite gained a further **~280 tests** across the largest previously-thin areas (the "giant" renderer views, camera/AR beats, STT/TTS providers, hooks, and the undo/redo command classes). Two web-service security advisories were also cleared.

### Visual Editor fixes

- **Element-add buttons restored in every layout mode.** The **Character / Prop / Text** buttons in the Elements panel were gated on `layoutMode === 'absolute'`, so they disappeared entirely in slot/spatial (responsive) beats — leaving no visible way to add a character/prop/text to those beats. They now render in all modes; the per-mode graphics behaviour of *what adding does* stays the concern of `onElementAdd` / the renderer, but the affordance is never hidden.
- **Toolbar "Characters" button no longer crashes.** `Header` wired `onClick={onCharacters}`, passing the React click event in as the manager's selection callback. That truthy non-function value forced the manager into selection mode and then threw `characterSelectionCallbackRef.current is not a function` on click. The click is now wrapped, and the callback ref is guarded to accept functions only.
- **Character-card edit (✎) button restored.** It now shows whenever an edit handler is available, in both the manage and selection modes, instead of only in selection mode.

### QR Scan: clearer target semantics + flowchart edges

`qrScan` target-beat semantics were clarified, and QR-jump transitions are now drawn as edges in the flowchart so a scan's destination is visible in the graph rather than hidden in the beat's parameters.

### ASML round-trip fix

The ASML importer now reads the `<project>` and `<variable>` elements it previously ignored, so exported stories re-import with their project metadata and variables intact. Two parser bugs fixed, pinned by 11 new round-trip tests.

### Continued test-coverage expansion (~280 tests)

- **"Giant" renderer views**: `SlotFlowView`, `SpatialFlowView`, `PositionedBeatView`, `PanoramaView`, and `ReactRenderer` mount/content.
- **Camera / AR / spatial beats**: `ARMarkerScene` (mind-ar tracking + fallback), `ARSceneElement` (permission/camera lifecycle), `IndoorMapBeat` (beacon-proximity triggers), `TimerProgressBar` / `OrientationGate` / `WebViewElement`.
- **STT/TTS providers**: the four previously-untested speech providers (51 tests).
- **Hooks & commands**: `useAI` / `useSTT` / `useTTS` / `useAIDebug`, `useAvailableCountersAndVariables` / `useCommandManager`, and the Batch/Animation/ProjectState command classes.
- **Builder UI**: `SearchPanel`, `MissingAssetsDialog`, `ProjectSelector`/`ProjectBadge`, `NewProjectDialog`, `InputTextValuesModal`, `UndoRedoToolbar`/`MockSensorPanel`, `StoryExporter`, `SchemaLocationInitializer` — several behind a new `renderWithProviders` harness.

### Security

- **`multer` 1.4.5-lts → 2.2.0** in the web-service workspace (closes 7 high-severity DoS advisories).
- Cleared the remaining Dependabot **criticals** across the repo and both MCP servers.

### Verification

- Builder type-check clean; the changed Visual Editor / character-manager fixes verified live in the running app (element-add buttons confirmed present in a responsive slot-mode `movementChoice` beat; the Characters button opens without the console error).

**Files modified:**
- `packages/builder/src/components/visual/VisualPropertiesPanel.tsx` — ungate the Character/Prop/Text add buttons.
- `packages/builder/src/components/Header.tsx`, `App.tsx` — fix the Characters-button event-leak crash + guard the callback ref.
- `packages/builder/src/components/characters/CharacterCard.tsx` — always show the ✎ edit button when editing is available.
- `packages/core/src/**`, `packages/renderer/**`, `packages/builder/src/**` — the qrScan flowchart edges, the ASML `<project>`/`<variable>` parser fix, and the new test suites listed above.
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.67.

---

## 2026-06-16: Test-coverage hardening + bug-fix release (v0.9.66)

### Overview

A stability-focused release: no new authoring features, but a very large test-coverage push that raised the suite from **2788 → 4728 passing tests** (+~1940 across `@asaps/core`, `@asaps/builder`, `@asaps/renderer`) and, in the process, surfaced and fixed **nine real bugs** plus one user-facing runtime hang. The coverage work was deliberately breadth-first over previously-untested modules — storage adapters, AI providers, the helper-command engine, theme service, the undo/redo command classes, the React hooks, all three pop-out window managers, the layout migrator, and a long tail of core/renderer utilities. The headline fix is that AI story generation no longer stalls past the SDK's 10-minute request timeout; the rest are quieter correctness fixes that tests pinned in place. ~3700 lines of dead code were also removed.

### Runtime fix: AI generation no longer hangs (streaming)

`ClaudeProvider.generateStory` now streams the response (`client.messages.stream().finalMessage()`) instead of buffering a single `messages.create()` call. Root cause of the user-reported "stuck at 21 minutes" generation: the non-streaming call holds the connection open until the whole story is produced, so a long high-effort run blows past the Anthropic SDK's fixed 10-minute request timeout, which aborts and silently retries. This was newly triggered when the xhigh `max_tokens` ceiling was raised 32K→96K — adaptive thinking expands to fill the larger budget, pushing big runs over the wall. Streaming returns headers immediately, so there is no body-timeout. Two regression tests assert the stream path is used and that `onProgress` is forwarded.

### Real bugs fixed (pinned by new tests)

- **`disconnectBeats` never removed the edge.** It mutated a *copy* returned by `getConnections()` and re-added, so the source beat kept the connection; now calls `Beat.removeConnection()` directly.
- **Claude thinking-shape misclassification (two fixes).** A date-suffixed model id like `claude-sonnet-4-20250514` had its YYYYMMDD read as the minor version, classing the default model as "adaptive" and 400-ing whenever a reasoning effort was set. A second fix corrected `claude-haiku-4-5` / `claude-sonnet-4-5` being treated as adaptive. Default Claude model bumped to `claude-sonnet-4-6` across all fallback sites.
- **Asset path not rewritten on reassociation.** `FilesystemStorageAdapter.reassociateAssets` updated `metadata.projectId` and moved the binaries but left `metadata.path` at the old location, so every reassociated asset silently failed to load after an untitled→named save. Now rewrites the path prefix.
- **`DeterministicCommandParser` plural elements.** A greedy `(\w+)s?` capture swallowed the trailing "s", so plural element kinds never matched their location-kind lookup.
- **Ren'Py author dropped for canonical `_p("""...""")` syntax** — author-extraction regex now handles the parenthesized triple-quote form.
- **EndScreen / AISummary phantom restart loop** — an empty action string was treated as "restart", spinning the single-button exit loop; both now guard on a non-empty action.
- **CI**: scoped the security audit to production deps and switched lint to exclude generated files.

### Test coverage added (+~1940 tests)

- **Storage layer**: `StorageManager`, `HybridStorageAdapter`, `AssetStorageAdapter`, `DirectoryAdapter`, thin IndexedDB/Zip adapters, `FilesystemStorageAdapter` — all against `fake-indexeddb`.
- **AI providers & services**: `ClaudeProvider`, `OpenAIProvider`, `HelperCommandExecutor`, `HelperCommandFilter`, `AIDebugService`, `AIService` mocks, `providerQuirks`, the four `services/prompts/` builders, Ideator system prompts.
- **Themes**: `ThemeService` (CRUD/assets/inheritance/recency), `GlobalSettingsAdapter`, theme conversion helpers.
- **Undo/redo**: `Command` base + `CommandRegistry`, `BeatCommands`, `ElementCommands`, `CommandManager`.
- **Hooks**: `useStoryBuilder`, `useAutoSave`, `useThemes`/`useTheme`, `useStorageQuota`, `PersistenceContext`.
- **Pop-out window managers**: `DebugWindowManager`, `IdeatorWindowManager`, `PreviewWindowManager` (web `window.open` + `postMessage` path).
- **Migration / import**: `projectLayoutMigrator` (fixed⇄responsive), `TwineImporter`, `RenpyAssetExtractor`, `HtmlExporter`.
- **Renderer components**: Timer/Keypad/Meter/Mood/Map placeholders, `ChatDialogView`, `CharacterInventoryFrame`, `QRScanElement`.
- **Core**: `StoryEngine` orchestrator, `storyLogicValidator`, `ConstraintSet`/`PathQuery`, `fontRegistry`, beat-execution harness + several beats, plus a long tail of older utility modules.

### Dead code removed (~3700 lines)

Deleted 13 unused builder modules (legacy preview debugger, cluster-positioning, abandoned text-transformer/AI-helper plumbing, superseded panorama panel, the old `WebRenderer`), the legacy Flash `SWFBeat`, and several dead test files that pinned removed behavior.

### Verification

- Full suite green: **core 2358 / builder 1956 / renderer 414 = 4728 passing** (78 core tests skipped by design); builder type-check clean.
- Local unsigned macOS `--dir` build packaged, ad-hoc signed, `codesign --verify --deep --strict` passed, and launched cleanly (renderer up, no crash-on-launch) before tagging.

**Files modified:**
- `packages/builder/src/**` — new `__tests__/` suites across `commands/`, `services/`, `hooks/`, `storage/`, `themes/`, `utils/`; bug fixes in `ClaudeProvider.ts`, `useStoryBuilder.ts`, `FilesystemStorageAdapter.ts`, `DeterministicCommandParser.ts`.
- `packages/core/src` + `packages/core/tests/**`, `packages/renderer/tests/**` — coverage additions and the EndScreen/AISummary/Ren'Py fixes.
- `package.json`, `apps/builder-desktop/package.json` — version bump to 0.9.66.
- `.github/workflows/build-desktop.yml`, `ci.yml` — CI audit/lint scoping.

---

## 2026-06-08: Security patch release (v0.9.65)

### Overview

Hot-patch release immediately following v0.9.64 to push security fixes to end users via auto-update. No new features. The shipped v0.9.64 DMG / exe contained Electron 40.6.1 and a handful of vulnerable transitive deps; v0.9.65 ships Electron 40.10.2 (closes 18 separate advisories inside the 40.x series, including AppleScript injection in `app.moveToApplicationsFolder` on macOS) plus a fresh sweep of patched transitive deps. The local `npm audit` count dropped from 35 distinct entries (2 critical, 14 high, 18 moderate, 1 low) to 5 (0 critical, 2 high, 3 moderate, 0 low). The 5 remaining advisories are all build-toolchain only (capacitor's bundled tar, esbuild, uuid in the web-service workspace, vite) — none reach the shipped product.

### Electron 40.6.1 → 40.10.2

Within the 40.x semver range — `^40.0.0` already permitted the upgrade; just refreshed the lockfile. Closes 18 advisories patched between 40.7.0 and 40.8.5 (use-after-free in various callback paths, AppleScript injection in moveToApplicationsFolder, service-worker IPC spoofing, permission-handler origin confusion, executeJavaScript IPC reply spoofing, several more). The only one with end-user runtime exposure on macOS was the AppleScript injection — the rest are dev-time / very-narrow-trigger.

### vitest 2.x → 4.x

Major-version bump of the test runner (build-time only, never shipped). Closes the 2 remaining critical CVEs that survived the patch-level sweep. Three vitest-4 behavior changes the test fixtures had to adapt to:

1. Strict `testTimeout` enforcement. Three Hollow-Star-fixture analysis tests run ~45-50 seconds (StateSimulationAnalyzer over a 1000+ raw-path graph). Vitest 2 was lenient; vitest 4 hard-fails at the 10 s default. Each gets an explicit `{ timeout: 90_000 }` annotation with an explanatory comment.
2. `global.X = ...` no longer aliases to `window.X` in jsdom. The `AudioManager` test patched `global.fetch` / `global.AudioContext`; the source reads `window.fetch` / `window.AudioContext`. Switched to `vi.stubGlobal` (patches both slots) with `vi.unstubAllGlobals()` in `afterEach` so mocks don't leak.
3. `vi.fn().mockImplementation(() => ({...}))` returns an arrow function which isn't `new`-able. `AudioManager` calls `new AudioContext()`, so the mock implementation must be a regular function expression — switched to `vi.fn(function () { return {...} })`.

### Transitive dep refresh

`npm update` swept everything within current semver ranges to latest patch / minor: `brace-expansion`, `xmldom`, `fast-uri`, `flatted`, `lodash` (prototype pollution in `_.unset` / `_.omit`), `minimatch`, `path-to-regexp` (ReDoS via multiple route params), `picomatch`, `rollup` (arbitrary file write via path traversal), `tmp` (path traversal via unsanitized prefix/postfix), `@microsoft/api-extractor`. All non-breaking, no `package.json` range changes required.

### CI install: `npm ci` → `npm install`

The first patched-deps build (workflow run 27163390922) failed both macOS and Windows install steps with npm complaining about missing `emnapi` / `@napi-rs/wasm-runtime` resolutions. Root cause: npm's well-documented cross-platform optional-dep gap — `npm install` on macOS does NOT record Linux-only optional native binaries in the lockfile, so CI's strict `npm ci` walks off the cliff trying to verify them. Switched to `npm install --no-audit --no-fund` which resolves on the target platform. Trade-off: each CI run does a fresh resolve, no install-cache reuse. Acceptable since the workflow only fires on release tags + manual dispatch.

### @types/express 5 type widening

The lockfile regen brought in `@types/express@5.0.6` which (correctly, per the spec) widens `req.params.X` to `string | string[]`. URL query params with repeated keys can be arrays; URL path params (`:id` in `/:id`) cannot. Six call sites in `packages/builder/src/api/server.ts` cast to `string` with an explanatory comment so a future reader doesn't try to "fix" the cast with a runtime guard that can never fire.

### Memory captured

- Lockfile contains cross-platform optional-dep gaps when generated on macOS; CI's `npm ci` can't reconcile. Future security sweeps that touch optional native packages should use `npm install` in CI rather than `npm ci`. Documented in the CI workflow comment so the next operator understands the trade-off.

### Verification

- Full test suite (2788 tests across `@asaps/core`, `@asaps/renderer`, `@asaps/builder`) green after vitest 4 bump.
- Workflow run 27164501461 successfully built macOS + Windows artifacts with the patched lockfile. Hartmut verified the local dev build runs end-to-end before tagging the release.

**Files modified:**
- `apps/builder-desktop/src/main/index.ts` (only via Electron transitive), `.github/workflows/build-desktop.yml`
- `package.json`, `package-lock.json`, `mcp-server/package.json`, `mcp-server-desktop/package.json`, `packages/{builder,core,player,renderer}/package.json`
- `packages/builder/src/api/server.ts`
- `packages/renderer/tests/audio/AudioManager.test.ts`
- `packages/core/tests/analysis/{PathTree,ConstraintPathAnalyzer,StoryWarnings}.test.ts`

---

## 2026-06-08: Camera/AR beats + Project Browser overhaul + Electron start window (v0.9.64)

### Overview

A two-themed release. **Theme one** is three new beats that pull ASAPS into the camera/AR/web-embed space — qrScan, webView, arBeat — plus an `asaps://` URI scheme that lets QR codes and AR anchors route into the story without scripting. All three new beats are flagged experimental in the schema: built and shipped end-to-end but not verified against the hardware they need at runtime (printed QR codes, compiled `.mind` markers, real cameras). The palette surfaces an amber EXP pill so authors know what they're building with. **Theme two** is a sweep of the project-organization surface: a redesigned in-editor Browser modal, a Project Browser overhaul (four create paths, compact metadata-rich cards, drag-drop import), and — for Electron — a dedicated start window that opens at app launch. Boot now lands the author on the start surface for the first cold load of a session and skips it on in-session reloads. Six more beats joined the responsive slot mechanic, and the Visual Editor got a fresh round of hotspot polish.

### Three new beats (all experimental)

**QR Scan** (`qrScan`, 📷, Input). Opens the device camera, waits for a QR code, saves the decoded string to a variable, then branches. When `interpretAsapsUri` is on (default), an `asaps://` payload routes the story directly instead. The inspector ships a QR generator panel that produces printable `.png` codes for any beat in the story with one click.

**Web View** (`webView`, 🌐, Display). Embed a live external page via `iframe` on web/PW or `<webview>` on Electron. Exits via the Done button, an exit-URL pattern match, or a `postMessage` from the page. Slot mode (responsive) AND fixed-locations mode both supported, so authors can mix it into either layout intent.

**AR Scene** (`arBeat`, 🥽, Input). Augmented-reality scene with image-marker tracking via MindAR — lazy-loaded from CDN at runtime to bypass an upstream Three.js version conflict. Authors upload a compiled `.mind` file plus anchors (text / image / tappable cards); each anchor's `onTap` resolves through the same `asaps://` parser as qrScan, so a single field handles "jump to beat", "set variable", "add to inventory", or "record event".

### asaps:// URI scheme

A new core utility (`packages/core/src/utils/asapsUri.ts`) defines and parses four verb forms: `asaps://beat/<id>`, `asaps://variable/<name>/<value>`, `asaps://inventory/{add|remove}/<item>`, `asaps://event/<name>`. The schema validator gains a `references: 'beatOrAsapsUri'` field kind that accepts either a bare beat id or `asaps://beat/<id>`, and recurses into `itemSchema` for array<object> fields so dangling refs in nested anchor `onTap` values get flagged at lint time.

### Six more beats responsive

`aiDurScreen`, `aiDialogTree`, `hyperText`, `keypad`, `videoBeat`, and `aiConversation` joined the slot mechanic. New slot roles `camera`, `webview`, `ar`, and `keypad` mount self-contained elements via SlotFlowView. Each beat gets the responsive flow without a separate fixed-mode authoring surface to maintain.

### Project organization overhaul

The folder-icon dropdown that used to repeat the project name is gone — the header now has a clean `📁 Projects ▾` button (switches between recent projects) plus a `+ New` button (opens the create-path picker). An amber `● Unsaved` pill rides next to the layout-mode badge when state is dirty.

The **Project Browser** got a major redesign:
- Four create-path cards across the top: **Empty project** (truly empty — creates a story with no beats), **Build from a prompt** (AI story generator), **Co-write with AI** (Ideator pop-out session), **Import** (.asaps zip / ASML XML).
- A blue **"Currently editing → Continue editing →"** banner at the top when a project is loaded.
- Compact project cards with at-a-glance metadata: `beat count · layout mode · character count`, plus description and modified date. About 2× more cards visible without scrolling vs the earlier version.
- Drag-drop import on the Browser surface — drop a `.asaps` zip directly, no file picker.
- Multi-select for bulk delete (kept from earlier).

The **boot trigger** changed: instead of a 24h staleness check, the Browser now opens on the first cold load of a browser/Electron session (sessionStorage flag). In-session reloads bypass the Browser. Authors get a chance-to-redirect moment on launch without friction during a working session.

A **save-before-navigate confirm** wraps the create paths and project-load handlers — dirty state can no longer get silently destroyed by the AI generator's `clearStory()` path.

### Electron start window

App launch in Electron now opens a dedicated start window (its own `BrowserWindow`, 1100×800) before the editor — same pattern Xcode and VS Code use for their welcome surface. The user picks a project / create path; main opens the editor with the intent encoded as URL params and closes the start window. The web build keeps the in-editor modal.

In-editor "Browse all projects…" routes to the same start window in Electron (consistency with cold launch). When the user picks something with the editor already running, a new `start:apply-intent` IPC channel sends the intent to the running editor; renderer applies it mid-session via the same fan-out as the boot-intent consumer (loadProject directly, or fires the matching window event for create-path destinations).

### Visual Editor polish

Hotspot editor:
- Rotation now renders in the editor (was data-correct but visually unrotated).
- Drag works end-to-end (was reading stale prop snapshot, no-op'd).
- `fromProp` hotspots are hidden in the editor — the prop sprite is the click target, no duplicate yellow rect.
- Selected prop outline switched to blue (yellow now reserved for hotspot styling).
- Exclusive selection across sprite/slot/hotspot.

VE↔PW parity for `inputText` (was forcing absolute path even with no baked locations). MovementChoice/PickProp spatial preview honors responsive projects even with baked positions. Stop auto-supplementing movementChoice/pickProp question elements in responsive projects. Stale "Inactive" hotspot advisory corrected for responsive projects.

### Test cleanup

Two pre-existing failing PathInterpolator sprite tests updated to match the END-waypoint sprite-prop rule from commit `270ff12b` (May 25). Schema integrity test caught a missing `locationMapping` on aiConversation after the slot-schema add — fixed.

### Memory captured

- **arBeat anchor refs** lint catches `onTap` values that point at non-existent beats (the `beatOrAsapsUri` reference kind recurses into nested items via the new `itemSchema` validator path).
- Project memory: **fixed mode is first-class** (carried from v0.9.63, re-confirmed during the Browser overhaul — Empty doesn't pre-commit to a layout mode, NewProjectDialog still asks).

**Files modified:**
- New beats: `packages/core/src/beats/QrScanBeat.ts`, `WebViewBeat.ts`, `ArBeat.ts`; `packages/renderer/src/components/QRScanElement.tsx`, `WebViewElement.tsx`, `ARSceneElement.tsx`, `ARMarkerScene.tsx`; `packages/renderer/src/utils/mindarLoader.ts`, `webPermissionManager.ts`
- URI scheme: `packages/core/src/utils/asapsUri.ts`, `packages/builder/src/components/ai/AsapsQRGenerator.tsx`
- Schema: `beat-definitions/core-beats.json` (qrScan / webView / arBeat / experimental flag; six beats made responsive); `packages/core/src/generated/beat-types.ts`
- Project Browser: `packages/builder/src/components/ProjectLibrary.tsx`, `ProjectSelector.tsx`, `NewProjectPicker.tsx`, `Header.tsx`
- Start window: `packages/builder/src/pages/StartWindow.tsx`, `apps/builder-desktop/src/main/index.ts`, `apps/builder-desktop/src/preload/index.ts`
- App boot: `packages/builder/src/App.tsx`
- VE / hotspot polish: `packages/builder/src/components/visual/VisualBeatEditor.tsx`, `HotspotEditOverlay.tsx`, related visual components
- Docs: `docs/USER_GUIDE.md` (refreshed by user-guide-qa subagent)
- Tests: `packages/renderer/tests/animation/PathInterpolator.test.ts`

---

## 2026-05-30: DialogTree slot-mode parity + canvas breadcrumb + HTML-export safety (v0.9.63)

### Overview

A consolidation release. DialogTree gets the same responsive-authoring surface MultiChoice shipped in v0.9.62 — slot-mode routing for the stacked / conversation / custom templates, slotIntent anchors reaching runtime, the 3×3 per-slot anchor picker for custom-template authoring. The legacy left-side "Dialog Phases" panel is replaced by a prominent breadcrumb above the canvas with click-anywhere-to-step-back navigation. HTML-export grows two safety surfaces: server-config-specific guidance when the fetched zip looks like HTML, and a tiered pre-export size warning (mobile devices crash around 25 MB embedded base64).

### DialogTree slot-mode parity with MultiChoice

- DialogTree's `layoutTemplate` field now drives slot-mode routing for stacked / conversation / custom in addition to the existing chat-* templates. Each template gets the responsive flow (SlotFlowView) via an inline slot spec (`speaker` + `text` + `actions`) — dialogTree's schema doesn't declare `layoutMode: 'slot'` itself, so each non-chat template opts in via this runtime dispatch.
- ReactRenderer's spatial path now requires at least one choice to actually have a hotspot — previously it was firing for every dialogTree with no baked locations, returning before the slot dispatch and stranding the runtime on `SpatialFlowView`. Genuinely spatial nodes (with hotspots) still get spatial composition; flat text-choice nodes correctly reach the slot flow.
- `DialogTreeBeat` round-trips `slotIntent` + `slotAnimations` through `getParameters` / `updateParameters` (matches `MultiChoiceBeat`).
- The 3×3 anchor picker in `VisualPropertiesPanel` now appears for dialogTree + custom too, with a beat-type-aware slot list: dialogTree uses "Dialog" (writes slot `text`); multiChoice keeps "Question" (slot `question`). Speaker rides along on both.
- VisualWorkspace's `dialogTreeSlotTemplate` flag engages the VE slot preview for stacked / conversation / custom on dialogTree even without hotspots. `dynamicChoices` now walks `dialogTreeNodePath` to find the current node and uses its `choices` array — stepping into a nested dialog updates the displayed buttons.

### slotIntent reaches the runtime

- `Beat.execute` (base class) now pushes `slotIntent` + `slotAnimations` to renderer state on every beat execution. Before this, VE previews read `beat.slotIntent` directly while the runtime read `getState('slotIntent')`, which stayed undefined — anchors set via the 3×3 picker were honored in the editor but ignored at runtime. Single fix in the base class, every beat that has slotIntent benefits.

### Canvas breadcrumb (replaces left-side Dialog Phases)

- Legacy left-side "Dialog Phases" panel (purple, ~50 lines of UI in VisualWorkspace) is gone.
- New full-width breadcrumb bar above the canvas. Gradient bg, 2px border, speech-bubble icon + "DIALOG PATH" label, pill buttons with hover state, solid-blue highlight on the current segment. Stays visible for dialogTree even at root (shows "Root" + italic hint to click a choice or use the Inspector).
- Click any segment to truncate `dialogTreeNodePath` back to that depth. The bar lives in a flex-col wrapper around the canvas so it stretches the full canvas-area width without breaking the outer flex-row layout.
- `SlotFlowView` preview's `onAction` is no longer inert for dialogTree — clicking a choice button on the canvas walks `dialogTreeNodePath` into the choice's nested `dialogNode` (if any), mirroring the spatial-path Step-in behavior.
- `selectedPhaseId` is kept but derived from `dialogTreeNodePath` via a new useEffect — `phaseOverrides` persistence keeps working without a parallel UI driving it. `handlePhaseSelect` stays for endScreen's main/credits tabs.
- Inspector ↔ canvas bidirectional sync was already in place from v0.9.59 (`asaps:dialogTreeWalkChanged` / `Request` events); the canvas breadcrumb plugs into the same `dialogTreeNodePath` state, so Inspector tree expansion + node highlight follow automatically.

### Conversation-layout polish (continued from v0.9.62)

- Anchor reads in `SlotFlowView` (`bodyAnchor`, `actionAnchorH`) gated on `isCustom` — anchors set during a custom session no longer leak into stacked / conversation when the author switches templates. `actionAnchor.gap` and `.relativeTo` stay live across all templates because they're orthogonal layout signals.
- Action panel in conversation mode widened: `flexBasis: clamp(200px, 34%, 380px)` (was 28%/280) so "Your name is Kim, right?" fits on a single line instead of wrapping into a 3-line button.
- Conversation buttons size to their natural text widths (`alignItems: 'flex-end'` instead of `'stretch'`). Short text isn't stretched, long text doesn't wrap unless it genuinely doesn't fit.
- Body card + speaker label left-align in conversation (`alignSelf: 'flex-start'`), so the NPC text sits near the stage's left padding instead of floating mid-scroller. Stacked / custom keep the centered visual-novel feel.
- Slide-in animation on the action panel suppressed when custom-positioned — its keyframe `transform: translateY(0)` was clobbering the centering `translate(-50%, -50%)` so center-center wasn't actually centered.

### HTML export safety (the deferred follow-ups from v0.9.55)

**WebPlayer Content-Type guidance.** When the fetched zip's magic bytes don't match AND either the first bytes look like HTML OR `Content-Type` was `text/html`, the error includes the actual reported Content-Type and host-specific fix snippets for Netlify (`_headers`), Vercel (`vercel.json`), Apache (`.htaccess`), nginx (`types` block), and a "re-check the URL path" note for GitHub Pages / S3.

**Pre-export size warning (single-file mode).** Three tiers based on the actual story-zip size (decode peaks at ~3× the zip):
- Under 10 MB — straight through, no warning.
- 10-25 MB — blue info banner.
- Over 25 MB — orange warning.

Empirical thresholds from web research: iPhone SE class crashes around 100 MB total page memory; Hartmut's 58 MB single-file confirmed working on desktop Safari. Banner explicitly contrasts desktop (handles 58 MB+) vs older mobile (crashes near 25 MB binary), with a one-click "Switch to Folder export" action and a "Continue with single-file" action that reuses the pre-computed zip blob (no re-zipping).

### Memory captured

- New project memory: **fixed mode is first-class**. Decision (2026-05-29): fixed and responsive are parallel authoring intents, NOT successor/legacy. Never label fixed as deprecated; equal VE polish for both modes. Suggested v0.9 / v1.0 / v2+ positioning; NewProjectDialog should eventually reframe as "what's your target?" instead of a binary toggle.

**Files modified:**
- `packages/builder/src/components/visual/VisualWorkspace.tsx`, `VisualPropertiesPanel.tsx`
- `packages/builder/src/components/export/HtmlExportDialog.tsx`, `packages/builder/src/export/HtmlExporter.ts`
- `packages/player-web/src/WebPlayer.tsx`
- `packages/renderer/src/components/SlotFlowView.tsx`, `packages/renderer/src/renderers/ReactRenderer.tsx`
- `packages/core/src/beats/Beat.ts`, `DialogTreeBeat.ts`, `MultiChoiceBeat.ts`

---

## 2026-05-28: MultiChoice beat + unified layoutTemplate + responsive routing (v0.9.62)

### Overview

A new beat type — **MultiChoice** — and a unified layout-template surface that subsumes the patchwork of presentationMode / hardcoded stacked-by-default / chat-mode toggles. MultiChoice is the single-screen "prompt + N response buttons" beat the palette was missing: simpler than DialogTree (no nested follow-up nodes), more powerful than the legacy conversationChoice (full per-choice effects + conditions). Same authoring as DialogTree's choices, no spatial layer, single screen by design.

The new `layoutTemplate` field unifies the rendering surface across MultiChoice + DialogTree:

- **stacked** — prompt on top, choice buttons below (the visual-novel default)
- **conversation** — NPC text on one side, choice buttons on the other (responsive back-and-forth)
- **chat-scroll** / **chat-bubble** — existing ChatDialogView modes, now keyed off layoutTemplate
- **custom** — author-positioned via the new 3×3 slot-anchor picker (responsive, not the legacy fixed-pixel editor)

The migration from legacy `presentationMode` runs transparently: positioned → stacked, chat-* preserved, so existing dialogTrees render exactly as before.

### MultiChoice beat

- New beat class extending Beat with the same per-choice effect / condition surface as DialogTree (`migrateChoiceEffects` on the choices array; visited-choice tracking + `recordChoice` calls match).
- Schema declares `layoutMode: 'slot'` with three slots: speaker, question (body), actions (dynamicSource: 'choices'). MultiChoice is the first consumer of the dynamicSource concept — the renderer treats each choice as a flow button without enumerating them by name in the schema.
- Two-call render surface: `renderDialog(speaker, question, undefined, locations)` then `renderChoices(choices, locations)`. Passing locations both times lets the runtime take the absolute path in fixed-mode projects with baked positions, and slot mode in responsive ones.
- PositionedBeatView gets a multiChoice branch in `createPositionedElementData` that maps `location.name` (= choice text) → `choice.id`. Without it every button fired with no actionId and the beat resolved to the first available choice — three buttons all routed to choice[0]'s target.
- PositionedBeatView's `adjustElementsForCollisions` short-circuits for multiChoice — no text-collision push-down, no degenerate-overlap repair, no alignment. The author's positions are honored exactly (including buttons above the prompt or overlapping each other). The aggressive auto-layout was driving designer beta testers to give up.
- Inspector reuses the movementChoice / dialogTree per-choice editor for MultiChoice; the spatial-only fields (locationName picker, "Create hotspot", show-text-on-hover) are conditionally hidden.

### Unified layoutTemplate

- New optional `layoutTemplate` parameter on both DialogTreeBeat and MultiChoiceBeat. Source of truth for which rendering surface engages at runtime.
- DialogTreeBeat constructor migrates legacy `presentationMode`: `'positioned'` → `'stacked'`, `'chat-scroll'` / `'chat-bubble'` preserved verbatim. layoutTemplate wins when both are set on disk. `presentationMode` stays mirror-written for one release for any reader that still consumes it.
- DialogTreeBeat exposes `isChatLayoutTemplate()` helper that replaces the previous `presentationMode !== 'positioned'` checks in five places.
- VisualPropertiesPanel's old "Presentation Mode" picker becomes a "Layout Template" picker with all five values for dialogTree, four for multiChoice (no chat-scroll — single-screen by design).
- SchemaFormGenerator skips any field with `ui.scope: 've-left'` so the layoutTemplate parameter doesn't double-render in the Inspector.

### MultiChoice in the Visual Editor

- Added `multiChoice` to WorkspaceView's `visualBeatTypes` allowlist (the "Visual Editor" tab wasn't showing at all for these beats).
- SchemaLocationInitializer skips the static 'choices' placeholder for multiChoice (matching movementChoice/dialogTree) and generates one button location per choice in both `initializeLocationsFromSchema` and `regenerateChoiceElements`. Buttons get `type: 'button'` (no spatial hotspot semantics).
- VE preview wires `dynamicChoices` + `layoutTemplate` through `SlotFlowView`, with a `(Add a choice to preview)` placeholder when the choices array is empty instead of the misleading "Play Again" endScreen fallback.

### Conversation template

- New responsive layout for short back-and-forth. Body card on one side of the stage, action panel on the other — readable as "NPC text ← → player choices" rather than "prompt above buttons".
- SlotFlowView root uses `flexDirection: 'row'` with `justifyContent: 'space-between'`. Body scroller caps at `clamp(280px, 50%, 560px)` so the NPC card sits on the left half (margin '0 auto 0 0') rather than floating mid-stage with a wide right margin. Action panel padding matches the body card's horizontal padding (`clamp(20px, 5vw, 48px)`) and buttons right-align inside it (`alignItems: 'flex-end'`).
- DialogTree-conversation routes through SlotFlowView with an inline slot spec (the dialogTree schema doesn't declare `layoutMode: 'slot'` itself — only the conversation template opts in via this runtime dispatch). Same body + action side-by-side layout per dialog turn.
- renderDialog skip-guard extended to dialogTree-conversation so the absolute prompt doesn't flash for one frame before the slot view paints.

### Stacked template polish

- Choice buttons stack VERTICALLY (alignItems control on `hasDynamicChoices`) instead of laying out as a horizontal toolbar at the stage bottom. System-action rows (Continue, restart+credits) keep horizontal flex.
- Body sits at natural height in stacked + dynamic-choices mode (`flex: '0 1 auto'`) so the action row follows directly below the prompt instead of being pushed to the stage bottom with a void in between.

### Chat-bubble for MultiChoice

- MultiChoiceBeat sets `presentationMode='chat-bubble'` (and clears chat history, sets playerName) when layoutTemplate is `'chat-bubble'`, `'positioned'` otherwise — so a prior chat beat doesn't strand the renderer in chat mode.
- VE preview detects layoutTemplate ∈ {chat-scroll, chat-bubble} for multiChoice and renders ChatDialogView directly in the slot preview — same component PW uses, editor matches runtime.
- `getBeatContent` grows a multiChoice case so the speaker / question flow into the chat message (`text` mirrors `question` for ChatDialogView, which keys off `content.text`).

### Custom template — phase 1: 3×3 anchor picker

- VisualPropertiesPanel adds a "Slot Positions" section when multiChoice + custom is selected. Two slots — Question, Choices — each with a 3×3 grid (top-left → bottom-right). Click a cell → writes `slotIntent[slot].anchor.{h, v}`. The speaker label rides along with the question; no separate picker.
- SlotFlowView supports custom positioning: when `layoutTemplate === 'custom'` and a slot has anchor.h or anchor.v set, the slot wrapper becomes `position: absolute` and pins to one of the 9 stage zones (`clamp(16px, 4vw, 48px)` inset; center/middle via `translate(-50%, …)`).
- Slide-in animation on the action panel is suppressed when custom-positioned — its keyframe `transform: translateY(0)` was clobbering the centering `translate(-50%, -50%)` so center-center wasn't actually centered.
- The action panel in stacked/custom uses `alignSelf` based on `actionAnchor.h` (with `alignItems: 'stretch'` inside) so left/right actually shift the whole panel instead of just nudging buttons inside an edge-to-edge container.
- Body card narrows to `clamp(280px, 45%, 520px)` when bodyAnchor.h is set — wide enough to read, narrow enough that "left" vs "right" looks like a position change instead of being absorbed by READABLE_MAX_WIDTH (760).
- MultiChoiceBeat round-trips `slotIntent` + `slotAnimations` through `get/updateParameters`.

### Responsive routing — project flag is authoritative

- PreviewWindow + StoryPreview push the resolved `projectLayoutMode` into renderer state at startup.
- ReactRenderer's `renderDialog` skip-guard and `renderChoices` slot-mode dispatch treat "author positioned" as `false` for slot/spatial beats in responsive projects. Leftover baked locations from a prior fixed-mode session no longer strand the runtime on the absolute path.
- VisualWorkspace's element loader skips the schema default location bake for slot/spatial beats in responsive projects (was re-baking what the fixed→responsive migration had just cleared, and re-stranding the beat).
- VisualWorkspace's `isSlotPreview` / `isSpatialPreview` gates the `!beatHasAuthorLocations` check on the project mode — in responsive projects the schema declaration is authoritative; in fixed projects baked positions still win (so dialogTree's legacy positioned variant continues to render as authored).
- SchemaLocationInitializer adds a multiChoice branch to `getDefaultTextForLocation` so the question field actually picks up `params.question` (was falling through to undefined; empty NPC textbox in fixed mode).

### Beat palette reorganization

- Picker tree restructured around the new taxonomy: Single Choice / Multi Choice / Timed / Logic, with sub-groups. AI pills and mobile/sensor badges (📱) where applicable.
- MultiChoice slots into the new "Multi Choice → Buttons" sub-group as the no-frills baseline. DialogTree stays as the multi-turn back-and-forth.
- AI prompt templates teach the model about MultiChoice as the new default for "ask N things on one screen".

**Files modified across this release:**
- `beat-definitions/core-beats.json`, `packages/core/src/generated/beat-types.ts`
- `packages/core/src/beats/Beat.ts`, `MultiChoiceBeat.ts`, `DialogTreeBeat.ts`, `BeatRegistry.ts`, `BeatTypeRegistry.ts`
- `packages/core/tests/beats/MultiChoiceBeat.test.ts`
- `packages/renderer/src/components/SlotFlowView.tsx`, `PositionedBeatView.tsx`
- `packages/renderer/src/renderers/ReactRenderer.tsx`
- `packages/builder/src/components/visual/VisualWorkspace.tsx`, `VisualPropertiesPanel.tsx`, `VisualBeatEditor.tsx`
- `packages/builder/src/components/Inspector.tsx`, `SchemaFormGenerator.tsx`, `WorkspaceView.tsx`
- `packages/builder/src/utils/SchemaLocationInitializer.ts`
- `packages/builder/src/pages/PreviewWindow.tsx`, `packages/builder/src/components/preview/StoryPreview.tsx`
- `packages/builder/src/services/prompts/dialogGeneration.ts`, `storyGeneration.ts`, `storyGenerationEnhanced.ts`

---

## 2026-05-26: Responsive layout — Fixed→Responsive migration completed end-to-end (v0.9.61)

### Overview

A heavy round of bug-fix work on the Fixed→Responsive migration path, the responsive character / sprite layer, and the spatial click flow. The v0.9.59 system shipped the surfaces (project-level layoutMode, bidirectional migrator, slot/spatial composition) but a real end-to-end test of a project authored in fixed mode — "Animation, dialogs and auto-advance" — surfaced ~15 distinct issues across the migration data path and the runtime renderer. This release fixes each one with a targeted commit, the cumulative effect being that a fixed-mode project with character animations, multi-segment sprite cycling, onClick path animations on hotspot clicks, prop-with-scale overlays, and authored hotspot rotation now migrates AND renders correctly in responsive mode.

Authors who already migrated projects on v0.9.59/0.9.60 may need to round-trip Fixed → Responsive once on this release to pick up the corrected migration output (most of the data fixes only take effect when the migrator runs).

### Fixed→Responsive migrator data fixes

The migrator was silently dropping its enrichment output in several places. Each line below was an independent bug:

- **`beat.parameters` is a getter, not a field.** The migrator was reading `(beat as any).parameters` which silently resolved to `undefined` on every Beat instance — `params.choices` was always falsy, so `transferHotspots` no-op'd despite the source `kind: hotspot` locations sitting right there in `baked`. Switched to `beat.getParameters()`.
- **App.tsx callsite only forwarded `locations` + `slotIntent`.** The migrator's enriched `parameters` (with `choice.hotspot` normalized 0–1 against the stage) and `animations` (with xPercent/yPercent siblings on waypoints) reached `updateBeat`'s caller, then got thrown away. Forwarded the full set including `slotAnimations`, `spatialAnimations`, and a top-level `animations` field (because per-beat `updateParameters()` implementations don't consume `animations`).
- **Read order bug for enriched animations.** Callsite read `next.animations ?? next.parameters?.animations`. The `??` never fell through because `next.animations` came from `{...beat}` and was the un-enriched original — so the engine always got pixel coords instead of the percent-aware waypoints, and the sprite visibly jumped from its static spot to wp0 the moment a triggered animation started.
- **Hotspot text-fallback.** Choices like `{text: 'door', locationName: '' }` lost their hotspot during migration because the matcher only checked `locationName` / `location`. Added a fallback chain mirroring fixed mode: explicit name first, then `baked.find(b.name === choice.text && b.kind === 'hotspot')`.
- **Bed rotation preserved.** Tilted hotspots (e.g. rotated bed at 44°) now survive the migration via `choice.hotspot.rotation`, rendered via a CSS `rotate(deg)` on the spatial hotspot button.
- **Prop scale baked into effectiveRect.** A prop authored with `scale: 0.4` was migrating to a `choice.hotspot` covering the FULL un-scaled rect (e.g. 600×300 instead of 240×120). Added `effectiveRect(loc)` that applies scale around the location's center; used for both the preserved character/prop location's percent fields AND the prop-derived choice.hotspot.
- **`fromProp` flag for prop-derived hotspots.** When the source location is a `kind: 'prop'` (visible asset rather than authored click region), the hotspot stays as a click target but the renderer skips the highlight fill + outline — the prop image IS the visual. The Gift prop no longer has an overlay orange rect.
- **`triggerName` on hotspot data.** The spatial click handler was passing the choice ID to `triggerClickAnimation`, but AnimationPath.triggerElementId references the LOCATION name (e.g. 'door'). Added `Hotspot.triggerName` (= `choice.locationName ?? choice.text`) so the matcher actually finds the path.
- **Array-shape fallback in migrator.** The Map-only branch silently no-op'd whenever locations arrived as Array (which the deserializer can do depending on call path).

**Files modified**: `packages/builder/src/utils/projectLayoutMigrator.ts`, `packages/builder/src/App.tsx`, `packages/core/src/utils/hotspot.ts`, `packages/renderer/src/renderers/ReactRenderer.tsx`.

### Responsive character / sprite layer fixes

- **Sprite frame size scales with container:stage ratio.** Fixed mode renders sprites at native frame size (e.g. 203×256) inside ScaledStage, which scales everything by `container.width / authored_stage_width`. Responsive was rendering the sprite at raw frame pixels — ~20% oversized in a typical viewport, which then shifted the visible-after-`scale(0.5)` center off the door/bed/kitchen. The fix derives `stageScale` from `loc.width / (loc.widthPercent / 100)` and multiplies `frameW × stageScale` for visualW.
- **`background-size` scales the sheet, not just the window.** With the frame-size shrunk, the sheet's natural-size backgroundImage was clipping the chosen frame at the new smaller div bounds. Both `backgroundSize` and `backgroundPosition` now multiply by `stageScale`.
- **`clientWidth` instead of `getBoundingClientRect`.** PreviewWindow wraps the stage in `transform: scale(fitScale)` for letterbox-fit. RCL was reading the bounding rect (post-transform), so its stageScale calc double-counted the outer transform — sprites ended up at ~70% of intended size. Switched to `clientWidth`/`clientHeight` (pre-transform layout box), matching what SpatialFlowView already does for `containerSize`.
- **Character layer anchored to `imgInsets`.** When the spatial image is letterboxed (image aspect ≠ container aspect), the character was floating mid-container instead of landing on the picture. Wrapped RCL in a div positioned at `top/left/right/bottom: imgInsets.*` so character coords are relative to the image rect — matching the hotspot layer.
- **Cycler cancel/restart bug.** The sprite-frame cycler useEffect depended on `animatedPositions`, which the engine mutates ~60Hz. Effect cleanup cancelled the rAF before any frame could advance — characters never cycled even when the engine was correctly reporting `spriteAnimation: 'walk'`. Read mutating state from refs, single rAF loop tied only to locations + resolver identity.
- **END-waypoint rule for spriteAnimation.** Author convention places sprite-animation names on the END waypoint of a segment ("walk while moving TO this waypoint"). PathInterpolator was using the START — off-by-one, so the first segment never cycled and the last waypoint's animation never played. Switched to END.

**Files modified**: `packages/renderer/src/components/ResponsiveCharacterLayer.tsx`, `packages/renderer/src/components/SpatialFlowView.tsx`, `packages/renderer/src/animation/PathInterpolator.ts`.

### Spatial onClick AnimationPath + state leak fixes

- **Spatial path now runs the onClick AnimationPath before resolving the choice.** Fixed-mode's PositionedBeatView awaits the click animation via `onTriggerClickAnimation`; the spatial path resolved immediately, so beat_4's door click never triggered the player walk-out. ResponsiveCharacterLayer now exposes a `triggerClickAnimation(triggerName)` imperative handle via forwardRef + useImperativeHandle; SpatialFlowView holds a `committedActionId` state that disables all hotspots while the animation runs, awaits the engine's onComplete, then calls onAction.
- **Per-beat key on SpatialFlowView / SlotFlowView.** React was reconciling the same component instance across beat transitions, so `committedActionId` from clicking the door in beat_4 stayed set in beat_5 (hotspots unclickable), and `animatedPositions` similarly leaked beat_4's final walk-out position + scale into beat_5. Added `key={beatId}` to all spatial / slot mount sites; full unmount/remount per beat fixes both leaks.
- **Triggered animation cleanup on unmount.** Triggers registered with the engine singleton are now stopped when RCL unmounts.

**Files modified**: `packages/renderer/src/components/SpatialFlowView.tsx`, `packages/renderer/src/components/ResponsiveCharacterLayer.tsx`, `packages/renderer/src/renderers/ReactRenderer.tsx`.

### Z-order + small polish

- **Beat_1 Continue button now stacks above the walking sprite.** The SlotFlowView flow action row was non-positioned; the character layer at `position: absolute; zIndex: 1` stacked above static siblings regardless of DOM order. Gave the action row `position: relative; zIndex: 5`.
- **Prop-derived hotspots render below author-drawn hotspots.** Sort so `fromProp: true` is FIRST in the DOM (earlier sibling = below in z-stack). A large prop-derived hotspot no longer blocks clicks on small author-drawn hotspots that overlap it (e.g. Gift covering bed/kitchen).
- **Hotspot `triggerName` matching.** ReactRenderer maps `choice.locationName || choice.text` onto the dispatched hotspot data.

**Files modified**: `packages/renderer/src/components/SlotFlowView.tsx`, `packages/renderer/src/components/SpatialFlowView.tsx`, `packages/renderer/src/components/ResponsiveCharacterLayer.tsx`, `packages/renderer/src/renderers/ReactRenderer.tsx`.

### Path-based animations for responsive mode (initial scaffold)

The first scaffold of path-keyframe animation support inside the responsive composite — `slotPath` / `spatialPath` types on the animation schema, percent-aware waypoint resolution, frame cycling for sprite-sheet characters. The bulk of the per-issue debugging above sits on top of this scaffold.

**Files modified**: `packages/renderer/src/components/ResponsiveCharacterLayer.tsx` (new component), `packages/renderer/src/animation/*`, `packages/core/src/types/animation.ts`.

### Debug instrumentation (added, then removed)

Two diagnostic passes landed during the debugging — `[migrator …]` / `[callsite UB …]` / `[useStoryBuilder UB …]` on the data side, `[RCL …]` / `[RR movementChoice→spatial …]` on the runtime side. Each commit listed the diagnostic at the top and the substantive fix below; final cleanup commit (`fac3d819`) strips all of them now that the migrations + runtime are settled.

---

## 2026-05-24: Responsive layout follow-through — generation paths, web export parity (v0.9.60)

### Overview

A focused follow-up to v0.9.59 that closes the last two gaps in the responsive layout system: **AI generation paths now default to responsive** (prompts updated, AI-injection explicitly stamps `layoutMode: 'responsive'`, MCP server prompt mirrors the same guidance), and the **HTML/web export now ships asset variants end-to-end** (the v0.9.59 Phase 3.3 feature was silently broken in exports because the player's variant resolver was never wired). No new authoring surface; this release just makes the existing v0.9.59 features actually reach the runtime via every path.

### Generation paths default to responsive

The v0.9.59 wizard makes Responsive the default for human-authored new projects, but AI-generated stories and MCP-driven generation needed the same treatment:

- **AI story-generation prompt** (`storyGenerationEnhanced.ts`): added a new "5b. Layout — responsive is the default" section right after the existing forbid on `locations`. Names the responsive mechanics positively so the model knows what TO emit: hotspot on choice/prop/dialog node (normalized 0–1 of the IMAGE rect), optional slotIntent for soft layout hints, optional per-button anchor for endScreen/aiSummary, optional hotspot.portrait override, optional Asset.variants (gated on explicit user ask).
- **MCP server prompt** (`mcp-server/src/utils/aiHelper.ts`): the same layout section in its terser format. Built `dist` regenerated.
- **AI-injection path** (`App.tsx`): stamps `globalSettings.project.layoutMode = 'responsive'` right after `createProject` runs. The `resolveLayoutMode` inference would already classify an AI-generated project as responsive (no beats carry baked locations), but the explicit write makes the Header badge land green from frame one and survives any future migration.

**Audited and confirmed no changes needed**: Twine + Ren'Py importers don't bake `locations`. `SchemaLocationInitializer` already has the schema-type-level skip-guard for slot/spatial beats. Blank-project `createProject` leaves `globalSettings` unset; the resolver infers `'responsive'` when no baked locations exist — correct.

**Files modified**: `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`, `mcp-server/src/utils/aiHelper.ts`, `packages/builder/src/App.tsx`.

### Web export parity — asset variants ship through HTML export

A devTools-style audit of the HTML export path turned up that the asset-variants metadata (orientation + device-class) was being written to exported ZIPs but never wired on the player side. Stories shipped the variant entries, but `setAssetVariantsResolver` was never called, so SpatialFlowView silently fell back to the base image. Three coordinated fixes close the loop:

- **Export side** (`projectZipManager.ts`): per-asset metadata JSON now folds `asset.variants` (lifted to the top-level Asset by the v0.9.59 Phase 3.3 loader fix) into the nested metadata bag the player reads. Belt-and-suspenders fallback to `asset.metadata.variants` so the storage round-trip's other shape is also captured.
- **Player load side** (`PlayerEngine.buildStoryAssets`): the JSON-metadata pass now parses each asset's `.json` file via the existing `assetResolver.getAsset` path, extracts `metadata.variants`, and caches it on the new `this.assetVariants: Map<baseId, variants[]>` field. Best-effort: a parse failure on one asset doesn't break the rest of asset loading.
- **Player resolver side** (`PlayerEngine.setupResolvers`): wires `renderer.setAssetVariantsResolver(...)` — mirror of the existing PreviewWindow / VisualWorkspace inline implementations. Pairs each cached variant's `assetId` with its URL from `assetMap` at lookup time. Undefined for assets without variants → SpatialFlowView falls back to the base image (the documented default).

All packages rebuilt; `packages/builder/public/player-web.js` now contains the variant wiring (verified via grep). Every future HTML export will embed the corrected player.

**Other features the audit confirmed already-wired and required no changes**: `OrientationGate` (orientation policy), `TimerHudDisplay` (fictional-time HUD), `theme.textBox` wiring, slot/spatial mode auto-selection per beat. The project-level `layoutMode` flag is editor UI metadata, not a runtime input — the renderer's per-beat `shouldUseSlotMode` / `shouldUseSpatialMode` checks are the load-bearing decision and they already work correctly across the export.

**Files modified**: `packages/builder/src/utils/projectZipManager.ts`, `packages/player/src/PlayerEngine.ts`, `packages/builder/public/player-web.js` (regenerated).

### User Guide updated

The `user-guide-qa` agent ran against `/docs/USER_GUIDE.md` for v0.9.59 and added coverage for: the Header layout-mode badge, the New Project wizard's Layout Mode + Orientation row, the per-button anchor pin row, the fictional-time HUD in the VE preview, orientation-aware spatial hotspot portrait overrides, the Asset Manager variants section, and the PreviewWindow viewport switcher. Five entries added to the Glossary, one to the FAQ. Five screenshots flagged for refresh.

**Files modified**: `docs/USER_GUIDE.md`.

---

## 2026-05-24: Responsive layout — project-level mode, full Phase 2/3 polish, asset variants (v0.9.59)

### Overview

A focused follow-up to v0.9.58 that completes the responsive layout system end-to-end. The headline is the **project-level `layoutMode` flag** (`fixed` vs `responsive`), which replaces v0.9.58's per-beat auto-detection with one explicit project setting + a bidirectional migrator. On top of that, Phase 2 closed the authoring loop (per-button anchor, AnimationPath legacy banner, new-project wizard) and Phase 3 added the three deferred items (fictional-time HUD in the VE preview, orientation-aware spatial hotspots with portrait override, iOS-style asset variants with orientation + device-class constraints). Responsive layout is still **WORK IN PROGRESS** in the "not yet battle-tested on real production projects" sense, but it is now functionally complete — authoring + runtime + variant resolution + migration all compose together.

The release also lands a batch of v0.9.58 follow-up fixes (chat-bubble responsive mode, dialogTree spatial speaker rendering, theme.textBox wiring in the responsive flow, spatial animation rest-state) plus the player-web 30s fetch timeout + ZIP magic-byte validation that resolves the endless-loading-on-bad-export class of bug.

### Phase 1 — project-level layoutMode (the spine)

Replaces the per-beat auto-detect heuristic with one project setting authors actually choose. `globalSettings.project.layoutMode: 'fixed' | 'responsive'` with `resolveLayoutMode()` inference for legacy projects (any baked locations → fixed; otherwise responsive). The Header surfaces a coloured badge so the active mode is always visible. A bidirectional migrator (`migrateFixedToResponsive` / `migrateResponsiveToFixed`) handles one-shot conversion — fixed → responsive clears baked positions and infers slot anchors; responsive → fixed bakes schema-resolved positions at the design width. PreviewWindow gained a viewport switcher (Fit / Desktop / Tablet / Phone) with a stable container across preset swaps so the SlotFlowView doesn't remount on every change.

**Files modified**: `packages/builder/src/utils/projectLayoutMode.ts` (new), `projectLayoutMigrator.ts` (new), `Header.tsx` (badge), `GlobalSettingsInspector.tsx` (picker + migrator UI), `PreviewWindow.tsx` (viewport switcher with stable container ref), `storage/types.ts` (`layoutMode` field).

### Phase 2 — editor gating + authoring polish

- **2.1 — VE speaker preview + element-add gating**: VE preview matches the runtime's `resolveSpeakerForSlot` so slot-mode dialog NPCs show their label there too; element-add buttons (Character / Prop / Text) are hidden when the beat is in slot/spatial mode (where adding pixel-positioned elements is meaningless).
- **2.2 — per-button anchor in slot-mode action row**: `SlotIntentEntry.buttonAnchors` lets authors pin individual buttons (Continue / Restart / Credits) to any stage corner while others stay in the shared flex row. Six preset glyphs (In row, TL, TR, BL, BC, BR) plus per-button gap slider in the slot-intent toolbar. Verified end-to-end via chrome-devtools.
- **2.3 — runtime collapse audit**: confirmed no silent-fallback paths exist; clarified the load-bearing comment on `renderPositionedBeat`'s `authorPositioned: true` default. Zero behaviour changes.
- **2.4 — AnimationPath legacy banner**: `AnimationPanel` now receives `projectLayoutMode` and surfaces an amber "Legacy path animation" hint when a responsive project still has an absolute-mode beat using the path-keyframe editor.
- **2.5 — new-project wizard**: `NewProjectDialog` collects Layout Mode + Orientation up front and applies them via `updateGlobalSettings` immediately after create. Verified by inspecting persisted `globalSettings.project` in IndexedDB.

**Files modified**: `VisualWorkspace.tsx` (speaker resolver + element gating + per-button anchor toolbar), `slotIntent.ts` (buttonAnchors field), `SlotFlowView.tsx` (anchored-button rendering with safe-area insets), `AnimationPanel.tsx` (projectLayoutMode prop + banner), `ReactRenderer.tsx` (comment clarification), `NewProjectDialog.tsx` (wizard fields + persistence).

### Phase 3 — deferred items, all three shipped

- **3.1 — fictional-time HUD in VE slot/spatial preview**: TimerHudDisplay now mounts as a sibling of SlotFlowView / SpatialFlowView in the VE preview when `hudOverlays.timerHud.enabled && hudOverlays.fictionalTime.enabled && fictionalTime.showInTimerHud`. Authors see WHERE the chip sits and HOW the initial fictional time renders under their chosen displayFormat. Verified: green "1 January 2024, 9:00 AM" chip at top-right of the TitleScreen preview matched the configured `datetime-12h` format over `initialTime: 2024-01-01T09:00`.
- **3.2 — orientation-aware spatial hotspot positions**: `Hotspot.portrait?` optional override + `resolveHotspotRect(h, isPortrait)` helper. SpatialFlowView detects orientation from container aspect (the same dimensions ResizeObserver / orientationchange already track) and resolves each hotspot rect before rendering. HotspotEditOverlay accepts `isPortrait` prop, renders + drags against the active variant, and forwards the orientation along onChange so the parent (VisualWorkspace) creates the portrait override on first edit. Verified: a hotspot with `portrait: {0.6, 0.6, 0.25, 0.25}` and canonical `{0.1, 0.1, 0.2, 0.2}` renders at 10/10/20/20 in Authored landscape and at 60/60/25/25 in Phone portrait.
- **3.3 — iOS-style asset variants (orientation + device class)**: `Asset.variants[]` declares other project assets as variants, each optionally constrained to an orientation and/or device class. `resolveAssetVariant` scores candidates iOS-catalog style (2 points for exact orientation match, 1 for deviceClass; contradicting constraints disqualify; ties go to first declared). SpatialFlowView picks at render time using container dimensions, so picture + Phase 3.2's hotspot variants stay in sync. AssetManager UI exposes per-image variants section. ReactRenderer + PreviewWindow + VisualWorkspace all wired with the variants resolver. Verified end-to-end: a portrait-variant.png paired against the TitleScreen tree image swapped automatically between Authored landscape (800×600 tree) and Phone portrait (600×1024 orange variant).
- **3.3 storage roundtrip fix**: end-to-end verification surfaced that `assetToStored` was dropping `Asset.variants` on save and `storedToAsset` + `App.tsx`'s inline asset construction weren't lifting `metadata.variants` back to the top level. All three sites now thread variants correctly so they survive the storage→load roundtrip.

**Files modified**: `core/utils/hotspot.ts` (portrait override + helper), `core/utils/assetVariant.ts` (new — type + resolver + detectors), `core/utils/index.ts` (exports), `renderer/components/SpatialFlowView.tsx` (orientation-aware hotspot resolution + imageVariants prop), `renderer/components/TimerHudDisplay.tsx` + `renderer/index.ts` (exported for VE use), `renderer/renderers/ReactRenderer.tsx` (backgroundImageVariants + setAssetVariantsResolver), `builder/components/visual/HotspotEditOverlay.tsx` (isPortrait routing), `builder/components/visual/VisualWorkspace.tsx` (HUD overlay + variants resolver inline + portrait routing), `builder/components/assets/AssetManager.tsx` (Asset.variants type + UI), `builder/pages/PreviewWindow.tsx` (variants resolver wiring), `builder/storage/AssetStorageAdapter.ts` (variants roundtrip), `builder/App.tsx` (assets-list variant lift).

### Bug fixes that landed alongside

- **Spatial enter animations now settle to centered rest state**: ken-burns / pan keyframes were ending at scale(1.1) translate offsets, leaving the image permanently shifted+zoomed. Inverted keyframes so they start drifted and settle at neutral.
- **PW stable container across viewport-preset switches**: the previous viewport switcher had two containerRef divs in conditional branches; switching presets unmounted the renderer's React root, blanking the stage. Unified into a single mount point with conditional styling.
- **Chat-bubble + chat-scroll responsive mode**: ChatDialogView gained a `responsive` prop (100%/100% layout, no ScaledStage wrapper) so dialog chat composes in responsive projects without the absolute-canvas math.
- **dialogTree spatial polish**: speaker renders as a label (not title), non-hotspot dialog choices surface as button-row dynamicActions, `showSpeaker` is honoured per-beat, choice.hotspot survives `migrateDialogTree`.
- **Theme wiring in responsive flow**: SlotFlowView honours `theme.textBox`, `theme.textboxFrameUrl`, `theme.colors.textAlpha`, and `theme.textEffects` (typewriter/fade) so themed projects don't lose their card backgrounds, frames, or text animations in slot mode.
- **Per-beat spatialFit toggle**: each spatial beat can override schema's default `contain` with `cover` (or vice-versa); control lives in the VE left sidebar under the background image picker.
- **Background fit moved from Inspector to VE left sidebar**: closer to where authors are looking when they pick the background.

### Player-web hardening (already on this branch from earlier)

- **30s fetch timeout** + **ZIP magic-byte validation** in player-web: a corrupt or HTML-served `.zip` (e.g. Vercel returning the SPA shell instead of the file) used to leave the player on an endless loading screen. Now times out cleanly after 30s and rejects non-ZIP responses with a clear error.

---

## 2026-05-20: Responsive layout + animations + hotspot map navigation (work in progress), plus durScreen/fictionalTime/dialogTree/counter fixes (v0.9.58)

### Overview

A substantial release split across two streams. The headline is the first ship of a **responsive layout + animation system** — slot-mode rendering for text-driven beats (no more giant-endScreen bug class), spatial-mode composition for image-backed beats (titleScreen + map-style movementChoice), a full enter/exit animation vocabulary on both layers (fade, slide, scale, ken-burns, pan), an inspector + visual hotspot editor for placing clickable regions on spatial images, and a11y compliance via prefers-reduced-motion. **This is a work in progress** — every responsive feature is opt-in per beat instance and ships behind zero-regression guards (any beat with author-baked `locations[]` keeps the absolute-positioning path untouched), so existing projects continue to render exactly as before. Authors who want to try the new system can opt in beat-by-beat.

The second stream is a batch of independent bug fixes and small features that landed alongside the responsive work — `durScreen` units-of-time bug, `fictionalTime` weeks unit silent no-op, `dialogTree` narrator-text-hijack, `endScreen` button overlap, character-scoped counters, and AI-generated story-variable import.

### Responsive layout system — Phase 1, 2, 2.5, 3 (work in progress)

The responsive layer is the first systematic answer to ASAPS's long-running giant-text and overflow bug class. The previous rendering path was uniformly-scaled absolute positioning: every authored beat's locations were translated through one `transform: scale()` that fit the 1024×768 design canvas into the actual viewport. This made title screens unreadably large on small phones, text overflow on landscape tablets, and impossible-to-place buttons on devices the author never tested. The responsive layer replaces that approach for visible beats that opt in.

- **Slot mode (`SlotFlowView`)**: renders OUTSIDE `ScaledStage`. Text is sized with `clamp(FLOOR, fluid, CEILING)` so it scales gently across viewports but can never cross a readability floor or comfortable-reading ceiling. Body region scrolls when content overflows at the floor; the action row stays pinned. Coarse-pointer floor raised for touch devices. Body has a readable-column max-width so lines don't run edge-to-edge on wide displays.
- **Spatial mode (`SpatialFlowView`)**: deliberately separates the image layer (uniformly scaled, hotspots map correctly via `objectFit:contain` math) and the flow layer (responsive text/buttons composited transparently over it). The split exists so text/buttons NEVER get uniformly scaled with the picture — the load-bearing reason slot mode exists.
- **Slot intent** (`slotIntent`): soft layout preferences per slot (preferredLines, anchor — horizontal/vertical alignment, edge-relative, gap). Visual-Editor managed; never serialized as baked `locations[]` (the no-bake guard preserves responsive mode). Override-visibility badges show when an authored preference can't be satisfied at the resolved viewport.
- **Orientation policy** (`flexible | portrait | landscape`): project-level setting; runtime overlay locks orientation on misalignment; VE viewport selector simulates phone/tablet portrait+landscape; explicit `orientationchange` re-resolve so hotspots track the new letterboxed rect immediately.

### Animation vocabulary on both layers

A complete intent-based motion vocabulary that survives reflow and orientation changes. NOT pixel-keyframed (that's the legacy `AnimationPath[]` system, which only works in absolute mode) — these animations are resolved against the slot's current box and the image's current rect, so a slide-in-from-left with distance 100 always slides from one slot-box away, on any viewport.

**Slot animations** (per-slot enter + exit on every slot/spatial beat):
- fade, slide-in-{left,right,top,bottom}, scale-in
- Distance as percent of slot box, threaded via `--slotflow-anim-distance` CSS var
- Exit on click for action beats (deferred parent advance), exit on timer for `durScreen`
- Replay + Test-exit buttons in the editor

**Spatial animations** (image-layer only, runs in parallel with slot exits):
- ken-burns, zoom-{in,out}, pan-{left,right,up,down}
- Intensity as % drift / scale delta
- 6000ms cinematic default for enters; 1200ms for crisper exits
- Cross-layer coordination: SlotFlowView's `onExitStart` callback fires the spatial exit at the same instant slot exits start; parent advance waits `max(slotMax, spatialMax)`

**Reduced motion**: `@media (prefers-reduced-motion: reduce)` collapses all animations to 1ms in CSS; `matchMedia` check in JS also skips the setTimeout exit wait so motion-sensitive users don't sit through invisible exits.

### Hotspot map navigation (Phase 3-3c)

Normalized 0–1 clickable regions on the spatial image, the 2D analog of `panoramaHotspot`. The picture-pixel-accurate math: hotspots position relative to the LETTERBOXED image rect, not the container — a hotspot drawn at (0.4, 0.3, 0.2, 0.1) lands on the same picture pixels at any viewport / orientation / device aspect ratio.

- **`movementChoice` spatial mode**: each choice can carry an optional `hotspot: { x, y, width, height, shape? }`. When ANY choice has one and there are no baked locations, the beat composes through `SpatialFlowView`; the rest of the choices stay clickable as well via standard fallback. Click → `onAction(choice.id)` → standard MovementChoice navigation.
- **Inspector controls** per choice: Add hotspot button (places a default-positioned rectangle), shape selector (Rectangle / Ellipse), coordinate readout, Remove. The choice itself is unaffected by hotspot operations.
- **Canvas editor** (`HotspotEditOverlay`): drag any hotspot to move; corner handles to resize on the selected one; click-drag on empty image area to draw a new rectangle (auto-attaches to the next hotspot-less choice, or creates a new placeholder choice); Backspace/Delete strips the selected hotspot; bidirectional hover link between canvas and inspector (hover a hotspot → its choice card lights up green, vice versa).
- **Two coordinate systems coexist**: the new normalized `choice.hotspot` (spatial) and the legacy `beat.locations` pixel-hotspot (absolute). Authors pick one per beat.

### Bug fixes (independent of responsive work)

- **`durScreen` standardized on SECONDS** (`f4521177`). The unit was implicit and inconsistent — schema documented seconds, runtime read milliseconds, AI emitted bare seconds the runtime then interpreted as ms. Timed screens flashed by in 3ms. Canonical unit is now seconds, legacy values > 60 auto-migrate (÷1000), new beats default to a word-count-derived suggested duration (min ~3s).
- **`fictionalTime` weeks unit** (`a8ffcfdc`). `advanceFictionalTime` had cases for hours/days/months but no `case 'weeks'` — weeks-unit advances were silent no-ops. Authors saw "time advances once then stuck." Fixed by adding the case + Inspector Weeks dropdown option + AI prompt rules.
- **`dialogTree` narrator-text hijack** (`aefa26e8`). A choice whose label contained "text", "dialog", or "npc" rendered the dialog narrative instead of the choice label — the text-element fallback branch was matching by substring without kind discrimination. Gated on `loc.kind !== 'button'`.
- **`endScreen` / `aiSummary` button overlap** (`41a47142`). Generic location-stacking placed restart and credits at the same x in the absolute renderer when both were present. Now side-by-side at `stageHeight - 100`.
- **Character-scoped counters** (`a58ce688`, `f356a00b`, `648916e8`). Counters previously had ambient global scope; the inspector and effects editor now expose owner selection (character or player), the schema-driven picker is unified, and the editor↔setVariable disconnect that prevented per-character counter seeding is fixed.
- **AI-generated story-variable import** (`22f250ec`). `mergeGeneratedVariables` was dropping the generated `variables[]` array when wiring an AI-generation result into `globalSettings`. Counters then "lost" their initial values on re-import. Now propagates correctly in both AI-injection handlers.

### Files modified

- **Core types/utils**: `packages/core/src/utils/slotIntent.ts`, `slotAnimation.ts`, `spatialAnimation.ts`, `hotspot.ts` (all new); `Beat.ts` (slotIntent / slotAnimations / spatialAnimations fields); `MovementChoiceBeat.ts`, `InfoTextBeat.ts`, `DurScreenBeat.ts`, `TitleScreenBeat.ts`, `EndScreenBeat.ts`, `AISummaryBeat.ts`, `OnlineContentBeat.ts`, `AIInfoTextBeat.ts` (persistence + render-state push); `duration.ts` (seconds canon)
- **Renderer**: `SlotFlowView.tsx`, `SpatialFlowView.tsx` (new flow / composite); `slotLayout.ts` (slot spec resolution); `ReactRenderer.tsx` (slot + spatial branches in renderPositionedBeat, spatial-routed `renderMovement`); `OrientationGate.tsx` (rotate-lock overlay)
- **Schema**: `beat-definitions/core-beats.json` (slot/spatial layoutMode + slots + spatialLayer descriptors, slotIntent + slotAnimations + spatialAnimations + hotspot params, schema versions 2.6 → 2.14)
- **Builder UI**: `VisualWorkspace.tsx` (slot/spatial preview branches, viewport selector, intent control panel, hotspot editor wiring); `SlotAnimationsEditor.tsx`, `HotspotEditOverlay.tsx` (new); `Inspector.tsx` (mode-awareness — hide Position/Z + path animations in slot/spatial, spatial-hotspot controls per choice, hover-link listener); `AnimationPanel.tsx` (mode-aware editor surface)
- **Bug-fix files**: `packages/core/src/engine/StoryContext.ts` (fictionalTime weeks), `packages/renderer/src/components/PositionedBeatView.tsx` + `DefaultLocationGenerator.ts` (button overlap), `packages/core/src/migration/effectsMigration.ts` (character-scoped counters), `packages/builder/src/services/aiInjection*.ts` (variable-import)
- **Generated**: `packages/core/src/generated/beat-types.ts` (regenerated multiple times to match schema versions)

### Status: responsive system is work in progress

The responsive layer is fully usable end-to-end for the beat types that have been converted, but:

- **Not all visible beat types are slot/spatial-mode yet.** Slot mode: endScreen, infoText, durScreen, aiSummary, aiInfoText, onlineContent. Spatial mode: titleScreen + movementChoice (the latter only when hotspots are configured). dialogTree, pickProp, hyperText, inputText, videoBeat continue in absolute mode for now.
- **No pulse/shake emphasis presets yet** — the trigger API design needs a real use case to drive it.
- **The Animations tab editor only surfaces enter/exit presets** — no per-slot keyframe authoring, no shared library, no project-level defaults.
- **Inspector mode-awareness is per-beat** — there's no global UI affordance that says "this project uses responsive layout"; authors learn the mode-awareness pattern from the inspector itself.

Everything that's shipped works correctly under viewport changes, orientation flips, and the prefers-reduced-motion preference. Existing absolute-mode projects are unaffected.

### Files modified

(See per-section file lists above.)

---

## 2026-05-13: Ideator sessions UI, AI runtime hardening, endScreen layout, craft rules (v0.9.57)

### Overview

A field-driven release. Started as a "Ideator should have a sessions UI" feature and an "add traits/variants prompt rule" craft fix, then a single test export of an AI-generated story surfaced five distinct rendering and runtime bugs in HTML exports that compounded each other — text overflowing buttons, buttons overlapping each other, an endScreen rendering 33% larger than the rest of the story, AI-runtime beats leaking raw JSON to the screen, and a choice label whose text happened to contain the word "text" rendering the dialog narrative instead. All fixed.

### Ideator: sessions UI + Markdown export

The IndexedDB-backed session store (`ideatorSessionStore.ts`) had been scaffolded in v0.9.53 but no UI ever called it — the User Guide added 2026-05-12 (v0.9.56) explicitly documented the absence ("transcript dies with the window"). This release wires it up.

- **`SessionsPanel.tsx`** (new) — modal listing past conversations newest-first, each row with timestamp, status badge (In progress / Has draft prompt / Handed off), turn count, first-user-message preview, and Load / Export / Delete actions. Click-outside-to-close.
- **`exportTranscript.ts`** (new) — pure-function Markdown serializer. Renders metadata header (created/updated timestamps, status), each turn as `**You:** … **Ideator:** …`, web-search chips as blockquotes, synthesized prompt + knobs (if reached). Filename slugged from first user message.
- **`useIdeator.persistCurrentSession`** — called at three save points: end of sendMessage, end of generatePrompt, on GENERATION_COMPLETE. Session ID generated lazily on first user message.
- **`loadSavedSession`** + **`startNewSession`** exposed from the hook.
- **IdeatorHeader** gained three buttons (History / Export / New) alongside the existing Reset.
- "Saving, resuming, and exporting sessions" section added to the User Guide; the v0.9.56 "Heads up — transcript dies with the window" note flipped.

### Story-gen craft rules: traits + variants required at rich tier

Two new anti-patterns in the rich-affect prompt, addressing real gaps observed in "The Weight of Late Light" (the v0.9.56 test generation): rich-tier output with **zero traits on any character** and **zero variants despite an explicit `bookmarkAffectState` naming a character transition**.

- **Traits required** — every character appearing in more than one beat MUST have at least 3 Big Five dimensions populated. Map description to traits explicitly ("disciplined, settled life" → high conscientiousness; "depressive silences" → high neuroticism). Use archetype presets or hand-tune. Without traits, runtime emotion-modulation is uniform across the cast and rich tier collapses into decorated-standard.
- **Variants required at bookmarked transitions** — if you emit `bookmarkAffectState` whose name describes a character state change (`after_disclosure`, `after_depressive`, `post_betrayal`), you must also define a variant on that character with a visibly distinct displayName, shifted initialMood, and at least one shifted initialSentiment — plus a `setCharacterVariant` Effect at the transition.

Mirrored to both MCP server copies (`mcp-server/src/utils/aiHelper.ts`, `mcp-server-desktop/src/index.ts`) per the existing duplicate-prompts arrangement.

### HTML export runtime: three independent layout/rendering bugs

The same test export ("The Weight of Late Light", 38 beats, rich affect) reproduced three problems on the deployed HTML player that the in-app Preview Window did not show. Field reports plus chrome-devtools inspection traced each:

1. **`calculateSmartTextBoxDimensions` charWidth = 0.42** (`PositionedBeatView.tsx:116`). The smart-sizing math estimated 0.42 × font-size for character width — same number the v0.9.55 builder fix had already corrected to 0.58 in `SchemaLocationInitializer`. The runtime kept the old value, so for the twine theme's Courier monospace at 18px, the renderer estimated ~79 chars/line when reality was ~55. Auto-grown text boxes ended up sized for 10 lines of content that actually needed 14, and the overflow rendered on top of the action button. Fixed to 0.58.
2. **Credits + Restart button overlap** (`DefaultLocationGenerator.ts:142`). The button-placement branch had explicit cases for `restartButton` (fixed at `stageHeight - 120`) but `creditsButton` fell through to a generic stack at `currentY` (right under the text). Both ended up centered at the same x. Now placed side-by-side at `stageHeight - 100`: restart on the right (primary action), credits on the left.
3. **`message` location fontSize = 24** (`DefaultLocationGenerator.ts:22`). `LOCATION_TYPE_MAP.message` had a legacy 24-px default — sized for "The End." placeholder messages but a third bigger than the body-text `text` location (18). AI-generated literary endings with full paragraphs rendered visibly oversized vs the surrounding story and triggered the smart-text-box to grow into a 921×631 monster fighting both buttons. Dropped to 18 to align with body text.

### AI runtime beat parser hardening

The same export surfaced an aiInfoText beat rendering as **raw JSON** in the player — `{"text": "...", "suggestions": [...]}` blocked on screen with no prose. Two compounding causes, both fixed:

- **`WebAIProvider.generateContent` had no reasoning-model headroom** (`packages/player-web/src/WebAIProvider.ts`). AIInfoTextBeat asks for `maxTokens: 250` (sized for the requested 2-3 sentences). On reasoning models (GPT-5, Kimi-K2, o1/o3), the hidden `reasoning_content` consumes that budget entirely, returning truncated JSON. Mirrored the v0.9.54 PreviewWindow shim: `effectiveMaxTokens(model, requested)` floors reasoning-model budgets at 4096 tokens, leaves non-reasoning models untouched. The shim lives inline (with its own `isReasoningModel` substring detector) so player-web doesn't take a cross-package dependency on builder's `openai-utils`.
- **`AIInfoTextBeat.generateText` leaked raw response on parse failure** (`packages/core/src/beats/AIInfoTextBeat.ts`). The previous parser had two failure paths — "no JSON match" and "JSON.parse threw" — both of which set `text = rawResponse` and rendered raw braces to the user. Two-stage extraction now: stage 1 full JSON.parse, stage 2 tolerant regex on `"text"\s*:\s*"((?:[^"\\]|\\.)*)"` to salvage the field even from truncated JSON, then `fallbackText` if even that fails. Under no path does raw JSON reach the screen.

### Dialog-tree button rendering: text/dialog/npc false-positive

A field report showed a `dialogTree` beat where the third choice rendered as the dialog narrative instead of the choice label. Traced to `PositionedBeatView.tsx:4977` — the text-element fallback branch matched any location whose name contained the substrings "text", "dialog", or "npc" and returned `content.text`. The third choice's text was *"Say no, warmly. Tell him you'll be asleep, and to text you the score with the first coffee."* — the word "text" inside the choice label hijacked the branch. Gated the keyword fallback on `loc.kind !== 'button'` so explicit-kind buttons take the choice-label path correctly; the legacy fallback still applies to unkinded text/dialog elements.

### Progress estimate updated in Ideator handoff progress strip

`PromptPreviewPanel`'s "This usually takes 30-90 seconds" line — accurate when the only generator was GPT-4-class with default reasoning — has been wrong for over a year. Now reads "1-3 minutes; long, complex, or reasoning-heavy runs (high/xhigh/max effort, GPT-5 / Claude Opus / Kimi K2) often take 5-10+ minutes. Feel free to leave this window open." User Guide section matched.

### Files modified

- **Ideator UI:** `packages/builder/src/components/ai/ideator/SessionsPanel.tsx` (new), `exportTranscript.ts` (new), `useIdeator.ts`, `IdeatorHeader.tsx`, `PromptPreviewPanel.tsx`, `packages/builder/src/pages/IdeatorWindow.tsx`
- **Craft rules:** `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`, `packages/core/src/prompts/affectPrompt.ts`, `mcp-server/src/utils/aiHelper.ts`, `mcp-server-desktop/src/index.ts`
- **Runtime layout:** `packages/renderer/src/components/PositionedBeatView.tsx` (smart-sizing charWidth + dialog text-element gate), `packages/renderer/src/utils/DefaultLocationGenerator.ts` (button placement + message fontSize)
- **AI runtime:** `packages/player-web/src/WebAIProvider.ts` (effectiveMaxTokens shim), `packages/core/src/beats/AIInfoTextBeat.ts` (two-stage JSON salvage)
- **Docs:** `docs/USER_GUIDE.md` (Ideator section, time estimate)
- **Generated:** `packages/core/src/generated/beat-types.ts` (schema 2.2 → 2.3 — restartConnection alias, fictional-time setVariable updates)

### Deferred to follow-up

- **Per-machine vs per-project session scoping for Ideator.** The session store has a `projectId` field and IDB secondary index; current UI lists all sessions across projects (rationale: Ideator's output creates new projects on handoff, so binding to whatever's open doesn't match the feature). If per-project filtering becomes useful, the index is ready.
- **Auto-resume most-recent session on Ideator open.** Considered, rejected as too surprising. Resume is explicit via the Sessions panel.

---

## 2026-05-12: HTML export endless-loading fixes — Rocket Loader opt-out, folder-mode placeholder bug, runtime hardening (v0.9.56)

### Overview

A targeted bug-fix release driven by a field report: HTML exports deployed to web servers were producing endless loading screens. Investigation surfaced three independent failure modes — two in the exporter, one in the runtime player — all of which could mask each other depending on the deployment. The release fixes all three so the symptoms can't co-occur in the same export.

### The bugs (and fixes)

**1. Folder-mode export was leaking literal `{{TTS_CONFIG}}` into the HTML** (`4a867c08`).

`exportAsFolder()` only ran 9 of the 12 `.replace()` calls that the HTML template requires. The unreplaced `{{TTS_CONFIG}}`, `{{TTS_LANGUAGE}}`, and `{{SHOW_SESSION_LOG}}` placeholders were emitted verbatim into the inline `window.ASAPS_CONFIG = {…}` block, producing `Unexpected token '{'` when the browser parsed the page. `ASAPS_CONFIG` was therefore never assigned, and every downstream access threw `Cannot read properties of undefined (reading 'mobileScalingMode')`. Single-file mode was unaffected — it has all 12 replacements wired up correctly. The fix adds the missing `ttsConfig` JSON construction (mirroring the single-file branch) and the three missing replacements.

**2. Cloudflare Rocket Loader was rewriting the inline scripts** (`4a867c08`).

On Cloudflare-fronted sites with Rocket Loader enabled (a common default optimization), inline `<script>` tags get rewritten and asynchronously reordered. For our export this had two effects: the large `window.ASAPS_CONFIG = {…}` object literal got mangled into a parse error, and the base64-data-URL player bundle loaded before the config script, so even when the config did execute, the player ran first and saw `ASAPS_CONFIG` undefined. Added `data-cfasync="false"` to all 9 `<script>` tags in the export templates — Cloudflare's documented opt-out. This is harmless on non-Cloudflare deployments.

**3. Runtime player hung silently on bad zip downloads** (`5f135fbd`).

When the URL-fetch branch in `player-web` received a non-zip response (e.g. an HTML SPA fallback page when the zip path is wrong, or a slow/incomplete download), `JSZip.loadAsync()` either threw a vague error or hung indefinitely. Added two defenses: a 30-second AbortController-based fetch timeout, and a ZIP magic-byte check (`PK` / `0x50 0x4B` at offset 0) on the received ArrayBuffer with a specific user-facing error message — "server returned an HTML page instead of the zip" when the first byte is `<`, with a hex preview of the first 16 bytes otherwise.

### Files modified

- `packages/builder/src/export/HtmlExporter.ts` — folder-mode replacements, `data-cfasync="false"` on all 9 script tags in both templates
- `packages/player-web/src/WebPlayer.tsx` — fetch timeout, ZIP magic-byte validation, specific error messages

### Deferred (filed for follow-up)

Two related improvements were scoped into the original bug report but deferred to keep this release focused:

- **Content-Type validation surface** — when the magic-byte check fails AND `Content-Type` is `text/html`, give the user a specific actionable error with server-config guidance (nginx/Apache/Netlify snippets) for serving `.zip` files correctly.
- **Pre-export size warning for single-file exports** — embedded-base64 stories above ~25 MB choke Safari and OOM on mobile browsers. Detect this at export time and recommend folder mode with a one-click switch.

---

## 2026-05-11: Visual-first-impression pass — layout fixes for AI-generated stories, gpt-5.5 default, long-title handling (v0.9.55)

### Overview

A focused visual-quality release. People see before they think — AI-generated stories had layout problems that hurt first-impression credibility even when the content was fine. Six iterations of calibration on the title→text→button stack produced a layout that reads cleanly at preview scale. Plus: a Reset Layout button so existing beats can opt into new layout math without delete-and-re-add, the GPT default bumped to gpt-5.5, three follow-ups from v0.9.54 (Ideator system-prompt cleanup, variant naming rule, max effort tier), and long-title handling at both prompt and layout layers.

### Layout fixes (the visual-first-impression pass)

Six commits of iteration on AI-content-beat layouts (`onlineContent`, `aiInfoText`, `aiSummary`) and `titleScreen`. All live in `SchemaLocationInitializer.ts`. The AI doesn't emit positions for these beats — our default-position code computes them — so every issue was on our side, not in the AI output.

Net effect, compared to v0.9.54:

- **`autoSizeText` charWidth multiplier `0.42 → 0.58`** (`5fef9d05`). The 0.42 was a narrow monospace assumption that underestimated real proportional-font rendering, so titles like "How to Hold Someone" got sized to fit "on paper" but wrapped to 2 lines in the browser. 0.58 matches real fonts at our sizes; titles stop wrapping spontaneously.
- **TitleScreen `title` and `author` get visual-centerpiece width** (`5fef9d05`). Default to at least 75% of stage width so the hero element of the screen actually feels hero-sized.
- **OnlineContent / AIInfoText get `requireScrollToBottom`** (`5fef9d05`). The renderer's existing scroll-indicator + button-gate machinery handles long AI-fetched content gracefully; previously only `aiSummary` had this opted in.
- **Text-box height clamp fixed** (`785317f1`). The old formula `Math.max(height, Math.min(availableHeight, 400))` could overflow into the button area when autoSized came in big. New formula clamps to availableHeight as a hard ceiling.
- **Title→text gap calibration** (`785317f1`, `31d36161`, `86b4d77c`). Three rounds: started at +15 (felt like too much air), went to -5 (boxes overlapped), +8 (read as touching at scale), +24 (barely visible), settled at +50 (comfortable rhythm). Calibration history captured in code comments so the next contributor doesn't revisit this.
- **Button `minWidth 120 → 160`** (`14196057`). "Learn More" / "Continue" / "Play Again" were wrapping to two lines because autoSizeText's estimate didn't account for the renderer's actual button padding.
- **Action buttons moved `stageHeight - 150 → stageHeight - 100`** (`86b4d77c`). The text box ended up against the button while ~110px of dead space sat below the button; moving the button down 50px uses that space and brings the action closer to the visual stop point.
- **Reset Layout button** (`6445b106`). New `LayoutGrid` icon in the Visual Editor toolbar that re-runs `initializeLocationsFromSchema` on the current beat, with confirmation dialog and undo support. Without this, existing beats couldn't opt into new layout math — they'd be stuck on whatever positions were saved at creation time.

### Long-title handling

Two-pronged (`d1fc7281`):

- **Primary (prompt-side)**: `storyGenerationEnhanced.ts` now explicitly tells the AI:
  - `titleScreen.title`: 2-5 words, ≤40 chars
  - `titleScreen.author`: ≤40 chars
  - `onlineContent.title`: 2-5 words, ≤35 chars
  With concrete short-and-good examples ("Bergen Transport", "Getting Around Bergen") and the offending long-title counterexample.
- **Defensive (layout-side)**: When the AI ignores the rule or emits a long title anyway, the title's font size auto-shrinks in 2px steps until the text fits the box inner width, down to a 14px floor. Short titles render at full size unchanged.

### GPT default model + Anthropic max effort tier

- **Default OpenAI model `gpt-5.2 → gpt-5.5`** across 8 callsites (`c9472504`). Verified per `developers.openai.com/api/docs/guides/reasoning` that GPT-5 reasoning levels are `none | minimal | low | medium | high | xhigh` — no `max` upstream, so the Claude-only label on our `max` tier is correct.
- **`max` reasoning tier exposed in UI** (`ea5d1aaa`). New option in the AI Config dropdown labelled "Max (Claude 4.5+ only)". Wired through 5 files. ClaudeProvider passes `max` through to adaptive mode unchanged; legacy `enabled`-shape models cap at xhigh's budget (32000). Default `max_tokens` for `max` effort = 128k since thinking spans are larger.
- **OpenAI defensive cap** (`c9472504`). If a user sets `max` globally and switches to an OpenAI provider, `OpenAIProvider.buildChatRequest` caps the effort at `xhigh` before sending so the request doesn't 400.

### Ideator follow-ups (the planned-work from v0.9.54)

- **System-prompt `projectTitle` removed** (`f3ccc12c`, `ea5d1aaa`). The visible "Shaping ideas for X" subtitle was removed in f3ccc12c; ea5d1aaa finishes the cleanup by dropping the model-side context line too. The conversation now has zero anchor to the open project's identity, which matches the fact that the generated story creates a new project on handoff (not modifying the open one).
- **Variant displayName uniqueness rule** added to `storyGenerationEnhanced.ts` (`ea5d1aaa`). Triggered by "How to Hold Someone" generating Sam's variant with `displayName: "Sam"` (identical to the base character name); the variant dropdown showed "Sam" twice with no visual distinction. New rule: every variant's displayName must be visibly distinct (e.g. "Sam (after disclosure)").

### Files modified

- `packages/builder/src/utils/SchemaLocationInitializer.ts` — six commits of layout calibration + font auto-shrink
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Reset Layout toolbar button
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Reset Layout handler wiring
- `packages/builder/src/components/ai/ideator/systemPrompt.ts` — projectTitle removal
- `packages/builder/src/components/ai/ideator/useIdeator.ts` — projectTitle removal
- `packages/builder/src/pages/IdeatorWindow.tsx` — projectTitle removal
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` — variant rule + long-title rules
- `packages/builder/src/services/providers/ClaudeProvider.ts` — max effort tier
- `packages/builder/src/services/providers/OpenAIProvider.ts` — gpt-5.5 default, max effort cap
- `packages/builder/src/services/providers/openai-utils.ts` — (carried from v0.9.54)
- `packages/builder/src/services/AIService.ts` — gpt-5.5 default
- `packages/builder/src/services/AIConfigDialog.tsx` — max effort dropdown
- `packages/builder/src/components/Header.tsx`, `hooks/useAI.ts`, `storage/types.ts`, `types/ai.ts` — reasoningEffort type widened to include 'max'
- `packages/builder/src/components/preview/StoryPreview.tsx`, `pages/PreviewWindow.tsx`, `components/export/HtmlExportDialog.tsx`, `export/HtmlExporter.ts` — gpt-5.5 default

---

## 2026-05-11: Kimi end-to-end, Claude Opus 4.7 thinking, story-gen craft rules (v0.9.54)

### Overview

A long session of fixes that took Kimi from "tool-loop stalls and JSON truncation" to fully working end-to-end (Ideator interview, story generation, AI runtime beats), got Claude Opus 4.7 working with Anthropic's new adaptive-thinking API shape (legacy `thinking.type=enabled` was deprecated upstream between sessions), and tightened the AI story-gen system prompt with three new craft rules plus genre-gated mystery guidance.

No new user-facing feature in this release — every change either unblocks a previously broken AI path, makes a failure mode debuggable, or improves the craft of what the AI produces.

### Kimi end-to-end

- **Tool-loop `reasoning_content` echo** (`511bc77f`) — Kimi reasoning models include a `reasoning_content` field in tool-call response messages and reject the next request with 400 "thinking is enabled but reasoning_content is missing" if we don't echo it back. Forward when present.
- **`max_completion_tokens` per Moonshot docs** (`eb9fa9ad`) — `max_tokens` is deprecated on Moonshot's API for Kimi K2.x; switched detection so Kimi takes the same code path as GPT-5/o-series.
- **Tool-loop honours user `maxTokens`** (`bd3d8856`) — was hardcoded to 1500 which truncated mid-arguments-JSON on Kimi reasoning; now respects config with 8192 default. Added per-iter diagnostic logs on both providers.
- **Story-gen tool-loop diagnostics** (`988f52a0`) — duration, accumulated length, last 500 chars, configured max_tokens on JSON-parse failures so the next stall is debuggable in one screenshot.

### Claude Opus 4.7 compatibility

- **Adaptive thinking shape** (`bca3ab2b`) — Anthropic deprecated `thinking.type='enabled'` for Claude 4.5+ models in favour of `thinking.type='adaptive'` + `output_config.effort`. Detect by model-ID regex (`claude-{opus,sonnet,haiku}-{4-5+,5+}`) and emit the correct shape per model. Older models keep the legacy `budget_tokens` shape.
- **xhigh preserved** (`09f6af76`) — initial fix capped `xhigh` at `high`; per platform.claude.com docs the valid range is `low|medium|high|xhigh|max`. Saved lesson to feedback memory.
- **Effort-scaled max_tokens** (`e2085684`) — in adaptive mode thinking tokens count against `max_tokens` with no separate budget control. Scaled defaults: `xhigh → 96000`, `high → 64000`, `medium → 48000`, `low/none → 32000`. Truncation error rewritten to surface actual length + configured cap + thinking-eats-budget hint.

### Story-generation prompt craft (universal rules)

Added three new anti-pattern entries to `storyGenerationEnhanced.ts` (commit `b537d742`), motivated by a Kimi-generated story that had abrupt scene jumps, repeated information, and choices whose intent the next beat ignored:

1. **Hidden scene jumps via invisible beats** — when `setVariable`/`conditionBeat` connects two dialog scenes with different speakers or locations, require a 1-2 sentence transitional infoText.
2. **Restating information the player already learned** — escalate or complicate prior info, don't echo it with different wording.
3. **Choice text declares intent the next beat ignores** — a "let it go / drop the case" choice must produce a narratively distinct path, not just flip a flag while the next beat behaves identically.

### Story-generation prompt craft (mystery-gated)

- **Evidence-distribution rules for mystery / detective / thriller / crime / noir** (`a36d701b`) — genre-substring-matched. Evidence beats must distribute fragments across multiple discoveries; full reveal beat reserved for after at least two evidence beats and a path commitment; suspects don't confess the central secret on first meeting. Non-mystery genres see the prompt unchanged.

### Ideator improvements

- **Interview-loop tightened without disturbing Claude** (`5b7b37b0`) — dropped "err on the side of one more question" (which Kimi read as a hard rule and over-asked), added a recap-then-final-grounding-question pattern, added "do not loop on dimensions already covered" with explicit dimension list. Claude's 11-turn dimension-walking unaffected; Kimi's previous 13-turn loops should consolidate.
- **Synthesis maxTokens 4000 → 8000** (`b537d742`) — Kimi reasoning models can spend several thousand tokens on `reasoning_content` before emitting JSON; 4000 sometimes truncated.
- **Content-mapped length / complexity** (`8b985c39`) — replaced "default to medium" with content heuristics so multi-month / 3+ character / 4+ ending stories map to `long`, mental-health/relationships-foregrounded prompts map to `complex`.
- **Affect Depth in handoff form** (`fb71d339`) — `PromptPreviewPanel` was missing the affectDepth dropdown that `StoryGenerator.tsx` already had. Synthesizer now also emits an `affectDepth` field based on the conversation content (rich for emotional drama / mental health, sparse for puzzles/educational), pre-populating the form.

### Runtime AI fixes

- **Claude `generateContent` strips thinking blocks** (`0e5d0da0`) — the only Claude path that didn't, so AI Summary on Opus 4.7 rendered as title + empty box when extended-thinking-style `<thinking>` tags reached the renderer. Brought into consistency with OpenAI's path and Claude's other methods.
- **Runtime proxy endpoint resolves same-origin** (`b26850d2`) — the runtime AI adapter hardcoded `:3001/api/ai/...` which requires a separately-running `dev:api` server. Now mirrors OpenAIProvider's logic: same-origin `/api/ai/...` when on port 5173, `:3001` fallback otherwise.
- **Reasoning-model headroom at runtime** (`516491a5`) — `AIInfoTextBeat` hardcodes `maxTokens: 250` (fine for non-reasoning), but Kimi reasoning shared that budget with `reasoning_content` and the visible content arrived empty. Added an `effectiveMaxTokens(model, requested)` shim that bumps the floor to 4096 for reasoning models.

### Diagnostics

- **Per-iter tool-loop logs** on both providers (`bd3d8856`, `26ea87c6`).
- **Empty-content error message** distinguishes "model spent budget on reasoning" vs "connection dropped" (`b537d742`).
- **`max_tokens` decision log** at the start of every Claude story-gen call (`e2085684`).

### Architectural decisions filed for follow-up

Three planned-work memories saved during this session:

1. **Unify runtime AI adapter with builder AIService** — PreviewWindow's per-provider adapter duplicates AIService/provider classes; every quirk fix has to be applied twice. Today's runtime-proxy and stripThinkingBlocks fixes were both band-aids on this.
2. **Story variables/counters dropped on AI-gen import** — generated `variables[]` mixes booleans and numeric counters; ASAPS has global variables + character-scoped counters and no global counters concept. Long-term direction: have the AI tag counters with `ownerCharacter`. Justified by character-specific HUD use case and the "two characters with `health`" namespace collision.
3. **Don't guess at API field value ranges** (feedback memory) — saved after capping xhigh at high before checking the docs. Always WebFetch the provider's docs page before writing a mapping switch.

### Files modified

- `packages/builder/src/services/providers/ClaudeProvider.ts` — adaptive thinking, effort-scaled max_tokens, tool-loop maxTokens + diag
- `packages/builder/src/services/providers/OpenAIProvider.ts` — reasoning_content echo, tool-loop maxTokens + diag, story-gen failure diagnostics
- `packages/builder/src/services/providers/openai-utils.ts` — Kimi K2 added to max_completion_tokens detection
- `packages/builder/src/pages/PreviewWindow.tsx` — same-origin proxy endpoint, reasoning headroom, stripThinkingBlocks consistency
- `packages/builder/src/components/ai/ideator/systemPrompt.ts` — interview rules, content-mapped length/complexity, affectDepth synthesis
- `packages/builder/src/components/ai/ideator/promptSynthesis.ts` — synthesis maxTokens bump, affectDepth parsing
- `packages/builder/src/components/ai/ideator/PromptPreviewPanel.tsx` — Affect Depth dropdown
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` — three universal anti-patterns + mystery genre rules

---

## 2026-05-09: Ideator Conversational Ideation Tool + Character ID Clarity (v0.9.53)

### Overview

Two user-visible additions:

  - **Ideator** — a conversational ideation pop-out that interviews
    authors about a complex issue, optionally researches via Brave
    Search, then synthesizes a `StoryGenerationRequest` that flows
    through the existing AI generator. Built in collaboration with
    @ChidaluOC on a v0.9.33 fork; integrated into current main with
    the schema-driven pipeline + Cancel button + streaming intact.
  - **Character ID clarity** — UI fixes for two reported confusions:
    the Character Editor mislabeled `name` as "Internal Name" when
    the actual canonical reference is `id` (which the editor never
    showed), and the Inspector's sentiment-target autocomplete
    rendered options ambiguously in Chrome (looking like duplicate
    `elena` / `Elena` entries).

Plus the AudioManager async-Promise-executor lint fix that landed
during the Ideator merge process.

### Ideator (PR #2 — feat/ideator-integration)

@ChidaluOC's branch had been waiting at v0.9.33 for almost two
months with a single coherent commit ("completed first iteration for
user test"). The feature was authored in collaboration — concept,
brief and seed prompt by Hartmut Koenitz; implementation by
@ChidaluOC. Manual port preserved his architecture verbatim while
sidestepping all the v0.9.34–v0.9.52 churn between branches.

**Architecture** (he understood our existing patterns):
  - Pop-out window route (`#/ideator-window`) renders IdeatorWindow,
    mirroring PreviewWindow / DebugWindow
  - IdeatorWindowManager mirrors PreviewWindowManager /
    DebugWindowManager, including cross-window message contracts
  - Conversation runs through Claude with optional Brave Search
    tool-use; falls back to plain conversation when Brave key isn't
    set or active provider isn't Claude
  - Per-project session storage keyed by project id
  - Synthesizes a StoryGenerationRequest, posts back to main via
    SUBMIT_REQUEST wire message, hand-off flows through the existing
    handleStoryGenerated path (same validation, theme, auto-layout,
    schema-driven pipeline as the in-app Story Generator dialog)

**New (17 files, ~2,500 LoC additive):**

```
packages/builder/src/components/ai/ideator/
  IdeatorChat.tsx           — conversation transcript view
  IdeatorComposer.tsx       — input field + readiness signal
  IdeatorHeader.tsx         — pop-out header
  PromptPreviewPanel.tsx    — synthesized prompt review/edit
  braveConfig.ts            — API key storage helpers
  braveSearch.ts            — Brave Search API wrapper
  ideatorSessionStore.ts    — per-project session persistence
  ideatorStore.ts           — Zustand live conversation store
  idnPrinciples.ts          — IDN seed prompt content
  promptSynthesis.ts        — transcript → StoryGenerationRequest
  systemPrompt.ts           — Claude system prompt
  types.ts                  — shared types incl. wire-message contract
  useIdeator.ts             — orchestrator hook
  webSearchTool.ts          — Brave tool wiring for Claude tool-use
packages/builder/src/pages/IdeatorWindow.tsx
packages/builder/src/services/IdeatorWindowManager.ts
```

**Modified existing files (additive only — current v0.9.52 work
preserved):**
  - `types/ai.ts` — new tool-use types (ChatToolSpec, ChatToolCall,
    ChatWithToolsRequest, ChatWithToolsResponse), maxTokens? on
    ConversationTurnRequest
  - `services/AIService.ts` — generateConversationTurn / generateChatWithTools
    delegates
  - `hooks/useAI.ts` — same two methods exposed; neither toggles
    isGenerating (Ideator manages its own status so the conversation
    UI doesn't block other AI features in the main window)
  - `services/providers/ClaudeProvider.ts` — generateChatWithTools
    method with tool-use loop (max 5 iterations, sequential tool
    execution, echoes Claude's full assistant message before
    tool_result so Anthropic correlates ids, tool errors caught and
    forwarded to Claude as text). Plus `temperature` removed from
    all five Claude request bodies — newer Anthropic models reject
    it as deprecated, and extended thinking has always required it
    to equal 1 or be omitted. @ChidaluOC's branch had this fix; I
    dismissed it in PR notes ("our path still works") which turned
    out to be wrong on the model the user is actually running.
    Restored.
  - `services/providers/OpenAIProvider.ts` — maxTokens? on
    generateConversationTurn so Ideator's synthesis step can cap
    higher than 1000
  - `api/vite-ai-proxy.ts` — `/api/search/brave` route alongside
    our streaming proxy; gunzips Brave's compressed responses before
    forwarding (raw gzip would otherwise be misinterpreted as
    malformed UTF-8 by the browser)
  - `api-proxy.ts` (root) — same Brave route for non-Vite hosts
  - `Header.tsx` — "Ideate with Ideator" entry in the AI menu
    (positioned above Generate Story so the prompt-shaping flow is
    offered first)
  - `AIConfigDialog.tsx` — Brave Search API key field (independent
    of LLM provider; optional — Ideator falls back to chat-only when
    unset)
  - `App.tsx` — isIdeatorWindowRoute, handleIdeatorSubmit,
    handleOpenIdeator, useEffect subscribing to
    ideatorWindowManager.onSubmit
  - `tailwind.config.js` — `indeterminate` animation for the
    progress bar

**Two follow-up fixes during PR review:**

(1) **Cross-window back-channel recovery.** Hard-reloading the main
builder mid-flow (to pick up the temperature fix) lost the
IdeatorWindowManager's reference to the still-open pop-out. The
pop-out's window.opener survived (so SUBMIT_REQUEST flowed inbound
fine), but notifyGenerationComplete silently no-op'd because
`this.ideatorWindow` was null. Story generated successfully on the
canvas; pop-out stayed stuck on "Generating your story… 06:39".

Fix: in handleMessage, capture event.source as the pop-out reference
on every incoming message. Browser sets event.source to the actual
sender Window — exactly what postMessage needs to send replies. After
this, even a main reload doesn't permanently break the back-channel.

(2) **AudioManager async-Promise-executor lint blocker.** PR's
build (20.x) CI was failing on a pre-existing ESLint error in
`packages/renderer/src/audio/AudioManager.ts:925` — the
`new Promise(async (resolve, reject) => { ... })` anti-pattern.
Refactored to a plain async method body (same return type,
correct error propagation, no anti-pattern). Pre-existing issue
(introduced in commit d20c483c during the XR work), fixed here to
unblock the merge. Tag-triggered desktop builds don't run this lint
check which is why v0.9.50/.51/.52 shipped despite the latent issue.

**Compatibility notes vs current v0.9.52:**
  - Ideator calls `aiService.generateStory(request)` without `signal`
    / `onProgress` — both optional in v0.9.52, so this works fine
  - The schema-driven normalize/validate pipeline runs transparently
    on the synthesized story
  - Cancel button works during Ideator's final generateStory call
  - Ideator's per-project session store is independent of the main
    project's auto-save and IndexedDB persistence

### Character ID clarity (PR #3 — fix/character-id-clarity)

User reported the Inspector's "Toward (target)" autocomplete looked
like it was offering duplicate entries (`elena` + `Elena` stacked)
for a character with `id="elena"`, `name="Elena"`. Two compounding
issues, both fixed.

**Character Editor mislabeled `name` as "Internal Name".** The
actual canonical reference for a character is `id`, which the editor
never exposed. Authors saw `name: "Elena"` under a label suggesting
it was THE id, then got confused when the autocomplete showed
`"elena"` lowercase elsewhere.

`CharacterEditor.tsx` now adds a read-only ID field at the top of
the Basic tab (frozen because conditions, sentiment refs, AI prompts,
and saved-state snapshots all key off it; renaming would break
references). Renamed "Internal Name" → "Code Name" and clarified in
helper text that it's a separate, editable label distinct from the
ID.

**Inspector's `<datalist>` rendered ambiguously in Chrome.** Chrome
shows each option as a two-line entry: the option's value on top,
inner text below. With `<option value="elena">Elena</option>`
Chrome stacked them visually, making it look like two duplicate
items.

`Inspector.tsx` now expands the option's inner text to include
the role and (when name differs from id) the slug, so value and
label read as one descriptive line:

```jsx
<option value="elena">Elena (player character)</option>
<option value="iris">Iris (NPC)</option>
```

Only one datalist had this issue (sentiment-target-suggestions in
conditionBeat's sentiment block). The six other character-picking
spots are `<select>` elements which only show the inner text — no
ambiguity. Left those alone.

**The runtime was already tolerant** —
`packages/core/src/utils/characterRef.ts:resolveCharacter` resolves
any ref string against `id` first, then falls back to `name` /
`displayName` case-insensitively. So existing data works either way;
this release is purely UI clarification.

### Files modified

**Ideator integration (PR #2):**
- 17 new files under `packages/builder/src/components/ai/ideator/`,
  `packages/builder/src/pages/IdeatorWindow.tsx`,
  `packages/builder/src/services/IdeatorWindowManager.ts`
- `packages/builder/src/types/ai.ts`
- `packages/builder/src/services/AIService.ts`
- `packages/builder/src/hooks/useAI.ts`
- `packages/builder/src/services/providers/ClaudeProvider.ts`
- `packages/builder/src/services/providers/OpenAIProvider.ts`
- `packages/builder/src/api/vite-ai-proxy.ts`
- `api-proxy.ts`
- `packages/builder/src/components/Header.tsx`
- `packages/builder/src/components/ai/AIConfigDialog.tsx`
- `packages/builder/src/App.tsx`
- `packages/builder/tailwind.config.js`
- `packages/renderer/src/audio/AudioManager.ts` (lint blocker fix)

**Character ID clarity (PR #3):**
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/components/Inspector.tsx`

---

## 2026-05-09: Streaming Progress UI + ConditionBeat Sentiment Persistence (v0.9.52)

### Overview

Three reliability + UX improvements that round out the v0.9.51 schema
refactor and address gaps surfaced during testing:

  - **Streaming progress UI** (task #112): live "Generating… N chars"
    char counter in the StoryGenerator dialog, plus the operational
    win of warm connections that should eliminate the 504 timeouts
    seen with the buffered path on slow models.
  - **ConditionBeat sentiment field persistence**: Inspector showed
    empty Toward/Emotion fields on AI-generated sentiment conditions
    even though the saved debug had the correct values — `ConditionBeat.
    updateParameters` was the broken bridge.
  - **`updateAffect.effects` schema declaration**: silenced the
    AIValidator false-positive warning on every v0.9.45+ canonical
    multi-row affect bundle.

No new authoring features. The v0.9.51 architectural goal (one
schema-driven path) holds — these are bug fixes against gaps
discovered while exercising it on real AI generations.

### Streaming progress UI (commits 551a1df + 34b99e2 + 5be0b81)

Two real wins, only one of them visible:

**Operational (more important than the visible part):** The buffered
proxy path leaves the connection idle for minutes during reasoning
pauses; intermediaries (Cloudflare, our proxy, fetch defaults)
eventually decide it's dead and 504 the connection. With streaming,
content tokens flow continuously, the connection stays warm, and
the 504 class of failure goes away. Verified live on Kimi: 7,490
upstream chunks over 144 seconds in one test, all delivered without
a single timeout.

**Visible:** The Cancel-button area shows "Generating… 12,345 chars"
with the count ticking up live. Useful as a "yes, it's still working"
indicator during 30-90s generations.

**Architecture:**

  - **Vite proxy (`vite-ai-proxy.ts`)**: when request body has
    `stream: true`, route to `streamingProxyRequest` which opens an
    SSE connection to OpenAI/Claude, parses chunk frames inline,
    extracts the assistant's content delta, and forwards plain text
    content tokens to the client as chunked text/plain. Headers
    `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering:
    no` defeat downstream buffering.

  - **OpenAIProvider.makeProxyRequest**: detects `stream: true`,
    reads `response.body` via `getReader()` + `TextDecoder`,
    accumulates content, calls `onProgress(charsReceived)` per
    chunk. Wraps the assembled string in `{ choices: [{ message:
    { content } }] }` so downstream code is identical to the
    buffered path — schema-driven pipeline, JSON parse, normalize
    all stay unchanged.

  - **Plumbing**: `StoryGenerationRequest` gains
    `onProgress?: (chars) => void` alongside `signal`. AIService
    spreads the request through to providers. `useAI.generateStory`
    wraps the caller's onProgress with a 10Hz-throttled version that
    updates a new `generationProgress: number` state field.
    StoryGenerator dialog reads that field and shows the live
    counter.

  - **React 18 throttle**: state updates inside a tight async
    streaming loop get collapsed by React 18's automatic batching
    — chunks arrive dozens of times per second and the scheduler
    coalesces all setState calls into one. Throttle to 10Hz (one
    update per 100ms) gives React's scheduler enough breathing room
    between updates to flush actual renders.

**Direct API path** (Ollama, etc.) intentionally NOT switched to
streaming: local servers don't have the intermediary-timeout
problem the proxy was solving.

**Cheap version per task scope**: progress UI without incremental
JSON parsing. Per-beat live preview deferred — would need a
tolerant streaming JSON parser, beat-completion detection, and
graceful handling of mid-beat truncation. Worth doing separately
if there's appetite.

### ConditionBeat sentiment field persistence (commit 52f851e)

Concrete user report: an AI-generated sentiment conditionBeat had
the correct shape in the saved debug —

```
"conditionType": "sentiment", "character": "alex",
"sentimentTarget": "player", "sentimentEmotion": "trust",
"baseline": "initial"
```

— but the Inspector rendered Toward (target) and Emotion fields as
empty. Inspector reads from `localBeat.parameters?.sentimentTarget`,
saved beat HAD that key, yet Inspector saw undefined.

**Trace:** `App.tsx handleStoryGenerated` calls
`actions.addBeat(type, position, {id, name})` to create a fresh
ConditionBeat with no parameters, then `beat.updateParameters(params)`
with the post-pipeline shape including sentimentTarget at top
level. `ConditionBeat.updateParameters` handles `variableName`,
`value`, `operator`, `character`, `traitName`, `baseline` — but
DOES NOT handle `sentimentTarget`, `sentimentEmotion`, `moodAxis`,
or `emotionName`. Those fields stay undefined on the instance,
`getParameters()` returns undefined for them, Inspector renders
empty.

The constructor at line 116 handled all these correctly — but the
update path that the AI flow uses was missing them. Added the four
fields with the same direct-params-priority-over-conditionObj
pattern the existing code uses.

**Discovered scope creep, logged for later (#113):** ConditionBeat
has no instance fields at all for `goalId`, `goalStatus`, `variantId`
(characterVariant), or any XR-condition field (`targetLat`,
`targetLng`, `radiusMeters`, `beaconUuid`, `beaconRangeMeters`,
`permission`, `proximityMode`). Those condition types are silently
broken end-to-end: schema declares them, Inspector renders fields
for them, pipeline flattens them onto top-level params, but the
Beat class never learned to store them. Out of scope for this
release; tracked separately.

### updateAffect.effects schema declaration (commit b77eaf0)

v0.9.45 migrated `updateAffect` to a multi-row Effects[] shape via
ChoiceEffectsEditor, but the schema's parameter list never got the
`effects` declaration alongside the legacy single-row fields
(`moodValenceDelta`, `sentimentTarget`, `sentimentDelta`, …). AI
generations that emit the canonical effects array triggered
"Parameter 'effects' not defined in schema for beat type
'updateAffect'" warnings on every story.

Declared `effects: { type: array, required: false, ui: hidden }`
with description clarifying it's the v0.9.45+ canonical form.
ChoiceEffectsEditor handles editing — Inspector should not render
it as a raw textarea.

### Bonus: cleaner upstream error messages

Carry-over from late v0.9.51 testing (commit af7866b): both
OpenAIProvider and ClaudeProvider now read upstream error bodies
as text first, attempt JSON.parse, and fall back to clipped raw
text when parsing fails. CDN/Envoy 5xx errors with plaintext
bodies (e.g. "upstream connect error and disconnect/reset before
headers...") now surface as readable error messages instead of
"SyntaxError: Unexpected token 'u'".

### Files modified

**Streaming UI:**
- `packages/builder/src/api/vite-ai-proxy.ts` — streamingProxyRequest,
  SSE parser, timing diagnostics
- `packages/builder/src/services/providers/OpenAIProvider.ts` —
  streaming branch, accumulator + onProgress per chunk
- `packages/builder/src/types/ai.ts` — onProgress on StoryGenerationRequest
- `packages/builder/src/hooks/useAI.ts` — generationProgress state,
  throttled wrapper
- `packages/builder/src/components/ai/StoryGenerator.tsx` —
  live char counter in button text

**ConditionBeat sentiment:**
- `packages/core/src/beats/ConditionBeat.ts` —
  moodAxis / sentimentTarget / sentimentEmotion / emotionName in
  updateParameters

**Schema:**
- `beat-definitions/core-beats.json` — updateAffect.effects parameter

---

## 2026-05-08: Schema-Driven Normalize/Validate Pipeline + Cancel Button (v0.9.51)

### Overview

Architectural release. The peacemeal AI-input cleanup architecture from
v0.9.50 (four ad-hoc cleaners scattered across OpenAIProvider, AIService
×2, and App.tsx) is replaced with a single schema-driven
normalize/validate pipeline in `@asaps/core/normalize`. New beat types
and condition variants are now schema-only edits — zero pipeline /
flattener / validator code changes needed.

Plus a working Cancel button (was a non-functional placeholder),
robust 5xx error handling for upstream gateway hiccups, and a
schema-source-of-truth fix that resolved a long-standing problem
where the desktop app's API server cached stale schema.

This is intentionally a refactor + reliability release — no new
authoring features. The user-visible wins are: AI generation that
*always* produces correct condition shapes regardless of the model's
quirks, a Cancel button that actually works, clearer error messages
when OpenAI's gateway hiccups, and elimination of false-positive
validator warnings.

### The piecemeal-cleanup problem

By v0.9.50, four sites in the codebase tried to coerce raw AI output
into the canonical shape, each with their own hardcoded rules:

  - `OpenAIProvider.cleanupBeatParameters` — strip flat fields when
    nested condition exists, rebuild connections from choices
  - `AIService.transformBeatFormat` — flatten nested condition.* to
    top-level params
  - `AIService.cleanupBeatParameters` — strip top-level condition
    fields when nested still present
  - `App.tsx handleStoryGenerated` — yet another flattener with its
    own passthrough list, plus duplicate cluster auto-create

Adding a new condition type or aliasing a new param name meant
touching three or four of these. The v0.9.50 patches added `baseline`,
`sentimentTarget`, `sentimentEmotion`, etc. to two flatteners but
missed others; the `quantity` coercion needed its own bespoke pass.
This shape was unsustainable, and it was the user who flagged it.

### Phase 1: Schema metadata (commit 4891791)

Schema bumped 2.2 → 2.3. Additive only — no existing reader broken.

**New top-level `conditionTypes` registry** (16 condition variants):
variable, counter, counterCompare, timer, inventory, visitedBeat,
fictionalTime, mood, emotion, sentiment, trait, goal, characterVariant,
gpsProximity, indoorProximity, permissionGranted. Each entry declares:
required-field list, optional-field list, and per-canonical-name
aliases the AI commonly emits (e.g. `variable.aliases = { variableName:
['variable', 'left'] }`).

**`conditionBeat.nested.condition` block** declares the discriminator
(`type`), where it maps at top-level (`conditionType`), the registry
to consult (`conditionTypes`), and `flattenAll: true` /
`deleteAfterFlatten: true`. Drives the pipeline's flatten step.

**Per-parameter metadata** on individual params:
  - `addRemoveInventory.quantity.coerce: "primitiveToString"`
    (AI emits number, runtime needs `$var` strings, schema declares
    string — pipeline auto-coerces silently)
  - `inputText.variable.aliases: ["variableName"]` (AI's preferred name)
  - `conditionBeat.{trueConnection,falseConnection}.aliases:
    ["trueTarget"|"falseTarget"]` (AI's preferred names)

### Phase 2: Pipeline implementation in `@asaps/core/normalize/` (commit da33d6a)

Single module, three pure functions, no platform dependencies.

**`normalizeBeat(rawBeat, schema, options?)`** — operates on one beat:
  1. Flatten nested objects per the `nested` block, copying fields
     to top-level using the registry to know per-type valid fields,
     applying registry-level aliases (variable → variableName) IN
     PLACE on the nested object before flatten copies them up
  2. Apply parameter aliases (rename to canonical)
  3. Coerce primitive types per `coerce` metadata
  4. Fill schema-declared defaults for missing required params
  Returns `{ beat, changes[] }` for diagnostic logging.

**`validateBeat(beat, schema, refIndex)`** — schema-driven validation:
  - Required-param check (skipping nested-block fields after flatten)
  - Type-check post-coercion
  - Reference resolution against the story's RefIndex (characters,
    beats, assets, clusters)
  - Per-condition-type required-field check from `conditionTypes`
    registry (replaces the hardcoded map in AIValidator.ts)

**`normalizeStory(rawStory, schema, options?)`** — orchestrator:
  - `buildRefIndex` — collect ids from characters/beats/clusters/assets
  - `normalizeCharacter` — backfill editor-only fields (visual,
    states, defaultState, counters/inventory/tags/traits/goals,
    timestamps) so CharacterManager doesn't crash on first paint
  - `buildClustersFromBeats` — auto-create Cluster containers from
    per-beat `cluster` strings, with bbox computed from member beat
    positions and standard padding; skips clusters already declared
    on the story
  - Run `normalizeBeat` over every beat, then `validateBeat`
  Returns `{ story, report, errors, warnings, valid }`.

### Phase 3a: Wire AI generation entry point (commits d8b8c5a + 133c700)

`AIService.generateStory` now opens with a single `normalizeStory`
call before any legacy passes. The result is splatted back over the
response. Existing legacy cleaners now operate on already-normalized
data and are mostly no-ops.

**Deletions:**
  - `AIService.autoCoerceParameterPrimitives` (v0.9.50 special-case;
    fully replaced by schema's `coerce` metadata)
  - `App.tsx handleStoryGenerated` condition flattener — pipeline
    already lifted condition.* and ate `params.condition`
  - `App.tsx handleStoryGenerated` cluster bbox auto-create —
    pipeline produced `story.clusters`; App now just walks them
  - `App.tsx handleStoryGenerated` character normalize lambda —
    pipeline already backfilled `story.characters`

Net: −67 lines in App.tsx alone. The AIValidator's per-condition-type
required-field map (a hardcoded duplicate of the conditionTypes
registry, with stale field names like `axis` vs `moodAxis`) was
deleted entirely; the pipeline's `validateBeat` is the single source.

### Phase 3b: Extend pipeline to MCP + zip-import + project-load (commit 3d15fce)

`App.tsx loadStoryData` (the WebSocket-injection callback that
receives MCP-pushed stories from Claude Desktop) now runs
`normalizeStory` at the top, mutating the incoming story in place.
Cluster registration walks `story.clusters`. Character setter call
preserved (the setter is still load-bearing — without it,
`charactersRef.current` retains the previous project's characters
and `syncProjectData` writes those stale characters into the new
project, the v0.9.50 character-clobber bug).

`projectDeserializer.loadProjectData` (zip-import + IndexedDB load):
the hand-rolled 13-line character backfill block is replaced with
`normalizeCharacter` from `@asaps/core/normalize`. Beats are NOT
pipeline-normalized on project load — existing projects are either
post-pipeline canonical (saved through new generation flow) or
legacy (runtime tolerates both).

The single source of truth for "what does a normalized story shape
look like" is now `packages/core/src/normalize/`. All four entry
points (AI generation, MCP injection, zip-import, project-load)
share one path.

### Phase 4: Golden-file regression suite (commit 10f4620)

Three real AI-generated debug files captured during v0.9.50/v0.9.51
development, committed as fixtures and run through the pipeline with
shape assertions. Each fixture exercises a distinct scenario:

  - **kimi-counter-conditions.json** — Kimi K2 generation captured
    AFTER the pipeline ran. Conditions already flat, characters
    already backfilled. Pipeline must produce ZERO changes — proves
    idempotency on real-world canonical data
  - **gpt-sentiment-clusters.json** — Pre-pipeline raw GPT-5.5: 6
    nested sentiment conditionBeats, 3 characters lacking editor-only
    fields, no clusters declared. Exercises affect-stack flatten,
    character backfill, cluster auto-create
  - **gpt-mixed-flatten.json** — AI emitted SOME affect-stack fields
    at BOTH top-level AND nested. Pipeline must flatten without
    overwriting pre-existing top-level values

Per-fixture invariants: 0 errors, every conditionBeat post-flatten
(conditionType set, params.condition deleted), per-condition-type
required fields present (read from registry, generic across all 16
types), every character backfilled, idempotency.

25 new tests, all passing. Full normalize suite: 60 tests.

### Working Cancel button (commit 8d74128)

The Cancel button in the StoryGenerator dialog was disabled while
`isGenerating` was true. With OpenAI gateway flakiness, a stuck
generation could trap the user through 3 retry attempts × 10-minute
proxy timeout = 30 minutes of forced waiting.

`AbortSignal` plumbed through the stack: `StoryGenerationRequest`
gains an optional `signal` field; `AIService.generateStory` creates
a controller and threads the signal to providers; both
`OpenAIProvider.makeProxyRequest` and `ClaudeProvider.makeProxyRequest`
forward it to fetch; `IProvider.withRetry` recognizes `AbortError`
and rethrows immediately instead of waiting more attempts; `useAI`
exposes `cancelGeneration`; the button always-enabled, reads
"Cancel generation" while in flight.

### Robust 5xx error handling (commit af7866b)

When OpenAI's gateway returned a 503 with a plaintext body
("upstream connect error and disconnect/reset before headers..."),
our error handlers called `response.json()` on it, throwing
`SyntaxError: Unexpected token 'u'` instead of surfacing the actual
upstream message. Both providers now read body as text first,
attempt parse, fall back to clipped raw text.

### Schema-source-of-truth fixes (commits b27a2cc + f22282c + 4faa17c)

A long-standing problem surfaced when the new pipeline started
consuming the schema's metadata: there were FOUR copies of
core-beats.json scattered across the repo, drifting independently:

  1. `/beat-definitions/core-beats.json` (root, canonical)
  2. `/packages/builder/public/beat-definitions/...`
  3. `/packages/builder/dist/beat-definitions/...` (build artifact)
  4. `/apps/builder-desktop/builder/beat-definitions/...` (electron
     build artifact)

Plus the in-memory cache in the Electron desktop app's API server,
which had baked v2.2 schema during its previous launch.

Fixes:
  - public copy → symlink to root (Vite dereferences during build,
    so dist + electron-builder pick up canonical content)
  - `AIValidator.loadBeatSchema` now prefers the static file (which
    resolves through the symlink) over the API-server endpoint;
    API-server demoted to fallback for non-Vite hosts
  - Both `transformSchemaForAPI` functions (one in
    `packages/builder/src/api/server.ts`, one in
    `apps/builder-desktop/src/main/api-server.ts`) now pass through
    the v2.3 normalize/validate metadata: per-beat `nested`,
    per-parameter `aliases` / `coerce` / `references`, top-level
    `conditionTypes` registry. Previous transforms slimmed the
    schema to a hand-rolled allowlist that dropped everything new

### Validator nested-block awareness (commit 40338f7)

Final blocker found during live testing: the legacy AIValidator's
outer required-params loop didn't know about `nested`-block
semantics, so it errored "Required parameter 'condition' is missing"
on every post-pipeline conditionBeat — failing generation entirely
even though the actual condition data was correctly present at
top-level. Fixed by skipping any param whose name appears as a
nested-block key (the contract is now fulfilled by the discriminator
+ per-type required map, which the pipeline's validateBeat enforces).

### Files modified

**Core normalize pipeline (new):**
- `packages/core/src/normalize/types.ts` — shared types
- `packages/core/src/normalize/normalizeBeat.ts` — single-beat pipeline
- `packages/core/src/normalize/validateBeat.ts` — schema-driven validation
- `packages/core/src/normalize/normalizeStory.ts` — orchestrator
- `packages/core/src/normalize/index.ts` — module exports
- `packages/core/src/index.ts` — wire into core package
- `packages/core/tests/normalize/normalizeBeat.test.ts` (15 tests)
- `packages/core/tests/normalize/validateBeat.test.ts` (11 tests)
- `packages/core/tests/normalize/normalizeStory.test.ts` (9 tests)
- `packages/core/tests/normalize/goldenFiles.test.ts` (25 tests)
- `packages/core/tests/normalize/fixtures/{kimi-counter-conditions,gpt-sentiment-clusters,gpt-mixed-flatten}.json`

**Schema metadata:**
- `beat-definitions/core-beats.json` — v2.2 → v2.3 with conditionTypes
  registry (16 entries), conditionBeat.nested block, addRemoveInventory.
  quantity.coerce, inputText.variable.aliases, condition aliases

**AI generation pipeline (wire-in + cleanup):**
- `packages/builder/src/services/AIService.ts` — pipeline call,
  AbortController, autoCoerceParameterPrimitives deleted
- `packages/builder/src/services/AIValidator.ts` — per-condition-type
  map deleted, nested-block awareness, alias handling
- `packages/builder/src/services/providers/OpenAIProvider.ts` —
  signal threading, robust error parsing
- `packages/builder/src/services/providers/ClaudeProvider.ts` —
  signal threading, robust error parsing
- `packages/builder/src/services/providers/IProvider.ts` —
  AbortError short-circuit
- `packages/builder/src/types/ai.ts` — signal on StoryGenerationRequest
- `packages/builder/src/hooks/useAI.ts` — cancelGeneration
- `packages/builder/src/components/ai/StoryGenerator.tsx` —
  always-enabled Cancel button
- `packages/builder/src/services/__tests__/AIService.test.ts` —
  signal-wrapped request assertion
- `packages/builder/src/App.tsx` — pipeline wired into both
  handleStoryGenerated and loadStoryData; legacy flatteners deleted
- `packages/builder/src/utils/projectDeserializer.ts` — character
  normalize centralized to `normalizeCharacter`

**Schema serving:**
- `packages/builder/src/api/server.ts` — pass through v2.3 metadata
- `apps/builder-desktop/src/main/api-server.ts` — same passthrough
- `packages/builder/public/beat-definitions/core-beats.json` —
  symlink to root canonical

---

## 2026-05-08: AI Generation Fidelity Fixes (v0.9.50)

### Overview

Bug-fix release targeting AI story generation. Several fields the AI was
emitting — character definitions, sentiment / mood / baseline subfields,
cluster groupings, per-beat author notes — were silently dropped before
the project saved, leaving generated stories with empty Character
Editors, half-filled condition Inspectors, no cluster containers, and no
notes. Plus a translator-truncation fix for non-Latin scripts and a
schema-vs-AI type mismatch on inventory `quantity`.

This release intentionally keeps the patches narrow; the underlying
peacemeal-cleanup architecture (multiple flatteners + cleanups across
OpenAIProvider, AIService, and App.tsx) has been flagged for a
schema-driven refactor as the next planned task.

### AI character injection

`handleStoryGenerated` (the StoryGenerator-dialog generation path)
never called `setCharacters`, so `story.characters` from the AI
response was silently dropped. The downstream `syncProjectData` then
wrote whatever was in `charactersRef.current` — usually the previous
project's characters — into the freshly created project.

Symptoms: first generation in a fresh session showed an empty Character
Editor; subsequent generations showed characters carried over from
whatever project was loaded before. Both paths trace back to the same
missing setter.

Fix: normalize AI characters (mirroring the MCP path's `loadStoryData`)
and call `setCharacters(normalized)` before the createProject + sync
timer fires. Backfill editor-only fields (`visual`, `states`,
`defaultState`, `counters`, `inventory`, `tags`, timestamps) so the
Character Editor doesn't crash on `character.visual.defaultAssetId`.

### Affect-stack condition subfields

The AI emits `condition: { type: "sentiment", character, sentimentTarget,
sentimentEmotion, operator, value, baseline }` for sentiment-style
conditions. Two flattening passes (in `AIService.transformBeatFormat`
and again in `App.tsx handleStoryGenerated`) only copied the basic
fields (type, operator, value, character) to top-level params, then
deleted `params.condition` — losing `sentimentTarget`,
`sentimentEmotion`, `baseline`, and the rest.

Inspector then showed half-filled forms (Mara as the sentiment-holder,
operator and value populated, but Toward / Emotion / Compared-to
baseline empty). On save the truncated condition was unrecoverable.

Fix: extend both flatteners with a passthrough list covering
`baseline`, `sentimentTarget`, `sentimentEmotion`, `moodAxis`,
`emotionName`, `traitName`, `goalId`, `goalStatus`, `variantId`, plus
XR-condition fields (`targetLat`, `targetLng`, `radiusMeters`,
`beaconUuid`, `beaconRangeMeters`, `permission`), plus
`quantityCheck`/`compareSource` for inventory.

### Cluster auto-creation

The AI emits a `cluster: "Act II - The Morning After"` string per beat
to organize them in the graph. The builder needs Cluster container
objects in `state.clusters` for the GraphEditor to draw them — and
those were never being created. Beats sat with their cluster strings
unattached, no containers visible.

Fix: in `handleStoryGenerated`, group beats by cluster name, compute
the bounding box from post-layout positions, register one Cluster per
name (id = name verbatim, since GraphEditor compares strings).
Containers expanded by default, padded so member beats sit comfortably
inside.

### Per-beat author notes

The AI emits per-beat `notes: "AFFECT BOOKMARK …"` / `notes: "AFFECT
CHECK …"` annotations explaining its baseline and condition reasoning.
These never reached `beat.notes`. Now carried over via `updateBeat`.

### Inventory quantity coercion

Schema declares `addRemoveInventory.quantity` as `string` (since the
runtime accepts both `"1"` and `"$gold"`-style variable references),
but the AI naturally emits a number. Validation rejected this as a
type mismatch and failed generation entirely.

Fix: new `autoCoerceParameterPrimitives()` pass walks every beat,
looks up the schema, and coerces `number` / `boolean` values to
`string` when the schema declares `string`. Generic — covers future
similar mismatches without per-field carve-outs.

### AI validator: per-condition-type required fields

The validator's required-field map was a single flat list, regardless
of the condition type. Sentiment conditions need `character`,
`sentimentTarget`, `sentimentEmotion`; mood conditions need
`character`, `moodAxis`; goal conditions need `character`, `goalId`,
`goalStatus`; etc. The flat map was producing bogus warnings for
condition types that legitimately don't carry the listed fields.

Fix: per-condition-type required-field map covering all variants
(`inventory`, `mood`, `emotion`, `sentiment`, `trait`, `goal`,
`characterVariant`, `gpsProximity`, `indoorProximity`,
`permissionGranted`, `counter`/`variable`/legacy).

### EndScreen connection alias

The AI emits `connection` on EndScreens; the schema expects
`restartConnection`. Added `connection` as a hidden alias that
auto-maps to `restartConnection` so EndScreens with their restart
target authored as `connection` validate cleanly.

### Character normalization on import

Mirror the AI-path normalization on zip-import (`projectDeserializer`)
so that debug-file imports don't crash the Character Editor when the
file lacks editor-only fields.

### Translator truncation fix

`max_tokens=8192` truncated translations of long stories into Brahmic
/ CJK / RTL targets, producing mid-JSON `Unterminated string` errors
that masked the real cause. Bumped to 32768 and added explicit
`stop_reason` / `finish_reason` detection so the truncation surfaces
as a clear "translation truncated" error if it happens again.

### Files modified

**AI generation pipeline**:
- `packages/builder/src/services/AIService.ts` — `autoCoerceParameterPrimitives`,
  passthroughFields list in `transformBeatFormat`
- `packages/builder/src/services/AIValidator.ts` — per-condition-type
  required-field map; EndScreen connection alias
- `packages/builder/src/App.tsx` — character injection + normalize,
  cluster auto-create, beat.notes carry-over, condition passthrough fields

**Translation / import**:
- `packages/builder/src/export/StoryTranslator.ts` — max_tokens 8192 → 32768,
  truncation diagnostic
- `packages/builder/src/utils/projectDeserializer.ts` — character normalize
  on zip-import

**Schema**:
- `beat-definitions/core-beats.json` — `endScreen.connection` hidden alias

---

## 2026-05-06: XR v2 — IndoorLocationBeat + Multi-Location + Visual Editors (v0.9.49)

### Overview

Second-generation XR release. Builds on v0.9.48's substrate to ship the
IndoorLocationBeat, refactor both XR beats into multi-location form
(MovementChoice-shaped), and add dedicated Visual Editors for GPS maps
and indoor floor plans. Plus a string of in-flight fixes uncovered
during integration: HTML-export TTS-toggle leak, exported-HTML
first-beat picker, builder-side search-button discoverability, asset
modal blocker on every background/character/prop pick.

### IndoorLocationBeat

Indoor twin of GpsLocationBeat, also multi-location from day one. Each
location targets a Bluetooth beacon by UUID; the renderer draws on a
floor plan with per-location radius rings. Three modes match
GpsLocationBeat: `display`, `trigger-on-arrival`, `trigger-on-departure`.
Permission probe targets the `beacons` sensor and respects the
project's `onPermissionDenied` policy.

Initial v2-A shape: project-level venue with shared beacon list (UUID +
position). Refined later in this release (see "venue moves to the
beat" below) into a model where each beat carries its own floor plan
and each location carries its own (x, y).

**Authoring**:
- Beacon list editor in Settings → Location & XR with `Generate UUID`
  button for desktop testing without real hardware
- MockSensorPanel grows beacon-distance sliders so authors can
  simulate "you're 3m from Beacon A"
- Inspector beacon picker dropdown
- Tests: 14 covering parameter handling, modes, permission flow,
  radius defaulting, edge cases. Plus 6 multi-location tests
  (forwarding, target routing, effect application, default-target
  fallback, per-location radius override, getConnections exposure).

### Multi-location refactor (both beats)

Rewritten to mirror MovementChoice. Each location entry has:

- Stable `id` (used by renderer to identify which fired)
- Optional `name` (shown as marker tooltip / status label)
- Position (lat/lng for GPS, beaconUuid + x/y for indoor)
- Optional radius override (per-location > beat-level > project default)
- Target beat — where to advance when this location resolves
- Optional Effects bundle — full ChoiceEffectsEditor range (counters,
  mood nudges, emotion fires, sentiment changes, bookmarks, variant
  switches, reflections, goal-status flips)

The runtime resolves on first crossing in trigger modes; the renderer
reports the locationId, the beat applies that location's effects via
`context.applyEffect`, then routes to that location's target. Display
mode shows all locations and continues to a `defaultTarget`.

The graph editor now renders one outgoing edge per location, just like
MovementChoice's choices. Backward compatibility preserved — legacy
single-location params (targetLat/targetLng for GPS, targetBeaconUuid
for indoor) synthesize a one-element xrLocations array at runtime so
v0.9.48 stories keep working.

Internal field renamed `locations` → `xrLocations` to avoid clashing
with `BeatConfig.locations` (the legacy positioned-rendering Location[]
on the base Beat class).

### Visual Editors for both XR beats

`gpsLocation` and `indoorLocation` get a Visual Editor tab in the
workspace — same architecture as MovementChoice / Panorama / DialogTree.

**XRMapEditor (GPS)**:
- Leaflet-based, reuses the runtime tile layers + CSS reset
- Each location is a draggable marker with its radius circle
- Click empty map to add a location at click point
- "Add at centre" + "Fit all" toolbar buttons
- Auto-zoom-in on first walk; pan-follow when player drifts toward
  viewport edge; never overrides manual zoom
- "Recenter on me" Leaflet control (works in production XR too)

**XRFloorPlanEditor (indoor)**:
- SVG floor plan with the venue's image as backdrop
- Click empty floor to add location at click coords
- Drag markers to update each location's own (x, y)
- Top-left HUD shows count + floor dimensions

**Both editors**:
- No side panel — pure spatial canvas, no duplicated form fields
- Selection sync to Inspector via window CustomEvents:
  - VE marker click → Inspector row scrolls + highlights
  - Inspector row click → VE marker pans into view + selects
- Auto-name new locations as "Location N" (rename freely; subsequent
  adds skip taken numbers)
- New locations inherit project storyOrigin (no more landing in the
  Atlantic at lat=0/lng=0)

### Per-beat floor plan + per-location x/y (architectural refinement)

The initial v2-A indoor design lived entirely at the project level —
one floor plan, one set of beacon positions. That collapsed the moment
authors wanted multiple rooms or different scales per beat.

Restructured:

- **Beat parameters** add `floorPlanAssetId`, `floorWidthM`, `floorHeightM`.
  Each indoor beat is one physical space.
- **Each location entry** adds its own `x` and `y` (metres from
  top-left on this beat's floor plan). Visual position is now per-beat
  — the same beacon UUID can be drawn at different positions on
  different beats' floor plans, which actually matches real-world
  authoring intent.
- **Project venue settings** still exist as the fallback floor plan +
  dimensions for beats that don't override. Existing single-venue
  stories keep working unchanged.
- **Project beacon registry** stays optional — a list of `{uuid, displayName}`
  for picking from a dropdown. Position no longer lives there.

Inspector indoor block grows a "Floor plan for this beat" section at
the top: asset id picker (uses Asset Selection modal — pick existing
or upload new) + floor width + height in metres.

### HTML-export fixes (in-flight bugs surfaced during the v0.9.48
release week)

**TTS toggle now respected**: WebTTSService defaulted `enabled=true`
and never read the embedded config's enabled flag. Authors who toggled
TTS off in the builder header still got speaking voices in the
exported HTML. Three-spot fix: HtmlExporter writes the toggle as
`enabled: ttsEnabledFlag` into ttsConfig, dialog reads
`localStorage('asaps_tts_enabled')`, WebTTSService respects the flag
at construction. Default true for back-compat with old exports.

**Start beat now correct**: exported HTML always landed on the first
beat in the array instead of the configured `firstBeatId`. Two
compounding bugs:
1. `projectZipManager.serializeStory` wrote metadata.firstBeatId
   verbatim from the persisted project state. Many projects had the
   default '0' (no beat with that id), which PlayerEngine fell
   through to `beats[0].id` for. Fix: apply the same
   titleScreen-preferred auto-detect at serialize time.
2. PlayerEngine handled "metadata.firstBeatId is missing" but not
   "metadata.firstBeatId is set to a non-existent id". Added a
   defensive fallback through the same titleScreen path.

**"Start beat" dropdown in export dialog**: authors can pick which
beat the published story begins at, defaulting to whatever's currently
selected in the builder. Honours the choice for that one export
without touching persistent project state.

**Search button in builder header**: the search-and-replace panel was
reachable only via Cmd+F. Added a slate-grey Search button in the
upper-right toolbar that toggles the same panel — open state shows a
ring-2 highlight matching the Preview-Open pattern.

### Five compounding bugs in spatial-sound integration (already in
v0.9.48, but only surfaced in author testing this week — included
here so the troubleshooting trail is captured)

The spatial-sound path went through five layers of compounding bugs
before producing audible output:

1. **SensorService instance churn** — `StoryEngine.loadStory()` created
   a new MockSensorService on each context recreation. The renderer
   state and audio adapter stayed subscribed to the original; the
   panel and map talked to the new one. Walks landed on the new
   instance; the audio adapter was deaf. Fixed by passing the
   existing service through to the new context (`existingSensorService`
   constructor opt) so the engine reuses the same instance across
   context recreations.

2. **Distance model wrong** — PannerNode used `distanceModel:'inverse'`
   with `refDistance:1`, giving gain = 1/distance. At 50m the sound
   was -34dB (effectively silent). Switched to `'linear'` with
   `refDistance:5` for a predictable "full-volume bubble + linear
   fade to maxDistance" curve.

3. **Blob URL fetch failed** — `playSpatialSound` called `fetch(blobUrl)`,
   which fails intermittently in some Electron / dev-server CSP setups.
   Spatial path now accepts `Blob | string` and uses `arrayBuffer()`
   for blobs.

4. **Inspector load path missing read** — the load-init at line 833 of
   Inspector.tsx initialized `parameters.backgroundSound` but didn't
   initialize `parameters.backgroundSoundSpatial`. The
   SpatialPositionEditor reverted to "Off" on every beat re-select.

5. **Locale comma → period** — `<input type="number">` returns the
   locale-formatted string (`"51,50632"`) in some browsers; `parseFloat`
   reads only the leading "51", placing sound sources tens of
   kilometres away. Added `.replace(',', '.')` everywhere.

### Asset Modal blocker (general, not XR-specific)

The Asset Selection modal rejected every asset when invoked with
`'background'`, `'character'`, or `'prop'` types. The Inspector was
forwarding the local picker name verbatim with a misleading
TypeScript cast; the modal's `asset.type !== assetType` filter then
rejected everything (no asset has `type === 'background'`). Same bug
for character + prop. Mapped them to `'image'` (mirroring the existing
`'sound' → 'audio'` mapping). Also relaxed the `'background'` subtype
filter from JPG-only to "any image" so PNG floor plans qualify.

### "Indoor venue settings — what's still useful?"

Author question during the v2 architectural shift. Resolution: the
project-level venue stays useful as the **default** floor plan for
single-venue stories (museum, exhibition, escape room). When a beat
sets its own venue, it overrides. Beacons-as-physical-hardware
registry is still project-level (UUIDs + display names, no positions).

### Tests

- 28 XR beat tests (14 GPS + 20 indoor) all passing
- New multi-location tests: forwards locations, returns matched target,
  applies matched effects, default-target fallback, per-location
  radius override, getConnections exposes multiple targets
- Total core suite: 1,482 passing
- Per-beat-floor-plan migration verified — locations with beaconUuid
  but no x/y resolve via the project beacon registry one-time fallback

**Files modified (XR runtime)**:
- `packages/core/src/types/index.ts` — XRLocationEntry, IRenderer.renderIndoorMap
- `packages/core/src/beats/IndoorLocationBeat.ts` — multi-location, beat-level venue
- `packages/core/src/beats/GpsLocationBeat.ts` — multi-location, getConnections override
- `packages/core/src/engine/StoryContext.ts` — fix getGlobalSettings → getSettings
- `packages/core/src/engine/StoryEngine.ts` — preserve sensorService across loadStory
- `packages/core/tests/beats/{IndoorLocationBeat,GpsLocationBeat}.test.ts` — multi-location coverage

**Files modified (renderer)**:
- `packages/renderer/src/components/IndoorMapBeat.tsx` — per-location x/y
- `packages/renderer/src/components/MapBeatLeaflet.tsx` — multi-location
- `packages/renderer/src/audio/AudioManager.ts` — linear distance model, Blob | string source
- `packages/renderer/src/audio/sensorAdapter.ts` — bridge layer
- `packages/renderer/src/renderers/ReactRenderer.tsx` — renderMap + renderIndoorMap multi-location

**Files modified (builder — XR + visual)**:
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — XR dispatch, suppress noise logs
- `packages/builder/src/components/visual/XRMapEditor.tsx` (new) — Leaflet-based GPS visual editor
- `packages/builder/src/components/visual/XRFloorPlanEditor.tsx` (new) — SVG floor-plan editor
- `packages/builder/src/components/WorkspaceView.tsx` — visual-tab gating
- `packages/builder/src/components/Inspector.tsx` — XR custom block, floor-plan picker, target dropdowns
- `packages/builder/src/editors/XRLocationsEditor.tsx` — selection sync, auto-name, x/y inputs
- `packages/builder/src/components/preview/MockSensorPanel.tsx` — beacon distance sliders
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` — Beacons editor with Generate UUID
- `packages/builder/src/pages/PreviewWindow.tsx` — venueBeacons forwarding, sensor service seeding

**Files modified (export + general)**:
- `packages/builder/src/export/HtmlExporter.ts` — startBeatId, ttsEnabled
- `packages/builder/src/components/export/HtmlExportDialog.tsx` — Start beat dropdown
- `packages/builder/src/utils/projectZipManager.ts` — serialize-time auto-detect, override
- `packages/builder/src/components/Header.tsx` — Search button
- `packages/builder/src/components/assets/AssetSelectionModal.tsx` — relaxed background filter
- `packages/builder/src/App.tsx` — Search wiring, onUpdateVenueBeacons, availableBeats prop
- `packages/player/src/PlayerEngine.ts` — defensive firstBeatId fallback
- `packages/player-web/src/WebTTSProvider.ts` — respect embedded enabled flag
- `beat-definitions/core-beats.json` — indoorLocation entry, connectionType: multiple

---

## 2026-05-06: XR Substrate — GPS, Permissions, Map, Spatial Sound (v0.9.48)

### Overview

The first XR-capable release. Stories can now anchor to the physical world via GPS, gate beats on real-time proximity / permission state, render an interactive Leaflet map for "walk to here" beats, and place sounds at fixed lat/lng coordinates with HRTF spatial panning that updates as the player walks. All XR features land behind a SensorService abstraction with a desktop-authoring MockSensorPanel, so authors can test the geo / orientation pipeline without leaving their laptop.

This is a fat release — six feature commits and two fix commits since v0.9.47. Highlights:

- **GpsLocationBeat** with real OpenStreetMap tiles, target marker + radius ring, live player marker, recenter control, and three trigger modes (`display`, `trigger-on-arrival`, `trigger-on-departure`).
- **Three new Condition operators** — `gpsProximity`, `indoorProximity`, `permissionGranted` — synchronously evaluable from cached sensor reads, available everywhere Conditions are (ConditionBeat, choice requirements, MovementChoice).
- **DirectionalSound** — Sound objects gain an optional `spatialPosition` field; the renderer routes those through a Web Audio PannerNode with HRTF panning and linear distance falloff. Geographic mode (lat/lng with bearing recomputed live) and azimuth-only mode (fixed compass direction) both supported.
- **Location & XR settings tab** in Global Settings — origin, mock-location, default proximity radius, on-permission-denied fallback policy.
- **MockSensorPanel** in the PreviewWindow — N/S/E/W walk buttons, lat/lng inputs, orientation sliders. Drives the story's runtime state for desktop testing.
- **HTML export host wiring** — SensorService is also pushed into the standalone player's renderer state, so exported stories work in the browser too (with the WebSensorService backend that talks to navigator.geolocation).

### XR substrate (S1+S2): LocationSettings + SensorService

`SensorService` is the abstraction every XR feature depends on. Two concrete implementations:

- **WebSensorService** — production playback. Talks to `navigator.geolocation`, `DeviceOrientationEvent`, and the (still-experimental) Bluetooth Web API for beacons.
- **MockSensorService** — desktop authoring. Returns values seeded from project settings + runtime updates from the PreviewWindow's MockSensorPanel.

Capability detection picks one at engine construction time. Beats access the service via `context.getSensorService()`; they never construct their own. Cached-reading getters (`getLastKnownLocation`, `getLastKnownOrientation`, `getLastKnownBeacons`) make synchronous condition evaluation possible without awaiting promises mid-graph traversal.

`LocationSettings` was added to `GlobalSettings`: `originLat`, `originLng`, `defaultProximityRadiusM`, `mockLocation: { lat, lng, floor? }`, `onPermissionDenied: 'skip' | 'fallback'`, `fallbackBeatId`, `venue` (indoor floor plan). The Location & XR tab in Global Settings exposes all of these.

`StoryContext.getSensorService()` lazily resolves and caches the chosen service; the engine forwards `mockMode: true` from PreviewWindow so authoring contexts always get the mock.

### XR substrate (S3): Permissions + new Condition operators

Three new Condition types extended the existing condition system:

- **`gpsProximity`** — true when player is within N metres of a target lat/lng. Uses cached location reads; falls back to the project's `defaultProximityRadiusM` if the beat doesn't override.
- **`indoorProximity`** — true when player is within N metres of a beacon UUID. Same cache pattern, but reads from `getLastKnownBeacons()`.
- **`permissionGranted`** — true when a sensor permission (`gps`, `camera`, `orientation`, `beacons`) is in 'granted' state. Pairs with `ensureXRPermission` (helper that probes / prompts and writes the result into the context's `permissionStateCache`).

The condition evaluator is purely synchronous — beats that need a fresh reading first call `ensureLocationCacheActive()` to start the underlying watcher, then evaluate the condition off the cache. This keeps the condition path zero-await-cost while still updating every time the sensor fires.

Editor UI for all three operators added to RequirementsEditor (choice requirements) and the ConditionBeat block in Inspector. Each operator gets its own form with the right inputs (lat/lng + radius for gps, UUID + radius for indoor, sensor name dropdown for permission).

### XR Beat #1: GpsLocationBeat

`gpsLocation` is the first XR-category beat. Three modes:

- **`display`** — show a map with a target marker, radius ring, and the player's live position. Continue button advances. No permission needed.
- **`trigger-on-arrival`** — same map, but the beat resolves automatically when the player walks within `radiusMeters` of `(targetLat, targetLng)`. Optional cancel button. Permission required.
- **`trigger-on-departure`** — resolves when the player walks *out* of the radius. Same permission requirement.

Permission denial is configurable per project: `'skip'` advances to the next beat, `'fallback'` jumps to a specified `fallbackBeatId`. `ensureXRPermission` returns `'granted' | 'fallback' | 'skip'` and the beat branches accordingly.

Renderer: replaced the v0.9.48-RC `MapBeatPlaceholder` with **MapBeatLeaflet** — a real Leaflet 1.9.4 component with OpenStreetMap streets / Esri satellite / CartoDB minimal tile choices, zoom controls, attribution, target marker (red dot), 300m radius ring, blue player marker, distance-to-target indicator, and a custom "recenter on me" control top-right. Auto-zoom-in on first walk so 5m steps are visible at street level; pan-follow when the player drifts toward the viewport edge; never overrides manual zoom.

Two production-fidelity fixes hit during integration:
- **Library-build CSS** — `import 'leaflet/dist/leaflet.css'` in a Vite library build emits a sibling `style.css` that consumers don't auto-load. Switched to `?inline` import so leaflet's CSS rides inside the JS bundle and self-injects on mount. Same pattern for the scoped reset that defeats Tailwind preflight stripping `<a>` background and `<img>` max-width on the leaflet-bar buttons and tile images.
- **Container-size race** — `L.map()` runs in the React effect before flex layout has settled, so Leaflet's tile grid is computed against the wrong container size. Added `requestAnimationFrame + setTimeout(250)` `invalidateSize` calls plus a `ResizeObserver` watching the container.

### DirectionalSound — XR v1 audio

`Sound.spatialPosition` is a new optional field with two flavours:

- **Geographic** (`lat`, `lng`) — bearing and distance recomputed live from the player's GPS reading. As the player walks around, the panner rotates and attenuates the sound based on heading + distance. `maxDistanceMeters` is the silence-beyond-this threshold.
- **Azimuth-only** (`azimuth: 0–360°`) — fixed compass direction. Spinning the device pans the audio.

Both flavours flow through `AudioManager.playSpatialSound` which inserts a Web Audio PannerNode with HRTF panning model and linear distance falloff (refDistance: 5m for a small "full-volume bubble", linear fade to silence at maxDistance). The renderer's standard `playSound` path now branches on `sound.spatialPosition`: present → spatial route, absent → existing non-spatial route. Existing sounds without spatialPosition behave identically to before.

`buildSensorAdapter` (in `packages/renderer/src/audio/sensorAdapter.ts`) bridges the core `SensorService` to AudioManager's `subscribeToSensor` callback, keeping AudioManager core-decoupled.

The **SpatialPositionEditor** disclosure is a reusable component in `packages/builder/src/editors/`. Closed by default (sounds without spatial positioning behave as before), expands into a mode-aware form. Currently wired into Inspector's Background Sound block; reusable for cluster sound, dialog sound, or any other sound surface that wants positioning.

### Five compounding bugs the spatial-sound integration shook loose

The spatial-sound path went through five layers of compounding bugs before producing audible output:

1. **SensorService instance churn** — `StoryEngine.loadStory()` created a new `StoryContext`, which spawned a fresh `MockSensorService`. The renderer state and audio adapter stayed subscribed to the original; the panel and map talked to the new one. Walks landed on the new instance; the audio adapter was deaf. Fixed by passing the existing service through to the new context (`existingSensorService` constructor opt) so the engine reuses the same instance across context recreations.

2. **Distance model wrong** — PannerNode used `distanceModel: 'inverse'` with `refDistance: 1`, giving gain = 1/distance. At 50m the sound was -34dB (effectively silent). Switched to `'linear'` with `refDistance: 5` for a predictable "full-volume bubble + linear fade to maxDistance" curve.

3. **Blob URL fetch failed** — `playSpatialSound` called `fetch(blobUrl)`, which fails intermittently in some Electron / dev-server CSP setups. Same blob worked through the non-spatial path because that uses `blob.arrayBuffer()` directly. Spatial path now accepts `Blob | string` and uses `arrayBuffer()` for blobs.

4. **Inspector load path missing read** — the load-init at line 833 of Inspector.tsx initialized `parameters.backgroundSound` from `beat.sound` but didn't initialize `parameters.backgroundSoundSpatial` from `beat.sound.spatialPosition`. The SpatialPositionEditor reverted to "Off" on every beat re-select even though the value was correctly saved.

5. **Locale comma → period** — `<input type="number">` returns the locale-formatted string (`"51,50632"`) in some browsers; `parseFloat` reads only the leading `"51"`, placing sound sources tens of kilometres away. Added `.replace(',', '.')` in MockSensorPanel, SpatialPositionEditor, and the four Location & XR inputs in GlobalSettingsInspector.

The mock-sensor flow also required two earlier fixes: PreviewWindow seeds `MockSensorService.setMockLocation` from `globalSettings.location.mockLocation` right after engine construction (StoryContext can't see globalSettings on the Story object). And MockSensorPanel reads its initial state from `sensorService.getLastKnownLocation()` before falling back to `storyOrigin`, so the panel's first-render emit doesn't clobber the seed.

### MockSensorPanel + recenter UX

The MockSensorPanel is the desktop-authoring stand-in for real GPS / orientation hardware. Bottom-right floating panel (auto-hidden, toggle button), N/S/E/W walk buttons (5m steps), manual lat/lng inputs, three orientation sliders (alpha / beta / gamma), Snap-to-origin button. Pushes setMockLocation / setMockOrientation on every change.

The Leaflet map's recenter-on-me crosshair control reads the latest player position from a ref and recenters at street zoom on click. Works for both desktop authoring (mock player position) and production XR (real GPS reading).

### HTML export host wiring

The `@asaps/player` package's `PlayerEngine` now pushes the SensorService into the renderer state on construction, so standalone HTML exports get the same spatial-sound + GPS-beat support as the in-app preview. Production deployment uses WebSensorService (real `navigator.geolocation`); desktop authoring uses MockSensorService.

**Files modified (XR substrate):**
- `packages/core/src/engine/SensorService.ts` (new — interface, WebSensorService, MockSensorService, factory)
- `packages/core/src/utils/xrPermissions.ts` (new — ensureXRPermission helper)
- `packages/core/src/engine/StoryContext.ts` (sensorService field, condition operators, geo helpers, existingSensorService constructor opt)
- `packages/core/src/engine/StoryEngine.ts` (mockMode forwarding, sensor service preservation in loadStory)
- `packages/core/src/types/index.ts` (LocationSettings, xr category, gpsProximity/indoorProximity/permissionGranted Conditions, Sound.spatialPosition, IRenderer.renderMap)
- `packages/core/src/beats/GpsLocationBeat.ts` (new)
- `packages/core/tests/{engine/SensorService,engine/XRConditions,engine/Geo,beats/GpsLocationBeat}.test.ts` (66 new tests)

**Files modified (renderer):**
- `packages/renderer/src/components/MapBeatLeaflet.tsx` (new — full Leaflet integration with CSS injection, recenter control, follow-camera, ResizeObserver)
- `packages/renderer/src/components/MapBeatPlaceholder.tsx` (new — kept for reference)
- `packages/renderer/src/audio/AudioManager.ts` (playSpatialSound with PannerNode, linear distance model, Blob | string source)
- `packages/renderer/src/audio/sensorAdapter.ts` (new — SensorService → AudioManager bridge)
- `packages/renderer/src/renderers/BaseRenderer.ts` (spatial sound path, blob-direct source)
- `packages/renderer/src/renderers/ReactRenderer.tsx` (renderMap implementation)
- `packages/renderer/package.json` (leaflet@^1.9.4 + @types/leaflet)

**Files modified (builder):**
- `packages/builder/src/components/preview/MockSensorPanel.tsx` (new — N/S/E/W walk buttons, orientation sliders)
- `packages/builder/src/pages/PreviewWindow.tsx` (mockMode engine, MockSensorPanel toggle, seed from settings)
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` (Location & XR tab, locale-comma fix)
- `packages/builder/src/components/Inspector.tsx` (XR optgroup, spatial-position load-restore, SpatialPositionEditor wiring)
- `packages/builder/src/editors/RequirementsEditor.tsx` (XR optgroup + per-type forms)
- `packages/builder/src/editors/SpatialPositionEditor.tsx` (new — reusable disclosure, locale-comma fix)
- `packages/builder/src/storage/types.ts` (LocationSettings on GlobalSettings)

**Files modified (player + assets):**
- `packages/player/src/PlayerEngine.ts` (sensorService into renderer state for HTML exports)
- `packages/builder/public/player-web.{js,css}` (rebuilt artifacts)
- `beat-definitions/core-beats.json` (gpsLocation entry)

---

## 2026-05-05: Leaflet integration — real interactive map for GpsLocationBeat

### Overview

Replaces the v0.9.48 MapBeatPlaceholder with a real interactive map.
Same resolution semantics as the placeholder ('arrived' / 'departed'
/ 'continue' / 'timeout' / 'skipped') so the GpsLocationBeat runtime
is unchanged. The placeholder file is kept around for reference and
fallback / unit tests; ReactRenderer now mounts MapBeatLeaflet.

### What's new

- **Real OpenStreetMap tiles** via Leaflet 1.9.4 (~40KB, MIT licensed,
  free for any use). Three tile-layer choices selected by the
  beat's `mapStyle` parameter:
  - `streets` — default, OpenStreetMap classic
  - `satellite` — Esri's free World Imagery (non-commercial use)
  - `minimal` — CartoDB's light-grey basemap, less visual noise
- **Target marker** at `targetLat/targetLng` (red dot with white border)
  plus a **radius circle** showing the proximity threshold visually.
- **Player marker** (blue dot) that updates live from the SensorService.
- **Auto-fit bounds** the first time the player position is known so
  both the target and the player are visible. Subsequent updates
  don't re-pan — author retains manual zoom/scroll control.
- **Status banner** at the bottom: "Arrived ✓" / "47 m away" /
  "Departed ✓" / "Waiting for location…" with mode-aware colour.
- **Continue / skip buttons** unchanged from the placeholder.

### Dependencies

- `leaflet@^1.9.4` and `@types/leaflet@^1.9.21` added to
  `@asaps/renderer`. Leaflet's CSS is imported in the component, so
  Vite picks it up automatically. Total bundle bump: ~45KB compressed.

### Coordinate / bearing math

The placeholder's local haversine helper is duplicated in
MapBeatLeaflet (renderer-package; no need to round-trip through core
for a tiny formula). Shape is identical to the engine's
gpsProximity / DirectionalSound calculation, so the visual readout
matches the runtime decision exactly.

### Marker icons

Leaflet's default marker assumes images at `/images/...`, which
breaks under bundler-driven asset paths. Workaround: use
`L.divIcon` with inline HTML for both target and player markers.
Reliable across desktop / PWA / HTML export contexts. Authors
who want custom marker images can override later.

### Test counts

Core 1,468 (unchanged — the runtime tests don't exercise the
renderer). All packages type-check clean.

### Files

- `packages/renderer/src/components/MapBeatLeaflet.tsx` (new)
- `packages/renderer/src/renderers/ReactRenderer.tsx` (swap to
  MapBeatLeaflet from MapBeatPlaceholder)
- `packages/renderer/package.json` (leaflet + @types/leaflet)

### XR v1 status: feature-complete + polished

All deferred polish items are now in:
  - DirectionalSound editor UI ✅ (this session)
  - HTML export host wiring ✅ (this session)
  - Leaflet for the GPS beat ✅ (this commit)

The next XR work is v2 features (IndoorLocationBeat with real
Bluetooth scanning, ARDisplayBeat with WebXR + camera tracking,
DirectionalSound option (b) for stand-alone audio-trail beats).
v1 ships as a coherent unit.

---

## 2026-05-05: HTML export host wiring — SensorService for standalone playback

### Overview

Final piece of XR-substrate plumbing. PreviewWindow has been pushing
SensorService into renderer state since S2 (desktop authoring with
MockSensorService). Production playback via standalone HTML export
went through `@asaps/player`'s `PlayerEngine`, which constructed its
own StoryEngine but never pushed `sensorService` into renderer state.
Result: deployed stories silently lost spatial sound and live-position
features, even though the engine was tracking everything correctly.

### Changes

`packages/player/src/PlayerEngine.ts` — right after engine
construction, push the SensorService into renderer state. Mirrors
the PreviewWindow setup pattern. Defensive cast on the renderer
since IRenderer's setState is optional in the interface, but every
concrete renderer in the codebase implements it.

Without `mockMode`, the engine's `createSensorService` factory
detects platform capability and returns the production
WebSensorService (real Geolocation API + DeviceOrientationEvent +
camera). HTML exports now have functional XR features matching what
authors saw in PreviewWindow.

### Test counts

Core 1,468 (unchanged — this is host plumbing). Type-check clean
across player and builder.

### Files

- `packages/player/src/PlayerEngine.ts` (push sensorService into renderer state)

---

## 2026-05-05: SpatialPositionEditor — UI for Sound.spatialPosition

### Overview

Final piece of authoring polish for DirectionalSound. Until this
landed, only programmer-authors who hand-edit project JSON could use
spatial sound. Now there's a proper UI surface — disclosure-style
"Directional positioning (optional)" panel that expands to mode-aware
fields right under the Background Sound block in the Inspector.

### Changes

**`packages/builder/src/editors/SpatialPositionEditor.tsx`** (new) —
reusable component, ~200 lines. Closed by default; opens to:

- **Mode** select: Off / Geographic / Azimuth-only.
- **Geographic**: lat/lng inputs, max-distance, "Snap source to
  story origin" button (when project has an origin set).
- **Azimuth-only**: degrees input (0=N) with cardinal-direction hint.
- **Both modes**: optional elevation field.

The header shows a `GPS` or `azimuth` badge when active so
authors can scan a beat list and see at a glance which sounds are
spatial. Closed-state stays out of the way for non-spatial sounds.

Component is purely presentational — parent owns the
`SpatialPosition` value, this just renders + emits onChange.

**`packages/builder/src/components/Inspector.tsx`** — mounted under
the Background Sound block when an actual sound is configured. No
point editing spatial data for a non-existent sound. Reads/writes
via `parameters.backgroundSoundSpatial`. Seeds the geographic-mode
default from the project's origin lat/lng (Location & XR settings),
so the lat/lng fields don't start at 0,0.

The Sound-conversion path that runs on save now also propagates
`backgroundSoundSpatial` onto `beat.sound.spatialPosition`, completing
the chain Inspector → Sound object → BaseRenderer.playSound →
AudioManager.playSpatialSound.

### What's deferred to later

Cluster sounds and dialog sounds also have config surfaces but they
go through different paths — extending `SpatialPositionEditor` to
those is straightforward (the component itself is already reusable)
but each surface needs its own param-key + Sound-conversion update.
This commit covers the most-visible case (Background Sound on a
beat); the others land as their own focused commits when authoring
demand surfaces.

### Test counts

Core 1,468 (unchanged — this is builder-only UI). Type-check clean
across all packages.

### Files

- `packages/builder/src/editors/SpatialPositionEditor.tsx` (new)
- `packages/builder/src/components/Inspector.tsx` (mount + Sound conversion)

---

## 2026-05-04: Wire DirectionalSound into the renderer's playSound path

### Overview

The DirectionalSound runtime that landed earlier today (`AudioManager.playSpatialSound`)
was reachable only via direct method call — `Sound.spatialPosition` set
on a beat sound was being silently ignored by the renderer. This commit
threads the spatial path through `BaseRenderer.playSound` so authors
who set `spatialPosition` on a beat / cluster sound config now get
actual spatial audio in the Preview Window without changing anything
else.

### Changes

**`packages/renderer/src/audio/sensorAdapter.ts`** (new) — bridge from
the SensorService's `watchLocation` + `watchOrientation` streams to
the unified `(state) => void` callback that
`AudioManager.playSpatialSound` consumes. Maintains an in-memory
snapshot of the latest readings, emits the merged snapshot on every
change, returns a single unsubscribe that tears down both
underlying watchers.

**`packages/renderer/src/renderers/BaseRenderer.ts`** — `playSound`
now detects `sound.spatialPosition`. When set:
1. Reads the SensorService from `this.state.get('sensorService')`.
2. Resolves the sound URL — assetId via `soundBlobResolver` then
   `URL.createObjectURL` for blobs; fall through to the http URL
   for external sounds.
3. Calls `audioManager.playSpatialSound` with the URL, the spatial
   config, the volume/loop options, and a sensor adapter built from
   the resolved sensor service.
4. Stores the returned `stop` function on the renderer so `stopBeatSound`
   can tear it down.

Falls back silently to the standard non-spatial path if any of:
no SensorService in state, no resolvable URL, AudioContext
unavailable. No author-visible breakage when spatial config is
authored on a host that can't satisfy it.

**`stopBeatSound`** now also calls the spatial teardown before
delegating to `audioManager.stopBeatSound`. The spatial path runs
its own audio graph (panner + sensor subscriptions) outside the
AudioManager's beat-sound bookkeeping, so it has to be cleaned up
explicitly.

**`packages/builder/src/pages/PreviewWindow.tsx`** — pushes the
SensorService into renderer state right after engine construction:
`reactRenderer.setState('sensorService', engine.getContext().getSensorService())`.
Same pattern as the existing TTS / STT service slots. The
GpsLocationBeat already did its own version of this defensively;
PreviewWindow setup makes it available to every beat / sound that
needs it without per-beat plumbing.

### Object-URL hygiene

The blob → URL.createObjectURL path leaks unless explicitly revoked.
The renderer tracks every URL it mints in a `spatialSoundObjectUrls`
array and revokes them all on `stopBeatSound`. Stable across multiple
spatial-sound transitions in a single session.

### What's still deferred

- **Editor UI for `spatialPosition`**: the existing sound config
  pickers (background sound, beat sound, dialog sound) are scattered
  and don't share a common widget. Authors can still only set
  spatialPosition by hand-editing the project JSON. Centralised
  widget is its own follow-up.
- **HTML export wiring**: the standalone player needs a parallel
  push of sensorService into renderer state. The runtime is in
  place; the host-side wiring (similar to PreviewWindow's setup)
  isn't yet.

### Test counts

Core: 1,468 passing (unchanged — this commit is renderer-side
plumbing). All packages type-check clean.

### Files

- `packages/renderer/src/audio/sensorAdapter.ts` (new)
- `packages/renderer/src/renderers/BaseRenderer.ts` (spatial path in playSound + teardown in stopBeatSound)
- `packages/builder/src/pages/PreviewWindow.tsx` (push sensorService into renderer state)

---

## 2026-05-04: DirectionalSound — spatial sound positioning (XR v1 complete)

### Overview

Last v1 item from the XR roadmap. Sound configs gain a
`spatialPosition` field; the AudioManager routes spatial sounds
through a Web Audio PannerNode that pans audio left/right based on
the source's position relative to the player. Two flavours:

- **Geographic** (`lat` + `lng` set): live bearing from the player's
  current GPS reading to a fixed point in the world. Pan updates as
  the player walks around. Pair with the SensorService's location
  cache from S2 + S3.
- **Azimuth** (`azimuth` set, no lat/lng): fixed compass direction
  relative to true north. The device's orientation `alpha` rotates
  the listener's frame so spinning the phone pans the audio.

Optional `maxDistanceMeters` caps audible range (geographic mode).
Optional `elevation` for vertical positioning.

### Schema

`Sound.spatialPosition` extended on the canonical type in
`packages/core/src/types/index.ts`. Optional everywhere — sounds
without it play exactly as before, no behaviour change.

### Runtime

`AudioManager.playSpatialSound(url, spatial, options, subscribeToSensor)`
in `@asaps/renderer`:

- Splices a `PannerNode` into the existing `source → gain →
  masterGain` chain (becomes `source → gain → panner → masterGain`).
- HRTF panning model + inverse distance attenuation. Convincing
  left/right + front/back when headphones are on.
- The caller passes a `subscribeToSensor` adapter that delivers
  fresh `{ playerLat, playerLng, compassAlpha }` whenever the
  SensorService emits. Keeps AudioManager from needing direct
  knowledge of SensorService — it stays dependency-clean.
- Returns an `unsubscribe` function. Calling it stops the sound,
  tears down the sensor subscription, and disconnects the audio
  graph.

### Bearing math

New `bearingDegrees(lat1, lng1, lat2, lng2)` helper in
`StoryContext.ts` (alongside the existing `haversineMeters`). Returns
initial bearing along the great circle in degrees, [0, 360). Both
helpers are now `export`ed so the renderer can import them via
`@asaps/core`.

### Tests

11 new tests in `tests/engine/Geo.test.ts`:
- haversineMeters: identical-points, symmetry, known long-distance
  (London → NYC ≈ 5,570km), short distances (~100m in SF),
  antipodal (~half Earth circumference)
- bearingDegrees: cardinal directions (N/S/E/W), [0, 360) range
  invariant across mixed quadrants and the antimeridian, hand-checked
  London → NYC ≈ 288° (WNW)

### Deferred to follow-up commits

- **Editor UI for `spatialPosition`** — the existing sound config
  surfaces (background sound picker, beat sound picker, dialog sound
  picker) are scattered. Authors can manually add `spatialPosition`
  to JSON for now; a dedicated UI follow-up will add the lat/lng /
  azimuth / elevation fields.
- **Renderer wiring to *use* `playSpatialSound`** — the
  AudioManager method exists; the next commit threads it through
  the existing `playSound` paths in renderers when `Sound.spatialPosition`
  is detected.

### Test counts

Core: **1,468 passing** (up from 1,457; +11 new from the geo helpers).
All packages type-check clean.

### Files

- `packages/core/src/types/index.ts` (`Sound.spatialPosition`)
- `packages/core/src/engine/StoryContext.ts` (export haversine, add bearingDegrees)
- `packages/core/src/engine/index.ts` (re-export geo helpers)
- `packages/core/tests/engine/Geo.test.ts` (new — 11 tests)
- `packages/renderer/src/audio/AudioManager.ts` (playSpatialSound)
- `docs/XR-Roadmap.md` (mark DirectionalSound (a) done; v1 complete note)

### XR v1 status

**Complete.** Authors can build location-anchored stories end-to-end:
- Configure location settings via the new "Location & XR" tab in
  Global Settings
- Place GPS-proximity beats and gate logic with the `gpsProximity` /
  `permissionGranted` Conditions
- Attach directional sound to real-world coordinates via
  `Sound.spatialPosition`
- Test the whole stack on desktop via the MockSensorPanel without
  needing real hardware

Remaining XR work is polish (Leaflet for the GPS beat's UI; editor
surface for `spatialPosition`) and v2 features (IndoorLocationBeat,
ARDisplayBeat). Roadmap doc updated to reflect this milestone.

---

## 2026-05-04: XR Beat #1 — GpsLocationBeat with placeholder map (S4)

### Overview

First XR beat lands. The whole substrate from S1+S2+S3 (LocationSettings,
SensorService, ensureXRPermission, three condition operators) gets
exercised end-to-end by a real beat that authors can drop into a story.

The beat ships with a clean placeholder UI rather than a Leaflet-based
map. Distance readout, threshold detection, mode-aware status, timeout
and skip — all functional. The visual map polish is the only thing
deferred; the runtime is real and fully testable via the MockSensorPanel.

### S4-A: 'xr' beat-category + IRenderer.renderMap

- `BeatTypeDefinition.category` union extended with `'xr'`.
- `IRenderer.renderMap` optional method declared. Renderer resolves with
  one of `'arrived'` / `'departed'` / `'continue'` / `'timeout'` /
  `'skipped'` — informational; the beat advances regardless.

### S4-B: GpsLocationBeat runtime

`packages/core/src/beats/GpsLocationBeat.ts`:

- Three modes: `'display'` (continue button, no waiting),
  `'trigger-on-arrival'` (resolves when player walks into radius),
  `'trigger-on-departure'` (resolves when player walks out).
- Reads `LocationSettings.onPermissionDenied` for the fallback policy
  and `LocationSettings.defaultProximityRadiusM` for the radius default
  (explicit beat value > project default > 25m).
- Probes GPS permission via `ensureXRPermission` in trigger modes
  (display mode skips the probe — no GPS needed to render a fixed map).
- Permission denied + `'fallback'` policy → returns `fallbackBeatId`.
  Denied + `'skip'` policy → advances to next. No fallbackBeatId
  configured → degrades to skip.
- `ensureLocationCacheActive()` while the beat runs so the renderer
  and any concurrent `gpsProximity` Condition share a fresh location.
- Propagates the SensorService into renderer state (`'sensorService'`
  slot) so the map UI can subscribe to live updates without needing
  direct StoryContext access.

### S4-C: Registration + beat-definitions entry

- Registered in `BeatRegistry` as `'gpsLocation'`.
- New entry in `beat-definitions/core-beats.json` with
  `category: 'xr'`, full parameter schema including UI hints (label,
  control type, options for the mode dropdown). Schema-driven editor
  picks it up automatically — no Inspector hardcoding needed.

### S4-D: Placeholder MapBeat renderer

`packages/renderer/src/components/MapBeatPlaceholder.tsx`:

- Subscribes to `sensorService.watchLocation` for live distance updates.
- Computes haversine distance to target every reading.
- Mode-aware status indicator: "Waiting for location…" / "Arrived ✓"
  ({distance}m away" / "{distance}m inside (waiting to depart)" /
  "Departed ✓".
- Auto-resolves on threshold crossing for trigger modes.
- Optional timeout firing 'timeout'.
- Continue button (display mode) and optional Skip button.
- Footer note flagging this as a placeholder awaiting Leaflet.

`ReactRenderer.renderMap` mounts the component, reads sensorService
from state, threads everything through.

### S4-E: Tests

14 new GpsLocationBeat tests covering:
- Parameter handling (defaults, top-level vs nested, getParameters /
  updateParameters round-trip)
- Display mode renders without permission probe + propagates SensorService
- Trigger modes proceed when permission granted; populate cache
- Permission denied + fallback policy returns the fallback beat id
- Permission denied + skip policy advances silently
- Permission denied with no fallbackBeatId degrades to skip
- Radius defaulting cascade (explicit > project > 25m)
- Edge cases: missing target coordinates, renderer without renderMap

Test counts: core 1,457 passing (up from 1,443 in S3; +14 new).
All packages type-check clean.

### Files

- `packages/core/src/types/index.ts` (xr category, renderMap interface)
- `packages/core/src/beats/GpsLocationBeat.ts` (new)
- `packages/core/src/beats/index.ts` (export)
- `packages/core/src/beats/BeatRegistry.ts` (register)
- `packages/core/tests/beats/GpsLocationBeat.test.ts` (new — 14 tests)
- `beat-definitions/core-beats.json` (gpsLocation entry)
- `packages/renderer/src/components/MapBeatPlaceholder.tsx` (new)
- `packages/renderer/src/renderers/ReactRenderer.tsx` (renderMap impl)
- `docs/XR-Roadmap.md` (mark S4 / first XR beat done)

---

## 2026-05-04: XR Substrate — Permissions + Condition Operators (S3)

### Overview

Third piece of the XR roadmap landed: permissions plumbing and the
three new XR condition operators (`gpsProximity`, `indoorProximity`,
`permissionGranted`). Together with S1 (LocationSettings) and S2
(SensorService) earlier today, the substrate is now complete enough
that XR beats can start landing in v2.

Everything authoring-side is wired up — authors can pick the new
operators from both the per-beat Requirements editor and the
ConditionBeat editor in the Inspector — but no XR beat actually
*requires* a permission yet, so this round is still infrastructure
without immediately-visible runtime behaviour.

### S3-A: Cached-reading getters on SensorService

Synchronous reads of the most recent sensor reading so condition
evaluators (which run synchronously) can branch on fresh sensor data:

- `getLastKnownLocation()` / `getLastKnownOrientation()` /
  `getLastKnownBeacons()` return the most recent reading the service
  has observed (or null when none).
- `ensureLocationCacheActive()` / `ensureOrientationCacheActive()` /
  `ensureBeaconCacheActive()` start a passive watcher with a no-op
  subscriber, returning an unsubscribe. Reuses the de-dupe-shared-watcher
  property from S2 — repeated calls don't spawn extra watchers.

The cache is populated by the same underlying `watchPosition` /
`deviceorientation` listener that fans readings out to active
subscribers; condition evaluators just read the cache field
synchronously. No new platform calls required.

### S3-B: Permission state API

`getPermissionState(name): PermissionState` and `requestPermission(name)`
on the service interface. Returns `'granted'` | `'denied'` | `'prompt'`
| `'unavailable'`.

WebSensorService uses `navigator.permissions.query()` where supported
(Chromium-family browsers expose `geolocation` and `camera` query
names; orientation and beacons fall through to `'prompt'` with the
underlying API surfacing the platform dialog on first use). For iOS
13+, `requestPermission` invokes
`DeviceOrientationEvent.requestPermission()` for orientation. For
camera, it briefly probes via `getUserMedia` then releases the track.

MockSensorService tracks per-permission state in an in-memory map,
defaults everything to `'granted'`, and surfaces a
`setMockPermissionState` mutation for unit tests and the Mock panel
to drive denial / prompt flows.

### S3-C / S3-D: Condition type extensions + checkCondition handlers

Three new condition operators added to the `Condition` union:

- **`gpsProximity`** — `{ targetLat, targetLng, radiusMeters,
  proximityMode: 'within' | 'outside' }`. Evaluator computes the
  haversine great-circle distance between the player's last cached
  GPS reading and the target, then applies the mode. Returns false
  when no cached location exists (fail-closed: don't trigger an
  arrival on unknown state).

- **`indoorProximity`** — `{ beaconUuid, beaconMajor?, beaconMinor?,
  minRssi }`. Evaluator scans the cached beacon list for a
  uuid+major+minor match and tests the RSSI threshold. RSSI is in
  dBm, closer to 0 = stronger signal. -65 dBm ≈ 1m, -85 dBm ≈ 10m.

- **`permissionGranted`** — `{ permissions: ('gps'|'camera'|
  'orientation'|'beacons')[] }`. Reads the StoryContext's
  permissionStateCache (populated by `ensureXRPermission`) and
  returns true iff every listed permission is currently `'granted'`.
  Untouched permissions are treated as not-granted (fail-closed —
  a beat that wants to gate on a permission must run a probe first).

The haversine helper lives at module scope in StoryContext.ts. Mean
Earth radius from WGS84 (6,371,008.8m), spherical-Earth assumption
(±0.5% accurate, plenty good for "within 50 metres" checks).

### S3-E: ensureXRPermission helper

`packages/core/src/utils/xrPermissions.ts` exports `ensureXRPermission(context, permissions, policy)`
returning `'granted'` | `'fallback'` | `'skip'`. Probes each
permission via `getPermissionState`, prompts on `'prompt'`-state
permissions when `policy.prompt !== false`, records every observed
state into the context's `permissionStateCache`, then returns the
verdict. Choice between `'fallback'` and `'skip'` follows the
policy's `onDenied` field (mirrors `LocationSettings.onPermissionDenied`).

Future XR beats will call this from their `onEnter`. The verdict
semantics let beats route into a fallback beat, silently advance, or
proceed cleanly without each beat re-implementing the probe-and-route
dance.

### S3-F: Editor UI

Both **per-beat Requirements editor** and the **ConditionBeat editor
in the Inspector** gain three new entries in their condition-type
select (under a new `XR / sensors` optgroup) plus per-type forms:

- `gpsProximity` — lat / lng numeric inputs + radius (metres) + mode
  dropdown (within / outside).
- `indoorProximity` — beacon UUID + optional major/minor + min RSSI
  numeric input. Footer note that Bluetooth scanning ships in v2.
- `permissionGranted` — checkbox group for the four sensor capabilities
  (gps / camera / orientation / beacons). Footer note explaining the
  fail-closed semantic and the requirement for an upstream probe.

### Tests

- 11 new tests in `SensorService.test.ts` (S3 cached-reading getters
  + permission state API for both Web and Mock).
- 20 new tests in `XRConditions.test.ts` covering gpsProximity
  (within / outside / no-cache / invalid-input), indoorProximity
  (RSSI threshold, beacon major/minor filtering, no-match cases),
  permissionGranted (empty list, fail-closed default, all-granted,
  any-denied), and ensureXRPermission (granted path, fallback policy,
  skip policy, prompt-then-record, no-prompt option, empty-list
  trivial-grant, unavailable-as-fallback).

Test counts: core 1,443 passing (up from 1,412 in S2; +31 new). All
packages type-check clean.

### Files

- `packages/core/src/engine/SensorService.ts` (cached getters,
  permission API, mock injection)
- `packages/core/src/engine/index.ts` (export new types)
- `packages/core/src/engine/StoryContext.ts` (permission cache,
  haversine, three new checkCondition branches)
- `packages/core/src/types/index.ts` (Condition union + new fields)
- `packages/core/src/utils/xrPermissions.ts` (new helper)
- `packages/core/src/utils/index.ts` (export)
- `packages/core/tests/engine/SensorService.test.ts` (extended)
- `packages/core/tests/engine/XRConditions.test.ts` (new — 20 tests)
- `packages/builder/src/editors/RequirementsEditor.tsx` (new condition
  types + per-type forms)
- `packages/builder/src/components/Inspector.tsx` (same, in the
  ConditionBeat block)
- `docs/XR-Roadmap.md` (mark S3 done)

---

## 2026-05-04: XR Substrate — LocationSettings + SensorService (S1+S2)

### Overview

First two pieces of the XR roadmap landed: project-level location
settings and the SensorService runtime. Pure infrastructure — no XR
beats yet, no permission UX, no condition operators. Designed so the
upcoming GpsLocationBeat / IndoorLocationBeat / ARDisplayBeat can
build on a stable substrate without each beat re-implementing
sensor-access patterns.

See `docs/XR-Roadmap.md` for the broader plan and `docs/XR-S1-S2-Plan.md`
for the implementation plan this work executed against.

### S1 — LocationSettings on GlobalSettings

New optional block appended to `GlobalSettings` in
`packages/builder/src/storage/types.ts`:

- `originLat` / `originLng` — story origin / GPS anchor
- `venue` — indoor venue with floorplan asset + dimensions in metres
- `defaultProximityRadiusM` — fallback radius for proximity triggers
- `onPermissionDenied` (`'skip'` | `'fallback'`) + `fallbackBeatId`
- `mockLocation` — desktop authoring fallback that the
  MockSensorService seeds from at construction time

Optional everywhere — projects without XR pay zero cost.

### S2 — SensorService runtime

New module at `packages/core/src/engine/SensorService.ts` with:

- `SensorService` interface — `getCurrentLocation`, `watchLocation`,
  `scanBeacons`, `watchOrientation`, `getCapabilities`, plus
  mock-injection methods (`setMockLocation` / `setMockBeacons` /
  `setMockOrientation`).
- `WebSensorService` — production path. Wraps Geolocation API,
  DeviceOrientationEvent, and getUserMedia. Bluetooth scanning ships
  as a stub (deferred to v2 with IndoorLocationBeat).
- `MockSensorService` — desktop authoring path. Caches the current
  location/beacons/orientation in memory, emits to subscribers
  immediately on subscribe + on every mutation.
- `createSensorService({ mockMode? })` factory — picks the right
  implementation based on capability detection and the explicit
  `mockMode` override.

**Critical correctness property exercised in tests**: subscribers
share ONE underlying watcher per sensor. Ten GPS-watch beats running
concurrently produce ONE `navigator.geolocation.watchPosition` call,
fanned out via the subscriber set. Lazy init (first subscribe starts
the watcher) + reference-counted teardown (last unsubscribe clears
it). Otherwise mobile battery dies in 30 minutes during real
playback.

Tests: 21 cases in `packages/core/tests/engine/SensorService.test.ts`
covering normalised reading shape, error/null fallbacks, capability
detection, the de-dupe property, callback de-duplication via Set
semantics, fresh-watcher-after-full-teardown, mock-injection, and
the factory's mockMode override.

### Wiring

- `StoryContext` constructor accepts an additive
  `{ mockMode?: boolean }` option. Constructs the SensorService at
  construction time and seeds it from `GlobalSettings.location.mockLocation`
  when in mock mode.
- `StoryEngine` constructor accepts the same option and forwards it
  through to every StoryContext it creates (initial + on `loadStory`).
- `PreviewWindow` constructs `new StoryEngine(reactRenderer, { mockMode: true })`
  so all desktop authoring uses MockSensorService.
- New `MockSensorPanel` component in
  `packages/builder/src/components/preview/MockSensorPanel.tsx` —
  editable lat/lng + N/S/E/W walk-direction nudge buttons +
  three orientation sliders (alpha 0-360, beta -90..90, gamma -90..90)
  + "Snap to story origin" button.
- `MockSensorPanelToggle` wraps it in a default-collapsed
  bottom-right floating overlay with a toggle button. Mounts only
  when the project has any LocationSettings — non-XR stories see
  nothing.

### Test counts

Core: 1,412 passing (up from 1,391; +21 new SensorService tests).
All packages type-check clean.

### Files

- `packages/core/src/engine/SensorService.ts` (new)
- `packages/core/src/engine/index.ts` (export new types)
- `packages/core/src/engine/StoryContext.ts` (constructor option, getter)
- `packages/core/src/engine/StoryEngine.ts` (constructor option, forward)
- `packages/core/tests/engine/SensorService.test.ts` (new — 21 tests)
- `packages/builder/src/storage/types.ts` (LocationSettings on GlobalSettings)
- `packages/builder/src/components/preview/MockSensorPanel.tsx` (new)
- `packages/builder/src/pages/PreviewWindow.tsx` (mockMode + panel mount)
- `docs/XR-Roadmap.md` (mark S1+S2 done)

---

## 2026-05-03: Test-Suite Repair — Two Production Bugs + Stale-Test Alignment (v0.9.47)

### Overview

Hotfix for two production bugs and a sweep of stale tests, fixing 37 long-standing failures across `@asaps/core` (28) and `@asaps/builder` (9). The full test suite is now green for the first time on this branch — **2,384 tests passing** (1,391 core + 993 builder).

### Production bug 1: ConditionBeat timeline reporting clobbered branch decisions

`ConditionBeat.performAction` evaluated the condition correctly, then called `context.getStory().getBeat(targetId)` purely for the diagnostic timeline event's `targetBeatName` field. When the context had no story attached — which happens in unit tests but is also a theoretical runtime corner case — `getStory()` throws. The throw was caught by the *outer* try/catch wrapping the whole condition evaluation, which then returned `getNextBeat(context)` (null in tests) **instead of** the correctly-computed `trueTarget` / `falseTarget`. Diagnostic code corrupted the actual return value.

Fixed by wrapping the timeline reporting in its own defensive try/catch so a missing story (or any other non-essential failure) can't cascade up to disturb the branch decision. The condition-evaluation path now strictly returns the right target regardless of whether the timeline lookup succeeds.

This was masked for years because in production every real run has a story attached. The 25 failing ConditionBeat unit tests had been flagged as pre-existing during the v0.9.45 work — turns out they were pointing at a real bug.

### Production bug 2: EndScreen `reset: true` no-op when `showRestart: false`

`reset: true` on an EndScreen only fired inside `doRestart()`, which was only called when the player clicked restart/play/again. With `showRestart: false`, the player exited the story via the implicit "no buttons match" fall-through, leaving the context state intact. The `reset: true` flag became a silent no-op for any story that ended without a player-facing restart button.

Fixed by extracting a `doExit()` helper that applies the reset before returning null. `reset: true` now means "clear state when the story ends, regardless of how it ends" — the consistent semantic and the one the existing test had been asserting all along.

### Stale tests realigned to production

- **ConversationPromptBuilder** — the section header text was renamed `CONVERSATION RULES` → `CONVERSATION GOALS` at some point (semantic shift toward "guide the conversation toward these" rather than "follow these rules"); test hadn't caught up.
- **ttsWait** — test wanted reading delay to fire when TTS is enabled but currently silent. Production sensibly skips it because the TTS pipeline's own post-pause already provides pacing. Adding 2s on top would make every NPC auto-advance feel sluggish. Test rewritten with a comment explaining the production semantic.
- **ElevenLabsProvider, OpenAITTSProvider, CustomTTSProvider, TTSService** — tests were stale relative to a streaming-mode refactor of the cloud TTS path. Providers now return `{ audio: null, response }` for streaming, so AudioManager can pick MediaSource streaming or blob fallback. Default ElevenLabs model upgraded to `eleven_v3` (was `eleven_multilingual_v2`). Error messages unified across browser-proxy and Electron-direct paths ("ElevenLabs error N" — no longer distinguishing "proxy error" vs direct). Electron path uses `/stream` URLs with optional `optimize_streaming_latency` query param. TTSService calls `playSoundFromBlobAndWait` (waits for playback to finish so `isSpeaking()` stays true) rather than fire-and-forget `playSoundFromBlob`.

### Test counts

| Package | Before | After |
|---|---|---|
| `@asaps/core` | 28 failing, 1,343 passing | **0 failing, 1,391 passing** |
| `@asaps/builder` | 9 failing, 965 passing | **0 failing, 993 passing** |

**Files modified:**
- `packages/core/src/beats/ConditionBeat.ts` (defensive try/catch on timeline event)
- `packages/core/src/beats/EndScreenBeat.ts` (extract doExit helper, apply reset on all exit paths)
- `packages/core/src/utils/ttsWait.ts` (no behaviour change — clearer comment on the production semantic)
- `packages/core/tests/utils/ConversationPromptBuilder.test.ts` (label update)
- `packages/core/tests/utils/ttsWait.test.ts` (rewritten test for current semantic)
- `packages/builder/src/services/tts/__tests__/{ElevenLabsProvider,OpenAITTSProvider,CustomTTSProvider,TTSService}.test.ts` (streaming-mode result, current default model, unified error messages, /stream URLs, AudioManager method names)

---

## 2026-05-03: Affect-Aware AI Generation + Uniquify + Calendar-Day Formatter (v0.9.46)

### Overview

Three independent features bundled into v0.9.46. The headline is **affect-aware AI generation** — both AI generation paths (in-app providers and the standalone MCP servers) now teach the LLM the full Layer-2 + affect stack landed across v0.9.43-v0.9.45 (characters as runtime entities, mood / sentiments / emotions / traits / goals / variants / dossier policies, baseline-relative conditions, bookmarks, the symmetry rule between Effects and Conditions). Authors get an `affectDepth` dial (Auto / Sparse / Standard / Rich) so the same engine can produce a lean state-capitals quiz or an interactive drama with full character interiority depending on the prompt and the dial setting.

The other two are smaller-but-real fixes flagged during the AI-generation testing pass: AI-generation was bypassing the duplicate-name check (convergent titles produced "Holding the Line" four times for the same prompt), and the project library's "Today HH:mm" labels used rolling-24h diffs that mislabelled yesterday-evening timestamps as today's.

### Affect-aware AI generation

**The design question** was tiered always-on vs. checkbox toggle. Picked tiered always-on with auto-depth dial. Reasoning: a "use rich characters" checkbox would imply the affect system is exotic / off by default, contradicting the work that landed it as the core authoring style across v0.9.43-v0.9.45. The tiered approach scales the affect-overlay depth to the prompt:
- `auto` (default) — AI reads the prompt and picks
- `sparse` — characters as speakers, no affect annotations, classic Conditions only
- `standard` — mood seeds + affect Effects on key choices, mood/sentiment Conditions on at least one branch, no traits/variants
- `rich` — full system: traits, goals, variants, dossier reflection on evolving characters, effect templates, baseline-relative conditions, act-break bookmarks

**The shared module** lives at `packages/core/src/prompts/affectPrompt.ts`, exporting `buildAffectPromptSection(depth)` and the `AffectDepth` type. The in-app provider stack imports it directly via `@asaps/core`; the MCP servers (which are deliberately decoupled from core for portability) keep manually-synced copies marked with `SYNC SOURCE` comments. The module is composed of five sections — Layer-2 foundations (always shown), affect catalog (standard+), effects/conditions reference (standard+), dossier-policy heuristic (standard+), depth-dial guidance (always shown). Sparse mode skips the middle three so the prompt stays at ~1,200 tokens; standard / rich expand to ~4,150 tokens including the full worked examples.

**The hard-won lessons** in the prompt: (1) a SYMMETRY RULE — "if you author ≥3 affect Effects on a character, at least one downstream conditionBeat MUST branch on that character's affect, not on a derived flag"; (2) a worked example for `baseline: 'initial'` showing a sentiment trust-evolution branch; (3) a separate worked example for the bookmark TWO-STEP protocol explicitly teaching that bookmarks require a `bookmarkAffectState` Effect upstream AND a baseline-bookmark Condition downstream with matching names. The two-step worked example was added after v1 of the prompt produced consistent orphan bookmark references on weaker models.

**Plumbing**:
- `StoryGenerationRequest.affectDepth?: AffectDepth` (request type)
- Both ClaudeProvider and OpenAIProvider thread it through to `buildEnhancedStoryGenerationSystemPrompt`
- `StoryGenerator` dialog gets a single Affect Depth dropdown (Auto by default) with hint text per tier
- MCP `generateStory` tool input schema gains `affectDepth` (auto / sparse / standard / rich)
- New `asaps_get_affect_guide` tool on the desktop MCP server so Claude Desktop can fetch the guide on demand with its own depth preference

**Smoke tests across 8 generation runs**:
- GPT-5.4 + auto reasoning: deploys all six affect dimensions on rich prompts (mood, sentiments, emotions, traits, goals, dossier policies, addReflection effects), 60-70 affect Effects per story, ≥1 baseline:'initial' condition. **Bookmark symmetry was broken** — orphan refs without upstream Effects.
- GPT-5.5 + highest reasoning: full bookmark symmetry, 75-82 affect Effects, 2-3 affect-aware Conditions per story, baseline:'initial' twice in a single story. The model upgrade closed the bookmark gap that three rounds of progressively-stronger prompt iteration couldn't.
- Sparse-forced on a drama prompt: 0 affect Effects, 0 rich characters, structurally minimal output despite the dramatic content. The dial overrides prompt content correctly.
- AUTO on "5-question state-capitals quiz": 0 affect Effects, 0 rich characters. AUTO correctly reads educational/quiz prompts as sparse.

The feature works across model tiers: capable models (5.5 + high) reach the full affect stack including bookmarks; weaker models (5.4 / Claude with low thinking) get most of it but produce orphan bookmarks. The validator below catches that case deterministically.

**Files modified:**
- `packages/core/src/prompts/affectPrompt.ts` (new — canonical shared module)
- `packages/core/src/prompts/index.ts` (new — barrel)
- `packages/core/src/index.ts` (re-export)
- `packages/core/tests/prompts/affectPrompt.test.ts` (new — 25 tests)
- `packages/builder/src/types/ai.ts` (`affectDepth` on the request)
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` (inject affect section)
- `packages/builder/src/services/providers/{ClaudeProvider,OpenAIProvider}.ts` (thread depth through)
- `packages/builder/src/components/ai/StoryGenerator.tsx` (dial dropdown)
- `mcp-server/src/tools/generateStory.ts` (tool input schema)
- `mcp-server/src/utils/aiHelper.ts` (mirror prompt content)
- `mcp-server-desktop/src/index.ts` (mirror prompt content + new asaps_get_affect_guide tool)

### Auto-fix for orphan bookmark references

Three rounds of progressively-stronger prompt engineering didn't close the bookmark-symmetry gap on weaker models. The pattern is sticky because bookmarks require a non-local invariant (the bookmark name in a Condition must match an Effect somewhere upstream in the story tree) and LLMs handle local patterns much more reliably than non-local ones.

Switched tactics: deterministic auto-fix in the post-generation pipeline. New `autoFixOrphanBookmarkReferences` pass detects condition `baseline: { bookmark: "X" }` references whose names aren't taken by any upstream `bookmarkAffectState` Effect, and converts those refs to `baseline: 'initial'`. Same condition shape, same operator, same value — but now reads against story-start (which the runtime captures automatically) instead of resolving to 0 (which would silently fire the condition for the wrong reason).

Lives next to `autoFixEndingRestartConnections` and `autoFixAiSummaryMaxLength` in both `packages/builder/src/services/AIService.ts` and `mcp-server/src/utils/aiHelper.ts`. Walks all beats, collects bookmark Effect names from choice effects (recursively into dialogNode.choices), `updateAffect` beat `effects[]` arrays, and inline choice effects. Logs a warning per conversion so authors can manually correct if they actually wanted a real bookmark.

**Files modified:**
- `packages/builder/src/services/AIService.ts` (autoFixOrphanBookmarkReferences method + call site in pipeline)
- `packages/builder/src/services/__tests__/autoFixOrphanBookmarks.test.ts` (new — 9 tests)
- `mcp-server/src/utils/aiHelper.ts` (mirror function + call site)

### Project-name uniquify on every create entry point

AI generation was bypassing the duplicate-name check that other create paths used. Convergent AI titles ("Holding the Line" produced four times for the same drama prompt) were silently colliding in IndexedDB.

New helper at `packages/builder/src/utils/uniqueProjectName.ts` — `findUniqueProjectName(desired, existing)` returns the desired name if unused, else `desired 1`, `desired 2`, … skipping holes. Case-insensitive, whitespace-trimmed, falls back to `'Untitled Project'` for empty input, bounded at 9999 with a timestamp escape hatch for the pathological case.

Wired into `createProject` in `PersistenceContext.tsx` so every entry point benefits — AI generation, manual create, ASML import, Twine import. Skips the `'Untitled Project'` sentinel because the auto-save logic depends on that exact string. Listing-failure is non-fatal (logs and proceeds with the requested name). 10 unit tests including the exact "Holding the Line 0..3" scenario.

**Files modified:**
- `packages/builder/src/utils/uniqueProjectName.ts` (new — helper)
- `packages/builder/src/utils/__tests__/uniqueProjectName.test.ts` (new — 10 tests)
- `packages/builder/src/contexts/PersistenceContext.tsx` (wire into createProject)

### Calendar-day-aware date formatter

`ProjectLibrary` was computing `Math.floor(diffMs / 86400000) === 0` for the "Today HH:mm" branch — a rolling-24h window. A timestamp from yesterday at 19:54 viewed today at 13:33 is ~17.5 hours ago, fell into the same bucket as "1 hour ago", and got mislabelled "Today 19:54" — the `Modified Today 13:33 / Created Today 19:54` impossibility shown in the user's screenshot.

Replaced with calendar-day comparison in local timezone (`new Date(y, m, d)` for both timestamps, integer-divide by 86400000). Also added time-of-day to the `Yesterday` branch and switched all branches to 24h notation per the existing display style.

**Files modified:**
- `packages/builder/src/components/ProjectLibrary.tsx` (formatDate function)

---

## 2026-05-01: Affect-Effect Authoring UX — Labels, Palette Auto-Complete, Templates, Live Summary (v0.9.45)

### Overview

Three steps of the affect-effect authoring UX roadmap shipped in this window. The choice-effects editor in v0.9.43+ produced bundles like `Nudge Mood 0.3 -0.1 / Fire Emotion pride 0.3 / Fire Emotion fear -0.2 / Add Sentiment player trust 0.4 / …` with no labels on the numeric inputs, no auto-complete on the emotion / target fields, and no way to pre-fill a coherent multi-row bundle representing a common author intent. v0.9.45 closes the loop with: inline labels (val / aro / Δ / sal / →) on every numeric input with hover tooltips explaining direction; combobox auto-complete on the emotion and target fields backed by the project's emotion palette and character roster; a library of 8 intent-shaped effect templates ("empathetic — full support", "pushy / dismissive", "boundary respecting", etc.) accessible via an "+ apply template…" dropdown; and a live "what does this choice do?" summary block underneath the rows that synthesises the cumulative effect in plain language.

The User Guide had a follow-up audit pass to document the four authoring-UX additions with a Standing Beside Alex walk-through, four new screenshots, and three glossary touch-ups.

### Step 1 — Inline labels and combobox auto-complete on affect rows

**Labels.** Authors used to face anonymous numeric inputs like `0.3 -0.1` on Nudge Mood rows with no indication which axis was which. Fix: small text labels (`val` / `aro` for mood, `Δ` for emotion-delta and sentiment-strength-delta, `sal` for reflection salience, `→` for the sentiment target) sit next to each input. Hover tooltips explain direction (positive valence = happier; positive arousal = more activated; negative trust delta = mistrust / erosion on the same axis).

**Palette-backed emotion auto-complete.** `fireEmotion` and `addSentiment`'s emotion fields are now combobox inputs (HTML datalist-backed) listing the project's emotion palette as suggestions. Free-text fallback still works for custom story emotions; this is purely discoverability — authors don't have to remember whether they spelled it `mistrust` or `anti-trust`. The `addSentiment` target field also has a datalist suggesting all defined characters plus the `player` sentinel.

**Files modified:**
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`

### Step 2 — Effect templates library

Eight intent-shaped presets shipped in `effectTemplates.ts`:

- `empathetic-max` — full support, mood lifts, joy fires, fear drops, trust grows, self-shame eases.
- `empathetic-partial` — well-meaning but mixed.
- `pushy-dismissive` — overrides what the character needs. Mood drops, fear/shame spike, trust erodes.
- `silent-failed` — absence as harm. Sadness fires, trust erodes.
- `boundary-respecting` — names the overstep. Pride fires, deep trust forms.
- `validating` — "I see you" without trying to fix. Quiet positive shift, gratitude.
- `defensive-overreach` — well-meaning but speaks-for. Ambivalent.
- `recovery-quiet` — small non-demanding presence. Mood eases, no sentiment shift.

Each template's `forge({target, playerRef, counters})` returns a concrete `Effect[]` with the active character substituted in. Counter increments only emit for counters that exist in the project (so templates don't seed `maxSupport` / `failedSupport` rows in stories that don't track them). Templates target whichever character is set as the choice's affect target — inferred from any existing affect effect in the choice's list (so chains stay coherent within one choice), falling back to the first non-player character in the project, then to `player`. They're starting points, not contracts: authors apply a template and then tweak individual values.

UI: an "+ apply template…" dropdown sits next to the existing "+ Add Effect" button at the bottom of the effects list. When no effects exist yet, the same dropdown appears alongside the inline "+ Add Effect" button as the alternative-action.

**Files modified:**
- `packages/builder/src/editors/effectTemplates.ts` (new)
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`
- `packages/builder/src/editors/__tests__/effectTemplates.test.ts` (new — 11 tests)

### Step 3 — Live "what does this choice do?" summary

Below the effect rows, a small italic blue-tinted block prefixed with `→` synthesises the cumulative effect in plain language. Updates live as the author tweaks values. Examples:

- **Empathetic-max applied to Alex**: → Alex: feels happier; joy spikes; fear softens; trust toward the player grows (+0.40); self-shame eases (-0.05) · +2 supportScore, +1 maxSupport
- **Pushy choice**: → Alex: feels sadder, more activated; fear spikes; shame spikes; trust toward the player eases (-0.30); self-shame grows (+0.05) · -1 supportScore, +1 failedSupport

`summarizeChoiceEffects(effects, characters?)` is a pure helper. Buckets affect effects by target character so each character's arc gets its own clause. Aggregates `nudgeMood` deltas into a single net qualitative descriptor ("feels happier" / "feels sadder" / "more activated" / "calmer"), dropping below noise threshold ±0.05. Each `fireEmotion` reads as `<name> spikes` (positive) or `<name> softens` (negative), with magnitude qualifier (`sharply` for |Δ| ≥ 0.4, `a little` for |Δ| < 0.2). Each `addSentiment` reads `<emotion> toward <target> grows/eases (±value)`; self-directed (`sentimentTarget === target`) becomes `self-<emotion> grows/eases`, consistent with the affect panel and dossier rendering. Goal-status changes read as `goal '<id>' marked <status>`, variant changes as `switches to variant '<id>'`. Reflection text quoted with truncation at ~60 chars. Counter / variable / inventory effects roll into a separate compact tally clause. Hidden when there's nothing to say (no effects, or every delta below noise).

Character ref → display name resolution via the optional `characters` arg (falls through to raw ref when not in scope).

**Files modified:**
- `packages/builder/src/editors/summarizeChoiceEffects.ts` (new)
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`
- `packages/builder/src/editors/__tests__/summarizeChoiceEffects.test.ts` (new — 16 tests)

### Plumbing

`emotionPalette?` prop added to `ChoiceEffectsEditor`, threaded through `Inspector` (3 mounts) and `DialogTreeEditor` from `App.tsx`'s `emotionPalette` state. `availableCharacters?` was already in scope from earlier work.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx`
- `packages/builder/src/editors/DialogTreeEditor.tsx`
- `packages/builder/src/App.tsx`

### User Guide audit

User-guide-qa agent's follow-up pass after this UX work. Added a new sub-section in Part 8 → Affect-Aware Choice Effects ("Easier authoring: labels, palette suggestions, templates, and a live summary") with a Standing Beside Alex walk-through covering all four sub-topics: inline labels (table mapping val/aro/Δ/sal/→ to meanings), palette auto-complete (combobox behaviour + free-text fallback), the 8-template library (table with descriptions + the target-inference and project-aware-counter rules), and the live summary block (two real example outputs captured verbatim from the agent's session, plus six bullets describing the synthesiser's behaviour). Glossary refined: "Choice Effects" mentions the new template route, "Effect Template" entry added listing all 8 defaults, "Affect Summary" entry added describing the live block.

4 new screenshots in `docs/images/`:
- `34-choice-effects-overview.png` — Inspector showing populated Effects section with the live summary block
- `35-effect-row-labels-mood-emotion.png` — close-up of val/aro labels on Nudge Mood and Δ on Fire Emotion
- `36-effect-row-labels-sentiment.png` — close-up of → / Δ on Add Sentiment, including the self-directed convention
- `37-effect-templates-and-live-summary.png` — populated effects list showing "+ Add Effect" next to "+ apply template…" with the full live summary underneath

Items the agent flagged as not-fixed-in-scope: empty-state screenshot of a fresh choice's effects skipped to avoid mutating the canonical Standing Beside Alex project; native HTML datalist dropdowns can't be screenshotted (OS-rendered, outside page DOM) so the combobox is documented in text only.

**Files modified:**
- `docs/USER_GUIDE.md`
- `docs/images/34-37-*.png` (new, 4 files)

### Test Coverage

- 11 new tests in `effectTemplates.test.ts` — library shape, forge() with/without counters, target substitution, signed-trust direction per template, self-shame direction, recovery-quiet's no-sentiment shape, findEffectTemplate hit/miss/empty.
- 16 new tests in `summarizeChoiceEffects.test.ts` — empty list, positive/negative/aggregated mood, noise-threshold filter, fireEmotion intensity qualifiers, sentiment direction, self-prefix, full Alex-template-shaped bundle, multi-character grouping, ref fallback, goal/variant/reflection rendering, zero-delta skip.
- Total builder editor tests now 27; previously 0 in `editors/__tests__/`. 72 character UI tests still passing. Type-check clean across builder.

---

## 2026-05-01: Baseline-Relative Affect Conditions + Bookmarks + Condition Templates (v0.9.45 — Round 2)

### Overview

Symmetrical follow-up to the affect-effect authoring UX work above. The condition-check side of the affect stack had the inverse problem: rich runtime support, but author-side phrased only as literal thresholds. Asking *"has Alex's trust toward the player **improved**?"* required computing an absolute threshold and hoping the seeded starting point happened to align — which is fragile for off-neutral seeds (Alex starts at valence -0.3 in *Standing Beside Alex*, so "valence ≥ 0" passes for a character who's still struggling, just less than before).

This round adds three things:
- **Baseline-relative comparisons** — every continuous affect condition (mood / emotion / sentiment) gets a "Compared to" switch that toggles between literal threshold (current behaviour, the default) and *delta-from-initial* / *delta-from-named-bookmark* modes. The runtime captures initial values lazily on first-touch (or at story-start when the character has authored seeds), so a delta read against a missing initial degrades to 0 — same behaviour as a literal threshold against an untouched slot.
- **Author-named bookmarks** — a new `bookmarkAffectState` Effect snapshots mood / emotion / sentiment state under a name (e.g. `reunion-scene`). Subsequent conditions can compare current values against that frozen snapshot ("trust grew by ≥ 0.3 since the reunion-scene bookmark"). Scope is `all` (every character, default) or `character` (just the target character).
- **Condition templates library** — 26 author-friendly presets covering both *threshold* and *delta-from-initial* flavours across mood / emotion / sentiment / trait / goal / variant. Picking *"Sentiment — trust toward player has grown since start"* seeds the type, character, sentimentTarget, sentimentEmotion, operator, value (0.3), and `baseline: 'initial'` in one click. Authors fine-tune from there.

The trio fully answers the *"can we phrase this as 'X has improved'?"* question that motivated the round, and the templates make it as discoverable as the effect templates that shipped above.

### Engine — `packages/core`

**StoryContext.** Three new state slots mirror the live affect maps as initial-value snapshots: `initialMoods`, `initialEmotionLevels`, `initialSentiments`. Population is *idempotent first-touch* — `nudgeCharacterMood` / `setCharacterMood` / `setCharacterEmotion` / `fireCharacterEmotion` / `addCharacterSentiment` each capture the pre-mutation value as the initial baseline before applying their delta. `seedCharacterAffectFor` also writes initials at seed time, so a character authored with `initialMood: { valence: -0.3 }` reads `initial = -0.3` from condition-check time onward (rather than 0). Plus a fourth slot — `affectBookmarks: Record<name, AffectSnapshot>` — for the named-bookmark API. Snapshot shape mirrors the live maps so baseline reads resolve identically against either source.

**API additions.** `takeAffectBookmark(name, options?)` deep-clones mood / emotion / sentiment slots into an entry under `name`. With `options.target` set, only that character's slots are captured (others in a same-named prior snapshot are preserved). `getAffectBookmark(name)` returns the snapshot. `getAffectBookmarkNames()` returns the keyset for editor dropdowns.

**Condition evaluator.** `Condition` gains `baseline?: 'literal' | 'initial' | { bookmark: string }`. The mood / emotion / sentiment branches of `checkCondition` switch on it: `'literal'` (or undefined) compares `current` against `value` directly (legacy behaviour); `'initial'` compares `current - initial`; `{ bookmark: name }` compares `current - bookmarkedValue`. Missing initials / bookmarks resolve to 0. Trait / goal / variant conditions ignore the field — those slots are static or discrete and don't have a meaningful baseline semantics.

**Effect dispatcher.** New `bookmarkAffectState` case routes to `takeAffectBookmark` with the chosen scope. Empty `bookmarkName` is silently ignored.

**Serialization.** `serialize()` and `loadFromSerialized()` round-trip all four new slots so save/load preserves baseline + bookmark state across sessions. Older saves without these fields load with empty maps (forward-compat).

**Files modified:**
- `packages/core/src/types/index.ts` (Condition.baseline; Effect.bookmarkName / scope; bookmarkAffectState in the Effect.type union)
- `packages/core/src/engine/StoryContext.ts` (initial maps, bookmarks API, capture instrumentation, baseline-aware checkCondition, bookmarkAffectState dispatcher, serialize/load round-trip, seedCharacterAffectFor initial-capture, AffectSnapshot type)
- `packages/core/src/beats/ConditionBeat.ts` (baseline field; passed through buildCondition / getParameters / updateParameters for mood / emotion / sentiment)

### Builder — Condition templates library

`packages/builder/src/editors/conditionTemplates.ts` (new) holds 26 templates in 6 categories. Each template's `forge({target, playerRef})` returns a fully-formed `Condition` with the active character substituted in. Threshold templates ("Mood — visibly happy (now)", "Sentiment — trusts the player (now)") produce literal-baseline conditions. Delta-from-initial templates ("Mood — improved since start", "Sentiment — trust toward player has grown since start", "Emotion — fear has eased since start") add `baseline: 'initial'` to the same shape with appropriate operators and values. Goal / variant templates seed an empty id field for the author to fill in.

`groupConditionTemplates()` returns the library bucketed by category (`mood` / `emotion` / `sentiment` / `trait` / `goal` / `variant`) for `<optgroup>`-style rendering. `findConditionTemplate(id)` is the lookup; `conditionToFlatParams(condition)` flattens a Condition object into the flat parameter shape ConditionBeat stores (renaming `type` → `conditionType`, passing the rest through).

**Files modified:**
- `packages/builder/src/editors/conditionTemplates.ts` (new — 26 templates, helpers)
- `packages/builder/src/editors/__tests__/conditionTemplates.test.ts` (new — 16 tests)

### Builder — Editor UI wiring

**Inspector.tsx (ConditionBeat block):** A blue-tinted "Apply a template" dropdown above the Condition Type select offers all 26 templates organised by optgroup. Picking one writes its forged Condition's flat params into the beat (`conditionType` + every relevant field including `baseline`); the select resets so the same template can be re-applied. Below the existing "Compare Value" inputs on the mood / emotion / sentiment forms, a "Compared to" select toggles between *literal value* / *delta from initial* / *delta from a named bookmark*; bookmark mode reveals a name-input. Mode-switch hint copy adapts: literal reads as a threshold, deltas read as "improved/dropped/grown/eroded by X since the baseline."

**RequirementsEditor.tsx:** Same template dropdown rendered per-requirement card (so each requirement can adopt a different template). Replacing the requirement's condition swaps the whole shape, including the baseline. The `renderBaselinePicker` helper is shared across the mood / emotion / sentiment forms.

**ChoiceEffectsEditor.tsx:** New `bookmarkAffectState` row type with a `bookmarkName` text input and a `scope` dropdown (`all characters` / `target only`). When scope is `all`, the target field is hidden (since the snapshot covers everyone); when `character`, the standard character SmartNameDropdown shows. The live summary helper picks bookmarks up via the non-affect tally clause, reading as `bookmark "reunion-scene"` (or `bookmark "alex-arc" (Alex only)` when scope-narrow).

**Files modified:**
- `packages/builder/src/components/Inspector.tsx` (template dropdown + baseline picker on three sub-forms)
- `packages/builder/src/editors/RequirementsEditor.tsx` (template dropdown + baseline picker via shared helper)
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx` (bookmarkAffectState row type, hideTarget logic)
- `packages/builder/src/editors/summarizeChoiceEffects.ts` (bookmark tally entry)

### Test Coverage

- 17 new tests in `AffectBaseline.test.ts` (core) — first-touch initial capture for mood / emotion / sentiment, seeded-initial-as-baseline for off-neutral characters, idempotent second-touch, separate per-(target, emotion) sentiment baselines, takeAffectBookmark snapshot semantics (all vs character scope), delta-from-bookmark condition evaluation, missing-bookmark-resolves-to-zero fallback, scope='character' narrowing, bookmarkAffectState effect dispatch via applyEffect, serialize/load round-trip, older-saves-without-baselines loads with empty defaults, and explicit-literal-baseline equivalent to omitted.
- 16 new tests in `conditionTemplates.test.ts` (builder) — library shape (categories, unique ids, descriptions), forge() per category (mood threshold, mood delta-from-initial, sentiment with playerRef, sentiment delta-from-initial, emotion negative-delta-fear-eased, trait names, goal/variant empty seed fields), conditionToFlatParams flattening (with baseline passthrough), groupConditionTemplates ordering and non-empty groups, findConditionTemplate hit/miss/empty.
- All 43 builder editor tests passing. All 17 baseline tests passing. Type-check clean across all packages.

### Why we don't have running-trend conditions ("X has been improving over the last N beats")

Captured for posterity: deliberately scoped out. Would require a per-slot ring buffer of recent values, which multiplies storage in long stories and rarely matches what authors actually mean ("did the relationship grow over the course of the story?" — answered by delta-from-initial). The two cheaper semantics that *do* match author intent — start-of-story baseline (option 1, this round) and bookmarked moments (option 2, this round) — are now both shipping.

### UpdateAffectBeat migrated to ChoiceEffectsEditor

Caught in review: the standalone `UpdateAffectBeat` ("apply a single mood nudge / sentiment / emotion fire as its own beat in the graph, not on a choice") was the *only* affect-authoring surface that didn't get the v0.9.45 templates + live summary + bookmark support. Its data shape — single character + at most one mood-pair + one sentiment-triple + one emotion-fire — couldn't accept the multi-row `Effect[]` bundles the templates produce.

Resolution: UpdateAffectBeat now also accepts an `effects: Effect[]` parameter (preferred) and the Inspector renders it with `ChoiceEffectsEditor` directly. Authoring parity restored — the beat now offers all 8 effect templates, palette-backed combobox auto-complete, the live "what does this do?" summary, AND the new `bookmarkAffectState` row, just like a choice's effects. Legacy single-row params are migrated into a synthesised `Effect[]` the first time the editor opens an old beat (`synthesizeEffectsFromLegacyParams` helper); the runtime prefers `effects[]` when populated and falls back to the legacy fields otherwise. Old projects keep working with no migration step required, and re-saving opts them into the new shape.

**Files modified:**
- `packages/core/src/beats/UpdateAffectBeat.ts` (effects[] field on the class, applyEffect-per-row in performAction, synthesizeEffectsFromLegacyParams export, renamed local interface from UpdateAffectParameters → UpdateAffectInput to avoid collision with the schema-derived export in generated/beat-types.ts)
- `packages/core/src/beats/index.ts` (export the class + synth helper; do NOT re-export UpdateAffectParameters since it lives in generated/)
- `packages/builder/src/components/Inspector.tsx` (exclude updateAffect from SchemaFormGenerator; render its Effects field with ChoiceEffectsEditor and seed from synthesizeEffectsFromLegacyParams when no effects[] yet)
- `packages/core/tests/beats/UpdateAffectBeat.test.ts` (6 new tests: multi-row effects[] dispatch, bookmarkAffectState row inside an UpdateAffectBeat, effects-take-precedence-over-legacy, synthesizeEffectsFromLegacyParams full / empty / partial cases)

Total UpdateAffectBeat tests: 16 (10 legacy-path + 6 new). All passing.

---

## 2026-05-01: Affect Condition Operators in the Editor + User Guide Audit (v0.9.44)

### Overview

Closes the v0.9.43 authoring gap that the User Guide had honestly flagged: the six new ConditionBeat operators (`mood`, `sentiment`, `emotion`, `trait`, `goal`, `characterVariant`) were honored by the runtime but unreachable from the visual editor — only the classic operators (counter / counterCompare / timer / inventory / variable / fictionalTime / visitedBeat) were selectable. Authors had to hand-edit raw JSON to use any of the affect-stack operators. Both editor surfaces (Inspector's ConditionBeat type-dropdown + the per-beat Requirements editor) now expose the full set with appropriate per-type forms, cascading character → goals/variants/traits dropdowns, and operator-list gating per type. The User Guide had a thorough two-pass audit by the user-guide-qa agent — the affect-operator paragraphs were rewritten to reflect the closed gap, and a broader sweep refreshed stale content (Debug Tools section was renamed and rebuilt against the actual UI, Speaker Display moved to its real home under Settings → Effects, Settings catalog restructured, 8 stale screenshots replaced and 8 new ones added).

### Affect-stack ConditionBeat operators in the editor UI

**Inspector.tsx — ConditionBeat type-dropdown:** new "Character affect" optgroup at the bottom with six options. Each renders an appropriate per-type form:

- **Mood**: character (dropdown of project characters + Player) → axis radio (valence / arousal) → operator → value (-1..+1, step 0.05).
- **Emotion**: character → emotion-name input → operator → value (0..1).
- **Trait**: character → trait-name dropdown (populated from the character's `traits` and any variant-overridden traits, free-text fallback when the character has none) → operator → value (0..1).
- **Sentiment**: character (sentiment holder) → toward target (text input with datalist of project characters; supports inventory items / tags as raw strings) → emotion (optional, sums all when empty) → operator → value (-1..+1).
- **Goal**: character → goal-id dropdown (cascading — populated from the character's authored goals, free-text fallback) → ==/!= → status (open / met / failed / abandoned).
- **Active variant**: character → ==/!= → variant-id dropdown (cascading — populated from the character's variants, free-text fallback).

Operator-list gating applies: the four numeric-affect types (mood / emotion / trait / sentiment) get the full `==/!=/>/>=/</<=` set; goal and characterVariant only get `==/!=`.

**RequirementsEditor.tsx — per-beat requirements:** same dropdown extension and same six per-type forms, sized for the narrower beat-level requirements panel. `CondType` union widened, `condType()` guard recognises the new types, `changeType()` initialises sensible defaults when authors swap. New optional `availableCharacters` prop plumbed through Inspector's mount.

The data shape was already defined by `Condition` in core types from v0.9.43 (Steps 4-8 added `moodAxis`, `emotionName`, `traitName`, `sentimentTarget` / `sentimentEmotion`, `goalId` / `goalStatus`, `variantId`). No core changes required — purely UI plumbing.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx`
- `packages/builder/src/editors/RequirementsEditor.tsx`

### User Guide audit — affect-operator paragraphs rewritten + broader content refresh

Two-task pass by the user-guide-qa agent verifying every claim against the live UI on `localhost:5173` via the chrome-devtools MCP.

**Task 1 — Closed gap rewrite:** the previous audit (correctly at the time) flagged that the affect-stack condition operators were honored by the runtime but unreachable from the visual editor. With the gap now closed, the User Guide's affect-operator paragraphs were rewritten to reflect the first-class editor support, and a comprehensive new section was added covering each of the six per-type forms, the cascading character → goals/variants/traits flow, and the per-beat Requirements editor as the same-shape sibling.

**Task 2 — Broader coverage audit found and fixed several stale entries:**

- **Debug Tools section** — was documented as a "Panel with three tabs", actually a separate window named **Debug Tools** with tabs **Reachability** / **Path Analysis** / **Story Logic** (not "Reachability Analysis", "Logic Validation"). Full rewrite + 3 new screenshots covering the Forward / Tree / Backward modes in Path Analysis and Hub Beat Analysis on Story Logic.
- **Speaker Display** — was documented as a top-level Settings tab, actually lives inside **Settings → Effects → Speaker Display**. Fixed in both reference spots (Part 4 and Part 8 Settings catalog).
- **Settings catalog** — restructured Effects / HUD / Sound / Speaker Display / Variables / Translation / Debug entries to match the actual tabs; added missing **Copyright** tab.
- **Timer HUD field list** — replaced the partially-fictional list ("Style — Digital or Minimal" / "Colors — text/bg/opacity") with the actual flat-list visible when Enabled is on.
- **Asset Manager tabs** — corrected from "Image / Audio / Video / Fonts" to the actual **All Assets / Images / Audio / Videos / Fonts** plus the From URL row.
- **"Seven affect-aware effect types"** — was inconsistent with its own table. Corrected to "six".
- **Visited-beat condition** — added an explicit pointer note since it lives only in the Requirements editor, not the ConditionBeat dropdown.
- **FAQ "Import → Examples"** — referenced a menu item that doesn't exist. Replaced with the project library / Import Project (ZIP) flow, with Standing Beside Alex called out as the canonical affect-stack demo.
- **Inspector screenshot** — was flagged as pre-v0.9.41 in its own caption. Refreshed.
- **Glossary completeness check passed**: all v0.9.43 terms (Big Five, Mood Pad, Sentiment, Variant, Reflection, Mood HUD, Goal, Personality Archetype, Emotion Palette, Dossier Policy) are present and consistent with body text.

**Screenshots:** 8 stale images refreshed (main interface, settings panel, character manager with grouped variants, asset manager, Inspector showing the v0.9.41+ combobox + Dialog Tree Editor inline, AI menu, Affect tab with variants populated, Character Manager grouped-card view). 8 new images added: condition-type dropdown showing the Character affect optgroup, mood / trait / goal condition forms populated, Requirements editor with a mood gate on a beat, and the three Debug Tools tabs (Reachability / Path Analysis / Story Logic).

User Guide grew from 2424 → 2492 lines, 30 image files now.

**Items the agent flagged for follow-up that this audit didn't fix in scope:**

- Active-variant condition form needs a manual screenshot (React's controlled-component flow rejected the JS-driven select-and-snap). The form is documented in prose but doesn't have a populated-form screenshot like the others.
- The Visual Editor screenshot wasn't refreshed (no beat with heavy visual content was loaded).
- Preview Window screenshots not refreshed this round.
- A handful of older images (06, 08–16) predate May 2025 and may be due for a freshness pass.

**Files modified:**
- `docs/USER_GUIDE.md`
- `docs/images/01-main-interface.png` (replaced)
- `docs/images/02-settings-panel.png` (replaced)
- `docs/images/03-character-manager.png` (replaced)
- `docs/images/04-asset-manager.png` (replaced)
- `docs/images/05-inspector-panel.png` (replaced)
- `docs/images/07-ai-menu.png` (replaced)
- `docs/images/21-affect-with-variants-goals.png` (replaced)
- `docs/images/24-character-manager-grouped.png` (replaced)
- `docs/images/26-condition-type-dropdown-affect.png` (new)
- `docs/images/27-condition-mood-form.png` (new)
- `docs/images/28-condition-trait-form.png` (new)
- `docs/images/29-condition-goal-form.png` (new)
- `docs/images/30-requirements-mood.png` (new)
- `docs/images/31-debug-reachability.png` (new)
- `docs/images/32-debug-path-analysis.png` (new)
- `docs/images/33-debug-story-logic.png` (new)

---

## 2026-05-01: Character System — Steps 5–8 + Variants + Mood HUD + Alex Example (v0.9.43)

### Overview

Closes the rich-character roadmap end-to-end. Step 5 (emotion nodes with author-editable palette), Step 6 (Big Five personality traits modulating emotion deltas), Step 7 (dossier policy fork with reflection memory), and Step 8 Phase A (goals + GAMYGDALA-style emotion firing on goal status changes) all shipped this window. On top of those layers: a personality archetype library (10 psychology-grounded presets), character variants (alternate persona profiles for one Character id — the "play as introvert / extrovert Alex" feature), the 2D mood pad on Russell's circumplex (in the editor + as a runtime HUD overlay), variant-aware Character Manager UI (linked sub-cards with inline trait / mood / sentiment editors per variant), and full affect-stack parity for the standalone web player so deployed exports match the preview window. The example "Standing Beside Alex" project was reauthored end-to-end to demonstrate every feature: variant picker at start, affect effects on every choice, scene-end mood-reading reactions, mood/trust ending gates, and AI-summary beats writing the friendship retrospective in Alex's voice.

### Step 5 — Emotion Nodes + Author-Editable Palette

Per-character runtime emotion levels in [0, 1], decay each beat-entry at the palette's authored rate, auto-nudge mood on `fireEmotion` via palette weights. Default palette is Ekman 6 (joy, anger, fear, sadness, surprise, disgust) plus pride/shame/interest. `EmotionPaletteEditor` modal in the Character Manager lets authors rename, reweight, add, remove, or reset emotions. Palette persists through the project format (Story serializer + project save/load + preview live-update). New Effect type `fireEmotion`, new ConditionBeat operator `emotion`, UpdateAffect beat fires emotions with auto mood-nudge. CharacterAffectPanel renders top-N emotion intensity bars per character.

**Files modified:**
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/engine/Story.ts`
- `packages/core/src/engine/EmotionPalette.ts` (new)
- `packages/core/src/types/index.ts`
- `packages/core/src/beats/ConditionBeat.ts`
- `packages/core/src/beats/UpdateAffectBeat.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/builder/src/App.tsx`
- `packages/builder/src/contexts/PersistenceContext.tsx`
- `packages/builder/src/components/characters/EmotionPaletteEditor.tsx` (new)
- `packages/builder/src/components/characters/CharacterManager.tsx`
- `packages/builder/src/components/characters/CharacterAffectPanel.tsx`
- `packages/builder/src/pages/PreviewWindow.tsx`
- `packages/builder/src/services/PreviewWindowManager.ts`

### Step 6 — Personality Traits

Static, author-set Big Five trait bag (openness, conscientiousness, extraversion, agreeableness, neuroticism), each in [0, 1]. Defaults to neutral; authors fine-tune per character. Traits modulate emotion deltas at runtime via `modulateEmotionDelta(base, emotion, traits, modulations)` — `scale = 1 + Σ ((trait - 0.5) × 2) × weight`, clamped [0, 4]. Project-level `TraitModulationProfile` ships defaults wiring traits to the standard palette (neuroticism amplifies negative emotions, extraversion amplifies positive ones, agreeableness dampens anger/disgust, etc.). Both the palette and trait modulations persist through the project format. New `trait` ConditionBeat operator for branching on traits. Dossier renders a `Personality:` line filtering out neutral traits. CharacterEditor's Affect tab gains a Personality section with sliders + descriptions. Traits never gate choices on their own — they only modulate deltas.

**Files modified:**
- `packages/core/src/engine/PersonalityTraits.ts` (new)
- `packages/core/src/engine/Story.ts`
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/beats/ConditionBeat.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/builder/src/types/character.ts`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/App.tsx`
- `packages/builder/src/pages/PreviewWindow.tsx`

### Personality Archetype Library

10 psychology-grounded Big Five presets — balanced, narcissist, anxious-introvert, conscientious-leader, free-spirit, recluse, hothead, peacekeeper, stoic, trickster — with values from Costa & McCrae's NEO-PI-R bands. Each archetype optionally seeds *self-directed* sentiments (narcissist → pride toward self, anxious introvert → shame toward self) — sentiments toward other characters remain author-driven. `findPersonalityArchetype(id)` lookup helper. CharacterEditor's Affect tab gains a "Load archetype…" dropdown that replaces Big Five values (custom traits preserved), appends self-sentiments deduplicated by emotion, and shows a caption explaining what each preset seeds.

**Files modified:**
- `packages/core/src/engine/PersonalityArchetypes.ts` (new)
- `packages/core/src/engine/index.ts`
- `packages/builder/src/components/characters/CharacterEditor.tsx`

### Step 7 — Dossier Policy Fork + Reflection Memory

Per-character `dossierPolicy: 'reAnchor' | 'reflection'` switch. Mode A (default, `reAnchor`) rebuilds the dossier from structured state every turn so the character cannot drift away from authored identity. Mode B (`reflection`) accumulates per-turn reflections so the character is allowed to grow over the session. New `Reflection` type `{timestamp, text, beatId?, salience?}` stored on StoryContext; `appendCharacterReflection` evicts on a 32-entry per-character cap with salience-aware eviction (high-salience reflections survive longer). New `addReflection` Effect for authoring reflections from choices/nodes. Dossier renders a `Recent reflections:` block only in reflection mode; AI beats inherit the switch automatically through their existing `buildDossierForRef` call. CharacterEditor gains a Dossier policy radio block. ChoiceEffectsEditor learns the Add Reflection effect.

**Files modified:**
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/builder/src/types/character.ts`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`

### Step 8 Phase A — Goals + GAMYGDALA Emotion Firing

Authored `Character.goals[]` (id, name, description, priority, optional satisfaction predicate). Runtime tracks status (`open` / `met` / `failed` / `abandoned`) on `StoryContext.characterGoalStatus`. New `setGoalStatus` Effect, new `goal` ConditionBeat operator. Per-beat-enter goal evaluation: `markBeatVisited` re-runs every authored satisfaction predicate via `checkCondition`; open goals whose predicate becomes true flip to `met`. GAMYGDALA-style emotion firing on status transitions: `met` fires pride+joy scaled by goal priority, `failed` fires shame+sadness, `abandoned` is silent (intentionally). Routes through `fireCharacterEmotion` so trait modulation + palette weights apply. Authors can opt out with `suppressEmotion` on the effect. Dossier renders `Pursuing:` (open, sorted by priority) and `Recent outcomes:` (met / failed) sections. CharacterEditor's Affect tab gains a Goals section. Phase B (NPCAct / Sandbox agent loop) deferred — the data path is real and an author can write goal-driven branching today.

**Files modified:**
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/builder/src/types/character.ts`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`

### Character Variants — Alternate Persona Profiles

A single Character record can now carry multiple persona overlays (Alex-introvert vs Alex-extrovert; Player-man vs Player-woman). One stable id, one set of beats — only the affect / portrait / displayName slice swaps. New `CharacterVariant` type with partial-overlay semantics (any field the variant defines replaces the base; everything else is inherited). `Character.defaultVariantId` for author-set startup, `setCharacterVariant` Effect for player-driven picks at story-start, `characterVariant` ConditionBeat operator for branching on the active variant. Switching variants atomically wipes mood/sentiments/emotions and re-seeds from the variant's authored values, emitting `characterMoodChanged` / `characterSentimentChanged` so HUD overlays refresh. Variants are exclusive (one active at a time), chosen at story-start (mid-story switching allowed via `suppressSeed: true` to keep accumulated affect).

CharacterManager grid now renders characters with variants as a grouped cell — colored border keyed to the parent's color, parent header with display name + variant count, one inner sub-card per variant. Each variant sub-card carries its own portrait override, displayName, description, "(default)" tag if applicable, and edit / delete affordances. Clicking a sub-card opens the editor focused on that variant (Affect tab pre-selected, scrolled to the variant card with a brief blue outline). When a character has variants, the parent's Personality / Initial mood / Initial sentiments / Dossier policy sections collapse to a single explainer banner — variants become the unit of personality. First-variant migration deep-clones base values into the new variant and clears them from the base record so the data model stays unambiguous. Each variant card hosts inline editors for Big Five trait sliders (with the archetype-preset shortcut), a 180px MoodPad for `initialMood`, a compact sentiment list, and per-variant portrait override (DirectAssetUpload). Sprite-sheet / animation-name overrides are deferred to a future "playable character pool" feature.

A new private `explicitVariantSet` flag on StoryContext distinguishes engine-applied default variants from explicit player picks (only set by `setActiveCharacterVariant`, not by `seedCharacterAffectFromStory`'s default-apply). The HUD overlay gates on `hasExplicitlySetVariant(id)` so a character with `defaultVariantId` set still has its HUD hidden until the player makes an actual pick.

**Files modified:**
- `packages/core/src/types/index.ts`
- `packages/core/src/utils/characterVariant.ts` (new)
- `packages/core/src/utils/index.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/core/src/engine/StoryContext.ts`
- `packages/builder/src/types/character.ts`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/components/characters/CharacterManager.tsx`
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`

### 2D Mood Pad — Editor + Runtime HUD

`MoodPad` reusable React component renders mood on Russell's circumplex (square + inscribed circle, faint quadrant tints, axis cross, optional emotion-palette markers). Click-and-drag to set valence/arousal interactively; read-only mode for display. The editor's Affect tab uses a 320px pad as the primary picker with sliders below for numeric fine-tune; emotion markers from the project palette show where each emotion sits in mood-space. The runtime `CharacterMoodFrame` HUD widget mirrors the visual — wraps the disc in a small card with a header (color dot or portrait + display name), beefier quadrant colors (yellow-joy / red-fear / blue-sad / green-serene), bigger mood dot using the character's accent color, and an optional qualitative descriptor ("pleased, alert" / "sad, subdued") below. Default size 140 with a 22px header + 18px label rows, on by default for the qualitative line.

PreviewWindow + the standalone WebPlayer both render screen-docked HUDs as a top-level overlay layer (independent of stage character placement), so dialog-only stories show the HUD too. Anchored-to-character HUDs continue to mount from PositionedBeatView when the character is on stage. Mood / variant-changed events bump a `hudTick` state to force re-render. Resolver chain forwards merged-character displayName + portrait URL + color so variant overlays apply to the HUD.

**Files modified:**
- `packages/builder/src/components/characters/MoodPad.tsx` (new)
- `packages/builder/src/components/characters/__tests__/MoodPad.test.tsx` (new)
- `packages/renderer/src/components/CharacterMoodFrame.tsx` (new)
- `packages/renderer/src/components/PositionedBeatView.tsx`
- `packages/renderer/src/renderers/ReactRenderer.tsx`
- `packages/renderer/src/index.ts`
- `packages/builder/src/components/characters/CharacterAffectPanel.tsx`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/pages/PreviewWindow.tsx`
- `packages/player/src/PlayerEngine.ts`
- `packages/player-web/src/WebPlayer.tsx`

### Authoring-UX polish

- **Character dropdown for affect-effect targets.** Effects targeting a character (`nudgeMood`, `addSentiment`, `fireEmotion`, `addReflection`, `setGoalStatus`, `setCharacterVariant`) used to require typing the character id by hand. ChoiceEffectsEditor now renders a SmartNameDropdown of the project's character roster — author picks by display name, the dropdown stores the id, runtime resolves correctly. `player` is always included as a sentinel option.
- **Self-directed sentiment rendering.** When a character's sentiment targets themselves (`toEntityRef === character.id`), the Preview Window's affect panel and the LLM dossier both render as `mild self-shame` instead of the ambiguous `mild shame toward Alex`. Dossier splits sentiments into separate "Feels toward themselves:" and "Feels toward others:" sections.
- **Variant edit/delete buttons.** Variant sub-cards in the Character Manager grid carry hover-revealed edit (✎) and delete (✕) buttons with explicit `type="button"`, `confirm()` on delete, defaultVariantId cleared when the deleted variant was the default.
- **Mood-pad clipping fix.** Mood dot at extreme valence/arousal values used to be clipped by the SVG viewBox edge — now scaled by 45 instead of 50 inside the 100-unit viewBox so the dot stays fully inside the disc at every value.
- **Affect-panel column overflow.** Per-axis bar rows used to carry a duplicate qualitative word column that got truncated in narrow layouts; dropped since the same info is in the summary line below.

### Webplayer parity (`@asaps/player`, `@asaps/player-web`)

Standalone web exports get every feature the preview window has:

- `PlayerEngine.createStoryFromJSON` registers `setEmotionPalette` + `setTraitModulations` after `setCharacters` so customised palette / trait modulations apply at runtime.
- `WebPlayer.tsx` mounts a top-level mood-HUD overlay alongside the renderer container (with the `hasExplicitlySetVariant` gate), wraps the renderer in a `position: relative` container, subscribes to `characterMoodChanged` / `characterVariantChanged` to refresh.
- `PlayerEngine`'s mood-frame resolver passes characterName / portrait / color forward (via merged character) so variant overlays apply in the HUD.

The `packages/player-web/dist/` bundle is rebuilt; `HtmlExporter` ships it with each story. Existing exports need a re-export to pick up the bundled fix.

**Files modified:**
- `packages/player/src/PlayerEngine.ts`
- `packages/player-web/src/WebPlayer.tsx`
- `packages/builder/public/player-web.js` (regenerated bundle)

### Alex Example — End-to-End Demo (`docs/Standing_Beside_Alex_complete.asaps.zip`)

The user's reference story was rewritten through five passes to demonstrate every feature:

1. **Variants picker** at story start: `setCharacterVariant` effects on two `dialogTree` choices ("Free Spirit Alex — bright, open" / "Anxious Introvert Alex — quiet, careful"). Both route into the existing first scene.
2. **Affect effects on every choice**: 15 dialog choices across 5 scenes, each carrying combinations of `nudgeMood`, `fireEmotion`, `addSentiment` (toward player AND toward self for the variant's self-doubt arc), and `addReflection`. Empathetic choices reduce Alex's variant-seeded self-shame; harmful ones reinforce it.
3. **Scene-end mood reactions**: 7 ConditionBeat trios (one per pivotal outcome) reading `mood.valence` and routing to one of two short prose lines describing what Alex looks like.
4. **Affect-driven endings**: ending gates moved from `supportScore` counter to `mood.valence` + `sentiment(trust toward player)`. supportScore stays in the data; three new counters (`maxSupport` / `partialSupport` / `failedSupport`) track choice quality without driving the gate.
5. **AI synthesis beats**: three `aiSummary` beats (one per ending tier) with tier-specific prompts steering the LLM to write a friendship retrospective in the third person, citing specific moments and counter values.

Mood HUD enabled top-right (160px, qualitative label on, Alex's color #7c3aed). Hidden during title and picker, appears at beat_1 with the variant's seeded mood ("pleased, alert" for Free Spirit, "displeased, steady" for Anxious Introvert).

**Files modified:**
- (Example zip distributed via `/Users/hartmut/Downloads/`)

### Test Coverage

199 affect-stack tests passing across 14 files (core engine + utils + beats + builder character UI). New test files: `PersonalityTraits`, `PersonalityArchetypes`, `CharacterTraits`, `CharacterReflections`, `CharacterGoals`, `CharacterVariants`, `VariantSeedEvents`, `dossierPolicy`, `dossierGoals`, `MoodPad`. Pre-existing unrelated baseline failures (ConditionBeat counter tests, EndScreen reset, ConversationPromptBuilder format, ttsWait timing) reproduce on main and are untouched.

---

## 2026-04-29: Character System — Steps 2–4 Complete (Affect, Memory, Dossier) (v0.9.42)

### Overview

Three more layers of the rich-character roadmap shipped in this release. Step 2 (LLM dossier with Mode A re-anchoring) wires character data into AI Dialog Tree and AI Conversation prompts so the LLM stays anchored to the canonical Character record across long conversations. Step 3 (per-character narrative memory) is a pure derived view over existing beat / choice history sliced per character — automatically included in the dossier as a "Recent interactions" block. Step 4 (mood + sentiments MVP) introduces a typed runtime model for character emotional state, the new UpdateAffect beat for in-graph mood / sentiment changes, ConditionBeat operators on mood / sentiment for branching logic, an Affect tab in the Character Editor for authored initial state, an affect-slider Inspector control with qualitative live previews, a Character Affect panel in the Preview Window's debug sidebar, and (this release's most important design refinement) **affect-as-effects on dialog choices and nodes** so authors don't need a separate UpdateAffect beat for every choice that touches emotion.

The User Guide was also rewritten in this window: Part 9 (Version Control & Collaboration) is fresh, the character-combobox section reflects the v0.9.41 Inspector changes, and the FAQ collaboration entry points at the v0.9.38+ menu items.

### Step 2 — Character Dossier with Mode A Re-anchoring

When an AI beat's NPC field links to a defined Character, the runtime now synthesises a natural-language dossier from the Character's authored data plus current character-scoped state (counters / variables / flags) and prepends it to the LLM prompt as a "stay in character; the facts below are canonical" block. Built fresh on every turn so personality drift across long conversations is structurally prevented — the design doc's central concern about LLM character coherence.

The `buildDossier(character, options)` utility produces a compact text block with the Character's identity (name, role suffix when not 'npc'), description, tags, and an optional "Current state" section. `buildDossierForRef(ref, characters, contextLike)` wraps it with auto-resolution of the ref + auto-pull of state from the StoryContext. Both AIDialogTreeBeat and AIConversationBeat now build the dossier once after the StoryContext is in scope and pass it into every prompt construction (re-anchoring policy, Mode A from the design doc).

**Files modified:**
- `packages/core/src/utils/dossier.ts` (new)
- `packages/core/src/utils/index.ts`
- `packages/core/src/utils/ConversationPromptBuilder.ts`
- `packages/core/src/beats/AIConversationBeat.ts`
- `packages/core/src/beats/AIDialogTreeBeat.ts`
- `packages/core/tests/utils/dossier.test.ts` (new)

### Step 3 — Per-Character Narrative Memory

Pure derived view over existing data — no new state, no runtime cost beyond a single linear walk per query. Powers the dossier's "Recent interactions" block and unblocks future per-character UI features.

`narrativeMemory.ts` exports four query functions: `beatsForCharacter` (visit history sliced per character with role tags: speaker, dialog-speaker, inventory-holder/source/target, npc), `choicesForCharacter` (choice records made in beats involving the character), `interactionsForCharacter` (combined timeline tagged kind=beat/choice), and `relationshipBetween(a, b)` (shared beats + shared choices, symmetric). Match logic mirrors `findReferencesByName` from Step 1.d.5 — characterRef-id wins, then case-insensitive name/displayName via `resolveCharacter`.

`buildDossierForRef` now auto-derives interactions when the contextLike exposes `getStory()` / `getHistory()` / `getChoiceHistory()` — which StoryContext implements — so AI beats picked up the new dossier section without any call-site changes. Choice entries summarise as `chose "<text>"` to keep token budget bounded; default cap is 8 most-recent.

**Files modified:**
- `packages/core/src/utils/narrativeMemory.ts` (new)
- `packages/core/src/utils/dossier.ts`
- `packages/core/src/utils/index.ts`
- `packages/core/tests/utils/narrativeMemory.test.ts` (new)

### Step 4 — Mood + Sentiments MVP, End-to-End

The first real new authoring feature. Five sub-pieces shipped over multiple commits:

**Runtime (Step 4 part 1).** Two new typed state slots on StoryContext: `characterMoods: Record<charId, CharacterMood>` (2D continuous, valence × arousal, each clamped to [-1, 1]) and `characterSentiments: Record<charId, Sentiment[]>` (directed emotional memory — `{toEntityRef, emotion, strength, createdAt}`). Accessors: `getCharacterMood / setCharacterMood / nudgeCharacterMood`, `getCharacterSentiments / getSentimentTo / addCharacterSentiment` (strengthens an existing `(target, emotion)` row in place rather than duplicating). Events fire on change so future debug panels can subscribe without polling. Forward-compatible serialization — older saves load with empty defaults. The dossier auto-renders mood as natural language ("happy, alert (valence 0.62, arousal 0.30)") and top-N sentiments by absolute strength ("intense trust toward player").

**Beat (Step 4 part 2).** `UpdateAffectBeat` invisible beat with one combined surface that handles mood deltas (`moodValenceDelta` / `moodArousalDelta`) AND sentiment recording (`sentimentTarget` + `sentimentEmotion` + `sentimentDelta`) in a single beat. Combined-beat decision documented in the commit log: splitting into UpdateMood + UpdateSentiment was considered and rejected — the cognitive overhead of a second invisible beat doesn't pay for itself.

**Conditions (Step 4 part 3).** `ConditionBeat` gained two new types: 'mood' (with `moodAxis: 'valence' | 'arousal'`) and 'sentiment' (with `sentimentTarget`, optional `sentimentEmotion` — when emotion is omitted, the runtime sums strengths across all emotions toward the target as an "overall feeling toward X" scalar). All six standard operators (`==`, `!=`, `>`, `<`, `>=`, `<=`) supported.

**Inspector affect-slider control.** New `'affect-slider'` schema control type renders range inputs with end-cap labels ("← sadder / happier →") and a live qualitative preview ("Direction: happier") for non-trivial deltas. Used by UpdateAffect's three delta fields. Vocabulary comes from the same `describeMoodAxis` helper the LLM dossier uses, so authors and the AI see the same words for the same numbers.

**Authored initial mood + sentiments on the Character record.** New Affect tab in the Character Editor with two clamped sliders (valence + arousal) and a row-based sentiment editor. Authored values seed into runtime state on context creation, on `setStory()`, and on `reset()` — so a story restart begins from the same emotional starting point each time. Seeding never overwrites in-flight runtime values; reset clears first then re-seeds. Out-of-range authored values are clamped on seed.

**Runtime affect display in Preview Window.** New `<CharacterAffectPanel>` component mounted in the Debug Info sidebar shows, for each defined Character: name + colour dot, two horizontal mood bars with centre-pivot fills, the qualitative summary, and top-N sentiments with intensity word + emotion + resolved target name. Re-renders live on `characterMoodChanged` / `characterSentimentChanged` events. "Neutral" badge when there's nothing emotionally interesting to show.

**Affect as Effects on choices and nodes (this release's most important design refinement).** The `Effect` type gained `'nudgeMood'` and `'addSentiment'` variants so `DialogChoice.effects` and `DialogNode.effects` (and any other beat that hosts effect arrays) can update character affect inline. The DialogTree effect editor exposes both as new options with appropriate per-type fields. The UpdateAffect beat is kept (logic beats can't host effects, and the beat is still useful as a discrete graph-level marker), but the common choice-driven case now lives where it belongs — alongside counter, variable, and inventory effects on the choice itself. Without this, every emotionally-loaded choice would have required a separate UpdateAffect beat after it, which would have made graphs unreadable.

**Files modified:**
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/beats/UpdateAffectBeat.ts` (new)
- `packages/core/src/beats/BeatRegistry.ts`
- `packages/core/src/beats/ConditionBeat.ts`
- `packages/core/src/utils/dossier.ts`
- `packages/core/src/utils/index.ts`
- `packages/core/tests/engine/CharacterMoodAndSentiments.test.ts` (new)
- `packages/core/tests/engine/MoodSentimentConditions.test.ts` (new)
- `packages/core/tests/engine/CharacterAffectSeeding.test.ts` (new)
- `packages/core/tests/engine/AffectEffects.test.ts` (new)
- `packages/core/tests/beats/UpdateAffectBeat.test.ts` (new)
- `packages/builder/src/types/character.ts`
- `packages/builder/src/components/SchemaFormGenerator.tsx`
- `packages/builder/src/components/characters/CharacterEditor.tsx`
- `packages/builder/src/components/characters/CharacterAffectPanel.tsx` (new)
- `packages/builder/src/components/characters/__tests__/CharacterAffectPanel.test.tsx` (new)
- `packages/builder/src/editors/ChoiceEffectsEditor.tsx`
- `packages/builder/src/pages/PreviewWindow.tsx`
- `beat-definitions/core-beats.json`

### Test Coverage

Total character-feature test count is now **194 tests across 15 files** (143 core + 51 builder), all passing. Pre-existing unrelated failures (ConditionBeat counter tests, EndScreen reset, ConversationPromptBuilder "CONVERSATION RULES" stale assertion, ttsWait timing flake) reproduce on main and are untouched.

### Documentation

User Guide pass during the release window — Part 9 (Version Control & Collaboration) was a full rewrite, the character-combobox section was lightly polished, and the FAQ collaboration entry was rewritten to point at v0.9.38+ menu items.

**Files modified:**
- `docs/USER_GUIDE.md`

---

## 2026-04-29: Character System — Step 1 Complete + Dialog Edit-Button Fix (v0.9.41)

### Overview

Closes Step 1 of the rich-character roadmap (`docs/Character-State-Design.md`). Character finally graduates from "inspector metadata" to a real runtime identity: a stable Character.id ref now flows through every place an author types a character name, the runtime resolves any of (id / name / displayName) to one canonical key, and the inspector exposes a single hybrid combobox component used for **all** character inputs across the app — per-beat speaker, dialog-tree per-node speaker, AddRemoveInventory's three character fields, and AI beats' NPC name. Free-text speakers still work; "Define as Character" promotes them with a one-click bulk re-link of every other beat referencing that name. Plus a small but visible fix: nested NPC responses in the dialog editor regained their edit-pencil button (was being covered by the remove-X overlay shipped earlier).

### Character System — Step 1 Complete (Layer 2 of the rich-character roadmap)

The full vertical slice from runtime → schema → editor UX → consolidation flow.

**Runtime (`@asaps/core`)** — `resolveCharacter` / `resolveCharacterKey` / `isKnownCharacter` utilities map any string ref (id, name, displayName, case-insensitive) to one canonical bucket key. Three new namespaced state slots on `StoryContext` — `characterCounters`, `characterVariables`, `characterFlags` — sit alongside the existing flat globals, with full accessor methods and serialization round-trip. The four character-inventory methods now route to id-keyed buckets and lazy-merge legacy alias buckets on first touch. Each beat and dialog node persists an optional `characterRef` field; `Beat.getResolvedSpeaker(characters)` returns the canonical id + display name + full character record for renderers and TTS routing.

**Inspector UX (`@asaps/builder`)** — single new component `<CharacterRefField>` is the chokepoint for every character-input site. The dropdown shows pinned options, defined Characters with color dots, "Used names" with usage counts gathered from across the project, and a "+ Define '<typed>' as a Character" link when the typed text isn't already defined. Picking a defined Character writes the canonical id; typing a new name keeps it as free text — no auto-creation, no character bloat. The same component drives:
- Per-beat speaker section (every beat type)
- DialogTree per-node speaker (each node independently links or stays inline; multi-character conversations work naturally)
- AddRemoveInventory's `character` / `fromChar` / `toChar` (with "Player" pinned at the top, preserving the special routing semantics)
- AIDialogTree / AIConversation NPC field (with linked-personality auto-fill from the Character's description into `npcPersonality` when the slot is empty)

**Bulk re-link consolidation** — when the user clicks "Define '<name>' as a Character", the Character Manager prefills with that name, the user fills in details and saves, and a confirmation dialog then offers to link every other beat field currently referencing that name as free text. One click, all matching speakers / inventory characters / NPC names switch to the canonical id and start following renames automatically. Refs already linked to other Characters are skipped — explicit links are never silently overwritten.

**Storage contract** — every `<CharacterRefField>` site stores either a Character.id or a free-text string in the existing parameter, plus (where the schema supports it) a sibling `characterRef`. The runtime resolver accepts both forms equally, so existing data works unchanged from before Step 1 and new linked references gain id-stability incrementally as authors choose.

**Tests** — 92 new tests across the slice (52 in core covering resolver, namespaced state, inventory aliasing, characterRef on Beat + DialogNode; 40 in the builder covering the combobox, the used-names hook, and the bulk re-link utilities). Zero regressions in either package — the only failing tests in the suite reproduce on main and are unrelated.

**Files modified:**
- `packages/core/src/utils/characterRef.ts` (new)
- `packages/core/src/utils/index.ts`
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/src/beats/Beat.ts`
- `packages/core/src/beats/DialogTreeBeat.ts`
- `packages/core/src/generated/beat-types.ts`
- `packages/core/tests/utils/characterRef.test.ts` (new)
- `packages/core/tests/engine/CharacterScopedState.test.ts` (new)
- `packages/core/tests/engine/CharacterInventoryAliasing.test.ts` (new)
- `packages/core/tests/beats/BeatCharacterRef.test.ts` (new)
- `packages/builder/src/components/characters/CharacterRefField.tsx` (new)
- `packages/builder/src/components/characters/useUsedNames.ts` (new)
- `packages/builder/src/components/characters/relinkReferences.ts` (new)
- `packages/builder/src/components/characters/BulkRelinkDialog.tsx` (new)
- `packages/builder/src/components/characters/CharacterManager.tsx`
- `packages/builder/src/components/characters/__tests__/CharacterRefField.test.tsx` (new)
- `packages/builder/src/components/characters/__tests__/useUsedNames.test.ts` (new)
- `packages/builder/src/components/characters/__tests__/relinkReferences.test.ts` (new)
- `packages/builder/src/components/SchemaFormGenerator.tsx`
- `packages/builder/src/components/Inspector.tsx`
- `packages/builder/src/editors/DialogTreeEditor.tsx`
- `packages/builder/src/App.tsx`
- `beat-definitions/core-beats.json`
- `docs/Character-and-KG-Sequencing.md` (new — sequencing plan with the proposed knowledge-graph track)

### DialogTree Editor — Edit Button Restored on Nested NPC Responses

The remove-NPC-response button shipped in v0.9.36 was absolute-positioned at the top-right of the nested bubble — directly on top of the recursively-rendered NPC node's existing edit pencil at the same corner. The X overlay covered the pencil, leaving authors able to remove a nested NPC response but not edit it. Fix threads an `onRemoveSelf?: () => void` callback into `renderDialogNode`; when present, the inner NPC bubble renders BOTH the edit pencil and the remove X inline next to each other. Removal behaviour is unchanged — same parent-choice preservation, same collapsible-pattern target keep.

**Files modified:**
- `packages/builder/src/editors/DialogTreeEditor.tsx`

---

## 2026-04-29: GitHub Onboarding — Fixed `git init` Skipped When Ancestor Is a Repo (v0.9.40)

### Overview

Hot-fix for a v0.9.39 bug report. New-Project-on-GitHub jumped straight from "Wrote project scaffold" to `gh repo create --source=.`, which then failed with "current directory is not a git repository". The new project folder never got a `.git` because the init was being silently skipped.

### Root Cause

`git rev-parse --is-inside-work-tree` and `git log -1` both walk upward through the directory tree looking for a containing repo. If any ancestor of the new project folder is itself a git repo — and this is the common case for users who keep projects under `~/Documents/GitHub/`, or anywhere under another checkout — those commands returned success and `ensureGitRepo` / `makeInitialCommit` returned early without creating `.git` in the new folder.

### Fix

Both helpers now use `git rev-parse --show-toplevel` and compare the resolved root against `projectPath`:
- **Skip init** only when the project folder *is* the repo root.
- **Skip the initial commit's "already has commits" check** likewise — only consult `git log -1` when `--show-toplevel` matches our folder.
- When an ancestor is a repo, the log shows a "Note: ancestor folder is a git repo (…); initialising a fresh repo in (…)." line and proceeds with init in the new folder regardless.

The same fix applies transitively to all three GitHub-onboarding entry points (New-Project-on-GitHub, VCS panel's Create-new-repo form, VCS panel's Connect-existing-repo form) since they share `GitInitHelper.ts`.

**Files modified:**
- `packages/builder/src/vcs/GitInitHelper.ts`

---

## 2026-04-29: GitHub Onboarding Fixes + Character System Step 1 (v0.9.39)

### Overview

Bugfix release for the GitHub onboarding flow shipped in v0.9.38, plus the foundational refactor (Step 1 of the character roadmap) that turns Character from inspector metadata into a real runtime identity. Two separate issues blocked first-time GitHub users — `git init -b main` failing on Git versions older than 2.28, and the initial commit failing with "unable to auto-detect email address" because `gh auth login` doesn't set git's commit identity. Both are fixed and the duplicated init+commit logic is consolidated. Internally, Character refs now resolve through a single chokepoint with id-keyed state, and inventory aliases collapse into the canonical bucket on first touch.

### GitHub Onboarding — Fixed "git init failed" on Older Git Versions

`git init -b main` (the default-branch flag) only landed in Git 2.28 (Aug 2020). Anyone on an older Git binary — common on locked-down corporate macOS, some Linux distros, and any Git installation predating that release — got `error: unknown switch 'b'` and the New-Project-on-GitHub flow stopped at step 1 with no useful diagnostic. Replaced the `-b main` flag with the older-Git-compatible idiom `-c init.defaultBranch=main` plus an explicit `git symbolic-ref HEAD refs/heads/main` after init. The combination behaves identically on modern Git and lands on `main` (rather than `master`) on every legacy Git the app might encounter.

**Files modified:**
- `packages/builder/src/vcs/GitInitHelper.ts` (new)

### GitHub Onboarding — Auto-Set Local user.name / user.email from `gh api user`

A subtle confusion in the v0.9.38 flow: `gh auth login` provisions a *GitHub* token for HTTPS pushes, but `git commit` requires the *git* `user.name` / `user.email` config — a totally separate identity that's empty on a fresh machine. Users hitting "Create and publish" with gh authenticated but no git identity were getting `fatal: unable to auto-detect email address` and a hard stop. Fix: before the initial commit, query the authenticated GitHub user via `gh api user` and write the values into the **local repo's** git config (never `--global` — the app must not silently mutate machine-wide identity). Falls back to GitHub's noreply form (`<id>+<login>@users.noreply.github.com`) when the user has set their email private. The first commit now succeeds without any manual config.

**Files modified:**
- `packages/builder/src/vcs/GitInitHelper.ts` (new)
- `packages/builder/src/components/vcs/NewGitHubProjectDialog.tsx`
- `packages/builder/src/components/vcs/VCSOnboardingPanel.tsx`

The same logic is reused by all three GitHub-onboarding entry points (New Project on GitHub, VCS panel's Create-new-repo form, VCS panel's Connect-existing-repo form), removing three near-duplicate copies of the init+commit code in the process.

### Character System — Step 1 Foundation (Layer 2 prerequisite)

First slice of the rich-character roadmap (`docs/Character-State-Design.md`). The piecemeal feeling of having a real `Character` class but a runtime that treats characters as name strings is being addressed in stages; this release ships the foundation that unblocks every subsequent layer.

**Resolver utility** — new `packages/core/src/utils/characterRef.ts` exports `resolveCharacter`, `resolveCharacterKey`, and `isKnownCharacter`. Any string ref (Character.id, name, or displayName) resolves to a single canonical bucket key, falling through to the original ref unchanged for inline / legacy personas so they still get coherent storage.

**Character-scoped state slots on StoryContext** — three new namespaced maps alongside the existing flat globals:
- `characterCounters: Record<charId, Record<name, number>>`
- `characterVariables: Record<charId, Record<name, any>>`
- `characterFlags: Record<charId, Record<name, boolean>>`

Each gets a getter / setter pair (and an `incrementCharacterCounter`) that accept any ref form, route through the resolver, and emit per-namespace events. Existing un-namespaced `variables` / `counters` continue to work for story-global state — character scope is opt-in. State survives `serialize` / `loadFromSerialized` round-trips and is forward-compatible with older save files (missing fields default to empty objects).

**Inventory alias unification** — the four character-inventory methods (`addInventoryItem`, `removeInventoryItem`, `hasInventoryItem`, `getCharacterInventoryQuantity`) now resolve their character arg to canonical id and route to the id-keyed bucket. On first touch of a known character, `ensureCanonicalCharacterBucket()` walks the in-memory `characterInventories` map and merges any buckets keyed by alias strings (name, displayName, or arbitrary legacy refs) into the canonical bucket, summing item quantities. Alias buckets are then deleted — serialized state ends up canonical, not fragmented. `'player'` and empty refs continue to route to the global single inventory unchanged. `inventoryChanged` events now fire with the canonical character id.

**Tests** — 39 new tests covering the resolver, namespaced state, and inventory alias migration. All pass; no regressions in core (the 28 pre-existing failures in `ConditionBeat` / `EndScreenBeat` / `ConversationPromptBuilder` / `ttsWait` reproduce on main and are unrelated).

**Documentation** — new `docs/Character-and-KG-Sequencing.md` captures the agreed sequencing between the rich-character roadmap and the proposed knowledge-graph track (cultural-adaptation experiment), including four intersection points to decide before the parallel-track phase begins (Sentiment ↔ KG edge unification, goals as outgoing semantics, versioning model, beat content vs. KG references).

**Files modified:**
- `packages/core/src/utils/characterRef.ts` (new)
- `packages/core/src/utils/index.ts`
- `packages/core/src/engine/StoryContext.ts`
- `packages/core/tests/utils/characterRef.test.ts` (new)
- `packages/core/tests/engine/CharacterScopedState.test.ts` (new)
- `packages/core/tests/engine/CharacterInventoryAliasing.test.ts` (new)
- `docs/Character-and-KG-Sequencing.md` (new)

This is foundation only — the user-facing character experience is unchanged. Step 1.c (`characterRef` field on dialog speakers), Step 2 (NPC-persona promotion + LLM dossier), and Step 3 (per-character narrative-memory query view) build on top in following releases.

---

## 2026-04-29: GitHub Onboarding for First-Time Users + GH↔GH Switch Fix (v0.9.38)

### Overview

A focused release on the version-control entry experience. Authors who have never used Git or GitHub now have a guided path from "I want to back up my project" to "my project is on GitHub" without leaving ASAPS — the app detects whether `git` and `gh` are installed, helps install them with platform-aware copy-paste commands, runs `gh auth login` interactively (streaming output back to the renderer so the device-code prompt is visible), and finally creates an empty GitHub repo and publishes the project to it. The same onboarding kicks in when an author tries to **open** a GitHub project (e.g. clicking through a collaboration invite) but isn't tooled-up yet. Plus a sneaky cross-project bug where switching between two GitHub-based projects left the previous project's origin URL on screen.

### File Menu — "New Project on GitHub..." + Renamed "Open Project from GitHub..."

Two entries in the File menu now anchor the GitHub flows:

- **New Project on GitHub...** — creates a directory-format project on disk, runs `git init -b main`, makes an initial commit, then `gh repo create <user>/<name> --source=. --remote=origin --push --private` in one shot. The author picks a parent folder, project name, and visibility (private by default — going public→private after pushing is too late).
- **Open Project from GitHub...** (formerly "Clone Repository...") — same dialog as before for the URL, just relabelled because authors weren't sure what "clone" meant. Same code path under the hood.

Both menu items are gated behind the same onboarding component, so a first-time user gets the install-tools experience whether they're creating or joining a project.

**Files modified:**
- `apps/builder-desktop/src/main/index.ts`
- `apps/builder-desktop/src/preload/index.ts`
- `packages/builder/src/components/vcs/NewGitHubProjectDialog.tsx` (new)
- `packages/builder/src/components/vcs/CloneRepoDialog.tsx`
- `packages/builder/src/App.tsx`

### Tools Detection — `git` / `gh` / `gh auth status`

New `ToolsDetector` runs on session start and exposes `tools`, `toolsChecking`, `recheckTools()` on the VCS context. Detection is cached for the session — tools rarely appear/disappear mid-run, and re-running `gh auth status` after an explicit auth completion keeps the UI honest. A "Re-check" button is offered everywhere onboarding is shown.

**Files modified:**
- `packages/builder/src/vcs/ToolsDetector.ts` (new)
- `packages/builder/src/vcs/VCSStatusProvider.tsx`

### Onboarding Panel — Install → Auth → Repo Wiring

`VCSOnboardingPanel` is the shared UI that both menu flows fall through to when something is missing:

1. **Tools missing** — a status table (Git ✓/✗, GitHub CLI ✓/✗) plus platform-aware install commands. macOS gets `brew install git gh`, Windows gets the matching `winget install --id` pair, Linux falls back to `sudo apt install git gh`. Each command has a Copy button and direct installer links via `shell.openExternal` for users who'd rather double-click an installer.
2. **Not authenticated** — a "Sign in with GitHub" button runs `gh auth login --web --git-protocol https --hostname github.com` through a brand-new streaming IPC channel. The renderer listens to `vcs:stream-data` chunks and shows the device-code prompt + URL in a log box, so the user sees exactly what to paste in the browser. Cancel button kills the spawned process via `vcs:stream-cancel`.
3. **Authed but no remote** — two paths: "Create new GitHub repo" (project name + visibility) or "Connect to existing empty repo" (paste URL). Both ensure a local git repo + initial commit exist before touching the remote.

**Files modified:**
- `packages/builder/src/components/vcs/VCSOnboardingPanel.tsx` (new)
- `apps/builder-desktop/src/main/index.ts` — new `vcs:run-streaming` and `vcs:stream-cancel` handlers backed by `child_process.spawn`
- `apps/builder-desktop/src/preload/index.ts` — exposes `electronAPI.vcs.runStreaming`, `cancelStream`, `onStreamData`, `onStreamEnd`

### VCS Cross-Project Contamination — Origin URL Stuck on Project A

Switching from one GitHub-based directory project to another left the VCS state (origin URL, branch, ahead/behind, history) pointing at the **previous** project. Only switching to a non-VCS project triggered a clear, because the auto-init effect's `else if` branch fired only on `projectFormat !== 'directory'`.

The auto-init effect now compares `vcs.projectPath` against the new `projectPath` and re-initialises (with a clean `vcs.clear()` first) whenever they diverge. The `!vcsInitialized` short-circuit was the culprit: after project A initialised, `vcsInitialized` stayed `true`, so the effect never re-ran for project B even though the path changed.

**Files modified:**
- `packages/builder/src/App.tsx`

### Asset Manifest Scaffold — `_format` Required Key

The empty manifest written for newly-created GitHub projects was missing the `_format` field that `parseManifest` requires; opening the freshly-created project crashed with "Invalid asset manifest". Scaffold now writes `{ _format: '1.0', assets: {} }`.

**Files modified:**
- `packages/builder/src/components/vcs/NewGitHubProjectDialog.tsx`

---

## 2026-04-28: Cross-Project Contamination + Git Fetch Reload (v0.9.37)

### Overview

A small but high-impact bugfix release targeting two follow-ups to v0.9.36's persistence work, plus a desktop-build fix that authors don't see directly but matters for everyone shipping releases. Loading project B right after project A no longer leaves traces of A on screen — the previously-open overlay panels (Character Manager, Asset Manager, Settings, Debug, Search) now close on switch and stale asset blob URLs are cleared immediately. The Git "Fetch" button now actually refreshes the project on disk so newly-pulled beat/asset files appear in the UI without restarting the project. And the Electron packaged build no longer crashes on launch with `Cannot find module 'chokidar'`.

### Project Switch — Overlay Panels & Asset URLs No Longer Leak Across Projects

When opening a different directory project (File → Open Project Folder, or Clone Repo) right after another, both flows pre-cleared `loadedProjectIdRef.current = null` before calling `openDirectoryProject`. That clear forced the project-load effect into the lighter "REPLACING" branch, which only resets `selectedBeat`/`selectedCluster`. The more thorough "switching" branch — the one that closes the open overlay panels and resets project-specific UI — never ran, so any panel that was open when the user opened a new project kept rendering project A's content even though state.beats and the rest had moved to project B.

- `App.tsx` menu/clone handlers no longer clear `loadedProjectIdRef.current` before `openDirectoryProject` — the ref keeps the previous project's ID so the load effect detects an actual switch and runs the full cleanup.
- `setAssets([])` now fires immediately at the start of both the switching and REPLACING branches so previous project blob URLs vanish before the async asset reload finishes.
- The REPLACING branch also got the panel closures (`setShowCharacterManager(false)`, etc.) as defense-in-depth for the first-load case.

**Files modified:**
- `packages/builder/src/App.tsx`

### Git Fetch — Project Reloads From Disk Automatically

The Fetch button updated remote refs but the in-memory project wasn't reloaded, so authors had to switch projects and back to see newly-pulled beat files / asset changes / settings appear. `IncomingChangesTab.handleFetch` now dispatches `asaps:git-reset` after a successful fetch, the same event Pull already used. If nothing changed on disk it's a quick no-op; if something did, the project reloads visibly.

**Files modified:**
- `packages/builder/src/components/vcs/IncomingChangesTab.tsx`

### Desktop Packaging — Bundle `chokidar` and `electron-updater` Inline

The packaged macOS / Windows desktop app crashed on launch with `Cannot find module 'chokidar'` (and after that's resolved, `'electron-updater'`). Root cause: both packages are runtime dependencies of `apps/builder-desktop` but live in the workspace-hoisted root `node_modules`. electron-builder's "no node modules found in collection" warning is real — it doesn't follow workspace hoisting, so neither module ended up in `app.asar`. The vite-bundled main process tried to `require()` them at runtime and failed.

- `apps/builder-desktop/vite.config.ts` no longer marks `chokidar` or `electron-updater` as `external`. Rollup now bundles both inline into `dist-electron/main/index.js` (≈ 535 KB), so the packaged app doesn't need them resolvable from `node_modules` at runtime.
- `fsevents` stays external — it's a native module that chokidar requires dynamically and falls back gracefully if missing.

**Files modified:**
- `apps/builder-desktop/vite.config.ts`

---

## 2026-04-27: Persistence + Authoring UX Fixes Across Git, Assets, Dialog & Cluster Flows (v0.9.36)

### Overview

A grab-bag bugfix release driven entirely by author feedback against v0.9.35, focused on long-running paper-cuts in the Git/asset workflow plus three smaller authoring fixes. The biggest of these: assets now actually delete from disk in directory-format projects (so they stop being re-pushed to GitHub after the author "removes" them), and Git LFS is no longer auto-configured for asset binaries (the source of clone/pull losing assets entirely on systems where git-lfs was installed). Plus: HistoryTab no longer leaks the previous project's commits when switching projects, the Missing Assets dialog actually persists its actions instead of silently no-op'ing, NPC responses in DialogTree gain a delete button, and several smaller cleanup items.

### Asset Deletion Round-Trip — IndexedDB ↔ Filesystem ↔ Git

Removing an asset in the UI was clearing IndexedDB metadata only; the binary on disk lingered in the directory project's `assets/` folder, and the manifest entry stayed. So next git commit re-pushed the binary, and the missing-assets validator kept flagging the entry on every reload.

- New `DirectoryAdapter.deleteAsset(assetId)` removes the binary on disk **and** prunes the corresponding entry from `assets/_manifest.json`. Also drops the entry from the in-memory `lastManifest` cache so subsequent merge-style saves don't resurrect it.
- `PersistenceContext.deleteAssetFromDirectory(assetId)` exposes that adapter method and is wired through the `useProject` hook. App's `handleAssetRemove` now invokes it after the IndexedDB delete.

**Files modified:**
- `packages/builder/src/storage/adapters/DirectoryAdapter.ts`
- `packages/builder/src/contexts/PersistenceContext.tsx`
- `packages/builder/src/App.tsx`

### Git LFS Removed from Auto-Generated `.gitattributes`

The directory format's bootstrap `.gitattributes` declared `assets/**/* filter=lfs`. On any author with `git-lfs` installed, push uploaded LFS pointers to GitHub LFS storage (often without LFS being enabled on the remote), and the in-app clone/pull then ended up with pointer files instead of the actual binaries — so assets visible on github.com simply never came back to a fresh clone.

- New template uses explicit `*.png binary`, `*.mp3 binary`, etc. instead of an LFS filter — git treats them as plain blobs which is what ASAPS actually wants.
- `DirectoryAdapter.saveProject` now auto-migrates existing projects whose `.gitattributes` still contains `filter=lfs` — the next save rewrites the file with the new template. Other VCS helper files (`.gitignore`, `.p4ignore`) keep their preserve-on-exist behaviour.

For existing repos that already pushed LFS pointers, authors need a one-time `git lfs migrate import --everything` + `git push --force` to convert past pointers back to blobs. The new behaviour is in effect automatically going forward.

**Files modified:**
- `packages/core/src/persistence/DirectoryFormat.ts`
- `packages/builder/src/storage/adapters/DirectoryAdapter.ts`

### History Tab — No More Cross-Project Commit Leak

Switching/cloning into a new repo briefly showed the previous project's commit log because `HistoryTab` kept its prior commits in component state during the async window between `vcs.projectPath` changing and the new `loadCommits` resolving. The effect now clears `commits`/`expandedHash`/`hasMore` synchronously before the fetch.

**Files modified:**
- `packages/builder/src/components/vcs/HistoryTab.tsx`

### Missing Assets Dialog — Path Bug Fixed; Remove Missing Now Sticks

Locate, Relocate All, and Remove Missing all targeted `<root>/_manifest.json` while the manifest actually lives at `<root>/assets/_manifest.json`. The validator joins `assets` correctly, but the dialog handlers hadn't — so all three actions silently failed, and the popup re-appeared on every launch with the same stale entries. The dialog now normalises the assets-dir path once at the boundary and uses it consistently. Remove Missing also fires `onRepaired()` + `onClose()` on success so the dialog actually goes away.

**Files modified:**
- `packages/builder/src/components/settings/MissingAssetsDialog.tsx`

### DialogTree — Delete Button on NPC Responses

Player choices have an X to remove them; NPC responses didn't, so authors couldn't undo "Add NPC response..." without nuking the whole player choice. New `removeNestedDialogAtPath` removes just the NPC response from a parent player choice — the player choice stays (with its onward target reset to "Select action…"), and any nested player choices that were inside the removed NPC response disappear with it. For the collapsible `[Continue] → NPC → exit` pattern, the exit target is preserved on the parent choice so the conversation still flows somewhere obvious. Tooltip + code comment spell out exactly what disappears (preceding player choice stays, subsequent choices inside the response go).

**Files modified:**
- `packages/builder/src/editors/DialogTreeEditor.tsx`

### Background Sound — Asset Picker No Longer Errors on Import

Selecting an MP3 in an empty project's Background Sound picker raised "r is not a function". Root cause: a separate `<Inspector>` mount in `App.tsx` (distinct from the WorkspaceView path) was rendered without `onAssetAdd / onAssetRemove / onAssetUpdate`, while the modal internally non-null-asserts those props (`onAssetAdd!`). When the asset upload tried to invoke them, `undefined()` minified to "r is not a function". Wired the three handlers in. Also dropped the misleading `subType: sfx` filter for the 'sound' picker (background music isn't a sound effect — the previous tagging was filtering correctly but mislabelling the modal).

**Files modified:**
- `packages/builder/src/App.tsx`
- `packages/builder/src/components/Inspector.tsx`

### Cluster — `+ Beat` Buttons Removed; Drag-into-Cluster Works

The `+ Beat` button on cluster headers (both collapsed and expanded views) only ever produced a fixed beat type, which wasn't useful — beat creation lives in the sidebar palette. Buttons removed; the App-level handler is now a no-op.

In return, beats can now be **dragged directly onto an expanded cluster from the flowchart**, mirroring the sidebar→cluster drop flow. `GraphEditor.onNodeDragStop` checks the drop position against each cluster's bounds and fires `onDropBeatToCluster` for a hit (and skips the redundant case where the beat is already in that cluster).

**Files modified:**
- `packages/builder/src/components/graph/ClusterContainerNode.tsx`
- `packages/builder/src/components/graph/GraphEditor.tsx`
- `packages/builder/src/App.tsx`

---

## 2026-04-27: Electron Parity Fixes & Path Tree Decision Panel (v0.9.35)

### Overview

A focused follow-up to v0.9.34 that closes two regressions affecting the desktop (Electron) build only — the live red flowchart trace and the pop-out Debug window — both of which worked in the web build but were broken in Electron because the necessary IPC channels didn't exist. Also adds a long-requested **Decision Path side panel** to the Path Tree analyzer so authors can read their current scenario as a linear list while exploring the tree on the left.

### Electron IPC: Preview Window → Main Builder (live red trace)

The PW posts `VISITED_BEATS_UPDATE` messages so the main builder can paint the red flowchart trace. In the web build that goes through `window.opener.postMessage`. In Electron there was no equivalent path: the preload exposed only main→preview messaging (`preview.sendMessage`), with no preview→main return channel. The PW called `electronAPI.preview.sendToMain(…)` but that method didn't exist.

- Preload: new `preview.sendToMain(message)` that fires `ipcRenderer.send('preview:send-to-main', …)`
- Preload: new top-level `onPreviewMessageToMain(callback)` for the main builder window to subscribe
- Main process: new `ipcMain.on('preview:send-to-main', …)` that forwards to `mainWindow.webContents.send('preview:message-to-main', …)`
- `PreviewWindowManager` constructor now subscribes to `onPreviewMessageToMain` in Electron and synthesises a `MessageEvent` so the existing `handleMessage` handler runs identically for web and desktop

**Files modified:**
- `apps/builder-desktop/src/preload/index.ts`
- `apps/builder-desktop/src/main/index.ts`
- `packages/builder/src/services/PreviewWindowManager.ts`

### Electron IPC: Debug Window pop-out

The pop-out Debug window opens via `window.open('#/debug-window')` on the web. In Electron, the main window's `setWindowOpenHandler` rejects every `window.open` and routes URLs to the OS browser instead — so the Debug window never opened. There was also no Electron plumbing for it.

- Main process: new `createDebugWindow()` using the same preload as the preview window, plus IPC handlers `debug:open / close / is-open / send-message / ping / send-to-main`. Window emits `debug:closed` and `debug:ready` to the main builder.
- Preload: new `debug` object (`open / close / isOpen / sendMessage / ping / sendToMain`) and top-level `onDebugMessage / onDebugReady / onDebugClosed / onDebugMessageToMain`
- `DebugWindowManager` detects Electron via `electronAPI.debug?.open`. In Electron, `open()` invokes IPC, `close()` invokes IPC, `sendStoryUpdate()` routes through `debug.sendMessage`, and a new `electronWindowOpen` flag gates sends until `debug:ready` fires (so the first story-update push isn't lost). `cleanup()` resets the flag.
- `DebugWindow.tsx`: subscribes to `onDebugMessage` in Electron and pings via `debug.ping()`. Outgoing highlight events (`HIGHLIGHT_BEAT` / `HIGHLIGHT_PATH` / `CLEAR_HIGHLIGHT`) go via `debug.sendToMain` when `window.opener` is unavailable.

**Files modified:**
- `apps/builder-desktop/src/main/index.ts`
- `apps/builder-desktop/src/preload/index.ts`
- `packages/builder/src/services/DebugWindowManager.ts`
- `packages/builder/src/pages/DebugWindow.tsx`

### Decision Path Side Panel for the Path Tree

The Path Tree left-pane gives a great hub-and-spoke view of selections, but until now there was no linear summary of "what the player committed to". Adds a sticky right-side panel showing each committed selection in tree order (numbered steps with effects pills), plus the final accumulated state — same shape as the backward analyzer's decision-path visualisation.

- New `DecisionTrailPanel` component within `PathTreeView.tsx` rendered in a 1fr/280px grid alongside the tree
- New `buildDecisionTrail(root, selections)` walks the tree once and collects exclusive selections + hub visits in display order. For radio branches, only the selected sibling is descended into so the trail stays linear; for condition branches (no committed pick) both sides are walked.
- Each entry shows beat name, the chosen label, any state effects, and a step circle (blue first, green last, grey in between). Empty state explains the panel; non-empty state has a "clear" link that drops all selections.
- Final accumulated state appears below the trail, computed from the same `computeSyntheticState` used inside the tree.

**Files modified:**
- `packages/builder/src/components/debug/PathTreeView.tsx`

### Status of #5a (Backward analyzer step-ordering bug)

Investigated against the user-reported scenario and dumped both the backward analyzer's `decisionPoints` + `pathBeats` and the forward simulator's `representativePath` for several path classes against the Hollow Star fixture. All three structures produced strictly correct execution-order data (`beat_19` consistently before `beat_20`, etc.). No reordering step exists between the analyzer and the renderer. Conclusion: not reproducible at this point — likely fixed implicitly by the v0.9.34 simulator-retry rework. Closing the item without code changes.

---

## 2026-04-24: Requirements Primitive, Live Current-Beat Marker & Authoring UX (v0.9.34)

### Overview

State **requirements** are now a first-class authoring primitive with a universal Inspector section, AND/OR combination modes, and runtime enforcement — declare "this beat needs the Lantern OR the Torch to enter, otherwise redirect to Hall" and the engine honours it. The flowchart also learns to speak the new language: requirement redirects render as dashed amber edges, the **live red trace from the Preview Window now paints on beat *enter*** (not after leaving), and the **currently-executing beat** gets a brighter, thicker, pulsing border so you can see exactly where the player is. Several analyzer bugs that surfaced during the first authors' sessions are fixed (persistence of requires on project reload, hub-retry for choices whose downstream is state-dependent, accurate outcomes count breakdown). A handful of authoring UX fixes round out the release (delete buttons for characters + assets, InputText character-picker populated correctly, InputText value no longer leaks between beats).

### State Requirements as First-Class Authoring

The analyzer-only `requires` annotation from v0.9.33 becomes a real authoring primitive — the engine honours it at runtime.

- New `StateRequirement.fallbackTarget` — when a requirement is unmet at beat-enter, the engine redirects to the fallback beat **without** running the beat's action or marking it visited. A requirement without a fallback behaves as a warning-only annotation (same as before).
- New `requiresMode: 'all' | 'any'` on every beat. 'all' (default) = every requirement must hold; 'any' = at least one must hold. Toggle shows up in the Requirements section when 2+ requirements are declared.
- Universal **Requirements** section in the Inspector (all beat types, collapsible) with a ShieldCheck icon, count badge, AND/OR combine toggle, and cards for each requirement: condition-type picker (inventory / counter / variable / visitedBeat), SmartNameDropdown-backed pickers, explanation textarea, fallback beat picker, severity dropdown.
- New `storyStateExtraction.ts` utility scans every beat for referenced items / counters / variables (addRemoveInventory, pickProp props, setVariable, conditionBeat, choice + prop + connection effects, dialogTree effects) so the Inspector dropdowns show the actual working set, not just state pre-declared on a character or in globalSettings. AI-generated stories that never pre-declare now populate the picker correctly.
- GraphEditor draws requirement redirects as **dashed amber edges** labelled `requires: <explanation>` — distinct from condition (animated amber), default-target (green dashed), and normal connections (grey solid).
- Persistence: `requires` + `requiresMode` round-trip through `Beat.toJSON()`, `BeatSerializer.serializeBeat()`, the cross-window `SerializedStoryData` used by Preview + Debug windows, AND the project-load deserializer (`projectDeserializer.ts`) — which previously whitelisted fields and silently dropped both, so requirements disappeared on project reload. Now they stick.

**Files modified:**
- `packages/core/src/types/index.ts` — `StateRequirement.fallbackTarget`, `BeatConfig.requires` + `requiresMode`
- `packages/core/src/beats/Beat.ts` — `requiresMode` field, `checkRequirementsGate()` with AND/OR semantics, `toJSON` persistence
- `packages/core/src/persistence/BeatSerializer.ts` — emit both fields
- `packages/core/tests/beats/BeatRequiresGate.test.ts` — 6 tests: AND redirect, satisfied pass-through, annotation-only warn, first-unmet precedence, OR pass-when-any-met, OR redirect-when-all-fail
- `packages/builder/src/editors/RequirementsEditor.tsx` — new component
- `packages/builder/src/utils/storyStateExtraction.ts` — new scanner + hook
- `packages/builder/src/components/Inspector.tsx` — universal Requirements section, merged state lists
- `packages/builder/src/components/graph/GraphEditor.tsx` — requires-fallback edges
- `packages/builder/src/utils/projectDeserializer.ts` — include `requires` / `requiresMode` in reconstructed `BeatConfig`, with backwards-compat for nesting under `parameters`
- `packages/builder/src/App.tsx` (`getSerializedStoryData`) + `services/PreviewWindowManager.ts` (`SerializedStoryData` type) — round-trip cross-window

### Live Current-Beat Marker on the Flowchart

The red PW trace painted beats **after** they were left (when `context.markBeatVisited` fired at the end of `Beat.execute()`). Now it paints on enter, and the current beat stands out.

- New `currentBeatId` in the `VISITED_BEATS_UPDATE` message, threaded Preview → Manager → App → Workspace → Canvas → GraphEditor → BeatNode.
- `PreviewWindow` augments the posted `visitedBeats` list with `ctx.getCurrentBeatId()` so the active beat lights up immediately.
- **BeatNode** styles past-visited beats (red-50 bg, red-600 border, 2px) distinctly from the **active beat** (red-200 bg, red-700 border, **4px**, red-500 ring with pulse).
- GraphEditor uses a focused effect that flips `pwCurrent` on only the two beats whose status changes per step — no full graph rebuild.

**Files modified:**
- `packages/builder/src/pages/PreviewWindow.tsx` — augment payload, post current beat ID
- `packages/builder/src/services/PreviewWindowManager.ts` — subscribe API delivers `{ visitedBeatIds, currentBeatId }`
- `packages/builder/src/App.tsx`, `components/WorkspaceView.tsx`, `components/Canvas.tsx` — prop pass-through
- `packages/builder/src/components/graph/GraphEditor.tsx` — focused current-beat effect
- `packages/builder/src/components/graph/BeatNode.tsx` — distinct styling for current vs past-visited

### Analyzer Fixes

- **PathTree hub retry** only re-explored hub options whose **immediate** target was a conditionBeat. Options like "Visit the crypt" that lead through an intro `infoText` to a conditionBeat (a few hops in) never got retried after state changed, so paths mis-classified as dead ends. New `branchHasStateDependence` walks up to 6 beats ahead and retries if it finds a conditionBeat or a requires-gated beat. Hollow Star goes from ~2,435 to ~7,835 simulated paths, and the "No code → Hub" dead ends disappear.
- **`requires-unfulfillable` false-positives**: the old check asked "does any simulated path reach this beat with the requirement satisfied?" — which fails for hub-and-spoke stories where some picking-up permutation is valid but un-simulated. Replaced with a structural ancestor walk: "does any upstream beat write the state this condition reads?" (setVariable, addRemoveInventory, pickProp props, choice effects, connection effects, nested dialogTree effects). Messages also include the referenced state names and fall back to a condition summary when `explanation` is empty (no more `Requirement ""`).
- **Forward Analysis outcomes count** was adding cycle/dead-end terminations alongside real endings, which made "7 outcomes" mean "4 endings + 3 simulator terminations" on stories like Hollow Star. The Outcomes card now shows a breakdown line ("4 endings + 3 cycles") with a tooltip explaining cycles/dead-ends aren't narrative outcomes.
- **Reachability / BackwardAnalyzer / ConstraintPathAnalyzer** — every outgoing-edge walk now treats `requires[].fallbackTarget` as a real edge. A beat reachable only via a requirement redirect is no longer flagged as orphaned, and `collectAncestorBeatIds` in StoryWarnings includes both `defaultTarget` and requirement fallbacks.

**Files modified:**
- `packages/core/src/analysis/StateSimulationAnalyzer.ts` — `branchHasStateDependence`, fallback edges, ending detection
- `packages/core/src/analysis/StoryWarnings.ts` — structural unfulfillable check, `beatProducesAnyOf`, enriched messages, ancestor map includes defaultTarget + fallbackTarget
- `packages/core/src/analysis/ReachabilityAnalyzer.ts` — fallback as inbound/outbound edge
- `packages/core/src/analysis/BackwardAnalyzer.ts` — fallback in outgoing targets
- `packages/core/src/analysis/ConstraintPathAnalyzer.ts` — fallback in getConnections
- `packages/builder/src/components/debug/PathVisualization.tsx` — Outcomes stat breakdown

### AI Story Generation — `aiSummary.maxLength` Coercion

AI models sometimes emitted `maxLength: 220` (a character count) for `aiSummary` beats, but the schema expects the enum `"short" | "medium" | "long"` — validation failed and the whole generation bounced.

- Prompts tightened on both the internal and MCP paths to say `"short"|"medium"|"long" — NOT a number`.
- New `autoFixAiSummaryMaxLength` in `AIService.ts` and MCP `aiHelper.ts` coerces numeric values (`< 150 → short`, `> 400 → long`, else `medium`) so generation succeeds even when the model still emits numbers.

**Files modified:**
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`
- `packages/builder/src/services/AIService.ts`
- `mcp-server/src/utils/aiHelper.ts`

### Authoring UX Fixes

- **Delete button on character cards** now shown in both grid and list views (was hidden in `selectionMode`, which is the character manager's first screen). `confirm()` prompt still gates the destructive action.
- **Delete button on assets** — `AssetSelectionModal` accepted `onAssetRemove` but never rendered a button. Added hover-revealed trash buttons on grid cards and list rows with confirmation. The main AssetManager already had delete.
- **InputText character dropdown** was empty even when characters existed: the field read a `string[]` of NPC names and then indexed `.id`/`.name`/`.displayName` on bare strings. Switched to the existing `characterObjects` prop (full `Character[]`), and included player characters since InputText is the primary way to ask "What's your name?".
- **InputText value leak across beats** — consecutive inputText beats retained the previous beat's typed text when neither had a placeholder. The reset effect keyed only on content-shape hashes, which didn't change between structurally-identical prompts. Added a `beatId` prop (plumbed from `ReactRenderer` via `currentBeatInfo`) and included it in the effect's dependency list so the field clears on every beat navigation.

**Files modified:**
- `packages/builder/src/components/characters/CharacterCard.tsx`
- `packages/builder/src/components/characters/CharacterManager.tsx`
- `packages/builder/src/components/assets/AssetSelectionModal.tsx`
- `packages/builder/src/components/SchemaFormGenerator.tsx`
- `packages/renderer/src/components/PositionedBeatView.tsx`
- `packages/renderer/src/renderers/ReactRenderer.tsx`

---

## 2026-04-23: Path Tree Analyzer, Soft-Lock Detection, Pop-Out Debug Window & PW Trace (v0.9.33)

### Overview

This release focuses on **authorial debugging and analysis**. A new **PathTree analyzer** gives authors a collapsed, interactive tree over all simulated playthroughs with hub-visit logs and scope-aware accumulated state. A new **StoryWarnings** module detects five classes of structural defects (keypad soft-locks, ungated puzzles, unfulfillable/violated `requires`) and surfaces them inline in the visit chain — so authors can see, on the analyzer, the specific state conditions that would trap a player. The **Debug Tools panel pops out into its own window** so it can be moved to a second monitor, and the **Preview Window now paints a live red trace** on the flowchart for every beat visited during a playthrough. AI configuration gains **extended thinking support for Claude** and exposes max-tokens for all providers.

### PathTree Analyzer (New)

A new collapsed-tree view over the simulated path set, exposed as a new **Tree** tab in the Path Analysis panel.

- `PathTree` builder constructs a trie of simulated paths, detects hubs via returns-to-hub analysis, classifies loop vs. exit options, and collects excursion sub-branches + items per option
- Hub options carry per-item data (label, state effects, follow-up beats) and `markVisitedOnHub` / `markVisitedOnItems` flags for dimming redundant picks
- Choice variants on same-target branches (e.g. inline dialog variants) are folded into the parent node and rendered as radio-style selections
- Condition annotations attach TRUE/FALSE result to every conditional branch in the tree

**Files modified:**
- `packages/core/src/analysis/PathTree.ts` — New analyzer (≈1 100 lines) with `buildPathTree`, hub detection, excursion collection, choice variant folding
- `packages/core/src/analysis/StateSimulationAnalyzer.ts` — State surface extensions for tree consumption
- `packages/core/src/analysis/index.ts` — Exports for `PathTreeNode`, `HubOption`, `HubOptionItem`, `BeatRef`, `StateSummary`, `ChoiceVariant`
- `packages/core/tests/analysis/PathTree.test.ts` — New tests

### Interactive PathTreeView + Hub Visit Log

The author-facing UI for the new tree, with selections and additive state composition.

- `PathTreeView` renders each `PathTreeNode` recursively with type icons, path counts, ending/dead-end badges, and expand/collapse
- **Selections** are additive, not filtering: each radio/checkbox choice contributes state effects to a scope-aware composite rather than filtering paths. Authors can now simulate combinations no single simulator path realises (needed for hub scenarios where one path can't pick multiple items)
- **Hub Visit Log**: stacked "visit cards" matching actual gameplay — the player arrives at a hub, picks an option (and optionally an item within it), its effects are committed, then the next visit card opens. Visits can be removed to rewind
- **State-aware conditional branches** inside each visit's chain: when a visit's chain contains a `conditionBeat`, the condition is evaluated against accumulated state and the TRUE/FALSE branches render with the active one highlighted and the inactive one line-through
- `walkChain` resolves linear beat segments until it hits a branching beat, ending, dead-end, or cycle — so visit chains show real beat names all the way to the next decision point instead of just the immediate next beat
- Accumulated state display shows counter ranges and named inventory items (not just counts)

**Files modified:**
- `packages/builder/src/components/debug/PathTreeView.tsx` — New component (≈1 500 lines)
- `packages/builder/src/components/debug/PathVisualization.tsx` — Tree tab integration

### StoryWarnings — Soft-Lock & `requires` Detection

A new Level-2 analyzer that scans paths + story structure for five classes of structural defects and annotates them on the tree.

- `keypad-softlock-loop` / `keypad-softlock-unlimited` — keypad whose `failTarget` loops back to the keypad (with or without a mutation) and has no narrative gate declaring the code
- `keypad-ungated` — ungated keypad with no authored `requires` at all
- `requires-unfulfillable` — beat declares a `requires` whose condition cannot be produced by any prior beat
- `requires-violated-on-path` — a simulated path reaches a required beat without satisfying the requirement
- New `StateRequirement` type on `Beat` with `{ condition, explanation, severity }` — purely analyzer metadata, not engine-enforced
- Warnings surface in three places: a top-of-panel summary banner, an `AlertTriangle` icon on every tree node whose beats are affected, and inline pills on visit-chain terminators so the keypad appears with its warning code right in the spot the player would get stuck

**Files modified:**
- `packages/core/src/analysis/StoryWarnings.ts` — New module (5 warning codes, cycle detection with state-mutation tracking, requires reachability analysis)
- `packages/core/src/types/index.ts` — `StateRequirement` type
- `packages/core/src/beats/Beat.ts` — `requires?: StateRequirement[]` field
- `packages/core/tests/analysis/StoryWarnings.test.ts` — New tests including the Hollow Star keypad regression
- `packages/core/tests/fixtures/hollowstar.json`, `blackwood.json` — Regression fixtures

### AI Generation Teaches the `requires` Convention

Both internal (`AIService`) and MCP generation prompts now teach the narrative-gate pattern so AI-authored stories don't produce soft-locks.

- `STATE REQUIREMENTS` section added to the system prompt with rules: keypads must declare `requires` when the code is narratively-earned, keypad `failTarget` must escape (never loop to itself without recovery), `maxAttempts:0` is banned unless there's an explicit escape
- Worked example pairs `setVariable` on a pickProp (`codeFound = true`), a `conditionBeat` gating entry to the keypad, and a `requires` annotation explaining the gate

**Files modified:**
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`
- `mcp-server/src/utils/aiHelper.ts`

### Pop-Out Debug Window

Story Debug Tools (Reachability, Path Analysis, Story Logic) now live in a separate browser window that can be dragged anywhere — including onto a second display.

- New `DebugWindow` page at hash route `#/debug-window` that reconstructs a live `Story` from a serialized payload (same shape as Preview Window) and renders the three existing analyzer components
- New `DebugWindowManager` service mirroring `PreviewWindowManager`: `window.open` + `postMessage` with origin check, auto-retry on `PING`, debounced auto-push of story updates (300 ms)
- Highlight clicks (beat or path) posted back to the opener so the flowchart paints exactly like before — the contract between analyzer and graph is unchanged, just the window is separate
- The in-page draggable overlay is removed

**Files modified:**
- `packages/builder/src/pages/DebugWindow.tsx` — New page
- `packages/builder/src/services/DebugWindowManager.ts` — New service
- `packages/builder/src/App.tsx` — `#/debug-window` route, subscriptions, story-update push effect

### Preview Window → Flowchart Red Trace

Beats visited during the active Preview Window session are now painted red on the main builder's flowchart in real time.

- PW echoes `visitedBeats` back to the opener on every state tick via a new `VISITED_BEATS_UPDATE` message
- `PreviewWindowManager` exposes `subscribeToVisitedBeats`; cleared automatically when the PW closes so stale traces don't stick
- `App → WorkspaceView → Canvas → GraphEditor` threads a new `pwVisitedBeatIds` prop through to `BeatNode`, which renders a red ring + red-50 background. The existing yellow debug highlight wins when both are set on the same beat

**Files modified:**
- `packages/builder/src/services/PreviewWindowManager.ts` — New message type + subscription API
- `packages/builder/src/pages/PreviewWindow.tsx` — Echo visited-beats every update tick
- `packages/builder/src/App.tsx` — `pwVisitedBeatIds` state + subscription
- `packages/builder/src/components/WorkspaceView.tsx`, `Canvas.tsx`, `graph/GraphEditor.tsx`, `graph/BeatNode.tsx` — Prop threading + red highlight rendering

### Claude Extended Thinking + Exposed Max-Tokens

AI Config Dialog now exposes **Max Tokens** and an **Extended Thinking / Reasoning Effort** selector for the Claude provider (previously OpenAI/Local only, with max-tokens hidden behind a custom baseUrl).

- Claude provider maps `reasoningEffort` → `thinking.budget_tokens` for direct Anthropic calls (`minimal`=1024 … `xhigh`=32000); forces `temperature: 1.0` when thinking is active (Anthropic requirement)
- Response parsing walks content blocks to find the `text` block, so a leading `thinking` block no longer breaks extraction
- Proxy / custom-baseUrl requests skip thinking since most Claude-compatible providers don't support the parameter
- Max Tokens is now always visible and applied for all providers

**Files modified:**
- `packages/builder/src/components/ai/AIConfigDialog.tsx`
- `packages/builder/src/services/providers/ClaudeProvider.ts`

### Bug Fixes Rolled In

- **EndScreen / AISummary credits page close**: closing the credits overlay no longer leaves the player stranded — returns cleanly to the End/AISummary screen
- **Timer HUD overlay** resets properly on story restart
- **Fictional-time display**: no longer force-enabled on every story load; honours the per-story setting
- **Analyzer**: inline counter + budget fixes for more accurate path simulation

**Files modified:**
- `packages/core/src/beats/EndScreenBeat.ts`, `AISummaryBeat.ts`
- `packages/player-web/src/WebPlayer.tsx`
- `packages/core/src/analysis/StateSimulationAnalyzer.ts`

---

## 2026-04-14: Kimi K2.5, AI Prompt Fixes, Undo/Redo & Input UX (v0.9.32)

### Overview

A stability and polish release focused on AI story generation quality and author/player UX. Adds full **Kimi K2.5** support as a story-generation provider, fixes several **AI prompt defects** that produced broken graphs (missing EndScreen restart edges, overuse of invisible-hotspot movementChoice), restores **undo/redo** for Character and Global Settings edits, and fixes several fiddly **input/interaction** bugs (InputText auto-select, SetTimer expiry, keypad/inputText engine block).

### Kimi K2.5 Support

Kimi K2.5 now works end-to-end as an OpenAI-compatible story generation provider.

- `kimi-k2*` models recognised as reasoning models → temperature is omitted (Kimi rejects any value other than 1)
- AI proxy timeout increased from 5 → 10 minutes so reasoning models have room to finish long generations
- New JSON repair pass in `OpenAIProvider` escapes unescaped interior double quotes in string values — a common Kimi K2.5 output quirk where dialogue text contains literal `"` that would break `JSON.parse`
- AI Config Dialog: new clear (×) button on the Base URL field so users can easily reset to default OpenAI after using a custom endpoint like `https://api.moonshot.ai/v1`

**Files modified:**
- `packages/builder/src/services/providers/openai-utils.ts`
- `packages/builder/src/services/providers/OpenAIProvider.ts`
- `packages/builder/src/api/vite-ai-proxy.ts`
- `packages/builder/src/components/ai/AIConfigDialog.tsx`

### AI Story Generation Prompt Fixes

Two long-standing defects in AI-generated stories, fixed in both the internal (`AIService`) and MCP (`aiHelper`) generation paths.

**EndScreen / aiSummary restart connections:**
- Prompts were telling the AI that endScreen has "no connections (terminal beat)" — but when `showRestart: true`, the restart button needs an explicit edge back to `beat_0` to show up in the graph
- All prompt sections, examples, and inline snippets updated to require `"connections": [{ "targetId": "beat_0" }]` for both `endScreen` and `aiSummary` when used as endings
- Safety-net auto-fix added — scans generated stories and injects the restart connection if the model still misses it

**dialogTree is the default choice beat:**
- AI was consistently using `movementChoice` for any multi-option branching, which renders as invisible hotspots on a background — confusing when there's no meaningful spatial layout
- Prompts reframe `dialogTree` as the default for any multi-option choice (conversations, decisions, actions, branches) with visible buttons
- "Shallow dialogTree" pattern documented (empty speaker + scene text + top-level choices) as the drop-in replacement for generic `movementChoice` usage
- `movementChoice` reframed as specialised — only for scenes where choices map to spatial hotspots on a background image

**Files modified:**
- `packages/builder/src/services/AIService.ts` — `autoFixEndScreenConnections()`
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`
- `mcp-server/src/utils/aiHelper.ts` — `autoFixEndingRestartConnections()`
- `mcp-server/src/tools/applyStoryChanges.ts`

### Undo/Redo for Character Editor and Global Settings

Character and global-settings saves previously mutated state directly, bypassing the command system — so Ctrl/Cmd+Z had no effect on those edits. Now both go through the CommandManager.

- New `UpdateCharactersCommand` and `UpdateGlobalSettingsCommand` (whole-slice snapshot commands)
- Pushed via `CommandManager` on every save from the respective inspectors

### InputText Auto-Focus and Auto-Select

Interactors no longer need to click into the text field before typing. On mount, the input is focused and any pre-filled sample text is selected. Applies to:

- InputText beat (both dialog and positioned/canvas layouts)
- AI Conversation beat when STT is disabled
- In-app preview AND the HTML export player (`player-web.js` rebuilt)

Also includes a follow-up fix for consecutive InputText beats: uses `inputValue === content` as the initialisation signal so selection fires on every fresh beat, not just the first.

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx`
- `packages/builder/public/player-web.js`

### SetTimer Expiry, Keypad & InputText Engine Block

Three related fixes where beats could silently stall the story engine:

1. **SetTimerBeat** — constructor now initialises `continueTarget` from parameters with a fallback to the unlabelled connection. Previously the field was always `''` after a save/load cycle; any Inspector edit would then silently drop the continue connection, so `getNextBeat()` returned null and the engine exited before the timer fired.
2. **ReactRenderer.cancelPendingAction** — now resolves the outer wrapped handler instead of only the inner `resolveAction`. The old code left `renderKeypad` and `renderInputText` promises permanently blocked.
3. **SchemaFormGenerator** — now renders `type:'connection'` parameters (e.g. `fallbackExitTarget` on `aiConversation`) as a beat-picker. Previously they fell through the switch and returned null.

**Files modified:**
- `packages/core/src/beats/SetTimerBeat.ts`
- `packages/renderer/src/renderers/ReactRenderer.tsx`
- `packages/builder/src/components/SchemaFormGenerator.tsx`
- `packages/builder/src/components/Inspector.tsx`

---

## 2026-04-09: AI Conversation, NPC Exits, VideoBeat VE, Local TTS/STT & LLM Eval (v0.9.31)

### Overview

This release introduces the **AI Conversation Beat** for real-time steered AI dialogue, **NPC-initiated exits** for DialogTree/AIDialogTree, a **rewritten VideoBeat with full Visual Editor integration**, **Local TTS/STT** support (Kokoro, whisper.cpp), and a comprehensive **LLM evaluation harness** for benchmarking small local models for embedded playback. Also includes significant AI generation prompt improvements and 16 new tests.

### AI Conversation Beat (New)

Real-time AI conversations with author-defined steering rules, replacing pre-generated dialog trees where dynamic open-ended dialogue is needed.

- New `aiConversation` beat type with free-form player text input (and optional voice input via STT)
- **Conversation directions**: structured trigger/action rules that steer the AI mid-conversation
  - Triggers: topic-mention, sentiment, turn-count, variable, silence, custom
  - Actions: steer conversation, exit to beat, set variable, or multi-action combinations
  - Variable guards (`requiresVariable`) and once-only firing supported
- NPC opening line (optional, AI generates if empty)
- Fallback exit target when `maxTurns` reached
- AI generates farewell messages via `npcExitMessage` when exiting via a direction

**Files modified:**
- `packages/core/src/beats/AIConversationBeat.ts` — New beat implementation
- `packages/core/src/utils/ConversationPromptBuilder.ts` — System prompt, direction evaluation, variable extraction
- `packages/core/src/types/index.ts` — `ConversationDirection`, `ConversationTrigger`, `ConversationAction` types
- `beat-definitions/core-beats.json` — Beat definition

### NPC-Initiated Exits

DialogTree and AIDialogTree nodes can now auto-advance without showing choices (NPC dismissals, forced exits).

- New `target` field on DialogNode — when set, NPC delivers the line and auto-advances to the target beat
- Editor hides unreachable choices when auto-exit is set, shows green exit badge on the NPC node
- Choices are cleared from the data on save (not just hidden) to keep the model clean
- Runtime auto-advances via `waitForTTS` + `waitForReadingTime` utilities
- `AIDialogTreeBeat` exit messages now include NPC's last text + player's choice for contextual farewells
- `AIConversationBeat` exit messages use shared TTS wait utilities

**Files modified:**
- `packages/core/src/beats/DialogTreeBeat.ts` — `node.target` auto-exit in `performAction()`
- `packages/core/src/beats/AIDialogTreeBeat.ts` — Contextual exit message prompts
- `packages/core/src/beats/AIConversationBeat.ts` — Shared TTS wait utilities
- `packages/core/src/utils/ttsWait.ts` — Skip reading delay when TTS is enabled
- `packages/builder/src/editors/DialogTreeEditor.tsx` — Editor UI for NPC exit badges and choice hiding
- `packages/builder/src/components/Inspector.tsx` — Remove redundant `rebuildConnectionsAndUpdate` call

### VideoBeat Visual Editor Integration

VideoBeat rewritten to use the Visual Editor for media selection and playback configuration.

- `videoAssetId` parameter added alongside legacy `videoFile`
- `VideoBeat.performAction()` now uses `renderer.renderVideo()` instead of direct DOM manipulation
- New Video section in VE properties panel with asset selector and playback checkboxes
- Video element shown on the canvas at user-defined position and size
- First frame preview in editor mode (paused, muted), full playback in Preview
- Skip button controlled by dedicated `skipButton` parameter
- Asset type propagates to renderer for proper `<video>` vs `<img>` rendering
- Fresh URL resolution via asset resolver (blob URLs expire across window boundaries)

**Files modified:**
- `packages/core/src/beats/VideoBeat.ts` — Rewrite to use renderer + state-based URL resolution
- `packages/core/src/types/index.ts` — `Location.assetType` field, `renderVideo` signature with locations + skipButton
- `packages/renderer/src/renderers/ReactRenderer.tsx` — Positioned video rendering with asset resolver
- `packages/renderer/src/components/PositionedBeatView.tsx` — `AssetElement` detects video via `assetType`
- `packages/builder/src/components/visual/VisualPropertiesPanel.tsx` — Video section UI
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Video element setup, stale element cleanup
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Asset type propagation
- `packages/builder/src/utils/SchemaLocationInitializer.ts` — `video` location type
- `packages/builder/src/components/SchemaFormGenerator.tsx` — Respect `ui.hidden` flag
- `beat-definitions/core-beats.json` — Hide video params from Inspector, add `locations: ["video"]`

### Local TTS & STT

Self-contained voice support via local servers — no cloud dependency.

- **Local TTS**: mlx-audio with Kokoro voices on port 4123 (OpenAI-compatible `/v1/audio/speech`)
- **Local STT**: whisper.cpp on port 8178 (`/v1/audio/transcriptions`)
- TTS provider options: OpenAI, ElevenLabs, Local, OpenAI-Compatible
- Kokoro voice picker with per-region options (`am_adam`, `af_heart`, etc.)
- Model field for custom voice cloning models
- STT config includes language (BCP 47) for multi-language transcription
- HTML export player includes `WebSTTProvider` with browser SpeechRecognition fallback

**Files modified:**
- `packages/builder/src/services/tts/LocalTTSProvider.ts` — Kokoro integration
- `packages/player-web/src/WebSTTProvider.ts` — New STT provider for HTML export
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` — Local TTS/STT config UI

### AI Generation Prompt Improvements

All AI generation paths (internal + MCP) updated with clearer structural rules and a verification checklist.

- Explicit **two connection patterns** documented: connections array vs targets-in-parameters
- **Verification checklist** — AI checks structural integrity before outputting (beat_0 titleScreen, reachability, dangling targets, dialogTree structure)
- **aiSummary as ending** — documented as richer alternative to endScreen with restart to beat_0
- **aiConversation** beat added to story generation prompts
- **NPC auto-exit on DialogTree** documented
- **Exit message improvements** — prompts now include conversation context for contextual farewells
- `generateDialog` in PreviewWindow handles `format: 'text'` for exit messages (Claude + OpenAI paths)

**Files modified:**
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`
- `packages/builder/src/services/prompts/storyGeneration.ts`
- `packages/builder/src/services/prompts/dialogGeneration.ts`
- `packages/builder/src/services/prompts/beatSuggestions.ts`
- `mcp-server/src/utils/aiHelper.ts`
- `packages/builder/src/pages/PreviewWindow.tsx`

### LLM Evaluation Harness

Two automated test suites for evaluating local LLMs — one for beat-level AI tasks (embedded use), one for full story generation.

- **Beat eval** (`packages/core/tests/llm-eval/`) — 14 scenarios across 6 categories: dialogTree, conversation, textGen, classification, extraction, exitMessage
- **Story eval** (`packages/core/tests/llm-eval-story/`) — 6 scenarios with 16 weighted structural checks
- CLI flags: `--model`, `--compare`, `--endpoint`, `--context`, `--no-think`, `--save`, `--verbose`
- Automated scoring (JSON validity, word count, required fields, reachability, connection integrity)
- Critical failure detection: unreachable beats and dangling targets auto-fail regardless of score
- HTML report generation for side-by-side quality review
- Support for Ollama native API (for models with large context needs) and thinking model detection

**Findings for embedded playback (beat eval):**
- **gemma3:4b**: 100% structural, highest creative quality, best overall
- **smollm2:1.7b**: 100% structural at 1.8GB — smallest viable model
- **mistral:7b**: 100% structural, good creativity

**Findings for story generation:**
- **Qwen3-30B-A3B** (MoE): 6/6 scenarios passed at 62s avg — best value
- **mixtral:8x7b** (MoE): 6/6 passed at 54s
- **qwen3.5:35b-a3b thinking**: 6/6 at 98% quality (slower)
- **phi4:14b**: 5/6 passed at 42s — best mid-size
- MoE architecture dominates; thinking doesn't help when prompt provides structural checklist

**Files added:**
- `packages/core/tests/llm-eval/` — Beat eval harness (scenarios, scoring, runner, README)
- `packages/core/tests/llm-eval-story/` — Story eval harness (scenarios, scoring, runner, README)

### OnlineContent Word Limit Enforcement

- Prompt changed from "approximately N words" to "MAXIMUM N words — do not exceed this limit"
- Post-generation truncation at last complete sentence within `maxWords`
- Falls back to word-cut with ellipsis if no sentence boundary past halfway

**Files modified:**
- `packages/core/src/beats/OnlineContentBeat.ts`

### Tests Added

- **DialogTreeBeat NPC exit nodes** (6 tests)
- **AIDialogTreeBeat** (9 tests): exit messages, dialog execution, validateDialogTree
- **VideoBeat** (9 tests): constructor, parameters, performAction
- **OnlineContentBeat** (7 tests): word limit truncation
- All 38 tests pass. Lint: 0 errors.

**Files added:**
- `packages/core/tests/beats/VideoBeat.test.ts`
- `packages/core/tests/beats/OnlineContentBeat.test.ts`
- `packages/core/tests/beats/AIDialogTreeBeat.test.ts`

---

## 2026-03-20: AI Prefetching, Session Logging, Rich Text & VE Translation (v0.9.30)

### Overview

This release adds **AI content prefetching** for faster AI beat execution, **play session logging** in both the Preview Window and HTML exports, **markdown-lite rich text** in text boxes, and **translated text display in the Visual Editor**. Also includes AI dialog tree improvements (exit reasoning, routing plans, personalization), ElevenLabs multilingual support, and UI refinements.

### AI Beat Prefetching

Background content generation starts while the user reads the current beat, hiding API latency.

- All AI beats (AIInfoText, AIDurScreen, AIDialogTree, AISummary, OnlineContent) support `prefetch()` method
- `Beat.execute()` prefetches connected AI beats before `performAction()` — generation runs while user interacts
- Prefetched content is cached via context hash mechanism; beats skip loading spinner when content is ready
- AIDialogTree retries once on JSON parse failure (both prefetch and execute)

**Files modified:**
- `packages/core/src/beats/Beat.ts` — `prefetchConnectedBeats()` with PREFETCHABLE_TYPES set
- `packages/core/src/beats/AIInfoTextBeat.ts`, `AIDurScreenBeat.ts`, `AISummaryBeat.ts`, `AIDialogTreeBeat.ts`, `OnlineContentBeat.ts` — `prefetch()` methods

### AI Dialog Tree Improvements

Transparent exit routing, personalization, and routing plan generation.

- Exit conditions reframed as evaluable rules in the generation prompt
- AI generates `routingPlan` explaining exit mapping decisions (logged to session timeline)
- `exitReason` on each exit choice for transparent branching
- Personalization prompt strengthened: "use actual names/locations from player context"
- `{variable}` single-brace interpolation in `processText()` as safety net for AI-generated content

**Files modified:**
- `packages/core/src/beats/AIDialogTreeBeat.ts` — Prompt rewrite, routingPlan, exitReason, retry
- `packages/core/src/beats/Beat.ts` — `{variable}` format support in `processText()`

### Play Session Logging

Detailed session logs exportable from Preview Window and HTML export player.

- Unified `TimelineEvent` system in StoryContext tracks beat-enter, choice, branch, ai-output, state-change events
- All beats get timestamped `beat-enter` events via `markBeatVisited`
- ConditionBeat and AIConditionBeat log branch decisions with reasoning
- All AI beats record generated content to timeline
- OnlineContentBeat records fetched/generated content
- Two-section log format: Overview (beat path, final state, stats) + Detailed Timeline
- "Save Log" button in PW toolbar and HTML export player menu (opt-in via export dialog)
- `PlayerEngine.generateSessionLog()` for HTML export context

**Files modified:**
- `packages/core/src/engine/StoryContext.ts` — `TimelineEvent`, `AIOutputRecord`, `recordTimelineEvent()`, `getTimeline()`
- `packages/core/src/beats/ConditionBeat.ts`, `AIConditionBeat.ts` — Branch logging
- `packages/core/src/beats/AISummaryBeat.ts`, `AIInfoTextBeat.ts`, `AIDurScreenBeat.ts`, `OnlineContentBeat.ts` — AI output recording
- `packages/builder/src/pages/PreviewWindow.tsx` — Session log export function, Save Log button
- `packages/player/src/PlayerEngine.ts` — `generateSessionLog()`, `getStoryTitle()`
- `packages/player/src/PlayerUI.tsx` — Save Log button, `showSessionLog` config
- `packages/player-web/src/WebPlayer.tsx` — `showSessionLog` prop
- `packages/builder/src/export/HtmlExporter.ts` — `showSessionLog` config and template
- `packages/builder/src/components/export/HtmlExportDialog.tsx` — Session log checkbox

### Markdown-Lite Rich Text

Support for bold, italic, and strikethrough in text boxes.

- `**bold**`, `*italic*`, `~~strikethrough~~` rendered in VE and Preview
- New `renderMarkdownLite()` utility with XSS-safe HTML escaping
- TextElement and DialogElement use `dangerouslySetInnerHTML` for non-typewriter rendering
- No changes to storage, translation, or TTS — markdown is part of the string

**Files modified:**
- `packages/renderer/src/utils/markdownLite.ts` — New markdown renderer
- `packages/renderer/src/components/PositionedBeatView.tsx` — TextElement and DialogElement rendering

### Visual Editor Translation Display

VE now shows translated text when a translation language is active.

- `VisualWorkspace` uses `getTranslationsForBeat()` to overlay translated values onto beat content
- All beat types supported: text, buttons, choices, props, dialog, credits
- VBE skips setting `location.content` from raw text when translation is active

**Files modified:**
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Translation overlay in `getBeatContent()`
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Skip raw content when translating

### ElevenLabs Language Support & Dynamic Content Rendering

- ElevenLabs API now receives `language_code` for multilingual models
- Dynamic content beats (AI, onlineContent) skip `minHeight` buffer for tighter text boxes
- Collision detection uses unbuffered height for dynamic content beats
- OnlineContentBeat location matching fixed (uses `loc.name` instead of Map key)

**Files modified:**
- `packages/builder/src/services/tts/ElevenLabsProvider.ts` — `language_code` parameter
- `packages/player-web/src/WebTTSProvider.ts` — Same fix for HTML export
- `packages/renderer/src/components/PositionedBeatView.tsx` — Dynamic content sizing fixes

### UI Improvements & Bug Fixes

- Header title input auto-grows with content length
- Sidebar divider between clusters and unclustered beats is resizable (20-80%)
- CharacterCard crash fixed when AI-generated characters lack states/counters arrays
- AI-generated characters normalized with default empty arrays on story injection

**Files modified:**
- `packages/builder/src/components/Header.tsx` — Title input `size` attribute
- `packages/builder/src/components/Sidebar.tsx` — Resizable divider with drag handle
- `packages/builder/src/components/characters/CharacterCard.tsx` — Optional chaining
- `packages/builder/src/App.tsx` — Character normalization on AI story injection

---

## 2026-03-18: Text-to-Speech, Speaker System & Bug Fixes (v0.9.29)

### Overview

This release adds a comprehensive **Text-to-Speech (TTS) system** with cloud provider support (OpenAI, ElevenLabs, Web Speech API), a **per-beat speaker assignment system** with TTS voice routing and portrait display, **TTS in HTML exports** with embedded API keys, and **language-aware TTS** that switches voice language when translations are active. Also includes critical bug fixes for **EndScreen state reset**, **Chrome autoplay policy**, **directory project data preservation**, and **speaker display in exports**.

### Text-to-Speech System

Full TTS integration with multiple cloud providers and streaming audio playback.

- OpenAI TTS and ElevenLabs providers with streaming endpoint support
- Web Speech API fallback for zero-config local TTS
- Low-latency streaming audio playback
- Provider and model persistence to project settings
- TTS configuration dialog in header toolbar
- Comprehensive test suite for providers and service

**Files modified:**
- `packages/builder/src/services/tts/TTSService.ts` — Core TTS service with provider registry and language override
- `packages/builder/src/services/tts/providers/` — OpenAI, ElevenLabs, WebSpeech provider implementations
- `packages/builder/src/components/tts/TTSConfigDialog.tsx` — Configuration UI
- `packages/builder/src/hooks/useTTS.ts` — React hook for TTS integration

### Per-Beat Speaker Assignment

Speaker identification system with TTS voice routing and visual display.

- Per-beat speaker field with character selection dropdown
- Global speaker display toggles (name label, inline, off) with per-beat override
- Speaker portrait rendering above text boxes with position controls
- TTS voice routing per speaker character
- Schema-driven speaker controls in beat inspector
- Player character as speaker with translatable character names
- Speaker name translation propagation across all beat types

**Files modified:**
- `packages/core/src/beats/Beat.ts` — Speaker and showSpeaker fields on base beat class
- `packages/renderer/src/components/PositionedBeatView.tsx` — Speaker portrait and name rendering
- `packages/renderer/src/renderers/ReactRenderer.tsx` — Speaker display resolver, portrait resolver
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Speaker portrait in visual editor
- `beat-definitions/core-beats.json` — Speaker/showSpeaker fields on all beat types

### TTS in HTML Export

TTS support embedded directly in exported HTML files.

- Embedded API key for cloud TTS providers
- Language-aware TTS: switches voice language on translation switch
- `ttsLanguage` config derived from project source language
- WebTTSProvider for HTML export player with language support

**Files modified:**
- `packages/builder/src/export/HtmlExporter.ts` — TTS config, language placeholder, init params
- `packages/player-web/src/WebPlayer.tsx` — Language prop for TTS routing
- `packages/player-web/src/WebTTSProvider.ts` — TTS provider for web player

### EndScreen Reset Fix

Fixed state not resetting on story restart from EndScreen.

- `StoryContext.reset()` and `selectiveReset()` now emit `counterChanged` and `inventoryChanged` events
- PreviewWindow `countersRef` replaced entirely on update instead of merging (stale values no longer persist)
- Reset deferred to when user clicks "Play Again" — final values remain visible on the End Screen
- Selective reset (per-category) preserved and working correctly

**Files modified:**
- `packages/core/src/engine/StoryContext.ts` — Emit change events from reset/selectiveReset
- `packages/core/src/beats/EndScreenBeat.ts` — Defer reset to restart action via applyReset()
- `packages/builder/src/pages/PreviewWindow.tsx` — Replace countersRef, subscribe to reset events

### Chrome Autoplay & Export Fixes

- Background music defers to first user interaction when Chrome blocks autoplay
- Speaker display and theme settings restored in HTML export player
- Above-portrait positioning flush with text box, shift down when clipped

**Files modified:**
- `packages/player/src/PlayerEngine.ts` — NotAllowedError handling with deferred playback
- `packages/player/src/PlayerEngine.ts` — Speaker display and theme setup in resolvers

### Directory Project Data Preservation

Fixed critical data loss when restoring directory projects on app restart.

- Session restore now reads full project (story, settings, translations) from disk instead of stale IndexedDB
- Auto-save paused during "Open Project Folder" and clone operations
- Prevents stale in-memory state from overwriting current files

**Files modified:**
- `packages/builder/src/contexts/PersistenceContext.tsx` — Full disk read on session restore
- `packages/builder/src/App.tsx` — Pause auto-save during folder open/clone

### Additional Fixes

- Connection management unified — beat types own their connections, preventing accumulation
- PickProp connections preserved when multiple props target the same beat
- Z-order changes persist immediately to beat locations
- Orphaned beat files deleted when saving directory projects
- Translation staleness detection and corrupted snapshot recovery
- External assets folder support for large files in Electron
- Panorama hotspot text extraction for translation
- Asset validator looks in correct subdirectory

---

## 2026-03-04: 360° Panorama Beat & HTML Export Fixes (v0.9.28)

### Overview

This release adds a full-featured **360° Panorama beat type** with interactive hotspots, migrates the panorama viewer from Pannellum to **Photo Sphere Viewer** (Three.js-backed), and fixes critical issues with **panorama images in HTML exports** including asset ID extraction and blob URL handling. Also includes **PickProp display mode** improvements and numerous panorama authoring refinements.

### 360° Panorama Beat Type

Added a new interactive beat type for immersive 360° panorama experiences with clickable hotspots for story navigation.

- Initial implementation using Pannellum library with equirectangular projection
- Hotspot-based navigation with conditional visibility, sound effects, and variable effects
- Visual Editor integration with drag-and-drop hotspot placement on panorama canvas
- Location assignment system connecting hotspots to VE elements (props, characters, images)
- Per-hotspot overrides for opacity and visibility mode

**Files modified:**
- `packages/core/src/beats/PanoramaBeat.ts` — Beat class with hotspot connections, location lookup, environment node URL resolution
- `packages/renderer/src/components/PanoramaView.tsx` — Panorama viewer component (Pannellum → Photo Sphere Viewer)
- `packages/renderer/src/renderers/ReactRenderer.tsx` — renderPanorama implementation with theme styling
- `packages/builder/src/components/visual/PanoramaEditor.tsx` — Visual editor for panorama authoring
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Panorama beat VE integration
- `beat-definitions/core-beats.json` — Panorama beat schema definition

### Panorama Viewer Migration: Pannellum → Photo Sphere Viewer

Migrated from Pannellum to Photo Sphere Viewer (PSV) backed by Three.js for better rendering quality, cylindrical projection support, and marker customization.

- Full equirectangular and cylindrical projection support
- Custom HTML markers with themed styling (color, opacity, label display)
- Zoom-proportional marker scaling using perspective-correct tangent ratio
- Viewport indicator in VE showing camera field of view
- FOV accuracy improvements with PSV's aspect-ratio-aware quantization

**Files modified:**
- `packages/renderer/src/components/PanoramaView.tsx` — Complete rewrite from Pannellum to PSV with MarkersPlugin
- `packages/renderer/package.json` — Replace pannellum with @photo-sphere-viewer/core and markers-plugin
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Viewport indicator overlay

### Panorama Hotspot Features

Extensive hotspot authoring features for the Visual Editor:

- Location assignment: assign VE elements (props, characters) to hotspots via `locationName`
- Image markers: props/characters with images render as image-based panorama markers
- Per-element overrides for hotspot opacity and visibility (visible/onHover/invisible)
- Click sound effects with preset and custom sound support
- Hotspot labels follow theme font family, size, and color settings
- Overlay elements (non-hotspot props/characters) positioned in panorama space
- Pinned prompt display mode as a panorama marker at a specific position

**Files modified:**
- `packages/core/src/beats/PanoramaBeat.ts` — Enriched hotspot data, location lookup, overlay element extraction
- `packages/renderer/src/components/PanoramaView.tsx` — Image markers, hover tooltips, overlay elements, sound playback
- `packages/builder/src/components/visual/VisualPropertiesPanel.tsx` — Hotspot override controls
- `packages/core/src/generated/beat-types.ts` — Updated PanoramaHotspot type with new fields

### HTML Export Panorama Fixes

Fixed three critical issues preventing panorama images from displaying in HTML exports:

1. **Asset ID extraction**: PlayerEngine extracted asset IDs by splitting filenames on the first underscore, breaking IDs containing underscores (e.g. `asset_1772586254887_ty1nd6r8i` → `asset`). Now uses metadata JSON filenames as source of truth.
2. **URL resolution**: PanoramaBeat now resolves panorama URLs from `environment.nodes` (same mechanism as background images) with fallback to renderer state for builder preview.
3. **Blob URL handling**: PanoramaView converts `blob:` URLs to `data:` URLs before passing to Photo Sphere Viewer, avoiding Chrome's crossOrigin restriction on `blob:null/` URLs in file:// contexts.

**Files modified:**
- `packages/player/src/PlayerEngine.ts` — Two-pass asset ID extraction using metadata JSON filenames
- `packages/core/src/beats/PanoramaBeat.ts` — Environment node URL resolution
- `packages/renderer/src/components/PanoramaView.tsx` — Blob-to-data URL conversion
- `packages/builder/public/player-web.js` — Rebuilt player bundle

### PickProp Display Mode & Inspector Sync

Unified PickProp display dropdown and added live Inspector↔Visual Editor synchronization.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx` — Unified display dropdown
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Live sync between Inspector and VE

### Graph & Export Fixes

- Added panorama icon (🌐) to graph nodes for panorama beats
- Included PSV CSS in HTML export for proper panorama rendering
- Clear hotspot tooltip on click to prevent persistence into next beat

**Files modified:**
- `packages/builder/src/components/graph/BeatNode.tsx` — Panorama icon
- `packages/renderer/src/renderers/ReactRenderer.tsx` — PSV CSS injection for HTML export
- `packages/renderer/src/components/PanoramaView.tsx` — Tooltip clear on hotspot click

---

## 2026-02-25: Electron 40 Upgrade, Security Fixes & Input Autofocus (v0.9.27)

### Overview

This release **upgrades Electron from 33 to 40** (latest supported, EOL June 2026), resolves **4 high-severity security alerts** by bumping `@modelcontextprotocol/sdk` to 1.25.2, and adds **autofocus to inputText fields** so interactors can type immediately without clicking.

### Electron 40 Upgrade

Upgraded from Electron 33 (EOL April 2025) to Electron 40 (latest, supported until June 2026). Also upgraded electron-builder from 25 to 26 for compatibility. Required several CI fixes:

- Pinned `electronVersion` in build config (CI can't resolve `^40.0.0` without electron in node_modules)
- Disabled `disableSanityCheckAsar` (electron-builder's ASAR integrity checker incompatible with Electron 40 format)
- Excluded `.ts` and `.map` files from ASAR archive (macOS universal binary merge can't reconcile differing source files)
- Updated CI workflow to use electron-builder 26.8.1

**Files modified:**
- `apps/builder-desktop/package.json` — Electron 40.6.1, electron-builder ^26.0.0, disableSanityCheckAsar, file exclusions
- `.github/workflows/build-desktop.yml` — electron-builder 26.8.1 in CI

### Security: MCP SDK Bump

Bumped `@modelcontextprotocol/sdk` from `^0.5.0` to `^1.25.2`, resolving 4 high-severity Dependabot alerts (ReDoS vulnerability and DNS rebinding protection not enabled by default).

**Files modified:**
- `mcp-server/package.json` — SDK version bump
- `mcp-server/package-lock.json` — Updated dependency tree

### InputText Autofocus

Input fields in inputText beats now autofocus when the beat renders, so interactors can start typing immediately without having to click the field first.

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx` — `autoFocus={interactive}` on input element
- `packages/renderer/src/renderers/ReactRenderer.tsx` — `autoFocus` on fallback input element

---

## 2026-02-25: Debug Analyzer Fixes, Translation Stability & Git VCS Improvements (v0.9.26)

### Overview

This release fixes **false warnings in the debug/reachability analyzer** (inputText/keypad variables, keypad failTarget connections), resolves **translation bleed into AI-generated stories**, fixes multiple **translation staleness false positives**, and adds **Git force push** support with improved **auto-save safety** during git reset and AI generation operations.

### Debug Analyzer: inputText/Keypad Variable Recognition

The reachability analyzer now tracks variables and counters set by `inputText` and `keypad` beats. Previously it only tracked `setVariable` beats, `movementChoice`/`pickProp` counter effects, and `dialogTree` counter effects — causing false "variable is never set" warnings when conditions checked variables set by user input beats.

- Variables saved via `saveToType='variable'` are marked as user-input (any value possible)
- Counters saved via `saveToType='counter'` get unbounded range (±999999)
- Conditions referencing user-input variables are always considered satisfiable

**Files modified:**
- `packages/core/src/analysis/ReachabilityAnalyzer.ts` — Add inputText/keypad handling in `analyzeStateModifications()`, short-circuit satisfiability for user-input sentinels

### Debug Analyzer: Keypad failTarget Connections

Keypad beat's "Fail Target Beat" connection was invisible in the flowchart and reported as missing by the debug system. Root cause: `KeypadBeat` didn't override `getConnections()` to expose `failTarget`.

- Added `getConnections()` override to `KeypadBeat` following the `ConditionBeat` pattern
- Added keypad failTarget extraction to `TreeLayoutAlgorithm.extractConnectionsFromBeats()`
- Fail connections now appear in the flowchart and are traversed by the BFS reachability analyzer

**Files modified:**
- `packages/core/src/beats/KeypadBeat.ts` — Add `getConnections()` override exposing failTarget with 'fail' label
- `packages/builder/src/utils/TreeLayoutAlgorithm.ts` — Add keypad failTarget edge extraction

### Translation: Clear on AI Story Generation

Translations from a previously open project bled into AI-generated stories because `handleStoryGenerated` never cleared the translation state. Now calls `clearTranslations()` alongside `clearStory()`, matching the pattern used in all other new-project code paths.

**Files modified:**
- `packages/builder/src/App.tsx` — Add `translationActionsRef.current?.clearTranslations()` in `handleStoryGenerated`

### Translation: Fix 99% Stuck Progress

Translation progress could get stuck at 99% due to orphaned entries (source strings removed but translation entries remaining) and phantom entries (entries for strings not in the current source). The sync process now cleans both types.

**Files modified:**
- `packages/builder/src/contexts/TranslationContext.tsx` — Remove orphaned and phantom translation entries during sync

### Translation: Fix False Stale Markers

Translation strings were falsely marked as stale on directory project load and after git reset operations. Multiple fixes across the translation pipeline:

- Preserve new-string detection while cleaning false stale markers
- Suppress post-VCS translation sync after git reset
- Use currentProject for translation sync instead of stale IndexedDB
- Replace timeout with ref-based signal for auto-save resume after reset

**Files modified:**
- `packages/builder/src/contexts/TranslationContext.tsx` — Multiple sync and staleness fixes
- `packages/builder/src/App.tsx` — Suppress post-VCS sync, ref-based signals

### AI Story Generation Safety

Prevent AI story generation from overwriting directory/git-backed projects. Auto-save is paused during generation to avoid writing partial state to disk.

**Files modified:**
- `packages/builder/src/App.tsx` — Pause auto-save during AI generation, prevent directory overwrite

### Git VCS: Force Push & Reset Improvements

Added Force Push option to the push rejection dialog. Improved git reset stability with proper auto-save pausing, stale index.lock handling, and UI state reload.

- Force push option in push rejection dialog
- Git reset now pauses auto-save, clears stale index.lock files
- Reset-to-commit button moved above file list for visibility
- Post-reset UI properly reloads beats/connections

**Files modified:**
- `packages/builder/src/components/vcs/VCSPanel.tsx` — Force push dialog, reset UI improvements
- `packages/builder/src/App.tsx` — Auto-save pause during reset, ref-based resume signal
- `packages/builder/src/contexts/PersistenceContext.tsx` — Force push, stale lock cleanup

### Grouped Path Presets, BFS Analyzer & Per-Choice Effects

Preview path presets grouped by category. BFS-based reachability analyzer for story debugging. Per-choice counter/variable effects on dialogTree and movementChoice beats.

**Files modified:**
- Multiple files across core and builder packages

### Electron AI Proxy Fix

Replaced Electron Chromium fetch with Node.js native https for AI proxy requests, fixing connectivity issues in the desktop app.

**Files modified:**
- `apps/builder-desktop/` — AI proxy implementation

---

## 2026-02-23: AI Documentation Sync & Credits Export Fix (v0.9.25)

### Overview

This release **synchronizes both AI story generation systems** (MCP server and builder) with the keypad beat type and endScreen credits page parameters, and **fixes HTML export AI translation** to properly extract credits page text fields for on-the-fly translation.

### AI Documentation Sync: Keypad Beat & EndScreen Credits

Both AI story generation paths (`mcp-server/src/utils/aiHelper.ts` and `packages/builder/src/services/prompts/storyGenerationEnhanced.ts`) now document the keypad beat type and endScreen credits page parameters. Both files include matching coverage:

- Keypad beat type entry with full parameter documentation
- Keypad in single-connection beat lists
- Concrete keypad JSON examples
- Code/Password Puzzle pattern updated to recommend keypad for numeric codes
- EndScreen credits parameters (`creditsPageTitle`, `creditsPageBody`, `creditsCloseText`, `creditsText`) documented
- EndScreen examples updated to show credits page usage

**Files modified:**
- `mcp-server/src/utils/aiHelper.ts` — Add keypad beat type, update endScreen with credits params, update examples and patterns
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` — Add keypad beat type guide, update endScreen docs, add concrete keypad example, update patterns

### HTML Export AI Translation Fix

The embedded AI on-the-fly translation in HTML exports was missing `creditsPageTitle`, `creditsPageBody`, and `creditsCloseText` from its string extraction function. These fields are now included, enabling proper translation of credits page content in exported stories.

**Files modified:**
- `packages/builder/src/export/HtmlExporter.ts` — Add credits page fields to extractStrings function

### EndScreen Credits Translation & Continue Button Translation

Added translation support for endScreen credits page fields and the Continue button. Also added the ability to delete translation languages from the translation panel.

**Files modified:**
- `packages/builder/src/export/StoryTranslator.ts` — Credits page field extraction for translation
- Various translation pipeline files

### Visual Editor HUD Overlay Fix

HUD overlays (timer, countdown meter, fictional time) now render correctly in the Visual Editor, matching their appearance in the Preview window.

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx` — HUD overlay rendering in editor mode

---

## 2026-02-23: Language-Aware AI & Bi-directional Layout (v0.9.24)

### Overview

This release adds **language-aware AI beat generation** with translated preview UI, and **bi-directional vertical textbox expansion** that allows text boxes to grow upward when they run out of downward space on the stage. Buttons with stored dimensions now **auto-expand height** to prevent text clipping.

### Language-Aware AI Beats & Translated Preview UI

AI beats (aiInfoText, aiDurScreen, aiDialogTree) now generate content in the story's active translation language. The preview window UI (buttons, labels, placeholders) is also translated to match the selected language.

**Files modified:**
- `packages/core/src/generated/beat-types.ts` — Updated generated types
- `packages/builder/public/player-web.js` — Rebuilt player-web bundle

### Bi-directional Vertical Textbox Expansion

Text boxes previously could only grow downward when text overflowed, even when there was ample space above. This mirrors the existing horizontal bi-directional expansion (xOffset) for the vertical axis (yOffset). A textbox at y=500 on a 768px stage now uses the ~490px of upward space instead of being limited to ~165px downward.

- Added `yOffset` to `TextBoxDimensions` interface (mirrors `xOffset`)
- Smart sizing computes `maxDownwardHeight` + `maxTopGrowth` for total available vertical space
- All return paths in `calculateSmartTextBoxDimensions()` compute yOffset: prefer downward growth, overflow upward
- Collision detection, layout callbacks, and element rendering all account for yOffset

**Files modified:**
- `packages/core/src/layout/elementSizing.ts` — Add yOffset to interface, bi-directional height calculation
- `packages/renderer/src/components/PositionedBeatView.tsx` — Same height calc in renderer copy, apply yOffset in TextElement, DialogElement, collision detection, layout callback

### Button Auto-Height Expansion

Buttons with stored dimensions now auto-expand their height to fit text content. Previously, buttons with stored heights that were too small for the text content would clip text due to `overflow: hidden` with `border-box` sizing. The fix computes the needed height at the stored width (accounting for border-box padding and border) and uses the maximum of stored height vs. needed height.

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx` — Button height auto-expansion for stored dimensions

### Documentation

- Updated User Guide for EndScreen reset options and credits page

**Files modified:**
- `docs/USER_GUIDE.md` — EndScreen documentation updates

---

## 2026-02-22: Unified Layout Engine & EndScreen Credits (v0.9.23)

### Overview

This release **unifies the Visual Editor and Preview rendering into a single layout engine**, eliminating position discrepancies between what users see in the editor and what appears in preview/playback. It also adds **customizable EndScreen credits pages**, **undo/redo for the visual editor**, **granular EndScreen reset options**, and several engine/rendering bug fixes.

### Unified Visual Editor & Preview Layout

The Visual Editor (VE) and Preview previously used two parallel layout engines that produced different element positions. The VE pre-computed sizes via `smartSizing.ts` at load time, while the Preview computed them at render time via `PositionedBeatView`. These engines diverged — different padding for dialogs, different font sizes, incomplete collision detection in the editor.

**Solution: Single Render Path.** Both editor and preview now use identical smart sizing and collision detection computed at render time by `PositionedBeatView`:

- Removed `editorMode` from collision detection — always runs `adjustElementsForCollisions()`
- Removed `editorMode` from smart sizing in `TextElement` and `DialogElement` — both modes now compute dimensions identically
- Added `manuallyResized` flag support — elements manually resized by the user skip smart sizing in both modes
- Added `onLayoutComputed` callback from `PositionedBeatView` — reports computed positions (with smart-sized dimensions) back to the VE for selection handle alignment
- Removed all `applySmartSizing()` calls from `VisualWorkspace.tsx` — elements load with raw positions, sizing happens at render time
- Simplified `smartSizing.ts` to only export `computeAutoFontSize` and `computeAutoTextAlign` utilities

**Files modified:**
- `packages/renderer/src/components/PositionedBeatView.tsx` — Remove editorMode from layout logic, add onLayoutComputed callback, add manuallyResized support, add helper functions
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` — Consume onLayoutComputed, use computed positions for selection/drag handles
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Remove all applySmartSizing calls, simplify content update handlers
- `packages/builder/src/utils/smartSizing.ts` — Remove applySmartSizing/applySmartSizingToElement, keep only utility exports

### Customizable EndScreen Credits Page

Added a dedicated "Credits" phase to the EndScreen beat, allowing authors to create a scrollable credits page with customizable text, layout, and background.

**Files modified:**
- `packages/core/src/beats/EndScreenBeat.ts` — Credits page support
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Credits phase element generation
- `packages/renderer/src/components/PositionedBeatView.tsx` — Credits rendering

### Undo/Redo for Visual Editor

Added full undo/redo support for visual editor changes (element moves, resizes, text edits, additions, deletions).

**Files modified:**
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Undo/redo state management

### Granular EndScreen Reset Options

EndScreen beat now supports granular reset options: reset variables, reset inventory, reset timers independently instead of all-or-nothing.

**Files modified:**
- `packages/core/src/beats/EndScreenBeat.ts` — Granular reset parameters

### Engine & Rendering Bug Fixes

- **Timer interrupt pending action**: Fixed engine loop stalling when a timer interrupt fired during `performAction()` — the pending action promise now resolves on interrupt so the engine loop continues
- **markVisited=false**: Respected the `markVisited` flag for DialogTree, MovementChoice, and PickProp beats — choices no longer dim when visited if the author disabled visit marking
- **EndScreen restart navigation**: EndScreen restart button now navigates to the configured target beat instead of stopping the engine
- **Flowchart drag-to-connect**: Removed broken drag-to-connect feature from the flowchart editor
- **Vitest hang fix**: Resolved vitest hanging caused by lucide-react barrel imports by switching to direct icon imports

**Files modified:**
- `packages/core/src/engine/StoryEngine.ts` — Timer interrupt pending action fix
- `packages/renderer/src/components/PositionedBeatView.tsx` — markVisited rendering
- `packages/core/src/beats/EndScreenBeat.ts` — Restart navigation fix
- `packages/builder/src/components/Canvas.tsx` — Remove broken drag-to-connect
- Various test files — Updated stale tests, added CLAUDE.md testing guidance

### Documentation

- Updated User Guide to remove Perforce references (not yet user-facing)
- Comprehensive user guide audit for accuracy

**Files modified:**
- `docs/USER_GUIDE.md` — Accuracy audit and Perforce removal
- `CLAUDE.md` — Testing guidance additions

---

## 2026-02-19: Bug Fixes & Advisory Editing Locks (v0.9.22)

### Overview

This release fixes several bugs — **cross-project beat leakage** when switching projects with the Inspector open, **EndScreen variable interpolation** in button text, and **movementChoice/pickProp question text** not appearing in the Visual Editor. It also adds **advisory editing locks** for Git-based team collaboration and a comprehensive **user guide update** covering v0.9.10–v0.9.21.

### Cross-Project Beat Leakage Fix

When switching projects, `selectedBeat`, `selectedCluster`, and overlay panel state were never cleared. This allowed a beat from Project A to leak into Project B if the Inspector was still open during the switch. The fix:

- Clears `selectedBeat` and `selectedCluster` at the start of every project-load branch (switching, new untitled, existing project)
- Closes overlay panels (Character Manager, Asset Manager, Settings, Debug, Search) on project switch
- Immediately syncs `beatsRef`, `connectionsRef`, `clustersRef`, and `containerBeatPositionsRef` after `loadStoryData()` to prevent `syncProjectData` from reading stale data during the window before the useEffect fires

**Files modified:**
- `packages/builder/src/App.tsx` — Clear UI selections and sync refs on project switch

### EndScreen Variable Interpolation & MovementChoice Question Text

- EndScreen `restartText`, `creditsText`, and `buttonText` now process through `processText()` so `${variable}` interpolation works
- Fixed `getBeatContent()` mapping `'movement'` → `'movementChoice'` so question text appears in the Visual Editor
- Added param sync for movementChoice/pickProp question text updates from the visual editor
- Skip static `choices`/`props` locations in `DefaultLocationGenerator` for beats that generate them dynamically
- When `beat.locations` already has choice hotspots, `SchemaLocationInitializer` was skipped entirely — now supplements the missing "Question" text element and populates its text on reload

**Files modified:**
- `packages/core/src/beats/EndScreenBeat.ts` — Process button text through `processText()`
- `packages/builder/src/components/visual/VisualWorkspace.tsx` — Fix getBeatContent mapping, add question text element supplementing
- `packages/renderer/src/utils/DefaultLocationGenerator.ts` — Skip static choice/prop locations for dynamic beats
- `packages/core/src/generated/beat-types.ts` — Type updates
- `packages/builder/public/player-web.js` — Updated player bundle

### Advisory Editing Locks for Git Collaboration

New advisory beat editing locks that track which beats are being edited by team members via `.asaps-editing.json`. Locks propagate through normal git workflow and show purple indicators on the canvas plus warning banners in the Inspector. Stale locks older than 2 hours are automatically ignored.

**Files modified:**
- `packages/builder/src/vcs/EditingLocks.ts` — New editing lock management module
- `packages/builder/src/vcs/GitAdapter.ts` — Git integration for lock files
- `packages/builder/src/vcs/VCSStatusProvider.tsx` — Lock status UI integration
- `packages/builder/src/components/Inspector.tsx` — Lock warning banner
- `packages/builder/src/components/vcs/FileChangeIndicator.tsx` — Lock indicator styling
- `packages/builder/src/App.tsx` — Lock lifecycle integration

### User Guide Update (v0.9.10 → v0.9.21)

Comprehensive user guide update covering 11 minor releases of new features: Keypad beat, Fictional Time system, Timer HUD, recursive dialog trees, choice effects, HTML export, Git VCS integration, search & replace, multi-language translation, undo/redo, and advisory editing locks. Adds 5 new screenshots.

**Files modified:**
- `docs/USER_GUIDE.md` — Major content update
- `docs/images/12-keypad-beat.png` through `docs/images/16-dials-countdowns-flowchart.png` — New screenshots

---

## 2026-02-19: Mobile Display Improvements & Font Scaling Fix (v0.9.21)

### Overview

This release **decouples mobile font scaling from cover mode**, fixing the problem where text was unreadable on mobile unless cover mode (which crops edges) was enabled. Font scaling now works independently with fit mode, and a new **Native Mobile** option is added for projects designed at mobile dimensions.

### Mobile Font Scaling Decoupled from Cover Mode

Previously, font scaling was gated behind `mobileMode` (cover scaling), meaning you had to accept edge cropping to get readable text. Now font scaling is computed independently in the HTML template:

- **Auto** (default): Fit mode + font scaling on mobile — all elements visible, text enlarged for readability
- **Cover**: Cover mode + font scaling — fills viewport, may crop edges
- **Fit**: Identical behavior on all devices, no font scaling
- **Native Mobile** (new): No mobile adaptations at all — for projects already designed at mobile dimensions

The `effectiveFontScale` is now pre-computed at init time based on mobile detection and scaling mode, then passed to WebPlayer which applies it unconditionally when > 1.0.

**Files modified:**
- `packages/builder/src/export/HtmlExporter.ts` — Updated all 3 `ASAPSPlayer.init()` sites (single-file, multi-language switch, multi-language initial load) to compute `effectiveFontScale` independently of `mobileMode`
- `packages/player-web/src/WebPlayer.tsx` — Un-gated `mobileFontScale` from `mobileMode` if-block
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` — Updated dropdown labels and help text, added 'native' option
- `packages/builder/src/storage/types.ts` — Added `'native'` to `mobileScalingMode` type union

### Mobile Renderer Improvements

Improved mobile-responsive rendering across HUD overlays and UI components:

- Character inventory frames with mobile-adaptive sizing
- Character meter frames with responsive layout
- Countdown meter HUD mobile scaling
- Timer HUD display mobile adaptation
- Scroll indicator mobile responsiveness
- Keypad element mobile layout improvements
- Positioned beat view mobile font scaling
- Chat dialog view mobile adjustments
- Improved mobile detection utility

**Files modified:**
- `packages/renderer/src/components/CharacterInventoryFrame.tsx`
- `packages/renderer/src/components/CharacterMeterFrame.tsx`
- `packages/renderer/src/components/ChatDialogView.tsx`
- `packages/renderer/src/components/CountdownMeterHud.tsx`
- `packages/renderer/src/components/KeypadElement.tsx`
- `packages/renderer/src/components/PositionedBeatView.tsx`
- `packages/renderer/src/components/ScrollIndicator.tsx`
- `packages/renderer/src/components/TimerHudDisplay.tsx`
- `packages/renderer/src/renderers/ReactRenderer.tsx`
- `packages/renderer/src/utils/mobileDetection.ts`
- `packages/core/src/generated/beat-types.ts`
- `packages/builder/public/player-web.js`

### Bug Fixes

- Fixed stage clipping issues
- Fixed cover mode incorrectly activating on desktop
- Collapsible language panel in exported HTML

---

## 2026-02-18: Fix Undo Overwriting Translations (v0.9.20)

### Overview

This release fixes a bug where **undo would overwrite existing translations** when a translation language was active during editing.

### Root Cause

When a translation language (e.g., Italian) is active, the Inspector overlays translated text onto `localBeat.parameters` for display in form fields. When a non-translation edit (e.g., changing a connection target) triggered `rebuildConnectionsAndUpdate`, the function sent `localBeat.parameters` — which contained translated text overlays — to `beat.updateParameters()`. This contaminated the beat's source text with translated values. Then when the user pressed undo, the command restored the pre-edit source text, making it appear as though translations were "overwritten."

### Fix

Modified `rebuildConnectionsAndUpdate` in `Inspector.tsx` to strip translation overlays before updating the beat. When a translation language is active, the function now:

1. Uses `sourceParametersRef.current` (which stores pre-overlay source values) to restore source text for all translated top-level fields
2. Restores complex nested structures (`dialogTree`, `choices`, `props`, `hyperlinks`, `textVariations`) from their source values
3. Passes the cleaned `parametersForUpdate` to `beat.updateParameters()` instead of the overlay-contaminated parameters

This ensures the beat's source parameters are never polluted with translated text, and undo/redo operates correctly on source text only.

**Files modified:**
- `packages/builder/src/components/Inspector.tsx` — Strip translation overlays in `rebuildConnectionsAndUpdate`

---

## 2026-02-18: Undo/Redo System & History Panel (v0.9.19)

### Overview

This release **fixes undo/redo (Ctrl+Z / Cmd+Z)** which was previously broken for all normal beat editing operations. The existing CommandManager infrastructure was in place but only AI bulk operations used it — Inspector edits, beat additions, deletions, and moves all bypassed the command system entirely. This release wires all beat mutations through the command system and adds a **history panel** to the toolbar.

### Undo/Redo Wiring (Core Fix)

Previously, the flow was: Inspector → `onUpdate()` → `actions.updateBeat()` (direct — no command created). Now all beat operations create proper commands:

- **`handleBeatUpdate`**: Creates `UpdateBeatCommand` with deep-cloned old values via `structuredClone()` (preserves Maps, Sets, Dates unlike `JSON.parse(JSON.stringify())`)
- **`handleBeatDelete`**: Creates `DeleteBeatCommand` with full beat snapshot for restore on undo
- **`handleBeatAdd`**: Records `AddBeatCommand` via `pushWithoutExecute()` (beat already created by `actions.addBeat`)
- **`handleBeatMove`**: New handler wrapping `MoveBeatCommand` (replaces direct `actions.moveBeat` prop)

**Key design decision**: A `stableMutations` ref is updated every render so command undo/redo callbacks always use the latest `actions` without stale closures.

**Files modified:**
- `packages/builder/src/App.tsx` — All four beat handlers rewritten, stableMutations ref, imports, VCS history clear
- `packages/builder/src/commands/BeatCommands.ts` — Added `MoveBeatCommand`, `moveBeat` to `BeatStateMutations`
- `packages/builder/src/commands/CommandManager.ts` — Added `pushWithoutExecute()` method
- `packages/builder/src/components/ai/HelperCommandInput.tsx` — Added `moveBeat` no-op to satisfy updated interface

### History Panel

Added a clickable history dropdown to the `UndoRedoToolbar` (in the Header):

- Click the history counter (e.g., "3/5") to open the dropdown
- Commands shown newest-first with relative timestamps ("2s ago", "1m ago")
- Current command highlighted in blue with a dot indicator
- Undone (redo-able) commands shown dimmed
- Click any entry to jump to that point (multiple undo/redo calls)
- "Clear" button to wipe history
- Closes on outside click

**Files modified:**
- `packages/builder/src/components/UndoRedoToolbar.tsx` — Full rewrite with dropdown, History/Trash2 icons, jump-to-point

### MoveBeatCommand

New command class for undoable beat position changes:
- Stores `beatId`, `oldPosition`, `newPosition`
- 500ms merge window coalesces rapid drag events into a single history entry
- Registered in `registerBeatCommands()` for deserialization

### Additional Fixes

- **`handleCommandExecuted`**: Removed `if (type === 'undo' || type === 'redo')` guard — `markChanged()` now fires for all command operations
- **VCS history clear**: After successful VCS operations (pull, stash pop), undo history is cleared since the project state changed externally
- **structuredClone fix**: `JSON.parse(JSON.stringify())` was destroying `Map` instances (like `beat.locations`), causing "locations.values is not a function" errors when undoing dialogTree edits

---

## 2026-02-17: Translation Persistence, Multi-Language AI, Windows Fixes & Build Numbering (v0.9.18)

### Overview

This release makes **translation persistence fully functional** across app restart, git push/pull, and session restore. It adds **multi-language story generation** to both internal and MCP AI prompts, fixes several **Windows-specific issues** (EPERM, duplicate windows, startup translation loading), and introduces **CI-driven build numbering** for version tracking.

### Translation Persistence (Critical Fix)

Previously, translations generated in ASAPS Builder were lost on app restart because:
1. `PersistenceContext.loadProject()` set `currentProject` before reading translations from disk, causing a React same-reference state skip
2. `HybridStorageAdapter.expandPath()` failed on Windows with EPERM when trying to create `C:\Program Files\ASAPS Builder\~`
3. VCS pull didn't reload translation files from disk
4. Translation generation didn't trigger `markChanged()` for auto-save

**Fixes applied:**
- Restructured `loadProject()` to set `currentProject` ONCE after all data (including translations) is loaded
- Made `expandPath()` async, using Electron's `app.getPath('home')` instead of non-existent `getHomedir()`
- VCS event handler now reads translation files from disk after any successful operation
- `markChanged()` called after translation generation in Header.tsx
- DirectoryAdapter now passes translations through in both directions (open and save)

**Files modified:**
- `packages/builder/src/contexts/PersistenceContext.tsx` — Single setCurrentProject after translations loaded
- `packages/builder/src/storage/HybridStorageAdapter.ts` — Async expandPath with proper home resolution
- `packages/builder/src/App.tsx` — VCS event handler rewrite, translation sync in syncProjectData
- `packages/builder/src/components/Header.tsx` — markChanged() after translation generation
- `packages/builder/src/storage/adapters/DirectoryAdapter.ts` — Translation wiring in open/save

### Multi-Language AI Generation

AI prompts (both internal and MCP) now support generating stories in multiple languages:
- New `languages` field in `StoryGenerationRequest` (e.g., `["en", "de", "fr"]`)
- Stories are written in the primary language with a `translations` array for additional languages
- Translation key format documented: `beat:{beatId}.parameters.{field}`
- `displayName` on pickProp props and `displayText` on movementChoice choices for translation-safe labels
- MCP server inject endpoint accepts translations and passes them through

**Files modified:**
- `packages/builder/src/types/ai.ts` — Added `languages` field
- `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` — Translation section, output format, user prompt
- `packages/builder/src/services/prompts/storyGeneration.ts` — Translation section, language handling
- `mcp-server-desktop/src/index.ts` — Translation schema, pass-through, guide in themes response

### Windows Fixes

- **EPERM error**: `expandPath()` fell back to literal `~` on Windows because `getHomedir()` wasn't in the Electron preload. Now uses async `app.getPath('home')`.
- **Duplicate windows**: Added `app.requestSingleInstanceLock()` to Electron main process to prevent two windows after install.
- **Translation loading**: Translations now load on startup by reading from disk before setting React state.

**Files modified:**
- `packages/builder/src/storage/HybridStorageAdapter.ts` — Async expandPath with fallbacks
- `apps/builder-desktop/src/main/index.ts` — Single instance lock

### CI Build Numbering

- `build-number.json` tracked in git, incremented by CI workflow
- Version display in app shows format: `v0.9.18.{buildNumber}`
- Local builds read but don't increment the build number

**Files modified:**
- `.github/workflows/build-desktop.yml` — `increment-build-number` job
- `build-number.json` — Tracked in git
- `packages/builder/vite.config.ts` — Read-only build number

### New Tests (26 tests)

- **expandPath** (8 tests): Home directory resolution via app.getPath, Windows paths, fallbacks
- **extractBeatSourceStrings** (14 tests): All beat types, dialogTree, AI beats, edge cases
- **DirectoryAdapter translation wiring** (4 tests): Open/save with and without translations

**New test files:**
- `packages/builder/src/storage/__tests__/expandPath.test.ts`
- `packages/builder/src/export/__tests__/extractBeatSourceStrings.test.ts`
- `packages/builder/src/storage/adapters/__tests__/DirectoryAdapter.translations.test.ts`

---

## 2026-02-16: Windows Git Fix, Stability, Translation, Tests & Prompt Sync (v0.9.17)

### Overview

This release fixes **Git VCS support on Windows**, resolves numerous stability issues with directory-based projects, adds **story content translation**, and brings the internal and MCP AI generation prompts into full sync. Also adds **122 new unit tests** for previously untested beat types and the StoryTranslator.

### Windows Git VCS Fix (Critical)

Git version control now works reliably on Windows:

- **Path separator fix**: Windows backslashes in file paths (storage adapters, core DirectoryFormat, ElectronStorageAdapter) corrected throughout the pipeline
- **Auto-detect git.exe**: Automatically finds git.exe on Windows PATH; shows install instructions if not found
- **Error surfacing**: Git command failures now surface actual error messages instead of failing silently

### Stability Fixes

- **Cluster crash fix**: Orphaned beats (not in any cluster) now render as standalone instead of crashing
- **VCS double-init fix**: Prevented infinite re-render loop during VCS auto-initialization; parallelized git polling
- **Asset loading fix**: Filesystem fallback when IndexedDB fails for directory-based projects
- **UI reset on delete**: UI properly resets when deleting the currently loaded project
- **Re-render reduction**: Eliminated excessive re-rendering from window.electron API access
- **Electron preview fix**: Fixed preview window in Electron desktop app
- **Beat ordering fix**: Corrected beat ordering in certain edge cases

### Story Translation (New Feature)

- **Translation UI**: New translation interface for translating story content to other languages
- **StoryTranslator**: Extracts all translatable strings (beat text, dialog trees, character names, HUD labels, etc.) for batch translation
- **Translated hotspot labels**: Movement choice and pickProp display text now translatable

### HTML Export Fixes

- **Timer HUD**: Fixed time HUD display in exported HTML
- **Windows paths**: Fixed path separators in HTML export on Windows
- **HUD overlaps**: Fixed HUD overlay positioning conflicts
- **Default button layout**: Corrected default button layout in exported stories

### AI Prompt Synchronization

Brought internal (enhanced) and MCP server story generation prompts to the same level:

- **counterCompare condition**: Added to enhanced prompt (was MCP-only)
- **Inventory quantity checks**: Added to MCP prompt with `quantityOperator`/`quantityValue` and `$variable` support
- **Item description pattern**: Added to MCP prompt (pickProp must lead to infoText describing item)
- **Beat suggestion prompt**: Updated with fictional time, AI runtime beats, counter effects, markVisited
- **Dialog prompt**: Updated with counter effects examples, sound effects, visited tracking

### Test Coverage (122 New Tests)

| Test File | Tests | Coverage |
|-----------|-------|---------|
| PickPropBeat.test.ts | 28 | Props, inventory, effects, sounds, markVisited, choiceDelay |
| DurScreenBeat.test.ts | 16 | Text variations, random selection, variable interpolation |
| TitleScreenBeat.test.ts | 9 | Constructor, params, variable interpolation |
| EndScreenBeat.test.ts | 17 | Restart/credits detection, context reset, variable interpolation |
| HyperTextBeat.test.ts | 15 | Hyperlinks, connections, choice recording, styling |
| InputTextBeat.test.ts | 16 | Variable/counter storage, numeric conversion, validation |
| StoryTranslator.test.ts | 21 | String extraction for all beat types, characters, HUD, environment |

---

## 2026-02-13: Auto-Update Fix, AI Generation & MCP Improvements (v0.9.16)

### Overview

This release fixes the **Electron auto-update 404 error** and significantly improves AI story generation quality across both internal providers and the MCP server.

### Auto-Update Fix (Critical)

- **Fixed 404 error**: Artifact filenames now match the URLs in `latest.yml` / `latest-mac.yml`, restoring auto-update on both Windows and macOS

### AI Story Generation Improvements

- **Richer generated stories**: Increased beat counts (short: 8-15, medium: 15-30, long: 30+)
- **Theme recommendations**: AI suggests matching built-in theme based on genre
- **Advanced branching patterns**: 9 patterns (hub-and-spoke, state accumulation, timed branching, inventory-gated puzzles, reputation systems)
- **Procedural game elements**: Stories include counters, variables, inventory, conditional endings by default
- **Correct parameter handling**: Fixed parameter name mismatches (endMessage→message, variableName→variable, etc.)
- **Concrete examples**: Added beat examples and anti-pattern documentation
- **Sound/counter effects on choices**: Choices support sound effects and counter modifications

### MCP Server Fixes

- **Recursive dialog extraction**: Nested dialogTree choices correctly imported
- **ConditionBeat compatibility**: Supports nested and legacy formats

### UI

- **Version display**: App version shown in header

---

## 2026-02-13: Timer HUD, Fictional Time, Countdown Meter, Keypad Beat, Visual Editor UX & Choice Effects (v0.9.15)

### Overview

This release adds major features — **Timer/Time HUD display**, **Fictional Time system**, **Countdown Meter HUD**, a new **Keypad beat type**, **recursive dialog trees** — plus significant visual editor UX improvements including **multi-select, alignment/distribute tools, snap guides, element grouping**, and a **unified choice effects system** for dialog trees and movement choices.

### Timer HUD Display (New Feature)

A configurable HUD overlay that displays time information persistently across beats:

- **Auto-detect mode**: Automatically detects whether to show countdown timer, fictional time, manual text, or static text — no manual mode selector needed
- **Timer mode**: Real-time countdown display (MM:SS) driven by active SetTimer beats, with color transitions (green → yellow → red) as time decreases
- **Fictional time mode**: Displays formatted fictional time (e.g. "4 April 1968, 9:00 AM") when fictional time is enabled
- **Static mode**: Narrative time text with per-beat overrides via `timeDisplayText` parameter
- **Per-beat display control**: `timeDisplayMode` property (fictionalTime / manual / none) lets each beat control what the Timer HUD shows
- **Customizable**: Position (4 corners), style (digital/minimal), font size, colors, opacity, border radius, optional label
- **Global Settings HUD tab**: New dedicated tab in Global Settings for configuring all HUD overlays

### Countdown Meter HUD (New Feature)

A counter-driven progress bar HUD that persists across beats:

- **Counter-based**: Fills/depletes based on any character counter value
- **Color transitions**: Normal → warning → critical thresholds with configurable colors
- **Numeric display**: Value, fraction (e.g. "3/10"), or percentage formats
- **6 positions**: Top-left/right/center, bottom-left/right/center
- **Configurable**: Bar dimensions, colors, opacity, border radius, label

### Fictional Time System (New Feature)

Track in-story date/time progression for historical fiction, day counters, and time-travel narratives:

- **Set/Advance/Subtract**: Use `setVariable` beat with type `fictionalTime` to initialize, advance, or subtract (time travel) in-story time
- **Time units**: Minutes, hours, days, months, years — with correct month-length and leap-year arithmetic
- **Condition checking**: Use `conditionBeat` with type `fictionalTime` to branch based on date/time comparisons (before, after, exactly)
- **Display formats**: 7 formats — time-12h ("9:00 AM"), time-24h ("21:00"), date ("4 April 1968"), datetime-12h/24h, day-number ("Day 3"), year ("1968")
- **Timer HUD integration**: Fictional time displays automatically in the Timer HUD when enabled in global settings
- **Per-beat override**: Each beat's `timeDisplayMode` can show fictional time, manual text, or hide the HUD entirely
- **54 unit tests**: Comprehensive test coverage for set/advance/subtract/format/serialize/condition operations

### Recursive Dialog Trees (New Feature)

Dialog trees now support looping back to the same beat:

- **`__self__` target**: Choices can use `target: "__self__"` to re-display the same dialogTree beat
- **Per-choice visited tracking**: Individual choices tracked via composite keys (`beatId:choiceId`), enabling grayed-out already-selected options
- **Use cases**: Interrogation scenes, shopping menus, multi-question NPCs where the player asks several questions before leaving

### Keypad Beat (New Beat Type)

A new `keypad` beat type for phone keypads, safe locks, PIN entry, and similar numeric input:

- **3 layouts**: Numeric (1-9, ←, 0, ✓), Phone (1-9, *, 0, #), PIN (1-9, C, 0, ✓)
- **Code validation**: Optional correct code with max attempts and fail target beat
- **Masked input**: Show dots instead of digits for PIN entry
- **Digit display**: Configurable display area showing entered digits
- **Variable/counter storage**: Save entered code to variable or counter (reuses inputText pattern)
- **Full visual editor support**: Keypad renders as interactive grid in both visual editor and preview
- **Custom inspector**: Dedicated properties panel with all keypad settings

### Unified Choice Effects System (New Feature)

Dialog tree choices and movement choices now support inline effects:

- **Variable effects**: Set/increment/decrement variables directly from choices
- **Counter effects**: Modify character counters from choices
- **Inventory effects**: Add/remove inventory items from choices
- **SmartNameDropdown**: New reusable dropdown component for selecting variables/counters with character context
- **TextFieldWithVariables**: New reusable text field with variable reference autocomplete
- **Effects migration**: Automatic migration of legacy choice effect formats

### Visual Editor UX Improvements (Enhancement)

Major usability improvements to the visual beat editor:

- **Multi-select**: Shift+click or rubber-band selection for multiple elements
- **Alignment tools**: Align left/center/right/top/middle/bottom for selected elements
- **Distribute tools**: Distribute horizontally/vertically with equal spacing
- **Element grouping**: Group/ungroup elements that move together
- **Snap guides**: Smart alignment guides when dragging elements near other elements
- **Arrow key nudging**: Move selected elements with arrow keys (1px, Shift+arrow for 10px)
- **Font fix**: Corrected font rendering in visual editor

### Other Improvements

- **AI provider persistence**: AI provider settings (API keys, model selections) now saved to project `globalSettings` for VCS-friendly storage
- **Spritesheet optimization**: Converted spritesheet storage from base64 to blob URLs with asset ID tracking for better memory usage
- **Git clone path fix**: Fixed forward-slash in Windows paths when cloning repositories (platform-aware separator detection)
- **Countdown meter improvements**: Percentage-based width, per-beat visibility override, configurable range
- **Advanced settings hiding**: Logic beats (setVariable, conditionBeat, etc.) no longer show irrelevant Auto-Advance, Time Display, and Countdown Meter settings
- **AI prompt updates**: Internal and MCP server prompts updated with fictional time, recursive dialog trees, per-choice visited tracking documentation
- **Test coverage**: Comprehensive test suite — 54 new fictional time tests plus existing choice effects, alignment utilities, snap guides, and effects migration tests

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/storage/types.ts` | Added `hudOverlays` section to `GlobalSettings` |
| `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` | New "HUD" tab with Timer HUD and Countdown Meter configuration |
| `packages/renderer/src/components/TimerHudDisplay.tsx` | **New**: Timer/time HUD display component |
| `packages/renderer/src/components/CountdownMeterHud.tsx` | **New**: Countdown meter HUD component |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Integrated Timer HUD, Countdown Meter, and Keypad rendering |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Added `renderKeypad()`, timer HUD and countdown meter wiring |
| `packages/builder/src/pages/PreviewWindow.tsx` | Wired HUD configs and timer events to renderer |
| `packages/core/src/beats/KeypadBeat.ts` | **New**: Keypad beat class with code validation and retry logic |
| `packages/core/src/beats/BeatRegistry.ts` | Registered `KeypadBeat` |
| `packages/core/src/types/index.ts` | Added `'keypad'` to Location kind, `renderKeypad` to IRenderer |
| `packages/core/src/generated/beat-types.ts` | Added `KeypadParameters` interface |
| `packages/renderer/src/components/KeypadElement.tsx` | **New**: Interactive keypad grid component |
| `beat-definitions/core-beats.json` | Added `keypad` beat definition |
| `packages/builder/src/components/Inspector.tsx` | Keypad inspector UI, visual editor support |
| `packages/builder/src/components/WorkspaceView.tsx` | Added keypad to visual editor support |
| `packages/builder/src/components/visual/VisualBeatEditor.tsx` | Added `'keypad'` to element type union |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Keypad kind-mapping in 6 locations |
| `packages/builder/src/utils/SchemaLocationInitializer.ts` | Mapped `keypadGrid` and `display` location types |
| `packages/builder/src/editors/ChoiceEffectsEditor.tsx` | **New**: Unified choice effects editor component |
| `packages/builder/src/editors/SmartNameDropdown.tsx` | **New**: Reusable variable/counter name dropdown |
| `packages/builder/src/editors/TextFieldWithVariables.tsx` | **New**: Text field with variable autocomplete |
| `packages/builder/src/components/visual/alignmentUtils.ts` | **New**: Alignment and distribute utility functions |
| `packages/builder/src/components/visual/snapGuides.ts` | **New**: Snap guide calculation utilities |

---

## 2026-02-10: Git VCS Integration & Clone Repository (v0.9.14)

### Overview

This release adds **full Git version control integration** to the desktop app, enabling collaborative story authoring. Authors can now initialize repos, commit, push, pull, manage branches, resolve merge conflicts, and clone repositories — all from within the app.

### Git VCS Support (Major Feature)

Complete Git integration for directory-based projects in the Electron desktop app:

- **Directory-format persistence**: Projects saved as human-readable JSON files (one file per beat, organized by cluster) for clean diffs and merge-friendly collaboration
- **VCS panel**: Sidebar panel showing pending changes, commit history, and branch info
- **Commit & push/pull**: Stage changes, write commit messages, push to remote, pull updates
- **Branch management**: Create, switch, and manage branches from the UI
- **Merge conflict resolution**: Detect and display merge conflicts with resolution UI
- **Activity log**: Scrollable log of all VCS operations with timestamps
- **Push rejection dialog**: Clear guidance when push is rejected (remote has new commits)
- **Sticky error toasts**: Non-blocking error notifications for VCS operations
- **Session persistence**: Directory path and VCS state preserved across app restarts
- **Git-missing UX**: Friendly guidance when git is not installed on the system

### Clone Repository (New Feature)

New **"Clone Repository..."** menu item in the File menu:

- Enter a remote URL and pick a local destination folder
- Auto-extracts repository name from URL for the target path
- Clones the repo and auto-opens the project with VCS active
- Detects merge conflicts in cloned repos and warns before opening
- 5-minute timeout for large repositories (configurable via IPC)

### Sound Asset Serialization (Enhancement)

Extended blob URL stripping (already done for images) to sound assets for VCS-friendly output:

- Beat `sound.file` blob URLs stripped during serialization
- `soundEffect` in dialog choices/options sanitized across all beat types
- Global `backgroundMusic` blob URL in settings stripped on save
- Ensures clean, diffable JSON files without transient blob references

### Bug Fixes

- **Asset manifest overwrite fix**: Fixed critical bug where `_manifest.json` was overwritten with empty content during incremental auto-saves — manifest now only written when assets are explicitly provided
- **VCS helper file preservation**: `.gitignore`, `.p4ignore`, `.gitattributes` files are no longer overwritten on save if they already exist (preserves user customizations)
- **.DS_Store filtering**: OS metadata files (`.DS_Store`, `Thumbs.db`, `Desktop.ini`) filtered from VCS pending changes display and added to default `.gitignore` template
- **Git pull upstream fix**: Fixed git pull failing when branch has no upstream tracking reference

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/vcs/GitAdapter.ts` | Added `gitClone()`, OS file filtering in `getGitStatus()` |
| `packages/builder/src/components/vcs/CloneRepoDialog.tsx` | New clone dialog component |
| `apps/builder-desktop/src/main/index.ts` | "Clone Repository..." menu item, configurable command timeout |
| `apps/builder-desktop/src/preload/index.ts` | IPC event for clone menu, timeout parameter, type declarations |
| `packages/builder/src/App.tsx` | Clone dialog wiring, conflict detection on clone |
| `packages/core/src/persistence/BeatSerializer.ts` | Sound blob URL sanitization (`sanitizeSound`, `sanitizeParameters`) |
| `packages/core/src/persistence/DirectoryFormat.ts` | Settings blob sanitization, manifest overwrite fix, `.gitignore` update |
| `packages/builder/src/storage/adapters/DirectoryAdapter.ts` | VCS helper file preservation |

---

## 2026-02-06: AI Dialog Fix & Model Defaults Update (v0.9.13)

### Overview

This release fixes AI-powered dialog tree generation in the web player and all player platforms, and updates all OpenAI model defaults from GPT-5.1 to GPT-5.2.

### AI Dialog Tree Fix (Bug Fix)

The `AIDialogTreeBeat` was failing in the web player (and would fail in desktop/mobile players) with "No valid JSON found in response":

- **Root cause**: `WebAIService.generateDialog` was prepending its own JSON format instructions (a `nodes[]` array format) that conflicted with the detailed nested `dialogNode` format that `AIDialogTreeBeat` sends in its prompt. The model received two incompatible format specifications and produced unparseable output.
- **Additional issues**: `maxTokens` was only 2000 (insufficient for complex trees), no handling for `<think>` blocks from reasoning models, and no markdown code block stripping.

**Fix applied across all players:**
- Proper system/user message separation (instead of concatenating into a single prompt)
- Minimal system prompt that doesn't conflict with AIDialogTreeBeat's detailed format
- Increased `max_tokens` to 8192 for complex dialog trees
- Robust JSON extraction handling markdown code blocks and balanced braces
- `<think>` block stripping for reasoning models

### OpenAI Model Default Update

Updated all remaining `gpt-5.1` references to `gpt-5.2`:
- `OpenAIProvider.ts` default model
- `AIConfigDialog.tsx` default model and UI label (now shows "GPT-5.2")
- `PreviewWindow.tsx` OpenAI fallback (was `gpt-4` with only 8k context!)
- `StoryPreview.tsx` OpenAI fallback
- `AIService.ts` direct call fallback
- `ai.ts` type documentation

### Files Modified

| File | Changes |
|------|---------|
| `packages/player-web/src/WebAIProvider.ts` | Rewrote generateDialog with proper system/user separation, extractJSON, thinking block stripping |
| `packages/builder/public/player-web.js` | Rebuilt player-web bundle |
| `apps/player-desktop/src/services/AIService.ts` | Same generateDialog fix + helper methods |
| `apps/player-mobile/src/services/AIService.ts` | Same generateDialog fix + helper methods |
| `apps/player-desktop/src/services/LocalLLMProvider.ts` | Same fix adapted for local LLM (single prompt) |
| `packages/builder/src/pages/PreviewWindow.tsx` | Bumped dialog tokens to 8192, fixed gpt-4 fallback to gpt-5.2 |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Fixed gpt-4 fallback to gpt-5.2 |
| `packages/builder/src/services/AIService.ts` | Fixed gpt-4 fallback to gpt-5.2 |
| `packages/builder/src/services/providers/OpenAIProvider.ts` | Default model gpt-5.1 → gpt-5.2 |
| `packages/builder/src/components/ai/AIConfigDialog.tsx` | Default model + UI label updated to GPT-5.2 |
| `packages/builder/src/types/ai.ts` | Documentation updated |

---

## 2026-02-05: HTML Export & Unified Rendering Architecture (v0.9.12)

### Overview

This release introduces **standalone HTML export** for sharing stories without requiring ASAPS, plus a **unified rendering architecture** that ensures perfect WYSIWYG alignment between the visual editor and preview.

### HTML Export (Major Feature)

Export your stories as self-contained HTML files that run anywhere:

- **Splash screen**: Professional loading experience
- **Counter HUD**: Visual display of counters/stats during gameplay
- **Inventory icons**: Visual inventory system with item icons
- **Tailwind CSS**: Modern styling that works across browsers
- **Zero dependencies**: Single HTML file runs offline in any browser

**Note**: AI-based beats (aiInfoText, aiDurScreen, aiDialogTree, aiSummary, aiCondition) are not yet supported in HTML export. Stories using these beats will show fallback text.

### Unified Rendering Architecture (WYSIWYG)

Major refactoring to ensure visual editor and preview render elements identically:

- **Single source of truth**: New `computeDialogTreeLayout()` function in `@asaps/core` used by both visual editor and preview
- **Button auto-sizing**: Buttons now correctly grow to fit multi-line text with aligned constants (charWidth=0.6, lineHeight=1.4)
- **Height safeguard**: ASML imports with outdated stored heights are now auto-corrected to prevent text clipping
- **Selection handles**: Now perfectly aligned with rendered elements in all cases

### DialogTree Improvements

- **Path-based unique IDs**: Phase selection now uses full path IDs to correctly handle duplicate phase structures
- **Z-index handling**: Proper layer ordering preserved during ASML imports and visual editor reordering

### Layout & Collision Detection

- **Improved cluster collision**: Auto-arrange now correctly detects collisions between clusters
- **Button stacking**: Fixed button vertical positioning and gap calculations

### AI Documentation Sync

- **MCP server updated**: Added missing `aiCondition` and `onlineContent` beat types to BEAT_TYPES
- **Builder prompts updated**: Full parameter documentation for all AI beats

### Test Coverage

- **56 new tests**: Comprehensive tests for `elementSizing` and `dialogTreeLayout` modules
- **WYSIWYG guarantee tests**: Verify `toLocations()` and `toVisualElements()` produce identical positions

### CI/Infrastructure Updates

- **Node.js requirement**: Updated minimum Node version from 18 to 20 (CI) and 22 (desktop builds)
  - Several dependencies now require Node 20+ (`jsdom`, `lru-cache`, `minimatch`, etc.)
  - `@electron/rebuild` requires Node 22.12.0+
- **CI workflow**: Tests now run on Node 20.x and 22.x matrix
- **Desktop build workflow**: Uses Node 22 for Electron app compilation
- **package-lock.json**: Synced with `@asaps/player-web` workspace
- **Build order fixed**: Added `@asaps/player` to build chain before `player-web`
- **Security audit**: Changed from `moderate` to `critical` level (high/moderate vulns in build tools)
- **test:ui script**: Fixed to use workspace flag (`-w @asaps/builder`)
- **CodeQL**: Added init step and proper permissions for security analysis
- **Bundlesize**: Removed (no config existed in repo)

**Known Test Issues** (pre-existing, not blocking releases):
- Some tests use browser APIs (`URL.createObjectURL`) not available in jsdom
- These tests pass locally but fail in CI due to jsdom limitations

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/layout/elementSizing.ts` | NEW: Consolidated sizing utilities |
| `packages/core/src/layout/dialogTreeLayout.ts` | NEW: Shared layout calculation |
| `packages/core/tests/layout/*.test.ts` | NEW: 56 tests for layout modules |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Use shared layout |
| `packages/core/src/beats/DialogTreeBeat.ts` | Use shared layout |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Import sizing from core |
| `mcp-server/src/utils/aiHelper.ts` | Added aiCondition, onlineContent |
| `packages/builder/src/services/prompts/storyGenerationEnhanced.ts` | Full AI beat docs |
| `.github/workflows/ci.yml` | Updated Node 18→20, 20→22 matrix |
| `.github/workflows/build-desktop.yml` | Updated Node 20→22 for Electron |
| `apps/builder-desktop/package.json` | Version bump to 0.9.12 |

---

## 2026-02-01: Independent Preview Window & UI Improvements (v0.9.11)

### Overview

This release features a **redesigned preview system** with an independent preview window, **path-based state presets** for testing, and **comprehensive UI tooltips** to help beginners navigate the interface.

### Independent Preview Window (Major Feature)

The preview system has been completely redesigned:

- **Separate window**: Preview now opens in its own dedicated window, allowing side-by-side editing and testing
- **Path-based presets**: Automatically analyzes all paths to a beat and generates state presets
- **InputText value entry**: Modal dialog for entering custom values when paths include inputText beats (instead of auto-generated placeholders)
- **Debug panel**: Shows current beat, visited beats, variables, and counters in real-time
- **Keyboard shortcuts**: Space to pause/resume, Escape to stop, I for inventory

### AI Summary Context Options

AI Summary beat now has the same context options as AI Dialog Tree:
- Include Variables (default: on)
- Include Inventory (default: off)
- Include Visited Beats (default: on)
- Include Choice History (default: on)
- Include Counters (default: off)

### UI Tooltips Throughout App

Added descriptive tooltips to help beginners understand the interface:
- **Beat Palette**: Each beat type shows its description on hover
- **Header buttons**: Characters, Assets, Settings, Debug, AI menu items
- **Debug Panel tabs**: Explains what each analysis type does
- **Global Settings tabs**: Describes each settings category
- **Sidebar**: Search field and cluster creation hints
- **Inspector**: Name field and background sound explanations

### User Guide Updates

- Updated terminology: "Intro Text" → "Info Text" throughout
- Added comprehensive Preview Mode documentation
- New screenshots for path presets and InputText modal

### Bug Fixes

- Fixed "Click to preview" overlay not disappearing after InputText modal completion
- InputText beats now properly simulate placeholder values during path analysis

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/pages/PreviewWindow.tsx` | New independent preview window with path presets |
| `packages/builder/src/components/preview/InputTextValuesModal.tsx` | New modal for inputText value entry |
| `packages/builder/src/services/PathBasedPresetGenerator.ts` | Generate presets from path analysis |
| `packages/core/src/beats/AISummaryBeat.ts` | Added missing context options |
| `packages/core/src/utils/PlayerContextBuilder.ts` | Added includeVisitedBeats parameter |
| `beat-definitions/core-beats.json` | Updated aiSummary parameters |
| Multiple component files | Added tooltips throughout UI |
| `docs/USER_GUIDE.md` | Updated with preview documentation |

---

## 2026-01-26: Improved Path Analysis with StateSimulationAnalyzer (v0.9.10)

### Overview

This release introduces a **new path analysis engine** that accurately handles hub-and-spoke story patterns (like the Malta's Rail Dilemma story). The new `StateSimulationAnalyzer` replaces the constraint-based approach with actual gameplay simulation.

### StateSimulationAnalyzer (Major Improvement)

New simulation-based path analysis that accurately explores all story paths:

- **Gameplay simulation**: Simulates actual gameplay traversal with full state tracking (variables, counters, inventory)
- **Hub-and-spoke support**: Correctly handles patterns where players visit multiple locations from a central hub in any order
- **Accurate path counting**: Finds all valid orderings (e.g., 24 orderings × 4 endings = 96 paths for Malta story)
- **Condition-gated path detection**: Properly highlights beats like `beat_incomplete` that are visited when conditions fail
- **Infinite loop prevention**: Only retries condition-gated options (paths to conditionBeat), preventing exponential explosion

**Technical Details**:
- Stack-based exploration with per-beat choice tracking
- State hashing for cycle detection (variables, counters, inventory)
- Re-exploration logic limited to conditionBeat targets only
- Full path beat IDs stored for accurate highlighting in UI

### Bug Fixes

- **ASML titleScreen parsing**: Fixed parsing of `<connection>` elements within titleScreen beats

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/analysis/StateSimulationAnalyzer.ts` | New simulation-based path analyzer |
| `packages/core/src/analysis/ConstraintSet.ts` | Added `pathBeatIds` to PathVariation interface |
| `packages/core/src/analysis/index.ts` | Export new StateSimulationAnalyzer |
| `packages/builder/src/components/debug/PathVisualization.tsx` | Use StateSimulationAnalyzer, highlight all path beats |
| `packages/core/src/xml/ASMLParser.ts` | Parse connection elements in titleScreen |

---

## 2026-01-25: Productivity Enhancements & AI Runtime Beats (v0.9.9)

### Overview

This release focuses on **productivity improvements** for story authoring with powerful transformation commands, enhanced inventory operations, and text variety support. It also introduces two new **AI runtime beats** that generate dynamic content during playback.

### Transformation Commands (Major Feature)

New helper commands for efficient bulk operations on story content:

- **Rename Character**: Rename characters across all beats in the story
- **Rename Variable**: Update variable names globally with automatic reference updates
- **Rename Beat**: Rename beats with connection integrity preserved
- **Delete Character**: Remove characters with options for beat handling
- **Delete Variable**: Clean removal of variables from the story
- **Merge Characters**: Combine characters with dialog/expression consolidation
- **Merge Variables**: Consolidate variables with value transfer options

All transformation commands use **deterministic sentence-based parsing** for reliable operation without AI hallucination risks.

### Inventory Quantity Functions

Enhanced inventory system with quantity tracking:

- **getInventoryQuantity(item)**: Returns the quantity of a specific item
- **setInventoryQuantity(item, n)**: Sets an item to a specific quantity
- **addInventoryQuantity(item, n)**: Adds n to item quantity (creates item if missing)
- **removeInventoryQuantity(item, n)**: Removes n from item quantity (removes item if quantity reaches 0)

Use in conditions: `${getInventoryQuantity("Gold")} >= 10` or in SetVariable with arithmetic operations.

### Text Variations for InfoText and DurScreen

Optional `textVariations` array for random text selection at runtime:

- Add multiple text variations to any Info Text or Duration Screen beat
- One variation is randomly selected each time the beat executes
- Main text is combined with all variations for selection pool
- Variable interpolation (`${varName}`) works in all variations
- Adds replay value and narrative variety without complex branching

**Inspector UI**: Collapsible "Text Variations" section with add/remove controls.

### AI Runtime Beats (New Beat Types)

Two new beats that generate content dynamically during playback:

**aiInfoText** - AI-generated contextual text with Continue button
- Parameters: `prompt`, `fallbackText`, `buttonText`, `includeVariables`, `includeInventory`, `includeHistory`, `maxSentences`, `contextVariables`
- Use case: Personalized narrative descriptions, NPC reactions that adapt to player state
- Shows loading indicator while generating
- Falls back to `fallbackText` if AI unavailable

**aiDurScreen** - AI-generated text with auto-advance based on reading speed
- Same context parameters as aiInfoText
- Additional parameters: `wordsPerMinute` (default: 200), `minDuration`, `maxDuration`
- Auto-calculates display time based on generated text length
- Ideal for transitional scenes, ambient descriptions

Both beats support:
- Response caching based on context hash (regenerates when relevant state changes)
- AI suggestions stored in renderer state for author feedback
- Graceful degradation with fallback text

### Renamed Beat Type: introText → infoText

- The "introText" beat type has been renamed to "infoText" to better reflect its general purpose
- **Automatic migration**: Existing projects with "introText" are automatically converted on load
- ASML import handles legacy "introText" elements transparently
- No action required for existing projects

### Updated Documentation

- Comprehensive USER_GUIDE.md with new AI Runtime Beats section
- Updated beat reference with infoText, textVariations, and AI beats
- Removed redundant tutorial folder (USER_GUIDE now serves as primary documentation)
- Enhanced AI generation prompts for both internal UI and MCP server

### Bug Fixes

- Fixed MovementChoice hotspot association for visual elements
- Fixed props as MovementChoice choices not being clickable
- Fixed asset name and background loss on project import

---

## 2026-01-20: AI-Based Beats & Path Analysis Improvements (v0.9.8)

### Overview

This release introduces **AI-based beats** as a major new feature, allowing stories to incorporate dynamic AI-generated content during playback. Also includes improvements to path analysis and various bug fixes for the desktop app.

### AI-Based Beats (Major Feature)

New beat types that leverage AI to create dynamic, personalized story experiences:

- **AI Summary Beat**: Generates a narrative summary of the player's journey at story end
- **AI Condition Beat**: Uses AI to evaluate complex conditions based on story context
- **AI Dialog Tree Beat**: Dynamically generates dialog choices and responses

**AI Provider Recommendations**:
- For AI beats during playback: **Gemma 3 4B** running through Ollama works excellently - fast, local, and capable
- For story generation: **Claude**, **GPT**, or **Kimi K2** are preferred for their superior creative writing abilities

**Configuration**: AI beats require a configured AI provider in Settings → AI Configuration. Local models via Ollama are recommended for playback to ensure fast response times.

### Path Analysis Improvements (Work in Progress)

- Added `aiSummary` as a recognized ending beat type
- Fixed path tracking to differentiate player choices from condition results
- Added variable setter validation to detect invalid paths
- Fixed path mutation bug where multiple choices shared the same path object

**Note**: Path analysis for complex branching stories (where multiple parallel branches must all be visited) is still a work in progress. The analyzer may show more paths than expected in some scenarios.

### Bug Fixes

- **Unicode Support**: Fixed international character handling (ö, ä, ü, etc.) in OnlineContentBeat title derivation
- **Import Conflicts**: Replaced `window.prompt()` with custom modal for Electron compatibility
- **Desktop Build**: Fixed copy-builder script to properly replace old assets

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/analysis/BackwardAnalyzer.ts` | Variable setter tracking, constraint validation, aiSummary support |
| `packages/core/src/analysis/ConstraintPathAnalyzer.ts` | Decision tracking fixes, path mutation fix |
| `packages/core/src/beats/OnlineContentBeat.ts` | Unicode regex support for title derivation |
| `apps/builder-desktop/package.json` | Fixed copy-builder script |

---

## 2026-01-16: AI Improvements & Desktop App Enhancements (v0.9.7)

### Overview

This release focuses on improving AI story generation with external providers (OpenAI, Claude, Kimi) and adds the MCP integration toggle to the desktop app settings. Also includes initial Ren'Py theme import support.

### AI Story Generation Improvements

#### 1. External AI Provider Proxy Fixes

**Problem**: OpenAI and other external AI providers weren't working in the Electron desktop app due to CORS restrictions and missing configuration.

**Root Causes**:
- Proxy logic was only enabled for custom base URLs, but default OpenAI also needs the proxy
- API server didn't have default URLs for OpenAI/Claude when not specified
- GPT-5 reasoning models were using all tokens for reasoning, leaving none for output
- Request timeouts were too short for slow AI responses

**Fixes**:
- `OpenAIProvider.ts`: Changed proxy logic to use proxy for all non-localhost endpoints
- `api-server.ts`: Added default base URLs (`https://api.openai.com/v1` and `https://api.anthropic.com`)
- `OpenAIProvider.ts`: Increased GPT-5 token limit from 8000 to 32000 to accommodate reasoning
- `api-server.ts`: Added 5-minute timeout with AbortController for long AI requests

**Files Modified**:
| File | Changes |
|------|---------|
| `packages/builder/src/services/providers/OpenAIProvider.ts` | Proxy logic fix, GPT-5 token limits, debug logging |
| `apps/builder-desktop/src/main/api-server.ts` | Default URLs, 5-minute timeout, detailed logging |

#### 2. AI Config Dialog Scrolling

**Problem**: AI configuration dialog was cut off on smaller screens.

**Fix**: Added inline styles for scrolling since Tailwind JIT wasn't generating the arbitrary value class.

**Files Modified**:
- `packages/builder/src/components/ai/AIConfigDialog.tsx`

### Desktop App Enhancements

#### 1. MCP Integration Toggle

**Feature**: Added "Enable MCP Integration" checkbox to app settings menu.

**Access**:
- **macOS**: App name menu → Enable MCP Integration
- **Windows/Linux**: Settings menu → Enable MCP Integration

**Behavior**:
- MCP WebSocket connection is **disabled by default** (reduces console noise)
- When enabled, connects to WebSocket server for external story injection
- When disabled, stops all connection attempts immediately (including retry loops)
- Setting persists across app restarts (stored in userData folder)

**Files Created/Modified**:
| File | Changes |
|------|---------|
| `apps/builder-desktop/src/main/index.ts` | App settings management, menu checkbox |
| `apps/builder-desktop/src/preload/index.ts` | Settings IPC methods |
| `packages/builder/src/App.tsx` | MCP toggle with `mcpShouldBeEnabled` flag, Electron API types |

### Ren'Py Theme Import (Initial Implementation)

**Status**: Initial implementation - classified as experimental.

**Features**:
- Parse gui.rpy variables for colors, fonts, textbox positioning
- Extract textbox.png and button graphics from theme packages
- Apply textbox frame background in story preview
- Map Ren'Py colors to ASAPS theme system
- Support for choice button styling from themes

**Known Limitations**:
- Font loading may not work consistently across all themes
- Button graphics positioning not fully implemented
- Some Ren'Py variables not yet mapped

**Files Modified**:
| File | Changes |
|------|---------|
| `packages/core/src/renpy/RenpyGuiParser.ts` | Parse gui.rpy variables |
| `packages/core/src/renpy/RenpyAssetExtractor.ts` | Extract theme assets |
| `packages/builder/src/hooks/useThemes.ts` | Theme asset loading |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Textbox frame rendering |
| `packages/builder/src/themes/migration/GlobalSettingsAdapter.ts` | Color mapping fixes |

### Other Changes

- **Example stories removed from git**: Will be re-added when project storage integration is ready
- **test-data/ added to gitignore**: Test files no longer tracked

---

## 2026-01-13: Twine Import Fixes & Visual Enhancements (v0.9.6)

### Overview

This release fixes critical Twine import issues with boolean variable handling and adds visual enhancements including beat notes, timer progress bars, and improved test coverage.

### Bug Fixes

#### 1. Twine Import Boolean Handling

**Issue**: Condition checks failed because boolean values were stored as actual booleans but compared against strings.

**Root Cause**:
- `parseValue()` returned actual boolean `true`/`false`
- `parseConditionValue()` returned string `"true"`/`"false"`
- Comparison `true == "true"` returned `false`

**Fix**: Updated both HarloweParser and SugarCubeParser to return consistent types:
- Boolean literals → actual booleans
- Numeric literals → actual numbers
- Quoted strings → strings (quotes stripped)

**Files Modified**:
- `packages/core/src/twine/HarloweParser.ts` - parseConditionValue returns proper types
- `packages/core/src/twine/SugarCubeParser.ts` - Added parseConditionValue method

#### 2. Empty Parameters in Additional Beats

**Issue**: ConditionBeats created from additional beats (via `createAdditionalBeat`) had empty parameters.

**Fix**: Properly populate parameters in TwineImporter.createAdditionalBeat:
- conditionType, variableName, operator, value, trueTarget, falseTarget

**Files Modified**:
- `packages/core/src/twine/TwineImporter.ts`

#### 3. ConditionBeat Cleanup

**Issue**: Deprecated `left` and `right` properties caused confusion; canonical names are `variableName` and `value`.

**Fix**: Removed `left` and `right` properties entirely. Updated:
- Constructor initialization
- buildCondition method
- getParameters/updateParameters
- performAction logging

**Files Modified**:
- `packages/core/src/beats/ConditionBeat.ts`

#### 4. Boolean False Display in Inspector

**Issue**: SetVariable beat showed empty Value field when value was boolean `false`.

**Root Cause**: `value={value || ''}` treats `false` as falsy.

**Fix**: Use `value !== undefined && value !== null ? String(value) : ''`

**Files Modified**:
- `packages/builder/src/components/SchemaFormGenerator.tsx`

### New Features

#### 1. Beat Notes Field

Added optional notes field to beats for author annotations (not shown to players).

**Features**:
- Collapsible section at bottom of Inspector
- Multi-line textarea
- Persists with beat and exports to ASML

**Files Modified**:
- `packages/core/src/types/index.ts` - Added `notes?: string` to BeatConfig
- `packages/core/src/beats/Beat.ts` - Added notes property
- `packages/core/src/xml/ASMLGenerator.ts` - Serialize notes
- `packages/core/src/xml/ASMLParser.ts` - Parse notes
- `packages/builder/src/components/Inspector.tsx` - Notes UI section

#### 2. Timer Progress Bar (Preview)

Added visual progress bar for default target timers during story preview.

**Features**:
- Horizontal bar at top of stage
- Shows remaining time for beats with defaultTargetDelay
- Color gradient (green → yellow → red)

**Files Created**:
- `packages/renderer/src/components/TimerProgressBar.tsx`

**Files Modified**:
- `packages/renderer/src/renderers/ReactRenderer.tsx` - Timer state tracking
- `packages/renderer/src/components/PositionedBeatView.tsx` - Timer bar rendering

#### 3. Character Inventory Frame (Started)

Started implementation of character inventory display component.

**Files Created**:
- `packages/renderer/src/components/CharacterInventoryFrame.tsx`

### Test Coverage

Added comprehensive test suites:

| Test File | Coverage |
|-----------|----------|
| `ConditionBeat.test.ts` | All condition types, parameter handling |
| `SetVariableBeat.test.ts` | Counter/variable operations |
| `SetTimerBeat.test.ts` | Timer creation/modification |
| `AddRemoveInventoryBeat.test.ts` | Inventory operations |
| `MovementChoiceBeat.test.ts` | Location-based choices |
| `RandomTargetBeat.test.ts` | Random branching |
| `StoryContext.test.ts` | Game state management |
| `BackwardAnalyzer.test.ts` | Path analysis |

Updated existing tests for new type handling:
- `HarloweParser.test.ts`
- `SugarCubeParser.test.ts`
- `TwineImporter.harlowe.test.ts`

---

## 2026-01-12: Twine Import & AI Documentation (v0.9.5)

### Overview

This release introduces comprehensive Twine story import support (SugarCube and Harlowe formats), along with improved AI documentation for the MCP story generation system.

### New Features

#### 1. Twine Import (SugarCube & Harlowe)

**Purpose**: Import interactive fiction stories created in Twine into ASAPS for enhanced multimedia presentation.

**Access**: Import menu > Import Twine Story

**Supported Formats**:
- **SugarCube 2.x**: Full support for `<<set>>`, `<<if>>`, `<<link>>`, `<<goto>>` macros
- **Harlowe 3.x**: Full support for `(set:)`, `(if:)`, `(link-goto:)`, arrow links (`->`, `<-`)

**Features**:
- **Automatic Beat Classification**: Passages analyzed and classified as appropriate ASAPS beat types:
  - Terminal passages → IntroText
  - Multiple choices at end → DialogTree
  - Inline links → HyperText
  - Conditional branching → ConditionBeat
  - Set-only passages → SetVariable
  - Endings tagged with "ending" → EndScreen
- **Variable Conversion**: Twine `$var` syntax automatically converted to ASAPS `$var$` format
- **Conditional Support**: `<<if>>` / `(if:)` blocks converted to ConditionBeat logic
- **Link Position Detection**: Distinguishes inline links from end-of-passage choices

**Technical Details**:
- Format-specific parsers: `SugarCubeParser`, `HarloweParser`
- `PassageAnalyzer` for beat type classification
- `TwineImporter` orchestrates the import process
- Uses DOMParser for HTML parsing

**Files Created**:
| File | Purpose |
|------|---------|
| `packages/core/src/twine/TwineParser.ts` | Base Twine HTML parser |
| `packages/core/src/twine/SugarCubeParser.ts` | SugarCube macro parsing |
| `packages/core/src/twine/HarloweParser.ts` | Harlowe macro parsing |
| `packages/core/src/twine/PassageAnalyzer.ts` | Beat type classification |
| `packages/core/src/twine/TwineImporter.ts` | Story import orchestration |
| `packages/builder/src/components/ImportTwineDialog.tsx` | Import UI dialog |

**Files Modified**:
| File | Changes |
|------|---------|
| `packages/builder/src/App.tsx` | Added Twine import dialog |
| `packages/builder/src/contexts/PersistenceContext.tsx` | Import handler with proper project naming |

#### 2. AI Documentation Improvements

**Purpose**: Enhance the MCP server documentation to help AI generate better stories.

**Changes**:
- Added animation system conceptual overview (informational)
- Enhanced beat type descriptions with all parameters
- Added DialogTree presentation modes (positioned, chat-scroll, chat-bubble)
- Added visited beat tracking documentation
- Added response delay and avatar options for chat modes
- Removed project settings and theme configuration noise
- Simplified content guidelines for theme-agnostic writing

**Files Modified**:
- `mcp-server/src/utils/aiHelper.ts`

### Bug Fixes

1. **Twine Import Project Naming**: Fixed project naming to use filename instead of story title for IndexedDB key uniqueness
2. **Auto-save During Preview**: Paused auto-save during preview to prevent interruptions

### Testing

Added comprehensive Twine parser test suite:
- `TwineParser.test.ts` - Base HTML parsing
- `SugarCubeParser.test.ts` - SugarCube macro tests
- `HarloweParser.test.ts` - Harlowe syntax tests
- `PassageAnalyzer.test.ts` - Beat type classification tests
- `TwineImporter.harlowe.test.ts` - Harlowe import integration

---

## 2026-01-10: DialogTree Merge Tool and Search & Replace (v0.9.4)

### Overview

This release introduces powerful authoring tools: a DialogTree Merge Tool with auto-detection of mergeable beats, and a project-wide Search & Replace panel. Also includes chat dialog mode fixes and various UI improvements.

### New Features

#### 1. DialogTree Merge Tool

**Purpose**: Consolidate multiple DialogTree beats into a single nested conversation structure, reducing flowchart complexity.

**Access**: Tools menu > Merge DialogTrees

**Features**:
- **Merge Candidate Auto-Detection**: Automatically identifies and suggests groups of DialogTree beats that can be safely merged
  - Rules: DialogTree→DialogTree connections where subsequent beats have ≤1 incoming link
  - Suggested merges shown in purple-highlighted section
- **Manual Selection**: Check beats to select, drag to reorder
- **Live Preview**: Shows merge result structure before committing
- **Visual Editor Integration**: Merged beats properly update in Visual Editor with correct phases

**Technical Details**:
- Added `_version` field to Beat class for React change detection
- Fixed Visual Editor not updating phases after merge (useMemo with beatVersion dependency)
- Fixed button overlap after merge by clearing stored locations for auto-layout
- Fixed all phases appearing selected by generating unique IDs for nested nodes
- Improved button autosizing with better padding calculations

**Files Created**:
- `packages/builder/src/components/tools/MergeDialogTreesModal.tsx` - Complete modal UI with merge candidate detection

**Files Modified**:
| File | Changes |
|------|---------|
| `packages/builder/src/components/Header.tsx` | Added Tools dropdown menu |
| `packages/builder/src/App.tsx` | Modal integration, force re-render on beat version change |
| `packages/builder/src/hooks/useStoryBuilder.ts` | Merge function, clearing locations, unique IDs |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | useMemo with beatVersion dependency |
| `packages/builder/src/components/WorkspaceView.tsx` | Key with version for re-mount |
| `packages/builder/src/components/Inspector.tsx` | _version dependency for updates |
| `packages/core/src/beats/Beat.ts` | Added `_version` field |
| `packages/core/src/beats/DialogTreeBeat.ts` | Increment `_version` in updateParameters |
| `packages/builder/src/utils/textSizeCalculator.ts` | Improved button dimensions |

#### 2. Project-wide Search & Replace

**Purpose**: Find and replace text across all story content including beats, characters, assets, and metadata.

**Access**: Search icon in header or Ctrl/Cmd+F

**Features**:
- **Search Options**: Case-sensitive, whole word, regex support
- **Scope Toggles**: Search in beats, characters, assets, metadata
- **Results List**: Shows matches with context highlighting, click to navigate
- **Replace**: Replace selected matches or replace all at once

**Files Created**:
- `packages/builder/src/services/SearchService.ts` - Search logic
- `packages/builder/src/components/search/SearchPanel.tsx` - UI panel

#### 3. Chat Dialog Mode Improvements

**Bug Fixed**: Subsequent NPC messages not appearing after player choices in chat-scroll/chat-bubble presentation modes.

**Root Cause**: React wasn't detecting array changes because the same reference was passed.

**Fix**: Spread array to create new reference `[...this.chatMessages]` in ReactRenderer.tsx when emitting chat updates.

**Files Modified**:
- `packages/core/src/beats/DialogTreeBeat.ts` - Added presentationMode property
- `packages/renderer/src/renderers/ReactRenderer.tsx` - Fixed message array spreading
- `packages/renderer/src/components/ChatDialogView.tsx` - Chat-style component

### Bug Fixes

1. **Inspector not updating after merge**: Added `_version` tracking to Beat class
2. **Visual Editor phases not selectable after merge**: Made `dialogTreeParams` reactive with useMemo
3. **Duplicate/overlapping elements after merge**: Clear stored button locations, generate unique nested node IDs
4. **Button autosizing cramped**: Increased padding values (horizontal: 32px, vertical: 24px)

### Files Summary

| Category | Files |
|----------|-------|
| New Components | `MergeDialogTreesModal.tsx`, `SearchPanel.tsx`, `SearchService.ts` |
| Core Changes | `Beat.ts`, `DialogTreeBeat.ts` |
| Builder Changes | `App.tsx`, `Header.tsx`, `Inspector.tsx`, `VisualWorkspace.tsx`, `WorkspaceView.tsx`, `useStoryBuilder.ts` |
| Utilities | `textSizeCalculator.ts` |

---

## 2026-01-09: Bug Fixes and Stability Improvements (v0.9.3)

### Overview

This release focuses on fixing several long-standing bugs and improving code organization.

### Bug Fixes

#### 1. Cluster Naming Modal in Electron
**Problem**: The cluster naming modal used `window.prompt()` which doesn't work in Electron.

**Solution**: Created a new `InputModal.tsx` component that provides a custom modal dialog for text input. This works consistently in both browser and Electron environments.

**Files Changed**:
- `packages/builder/src/components/InputModal.tsx` (new)
- `packages/builder/src/App.tsx` (use InputModal for cluster creation)

#### 2. MovementChoice/PickProp Targets Not Being Added
**Problem**: When creating MovementChoice or PickProp beats and adding choices without immediately setting targets, the targets would never be properly added to the beat's connections.

**Solution**: Modified `updateParameters()` in both beat types to rebuild connections immediately when choices are updated. This ensures that targets added later are properly synchronized with the beat's connection list.

**Files Changed**:
- `packages/core/src/beats/MovementChoiceBeat.ts`
- `packages/core/src/beats/PickPropBeat.ts`

#### 3. Background Persistence Between Beats
**Problem**: If a beat didn't have a background defined but a previous beat did, the old background would persist.

**Solution**: Centralized background handling in the base `Beat.execute()` method. Now `backgroundAssetId` is always set (or cleared) before each beat's `performAction()` runs, eliminating the need for individual beats to manage this.

**Files Changed**:
- `packages/core/src/beats/Beat.ts` (centralized handling)
- All visible beat types (removed redundant background code)

#### 4. Chat Dialog Mode Not Showing NPC Text After First
**Problem**: In chat-scroll and chat-bubble presentation modes for DialogTree, NPC messages after the first weren't displayed properly.

**Solution**: Added `clearChatHistory()` method to `IRenderer` interface and call it at the start of each new DialogTreeBeat when in chat mode. This prevents messages from previous dialog trees from persisting.

**Files Changed**:
- `packages/core/src/types/index.ts` (added clearChatHistory to IRenderer)
- `packages/core/src/beats/DialogTreeBeat.ts` (call clearChatHistory on start)

### Architecture Improvements

**Centralized Background Handling**: Background state is now managed in the base `Beat` class rather than in each individual beat type. This reduces code duplication and ensures consistent behavior across all beat types.

---

## 2026-01-09: Animation System Improvements

### Overview

Major improvements to the path animation system including onClick triggers, sprite animation control, and animation editor enhancements.

### onClick Animation Trigger

**New Feature**: Animations can now be triggered by clicking elements instead of auto-playing on load.

**Trigger Element Selection**: When trigger is set to "On Click", a new dropdown appears letting you select which element's click starts the animation. This allows clicking a "door" hotspot to animate an "avatar" to walk there.

**Core Changes**:
- Added `triggerElementId` field to AnimationPath type
- Animations with `trigger: 'onClick'` no longer auto-start
- Button/hotspot clicks now await animation completion before transitioning to next beat

### Sprite Animation Control

**Static by Default**: Sprite characters now show a static first frame instead of cycling through animations by default.

**Animation Only During Movement**: Sprite animations only play when:
1. A path animation with `onLoad` trigger starts
2. An onClick trigger fires and starts a path animation
3. The waypoint specifies a `spriteAnimation` name

**Auto-Selection**: If no specific sprite animation is set in the waypoint but the character is animating, it auto-selects a default (walk/walking/run/idle or first available).

**Beat Change Reset**: When transitioning to a new beat:
- All animated positions reset (scale back to 100%, etc.)
- Sprite animations stop and return to static state

### Animation Editor Improvements

**Scale/Rotation/Opacity in Preview**: The animation editor preview now shows scale, rotation, and opacity changes during playback and timeline scrubbing.

**Trigger Element Dropdown**: When trigger is "On Click", shows a dropdown to select which element triggers the animation.

### Sprite Sheet Image Dimensions

**Fixed Blinking Issue**: Added `imageWidth` and `imageHeight` to sprite sheet configuration. This fixes incorrect frame position calculation for higher frame indices (e.g., "run" animation using frames 5-12).

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/types/animation.ts` | Added `triggerElementId` field |
| `packages/builder/src/types/character.ts` | Added `imageWidth`, `imageHeight` to spriteSheet |
| `packages/builder/src/components/animation/AnimationPathEditor.tsx` | Scale/rotation/opacity interpolation, trigger element UI |
| `packages/builder/src/components/animation/PathCanvas.tsx` | Scale/rotation/opacity in preview position |
| `packages/builder/src/components/characters/SpriteSheetEditor.tsx` | Emit imageWidth/imageHeight on change |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Static sprite by default, pass imageWidth |
| `packages/renderer/src/components/PositionedBeatView.tsx` | onClick trigger handling, sprite animation control, beat change reset |

### Behavior Summary

| State | Sprite Animation |
|-------|------------------|
| Default (no animation) | Static first frame |
| Pending onClick animation | Static (suppressed) |
| Animation playing (isAnimating=true) | Cycles through frames |
| Animation completed | Static |
| Beat changed | Reset to static |

---

## 2026-01-07: Character Meter Frame HUD (v0.9.2)

### Overview

Added a configurable meter frame HUD overlay for displaying character counters (health, energy, etc.) during story playback. The frame can be docked to the character or fixed to a screen corner.

### Features

#### Meter Frame Component
- New `CharacterMeterFrame` component in renderer package
- Displays all visible counters as horizontal bars
- Shows counter labels, current values, and fill percentage
- Configurable bar colors based on counter settings

#### Docking Options
- **Character Docking**: 8 anchor positions around the character (top, bottom, left, right, corners)
- **Screen Corner Docking**: Fixed to any of the 4 screen corners (top-left, top-right, bottom-left, bottom-right)
- Offset X/Y controls for fine positioning

#### Style Configuration
- Background color and opacity
- Border color, width, and radius
- Padding
- Meter width, height, and spacing
- Show/hide counter labels

#### Simplified Counter Display
When meter frame is enabled on a character, all counters with `visible: true` automatically appear in the frame. No need for extra per-counter flags.

### Character Manager Image Fix

Fixed character images not showing in the Character Manager grid/list view. The issue was that `CharacterCard` used stale blob URLs from `character.visual.defaultImage` instead of resolving via `defaultAssetId` from the assets array.

### Files Created

| File | Purpose |
|------|---------|
| `packages/renderer/src/components/CharacterMeterFrame.tsx` | Meter frame component with positioning logic |

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/types/character.ts` | Added `MeterFrameDockMode`, `MeterFrameScreenPosition`, `MeterFrameConfig` types |
| `packages/builder/src/components/characters/CharacterEditor.tsx` | Meter frame configuration UI in Counters tab |
| `packages/builder/src/components/characters/CharacterCard.tsx` | Added `imageUrl` prop for resolved image URLs |
| `packages/builder/src/components/characters/CharacterManager.tsx` | Added `resolveImageUrl` helper, pass resolved URLs to CharacterCard |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Meter frame resolver setup |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Integration with character rendering, container dimensions |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | `setCharacterMeterFrameResolver` method |
| `packages/renderer/src/components/index.ts` | Export new types |

---

## 2026-01-05: Path Animation System (v0.9.1)

### Overview

Implemented a complete path animation system for moving elements along curves during story playback, with a visual animation editor in the builder.

### Animation Editor

#### PathCanvas Component
- Shows all stage elements for reference
- Highlights animation target in orange
- Renders actual element content (images, text) not just outlines
- Bezier curve editing with draggable control points

#### WaypointList Component
- Add/remove waypoints
- Duration and easing per segment
- Transform controls: scale, rotation, opacity
- Flip H/V checkboxes for sprite direction

### Animation Playback

#### Core Animation Support
- `animations` property added to Beat class
- Animations serialized with beat parameters
- Triggers: onLoad/autoPlay, onClick

#### AnimationEngine
- RequestAnimationFrame-based playback loop
- Play, pause, stop, seek controls
- Callback system for position updates

#### PathInterpolator
- Bezier curve interpolation
- Transform interpolation (scale, rotation, opacity)
- FlipX/FlipY support
- Default values for missing properties

### Transform Properties

```typescript
interface AnimationWaypoint {
  x: number;
  y: number;
  duration: number;
  easing?: string;
  scale?: number;
  rotation?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
}
```

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/beats/Beat.ts` | Add animations property, serialization |
| `packages/core/src/types/animation.ts` | Add flipX/flipY properties |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Animation playback, position rendering |
| `packages/renderer/src/animation/AnimationEngine.ts` | Playback loop |
| `packages/renderer/src/animation/PathInterpolator.ts` | Curve and transform interpolation |
| `packages/builder/src/components/animation/PathCanvas.tsx` | Visual editor canvas |
| `packages/builder/src/components/animation/WaypointList.tsx` | Waypoint editing UI |
| `packages/builder/src/components/visual/AnimationPanel.tsx` | Animation panel integration |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Animation sync to beat |

---

## 2026-01-06: Visual Editor Positioning Fix for Imported ASML Stories

### Overview

Fixed positioning discrepancy between the Visual Editor and Preview for imported ASML stories. Dialog boxes and choice buttons now display at their correct imported positions instead of auto-layout positions.

### Problem

When opening an imported ASML story, the Visual Editor displayed dialog elements (NPC text boxes, choice buttons) at auto-calculated positions instead of using the stored coordinates from the ASML import. The Preview correctly showed elements at their imported positions, causing a confusing mismatch between the two views.

### Root Cause

The `generatePhaseElements()` function in VisualWorkspace.tsx only looked for stored locations with `kind='dialog'`, but ASML imports store dialog boxes with `kind='text'` (legacy format).

```typescript
// Before: Only matched modern 'dialog' kind
if (loc.kind === 'dialog') { ... }

// After: Accepts both modern and legacy kinds
const isDialogLike = (loc.kind === 'dialog' || loc.kind === 'text') &&
  !loc.name?.match(/^(choice|button)/i);
```

### Solution

Updated position lookup in `generatePhaseElements()` to:
1. Accept both `kind='dialog'` (modern) and `kind='text'` (legacy ASML) for dialog boxes
2. Exclude button elements by checking the name pattern
3. Pass `beat.locations` to the function for stored position lookup

**Position priority is now:**
1. `phaseOverrides` - User-edited positions (highest priority)
2. `storedLocations` - Imported ASML positions
3. Auto-layout - Fallback for new beats

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Updated `generatePhaseElements()` to accept legacy 'text' kind and pass stored locations |

### Testing

Verified with imported Red Riding Hood ASML story (Beat 60):
- Visual Editor now shows dialog and buttons at same positions as Preview
- Characters and props retain their imported positions
- User overrides still take precedence over imported positions

---

## 2026-01-05: Save Eligibility and Flowchart Initial Render Fixes

### Overview

Fixed two bugs: projects with modified default beats being incorrectly auto-discarded, and flowchart not showing all beats immediately when opening a project.

### Save Eligibility Fix (isDefaultEmptyProject)

**Problem**: The `isDefaultEmptyProject` function only checked if a project had exactly 3 beats with default IDs (beat_0, beat_1, beat_2) of types (titleScreen, introText, endScreen). This meant projects where users modified the default beats' content were still considered "empty" and auto-discarded without prompting.

**Solution** (`packages/builder/src/App.tsx`):
- Now checks actual content against defaults (title, text, buttonText, etc.)
- Verifies no visual elements (locations) have been added
- Checks no animations have been created
- Validates connection count matches default (2 connections)

```typescript
// Only discard if content EXACTLY matches defaults
const defaultContent = {
  'beat_0': { title: 'My Interactive Story', author: 'Story Author', buttonText: 'Start' },
  'beat_1': { text: 'Welcome to your interactive story...', buttonText: 'Continue' },
  'beat_2': { message: 'The End', showRestart: true, showCredits: false }
};

// Check each property, return false if ANY differ
for (const beat of state.beats) {
  const params = beat.getParameters?.() || {};
  // ... content comparison
  if (beat.locations?.size > 0) return false;  // Has visual elements
  if (beat.animations?.length > 0) return false;  // Has animations
}
```

### Flowchart Initial Render Fix

**Problem**: When opening a project, only some beats would appear in the flowchart initially (e.g., 2 of 4 beats visible). After clicking around, the flowchart would eventually show all beats.

**Solution**:

1. **Key prop on WorkspaceView** (`packages/builder/src/App.tsx`):
   - Forces React to remount the entire workspace when project changes
   - Ensures ReactFlow starts fresh with new project data
   ```typescript
   <WorkspaceView key={currentProject?.id || 'untitled'} ... />
   ```

2. **FitView trigger on beat count change** (`packages/builder/src/components/graph/GraphEditor.tsx`):
   - Tracks previous beat count with useRef
   - Triggers `fitView()` when beat count changes (project load)
   - Small delay allows ReactFlow to process node updates first
   ```typescript
   const prevBeatsLengthRef = useRef(beats.length);

   useEffect(() => {
     // ... setNodes ...
     if (beatsCountChanged && reactFlowInstance && beats.length > 0) {
       setTimeout(() => {
         reactFlowInstance.fitView({ padding: 0.2, maxZoom: 1, duration: 200 });
       }, 100);
     }
     prevBeatsLengthRef.current = beats.length;
   }, [nodes, setNodes, beats.length, clusters.length, reactFlowInstance]);
   ```

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/App.tsx` | Content-aware isDefaultEmptyProject, key prop on WorkspaceView |
| `packages/builder/src/components/graph/GraphEditor.tsx` | FitView trigger on beat count change |

---

## 2026-01-05: Animation Editor Visual Elements and Transform Controls

### Overview

Enhanced the animation editor to show actual element content (images, text) and added comprehensive transform controls for waypoints.

### Actual Element Display in Animation Editor

**PathCanvas now renders real elements** (`packages/builder/src/components/animation/PathCanvas.tsx`):
- Elements displayed as HTML overlay (not canvas-drawn outlines)
- Image elements (character, prop) show actual images with `object-contain`
- Text elements (textBox, button) show styled text content
- Animation target highlighted with orange ring
- Background image rendered as HTML img for better quality

```typescript
// HTML overlay approach allows:
// - Actual image rendering without async canvas loading issues
// - Proper text styling and truncation
// - Ring highlights for selection states
```

### Waypoint Transform Controls

**Added full transform editing** (`packages/builder/src/components/animation/WaypointList.tsx`):
- **Scale**: Number input (0.1 to 5, step 0.1)
- **Rotation**: Number input (-360 to 360 degrees, step 5)
- **Opacity**: Slider with percentage display (0-100%)
- **Flip H**: Checkbox for horizontal flip
- **Flip V**: Checkbox for vertical flip

### Transform Interpolation Fixes

**Bug**: Scale/opacity only interpolated when BOTH waypoints had values defined.

**Fix** (`packages/renderer/src/animation/PathInterpolator.ts`):
```typescript
// Now uses defaults when property not specified:
const startScale = start.scale ?? 1;
const endScale = end.scale ?? 1;
const startOpacity = start.opacity ?? 1;
const endOpacity = end.opacity ?? 1;

// Interpolates if EITHER waypoint has value (not just both)
if (start.scale !== undefined || end.scale !== undefined) {
  result.scale = lerp(easedProgress, startScale, endScale);
}
```

**Button opacity fix** (`packages/renderer/src/components/PositionedBeatView.tsx`):
- Button fade-in wrapper was overwriting animated opacity
- Now preserves animated opacity: `buttonOpacity = shouldShowButtons ? (effectiveOpacity ?? 1) : 0`

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/animation/PathCanvas.tsx` | HTML overlay for actual element rendering |
| `packages/builder/src/components/animation/AnimationPathEditor.tsx` | Pass text content to PathCanvas |
| `packages/builder/src/components/animation/WaypointList.tsx` | Scale, rotation, opacity, flip controls |
| `packages/renderer/src/animation/PathInterpolator.ts` | Default values for interpolation |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Preserve animated opacity for buttons |

---

## 2026-01-05: Path Animation Playback and Editor Improvements

### Overview

Implemented full path animation playback in the story preview and improved the animation editor UX with better visibility and smarter defaults.

### Path Animation Playback

Animations defined in the visual editor now play correctly during story preview:

**Core Animation Support** (`packages/core/src/beats/Beat.ts`):
- Added `animations` property to Beat class
- Animations are passed to renderer via `setState('animations', ...)`
- Serialization includes animations in parameters for persistence

**Renderer Integration** (`packages/renderer/src/components/PositionedBeatView.tsx`):
- Track animated positions via `animatedPositions` state
- AnimationManager plays animations on beat load (trigger: onLoad/autoPlay)
- Apply animated positions (x, y, scale, rotation, opacity, flipX, flipY) to elements
- Support for onClick trigger animations

**Animation Engine** (`packages/renderer/src/animation/AnimationEngine.ts`):
- RequestAnimationFrame-based playback loop
- Support for play, pause, stop, seek controls
- Callback system for position updates and completion

### Animation Types Extended

Added flipX/flipY transform properties for sprite direction changes:

```typescript
interface AnimationWaypoint {
  x: number;
  y: number;
  duration: number;
  easing?: string;
  scale?: number;
  rotation?: number;
  opacity?: number;
  flipX?: boolean;  // NEW: Flip horizontally
  flipY?: boolean;  // NEW: Flip vertically
}
```

### Animation Editor Improvements

**Stage Elements Display** (`packages/builder/src/components/animation/PathCanvas.tsx`):
- Show all stage elements in the animation canvas for reference
- Highlight the animation target element in orange
- Display element labels and type indicators

**Better Bezier Handles**:
- Increased control point size (6-7px instead of 4px)
- Orange color when selected for better visibility
- White border and inner highlight for contrast
- Thicker handle lines (1.5-2px)

**Smart First Waypoint** (`packages/builder/src/components/animation/WaypointList.tsx`):
- First waypoint now uses element's actual position from visual editor
- No longer defaults to hardcoded (100, 100)

**Element ID Fix** (`packages/builder/src/components/visual/AnimationPanel.tsx`):
- Use `element.name` as animation elementId (matches renderer lookup)
- Previously used generated element IDs which didn't match

### Animation Data Sync Fix

**Problem**: Editing an animation and clicking "Save" in the animation editor only updated local React state. Preview loaded from `beat.animations` which still had old data.

**Solution** (`packages/builder/src/components/visual/VisualWorkspace.tsx`):
```typescript
onAnimationsChange={(newAnimations) => {
  setAnimations(newAnimations);
  setHasChanges(true);
  // CRITICAL: Sync to beat.animations immediately
  if (beat) {
    beat.animations = newAnimations;
  }
}}
```

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/beats/Beat.ts` | Add animations property, serialization, renderer state |
| `packages/core/src/types/animation.ts` | Add flipX/flipY transform properties |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Animation playback, position rendering |
| `packages/renderer/src/animation/AnimationEngine.ts` | Debug logging |
| `packages/renderer/src/animation/PathInterpolator.ts` | flipX/flipY interpolation |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Pass animations to PositionedBeatView |
| `packages/builder/src/components/animation/PathCanvas.tsx` | Stage elements, bezier handles |
| `packages/builder/src/components/animation/AnimationPathEditor.tsx` | Pass element position |
| `packages/builder/src/components/animation/WaypointList.tsx` | Smart first waypoint position |
| `packages/builder/src/components/visual/AnimationPanel.tsx` | Use element.name as ID |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Immediate animation sync |

---

## 2026-01-04: Preview Controls and Counter Level Meters

### Overview

Added several quality-of-life improvements to the preview modal and counter system for faster testing and better visualization.

### Text Animation Controls

**Visual Editor**: Disabled text animations (typewriter/fade effects) in the visual editor - they now only appear in preview mode. This makes editing faster without waiting for animations.

**Preview Modal**: Added a toggle button to enable/disable text animations during preview. When disabled (shown as lightning bolt icon), text appears instantly, speeding up story testing.

```typescript
// Visual editor forces animation to 'none'
textEffects: {
  animation: 'none' as const,
  typewriterSpeed: baseTheme.textEffects?.typewriterSpeed ?? 30,
  fadeInDuration: baseTheme.textEffects?.fadeInDuration ?? 500,
}
```

### Beat Selection for Preview

Added a dropdown menu to start preview from any beat in the story:
- Click "Start from..." to see all beats
- Select a beat to jump directly to it when starting preview
- Useful for testing specific scenes without playing through the entire story

### Counter Level Meters

Added visual level meter display for counters in the preview debug panel:

**New Settings in Character Counter**:
```typescript
interface CharacterCounter {
  // ... existing fields
  showLevelMeter?: boolean;           // Enable visual meter
  levelMeterOrientation?: 'horizontal' | 'vertical';
}
```

**Character Editor UI**:
- Checkbox to enable level meter display
- Orientation buttons (horizontal/vertical)
- Uses counter's existing color setting

**Preview Display**:
- Horizontal bar showing percentage filled
- Vertical bar option for different layouts
- Smooth transition animation when values change

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/visual/VisualBeatEditor.tsx` | Disable animations in visual editor |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Animation toggle, beat selection dropdown, level meter display |
| `packages/builder/src/components/characters/CharacterEditor.tsx` | Level meter settings UI in counters tab |
| `packages/builder/src/types/character.ts` | Added `showLevelMeter` and `levelMeterOrientation` to CharacterCounter |

---

## 2026-01-04: Visual Editor Layout Matching Preview

### Overview

Synchronized the visual editor layout with the preview renderer for DialogTree beats, ensuring WYSIWYG editing where what you see in the editor matches what plays in the preview.

### Problem

The visual editor used fixed positions (text at y=100, buttons at y=300) while the preview renderer dynamically calculated positions based on content. This caused a mismatch where layouts looked different between editing and playback.

### Solution

Rewrote `generatePhaseElements` in VisualWorkspace.tsx to use the same layout algorithm as the preview:

1. **Dynamic text box sizing** - Calculates dimensions based on actual text content
2. **Proper vertical positioning** - Buttons positioned immediately after text box
3. **Matching gaps** - 20px gap between text and buttons, 16px between buttons (matching preview's flex layout)
4. **Shared auto-layout module** - Created `@asaps/core/layout/autoLayout.ts` for consistent layout logic

```typescript
// Visual editor now calculates text box dimensions dynamically
const textWidth = text.length * defaultFontSize * 0.55;
const maxTextWidth = stageWidth * 0.8;

// Buttons positioned after text with proper gaps
const buttonStartY = startY + textBoxHeight + textButtonGap; // 20px gap
const buttonY = buttonStartY + idx * (buttonHeight + buttonGap); // 16px between buttons
```

### Shared Auto-Layout Module

Created `packages/core/src/layout/autoLayout.ts` with:
- `computeAutoLayout()` - Main layout function for positioning elements
- `applyLayoutWithOverrides()` - Apply layout respecting manual overrides
- `calculateOverrides()` - Detect manually positioned elements
- Text measurement and collision detection utilities

### Phase Tree Navigation

Added phase navigation panel for DialogTree beats:
- Shows all dialog phases in tree structure
- Displays speaker name and truncated text
- Click to switch between phases for editing
- Foundation for per-phase visual customization

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Dynamic layout in `generatePhaseElements`, phase tree navigation |
| `packages/core/src/layout/autoLayout.ts` | **NEW** - Shared auto-layout logic |
| `packages/core/src/layout/index.ts` | Export auto-layout module |
| `packages/core/src/beats/DialogTreeBeat.ts` | Added `PhaseOverride` type for per-phase layouts |
| `packages/renderer/src/components/PositionedBeatView.tsx` | Minor adjustments for consistency |

---

## 2026-01-02: DialogTree Rendering Improvements

### Overview

Improved DialogTree beat rendering with auto-sizing text boxes and smart button layout to prevent content clipping and element overlaps.

### Text Box Auto-Sizing

**Problem**: NPC dialog text was being clipped when content exceeded the fixed text box dimensions.

**Solution**:
- Changed text boxes to use `height: auto` with `minHeight: 60px`
- Text boxes now expand width first (up to 80% of stage) before growing taller
- Added canvas-based text measurement for accurate dimension calculation

```typescript
// Calculate optimal dimensions - prefer wider before taller
function calculateTextBoxDimensions(text, fontSize, fontFamily, locationWidth, maxWidth, padding) {
  const textWidth = measureTextWidth(text, fontSize, fontFamily);
  const singleLineWidth = textWidth + padding * 2;

  if (singleLineWidth <= locationWidth) return { width: locationWidth, height: ... };
  if (singleLineWidth <= maxWidth) return { width: singleLineWidth, height: ... };
  // Multi-line at max width
  return { width: maxWidth, height: lines * lineHeight + padding };
}
```

### Smart Collision Detection

**Problem**: Buttons overlapped with expanded text boxes and with each other.

**Solution**: Added `adjustElementsForCollisions()` function that:
1. Calculates actual text box bounds based on content
2. Adjusts button Y positions to avoid text box collisions (15px gap)
3. Detects button-to-button overlaps and stacks them vertically (20px gap)
4. Normalizes all button widths to the widest button (capped at 60% stage)
5. Aligns all buttons to a common X position (average center)

```typescript
// Buttons are processed top-to-bottom, checking collisions with:
// 1. Text boxes - move below if overlapping
// 2. Previously placed buttons - stack vertically if overlapping
for (const bounds of buttonBounds) {
  const horizontalOverlap = buttonLeft < bounds.right && buttonRight > bounds.left;
  if (horizontalOverlap && newY < bounds.bottom + 20) {
    newY = Math.max(newY, bounds.bottom + 20);
  }
}
```

### Phase Tree Navigation (UI Only)

Added phase tree visualization to Visual Workspace for DialogTree beats:
- Shows nested dialog phases in expandable tree structure
- Displays speaker, truncated text, and choice paths
- Foundation for future phase-by-phase visual editing

### Files Modified

| File | Changes |
|------|---------|
| `packages/renderer/src/components/PositionedBeatView.tsx` | Auto-height text boxes, collision detection, button normalization |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Updated comments for collision detection |
| `packages/builder/src/utils/textSizeCalculator.ts` | Improved padding calculation for dialog dimensions |
| `packages/builder/src/components/visual/VisualWorkspace.tsx` | Phase tree navigation UI for DialogTree beats |

---

## 2025-01-02: Desktop Builder Electron Integration

### Overview

Implemented Electron menu integration and UX improvements for the desktop builder app (`apps/builder-desktop`).

### Electron Menu Handlers

Added IPC handlers for native menu commands:
- **File > Open**: Opens project library modal
- **File > Save**: Saves to current project (or triggers Save As for untitled)
- **File > Save As**: Saves project to internal storage with new name (extracted from file path)
- **File > Export**: Opens export dialog

```typescript
// Save As extracts project name from file path
const unsubscribeSaveAs = window.electronAPI.onProjectSaveAs(async (filePath: string) => {
  const fileName = filePath.split('/').pop() || 'Project';
  const projectName = fileName
    .replace(/\.asaps\.zip$/i, '')
    .replace(/\.zip$/i, '')
    .replace(/\.asaps$/i, '') || 'Project';
  const newProjectId = await saveCurrent(projectName);
});
```

### macOS Window Improvements

**Traffic Light Overlap Fix**:
- Added 64px left padding to first header row for macOS traffic lights
- Only applies when running in Electron on macOS (`-webkit-app-region: drag`)
- Title input field marked as `no-drag` to remain editable

**Window Sizing**:
- Default: 1800x950 pixels
- Minimum: 1550x800 pixels
- Ensures all toolbar buttons are visible without wrapping

### Project Name Display Fixes

**Problem**: Project name was shown 3 times in header (redundant grey box).

**Solution**: Removed the grey project name box from Header.tsx - project name now only shown in the editable title input.

**Import Title Fix**: When loading projects, now uses `project.name` as primary source instead of `story.metadata.title`. Only falls back to story title if project name is missing or "Untitled Project".

### Auto-Save State Fixes

**Problem**: "Cannot auto-save untitled project" error persisted after loading a named project.

**Root Cause**: Auto-save error state wasn't cleared when switching projects.

**Solution**:
1. Added `cancelPending()` call at start of `loadProject()` to clear pending saves
2. Modified `cancelPending()` in useAutoSave to also clear error state and reset to idle
3. Set `isUntitledProject` based on loaded project's actual name

```typescript
// In loadProject()
cancelPending(); // Clear pending saves and errors

// After loading
const isUntitled = result.data.name === 'Untitled Project';
setIsUntitledProject(isUntitled);
```

### Graph Controls Improvements

**Docked Auto-Arrange**: Moved auto-arrange button from floating position to ReactFlow's Controls component:

```typescript
<Controls showInteractive={false}>
  <ControlButton onClick={onAutoLayout} title="Auto-arrange beats">
    <svg>...</svg>
  </ControlButton>
</Controls>
```

**Removed Toggle Interactivity**: Removed the confusing "toggle interactivity" button from Controls while keeping zoom in/out and fit view.

### Files Modified

| File | Changes |
|------|---------|
| `apps/builder-desktop/src/main/index.ts` | Window dimensions (1800x950), minWidth 1550 |
| `packages/builder/src/App.tsx` | Electron menu event listeners for Open/Save/SaveAs/Export |
| `packages/builder/src/components/Header.tsx` | Removed grey project name, added macOS draggable region |
| `packages/builder/src/components/graph/GraphEditor.tsx` | Docked auto-arrange, removed interactivity toggle |
| `packages/builder/src/contexts/PersistenceContext.tsx` | Clear auto-save state on project load |
| `packages/builder/src/hooks/useAutoSave.ts` | cancelPending clears error state |
| `packages/builder/src/utils/projectDeserializer.ts` | Priority: project.name over story.metadata.title |

---

## 2025-01-02: Simplified Desktop Player

### Overview

Simplified the desktop player to be a pure playback engine that auto-discovers stories in its directory, removing the library UI and file dialogs.

### Player Simplification

**Goal**: Transform from library-based UI to simple playback engine.

**Changes**:
- Removed library view, recent stories list, and file dialogs
- Added automatic directory scanning on startup
- Shows selection screen if multiple stories found, auto-plays if single story
- Scans both executable directory and working directory for `.asaps.zip` files

### Window Auto-Resize

**Problem**: Window size was fixed, causing letterboxing (dark bars) around the stage content.

**Solution**: Added Rust command to resize window to match story's stage dimensions:
```rust
#[tauri::command]
fn resize_window(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // Add height for macOS title bar (32px)
        let title_bar_height = 32u32;
        window.set_size(LogicalSize::new(width, height + title_bar_height))
    }
}
```

**Key insight**: The macOS title bar takes 32 pixels from the window height, so the content area is smaller than the window size. Adding 32px to the requested height ensures the content area matches exactly.

### Filesystem Permissions

Added required Tauri filesystem permissions for directory scanning:
- `fs:allow-read-dir` - Read directory contents
- `fs:allow-read-file` - Read story files
- `fs:scope` with `**/*` - Allow access to all paths

### Files Modified

| File | Changes |
|------|---------|
| `apps/player-desktop/src-tauri/src/lib.rs` | Added `resize_window`, `get_working_directory`, `get_executable_directory`, `get_cli_args` commands |
| `apps/player-desktop/src-tauri/capabilities/default.json` | Added filesystem permissions |
| `apps/player-desktop/src/App.tsx` | Simplified to directory scanning with auto-play/selection |
| `apps/player-desktop/src/styles.css` | Updated styles for selection screen |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Added debug logging for scale calculation |

---

## 2025-01-02: Desktop Player Fixes

### Overview

Fixed multiple issues with the Tauri desktop player: viewport scaling, save/load system, menu click interception, and transition flashing.

### Viewport Scaling

**Problem**: The player used hardcoded 1024x768 stage dimensions, causing content to be cut off when the window was smaller than the stage.

**Solution**:
- Added `ScaledStage` component that scales the stage to fit within the viewport while maintaining aspect ratio
- Uses project's configured dimensions from `globalSettings.project.width/height`
- Added `getStageDimensions()` to PlayerEngine and `setStageDimensions()` to BaseRenderer

### Save/Load System Fix

**Problem**: Loading a save always returned to the first beat instead of the saved position.

**Root Cause**: `StoryEngine` updated its own `currentBeatId` during execution but never synced it with `StoryContext`. When `serialize()` was called for saving, it returned the initial beat ID.

**Solution**: Added `context.setCurrentBeatId()` calls in `StoryEngine.start()` to keep the context in sync:
```typescript
// In StoryEngine.start()
this.currentBeatId = startBeatId || this.story.getFirstBeatId();
this.context.setCurrentBeatId(this.currentBeatId); // Keep context in sync

// After each beat execution
if (this.currentBeatId) {
  this.context.setCurrentBeatId(this.currentBeatId);
}
```

### Menu Click Fix

**Problem**: Clicking choices at the top of the window opened the settings menu instead of progressing the story.

**Cause**: PlayerUI menu bar had `pointerEvents: 'auto'` even when invisible (opacity: 0).

**Fix**: Made pointer-events conditional on menu visibility:
```typescript
pointerEvents: isMenuOpen ? 'auto' : 'none'
```

### Transition Flash Fix

**Problem**: Beats briefly expanded and then shrank during transitions.

**Causes**:
1. `ScaledStage` was defined inside render method, causing React to remount it on each beat
2. `useEffect` calculated scale after paint, causing visible flash

**Solution**:
1. Moved `ScaledStage` to module level as a stable component
2. Used `useLayoutEffect` for synchronous scale calculation before paint
3. Hide content with `visibility: 'hidden'` until scale is calculated

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/engine/StoryEngine.ts` | Sync currentBeatId to context during execution |
| `packages/player/src/PlayerEngine.ts` | Add `getStageDimensions()`, project dimensions in GlobalSettings |
| `packages/player/src/PlayerUI.tsx` | Conditional pointer-events for menu bar |
| `packages/renderer/src/renderers/ReactRenderer.tsx` | Module-level ScaledStage with useLayoutEffect |
| `packages/renderer/src/renderers/BaseRenderer.ts` | Add `setStageDimensions()` method |
| `apps/player-desktop/src/App.tsx` | Update renderer dimensions after loading story |

---

## 2025-01-01: Color System Refactor

### Overview

Refactored the color system to properly separate button/choice colors from NPC/narrator text box colors, with automatic text color calculation for readability.

### Color Semantics (Corrected)

| Property | Purpose | Description |
|----------|---------|-------------|
| `pcolor` | Button/choice background | Player-interactive elements (buttons, choices) |
| `palpha` | Button/choice opacity | 0-100 percentage |
| `ptextcolor` | Button/choice text | Auto-calculated from `pcolor` if empty |
| `nonpcolor` | NPC text box background | Narrator/NPC dialog boxes |
| `nonpalpha` | NPC text box opacity | 0-100 percentage |
| `nonptextcolor` | NPC text color | Auto-calculated from `nonpcolor` if empty |
| `textBoxBorder` | Border color | Shared border color for boxes and buttons |

### Changes Made

**Removed `textBoxBg`** - This redundant property caused confusion. NPC text boxes now use `nonpcolor` directly.

**Added text color controls** - `ptextcolor` and `nonptextcolor` allow explicit text colors while auto-calculating readable defaults using luminance-based contrast.

**Auto-calculation function**:
```typescript
function getContrastColor(hexColor: string): string {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
```

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/storage/types.ts` | Updated GlobalSettings colors interface |
| `packages/builder/src/App.tsx` | Default colors, ASML import mapping |
| `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` | Color controls, previews, defaults |
| `packages/builder/src/utils/themeConverter.ts` | Theme conversion with new semantics |
| `packages/builder/src/themes/migration/GlobalSettingsAdapter.ts` | Theme migration updated |
| `packages/player/src/PlayerEngine.ts` | Player theme conversion with legacy fallbacks |

### Legacy Support

Old exports with `textBoxBg` or `buttonBg` are still supported via fallback logic in PlayerEngine:
```typescript
const buttonBg = settings.colors.pcolor || settings.colors.buttonBg || '#ffffff';
const textBoxBg = settings.colors.nonpcolor || settings.colors.textBoxBg || '#cccccc';
```

### GlobalSettings Preview

The Global Settings panel now shows accurate previews:
- **NPC/Narrator section**: Shows `nonpcolor` background with `nonptextcolor` text
- **Player choices section**: Shows `pcolor` background with `ptextcolor` text
- "Auto-calculated from background" hint when text colors are auto-generated

---

## 2024-12-30: Background Sound Asset Pickers

### Features

Added asset picker UI for background sounds in both Inspector and Global Settings, replacing manual text input.

### Inspector (Beat-Level Background Sound)

| Issue | Fix |
|-------|-----|
| Sound not displaying | Now reads `beat.sound.assetId` when loading |
| Sound not saving | Converts `parameters.backgroundSound` to proper `Sound` object |
| Poor UX | Shows filename with inline Change/Remove buttons |

### Global Settings (Project Background Music)

Replaced the text input field with a proper asset picker:
- Dropdown shows all audio assets from Asset Manager
- Displays current selection with music icon and filename
- Stores `backgroundMusicAssetId` for export/import compatibility
- "Select Background Music" button when nothing selected

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/Inspector.tsx` | Fixed sound loading/saving, improved UI |
| `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` | Added audio asset picker dropdown |

---

## 2024-12-30: Project Export/Import Complete Overhaul

### Problem

Project export/import was losing assets and settings:
- Assets not found after import (reference issues)
- Duplicate filenames caused asset overwrites during export
- globalSettings, themeId, and themeOverrides not exported
- Background music and character assets lost
- Asset IDs were unnecessarily regenerated on import

### Solution

Complete rewrite of the ZIP export/import system with proper asset tracking.

### Export Fixes

| Issue | Fix |
|-------|-----|
| Duplicate filenames | Use unique filenames: `{assetId}_{filename}` |
| Missing settings | Export globalSettings, themeId, themeOverrides |
| Orphaned assets | Scan story and settings for all referenced asset IDs |
| Export version | Bumped to 1.1.0 |

### Import Fixes

| Issue | Fix |
|-------|-----|
| ID regeneration | Changed to `generateNewId: false` - keep original IDs |
| Settings lost | Restore globalSettings, themeId, themeOverrides |
| Asset ID matching | Parse asset ID from filename prefix |
| Reference updates | Update references in story, settings, and globalSettings |

### Character Asset Persistence

Characters now save asset IDs alongside URLs for reliable persistence:
- `visual.defaultAssetId` saved with `defaultImage`
- `state.visual.assetId` saved with state image
- StoryPreview resolves via assetId first, falls back to URL

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/utils/projectZipManager.ts` | Major rewrite - unique filenames, settings export/import, asset scanning |
| `packages/builder/src/App.tsx` | Changed to `generateNewId: false` |
| `packages/builder/src/components/characters/CharacterEditor.tsx` | Save assetId with character visuals |
| `packages/builder/src/components/preview/StoryPreview.tsx` | Resolve via assetId, fall back to URL |

### Key Functions Added

```typescript
// Extract asset IDs from GlobalSettings
extractAssetIdsFromGlobalSettings(globalSettings)

// Update asset references in GlobalSettings
updateGlobalSettingsAssetReferences(globalSettings, assetIdMap)

// Extract asset IDs from story (scans all beats, locations, characters)
extractAssetIdsFromStory(story)
```

---

## 2024-12-30: Button Sounds Wait for Completion (Complete Fix)

### Fix

Button sounds now properly wait to finish playing before transitioning to the next beat. The initial implementation only added `playSoundAndWait()` for URL-based sounds but missed blob-based sounds (custom assets from IndexedDB).

### Problem

The existing `playSound()` and `playSoundFromBlob()` methods returned Promises that resolved when playback *started*, not when it *finished*. This caused `onAction()` to fire immediately, cutting off sounds.

### Changes

**AudioManager** (`packages/renderer/src/audio/AudioManager.ts`):
- Added `playSoundFromBlobAndWait()` method for blob-based sounds
- Both wait methods return Promises that resolve in `source.onended` callback

**PositionedBeatView** (`packages/renderer/src/components/PositionedBeatView.tsx`):
- `ButtonElement.handleClick` → uses `playSoundAndWait` / `playSoundFromBlobAndWait`
- `FlexButtonElement.handleClick` → uses `playSoundAndWait` / `playSoundFromBlobAndWait`
- `AssetElement.handleClick` → uses `playSoundAndWait` / `playSoundFromBlobAndWait`

### Technical Details

```typescript
// New method for blob-based sounds
async playSoundFromBlobAndWait(blob: Blob, volume: number = 1.0, cacheKey?: string): Promise<void> {
  // ... setup audio context, decode blob ...
  return new Promise<void>((resolve) => {
    source.onended = () => {
      this.activeSourceNodes.delete(source);
      resolve();  // Resolves when sound finishes
    };
    source.start(0);
  });
}
```

---

## 2024-12-29: Project Library Select All Checkbox

### Feature

Added Select All functionality to the Project Library list view for easier multi-project management.

### Changes

**List View Header** (`ProjectLibrary.tsx`):
- New header row with Select All checkbox
- Shows three states:
  - Empty square when nothing selected
  - Small blue square inside when partially selected
  - Full checkmark when all selected
- Column headers for Project Name, Modified, Created

**Individual Checkboxes**:
- Checkboxes now always visible in list view (not just selection mode)
- Allows quick multi-select without entering selection mode

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/components/ProjectLibrary.tsx` | Added list view header with Select All, always show checkboxes in list view |

---

## 2024-12-29: Legacy ASML Import Fixes

### Problem

Importing old-style ASML files (e.g., TheHeist) had several parsing issues:

1. **globalTimer beats not recognized**: Legacy `globalTimer` beat type wasn't mapped to modern `setTimer`
2. **Timer values in wrong units**: Legacy ASML uses milliseconds, modern uses seconds
3. **setTimer missing timer target**: Legacy format uses `<timedtarget targetBeat="..."/>` instead of timer element attribute
4. **endScreen missing text**: Legacy `<title>` and `<button>` elements weren't parsed

### Solution

**Legacy Type Mapping** (`ASMLParser.ts`):
```typescript
const LEGACY_TYPE_MAP: Record<string, string> = {
  'conversationChoice': 'dialogTree',
  'conditionCheck': 'conditionBeat',
  'setGlobal': 'setVariable',
  'globalTimer': 'setTimer',  // NEW
};
```

**Timer Value Conversion** (ms → seconds):
```typescript
// Heuristic: values > 100 assumed to be milliseconds
const convertedValue = rawTimerValue > 100 ? rawTimerValue / 1000 : rawTimerValue;
```

**Legacy setTimer Parsing**:
```xml
<!-- Legacy format -->
<timer val="14000"/>
<timedtarget targetBeat="39"/>
<target targetBeat="29"/>
```
- `<timer val>` → duration (converted to seconds)
- `<timedtarget>` → timer expiry target (timerTarget parameter)
- `<target>` → immediate next beat connection

**endScreen Parsing**:
```xml
<title>You've won!</title>
<button>Replay?</button>
```
- `<title>` → `parameters.message`
- `<button>` → `parameters.buttonText` → `restartText` in renderer state

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/xml/ASMLParser.ts` | Added globalTimer mapping, timer ms→s conversion, legacy setTimer parsing, endScreen title/button parsing |
| `packages/core/src/beats/EndScreenBeat.ts` | Map buttonText to restartText for renderer state |
| `packages/renderer/src/renderers/EditableReactRenderer.tsx` | Read buttonText from renderer state |

### Benefits
- Old ASML files with globalTimer beats now import correctly
- Timer durations display in seconds (e.g., 14000ms → 14s)
- endScreen shows custom title and button text instead of defaults
- Timer target connections properly established

---

## 2024-12-29: Auto-Arrange Cluster Sizing and Beat Collision Fixes

### Problem

Auto-arrange had two issues causing visual problems:

1. **Clusters cut off beats on the right edge**: The cluster size calculation used span-based approach `(maxX - minX)` which didn't account for the internal layout offset. Internal beat positions start at `(40, 60)` due to padding/header, so clusters needed to encompass from origin `(0,0)` to the maximum beat position.

2. **Unclustered beats overlapping**: The collision detection used `BEAT_HEIGHT = 60` but actual beat nodes are 80px tall (defined as `NODE_HEIGHT = 80` in `ClusterContainerNode.tsx`). This 20px mismatch allowed vertical overlaps.

### Solution

**Cluster Size Fix** (`App.tsx` lines 1324-1331):
```typescript
// Before (bug): span-based calculation
const width = (maxX - minX) + CLUSTER_PADDING * 2;
const height = (maxY - minY) + CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING * 2;

// After (fix): extent-based calculation
const width = Math.max(300, maxX + CLUSTER_PADDING);
const height = Math.max(200, maxY + CLUSTER_PADDING);
```

**Beat Height Fix** (`App.tsx` lines 1197, 1314):
```typescript
// Before (bug)
const BEAT_HEIGHT = 60;

// After (fix) - matches NODE_HEIGHT in ClusterContainerNode.tsx
const BEAT_HEIGHT = 80;
```

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/App.tsx` | Fixed cluster extent calculation, corrected BEAT_HEIGHT constant |

### Benefits
- Clusters now properly contain all internal beats without cutoff
- Unclustered beats no longer overlap after auto-arrange
- Collision detection uses correct beat dimensions

---

## 2024-12-29: Unified Layout Algorithm

### Problem
Import and auto-arrange used different layout algorithms, producing inconsistent beat positions:
- **ASMLParser**: Simple layered BFS that centered each layer independently
- **TreeLayoutAlgorithm**: Sophisticated Reingold-Tilford that centers parents above children

### Solution: Shared Layout in @asaps/core

Moved the TreeLayoutAlgorithm to `@asaps/core/layout` and updated ASMLParser to use it.

### New Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/layout/TreeLayoutAlgorithm.ts` | Core layout algorithm (Reingold-Tilford) |
| `packages/core/src/layout/index.ts` | Layout module exports |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Export layout module |
| `packages/core/src/xml/ASMLParser.ts` | Use `calculateTreeLayout` instead of custom layout |
| `packages/builder/src/utils/TreeLayoutAlgorithm.ts` | Re-export from core, keep beat-specific wrappers |

### Benefits
- Import and auto-arrange now produce identical layouts
- Parents are properly centered above their children
- Subtree widths calculated for optimal spacing
- Single source of truth for layout logic

---

## 2024-12-29: Sound System & ASML Import Improvements

### Sound System Fixes

1. **PickProp Sounds Now Play**
   - Added `sound` prop to `AssetElement` component
   - Props rendered as `AssetElement` (kind="prop") now trigger sounds on click
   - Uses same sound playback logic as `ButtonElement` (preset sounds + custom assets)

2. **Beat Sounds Stop on Exit**
   - Added `stopBeatSound()` call in `Beat.onExit()`
   - Background beat sounds no longer continue playing when transitioning between beats

### ASML Import Styling Improvements

3. **Title/Author Font Sizes**
   - Title elements now use 32px font size (was 16px default)
   - Author elements now use 20px font size (was 16px default)
   - `fitTextToBox()` now accepts location name to determine appropriate starting font

4. **Color Import Fixes**
   - Fixed ASML color mapping: `nonpcolor` → textBox background, `pcolor` → button background
   - Added `filterNullValues()` helper to prevent null values from overwriting defaults
   - Added `convertColor()` to handle ASML `0xRRGGBB` format → CSS `#RRGGBB`

5. **Auto Contrasting Text Color**
   - Added `getContrastingTextColor()` function using luminance calculation
   - Text color automatically adjusts based on background brightness
   - Light backgrounds get dark text (#1a1a1a), dark backgrounds get white text (#ffffff)

### Files Modified

| File | Changes |
|------|---------|
| `packages/renderer/src/components/PositionedBeatView.tsx` | Added sound support to AssetElement |
| `packages/core/src/beats/Beat.ts` | Added stopBeatSound() in onExit() |
| `packages/core/src/xml/ASMLParser.ts` | Title/author font sizes, buttonsound parsing, color conversion |
| `packages/builder/src/App.tsx` | filterNullValues, color mapping fixes, auto text color |

---

## 2024-12-28: Path Analysis Redesign

### Problem

The old path analysis system had exponential complexity:
- **PathAnalyzer**: Enumerated ALL paths through the story (2^n for n conditions)
- **SymbolicPathAnalyzer**: Attempted optimization but still explored both branches for unconstrained variables
- Result: 10,000+ paths for complex stories, browser crashes when highlighting

### Solution: Constraint-Based Analysis

Instead of enumerating paths, we now track **constraint sets** that represent classes of execution:
- Paths with the same constraints and outcome are merged
- ~100 outcomes instead of 10,000+ paths
- Analysis completes in milliseconds instead of seconds

### New Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/analysis/ConstraintSet.ts` | Core types (ConstraintSet, OutcomeGroup, PathStep) and utilities |
| `packages/core/src/analysis/ConstraintPathAnalyzer.ts` | Forward analysis: explore from start, group by outcome |
| `packages/core/src/analysis/BackwardAnalyzer.ts` | Backward analysis: find all paths to a target beat |
| `packages/core/src/analysis/PathQuery.ts` | Query engine: filter outcomes by constraints |

### Files Removed

| File | Reason |
|------|--------|
| `packages/core/src/analysis/PathAnalyzer.ts` | Exponential path enumeration - too slow |
| `packages/core/src/analysis/SymbolicPathAnalyzer.ts` | Still slow, replaced by constraint approach |
| `packages/core/tests/analysis/PathAnalyzer.test.ts` | Tests for removed code |

### UI Improvements

#### Debug Modal (DebugPanel.tsx)
- **Resizable**: Drag the purple corner handle to resize
- Initial size: 650x80vh, min: 400x300

#### Forward Analysis (PathVisualization.tsx)
- Filtered constraints: No more "visited beat X" clutter
- Shows "Required state:" with meaningful constraints only
- Shows "Key decisions:" extracted from the path
- Multiple variations shown with IF/OR labels for clarity

#### Cluster Highlighting (ClusterContainerNode.tsx, GraphEditor.tsx)
- Beats inside clusters now highlight with yellow fill + amber border
- Uses `highlightVersion` in node data to trigger memo() re-renders

### Key Types

```typescript
interface ConstraintSet {
  variables: Map<string, VariableConstraint>;  // e.g., adult: {min: 8}
  inventory: Map<string, { has: Set<string>; notHas: Set<string> }>;
  requiredVisits: Set<string>;
  forbiddenVisits: Set<string>;
}

interface OutcomeGroup {
  endingBeatId: string;
  constraintSets: ConstraintSet[];  // OR - any of these leads here
  representativePath: PathStep[];
}
```

### Usage

```typescript
import {
  ConstraintPathAnalyzer,
  BackwardAnalyzer,
  PathQueryEngine,
} from '@asaps/core';

// Forward analysis
const analyzer = new ConstraintPathAnalyzer(story, {
  maxOutcomes: 500,
  maxDepth: 100,
  maxConstraintSets: 50,
});
const result = analyzer.analyze();

// Backward analysis
const backward = new BackwardAnalyzer(story);
const paths = backward.analyzeBackward(targetBeatId);

// Query
const engine = new PathQueryEngine(result);
const filtered = engine.query({ type: 'hasConstraint', constraint: {...} });
```

### Performance

| Metric | Old | New |
|--------|-----|-----|
| Red Riding Hood paths | ~10,000 | ~72 outcomes |
| Analysis time | seconds | ~8ms |
| Memory | browser crashes | stable |

---

## 2024-12-24: AI Story Generation Improvements

### Overview

Multiple fixes and improvements to AI story generation ensuring reliable story creation and playback.

### Fixes Applied

1. **Beat Type Aliases** (Dec 20)
   - Added `variable` as alias for `setVariable` beat type
   - AI can now use either name in generated stories
   - Schema lookups handle aliases correctly

2. **Story Serialization** (Dec 22)
   - Fixed beat serialization for AI-generated stories
   - Fixed hyperlinks system in hyperText beats
   - Improved error handling and validation

3. **AI Debug Feature** (Dec 22)
   - Added automated story generation validation in Debug panel
   - Shows validation errors in real-time
   - Helps diagnose AI output issues

4. **MovementChoice & PickProp Navigation** (Dec 23)
   - Fixed navigation when AI omits `id` field on choices
   - Auto-generates `id` fields during AI story transformation
   - All choices now navigate correctly in preview

### Files Modified

| File | Changes |
|------|---------|
| `packages/builder/src/utils/SchemaLocationInitializer.ts` | Beat type alias support |
| `packages/builder/src/components/ai/StoryGenerator.tsx` | ID field auto-generation |
| `packages/builder/src/components/debug/AIDebugPanel.tsx` | Validation UI |
| `packages/core/src/beats/*.ts` | Serialization fixes |

### AI Documentation

For comprehensive AI integration documentation, see `dev_docs/AI_INTEGRATION_PROGRESS.md` (local development only - not in git).

Key AI features:
- **MCP Server** (`mcp-server-desktop/`): Claude Desktop integration for story generation
- **AI Service** (`packages/builder/src/services/AIService.ts`): Provider-agnostic AI infrastructure
- **Schema** (`beat-definitions/core-beats.json`): Beat type definitions used by AI

---

## 2024-12-24: Button Fade-in After Text Animation

### Overview

Fixed button fade-in behavior so buttons correctly appear after typewriter text animation completes. Previously, buttons on introText beats would either appear immediately or flash briefly then disappear.

### Issues Fixed

1. **Non-preview mode using stale animation state**
   - `shouldShowButtons` was using `animationsComplete` instead of `effectiveAnimationsComplete`
   - This caused buttons to flash briefly when navigating between beats because the old state persisted for the first render

2. **DialogElement missing animation completion callback**
   - `DialogElement` (used by introText beats with `dialog` kind) didn't have `onAnimationComplete` or `skipAnimation` props
   - Animation completion was never signaled, so buttons stayed hidden indefinitely

### Behavior

- **During animation**: Buttons are hidden (opacity 0, pointer-events: none)
- **After animation**: Buttons fade in over 300ms
- **Click to skip**: Clicking during animation skips to completion and shows buttons immediately

### Files Modified

| File | Changes |
|------|---------|
| `packages/renderer/src/components/PositionedBeatView.tsx` | Added `onAnimationComplete` and `skipAnimation` props to DialogElement; fixed non-preview mode to use `effectiveAnimationsComplete` |

### Technical Details

```typescript
// DialogElement now supports animation callbacks
const DialogElement: React.FC<{
  // ... existing props
  onAnimationComplete?: () => void;  // NEW: Called when animation finishes
  skipAnimation?: boolean;            // NEW: Skip to end immediately
}> = ({ ..., onAnimationComplete, skipAnimation = false }) => {
  // Calls onAnimationComplete when typewriter finishes
  // Respects skipAnimation to show full text immediately
};
```

---

## 2024-12-24: Typewriter Text Animation

### Overview

Implemented a true typewriter animation for text elements where characters appear one by one without any text shifting or repositioning.

### Features Added

#### Typewriter Animation (`packages/renderer/src/components/PositionedBeatView.tsx`)

1. **Character-by-character reveal**
   - Text appears one character at a time (M...y...space...I...)
   - Configurable speed via Global Settings (default: 15 characters/second)
   - Text position stays fixed throughout animation - no shifting or sliding

2. **Implementation approach**
   - Full text is always rendered (maintains layout and centering)
   - Unrevealed characters have `color: transparent` (invisible but occupy space)
   - Characters become visible sequentially via `setInterval`
   - Works with both centered and left-aligned text

3. **Sequential animation for title screens**
   - Title text animates first
   - Author text starts animating after title completes
   - Animation delay calculated based on text length and speed

4. **Applied to both element types**
   - `TextElement`: Title/author text boxes
   - `DialogElement`: Intro text and dialog boxes

#### Settings Integration

- Speed controlled via **Global Settings > Effects > Typewriter Speed**
- Animation type selectable: None, Typewriter, Fade
- Default speed: 15 characters/second

### Technical Details

```typescript
// Typewriter with stable positioning
const revealedLength = displayedText.length;

{animation === 'typewriter' ? (
  <>
    {/* Revealed portion - visible */}
    <span>{content.substring(0, revealedLength)}</span>
    {/* Unrevealed portion - transparent (maintains spacing) */}
    <span style={{ color: 'transparent' }}>{content.substring(revealedLength)}</span>
  </>
) : displayedText}
```

### Files Modified

| File | Changes |
|------|---------|
| `packages/renderer/src/components/PositionedBeatView.tsx` | TextElement and DialogElement typewriter animation |
| `packages/builder/src/App.tsx` | Default typewriter speed (15 chars/sec) |

### Key Design Decision

Previous attempts used `paddingLeft` transitions to center text after animation, but this caused visible movement. The final solution renders the full text with transparent characters, ensuring text position never changes during or after animation.

---

## 2024-12-24: Theme System Implementation

### Overview

Implemented a comprehensive theme system that enables transferable themes between projects, with support for optional asset bundling, built-in presets, and theme inheritance.

### Features Added

#### Core Theme Types (`packages/core/src/types/theme.ts`)
- **ThemeDefinition**: Complete theme interface with colors, fonts, textBox, button, hotspot, and effects
- **ThemeMeta**: Metadata including id, name, version, inheritance (extends), tags, compatibility
- **ThemeAssets**: Optional bundled assets (fonts, UI graphics, sounds, default backgrounds)
- **StoredTheme**: IndexedDB storage format with source tracking (built-in, imported, custom)
- **DEFAULT_THEME_VALUES**: Fallback values for theme properties

#### Built-in Preset Themes (`packages/core/src/themes/presets.ts`)

1. **Visual Novel** (`builtin-visual-novel`)
   - Ren'Py-inspired style with semi-transparent text box at bottom
   - Typewriter text animation, golden character name highlights
   - Dark overlay aesthetic, fade transitions

2. **Text Adventure** (`builtin-twine`)
   - Twine/SugarCube-inspired minimal UI
   - Link-based navigation with blue hyperlinks
   - Serif typography, no visible text box frame
   - Centered text, dark background

3. **Point & Click Adventure** (`builtin-point-and-click`)
   - LucasArts/Sierra classic aesthetic
   - Golden text on dark blue surfaces
   - Prominent hotspot indicators (always visible)
   - Sharp corners, pixelated feel

#### Theme Service (`packages/builder/src/services/ThemeService.ts`)
- CRUD operations (create, read, update, delete themes)
- Theme asset management with hybrid storage
- Theme inheritance resolution (child extends parent)
- Built-in theme registration
- Recently used themes tracking

#### GlobalSettings Adapter (`packages/builder/src/themes/migration/GlobalSettingsAdapter.ts`)
- `globalSettingsToTheme()`: Convert project settings to theme format
- `themeToGlobalSettings()`: Convert theme back to settings (backward compatibility)
- `applyThemeOverrides()`: Merge project-specific overrides with base theme
- `extractThemeOverrides()`: Detect what changed from base theme

#### Theme Selection UI (`packages/builder/src/components/settings/GlobalSettingsInspector.tsx`)
- Theme dropdown in Global Settings header
- Built-in themes and custom themes sections
- "Save as Theme" button to save current settings
- "Modified from [Theme]" indicator when settings differ from base theme

#### React Integration (`packages/builder/src/hooks/useThemes.ts`)
- `useThemes()`: Hook for theme listing, selection, and management
- `useTheme()`: Hook for loading a single theme by ID
- Automatic built-in theme registration on initialization

### Database Changes

Updated IndexedDB schema to v3 with new object stores:
- `themes`: Theme definitions with indexes by name, source, lastUsed
- `theme-assets`: Theme asset blobs with indexes by theme and role
- `theme-asset-metadata`: Hybrid storage tracking for theme assets

Updated Project interface with:
- `themeId?: string`: Optional reference to applied theme
- `themeOverrides?: Partial<ThemeDefinition>`: Per-project customizations

### Files Created
| File | Purpose |
|------|---------|
| `packages/core/src/types/theme.ts` | Core theme type definitions |
| `packages/core/src/themes/presets.ts` | Built-in preset themes |
| `packages/builder/src/services/ThemeService.ts` | Theme CRUD and management |
| `packages/builder/src/themes/migration/GlobalSettingsAdapter.ts` | Settings migration |
| `packages/builder/src/hooks/useThemes.ts` | React hooks for themes |

### Files Modified
| File | Changes |
|------|---------|
| `packages/core/src/types/index.ts` | Export theme types |
| `packages/core/src/index.ts` | Export preset themes |
| `packages/builder/src/storage/schema.ts` | v3 with theme stores |
| `packages/builder/src/storage/types.ts` | Project themeId, themeOverrides |
| `packages/builder/src/services/index.ts` | Export ThemeService |
| `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` | Theme selector UI |

### Usage

```typescript
// Using themes in a component
import { useThemes } from '../hooks/useThemes';

const { themes, selectedThemeId, applyThemeToSettings, saveAsTheme } = useThemes();

// Apply a theme
const newSettings = await applyThemeToSettings('builtin-visual-novel', currentSettings);

// Save current settings as a custom theme
const themeId = await saveAsTheme(settings, 'My Custom Theme');
```

### Future Enhancements
- Theme import/export (.asaps-theme ZIP format)
- Theme preview in editor
- Runtime theme switching
- Twine/Ren'Py import support
- Unity/Unreal export support

---

## 2024-12-24: Hotspot Opacity and Visibility Settings

### Features Added

#### Global Settings (Effects Tab)
Added comprehensive hotspot controls in **Global Settings > Effects > Hotspot Settings**:

1. **Show hotspots** (checkbox)
   - When unchecked: Hotspots become invisible (transparent) but tooltips still appear on hover
   - Useful for cleaner presentation while maintaining discoverability

2. **Show hotspot labels** (checkbox)
   - Controls whether tooltips appear when hovering over hotspots
   - Works independently from hotspot visibility

3. **Hotspot Opacity** (slider 0-100%)
   - Controls the transparency of the colored hotspot area
   - Default: 30%
   - Higher values make hotspots more visible

4. **Preview Mode Visibility** (dropdown)
   - **Visible**: Always show colored hotspot area (default behavior)
   - **On Hover**: Only show color when mouse hovers over the hotspot
   - **Invisible**: No visual feedback at all - user must discover hotspots on their own

#### Per-Element Hotspot Override (Visual Properties Panel)
When a hotspot element is selected in the Visual Editor:
- **Override global hotspot settings** checkbox
- When enabled, shows individual opacity and visibility controls for that specific hotspot
- Allows different hotspots to have different visibility settings

#### Custom Themed Tooltips
Replaced browser native tooltips with custom styled tooltips:
- Appears immediately on hover (no browser delay)
- Follows mouse cursor position
- Uses button theme colors for consistent styling
- Portal-rendered to avoid clipping by parent containers

### Files Modified
- `packages/builder/src/storage/types.ts` - Added `opacity` and `showInPreview` to GlobalSettings.hotspots
- `packages/builder/src/components/settings/GlobalSettingsInspector.tsx` - Added UI controls
- `packages/builder/src/utils/themeConverter.ts` - Pass new settings to renderer
- `packages/renderer/src/components/PositionedBeatView.tsx` - Rendering logic and tooltip
- `packages/builder/src/components/visual/VisualPropertiesPanel.tsx` - Per-element override UI
- `packages/builder/src/components/visual/VisualBeatEditor.tsx` - VisualElement type with hotspotOverride
- `packages/builder/src/App.tsx` - Default settings

### Settings Behavior Summary

| Setting | Effect |
|---------|--------|
| Show hotspots OFF | Invisible hotspots, tooltips still work |
| Show labels OFF | No tooltips on hover |
| Preview: Invisible | No visual feedback at all |
| Preview: On Hover | Transparent until hovered |
| Opacity slider | Controls colored area transparency |

---

## 2024-12-29: Builder Feature Improvements

Four feature improvements to enhance the ASAPS Builder user experience.

### Feature 1: Auto-Save Fix for Default Projects

**Problem**: Auto-save was saving default/empty projects (untitled with only 3 default beats: TitleScreen → IntroText → EndScreen), cluttering the project library.

**Solution**: Added `isDefaultProject()` check in PersistenceContext that detects when a project has only the 3 default beat types and skips auto-save.

```typescript
const isDefaultProject = (project: Project): boolean => {
  const beats = /* extract beats from project */;
  if (beats.length !== 3) return false;
  const types = beats.map(b => b.type).sort();
  const defaultTypes = ['endScreen', 'introText', 'titleScreen'];
  return JSON.stringify(types) === JSON.stringify(defaultTypes);
};
```

**Files Modified**: `packages/builder/src/contexts/PersistenceContext.tsx`

### Feature 2: Unified Import/Export Dropdown Menus

**Problem**: Import/export options were scattered - ASML XML in header, ZIP in Project Library modal.

**Solution**: Created dropdown menus in the header toolbar consolidating all import/export options.

**Import Menu**:
- Import ASML (XML)
- Import Project (ZIP)

**Export Menu**:
- Export ASML (XML only)
- Export ASML with Assets (NEW - creates ZIP with Story.xml + organized asset folders)
- Export Project (ZIP)

**Files Modified**:
- `packages/builder/src/components/Header.tsx` - Dropdown menus with ChevronDown icons
- `packages/builder/src/components/ProjectLibrary.tsx` - Removed duplicate buttons
- `packages/builder/src/App.tsx` - Added `handleExportAsmlWithAssets` handler
- `packages/builder/src/utils/projectZipManager.ts` - Added `exportAsmlWithAssets()` and `downloadAsmlWithAssets()` functions

### Feature 3: Improved Beat Selection Highlighting

**Problem**: Selected beat highlight (blue border) was hard to see when zoomed out, and no auto-center when selecting beats.

**Solution**:

**Cyan Highlight**: Changed selection styling from blue to cyan with background fill:
```css
bg-cyan-50 ring-4 ring-cyan-400 border-cyan-500
```

**Auto-Center/Zoom**: When a beat is selected, viewport automatically centers on it at 80% zoom with 300ms animation. For beats inside clusters, calculates absolute position from cluster position + beat's internal position.

**Files Modified**:
- `packages/builder/src/components/graph/BeatNode.tsx` - Cyan selection styling
- `packages/builder/src/components/graph/ClusterContainerNode.tsx` - Cluster beat highlighting with external selection support
- `packages/builder/src/components/graph/GraphEditor.tsx` - Auto-center useEffect with cluster beat position calculation

### Feature 4: Visual Editor Element Resize Handles

**Problem**: Elements in visual editor could only be moved by dragging, not resized. Users had to use the properties panel.

**Solution**: Added interactive resize handles at all four corners of selected elements.

**Implementation**:
- Added resize state: `resizingElement`, `resizeCorner`, `resizeStart`
- Added `startResize()` function to initiate resize operations
- Updated `handleMouseMove` to handle both dragging and resizing
- Made corner handles interactive with `pointerEvents: 'auto'`
- Minimum sizes: 50px width, 30px height
- Respects `locked` property on elements

**Files Modified**: `packages/builder/src/components/visual/VisualBeatEditor.tsx`

### Feature 5: Cluster Beat Collision Detection

**Problem**: Beats inside clusters could overlap after auto-layout, with one beat obscuring another.

**Solution**: Added `resolveInternalBeatCollisions()` function that iteratively pushes overlapping beats apart when auto-layout is performed.

```typescript
const resolveInternalBeatCollisions = (beatPositions) => {
  // Same algorithm as main collision detection:
  // - Detect overlaps using AABB collision
  // - Push apart in direction of least overlap
  // - Iterate until no overlaps or max iterations
  // - Ensure beats stay inside cluster (min x/y = 20)
};
```

**Files Modified**: `packages/builder/src/App.tsx`

### Summary of All Changes

| Feature | Files |
|---------|-------|
| Auto-save fix | `PersistenceContext.tsx` |
| Import/Export menus | `Header.tsx`, `ProjectLibrary.tsx`, `App.tsx`, `projectZipManager.ts` |
| Beat highlighting | `BeatNode.tsx`, `ClusterContainerNode.tsx`, `GraphEditor.tsx` |
| Resize handles | `VisualBeatEditor.tsx` |
| Cluster collision | `App.tsx` |

---

## Previous Updates

(Add previous progress entries here as needed)
