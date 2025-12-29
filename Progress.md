# ASAPS Modern - Progress Log

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

## Previous Updates

(Add previous progress entries here as needed)
