# ASAPS — Advanced Stories Authoring and Presentation System

[![Latest release](https://img.shields.io/github/v/release/sumo961/ASAPS_New?label=release)](https://github.com/sumo961/ASAPS_New/releases/latest)
[![CI](https://github.com/sumo961/ASAPS_New/actions/workflows/ci.yml/badge.svg)](https://github.com/sumo961/ASAPS_New/actions/workflows/ci.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)](LICENSE)

ASAPS is a visual tool for writing interactive stories: stories with choices, conversations, characters who remember, and more than one ending. You build a story as a flowchart of *beats*, arrange each screen in a visual editor, play it in a preview, and publish it as a web page. No programming is needed.

This is the modern version of ASAPS by Hartmut Koenitz, rebuilt in TypeScript from his original ActionScript system (2005–2017, begun at Georgia Tech). Stories are kept in ASML 2.0 (Advanced Stories Markup Language, also created by Hartmut Koenitz); stories in the original XML-based ASML 1.0 can be imported.

**[Download](https://github.com/sumo961/ASAPS_New/releases/latest)** · **[User Guide](docs/USER_GUIDE.md)** · **[Release notes](https://github.com/sumo961/ASAPS_New/releases)** · **[Version history](VERSION_HISTORY.md)**

![The ASAPS builder: the story's flowchart in the middle, the beat list on the left and the beat types on the right](assets/screenshot.png)

## 🎯 Features

**Write and structure**
- **A flowchart of beats.** 36 beat types: text screens, choices, dialog trees, timed screens, free layouts, video, 360° panoramas, text and keypad input, and more. Drag one in, draw a link, and the story grows. A Script view reads the whole story top to bottom.
- **A Visual Editor for each screen.** Place text, characters, props and meters. A story can reflow to any screen (responsive) or keep a fixed canvas. Themes set the look; a single beat can look different.
- **Stories that remember.** Variables, counters, inventory, timers and a story clock, with conditions and effects on any choice. The Story Data window shows where each one is set and tested.
- **The everyday tools.** Templates to start from, Undo everywhere, an asset manager, Find & Change, dark mode.

**Characters**
- **Feelings, not just numbers.** Mood, emotions, feelings toward others, personality traits and goals. Choices change how a character feels, and meters on screen can follow.
- **Roles.** Let the player choose who they are, or cast a part at random. Each scene is written once and works for whoever plays it.
- **On stage.** Portraits, comic speech bubbles pointing at the speaker, and dimming of characters who aren't speaking.

**Test before you publish**
- **Preview** in its own window, at desktop, tablet or phone size, from the beginning or from any beat "as if" the player had arrived a certain way.
- **Debug tools** that play the story for you: a Problems list, beats that can't be reached, dead ends, checks that can never be true, and an optional check by AI.

**AI, if you want it**
- **For writing:** generate a first story from a prompt, develop ideas in the Ideator, or change an open story with the Co-Designer. Every proposal is shown before it is applied.
- **In the story:** beats that call a model while the story plays, such as a free conversation with a character, or a summary of what the player did.
- **Your choice of provider:** OpenAI, Anthropic, any OpenAI-compatible or local model, and Apple's on-device model on macOS 27. An MCP server lets Claude Desktop build stories. All AI features can be switched off.

**Languages and voice**
- Translate a story into several languages, by hand or with AI, and see which lines went stale when the original changed.
- Read stories aloud and take spoken answers, with cloud or fully local voices.

**Beyond the screen**
- GPS and indoor-location beats, QR codes, AR scenes, embedded web pages and sound placed in space, with a stand-in for the sensors while you write at a desk.

**Share**
- **Export** a story as a web page: one file to send, or a folder for a website.
- **Desktop apps** for macOS, Windows and Linux (beta) that update themselves.
- **Work together** with Git built in: commit, push, pull, merge two versions of a story.

## 🆕 Latest release: v0.9.158, the tidy-up release

ASAPS is in **beta**: the core works, and new releases arrive often.

v0.9.158 was made after walking through the app as a new user. Project Settings has seven tabs grouped by what a setting does. Roles are set up in the Characters window. A new **Story Data** window lists the story's variables and counters with the beats that set, test and show each one. 268 field hints are rewritten in plain words, beat types are named as in the palette, and "Learn more" links open the User Guide at the right section. The flowchart marks where the story starts, a welcome card greets first-time users, and the toolbar is calmer. The HTML export starts at the title screen unless you set another start.

Earlier releases:
- **[VERSION_HISTORY.md](VERSION_HISTORY.md)**: a summary of every release, and the feature matrix
- **[Progress.md](Progress.md)**: detailed notes with the reasons behind each change
- **[GitHub Releases](https://github.com/sumo961/ASAPS_New/releases)**: installers and release notes

<!-- Only the latest release is described here. On a new release, replace the paragraph above and move the old one to "Release summaries" in VERSION_HISTORY.md. -->

## 📥 Download and install

Installers are on the [GitHub Releases page](https://github.com/sumo961/ASAPS_New/releases/latest). The app checks for updates and tells you when one is ready.

- **macOS** (Intel and Apple Silicon): open the `.dmg` and drag ASAPS Builder to Applications.
- **Windows** (64-bit): run the installer (`.exe`).
- **Linux** (beta, 64-bit x86): a `.deb` package or an AppImage.

**Installing on Linux.** On Ubuntu, Debian and similar, the .deb is the simplest: `sudo apt install ./ASAPS-Builder-<version>-amd64.deb` installs it with everything it needs and adds it to the applications menu (start it from there or with `asaps-builder`). The AppImage runs on most other distributions without installing: make it executable (`chmod +x ASAPS-Builder-<version>-x86_64.AppImage`) and start it. It is also the only Linux build that updates itself. On Ubuntu 24.04 and later the AppImage may refuse to start because the system restricts the sandbox it uses; start it with `--no-sandbox` or use the .deb instead. Your API keys are stored encrypted when the desktop provides a keyring (GNOME Keyring, KWallet); without one they are stored unencrypted and the log says so.

## 📖 Documentation

The **[User Guide](docs/USER_GUIDE.md)** covers everything: a first story in 15 minutes, the interface, every beat type, characters and feelings, conditions and effects, the Preview and Debug tools, translation and voice, AI, and location-based stories. In the app, **Tools ▸ User Guide** and the "Learn more" links open it at the right place.

The rest of this page is for people who want to build ASAPS from source or work on it.

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

36 beat types, defined in [`beat-definitions/core-beats.json`](beat-definitions/core-beats.json). The [User Guide](docs/USER_GUIDE.md) describes each one.

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

Modular monorepo (npm workspaces) with the runtime engine, builder UI, and renderers cleanly separated. The builder imports from compiled `dist/` folders of the other packages — see [CLAUDE.md](CLAUDE.md) for the rebuild rules.

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
[`mcp-server-desktop/README.md`](mcp-server-desktop/README.md).

> A second server (`mcp-server/`) previously carried its own Anthropic API key
> and its own copy of the generation prompts. It was retired in favour of the
> above: it required the same running Builder, duplicated prompts that drifted
> silently out of date, and needed a key to do what Claude Desktop already
> does. For editing a story that is already open, use the in-app **Co-Designer**
> (AI menu → *Design with Co-Designer*).

## 📋 Version History

See [**VERSION_HISTORY.md**](VERSION_HISTORY.md) for a summary of every release and the feature matrix, and [**Progress.md**](Progress.md) for the detailed notes.

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
