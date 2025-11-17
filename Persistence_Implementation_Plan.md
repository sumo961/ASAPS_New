# Comprehensive Persistence Implementation Plan

**Date**: 2025-11-10
**Status**: In Progress
**Estimated Time**: 42-54 hours (1-1.5 weeks full-time)

## Executive Summary

This plan addresses the critical issue that ASAPS Modern currently has **no browser-side persistence**. All data exists only in React state and is lost on page refresh. This comprehensive solution implements:

1. **IndexedDB Storage** - Browser-side database for projects, assets, and history
2. **Command Pattern** - Undo/redo with 50-action history
3. **Auto-Save** - Automatic drafts every 30 seconds
4. **Project Management** - Multiple project support
5. **Asset Persistence** - Blob storage for images/audio/video

---

## Current State Analysis

### What Exists
- **Export/Import**: Manual ASML XML and ZIP export/import
- **In-Memory State**: React useState for all data
- **Beat Persistence**: Only via manual XML export

### Critical Gaps
1. ❌ No auto-save - work lost on refresh/crash
2. ❌ No undo/redo - cannot revert changes
3. ❌ Assets in memory only - lost on refresh
4. ❌ New features (animations, sounds) not persisted
5. ❌ No project management - single story at a time
6. ❌ Manual save required - easy to lose work

---

## Architecture Overview

### Three-Tier Persistence Strategy

```
┌─────────────────────────────────────────────────┐
│  Tier 1: In-Memory State (React)                │
│  Purpose: Immediate UI updates, fast operations │
│  Storage: useState, useReducer                  │
└─────────────────┬───────────────────────────────┘
                  │ Auto-sync every 30s
                  ↓
┌─────────────────────────────────────────────────┐
│  Tier 2: IndexedDB (Browser Storage)            │
│  Purpose: Crash recovery, undo/redo, projects   │
│  Storage: IndexedDB via idb library             │
│  Size Limit: ~50MB - 1GB (browser dependent)    │
└─────────────────┬───────────────────────────────┘
                  │ Manual export
                  ↓
┌─────────────────────────────────────────────────┐
│  Tier 3: File Export (User Downloads)           │
│  Purpose: Sharing, backup, version control      │
│  Formats: .asml (XML), .zip (with assets)       │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: IndexedDB Foundation (6-8 hours)

### 1.1 Database Schema

**File**: `/packages/builder/src/storage/schema.ts`

```typescript
import { DBSchema as IDBSchema } from 'idb';

export interface DBSchema extends IDBSchema {
  projects: {
    key: string; // projectId (UUID)
    value: Project;
    indexes: {
      'by-modified': Date;
      'by-created': Date;
      'by-name': string;
    };
  };

  assets: {
    key: string; // assetId (UUID)
    value: StoredAsset;
    indexes: {
      'by-project': string;
      'by-type': AssetType;
    };
  };

  history: {
    key: string; // projectId
    value: CommandHistory;
  };

  drafts: {
    key: string; // `${projectId}_${timestamp}`
    value: AutoSaveDraft;
    indexes: {
      'by-project': string;
      'by-timestamp': Date;
    };
  };
}

// Core data structures
export interface Project {
  id: string;
  name: string;
  created: Date;
  modified: Date;
  thumbnail?: Blob; // PNG thumbnail (256x144)

  data: {
    // Existing story data
    beats: Record<string, SerializedBeat>;
    metadata: StoryMetadata;
    settings: GlobalSettings;
    characters: Character[];

    // NEW: Per-beat visual data
    visualElements: Record<string, VisualElement[]>; // beatId → elements
    animations: Record<string, AnimationPath[]>; // beatId → animations

    // Asset references (not blobs - stored separately)
    assetIds: string[];
  };
}

export interface SerializedBeat {
  id: string;
  name: string;
  type: string;
  cluster?: string;
  x: number;
  y: number;
  locations: Location[];
  connections: Connection[];
  defaultTarget?: string;
  transition?: Transition;
  sound?: Sound;
  node?: string; // background asset ID
  parameters: Record<string, any>;
  animations?: AnimationPath[]; // NEW
}

export interface StoredAsset {
  id: string;
  projectId: string;
  name: string;
  type: 'image' | 'audio' | 'video';
  subType?: 'character' | 'prop' | 'background' | 'sfx' | 'music';
  blob: Blob;
  metadata: {
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    duration?: number;
  };
  created: Date;
}

export interface CommandHistory {
  projectId: string;
  commands: SerializedCommand[];
  currentIndex: number;
  maxSize: number; // Default: 50
}

export interface SerializedCommand {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  inverseData: any; // For undo
}

export interface AutoSaveDraft {
  id: string; // `${projectId}_${timestamp}`
  projectId: string;
  timestamp: Date;
  data: Partial<Project['data']>;
  description: string; // e.g., "Auto-save after editing Beat 5"
}
```

### 1.2 Storage Manager

**File**: `/packages/builder/src/storage/StorageManager.ts`

```typescript
import { openDB, IDBPDatabase } from 'idb';
import type { DBSchema, Project, StoredAsset, CommandHistory, AutoSaveDraft } from './schema';

const DB_NAME = 'asaps-modern';
const DB_VERSION = 1;

export class StorageManager {
  private db: IDBPDatabase<DBSchema> | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.db = await openDB<DBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          // Create object stores
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
            projectStore.createIndex('by-modified', 'modified');
            projectStore.createIndex('by-created', 'created');
            projectStore.createIndex('by-name', 'name');
          }

          if (!db.objectStoreNames.contains('assets')) {
            const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
            assetStore.createIndex('by-project', 'projectId');
            assetStore.createIndex('by-type', 'type');
          }

          if (!db.objectStoreNames.contains('history')) {
            db.createObjectStore('history', { keyPath: 'projectId' });
          }

          if (!db.objectStoreNames.contains('drafts')) {
            const draftStore = db.createObjectStore('drafts', { keyPath: 'id' });
            draftStore.createIndex('by-project', 'projectId');
            draftStore.createIndex('by-timestamp', 'timestamp');
          }
        },
      });
    })();

    return this.initPromise;
  }

  // ==================== PROJECTS ====================

  async saveProject(project: Project): Promise<void> {
    await this.init();
    project.modified = new Date();
    await this.db!.put('projects', project);
  }

  async loadProject(projectId: string): Promise<Project | null> {
    await this.init();
    return (await this.db!.get('projects', projectId)) || null;
  }

  async listProjects(): Promise<Project[]> {
    await this.init();
    return this.db!.getAll('projects');
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(['projects', 'assets', 'history', 'drafts'], 'readwrite');

    // Delete project
    await tx.objectStore('projects').delete(projectId);

    // Delete all associated assets
    const assetIndex = tx.objectStore('assets').index('by-project');
    const assets = await assetIndex.getAll(projectId);
    for (const asset of assets) {
      await tx.objectStore('assets').delete(asset.id);
    }

    // Delete history
    await tx.objectStore('history').delete(projectId);

    // Delete drafts
    const draftIndex = tx.objectStore('drafts').index('by-project');
    const drafts = await draftIndex.getAll(projectId);
    for (const draft of drafts) {
      await tx.objectStore('drafts').delete(draft.id);
    }

    await tx.done;
  }

  // ==================== ASSETS ====================

  async saveAsset(asset: StoredAsset): Promise<void> {
    await this.init();
    await this.db!.put('assets', asset);
  }

  async loadAsset(assetId: string): Promise<StoredAsset | null> {
    await this.init();
    return (await this.db!.get('assets', assetId)) || null;
  }

  async loadProjectAssets(projectId: string): Promise<StoredAsset[]> {
    await this.init();
    return this.db!.getAllFromIndex('assets', 'by-project', projectId);
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.init();
    await this.db!.delete('assets', assetId);
  }

  // ==================== HISTORY ====================

  async saveHistory(history: CommandHistory): Promise<void> {
    await this.init();
    await this.db!.put('history', history);
  }

  async loadHistory(projectId: string): Promise<CommandHistory | null> {
    await this.init();
    return (await this.db!.get('history', projectId)) || null;
  }

  async clearHistory(projectId: string): Promise<void> {
    await this.init();
    await this.db!.delete('history', projectId);
  }

  // ==================== DRAFTS ====================

  async saveDraft(draft: AutoSaveDraft): Promise<void> {
    await this.init();
    await this.db!.put('drafts', draft);
  }

  async loadLatestDraft(projectId: string): Promise<AutoSaveDraft | null> {
    await this.init();
    const drafts = await this.db!.getAllFromIndex('drafts', 'by-project', projectId);
    if (drafts.length === 0) return null;

    // Sort by timestamp descending
    drafts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return drafts[0];
  }

  async clearOldDrafts(projectId: string, keepCount: number = 5): Promise<void> {
    await this.init();
    const drafts = await this.db!.getAllFromIndex('drafts', 'by-project', projectId);

    // Sort by timestamp descending
    drafts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Delete all except the most recent `keepCount`
    const toDelete = drafts.slice(keepCount);
    for (const draft of toDelete) {
      await this.db!.delete('drafts', draft.id);
    }
  }

  // ==================== UTILITIES ====================

  async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    return { usage: 0, quota: 0 };
  }

  async clearAll(): Promise<void> {
    await this.init();
    const tx = this.db!.transaction(['projects', 'assets', 'history', 'drafts'], 'readwrite');
    await tx.objectStore('projects').clear();
    await tx.objectStore('assets').clear();
    await tx.objectStore('history').clear();
    await tx.objectStore('drafts').clear();
    await tx.done;
  }
}

// Global singleton
let storageManager: StorageManager | null = null;

export function getStorageManager(): StorageManager {
  if (!storageManager) {
    storageManager = new StorageManager();
  }
  return storageManager;
}
```

### 1.3 Storage Index Export

**File**: `/packages/builder/src/storage/index.ts`

```typescript
export * from './schema';
export * from './StorageManager';
export { getStorageManager } from './StorageManager';
```

---

## Phase 2: Command Pattern & Undo/Redo (8-10 hours)

### 2.1 Command Types

**File**: `/packages/builder/src/commands/types.ts`

```typescript
export interface Command {
  id: string;
  type: string;
  timestamp: Date;

  execute(): void;
  undo(): void;

  // Serialization for storage
  toJSON(): SerializedCommand;
}

export interface SerializedCommand {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  inverseData: any;
}

export interface CommandManagerOptions {
  maxHistory?: number; // Default: 50
  onExecute?: (command: Command) => void;
  onUndo?: (command: Command) => void;
  onRedo?: (command: Command) => void;
}
```

### 2.2 Command Manager

**File**: `/packages/builder/src/commands/CommandManager.ts`

```typescript
import { Command, CommandManagerOptions, SerializedCommand } from './types';

export class CommandManager {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private maxHistory: number;
  private options: CommandManagerOptions;

  constructor(options: CommandManagerOptions = {}) {
    this.maxHistory = options.maxHistory || 50;
    this.options = options;
  }

  execute(command: Command): void {
    // Execute the command
    command.execute();

    // Remove any commands after current index (redo history)
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add to history
    this.history.push(command);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }

    this.options.onExecute?.(command);
  }

  undo(): boolean {
    if (!this.canUndo()) return false;

    const command = this.history[this.currentIndex];
    command.undo();
    this.currentIndex--;

    this.options.onUndo?.(command);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    command.execute();

    this.options.onRedo?.(command);
    return true;
  }

  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  getHistory(): Command[] {
    return this.history.slice(0, this.currentIndex + 1);
  }

  clearHistory(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  // Serialization for persistence
  serialize(): SerializedCommand[] {
    return this.history.map(cmd => cmd.toJSON());
  }

  // Deserialization (requires command factory)
  static deserialize(
    serialized: SerializedCommand[],
    commandFactory: (cmd: SerializedCommand) => Command
  ): CommandManager {
    const manager = new CommandManager();
    manager.history = serialized.map(commandFactory);
    manager.currentIndex = manager.history.length - 1;
    return manager;
  }
}
```

### 2.3 Element Commands

**File**: `/packages/builder/src/commands/ElementCommands.ts`

```typescript
import { v4 as uuid } from 'uuid';
import type { Command, SerializedCommand } from './types';
import type { VisualElement } from '../components/visual/VisualBeatEditor';

type ElementStateSetter = React.Dispatch<React.SetStateAction<VisualElement[]>>;

// Base class for element commands
abstract class ElementCommand implements Command {
  id: string;
  timestamp: Date;
  abstract type: string;

  constructor() {
    this.id = uuid();
    this.timestamp = new Date();
  }

  abstract execute(): void;
  abstract undo(): void;
  abstract toJSON(): SerializedCommand;
}

// Add Element Command
export class AddElementCommand extends ElementCommand {
  type = 'ADD_ELEMENT';

  constructor(
    private element: VisualElement,
    private setState: ElementStateSetter
  ) {
    super();
  }

  execute(): void {
    this.setState(prev => [...prev, this.element]);
  }

  undo(): void {
    this.setState(prev => prev.filter(el => el.id !== this.element.id));
  }

  toJSON(): SerializedCommand {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: { element: this.element },
      inverseData: { elementId: this.element.id },
    };
  }
}

// Delete Element Command
export class DeleteElementCommand extends ElementCommand {
  type = 'DELETE_ELEMENT';

  constructor(
    private elementId: string,
    private deletedElement: VisualElement,
    private setState: ElementStateSetter
  ) {
    super();
  }

  execute(): void {
    this.setState(prev => prev.filter(el => el.id !== this.elementId));
  }

  undo(): void {
    this.setState(prev => [...prev, this.deletedElement]);
  }

  toJSON(): SerializedCommand {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: { elementId: this.elementId },
      inverseData: { element: this.deletedElement },
    };
  }
}

// Update Element Command
export class UpdateElementCommand extends ElementCommand {
  type = 'UPDATE_ELEMENT';

  constructor(
    private elementId: string,
    private oldData: Partial<VisualElement>,
    private newData: Partial<VisualElement>,
    private setState: ElementStateSetter
  ) {
    super();
  }

  execute(): void {
    this.setState(prev =>
      prev.map(el =>
        el.id === this.elementId ? { ...el, ...this.newData } : el
      )
    );
  }

  undo(): void {
    this.setState(prev =>
      prev.map(el =>
        el.id === this.elementId ? { ...el, ...this.oldData } : el
      )
    );
  }

  toJSON(): SerializedCommand {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: { elementId: this.elementId, updates: this.newData },
      inverseData: { elementId: this.elementId, updates: this.oldData },
    };
  }
}

// Move Element Command
export class MoveElementCommand extends ElementCommand {
  type = 'MOVE_ELEMENT';

  constructor(
    private elementId: string,
    private oldPosition: { x: number; y: number },
    private newPosition: { x: number; y: number },
    private setState: ElementStateSetter
  ) {
    super();
  }

  execute(): void {
    this.setState(prev =>
      prev.map(el =>
        el.id === this.elementId
          ? { ...el, x: this.newPosition.x, y: this.newPosition.y }
          : el
      )
    );
  }

  undo(): void {
    this.setState(prev =>
      prev.map(el =>
        el.id === this.elementId
          ? { ...el, x: this.oldPosition.x, y: this.oldPosition.y }
          : el
      )
    );
  }

  toJSON(): SerializedCommand {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: { elementId: this.elementId, position: this.newPosition },
      inverseData: { elementId: this.elementId, position: this.oldPosition },
    };
  }
}
```

---

## Phase 3: Auto-Save System (4-6 hours)

### 3.1 Auto-Save Hook

**File**: `/packages/builder/src/hooks/useAutoSave.ts`

```typescript
import { useEffect, useState, useRef, useCallback } from 'react';
import { getStorageManager } from '../storage';
import type { Project, AutoSaveDraft } from '../storage/schema';

export interface AutoSaveOptions {
  projectId: string | null;
  enabled: boolean;
  interval?: number; // ms, default 30000 (30 seconds)
  onSave?: (draft: AutoSaveDraft) => void;
  onError?: (error: Error) => void;
}

export interface AutoSaveStatus {
  lastSaved: Date | null;
  isSaving: boolean;
  error: Error | null;
  draftCount: number;
}

export function useAutoSave(
  getProjectData: () => Partial<Project['data']>,
  options: AutoSaveOptions
): AutoSaveStatus {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const storageManager = getStorageManager();

  const saveInterval = options.interval || 30000;

  const performSave = useCallback(async () => {
    if (!options.projectId || !options.enabled) return;

    try {
      setIsSaving(true);
      setError(null);

      const data = getProjectData();
      const timestamp = new Date();

      const draft: AutoSaveDraft = {
        id: `${options.projectId}_${timestamp.getTime()}`,
        projectId: options.projectId,
        timestamp,
        data,
        description: `Auto-save at ${timestamp.toLocaleTimeString()}`,
      };

      await storageManager.saveDraft(draft);
      setLastSaved(timestamp);
      setDraftCount(prev => prev + 1);

      // Clean up old drafts (keep last 5)
      await storageManager.clearOldDrafts(options.projectId, 5);

      options.onSave?.(draft);
    } catch (err) {
      const error = err as Error;
      setError(error);
      options.onError?.(error);
      console.error('[useAutoSave] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [options.projectId, options.enabled, getProjectData, options.onSave, options.onError]);

  // Set up auto-save interval
  useEffect(() => {
    if (!options.enabled || !options.projectId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial save
    performSave();

    // Set up interval
    intervalRef.current = setInterval(performSave, saveInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [options.enabled, options.projectId, saveInterval, performSave]);

  return {
    lastSaved,
    isSaving,
    error,
    draftCount,
  };
}
```

### 3.2 Save Status Component

**File**: `/packages/builder/src/components/toolbar/SaveStatus.tsx`

```typescript
import React from 'react';
import { Clock, AlertCircle, Check, Loader } from 'lucide-react';
import type { AutoSaveStatus } from '../../hooks/useAutoSave';

interface SaveStatusProps {
  status: AutoSaveStatus;
  onRetry?: () => void;
}

export const SaveStatus: React.FC<SaveStatusProps> = ({ status, onRetry }) => {
  const { lastSaved, isSaving, error } = status;

  // Calculate time since last save
  const getTimeSince = (): string => {
    if (!lastSaved) return 'Never';

    const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md">
        <AlertCircle size={16} className="text-red-600" />
        <span className="text-xs text-red-700">Save failed!</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
        <Loader size={16} className="text-blue-600 animate-spin" />
        <span className="text-xs text-blue-700">Saving...</span>
      </div>
    );
  }

  if (lastSaved) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
        <Check size={16} className="text-green-600" />
        <span className="text-xs text-green-700">Saved {getTimeSince()}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
      <Clock size={16} className="text-gray-600" />
      <span className="text-xs text-gray-700">Not saved</span>
    </div>
  );
};
```

---

## Implementation Order

### Week 1
1. **Day 1-2**: Phase 1 - IndexedDB foundation
2. **Day 3-4**: Phase 2 - Command pattern basics
3. **Day 5**: Phase 3 - Auto-save system

### Week 2
4. **Day 6-8**: Phase 4 - Integration with existing components
5. **Day 9-10**: Phase 5 - Project management UI
6. **Day 11-12**: Phase 6 - Data migration & testing

---

## Success Criteria

- [ ] Projects persist across page refresh
- [ ] Undo/redo works for all operations
- [ ] Auto-save creates drafts every 30 seconds
- [ ] Assets survive page refresh
- [ ] Multiple projects can be managed
- [ ] Animations and sounds are persisted
- [ ] Export/import still works
- [ ] No performance degradation
- [ ] Storage quota is respected

---

## Risk Mitigation

1. **Browser Storage Limits**: Monitor quota, show warnings
2. **Data Migration**: Provide import tool for existing XML files
3. **Performance**: Use indexing, lazy loading, web workers
4. **Compatibility**: Graceful degradation if IndexedDB unavailable
5. **Data Loss**: Regular export prompts, cloud backup option

---

## Next Steps

1. Install `idb` library if not already present
2. Create storage layer (Phase 1)
3. Create command infrastructure (Phase 2)
4. Implement auto-save (Phase 3)
5. Integrate with useStoryBuilder (Phase 4)
6. Build project UI (Phase 5)
7. Wire up persistence (Phase 6)
