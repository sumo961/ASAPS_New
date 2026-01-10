# ASPAS Modern - Advanced Story Authoring and Presentation System

A modern TypeScript implementation of the Advanced Stories Authoring and Presentation System (ASPAS) by Hartmut Koenitz, based on his original ActionScript version (2005-2017) started at Georgia Tech. This modernization brings the powerful ASML (Advanced Stories Markup Language, also created by Hartmut Koenitz) XML-based narrative system to the web with enhanced features, a visual story builder, and AI-assisted content generation.

![ASPAS Modern Screenshot](assets/screenshot.png)

## ⚠️ Development Status (v0.9.4)

This is a **beta release**. Core functionality works, but some features are incomplete or untested:

| Feature | Status |
|---------|--------|
| Assets (graphics, sounds, sprite animations) | Mostly implemented, not fully tested |
| Visual dialog editor | Only supports initial phase of dialog trees |
| Project switching | Occasional issues; reload interface to resolve |
| Animation system | Fully implemented with visual path editor (v0.9.1) |
| Character meter frames | HUD overlays for counters (v0.9.2) |
| Chat-style dialog mode | New presentation modes for DialogTree (v0.9.3) |
| DialogTree Merge Tool | Auto-detection of mergeable beats, visual merge UI (v0.9.4) |
| Search & Replace | Project-wide search across beats, characters, assets (v0.9.4) |
| Cluster system (collapsible beat groups) | Implemented: collapsible flowchart clusters, folder view in sidebar, draggable beats in containers |
| Legacy ASML import | Improved in v0.9.0; older format files should now import correctly |

## 🎯 Features

- **Visual Story Builder**: Drag-and-drop interface for creating interactive narratives
- **Graph-based Story Editor**: See your entire story structure at a glance
- **Multiple Beat Types**: 14+ different beat types for varied storytelling
- **Backward Compatible**: Full support for legacy ASML story files
- **Modern Rendering**: Canvas and React-based rendering engines
- **Real-time Preview**: Test your stories as you build them
- **Export/Import**: Work with standard ASML XML files
- **AI-Assisted Generation**: Generate dialog trees and story content with AI
- **MCP Server Integration**: Model Context Protocol support for AI tool integration

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm 7+

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
- **Intro Text**: Display text with continue button
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

ASPAS Modern includes AI-powered features to assist with story creation:

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
