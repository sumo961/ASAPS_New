# ASAPS Modern - Progress Log

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
