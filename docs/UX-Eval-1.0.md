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

### 2.1 Student first session (novice comprehension)

**The headline: the untitled/named split is an invisible load-bearing
state machine, and it can eat a first session.** Four findings are the
same fault from four sides:

1. **Untitled work is never auto-saved** — `getProjectData` throws for
   untitled projects (PersistenceContext.tsx:229-237); the only surface
   is a red toolbar chip quoting the raw exception, "Cannot auto-save
   untitled project" (SaveStatus.tsx:106-112). **⌘S makes it worse**: the
   Electron File→Save calls `saveNow()` directly (App.tsx:898-901) →
   same throw, NO naming dialog. And the close guard doesn't fire —
   `beforeunload` only checks `pending|saving`, not `error`
   (useAutoSave.ts:390-400). A student can lose the whole session with
   no dialog at any point.
2. **Old untitled projects are deleted at boot, silently** —
   App.tsx:2064-2081 keeps the newest 'Untitled Project' and
   `deleteProject()`s the rest, no confirm.
3. **"Empty project" means two different things** — StartWindow's tile
   (copy: "Pick layout up front" — false, no dialog shown) creates
   untitled + seeds a 3-beat starter story; the editor's +New →
   NewProjectDialog (the best copy in the app) creates a NAMED project
   which loads **zero beats** (gate at App.tsx:2196). The careful
   student who fills in the form gets a blank grid with no empty state
   (GraphEditor has no zero-node branch); the one who skips it gets a
   working story.
4. **Required-field validation is dead code** — `validateBeat` +
   red banner exist (Inspector.tsx:1230-1299, 1734-1746) but the only
   caller `handleSave` (:1545) is never invoked. Empty "Text *" ships a
   blank screen silently.

**Preview = the author's flagged concern, confirmed with a mechanism:**
- **Preview auto-attaches to the selected beat** — App.tsx:4459 passes
  `beatId: selectedBeat?.id`, and a beat is essentially always selected
  (dropping/clicking selects). So the novice's "press play" always lands
  in start-from-beat mode: amber overlay "Click to preview from
  Introduction", plus the state picker headed "How did the player arrive
  here?" / "12 paths → 7 unique states" — a state-space reasoning model
  presented unprompted for a 3-beat story. One-line fix candidate: don't
  pass beatId on plain open.
- **Debug panel ON by default, ~40% of the window** (useState(true) at
  PreviewWindow.tsx:347) showing affect, seeded-visited-beats,
  JSON.stringify'd variables — before anything runs. Toggle = one of SIX
  unlabelled icon toggles bottom-right.

**Interaction dead ends:**
- **Palette tiles are drag-only** (no onClick, BeatPalette.tsx:374-417);
  the Sidebar's `onAddBeat` prop is destructured and never used
  (Sidebar.tsx:12,29) — App wires it into a void. Clicking the most
  natural first gesture does nothing, silently.
- **The graph looks like a node editor but can't connect** — no
  `onConnect` on ReactFlow, `isConnectable={false}` on both handles;
  branching actually lives in Inspector dropdowns (3 different models by
  beat type). Context menu advertises ⌘D/⌘C/⌘V/⌫ that don't exist while
  `deleteKeyCode={null}`.
- **DialogTreeEditor's Conditions/Effects toolbar toggles gate nothing**
  (state flipped, never read) — novice concludes broken.

**False signposting:** BeatSuggestions' keyless message says "Configure
an AI provider in **Settings**" — the 12-tab Settings modal has NO AI
tab (config lives in AI ▾ → Configure AI). Every beat, every keyless
user. VCSStatusBar invites a media-studies student to *install git*
once their project is folder-adopted.

**Attention economics:** the most saturated control on first launch is
purple "Add Cluster" (the least useful first action); the template shelf
(the BEST novice affordance — "The Oil Lamp… swap in your own object")
ranks BELOW the create row; 34 palette tiles show at once incl. 12
AI/EXP tiles a keyless student can't run; vocabulary used before any
definition: beat, cluster, Flowchart, Responsive layout, HUD.

**Bright spots worth protecting:** NewProjectDialog copy (best in app),
Info Text ordered first in palette, drop-selects-beat + Inspector fills,
Preview button signposting, SaveProjectDialog itself, LAST PROJECT /
"Continue editing →" resume banner.

### 2.2 Returning author, ~40-beat story (both axes)

**The headline: "show this choice only if…" — the most common branching
mechanic in interactive narrative — has no UI.** `dialogChoice.conditions`
/ `multiChoiceOption.conditions` / `movementOption.conditions` exist in
the schema AND run in the engine (DialogTreeBeat.ts:793-794,
MultiChoiceBeat.ts:161-162), but no live editor writes them; the
DialogTreeEditor's "Toggle Conditions" toolbar button colours itself and
gates nothing (the §1.5 dead toggle — someone built the button, never
the panel). Authors are pushed to three mismatched surfaces: Condition
Check beat ("Condition Type", default 'counter'), Requirements
(redirect-on-arrival, default 'inventory' — different default, same
session), Effects (write-only). Gating one door = ~16 steps + two
invisible beats. The condition template library covers ONLY affect — not
one inventory/variable/counter preset.

**Silent graph corrosion:** deleting a beat filters `connections` but
never scrubs choice/dialogNode/trueTarget/defaultTarget ids inside OTHER
beats' parameters (useStoryBuilder.ts:300-311); neither delete confirm
mentions inbound links; and `setImportIssues` has exactly two callers —
import validation and dropped-beats — so **no edit ever re-validates**.
Broken targets from a delete are invisible until Debug → Reachability
(a panel this persona has never opened) or a live playthrough.

**Portrait heartbreak chain (steps 2→3, the app's most common two-step):**
- "Browse Existing Assets" under Speaker Portrait calls
  `setShowAssetPicker('default')` → writes `visual.defaultImage`, NOT the
  portrait (CharacterEditor.tsx:387 vs :1890-1895). Silent wrong-field
  bug; the identical button 45 lines down is correct.
- Then the uploaded portrait renders ONLY if global
  `speakerDisplay.showGraphics` is on — **default false**, switch labeled
  "Show speaker portraits" in Settings → *Effects* (tab tooltip: "Text
  animations…"). No per-beat override exists (unlike showNames), no
  surface mentions the suppression. Work done, invisible, zero feedback.
- CharacterEditor's inline picker (the §1.1 duplication) has NO upload
  control — empty grid dead-end on asset-less projects. Third picker
  detail: AssetSelectionModal's filter accepts any image but its upload
  `accept` is still `.jpg,.jpeg` for backgrounds (:260), as is
  AssetManager's Backgrounds button — a PNG background imports one door
  and greys out in another.

**Media has three doors that do NOT lead to the same place:** music =
Inspector "Background Sound" (on every beat); image = Visual Editor tab
only (whitelist, tab vanishes for non-visual beats); library = header
Assets (assigns nothing). No background-image field next to Background
Sound where symmetry demands it.

**Variables: three creation doors, one declarative.** Settings→Variables
(tab 10 of 12) promises "will appear in dropdowns" — true only for
variables created there; SmartNameDropdown "+ New..." mints undeclared
names; the used-in-story union is applied ONLY in RequirementsEditor
(Inspector.tsx:5190+), not ChoiceEffectsEditor/DialogTreeEditor — a
variable minted on choice A is invisible in choice B's dropdown; typos
mint silent duplicates.

**Share a draft: the labels point the wrong way.** No export item says
play/share/browser. The right answer ("Export as HTML") is described as
"for web embedding" — developer language; the wrong answer (.asaps,
"double-clickable, everything included") reads like sharing but needs
ASAPS installed. Inside the HTML dialog, the friend-sendable mode
(Single File) is not the default. Backup badges point at the same
mislabeled menu item with a second meaning.

**Save → unsolicited git.** Silent folder adoption (correct) makes
VCSStatusBar render "Set up Git" or "⚠ Git not found + Install Git" —
no dismiss, no opt-in — telling a VCS-naive author that software is
missing, as a consequence of pressing Save.

**Preview from this persona's seat:** the start-from-beat state picker
is EXCELLENT and exactly what they need — mislabeled. "Select state
(12)" on an amber (=warning-coloured) dropdown; "state" is not their
word ("Start as if the player had…" is). And the debug panel shows all
variables but lets them edit nothing — every "what if" costs a full
restart; the StoryContext setters already exist, only inputs are
missing.

**Other findings:** Settings modal is all-or-nothing save across 12 tabs
with no live preview; applying a theme overwrites current settings
unwarned; three verbs for "open my story" (Continue editing / Browse
all projects… / Open Project File…); "Last project" = last OPENED not
last edited; cluster assignment is one-at-a-time drag for 40 beats (no
multi-select→assign); external-change alert is good text in a blocking
OK-only modal that names an action it doesn't offer, throttled to once
(later collisions silent); CharacterRefField is hardcoded dark-styled
inside light panels; Effects behind Advanced on multiChoice but always
visible on dialogTree — the author HAS seen Effects and now "multiChoice
doesn't support them".

**Cross-cutting root cause (feeds §3):** the schema knows things the
builder doesn't render. Conditions exist unrendered; there's no
`ui.tier`; the Inspector hand-maintains the logic-beat suppression list
twice and the custom-editor exclusion list twice. The advanced-mode
decision and the choice-conditions gap are the same decision.

### 2.3 Expert / pro efficiency (frequency × cost)

**Two real bugs found (beyond UX):**
1. **⌘Z is bound twice and rewinds the undo pointer by two.**
   `useCommandManager` defaults `enableKeyboardShortcuts: true`; both
   App.tsx:2944 AND UndoRedoToolbar (Header.tsx:368, no options) register
   window listeners on the same singleton; `CommandManager.undo()` has no
   re-entrancy guard and decrements `currentIndex` after an await — one
   press undoes one command's effect but skips a second on the stack.
   Neither handler checks `document.activeElement` (the guard exists in
   VisualBeatEditor.tsx:449 — just not on the undo path). Fix: one prop
   (`enableKeyboardShortcuts={false}` on the toolbar) + focus guard.
2. **Every VCS success clears the undo history — including commit.**
   App.tsx:3707 `getCommandManager().clear()` on ANY `success` event;
   VCSStatusProvider emits success for commit/push/stage/unstage.
   Committing every 10 minutes (the good habit) destroys undo every 10
   minutes. Fix: allowlist tree-rewriting ops only (pull/stashPop/reset/
   merge/checkout).

**Keyboard reality:** 22 real bindings, one dead (⌘⇧K Transformations —
shadowed by the Electron VCS-Push accelerator, while two tooltips still
advertise it). The graph's core loop (add/duplicate/delete/connect,
150-250 ops/hour) is 100% mouse: GraphEditor has ZERO keydown listeners,
`deleteKeyCode={null}`, palette tiles drag-only — while the context menu
prints ⌘D/⌘C/⌘V/⌫ keycaps. All the handlers exist and are wired; only
the listener is missing. ⌘K Commit opens the panel but the literal
comment `/* focus commit input */` IS the implementation; no ⌘⏎ submit.

**Corrections to earlier sections:** multi-select DOES exist and is good
(shift-marquee, group drag, drop-N-into-cluster all work — 2 drags to
move 10 beats between clusters; completely undiscoverable). Effects are
behind Advanced on 3 beat surfaces, not 4 (pickProp is NOT gated; the
User Guide apology names the wrong beat). Toolbar Save on named projects
is silent — the success alerts live on export/template/import paths.

**The iteration-loop killer:** every edit wipes the Preview's selected
path state. Story arrives with a new object identity on each 300ms
STORY_UPDATE; the preset effect is keyed on `[story, startBeatId]` and
does `setSelectedPreset(null)` + full path re-enumeration
(PreviewWindow.tsx:728-774). Edit→verify with a chosen "arrived with the
key" state = re-pick every single time, ~40×/session. Fix: key on
startBeatId + story digest (utils/storyDigest.ts exists). Otherwise the
loop is GOOD: live 300ms updates to both Preview and Debug windows,
click-beat-arms-preview, auto-select single path, Space to run — ~5
interactions to "play from beat 23 with the key".

**Confirmation tax measured:** ~45-48 blocking native dialogs/hour in a
heavy session; ~2 earn modality. 30 beat-delete confirms (undo exists!),
16 success alerts (VCSToast bus shipped and idle), click-again pattern
already shipped in ProjectLibrary. Target ≈2/hour.

**Search & Replace silently incomplete:** SearchService covers 5 fields;
never searches `prompt` (11 beat types!), `question`, `choices[].text`,
`cancelButtonText`, `textVariations`; `speaker` reaches search only on
beat types whose getParameters exposes it. Replace applies ONLY to
`type === 'beat'` matches — character/variable/counter matches are
displayed, counted in "Replace Selected (N)", silently skipped.
Transformations (HelperCommandFilter) covers more fields + preview +
case handling — the strictly better tool is the buried one (2 clicks
behind Tools ▾, dead shortcut, 600ms artificial spinner minimum, panel
closes after every apply).

**Debug loop last mile unimplemented:** DebugWindow findings highlight
but don't select or center (App.tsx:615-618) — a beat 3000px off-screen
changes colour. Search results DO select (handleNavigateToBeat,
App.tsx:5967); debug should reuse it + setCenter. Tab verdicts:
Reachability earns its complexity; Story Logic is the most actionable
surface in the app (only place proposing fixes); Path Analysis is
partly write-only (backward explorer + 1830-line tree view feed no
decision) — the "overwhelms experts" surface, confirmed.

**Persistence deserts:** nothing disclosure-related persists (23
localStorage keys = geometry + device toggles only); all six windows
have hardcoded bounds (no getBounds save despite app-settings.json
existing); WorkspaceView tab, Settings tab (12!), DebugWindow tab,
ProjectLibrary sort/view all reset. StoryGenerator re-asks 5 settings
every run while `globalSettings.ai` exists with no UI; Ideator and
Co-Designer persist sessions perfectly — the asymmetry is invisible.
Recents dropdown caps at 5 (effectively 4) for a 30-project author.

**Free wins list (15 items, each ≤ a few lines):** graph shortcuts the
menu already promises; ⌘⏎ + autoFocus commit; rebind Transformations;
⌘, + menu item for Story Settings; ⌘⇧D Debug / ⌘⇧C Characters; import
+ correct KeyboardShortcutsModal, bind `?`; persist showAdvanced,
workspace tab, settings tab, debug tab, library sort; window bounds in
app-settings.json; seed StoryGenerator from globalSettings.ai; delete
MIN_DISPLAY_TIME + keep panel open; narrow the VCS undo-clear;
UndoRedoToolbar shortcut prop; maxRecentProjects 5→12; route
HIGHLIGHT_BEAT through handleNavigateToBeat.

## 3. Structural questions (answered on journey evidence)

### 3.1 Advanced mode: per-beat vs global → **global persisted tier + schema `ui.tier` (hybrid c)**

The question was "per-beat as we have it vs global." The premise fell:
per-beat does not exist — today it's ONE non-keyed panel boolean, sticky
across beat switches, reset by every deselect (and every delete
deselects). Nobody chose this; it's an accident of component lifetime.
The journey evidence is unanimous:
- Novices never find Effects (gated on 3 beat surfaces; the trap the UG
  apologises for — naming the wrong beat).
- Experts pay ≈60 interactions/hour re-enabling a mode they never want
  off.
- The SAME editor (ChoiceEffectsEditor) is gated on multiChoice and
  ungated on dialogTree — so the disclosure difference carries no
  information; it's noise.

Decision shape: one **persisted, global** "Show advanced options"
preference (author-scoped, localStorage, consistent with the five
geometry keys that persist today) + **`ui.tier` in the beat schema** so
tiering is data, not hardcoded lists. Effects declares `tier: basic`.
Per-beat scoping is dropped: no journey produced a case where an author
wants advanced ON for beat 7 and OFF for beat 8; what they want is
"advanced on for me" (expert) or "off until I'm ready" (novice).
This also retires the twice-maintained suppression/exclusion lists in
the Inspector — the schema-driven principle from CLAUDE.md applied to
disclosure.

### 3.2 App vs project preferences → **three explicit scopes**

Today's 18 localStorage keys + 2 app-settings keys + 19 GlobalSettings
sections mix three different kinds of state. The model that resolves
every §1.2 misplacement:

| Scope | Lives in | Examples | Rule |
|---|---|---|---|
| **Machine** | app-settings.json (Electron) / localStorage (web) | API keys, window bounds, MCP, TTS *device* mute | "About this computer" |
| **Author preference** | persisted UI state | advanced tier, active tabs, sort orders, panel widths | "How I like the editor" — never affects output |
| **Project** | project files | everything a player sees or an export contains: fonts, colors, uiStrings, AI generation defaults, **export TTS** | "Travels with the story" |

The litmus test that decides every future case: **if two authors opening
the same project could see different players/exports, the setting is in
the wrong scope.** Current violations, each now with a destination:
`asaps_tts_enabled` deciding exported artifacts → project (export
dialog); story presets keyed by title in device storage → project files
keyed by id; API keys in localStorage → machine store (+ classroom
provisioning path); `globalSettings.ai` with no UI → project AI tab
seeding StoryGenerator; two competing GlobalSettings types → one
canonical type in storage/types.ts.

UI consequence: the Settings modal is currently 12 tabs of *project*
settings opened by a button labeled just "Settings", while app-level
config hides in AI ▾/TTS ▾/STT ▾ dropdowns. Rename the modal **Story
Settings** (⌘, + menu item), add an **App Preferences** surface for the
machine scope (keys, devices, updates, MCP) — ending "Settings means
two things" (§1.4) and giving BeatSuggestions' broken pointer a true
target.

### 3.3 Terminology → one name per concept (canonical glossary)

Journey-confirmed collisions, with proposed canon:
- **Open**: "Continue editing" / "Browse all projects…" / "Open Project
  File…" → canon: **Open** (library) and **Open File…** (disk); the
  library is the default door.
- **Share/Export**: the share action must say what it does — "Export
  as playable web page (HTML)" with Single File default labeled "one
  file — easiest to send"; .asaps described as "project file (needs
  ASAPS)". "Relay" is a key-hosting mode, not an export.
- **Character naming**: "Code Name" (editor) vs `name` (combobox) vs
  frozen ID paragraph as the first thing in the Basic tab → canon:
  **Name** + **Display Name**, ID demoted to a footer detail.
- **Conditions vocabulary**: "Condition Type" / "Requirements" /
  "Effects" defaults disagree (counter vs inventory) → canon: choices
  get **"Show only if…"**; beat-level gate stays **Requirements**;
  writes stay **Effects**.
- **Preview state**: "Select state (12)" / "How did the player arrive
  here?" → canon: **"Start as if the player had…"** — and not
  amber/warning-styled.
- **AI surfaces**: Ideator="Ideate", picker says "Co-write with AI",
  StoryGenerator="Generate Story" vs "Build from a prompt" → canon: use
  the picker's task language everywhere; the tool names are subtitles.
- **Transformations** (Tools ▾) — the app's most powerful bulk editor,
  named like a math feature → canon: **"Bulk Edit (AI)"** or fold Search
  & Replace + Transformations into ONE "Find & Change" surface (the
  strictly-better tool absorbs the discoverable one's slot).

### 3.4 Header & entry points → invert the inversion

Rule: **doors proportional to frequency.** Create-paths exist in 3
implementations and 9-10 doors; workhorses (Assets, Debug, Settings,
Characters) have one door and no shortcuts; menu bar lacks Settings
entirely while ⌘S silently diverges from the Save button. Decisions:
- ONE create surface (NewProjectPicker) that all doors open — delete
  the other two implementations (ProjectLibrary cards, StartWindow cards
  render the same component).
- Menu-bar parity: every toolbar workhorse gets a menu item + shortcut
  (⌘, Settings; ⌘⇧D Debug; ⌘⇧C Characters); ⌘S on untitled opens the
  naming dialog (same path as the button).
- Graph gets the four shortcuts its context menu already advertises.
- The 34-tile palette gets type-ahead quick-add (keystroke → filter →
  Enter connects to selection) — the single highest-leverage expert
  addition, and novice-safe (tiles stay).

### 3.5 Modal-vs-panel policy

Evidence: ~50 modals, character flow stacks 3-4 deep, four asset
pickers, three "name this project" dialogs, two right-edge slide-ins
sharing one screen slot with no mutual exclusion. Policy:
- **Modals are for decisions, panels for work.** Anything the author
  works IN for minutes (CharacterEditor, DialogTree expanded editor,
  AssetManager) should not stack on other modals.
- **One asset picker** (AssetSelectionModal) mounted everywhere; the
  CharacterEditor inline picker (no upload, wrong-field bug) and the
  AssetManager's JPG-only background button are retired.
- **One name-project dialog**; Header's 2-way confirm is replaced by the
  already-built 3-way SaveUnsavedWorkDialog.
- SearchPanel + HelperCommandInput become one exclusive right-rail slot
  (or one merged surface per §3.3).
- The §1.1 dead list (12 surfaces incl. StoryPreview ~1200 lines) is
  deleted outright — none is reachable, two document wrong shortcuts.

### 3.6 Blocking-dialog elimination

Target ≈2 modal interruptions/hour (from ~45). Ban native alert() /
confirm() app-wide (lint rule). Routing: 16 success alerts → the
shipped toast bus (VCSToast generalized); small destructive confirms →
the shipped click-again pattern; beat deletes → NO confirm (undo exists)
+ "Deleted 'X' · Undo" toast; delete-with-inbound-links confirm becomes
informative ("3 choices in 2 beats point here and will break") — the
one confirm that EARNS its modality today doesn't exist. Keep true
modals only for: git history rewrites, layout-mode switch, workspace
replacement, permanent multi-file deletion. External-change alert →
non-blocking banner with a "Reload from disk" action (the event for it
already exists with zero listeners).

### 3.7 Cross-cutting root cause: the schema knows what the builder doesn't render

One decision underlies #1 findings in two journeys: capabilities
live in the schema and engine but die before reaching the UI —
`dialogChoice.conditions` (runtime-complete, no editor), `ui.tier`
(missing, forcing hardcoded gates), validation (validateBeat dead;
import-only issue reporting; delete never revalidates). The 1.0
principle: **every schema capability either has a rendered surface or
an explicit "not exposed" annotation; validation runs continuously on
the story graph, not once at import.** This is the same
schema-driven-over-hardcoded principle already in CLAUDE.md — the eval
found the three places it was never applied.

## 4. Synthesis

Severity scale: ⛔ data-loss/blocker · 🔴 core-flow failure · 🟠 major
friction · 🟡 polish. Effort: S (≤1 day) / M (days) / L (week+).

### 4.A Bugs to fix now (not UX decisions — just wrong)

| # | Finding | Sev | Effort |
|---|---|---|---|
| A1 | Untitled data-loss chain: ⌘S throws instead of naming; close guard ignores `error` status; boot deletes old untitled projects silently | ⛔ | S |
| A2 | ⌘Z double-bound, rewinds undo pointer by two; no input-focus guard | ⛔ | S |
| A3 | VCS success (incl. commit/stage) clears undo history | ⛔ | S |
| A4 | Delete strands choice targets; no edit-time revalidation feeds ImportIssuesBanner | 🔴 | M |
| A5 | validateBeat + red banner = dead code; empty required fields ship silently | 🔴 | S |
| A6 | Portrait "Browse Existing Assets" writes `visual.defaultImage` (wrong field) | 🔴 | S |
| A7 | Background upload `accept=.jpg,.jpeg` contradicts the any-image filter (2 sites) | 🟠 | S |
| A8 | BeatSuggestions points keyless users at "Settings" — which has no AI tab | 🟠 | S |
| A9 | Fictional context-menu accelerators (⌘D/⌘C/⌘V/⌫ printed, none bound) | 🟠 | S |
| A10 | Dead DialogTreeEditor Conditions/Effects toggles (until #B1 fills them) | 🟠 | S |
| A11 | Variable dropdowns: used-in-story union missing from ChoiceEffects/DialogTree paths | 🟠 | S |
| A12 | Search misses `prompt`/`question`/`choices[].text`/`cancelButtonText`; replace silently skips non-beat matches | 🟠 | M |

### 4.B Quick wins (small, no design debate)

Graph shortcuts (the menu's promises) + palette type-ahead add ·
persist showAdvanced/workspace tab/settings tab/debug tab/library sort ·
window bounds → app-settings.json · commit box autoFocus + ⌘⏎ · rebind
Transformations off dead ⌘⇧K, fix 2 stale tooltips · ⌘, + menu items
for Settings/Debug/Characters · maxRecentProjects 5→12 · HIGHLIGHT_BEAT
→ select+center · preview path-state survives edits (digest-keyed) ·
drop MIN_DISPLAY_TIME + keep panel open · seed StoryGenerator from
globalSettings.ai · KeyboardShortcutsModal imported with TRUE table,
bound to `?` · delete the 12 dead surfaces · template shelf above
create row · "Add Cluster" demoted · Save button = ⌘S unified.

### 4.C Restructure proposals (design work; mockups → decision sheet)

| # | Proposal | Resolves |
|---|---|---|
| B1 | **"Show only if…" per-choice conditions UI** (reuse RequirementsEditor rows) + inventory/variable/counter templates | The #1 authoring gap |
| B2 | **Disclosure = persisted global tier + schema ui.tier**; Effects → basic | §3.1 |
| B3 | **Three-scope settings** (Story Settings ⌘, / App Preferences / author prefs); canonical GlobalSettings type; export-affecting device toggles → project | §3.2, §1.2 |
| B4 | **Alert/confirm elimination** per §3.6 routing table (lint-enforced) | ~45/hr → ~2/hr |
| B5 | **Untitled-state visibility**: canvas affordance "not saved yet — name it", replacing the exception-string chip; empty-state for blank canvas; both Empty doors behave identically (seed + name) | §2.1 findings 1-3 |
| B6 | **Export menu rewrite** (share language, Single File default) + backup badge pointing at the same, now-honest item | §2.2 |
| B7 | **One asset system**: single picker, Background Image beside Background Sound, one accept-rule | §2.2, §3.5 |
| B8 | **Preview novice face**: debug rail off by default w/ labeled toggle; plain open ≠ start-from-beat; "Start as if…" labeling; editable state values (setters exist) | The debug-legibility flagship |
| B9 | **VCS opt-in**: no git vocabulary (or "not found" warnings) until the author asks; reframe as "Track versions" | §2.2 finding 8 |
| B10 | **One bulk-edit surface** (Search & Replace ⊂ Transformations), shared field list with SearchService | §2.3 |
| B11 | **Character naming + editor tiering** (Name/Display Name; Basic tab leads with name+portrait, not ID prose; stat-machine tabs behind tier) | §2.2 step 2 |
| B12 | **Rename-character referential integrity** (link speaker fields by id, or transactional rename via the existing relink machinery) | §2.3 worst bulk story |

### 4.D Decisions for Hartmut (genuinely open)

1. **Preview auto-attach**: keep click-beat-arms-preview for everyone
   (fix = labeling only) or plain-open-plays-from-start (novice default,
   arming stays via selection while open)? B8 assumes the latter.
2. **Beat-delete confirm**: remove entirely (undo + toast) vs keep only
   when inbound links break? §3.6 proposes the latter.
3. **Advanced tier default for NEW installs**: off (novice-first) with
   a first-run "show everything" prompt, or on?
4. **Search/Transformations merge** (B10): one surface or two with a
   shared engine? Merge is cleaner but changes a learned ⌘F habit.
5. **VCS opt-in trigger** (B9): Preferences flag, first-save question,
   or visible-but-quiet "Track versions" affordance?
6. **StoryPreview deletion** (~1200 lines): confirm no planned use
   before the dead-surface sweep removes it.

### 4.E Sequencing recommendation

1. **4.A bugs** (A1-A3 first: data loss) — releasable alone.
2. **4.B quick wins** — one release, huge felt improvement, zero
   design risk.
3. **B1 + B8** — the two flagship authoring gaps (conditions UI, debug
   legibility), each its own release.
4. **B2-B4** (tier system, settings scopes, dialog elimination) — the
   structural 1.0 work.
5. Remaining B-items ride subsequent releases; B12 pairs with the
   character-arc work already planned.
