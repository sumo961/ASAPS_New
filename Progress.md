# ASAPS Modern - Progress Log

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
