# ASAPS Modern - Progress Log

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
