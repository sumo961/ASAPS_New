# UX Evaluation for 1.0 — Working Document

> **Status:** In progress (started 2026-08-21). The interface has been
> assembled piece by piece across ~60 releases; approaching feature
> completeness for 1.0 is the moment to reconsider it as a whole.
>
> **Core scoring axis — every surface is judged twice:**
> 1. **Novice comprehension** — can a first-session author tell what this
>    does, what to touch first, what will happen?
> 2. **Pro efficiency** — can an expert move fast: keystrokes, repetition,
>    forced re-confirmation of things they already know?
>
> The failure modes are opposite: over-simplification taxes pros exactly
> like over-exposure taxes novices. Every finding names WHICH audience pays
> and WHAT they pay. A proposal counts as an improvement only if it doesn't
> rob one audience to pay the other.

## Method

1. **Inventory** (this phase) — mechanical enumeration: surfaces, settings,
   blocking dialogs, entry points, disclosure mechanisms.
2. **Journeys** — student-first-session / returning author / expert, walked
   against the inventory.
3. **Structural questions** — preferences model, advanced-mode model
   (per-beat as today vs global vs hybrid — open question, decided on
   journey evidence), terminology, header structure, modal-vs-panel policy,
   alert() elimination.
4. **Synthesis** — findings (severity × effort × who-pays), split into
   quick wins / 1.0 restructure proposals (with mockups) / decisions for
   Hartmut.

## 1. Inventory

*(populated from the five parallel sweeps)*

### 1.1 Surfaces (windows / modals / panels)

**Counts:** 6 windows (5 hash routes + main editor; each a real Electron
BrowserWindow) · ~50 reachable modal mount sites (44 distinct components)
+ 6 header dropdown overlays · 27 reachable panels · **12 orphaned/dead
surfaces** · **8 duplicated surfaces** (two implementations of one job).

**Windows:** Main editor, StartWindow, PreviewWindow, DebugWindow,
IdeatorWindow, CoDesignerWindow. Routing = hash-inspection in App.tsx; each
pop-out follows the 4-part Electron IPC pattern. Coherent; no findings at
the window level itself.

**Dead code museum (pre-1.0 deletion list, who pays: maintainers +
anyone reading the code to learn the app):**
1. `StoryPreview.tsx` (~1200 lines) — mounted but gated on a flag whose
   only setter is never called. Third full story player kept alive.
2. `StatePresetManager/Editor` — only host is StoryPreview → transitively
   unreachable (PreviewWindow has its own newer preset UI).
3. `DebugPanel.tsx` — superseded by DebugWindow; still has passing tests
   and a vestigial `showDebugPanel` state in App.
4. `KeyboardShortcutsModal` — complete, styled, never imported — while the
   app HAS shortcuts documented nowhere in-product (⌘F/⌘⇧K/⌘⇧P).
5. `ProjectNamingDialog` — never imported; overlaps SaveProjectDialog +
   NewProjectDialog.
6. `StashPanel` — exported from the VCS barrel, rendered nowhere; git
   stash unreachable from UI (docstring claims an entry point that no
   longer exists).
7. `EnhancedVisualEditor`, `PanoramaEditor`, `CharacterSelector`,
   `MicrophoneButton`, `DialogTreeEditor-improved` + `-unlimited` (+
   `.backup.tsx`), dead `AssetSelector` import in Inspector.

**Duplications (each is a fork that will diverge):**
- Three "name this project" dialogs (SaveProjectDialog /
  SaveUnsavedWorkDialog / orphaned ProjectNamingDialog) — §1.3 already
  found Header using a 2-way confirm() while the 3-way dialog sits unused.
- Two independently-written asset pickers (AssetSelectionModal vs inline
  chooser in CharacterEditor:1872).
- Two sessions panels (Ideator vs CoDesigner — stated copy, differs by a
  projectId filter).
- The three create paths (Empty / prompt / co-write) implemented in
  THREE places: NewProjectPicker, ProjectLibrary cards, StartWindow cards.
- SearchPanel and HelperCommandInput: both fixed right-edge z-50 slide-ins
  with independent open state — can be open simultaneously, overlapping.

**Entry-point distribution confirms §1.4's inversion from the surface
side:** StoryGenerator reachable 5 ways, CharacterManager 4, VCSPanel 4 —
while workhorse panels (Assets, Debug, translation) have exactly one door.

**Notable pattern:** CharacterManager doubles as character *picker* when
opened with a callback (4 entry points) — a modal-as-API pattern novices
never notice but which couples CRUD UI to field editing.

### 1.2 Settings & preferences (app-level vs project-level)

**Counts:** 18 localStorage keys + 1 sessionStorage + 2 Electron
app-settings keys (device world) · 19 effective GlobalSettings sections
(17 declared + `variables`/`uiStrings` used-but-undeclared) across 12
inspector tabs · 3 sections with zero editing UI · 4 settings edited
OUTSIDE the settings inspector.

**Structural hazard (pre-1.0 must-fix):** GlobalSettingsInspector declares
its OWN copy of the GlobalSettings type, and that copy — not the canonical
one in storage/types.ts — is what App/WorkspaceView/VisualEditor import.
The two have diverged twice already (GSI adds `variables`; omits
`ai`/`location`, forcing `(settings as any)` casts). A manual "keep in
sync" comment is the only contract. → One canonical type.

**Misplacements (who pays: classrooms):**
- **API keys in localStorage** (asaps_ai_config, brave, TTS, STT) —
  per-browser-profile, plaintext, lost on cache clear; a teacher provisions
  30 machines by hand. Belongs machine-level (app-settings.json/keychain)
  or lab-proxy. Non-secret provider/model mirroring to the project already
  half-exists (applyProjectAIDefaults).
- **`asaps_tts_enabled` (device toggle) decides whether an EXPORTED player
  ships with TTS** — two students exporting the same project get different
  artifacts. Belongs in the project or the export dialog.
- **story-presets keyed by story TITLE in device storage** — rename orphans
  them, same-title projects collide, presets never travel/VCS.
- Same concept, two stores, two names, one UI: Electron `mcpEnabled` vs web
  `asaps_mcp_enabled` (web edit path = typing into devtools console).

**No-UI settings:** `globalSettings.ai` (whole section invisible — a class
default nobody knows is committed to git), `uiStrings` (players'
"Continue"/"Inventory" labels uneditable except via translation),
`tts.readPrompts` (dead accessibility feature — service support exists,
never called), `ProjectSettings.editor.gridSnap/showGrid` (fully dead —
visual editors use local state that resets every mount).

**Agent's shortlist adopted into candidate fixes:** keys → machine store;
AI/Voice inspector tab; export ttsEnabled → project; presets re-keyed by
project id; single GlobalSettings type; MCP web UI-or-delete; dead
settings deleted or wired.

### 1.3 Blocking dialogs (alert / confirm census)

**Totals: 70 `alert()`, 31 `confirm()`, 0 `prompt()`** (prompt was already
eradicated for Electron — the promise-based modal pattern at App.tsx:5016 is
the precedent to follow). 42/70 alerts live in App.tsx alone.

Alert classes: 16 success confirmations · 35 error reports · 16
validation/precondition blocks · 3 warnings. Confirm classes: 20
destructive-data · 4 unsaved-work guards · 4 advisory · 2 legacy-format
gates · 1 bulk migration.

**Who pays:** novices get walls of modal text at the worst moments (the
Move-library flow chains THREE blocking dialogs); pros get success-alerts
("Project exported!") that interrupt flow to confirm what the UI could show
ambiently. Both audiences pay; nobody wins.

**Worst offenders:**
- Move library to disk = confirm → confirm → alert chain (ProjectLibrary
  512/528/544).
- ASML legacy gate: ~90-word explanation inside a native confirm, text
  duplicated verbatim (Header 554/575).
- Header unsaved-work guard crams a 3-way choice (save/discard/stay) into a
  2-way confirm — while SaveUnsavedWorkDialog, a real 3-way dialog, exists
  and is unused there (Header 351/1109).
- Asset validation: failure gets a proper dialog, success gets alert()
  (GlobalSettingsInspector 265 vs MissingAssetsDialog).
- `asaps:externalProjectChange` event is dispatched with ZERO listeners —
  the external-edit banner was designed and never built; alert is the
  stand-in (PersistenceContext 303/306).

**Alternatives already shipped (migration targets):**
- Toast stack: VCSToast + VCSStatusProvider event bus — generic in shape,
  VCS-namespaced in wiring; sticky errors, auto-dismiss successes,
  escalation-to-modal policy already correct. → Host for a general
  app-wide toast; absorbs all 16 success alerts + most of the 35 errors.
- ImportIssuesBanner pattern → the 4 "success + N warnings" alerts.
- SaveStatus (has an unused error state!) → all save success/failure
  alerts.
- Click-again inline confirm (shipped in ProjectLibrary deletes) → the 6
  small destructive confirms (Inspector/Graph/VisualProps/Asset/Animation
  deletes).
- Real modals (InputModal pattern) → the few genuine blocks: layout-mode
  switch, git reset/force-push, workspace replacement.

Style debt: 6 bare `confirm()` vs `window.confirm()` calls.

### 1.4 Entry points & shortcuts

**Redundancy map (capability × entry points):** New project 9 · Open/load
10+ · Export 6 · Save 5 · AI story generation 6 · Ideator 5 — while
Assets, Debug, Co-Designer, translation, TTS/STT config, Merge, and every
Electron-menu-only feature have exactly ONE way in. The distribution is
inverted: ceremonial capabilities have many doors; workhorses have one,
often obscure.

**Real bugs found:**
- **⌘⇧K bound twice** — Electron VCS Push wins over the in-app
  Transformations toggle; the Tools tooltip still advertises the shadowed
  binding (App.tsx:581 vs VC menu).
- **Fictional accelerators** — the graph context menu prints ⌘D/⌘C/⌘V/⌫
  for Duplicate/Copy/Paste/Delete; none is implemented
  (deleteKeyCode={null}); beat clipboard ops are mouse-only.
- **⌘N ≠ "+ New"** — menu goes straight to NewProjectDialog, toolbar opens
  the 4-tile picker. Same words, different destinations.
- **⌘S ≠ Save button** on untitled projects — menu saveNow() silently, the
  button opens the naming dialog.
- **Dead code:** the in-window StoryPreview modal is unreachable
  (handlePreview never referenced; showPreview only ever set false);
  KeyboardShortcutsModal is never imported — it documents shortcuts that
  DON'T exist (⌘P preview, ⌘, settings, ?, beat ⌘C/V/D) and promises a "?"
  handler no one wrote; Inspector.onOpenAssetManager declared, never wired.

**Menu-bar blind spots:** a desktop user driving by menu cannot reach Story
Settings (no menu item, no ⌘,), template/HTML/ASML exports (File→Export
does only the zip), or any conversion import. Conversely: Reveal, GitHub
clone/new, Save As Folder, Open Folder, MCP/auto-update toggles are
Electron-menu-only — invisible on the web build.

**One concept, many names:** Ideator = "Ideate with Ideator" / "Co-write
with AI"; StoryGenerator = "Generate Story" / "Build from a prompt";
open-a-project-file = "Open Project File…" / "Open a file" / "Open
Project…"; "Save a Copy (.asaps)" (menu) vs "Export Project (.asaps)"
(toolbar) are sibling actions with two names and two code paths.
"Settings" means app-prefs in the Win/Linux menu bar and story settings on
the toolbar button.

**Keyboard reality:** ~14 real app shortcuts (mostly Electron menu), 4 more
in-app (⌘F, ⌘⇧K†, ⌘⇧P, preview keys), canvas-scoped editing keys in the
Visual Editor — but ZERO keyboard support for the graph's core loop
(select/duplicate/delete beats). Pros pay daily; the context menu's fake
hints prove someone intended otherwise.

**Create-path grids differ silently:** Browser/StartWindow tiles = Empty ·
Prompt · Co-write · OPEN A FILE (+ template shelf); NewProjectPicker =
Empty · Prompt · Co-write · START FROM TEMPLATE. The fourth tile swaps
identity depending on where you stand.

### 1.5 Inspector anatomy & disclosure mechanisms

**The central discovery: the "per-beat advanced mode" does not exist.**
What exists is ONE boolean on the Inspector component (Inspector.tsx:209),
which — because App renders the Inspector without a React key — survives
beat-to-beat selection and resets only on deselect. It *feels* per-beat; it
is per-panel-instance, per-session. Nothing per-beat is stored anywhere
(no beat.ui field, no localStorage, no project field).

**Persistence census:** across the whole builder, NOT ONE disclosure or
advanced toggle persists. The only persisted UI state is geometry and tabs
(inspector width, suggestions height, sidebar split, VCS panel tab/height,
TTS/STT enabled). 30+ disclosure mechanisms cataloged (D1–D34), all
session-state or data-driven.

**The schema has no tier concept.** ui flags exist for hidden(38) /
group(81, always-open) / dependsOn(21) / scope(35) — but no
`ui.advanced`/`ui.tier`; `required` only paints the asterisk; field order =
raw JSON insertion order (hidden params sometimes listed first). Any
tiering scheme needs a new schema flag + generator support, or the 12
hardcoded beat editors and the schema path will tier by two hand-maintained
rules forever.

**Control density (advanced OFF):** infoText ≈10 controls · aiConversation
≈19 (24 with advanced; each `directions` row +5) · dialogTree ≈8 chrome +
an unbounded tree — a modest 5-node tree ⇒ 40–60 live inputs in one column.
Novices meet a 2×–5× wall on exactly the beats that make stories
interesting.

**The Advanced button's worst sin:** it gates the ONLY path to Effects on
multiChoice/movementChoice/pickProp/panorama hotspots — a documented
discoverability trap (USER_GUIDE.md:1616 apologizes for it: "If you're
looking for Effects and can't see them, that's usually why"). Who pays:
novices can't find the feature; pros re-click the toggle every session.

**Duplicated hand-maintained lists (drift risk):** the logic-beat
suppression list appears twice (Inspector 4991/5245); the custom-editor
exclusion list twice (1852/4856). Schema `category` is the natural
replacement.

**Incidental bugs found by the survey:**
- Duplicate target picker on single-connection beats — the schema
  `connection` select AND the Connections section select write the same
  edge (SchemaFormGenerator 1147 + Inspector 4864).
- aiConversation renders an EMPTY "Connections" heading (connectionType
  'multiple' has no control body) (Inspector 4859).
- DialogTreeEditor's Conditions and Effects toolbar toggles are DEAD —
  state colors the buttons and gates nothing (DialogTreeEditor 167–168).
- Background Sound is universal hardcoded chrome, not schema-declared —
  invisible to schema-driven tooling.

**Implication for the advanced-mode decision:** since nothing is per-beat
today, "keep per-beat as we have it" isn't actually on the menu — the real
options are (a) formalize per-beat (new keyed state or beat.ui field, with
round-trip costs), (b) global persistent tier (one-line change, consistent
with existing persisted-geometry keys), (c) hybrid: global tier + schema
`ui.tier` so both schema and hardcoded editors obey one rule. Journey
evidence should decide; (c) is the only option that also fixes the
Effects-behind-Advanced trap by letting specific high-value sections
(Effects) claim basic-tier placement regardless of mode.

## 2. Journey findings
_pending_

## 3. Structural questions
_pending_

## 4. Synthesis
_pending_
