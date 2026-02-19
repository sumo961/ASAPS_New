# ASAPS Modern - Advanced Stories Authoring and Presentation System

A modern TypeScript implementation of the Advanced Stories Authoring and Presentation System (ASAPS) by Hartmut Koenitz, based on his original ActionScript version (2005-2017) started at Georgia Tech. This modernization brings the powerful ASML (Advanced Stories Markup Language, also created by Hartmut Koenitz) XML-based narrative system to the web with enhanced features, a visual story builder, and AI-assisted content generation.

![ASAPS Modern Screenshot](assets/screenshot.png)

## 📖 Documentation

For a comprehensive guide to using ASAPS Modern, including conceptual foundations, interface walkthrough, and beat reference, see the **[User Guide](docs/USER_GUIDE.md)**.

The User Guide covers:
- **Conceptual Framework**: Understanding interactive narratives and ASAPS philosophy
- **Interface Overview**: Workspace layout, graph editor, and inspector panels
- **Beat Types Reference**: Complete documentation of all 14+ beat types
- **Preview Mode**: Testing stories with path-based presets and state simulation
- **AI Integration**: Configuring AI providers for dynamic content generation
- **Tips & Best Practices**: Workflow recommendations for efficient story creation

## ⚠️ Development Status (v0.9.22)

This is a **beta release**. Core functionality works, but some features are incomplete or untested:

| Feature | Status |
|---------|--------|
| **Project Switch Fix** | **v0.9.22**: Clear UI state on project switch to prevent cross-project beat leakage |
| **Advisory Editing Locks** | **v0.9.22**: Beat-level editing locks for Git collaboration — purple canvas indicators + Inspector warnings |
| **EndScreen Variables** | **v0.9.22**: `${variable}` interpolation now works in EndScreen button text |
| **MovementChoice/PickProp** | **v0.9.22**: Question text now appears correctly in the Visual Editor |
| **Mobile Font Scaling** | **v0.9.21**: Font scaling decoupled from cover mode — readable text on mobile without edge cropping |
| **Native Mobile Mode** | **v0.9.21**: New option for projects designed at mobile dimensions — disables all mobile adaptations |
| **Mobile Renderer** | **v0.9.21**: Improved mobile-responsive rendering for HUD overlays, inventory, meters, and dialogs |
| **Translation + Undo Fix** | **v0.9.20**: Undo no longer overwrites translations when a translation language is active |
| **Undo/Redo** | **v0.9.19**: All beat operations (edit, add, delete, move) now support Ctrl+Z / Cmd+Z undo/redo |
| **History Panel** | **v0.9.19**: Clickable history dropdown in toolbar — view, jump to, and clear command history |
| **Translation Persistence** | **v0.9.18**: Translations load on startup, survive push/pull, VCS-aware with staleness detection |
| **Multi-Language AI** | **v0.9.18**: AI can generate stories in multiple languages with translation output |
| **Windows Fixes** | **v0.9.18**: EPERM home dir fix, single-instance lock, translation loading on startup |
| **Build Numbering** | **v0.9.18**: CI-driven build numbers for version tracking (v0.9.18.{build}) |
| **Windows Git VCS Fix** | **FIX in v0.9.17**: Git version control now works on Windows (path separators, auto-detect git.exe) |
| **Stability Fixes** | **FIX in v0.9.17**: Cluster crash, VCS double-init, asset loading, UI reset, re-render reduction |
| **AI Prompt Sync** | **v0.9.18**: Internal and MCP prompts fully synchronized with translation support |
| **Test Coverage** | **v0.9.18**: 148 new tests (122 from v0.9.17 + 26 for translation wiring, expandPath, beat extraction) |
| **Fictional Time System** | In-story date/time tracking with set/advance/subtract, condition checking, and Timer HUD display (v0.9.15) |
| **Timer/Countdown HUD** | Timer HUD (countdown, fictional time, or narrative text) and Countdown Meter HUD overlays (v0.9.15) |
| **Recursive Dialog Trees** | `__self__` target for looping dialogs with per-choice visited tracking (v0.9.15) |
| **Keypad Beat** | Numeric keypad for phone, safe lock, PIN entry with code validation (v0.9.15) |
| **Visual Editor UX** | Multi-select, alignment/distribute tools, snap guides, element grouping (v0.9.15) |
| **Choice Effects** | Unified variable/counter/inventory effects on dialog and movement choices (v0.9.15) |
| **Git VCS Integration** | Full Git version control — commit, push, pull, branch, merge conflicts, clone repository (v0.9.14) |
| **AI Dialog Fix** | Fixed AIDialogTree generation across all players, updated OpenAI defaults to GPT-5.2 (v0.9.13) |
| **HTML Export** | Export stories as standalone HTML files with splash screen, counter HUD, and inventory icons (v0.9.12) |
| **Unified Rendering** | WYSIWYG alignment between visual editor and preview (v0.9.12) |
| **Independent Preview Window** | Preview in separate window with path-based presets and InputText value entry (v0.9.11) |
| **UI Tooltips** | Descriptive tooltips throughout app to help beginners (v0.9.11) |
| **Transformation Commands** | Bulk rename/delete/merge for characters, variables, beats (v0.9.9) |
| **AI Runtime Beats** | aiInfoText, aiDurScreen for dynamic AI-generated content during playback (v0.9.9) |
| **Text Variations** | Random text selection for Info Text and Duration Screen beats (v0.9.9) |
| **AI-Based Beats** | AI Summary, Online Content, AI Condition, AI Dialog Tree beats for dynamic content |
| Assets (graphics, sounds, sprite animations) | Fully implemented |
| Visual dialog editor | Supports all phases of dialog trees (v0.9.4) |
| Project switching | Fixed in v0.9.22 — UI state properly cleared on switch |
| Animation system | Fully implemented with visual path editor (v0.9.1) |
| Character meter frames | HUD overlays for counters (v0.9.2) |
| Chat-style dialog mode | New presentation modes for DialogTree (v0.9.3) |
| DialogTree Merge Tool | Auto-detection of mergeable beats, visual merge UI (v0.9.4) |
| Search & Replace | Project-wide search across beats, characters, assets (v0.9.4) |
| Twine Import | Import SugarCube and Harlowe stories with proper boolean handling (v0.9.6) |
| Beat Notes | Author annotations for beats (not shown to players) (v0.9.6) |
| Timer Progress Bar | Visual timer for default target delays (v0.9.6) |
| Visual Inventory System | Interactor-facing inventory display with configurable HUD overlay (v0.9.6) |
| Path Analysis | StateSimulationAnalyzer for accurate hub-and-spoke patterns (v0.9.10) |
| Cluster system (collapsible beat groups) | Implemented: collapsible flowchart clusters, folder view in sidebar, draggable beats in containers |
| Legacy ASML import | Improved in v0.9.0; older format files should now import correctly |

### 🌐 Multi-Language Translation (v0.9.18)

Create interactive narratives in multiple languages with both manual and AI-assisted translation:

- **AI-Generated Translations**: Tell the AI to generate a story in multiple languages (e.g., English + German + French) and it produces the full story with translations included
- **Manual Translation Workflow**: Add target languages, translate strings in the inspector, track completion per language
- **Staleness Detection**: When source text is edited, translations are automatically marked as stale with visual indicators on beats
- **VCS-Aware Persistence**: Translations survive git push/pull cycles, load on startup, and integrate with the version control panel
- **Beat-Level Indicators**: Amber triangle on beats with stale translations, alongside green/orange VCS change dots
- **Full Round-Trip**: Generate → edit → translate → save → reload → edit — translations persist across the entire workflow

### ⏱️ Timer HUD, Fictional Time & Countdown Meter (v0.9.15)

Persistent HUD overlays that display across all beats:

- **Timer HUD**: Auto-detects content — countdown timer, fictional time, manual text, or static text
- **Fictional Time**: Track in-story date/time (e.g. "4 April 1968, 9:00 AM") with set/advance/subtract operations and condition-based branching
- **Countdown Meter**: Counter-driven progress bar with warning/critical color thresholds
- **Per-beat control**: `timeDisplayMode` (fictionalTime / manual / none) on each beat
- **Configurable**: Position, colors, opacity, labels — all in the new Global Settings HUD tab

### 🔢 Keypad Beat (v0.9.15)

New beat type for numeric input interactions:

- **3 layouts**: Numeric, Phone, PIN — each with appropriate button labels
- **Code validation**: Set a correct code with max attempts and fail-target beat
- **Masked input**: Show dots for PIN entry, configurable digit display
- **Full editor support**: Interactive keypad in both visual editor and preview

### 🎨 Visual Editor UX (v0.9.15)

Major usability improvements to the visual beat editor:

- **Multi-select**: Shift+click or rubber-band selection, alignment and distribute tools
- **Snap guides**: Smart alignment guides when dragging elements
- **Element grouping**: Group elements that move together
- **Choice effects**: Set variables, counters, and inventory directly from dialog/movement choices

### 🔀 Git Version Control (v0.9.14)

Collaborative story authoring with built-in Git support in the desktop app:

- **VCS panel**: View pending changes, commit history, and branch info in the sidebar
- **Full Git workflow**: Commit, push, pull, branch, and merge — all from within the app
- **Clone Repository**: Clone a remote repo directly from the File menu
- **Merge conflict resolution**: Detect and resolve conflicts with guided UI
- **Directory format**: Projects saved as individual JSON files for clean diffs

### 📦 HTML Export (v0.9.12)

Export your stories as self-contained HTML files that run anywhere:

- **Splash screen**: Professional loading experience
- **Counter HUD**: Visual display of counters/stats during gameplay
- **Inventory icons**: Visual inventory system with item icons
- **Tailwind CSS**: Modern styling that works across browsers
- **Zero dependencies**: Single HTML file runs offline in any browser

**Note**: AI-based beats (aiInfoText, aiDurScreen, aiSummary, aiCondition) are not yet supported in HTML export. aiDialogTree now works in the web player (v0.9.13). Stories using unsupported AI beats will show fallback text instead.

### 🖥️ Independent Preview Window (v0.9.11)

The preview system has been completely redesigned:

- **Separate window**: Preview now opens in its own dedicated window for side-by-side editing and testing
- **Path-based presets**: Automatically analyzes all paths to a beat and generates state presets
- **InputText value entry**: Enter custom values when paths include inputText beats (instead of auto-generated placeholders)
- **Debug panel**: Real-time display of current beat, visited beats, variables, and counters
- **Keyboard shortcuts**: Space (pause/resume), Escape (stop), I (toggle inventory)

**UI Tooltips**: Descriptive tooltips throughout the app help beginners understand beat types, settings, and controls.

### 🚀 Productivity Features (v0.9.9)

**Transformation Commands** - Bulk operations for efficient story editing:
- Rename/delete/merge characters, variables, and beats across entire story
- Deterministic parsing ensures reliable operation without AI hallucination

**Inventory Quantity Functions** - Enhanced inventory system:
- `getInventoryQuantity(item)`, `setInventoryQuantity(item, n)`, `addInventoryQuantity(item, n)`, `removeInventoryQuantity(item, n)`
- Use in conditions or arithmetic operations

**Text Variations** - Random text selection for replay value:
- Add multiple text variations to Info Text and Duration Screen beats
- One randomly selected at runtime for narrative variety

### 🤖 AI-Based Beats (v0.9.8+)

AI beats enable dynamic, personalized story experiences that respond to player choices in real-time:

- **AI Info Text**: AI-generated contextual text with Continue button (v0.9.9)
- **AI Duration Screen**: AI-generated text with auto-advance based on reading speed (v0.9.9)
- **AI Summary Beat**: Generates a narrative summary of the player's journey at story end
- **Online Content Beat**: Fetches and displays real-time information from the web (weather, news, facts)
- **AI Condition Beat**: Uses AI to evaluate complex conditions based on story context
- **AI Dialog Tree Beat**: Dynamically generates dialog choices and responses

**AI Provider Recommendations**:
| Use Case | Recommended Models |
|----------|-------------------|
| AI beats during playback | **Gemma 3 4B** via Ollama (fast, local, capable) |
| Story generation | **Claude**, **GPT**, or **Kimi K2** (superior creative writing) |

Configure AI providers in **Settings → AI Configuration**. Local models via Ollama are recommended for playback to ensure fast response times.

## 🎯 Features

- **Multi-Language Translation**: Create interactive narratives in multiple languages with manual and AI-assisted translation support — including staleness detection, VCS-aware persistence, and full round-trip editing
- **Visual Story Builder**: Drag-and-drop interface for creating interactive narratives
- **Graph-based Story Editor**: See your entire story structure at a glance
- **Multiple Beat Types**: 14+ different beat types for varied storytelling
- **AI-Assisted Generation**: Generate complete stories from prompts with multi-language output — both within the app and via MCP server
- **Backward Compatible**: Full support for legacy ASML story files
- **Modern Rendering**: Canvas and React-based rendering engines
- **Real-time Preview**: Test your stories as you build them
- **Export/Import**: Work with standard ASML XML files
- **MCP Server Integration**: Model Context Protocol support for AI tool integration

## 📥 Releases

Pre-built desktop applications are available for macOS and Windows on the [GitHub Releases page](https://github.com/sumo961/ASAPS_New/releases).

Each release includes:
- **macOS**: Universal binary (.dmg) supporting both Intel and Apple Silicon
- **Windows**: Installer (.exe) and portable version

Download the latest release to get started without building from source.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ (22+ recommended for Electron desktop builds)
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/sumo961/ASAPS_New.git
cd ASAPS_New

# Install dependencies (automatically builds core packages)
npm install

# Start the development server
npm run dev
```

The builder will open at `http://localhost:5173`

> **Note**: The `npm install` command automatically builds the required `@asaps/core` and `@asaps/renderer` packages. This may take a minute on first install.

### Troubleshooting

**Missing packages error** (`Cannot find package '@asaps/core'` or `Failed to resolve entry for package "@asaps/core"`):
```bash
npm run build:deps
npm run dev
```
This manually builds the core dependencies, then starts the dev server.

**Windows Users**: The project fully supports Windows. If you encounter build issues after a fresh clone:
```bash
npm run build:deps
npm run dev
```

For a complete reset:
```powershell
# PowerShell
Remove-Item -Recurse -Force node_modules
npm install
npm run dev
```

## 📦 Project Structure

```
asaps-modern/
├── packages/
│   ├── core/          # Core story engine and beat system
│   ├── builder/       # React-based visual story builder
│   └── renderer/      # Rendering engines (Canvas & React)
├── mcp-server/        # MCP server for AI assistant integration
├── mcp-server-desktop/ # MCP server for desktop AI assistants
└── beat-definitions/  # JSON beat type definitions
```

## 🎮 Usage

### Creating a Story

1. **Start with the Title Screen**: Every story begins with a title screen beat
2. **Add Beats**: Drag beat types from the palette onto the canvas
3. **Connect Beats**: Draw connections between beats to create story flow
4. **Configure Properties**: Select beats to edit their properties in the inspector
5. **Test Your Story**: Use the preview mode to play through your narrative
6. **Export**: Save your story as an ASML file

### Beat Types

#### Visible Beats
- **Title Screen**: Opening screen with title and author
- **Info Text**: Display text with continue button
- **Dialog Tree**: Complex branching conversations
- **Movement Choice**: Location-based navigation
- **Pick Prop**: Interactive object selection
- **Video Beat**: Video playback with optional controls
- **Duration Screen**: Timed display screen
- **Hyper Text**: Clickable hyperlinked text with multiple targets
- **Input Text**: User text input with validation
- **End Screen**: Story conclusion with restart option

#### Logic Beats (Invisible)
- **Set Variable**: Modify story variables and counters
- **Condition Beat**: Conditional branching logic
- **Random Target**: Randomly select next beat
- **Set Timer**: Named timers with timeout targets
- **Add/Remove Inventory**: Manage character inventories

## 🔄 Importing Legacy Stories

The system fully supports legacy ASML files with automatic migration:

```javascript
// Legacy conversationChoice beats are automatically converted to dialogTree
// SWFBeat (Flash) content is converted to videoBeat
// All deprecated attributes are handled gracefully
```

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start builder dev server
npm run dev:all         # Start all packages in dev mode

# Building
npm run build           # Build all packages
npm run build:core      # Build core package only
npm run build:builder   # Build builder only

# Testing
npm run test            # Run all tests
npm run lint            # Lint all packages
npm run format          # Format code with Prettier

# Utilities
npm run clean           # Clean all build artifacts
```

### Creating Custom Beat Types

1. Create a new beat class extending `Beat`:

```typescript
import { Beat } from '@asaps/core';

export class CustomBeat extends Beat {
  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Your beat logic here
    return this.getNextBeat(context);
  }
}
```

2. Register it in the BeatTypeRegistry:

```typescript
registry.registerBeatType('customBeat', CustomBeat);
```

3. Add beat definition to `beat-definitions/core-beats.json`

## 📖 ASML File Format

ASML (Advanced Stories Markup Language) is an XML-based format for defining interactive narratives:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<story title="Story Title" author="Author Name">
  <settings>
    <!-- Configuration -->
  </settings>
  <environment>
    <!-- Props and backgrounds -->
  </environment>
  <characters>
    <!-- Character definitions -->
  </characters>
  <plot>
    <beat>
      <id id="0" name="Beat Name" />
      <function kind="beatType" />
      <connection target="1" />
    </beat>
    <!-- More beats -->
  </plot>
</story>
```

## 🎨 Architecture

The system uses a modular architecture with three main packages:

### Core Package
- **Beat System**: Template method pattern for beat execution
- **Story Engine**: Event-driven story progression
- **XML Processing**: ASML parsing and generation
- **State Management**: Immutable story context

### Builder Package
- **React 18**: Modern UI framework
- **ReactFlow**: Graph visualization
- **Zustand**: State management
- **Tailwind CSS**: Styling

### Renderer Package
- **WebRenderer**: Canvas-based rendering
- **ReactRenderer**: Component-based rendering
- **BaseRenderer**: Shared rendering logic

## 🤖 AI Integration

ASAPS Modern includes AI-powered features to assist with story creation:

### AI-Assisted Content Generation
- **Complete Story Generation**: Create entire interactive stories from prompts, both within the ASAPS builder UI and via MCP server
- **Dialog Tree Generation**: Automatically generate branching conversations based on scene descriptions and character contexts
- **Story Content Suggestions**: Get AI-powered suggestions for story progression
- **Multiple AI Provider Support**: Works with OpenAI, Anthropic Claude, and other LLM providers

### MCP Server
The project includes an MCP (Model Context Protocol) server that enables AI assistants to:
- Create complete stories from scratch with full beat structures
- Read and analyze story structures
- Generate and modify beats
- Create dialog trees with proper branching logic
- Export stories in ASML format

To use the MCP server, configure it in your AI assistant's MCP settings pointing to `mcp-server/`.

## 📋 Version History

### v0.9.18 (2026-02-17)
- **Multi-Language Interactive Narratives**: Support for manual and AI-based translations to create multi-language interactive narratives
  - AI can generate complete stories in multiple languages (e.g., "Create a mystery in English, German, and French")
  - Translation persistence: load on startup, survive git push/pull, persist across sessions
  - Staleness detection: source edits automatically flag affected translations
  - Internal and MCP AI prompts fully synchronized with translation key format documentation
- **Windows Fixes**: EPERM home directory resolution, single-instance lock (no duplicate windows), translation loading on startup
- **CI Build Numbering**: Automatic build number tracking for version identification (v0.9.18.{build})
- **26 New Tests**: expandPath async resolution, extractBeatSourceStrings for all beat types, DirectoryAdapter translation wiring

### v0.9.10 (2026-01-26)
- **Improved Path Analysis**: New StateSimulationAnalyzer for accurate hub-and-spoke story patterns
  - Simulates actual gameplay with full state tracking
  - Correctly handles patterns where players visit multiple locations in any order
  - Finds all valid orderings (e.g., 24 orderings × 4 endings = 96 paths)
  - Properly highlights condition-gated beats (e.g., `beat_incomplete`)
- **ASML Fix**: Parse `<connection>` elements within titleScreen beats

### v0.9.9 (2026-01-25)
- **Transformation Commands**: Bulk rename/delete/merge operations for characters, variables, and beats
  - Deterministic sentence-based parsing for reliable operation
  - Full undo support for all transformation commands
- **Inventory Quantity Functions**: Enhanced inventory with quantity tracking
  - `getInventoryQuantity`, `setInventoryQuantity`, `addInventoryQuantity`, `removeInventoryQuantity`
  - Use in conditions and arithmetic expressions
- **Text Variations**: Random text selection for Info Text and Duration Screen beats
  - Add multiple text variations that combine with main text
  - One randomly selected at runtime for narrative variety
- **AI Info Text Beat**: AI-generated contextual text with Continue button
  - Personalized narrative that adapts to player state
  - Response caching based on context hash
- **AI Duration Screen Beat**: AI-generated text with auto-advance
  - Calculates display time based on reading speed (words per minute)
  - Configurable min/max duration bounds
- **Beat Rename**: introText → infoText (automatic migration for existing projects)
- **Documentation**: Comprehensive USER_GUIDE.md replaces tutorial folder

### v0.9.7 (2026-01-16)
- **AI Provider Improvements**: Fixed external AI providers (OpenAI, Claude, Kimi) in desktop app
  - Proxy now works for default OpenAI endpoint (not just custom URLs)
  - Added default base URLs for OpenAI and Claude APIs
  - GPT-5 reasoning models: increased token limit to 32000 for output
  - Added 5-minute timeout for slow AI responses
- **MCP Integration Toggle**: New app settings option to enable/disable MCP WebSocket
  - Disabled by default to reduce console noise
  - Access via app menu (macOS) or Settings menu (Windows/Linux)
  - Setting persists across app restarts
- **Ren'Py Theme Import (Initial)**: Early support for importing Ren'Py visual novel themes
  - Parse gui.rpy for colors, fonts, and textbox positioning
  - Extract and apply textbox.png frame graphics
  - Map Ren'Py color variables to ASAPS theme system
- **AI Config Dialog**: Fixed scrolling on smaller screens
- **Example Stories**: Removed from git tracking (will be re-added with project storage integration)

### v0.9.6 (2026-01-13)
- **Visual Inventory System**: Implemented interactor-facing inventory display with configurable HUD overlay
  - Grid layout with item icons, names, and quantity badges
  - Configurable positioning (dock to character or screen anchor)
  - Style options: background, border, opacity, item size
- **Beat Notes**: Author annotations for any beat (not shown to players)
  - Collapsible section at bottom of Inspector
  - Persists with beat and exports to ASML
- **Timer Progress Bar**: Visual progress indicator for default target delays
  - Horizontal bar at top of preview stage
  - Color gradient from green to red as time expires
- **Twine Import Fixes**: Critical bug fixes for variable handling
  - Fixed boolean type consistency between set and check operations
  - Fixed empty parameters in additional beats (ConditionBeat)
  - Fixed boolean `false` display in SetVariable inspector
- **ConditionBeat Cleanup**: Removed deprecated `left`/`right` properties (use `variableName`/`value`)
- **Test Coverage**: Added comprehensive tests for ConditionBeat, SetVariableBeat, SetTimerBeat, AddRemoveInventoryBeat, MovementChoiceBeat, RandomTargetBeat, StoryContext, BackwardAnalyzer

### v0.9.5 (2026-01-12)
- **Twine Import**: Import interactive fiction stories from Twine (SugarCube 2.x and Harlowe 3.x formats)
  - Automatic beat type classification from passage analysis
  - Variable conversion from Twine `$var` to ASAPS `$var$` format
  - Conditional branching support with ConditionBeat conversion
  - Link position detection (inline vs. end-of-passage choices)
- **AI Documentation**: Enhanced MCP server documentation for better story generation
  - Animation system overview, expanded beat type descriptions
  - DialogTree presentation modes, visited beat tracking
- **Bug fixes**: Fixed Twine import project naming, paused auto-save during preview

### v0.9.4 (2026-01-10)
- **DialogTree Merge Tool**: New tool to consolidate multiple DialogTree beats into nested conversations
  - Auto-detection of mergeable beat groups (DialogTree→DialogTree with single incoming links)
  - Suggested merges displayed in purple-highlighted section
  - Manual selection with drag-to-reorder and live preview
  - Visual Editor properly updates after merge with correct phases
- **Project-wide Search & Replace**: Find and replace text across all story content
  - Search options: case-sensitive, whole word, regex
  - Scope toggles: beats, characters, assets, metadata
  - Results with context highlighting, click to navigate
- **Chat dialog mode fix**: Fixed subsequent NPC messages not appearing after player choices
- **Visual Editor improvements**: Beat version tracking for reliable UI updates, improved button autosizing

### v0.9.3 (2026-01-09)
- **Bug fixes and stability improvements**:
  - Fixed cluster naming modal not appearing in Electron app (replaced `prompt()` with custom modal)
  - Fixed MovementChoice/PickProp targets not being added when set after initial beat creation
  - Fixed backgrounds persisting between beats (centralized background clearing in Beat.execute)
  - Fixed chat dialog mode not showing NPC text after first message (proper chat history management)
- **Centralized background handling**: Background state now managed in base Beat class, eliminating redundant code in individual beats
- **Chat mode improvements**: Added `clearChatHistory` to IRenderer interface for proper message reset between dialogs

### v0.9.2 (2026-01-07)
- **Character meter frame HUD**: Configurable overlay for displaying character counters (health, energy, etc.) as visual bars
- **Meter frame docking**: Dock to character (8 anchor positions) or fixed to screen corners
- **Meter frame styling**: Background, border, opacity, meter dimensions, and label visibility options
- **Simplified counter display**: All visible counters auto-appear when meter frame is enabled
- **Character image fix**: Fixed character images not showing in Character Manager grid/list view

### v0.9.1 (2026-01-05)
- **Path animation system**: Complete implementation for moving elements along curves during playback
- **Visual animation editor**: PathCanvas with actual element rendering, bezier curve editing
- **Waypoint controls**: Duration, easing, scale, rotation, opacity, flip H/V per waypoint
- **Animation playback**: RequestAnimationFrame-based engine with play/pause/stop/seek
- **Transform interpolation**: Smooth interpolation of all transform properties along paths

### v0.9.0 (2024-12-29)
- **Unified Import/Export menus**: Dropdown menus in header consolidating all import/export options, including new "Export ASML with Assets" option that creates a ZIP with organized asset folders
- **Enhanced beat selection**: Cyan highlighting for selected beats (distinct from path analysis highlighting), auto-center and zoom (80%) when selecting beats in flowchart
- **Visual editor resize handles**: Corner resize handles for elements in the visual editor, allowing direct drag-to-resize
- **Project Library improvements**: Select All checkbox in list view, individual checkboxes always visible in list view for quick multi-select
- **Auto-save fix**: Empty default projects (only title/intro/end beats) no longer auto-saved, reducing clutter
- **Cluster beat collision detection**: Beats inside clusters are properly spaced during auto-arrange to prevent overlapping
- **Legacy ASML import fixes**: globalTimer beats now correctly mapped to setTimer, timer values auto-converted from milliseconds to seconds, endScreen title/button elements properly parsed
- **Button sound completion**: Button sounds now play completely before transitioning to the next beat

### v0.8.9 (2024-12-24)
- **Theme system**: Comprehensive theme management with built-in presets (Visual Novel, Text Adventure, Point & Click), custom theme creation, and theme inheritance
- **Built-in theme presets**: Three professionally designed themes matching popular interactive fiction styles
- **Theme UI**: Theme selector dropdown in Global Settings, "Save as Theme" button, modified indicator
- **Hotspot visibility controls**: New settings for hotspot opacity, show/hide hotspots, show/hide labels, and preview mode visibility (visible, on hover, invisible)
- **Per-element hotspot overrides**: Individual hotspots can override global visibility settings
- **Custom tooltips**: Themed tooltips replace browser native tooltips with immediate display
- **Typewriter text animation**: True character-by-character text reveal with stable positioning (no text shifting)
- **Sequential title animation**: Title animates first, then author, with configurable speed
- **Database upgrade**: IndexedDB v3 with theme storage (themes, theme-assets, theme-asset-metadata stores)

### v0.8.8 (2024-12-12)
- **Preview zoom controls**: Add zoom in/out buttons, percentage indicator, and "Fit" button for auto-scale to window
- **Preview scaling**: Stage automatically scales to fit dialog window while maintaining aspect ratio
- **Default theme change**: New projects now use a light blue background (#87CEEB) with white text boxes and black text instead of dark theme
- **Theme settings applied before preview**: Global settings (colors, backgrounds) are now applied before preview starts
- **Self-contained stories**: Environment.nodes populated from builder assets for standalone story support
- **ReactRenderer refactoring**: Simplified and cleaned up rendering code

### v0.8.7 (2025-12-11)
- **Cluster background images**: Add optional floorplan/map images to clusters with independent scale and opacity
- **Cluster map UI**: Popover controls for selecting, scaling, and adjusting opacity of cluster background images
- **ASML cluster map support**: Serialize mapScale and mapOpacity attributes for cluster background images
- **Beat positions persistence**: Fix beat positions within clusters not saving after project reload
- **Beat renaming fix**: Fix beat name changes not persisting (name field now triggers immediate update)
- **Flowchart stability**: Fix flowchart becoming empty after closing Asset Manager (ref pattern fix)
- **Type consistency**: Fix containerBeatPositions fallback from object to array format

### v0.8.6 (2025-12-10)
- **Enhanced cluster system**: Clusters are containers to help organize projects into sections (e.g., "In the House", "In the Forest"). They appear as collapsible mini-flowcharts in the main graph and as folders in the sidebar.
- **Cluster UI controls**: Mini-flowchart view with zoom controls, fit view, and auto-arrange buttons
- **Cluster internal connections**: Visual connections between beats inside clusters with proper handle alignment
- **Cluster external connections**: Visual indicators for connections entering/leaving clusters
- **Edge routing around clusters**: Returning connections automatically route above or below clusters instead of through them
- **Cluster drag improvements**: Fix beat drag constraints allowing positioning at cluster top edge
- **Cluster resize fix**: Fix resize jump issue when starting to drag cluster viewport
- **Sidebar cluster folders**: Collapsible folder view showing beats organized by cluster
- **Drag beats to clusters**: Drag beats from sidebar into cluster folders or expanded cluster viewports
- **AI cluster awareness**: AI story generation (both internal and MCP) now understands clusters and can organize stories into sections

### v0.8.5 (2025-12-09)
- **Auto-layout**: Add auto-layout button for automatic flowchart arrangement
- **Tree layout algorithm**: Improved Reingold-Tilford layout with external connections support
- **Test suites**: Comprehensive test coverage for MCP servers and AI functions
- **Bulk delete**: Add bulk delete for projects in project modal
- **Local LLM support**: Add Ollama/Local LLM preset option to AI configuration
- **MCP connection fixes**: Fix dialogTree connections not being extracted from MCP-injected stories
- **AI validation**: Improved AI story validation and debug tools
- **Fresh clone fixes**: Fix build issues on fresh clone (generate-beat-types.ts now tracked)
- **UI improvements**: Various UI fixes and empty project handling
- **ConditionBeat fix**: Fix counter conditions not exporting/validating correctly (variableName/value fields)
- **setVariable AI prompts**: Clarify that setVariable beats can only modify one variable per beat (prevents AI misgeneration)

### v0.8.0 (2025-12-07)
- Initial beta release
- Visual story builder with drag-and-drop interface
- Graph-based story editor with ReactFlow
- 14+ beat types for interactive narratives
- AI-assisted content generation (OpenAI, Anthropic)
- MCP server integration for AI assistants
- ASML XML import/export
- Legacy ASML file support with automatic migration

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

**Free for non-commercial use** - personal projects, research, education, and non-profit organizations.

**Commercial use requires a separate license** - contact for commercial licensing inquiries.

## 🙏 Acknowledgments

- Advanced Stories Group at Georgia Tech
- Dr. Janet Murray for supervision and guidance of the initial project
- All the students using the original ASAPS 2005-2017
- The [COST Action 18230](https://indcor.eu) and the [ARDIN](https://ardin.online) community for continued inspiration
- Made with the help of [Claude](https://claude.ai) and [Kimi](https://kimi.moonshot.cn)

## 📞 Support

For questions and support:
- [Open an issue](https://github.com/sumo961/ASAPS_New/issues) for bug reports

---

Built with ❤️ for interactive storytelling
