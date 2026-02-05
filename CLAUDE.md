# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ASPAS Modern is a TypeScript/JavaScript web application that modernizes the Advanced Story Authoring and Presentation System (ASAPS). It's an interactive narrative creation tool with a visual story builder, graph-based editor, and support for the ASML (Advanced Stories Markup Language) XML format.

## Essential Commands

### Development
```bash
npm install              # Install all dependencies (including workspaces)
npm run dev              # Start builder development server (port 5173)
npm run dev:all          # Start all packages in dev mode concurrently
```

### Building
```bash
npm run build            # Build all packages in dependency order (core → renderer → builder)
npm run build:core       # Build core package only
npm run build:renderer
npm run build:builder    # Build builder package only
```

### Testing & Quality
```bash
npm run test             # Run all tests across packages
npm run lint             # ESLint with TypeScript support
npm run format           # Prettier code formatting
npm run type-check       # TypeScript type checking without emit
```

### Package-Specific Testing
```bash
npm run test -w @asaps/builder      # Test builder package
npm run test:ui -w @asaps/builder   # Open Vitest UI for builder
npm run test:coverage -w @asaps/core # Run core tests with coverage
```

## ⚠️ CRITICAL: Rebuild After Code Changes

**This is a monorepo where packages import from compiled `dist/` folders, NOT source files. You MUST rebuild after making changes!**

### After modifying `packages/core/src/`:
```bash
npm run build:core       # ALWAYS run this after changing core
```

### After modifying `packages/renderer/src/`:
```bash
npm run build            # Rebuilds core → renderer → builder
```

### After modifying `packages/builder/src/`:
No rebuild needed - Vite HMR handles it automatically during development.

### Why this matters:
- The builder imports from `@asaps/core` which resolves to `packages/core/dist/`
- If you edit `packages/core/src/layout/TreeLayoutAlgorithm.ts` but don't rebuild, the builder will still use the OLD compiled version
- **Your changes will appear to have no effect until you rebuild!**

### Quick reference:
| Changed files in... | Run command |
|---------------------|-------------|
| `packages/core/src/` | `npm run build:core` |
| `packages/renderer/src/` | `npm run build` |
| `packages/builder/src/` | Nothing (HMR) |
| Multiple packages | `npm run build` |

### Dev Server Management
**Always restart the dev server after rebuilding packages.** The dev server caches the old builds.

```bash
# Kill existing server and restart
pkill -f "vite" 2>/dev/null; sleep 1; npm run dev > /dev/null 2>&1 &
```

Do this automatically when making changes to core or renderer packages - don't ask the user to restart.

## Architecture Overview

### Monorepo Structure
The project uses npm workspaces with three main packages:

```
packages/
├── core/          # Core story engine and beat system
├── builder/       # React-based visual story builder (main app)
└── renderer/      # Rendering engines (Canvas & React-based)
```

### Key Technologies
- **Node.js 20+** required (22+ for Electron desktop builds)
- **TypeScript 5.6** with strict configuration
- **React 18** with TypeScript for the builder UI
- **Vite** for build tooling and development
- **ReactFlow** for graph visualization
- **Zustand** for state management
- **Vitest** for testing
- **Tailwind CSS** for styling
- **Electron** for desktop app (apps/builder-desktop)

### Beat System Architecture

The beat system uses a **Template Method Pattern** where all beats extend a base `Beat` class:

1. **Base Beat Class** (`packages/core/src/beats/Beat.ts`): Defines the execution template
2. **Abstract Methods**: `performAction()`, `getParameters()`, `updateParameters()`
3. **Execution Flow**: `onEnter()` → `performAction()` → `onExit()`
4. **Beat Registry**: Factory pattern for beat creation and registration

**Beat Categories:**
- **Visible Beats**: TitleScreen, IntroText, DialogTree, DurScreen (timed), DialogTree, MovementChoice, PickProp, HyperText, VideoBeat, inputText, EndScreen
- **Invisible Beats**: SetVariable, ConditionBeat (logic/background operations), AddRemoveInventory (manipulate inventory), RandomTarget, SetTimer

### Creating New Beat Types

1. Extend the base `Beat` class in `packages/core/src/beats/`
2. Implement required abstract methods (`performAction`, `getParameters`, `updateParameters`)
3. Register in `BeatTypeRegistry.registerDefaultBeats()`
4. Add renderer support in the `IRenderer` interface
5. Update beat definitions in `beat-definitions/core-beats.json`

### State Management

- **Builder State**: Zustand stores in `packages/builder/src/stores/`
- **Story Context**: Immutable state management in `packages/core/src/engine/StoryContext.ts`
- **Event System**: EventEmitter3 for decoupled communication

### File Processing

- **ASML XML**: Parsed using DOM-based XML processing
- **Import/Export**: File handling through browser APIs and JSZip
- **Storage**: IndexedDB for local story storage

### Development Workflow

1. **TypeScript**: Strict mode enabled with composite project references
2. **ESLint**: Modern flat config with TypeScript and React rules
3. **Testing**: Vitest with jsdom environment for DOM testing
4. **Build Order**: Core → Renderer → Builder (dependency chain)

### Key Interfaces

- `IRenderer`: Renderer contract for beat visualization
- `BeatConfig`: Configuration for beat creation
- `StoryContext`: Immutable game state management
- `Connection`: Beat transition logic with conditions

### Legacy Support

The system maintains backward compatibility with legacy ASML files:
- Automatic migration of deprecated beat types
- Graceful handling of legacy attributes
- Support for original ASML XML structure

## Common Development Tasks

### Adding a New Beat Type
1. Create beat class extending `Beat` in `packages/core/src/beats/`
2. Implement abstract methods and custom logic
3. Register in `BeatRegistry.ts`
4. Add renderer method to `IRenderer` interface
5. Implement rendering in both renderer packages
6. Add beat definition to `beat-definitions/core-beats.json`
7. Create tests in `packages/core/tests/beats/`

### Modifying the Builder UI
1. React components in `packages/builder/src/components/`
2. Zustand stores in `packages/builder/src/stores/`
3. ReactFlow graph customization in canvas components
4. Tailwind CSS for styling

### Working with ASML XML
1. XML parsing in `packages/core/src/xml/`
2. Story serialization in `packages/core/src/engine/`
3. Import/export logic in builder components

### Testing Strategy
- Unit tests for core beat logic and engine
- Component tests for React components
- Integration tests for story flow
- Use Vitest UI for interactive test development

### Preview System

**IMPORTANT**: The app uses a **separate Preview Window** for story testing, NOT the old StoryPreview component.

- **PreviewWindow** (`packages/builder/src/pages/PreviewWindow.tsx`): The current preview system. Opens in a separate browser window. Logs use `[PreviewWindow]` prefix.
- **StoryPreview** (`packages/builder/src/components/preview/StoryPreview.tsx`): DEPRECATED. The old modal-based preview.
- **VisualBeatEditor** (`packages/builder/src/components/visual/VisualBeatEditor.tsx`): The visual editor that shows beat layout with selection handles. Uses `editorMode={true}`.

When working on preview-related issues:
1. Always check PreviewWindow.tsx first
2. The preview uses ReactRenderer which uses PositionedBeatView
3. Both visual editor and preview pass `editorMode={true}` to ensure consistent rendering