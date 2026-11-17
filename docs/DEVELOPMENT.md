# Developing ASAPS

How to build ASAPS from source, how the code is organised, and how the AI and MCP parts fit together. For using ASAPS, see the [User Guide](USER_GUIDE.md); for the project's front page, the [README](../README.md).

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
│   ├── core/          # Story engine, beat system, ASML XML, analyzers
│   ├── builder/       # React-based visual story builder (the main app)
│   ├── renderer/      # Rendering engines (Canvas + React)
│   ├── player/        # Standalone player runtime
│   └── player-web/    # Browser bundle of the player (for HTML exports)
├── apps/
│   └── builder-desktop/  # Electron wrapper for the builder
├── mcp-server-desktop/  # MCP server (stdio) for Claude Desktop / Claude Code
├── beat-definitions/  # JSON schema for all beat types (single source of truth)
└── docs/              # User Guide and reference documentation
```

## 🎮 Usage

### Creating a Story

1. **Start from the starter story or a template**: a new project opens with a title screen, one text beat and an ending
2. **Add beats**: drag beat types from the palette onto the flowchart
3. **Link beats**: drag from a beat's dot onto another beat
4. **Edit**: select a beat to change what it says in Properties, and how it looks in the Visual Editor
5. **Test**: click Preview and play it through
6. **Share**: Export ▸ Web page (HTML), or a project file (`.asaps`) for someone else to open

### Beat Types

36 beat types, defined in [`beat-definitions/core-beats.json`](../beat-definitions/core-beats.json). The [User Guide](USER_GUIDE.md) describes each one.

- **Screens and choices:** Title Screen, Info Text, Explanation, Multi Choice, Dialog Tree, Choose Your Character, Free Layout, Movement Choice, Pick Prop, Hyper Text, Duration Screen, End Screen
- **Media and input:** Video Beat, 360° Panorama, Input Text, Input Image, Keypad, QR Scan, AR Scene, Web View
- **Location:** GPS Location, Indoor Location, Set GPS Location
- **Logic (invisible):** Set Variable/Counter, Condition Check, Random Target, Set Timer, Inventory Management, Update Affect
- **AI at play time:** AI Info Text, AI Duration Screen, AI Dialog Tree, AI Conversation, AI Condition, AI Summary, Online Content

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

ASML (Advanced Stories Markup Language) describes an interactive narrative. **ASML 2.0**, the format ASAPS uses today, is JSON kept inside a `.asaps` project file (a zip with the story and its assets). **ASML 1.0**, the original XML format, can be imported; exporting it is kept for older tools and is no longer extended. An ASML 1.0 story looks like this:

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

Modular monorepo (npm workspaces) with the runtime engine, builder UI, and renderers cleanly separated. The builder imports from compiled `dist/` folders of the other packages — see [CLAUDE.md](../CLAUDE.md) for the rebuild rules.

### Core Package (`@asaps/core`)
- **Beat System**: Template method pattern; beats extend a base `Beat` class with `performAction`, `getParameters`, `updateParameters`
- **Story Engine**: Event-driven progression with `StoryContext` holding mood/sentiments/emotions/traits/goals/variants/reflections plus baselines and bookmarks
- **Analyzers**: Reachability, PathTree, BackwardAnalyzer, ConstraintPathAnalyzer, StoryWarnings (soft-lock detection)
- **XML Processing**: ASML parsing and generation, with auto-migration for legacy beat shapes
- **Translation**: Per-string translation tracking with staleness detection
- **Persistence**: Save/load with full state round-trip including affect baselines and bookmarks

### Builder Package (`@asaps/builder`)
- **React 18 + TypeScript**: Modern strict-typed UI
- **ReactFlow**: Graph visualization for the story canvas
- **Zustand**: State management with command-pattern undo/redo
- **Tailwind CSS**: Styling
- **Vite**: Build tooling with HMR

### Renderer Package (`@asaps/renderer`)
- **ReactRenderer**: Primary in-app renderer (used by Preview Window and HTML exports)
- **WebRenderer**: Canvas-based renderer (legacy path, still functional)
- **BaseRenderer**: Shared rendering logic

### Desktop App (`apps/builder-desktop`)
- **Electron 40**: Chromium 144, Node 24, supported until June 2026
- **electron-builder**: Universal macOS DMG (Intel + Apple Silicon), Windows installer and (beta) Linux AppImage/.deb with auto-update via GitHub Releases

## 🤖 AI Integration

ASAPS Modern integrates LLMs at three levels: as a **co-author** (generating story structures and translations), as a **runtime engine** (powering AI beats during playback), and as an **external client** (driving the app via MCP).

### Co-Authoring (build-time)
- **Complete Story Generation**: Author entire stories from prompts, both inside the builder and via MCP server. Output respects the active translation language, declares `requires` annotations to avoid soft-locks, and follows project conventions (default beat types, restart edges, cluster organization)
- **Dialog Tree Generation**: Generate branching conversations from a scene description and character context
- **Beat Suggestions**: Mid-story AI assistance to extend or rewrite a section
- **Beat Creator**: Natural-language beat creation via a small command palette
- **AI Translation**: One-click full-story translation, or selective per-string translation
- **Verification Checklist**: AI generation prompts include a structural-integrity / reachability / connection-rules checklist so generated stories don't dead-end

### Runtime AI Beats (play-time)
Seven beat types call an LLM at playback. They share the same provider configuration, support **AI prefetching** (background generation while the player reads the previous beat — hides latency), and integrate with the character dossier system so generated content sees structured character state:
- `aiInfoText`, `aiDurScreen` — dynamically generated text/timed displays
- `aiCondition` — LLM-judged classification + branching
- `aiDialogTree` — generated branching dialogs with author routing plans
- `aiConversation` — real-time free-form chat with author-defined steering rules and exit transitions
- `aiSummary` — story retrospective generation for tier-specific endings
- `onlineContent` — web fetch into beat content

### Provider Support
- **OpenAI** (with web search enable for grounded generation)
- **Anthropic Claude** with extended-thinking budget controls (minimal…xhigh) and Max Tokens visibility
- **Kimi K2.5** (OpenAI-compatible, with reasoning model handling and 10-minute proxy timeouts)
- Any other **OpenAI-compatible** endpoint

### Voice (TTS / STT)
- **Cloud TTS**: OpenAI, ElevenLabs — streaming audio with per-speaker voice routing
- **Browser TTS**: Web Speech API for zero-config setup
- **Local TTS**: Self-hosted mlx-audio (Kokoro) for fully offline stories, no cloud dependency
- **Cloud STT**: OpenAI Whisper (for `aiConversation` voice input)
- **Local STT**: whisper.cpp, Vosk, or Web Speech API
- **HTML export embedding**: TTS works in standalone HTML exports with language-aware voice switching

### MCP Server
`mcp-server-desktop/` connects Claude Desktop or Claude Code to a running ASAPS
Builder over stdio. It needs **no API key**: the assistant you are already
talking to does the thinking, and the server supplies it with the live beat
schema and injects the result into the editor.

The tools it exposes:
- `asaps_get_beat_schema` — the complete, live beat schema, read from the
  running Builder rather than a copy, so it is never out of date
- `asaps_get_affect_guide` / `asaps_get_example_story` / `asaps_get_themes` —
  the authoring guidance and a worked example to structure a story correctly
- `asaps_inject_story` — push a complete story into the Builder, where it
  appears immediately in the visual editor
- `asaps_check_connection` — confirm the Builder API is reachable

**Prerequisite:** the Builder API server must be running —
`cd packages/builder && STORAGE_TYPE=filesystem npm run api:start` (port 3001).

Configure it in your assistant's MCP settings pointing at
`mcp-server-desktop/dist/index.js`. Setup details live in
[`mcp-server-desktop/README.md`](../mcp-server-desktop/README.md).

> A second server (`mcp-server/`) previously carried its own Anthropic API key
> and its own copy of the generation prompts. It was retired in favour of the
> above: it required the same running Builder, duplicated prompts that drifted
> silently out of date, and needed a key to do what Claude Desktop already
> does. For editing a story that is already open, use the in-app **Co-Designer**
> (AI menu → *Design with Co-Designer*).
