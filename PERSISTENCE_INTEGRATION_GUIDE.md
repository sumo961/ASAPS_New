# Persistence System Integration Guide

This guide explains how to integrate the comprehensive persistence system into ASAPS Modern components.

## Overview

The persistence system provides:
- **IndexedDB Storage** - Browser-side database for projects, assets, history
- **Undo/Redo** - Command pattern with Ctrl+Z/Ctrl+Shift+Z shortcuts
- **Auto-Save** - Automatic saving every 30 seconds with visual feedback
- **Project Management** - Create, load, delete projects

## Quick Start

### 1. Wrap your app with PersistenceProvider

```tsx
import { PersistenceProvider } from './contexts/PersistenceContext';

function App() {
  return (
    <PersistenceProvider
      autoSave={true}
      autoSaveDelay={30000}
      debug={false}
    >
      <YourApp />
    </PersistenceProvider>
  );
}
```

### 2. Use persistence hooks in components

```tsx
import { usePersistence, useCommands, useSave, useProject } from './contexts/PersistenceContext';

function MyComponent() {
  // Full access
  const persistence = usePersistence();

  // Or use specific hooks
  const { execute, undo, redo, canUndo, canRedo } = useCommands();
  const { status, lastSaved, saveNow } = useSave();
  const { project, load, create, delete: deleteProject } = useProject();

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <SaveStatus status={status} lastSaved={lastSaved} />
    </div>
  );
}
```

## Using Commands (Undo/Redo)

### Element Operations

```tsx
import { AddElementCommand, UpdateElementCommand, DeleteElementCommand, MoveElementCommand } from './commands';
import { useCommands } from './contexts/PersistenceContext';

function VisualEditor() {
  const { execute } = useCommands();
  const [elements, setElements] = useState<VisualElement[]>([]);

  // State mutation callbacks for commands
  const elementMutations = {
    addElement: (element) => setElements(prev => [...prev, element]),
    updateElement: (id, updates) => setElements(prev =>
      prev.map(el => el.id === id ? { ...el, ...updates } : el)
    ),
    deleteElement: (id) => setElements(prev => prev.filter(el => el.id !== id)),
  };

  // Add element with undo/redo
  const handleAddElement = async (element: VisualElement) => {
    const command = new AddElementCommand(element, elementMutations);
    await execute(command);
  };

  // Update element with undo/redo
  const handleUpdateElement = async (id: string, updates: Partial<VisualElement>) => {
    const oldElement = elements.find(el => el.id === id);
    if (!oldElement) return;

    const oldValues = Object.keys(updates).reduce((acc, key) => {
      acc[key] = oldElement[key];
      return acc;
    }, {} as Partial<VisualElement>);

    const command = new UpdateElementCommand(id, oldValues, updates, elementMutations);
    await execute(command);
  };

  // Move element (optimized with merging)
  const handleMoveElement = async (id: string, x: number, y: number) => {
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const oldPos = { x: element.x, y: element.y, z: element.z };
    const newPos = { x, y, z: element.z };

    const command = new MoveElementCommand(id, oldPos, newPos, elementMutations);
    await execute(command);
  };

  return <div>...</div>;
}
```

### Animation Operations

```tsx
import { AddAnimationCommand, UpdateAnimationCommand, DeleteAnimationCommand } from './commands';
import { useCommands } from './contexts/PersistenceContext';

function AnimationEditor() {
  const { execute } = useCommands();
  const [animations, setAnimations] = useState<AnimationPath[]>([]);

  const animationMutations = {
    addAnimation: (animation) => setAnimations(prev => [...prev, animation]),
    updateAnimation: (id, updates) => setAnimations(prev =>
      prev.map(anim => anim.id === id ? { ...anim, ...updates } : anim)
    ),
    deleteAnimation: (id) => setAnimations(prev => prev.filter(anim => anim.id !== id)),
  };

  const handleAddAnimation = async (animation: AnimationPath) => {
    const command = new AddAnimationCommand(animation, animationMutations);
    await execute(command);
  };

  return <div>...</div>;
}
```

## Auto-Save Integration

### Option 1: Use markChanged() manually

```tsx
import { useSave } from './contexts/PersistenceContext';

function Editor() {
  const { markChanged, status, lastSaved } = useSave();
  const [data, setData] = useState({});

  const handleChange = (newData) => {
    setData(newData);
    markChanged(); // Triggers auto-save after 30s
  };

  return (
    <div>
      <SaveStatus status={status} lastSaved={lastSaved} />
      <input onChange={handleChange} />
    </div>
  );
}
```

### Option 2: Auto-save on state changes

```tsx
import { useSave } from './contexts/PersistenceContext';

function Editor() {
  const { markChanged } = useSave();
  const [beats, setBeats] = useState([]);
  const [elements, setElements] = useState([]);

  // Trigger auto-save when data changes
  useEffect(() => {
    markChanged();
  }, [beats, elements, markChanged]);

  return <div>...</div>;
}
```

### Option 3: Manual save button

```tsx
import { useSave } from './contexts/PersistenceContext';

function Toolbar() {
  const { saveNow, status } = useSave();

  return (
    <button
      onClick={saveNow}
      disabled={status === 'saving'}
    >
      {status === 'saving' ? 'Saving...' : 'Save Now'}
    </button>
  );
}
```

## UI Components

### Undo/Redo Toolbar

```tsx
import { UndoRedoToolbar } from './components/UndoRedoToolbar';

function AppToolbar() {
  return (
    <div className="toolbar">
      <UndoRedoToolbar showDescriptions={true} showShortcuts={true} />
    </div>
  );
}
```

### Save Status Indicator

```tsx
import { SaveStatus, SaveStatusBadge, MinimalSaveStatus } from './components/SaveStatus';
import { useSave } from './contexts/PersistenceContext';

function StatusBar() {
  const { status, lastSaved, error, saveNow } = useSave();

  return (
    <div>
      {/* Full status */}
      <SaveStatus
        status={status}
        lastSaved={lastSaved}
        error={error}
        onSave={saveNow}
      />

      {/* Badge variant */}
      <SaveStatusBadge status={status} lastSaved={lastSaved} />

      {/* Minimal icon only */}
      <MinimalSaveStatus status={status} lastSaved={lastSaved} />
    </div>
  );
}
```

## Project Management

### Creating a New Project

```tsx
import { useProject } from './contexts/PersistenceContext';

function NewProjectButton() {
  const { create } = useProject();

  const handleCreate = async () => {
    try {
      const projectId = await create('My New Project', 'Optional description');
      console.log('Created project:', projectId);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  return <button onClick={handleCreate}>New Project</button>;
}
```

### Loading a Project

```tsx
import { useProject } from './contexts/PersistenceContext';

function ProjectSelector({ projectId }: { projectId: string }) {
  const { load } = useProject();

  const handleLoad = async () => {
    const success = await load(projectId);
    if (!success) {
      alert('Failed to load project');
    }
  };

  return <button onClick={handleLoad}>Load Project</button>;
}
```

### Listing Projects

```tsx
import { usePersistence } from './contexts/PersistenceContext';

function ProjectList() {
  const { storage } = usePersistence();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function loadProjects() {
      const result = await storage.listProjects({
        sortBy: 'modified',
        sortDirection: 'desc',
      });

      if (result.success && result.data) {
        setProjects(result.data);
      }
    }

    loadProjects();
  }, [storage]);

  return (
    <ul>
      {projects.map(project => (
        <li key={project.id}>
          {project.name} - Modified: {project.modifiedAt.toLocaleString()}
        </li>
      ))}
    </ul>
  );
}
```

## Direct Storage Access

For operations that don't need undo/redo or auto-save:

```tsx
import { usePersistence } from './contexts/PersistenceContext';

function AssetManager() {
  const { storage } = usePersistence();

  const uploadAsset = async (file: File) => {
    const asset: StoredAsset = {
      id: uuidv4(),
      projectId: currentProjectId,
      type: 'image',
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      blob: file,
      uploadedAt: new Date(),
    };

    const result = await storage.createAsset(asset);
    if (!result.success) {
      throw result.error;
    }
  };

  return <div>...</div>;
}
```

## TypeScript Types

All types are fully typed:

```tsx
import type { Project, StoredAsset, CommandHistory, AutoSaveDraft } from './storage/types';
import type { VisualElement } from './commands/ElementCommands';
import type { AnimationPath } from '@asaps/core';
import type { SaveStatus } from './hooks/useAutoSave';
```

## Best Practices

1. **Always use commands for undoable operations**
   - Element add/update/delete/move
   - Beat add/update/delete
   - Animation add/update/delete

2. **Call markChanged() after state updates**
   - Or use useEffect to watch dependencies
   - Commands automatically call markChanged()

3. **Show save status to users**
   - Use SaveStatus component
   - Especially important to show errors

4. **Handle errors gracefully**
   - Storage operations return `StorageResult<T>` with success/error
   - Check result.success before using result.data

5. **Use specialized hooks**
   - `useCommands()` for undo/redo only
   - `useSave()` for save status only
   - `useProject()` for project management only
   - `usePersistence()` for everything

## Migration Path

To integrate into existing components:

1. Wrap app with `<PersistenceProvider>`
2. Replace state mutations with commands
3. Add auto-save hooks
4. Add UI components (undo/redo toolbar, save status)
5. Test thoroughly

## Next Steps

- Phase 5: Create ProjectLibrary UI component
- Phase 6: Wire everything into existing App.tsx and components
