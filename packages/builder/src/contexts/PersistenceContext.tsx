/**
 * PersistenceContext - Unified persistence system context
 *
 * Provides a single point of access to:
 * - StorageManager (IndexedDB)
 * - CommandManager (undo/redo)
 * - Auto-save system
 * - Project management
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { getStorageManager, getStorageAdapter, type Project, type StorageManager, type GlobalSettings } from '../storage';
import { CommandManager, type Command } from '../commands';
import { useAutoSave, type SaveStatus } from '../hooks/useAutoSave';
import type { ProjectFormat } from '../storage/adapters/PersistenceAdapter';
import { DirectoryAdapter, isElectronWithFS } from '../storage/adapters/DirectoryAdapter';
import { markProjectNew, consumeProjectNew, sanitizeFolderName } from '../utils/newProjectRegistry';
import { findUniqueProjectName } from '../utils/uniqueProjectName';

// ============================================================================
// Context Types
// ============================================================================

export interface PersistenceContextValue {
  // Current project
  currentProject: Project | null;
  projectId: string | null;

  // Untitled project state
  isUntitledProject: boolean;
  hasUnsavedChanges: boolean;

  // Storage
  storage: StorageManager;

  // Command manager (undo/redo)
  commandManager: CommandManager;
  executeCommand: (command: Command) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;

  // Auto-save
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  saveError: Error | null;
  saveNow: () => Promise<void>;
  markChanged: () => void;
  pauseAutoSave: () => void;
  resumeAutoSave: () => void;
  isAutoSavePaused: boolean;

  // Project management
  loadProject: (projectId: string) => Promise<boolean>;
  createProject: (name: string, description?: string) => Promise<string>;
  deleteProject: (projectId: string) => Promise<boolean>;
  updateProjectMetadata: (updates: Partial<Pick<Project, 'name' | 'description' | 'themeId' | 'assetsPath'>>) => Promise<void>;
  updateProjectStory: (storyData: Partial<any>) => void;
  updateProjectGlobalSettings: (settings: GlobalSettings) => Promise<void>;
  saveCurrentProject: (name: string, description?: string) => Promise<string>;

  // Untitled project management
  setIsUntitledProject: (isUntitled: boolean) => void;
  clearUntitledState: () => void;
  discardUntitledProject: () => Promise<void>;

  // Data sync callback registration
  registerSyncCallback: (callback: () => void) => void;
  unregisterSyncCallback: () => void;

  // Directory format support
  projectFormat: ProjectFormat;
  projectPath: string | null;
  openDirectoryProject: (dirPath: string) => Promise<boolean>;
  saveAsDirectory: (dirPath: string) => Promise<boolean>;
  /** Remove an asset from the active directory project (file + manifest entry). No-op for non-directory projects. */
  deleteAssetFromDirectory: (assetId: string) => Promise<void>;

  // Initialization
  initialized: boolean;
  initError: Error | null;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

/**
 * Validate that a directory path still exists and contains a valid project.
 * Returns true if the directory and project.json are both present.
 */
async function validateDirectoryPath(dirPath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api?.fs?.exists) return false;
  try {
    const dirExists = await api.fs.exists(dirPath);
    if (!dirExists) return false;
    const projectJsonExists = await api.fs.exists(dirPath + '/project.json');
    return projectJsonExists;
  } catch {
    return false;
  }
}

/**
 * Check if a project is a default/empty project (3 default beats: titleScreen, infoText, endScreen)
 * These shouldn't be auto-saved as they clutter the project library
 * EXCEPTION: If the project has a custom name (not "Untitled Project"), it's saveable
 * because the user explicitly named it
 */
const isDefaultProject = (project: Project): boolean => {
  // CRITICAL FIX: If the project has a custom name, it's NOT a default project
  // The user explicitly saved it with a name, so they want it preserved
  if (project.name && project.name !== 'Untitled Project') {
    return false;
  }

  const story = project.story as any;
  if (!story) return false;

  // Get beats from either array or getAllBeats method
  const beats = Array.isArray(story.beats)
    ? story.beats
    : story.getAllBeats
      ? story.getAllBeats()
      : story.beats instanceof Map
        ? Array.from(story.beats.values())
        : [];

  // Check if exactly 3 beats
  if (beats.length !== 3) return false;

  // Get beat types and sort for comparison
  const types = beats.map((b: any) => b.type).sort();
  const defaultTypes = ['endScreen', 'infoText', 'titleScreen'];

  // Check if the types match the default pattern
  return JSON.stringify(types) === JSON.stringify(defaultTypes);
};

// ============================================================================
// Provider Component
// ============================================================================

export interface PersistenceProviderProps {
  children: ReactNode;

  /** Initial project ID to load */
  initialProjectId?: string;

  /** Enable auto-save (default: true) */
  autoSave?: boolean;

  /** Auto-save delay in ms (default: 30000) */
  autoSaveDelay?: number;

  /** Enable debug logging */
  debug?: boolean;
}

export const PersistenceProvider: React.FC<PersistenceProviderProps> = ({
  children,
  initialProjectId,
  autoSave = true,
  autoSaveDelay = 30000,
  debug = false,
}) => {
  // State
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  // CRITICAL: Ref to store the most recent project for immediate access
  // This solves the async state update timing issue where getProjectData
  // would return stale data before React state update propagated
  const currentProjectRef = useRef<Project | null>(null);
  const [syncCallback, setSyncCallback] = useState<(() => void) | null>(null);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [isUntitledProject, setIsUntitledProject] = useState(false);
  const [projectFormat, setProjectFormat] = useState<ProjectFormat>('indexeddb');
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const directoryAdapterRef = useRef<DirectoryAdapter | null>(null);
  /** Latest saveAsDirectory — handleAfterSave is defined before it and needs
   *  it for default-location adoption. */
  const saveAsDirectoryRef = useRef<((dirPath: string) => Promise<boolean>) | null>(null);
  /** One adoption at a time; a failed adoption must not retry every save. */
  const adoptionAttemptedRef = useRef<Set<string>>(new Set());
  /** External-change watcher teardown for the active directory project. */
  const unwatchRef = useRef<(() => void) | null>(null);
  /** Timestamp of our own last filesystem write — watcher events landing
   *  within the suppression window after it are our own saves echoing back,
   *  not an external edit. */
  const lastOwnWriteRef = useRef<number>(0);
  /** One external-change warning per project per session — the point is
   *  awareness, not a nag on every sync-daemon touch. */
  const externalWarnedRef = useRef<Set<string>>(new Set());
  // Track which asset IDs have already been written to the filesystem
  // so we can skip unchanged assets on subsequent saves
  const savedAssetIdsRef = useRef<Set<string>>(new Set());
  // CRITICAL: Ref for immediate synchronous access to isUntitledProject
  // This solves the async state update timing issue where getProjectData
  // would check stale state before React state update propagated
  const isUntitledProjectRef = useRef(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<string | null>(null);

  // Managers (created once)
  const [storage] = useState(() => getStorageManager({ debug }));
  const [commandManager] = useState(() => new CommandManager({
    projectId: initialProjectId,
    maxHistory: 50,
    autoSave: true,
    debug,
  }));

  // Command manager state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /**
   * Get current project data for auto-save
   */
  const getProjectData = useCallback(() => {
    // CRITICAL FIX: Use ref for immediate access to most recent project
    // This solves the async state update timing issue
    const projectToUse = currentProjectRef.current || currentProject;

    if (!projectToUse) {
      throw new Error('No current project');
    }

    // CRITICAL FIX: For untitled projects, throw error to prevent auto-save
    // This forces the user to manually save (which opens Save Project dialog)
    // Check BOTH the ref AND the actual project name for robustness
    // The project name check is the authoritative source - if it's named, it's saveable
    const isActuallyUntitled = projectToUse.name === 'Untitled Project';
    if (isActuallyUntitled) {
      console.log('[PersistenceContext] getProjectData - BLOCKING auto-save for untitled project:', projectToUse.name);
      throw new Error('Cannot auto-save untitled project');
    }

    // Sync ref with actual project name in case they got out of sync
    if (isUntitledProjectRef.current !== isActuallyUntitled) {
      console.log('[PersistenceContext] getProjectData - Syncing isUntitledProjectRef:', isActuallyUntitled);
      isUntitledProjectRef.current = isActuallyUntitled;
    }

    // Sync project data before retrieving if sync callback is registered
    // This ensures current beats, characters, etc. are saved to the project story
    // IMPORTANT: Must sync BEFORE checking isDefaultProject so we check actual beats
    if (syncCallback && debug) {
      console.log('[PersistenceContext] getProjectData - Syncing project data before save...');
    }
    syncCallback?.();

    // After sync, get the most recent project from ref (sync updates the ref)
    const finalProject = currentProjectRef.current || projectToUse;

    // CRITICAL FIX: Skip auto-save for default/empty projects (3 default beats only)
    // These clutter the project library with empty projects
    // NOTE: Check AFTER sync so we check the actual current beats, not stale data
    if (isDefaultProject(finalProject)) {
      console.log('[PersistenceContext] getProjectData - Skipping auto-save for empty default project:', finalProject.name);
      throw new Error('Cannot auto-save empty default project');
    }

    const story = (finalProject as any).story;
    const beats = story?.beats;
    const beatsCount = beats ? (Array.isArray(beats) ? beats.length : beats.size || 0) : 0;

    if (debug) {
      console.log('[PersistenceContext] getProjectData - AFTER SYNC:', {
        projectId: finalProject.id,
        projectName: finalProject.name,
        beatsCount: beatsCount,
        hasStory: !!story,
        storyKeys: story ? Object.keys(story) : 'no story'
      });
    }

    return finalProject;
  }, [currentProject, syncCallback, debug]);

  /**
   * Callback to also persist to the filesystem for directory-format projects.
   * Called by useAutoSave after each successful IndexedDB save.
   * Loads project assets from IndexedDB and writes them alongside the JSON files.
   */
  /**
   * Watch a directory project for EXTERNAL edits — a synced folder pulling a
   * colleague's changes, a text editor touching a beat file, git checkout.
   * The adapter had watchForChanges since the directory format landed;
   * nothing ever called it. Events within the suppression window after our
   * own writes are our own saves echoing back and are ignored.
   */
  const startExternalWatch = useCallback((adapter: DirectoryAdapter, projectId: string) => {
    unwatchRef.current?.();
    unwatchRef.current = null;
    try {
      unwatchRef.current = adapter.watchForChanges((events) => {
        if (Date.now() - lastOwnWriteRef.current < 5000) return;
        if (externalWarnedRef.current.has(projectId)) return;
        externalWarnedRef.current.add(projectId);
        const files = events.slice(0, 3).map((e) => e.path).join(', ');
        console.warn('[PersistenceContext] Project files changed OUTSIDE the app:', files);
        window.dispatchEvent(new CustomEvent('asaps:externalProjectChange', {
          detail: { projectId, files: events.map((e) => e.path) },
        }));
        alert(
          'This project\u2019s files changed outside ASAPS (sync, git, or another editor).\n\n'
          + `Changed: ${files}${events.length > 3 ? ` and ${events.length - 3} more` : ''}\n\n`
          + 'Your open copy still shows the state from before the change. If the outside '
          + 'edit matters, reopen the project from the library to load it \u2014 saving now '
          + 'will overwrite the outside change.'
        );
      });
    } catch (e) {
      console.warn('[PersistenceContext] Could not start external-change watch:', e);
    }
  }, []);

  const handleAfterSave = useCallback(async (project: Project) => {
    // ---- Default-location adoption (storage inversion, desktop only) ----
    // A project born this session (created / generated / injected / imported)
    // becomes folder-canonical at ~/Documents/ASAPS Projects/<name>/ on its
    // first NAMED save — silently, the GarageBand move. Untitled projects
    // wait until they have a real name (they are freely discarded);
    // pre-existing library projects never adopt here (explicit migration
    // covers them).
    if (
      isElectronWithFS() &&
      !directoryAdapterRef.current &&
      project.storageFormat !== 'directory' &&
      project.name &&
      // The untitled state, not the name sentinel: 'Untitled Project' is only
      // one of the spellings (the Empty-project flow names its scratch
      // project after the default story title). Adopting an untitled project
      // would mint a folder from a name the author never chose — the live
      // test produced "My Interactive Story/" while the author typed
      // "Inversion Test Alpha" into the save dialog moments later.
      !isUntitledProjectRef.current &&
      // Only the project the author is actually IN adopts — a late save of a
      // just-replaced scratch project must not race its named descendant.
      project.id === (currentProjectRef.current?.id ?? project.id) &&
      !adoptionAttemptedRef.current.has(project.id) &&
      consumeProjectNew(project.id)
    ) {
      adoptionAttemptedRef.current.add(project.id);
      try {
        const api = (window as any).electronAPI;
        const documents: string = await api.app.getPath('documents');
        const baseDir = `${documents}/ASAPS Projects`;
        await api.fs.mkdir(baseDir).catch(() => undefined);
        const folderBase = sanitizeFolderName(project.name);
        let dirPath = `${baseDir}/${folderBase}`;
        for (let i = 2; await api.fs.exists(dirPath); i++) {
          dirPath = `${baseDir}/${folderBase} ${i}`;
        }
        const ok = await saveAsDirectoryRef.current?.(dirPath);
        if (ok) {
          console.log('[PersistenceContext] New project adopted into default location:', dirPath);
        } else {
          console.warn('[PersistenceContext] Default-location adoption failed — project stays in browser storage');
        }
      } catch (e) {
        // Adoption is an upgrade, never a gate: the IndexedDB save that just
        // succeeded remains the project's home if the filesystem says no.
        console.warn('[PersistenceContext] Default-location adoption error:', e);
      }
      return;
    }

    const adapter = directoryAdapterRef.current;
    if (!adapter || !adapter.getProjectPath()) return;

    lastOwnWriteRef.current = Date.now();
    try {
      // Load assets from IndexedDB for this project
      let assetsToSave: import('../storage').StoredAsset[] | undefined;
      try {
        const assetsResult = await storage.getProjectAssets(project.id);
        if (assetsResult.success && assetsResult.data && assetsResult.data.length > 0) {
          // Only include assets that haven't been saved yet (optimization)
          const newAssets = assetsResult.data.filter(
            (a) => !savedAssetIdsRef.current.has(a.id)
          );

          if (newAssets.length > 0) {
            assetsToSave = newAssets;
            // Mark them as saved after successful write
            for (const a of newAssets) {
              savedAssetIdsRef.current.add(a.id);
            }
            if (debug) {
              console.log(`[PersistenceContext] Writing ${newAssets.length} new asset(s) to filesystem`);
            }
          }
        }
      } catch (assetErr) {
        console.warn('[PersistenceContext] Failed to load assets for filesystem save:', assetErr);
        // Continue — JSON files still get written
      }

      await adapter.saveProject(project, assetsToSave);
      if (debug) {
        console.log('[PersistenceContext] Directory project saved to filesystem');
      }
    } catch (err) {
      console.error('[PersistenceContext] Failed to save to filesystem:', err);
    }
  }, [storage, debug]);

  /**
   * Auto-save hook
   */
  const {
    status: saveStatus,
    lastSaved,
    error: saveError,
    saveNow,
    markChanged,
    cancelPending,
    pause,
    resume,
    isPaused,
  } = useAutoSave(getProjectData, {
    enabled: autoSave && !!currentProject,
    delay: autoSaveDelay,
    debug,
    onAfterSave: handleAfterSave,
  });

  // Expose pause/resume for auto-save
  const pauseAutoSave = pause;
  const resumeAutoSave = resume;
  const isAutoSavePaused = isPaused;

  /**
   * Initialize storage and load initial project
   */
  useEffect(() => {
    const init = async () => {
      try {
        await storage.init();

        if (initialProjectId) {
          const result = await storage.getProject(initialProjectId);
          if (result.success && result.data) {
            currentProjectRef.current = result.data;
            setCurrentProject(result.data);
            commandManager.setProjectId(initialProjectId);
            await commandManager.loadFromStorage();
          }
        }

        setInitialized(true);
      } catch (error) {
        console.error('[PersistenceProvider] Initialization failed:', error);
        setInitError(error as Error);
      }
    };

    init();
  }, [storage, commandManager, initialProjectId]);

  /**
   * Subscribe to command manager changes
   */
  useEffect(() => {
    const unsubscribe = commandManager.subscribe(() => {
      setCanUndo(commandManager.canUndo());
      setCanRedo(commandManager.canRedo());
    });

    return unsubscribe;
  }, [commandManager]);

  /**
   * Execute a command
   */
  const executeCommand = useCallback(async (command: Command) => {
    await commandManager.execute(command);
    markChanged(); // Trigger auto-save
  }, [commandManager, markChanged]);

  /**
   * Undo
   */
  const undo = useCallback(async () => {
    await commandManager.undo();
    markChanged();
  }, [commandManager, markChanged]);

  /**
   * Redo
   */
  const redo = useCallback(async () => {
    await commandManager.redo();
    markChanged();
  }, [commandManager, markChanged]);

  /**
   * Load a project
   */
  const loadProject = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      // Cancel any pending auto-save before loading new project
      // This prevents stale error/pending states from persisting
      cancelPending();

      // CRITICAL: If currently on an untitled project, discard it before loading new one
      // This prevents accumulation of "Untitled Project" entries in storage
      const currentProj = currentProjectRef.current;
      if (currentProj && currentProj.name === 'Untitled Project' && isUntitledProjectRef.current) {
        console.log('[PersistenceProvider] Discarding untitled project before loading:', currentProj.id);
        try {
          await storage.deleteProject(currentProj.id);
        } catch (e) {
          console.warn('[PersistenceProvider] Failed to delete untitled project:', e);
        }
        // Clear untitled state
        isUntitledProjectRef.current = false;
        setIsUntitledProject(false);
      }

      const result = await storage.getProject(projectId);

      if (!result.success || !result.data) {
        console.error('[PersistenceProvider] Project not found:', projectId);
        return false;
      }

      const loadedProject = result.data;
      setProjectId(projectId);

      // CRITICAL: Set isUntitledProject based on the LOADED project's name
      // This ensures a saved project with a real name doesn't show "Cannot auto-save"
      const isUntitled = loadedProject.name === 'Untitled Project';
      isUntitledProjectRef.current = isUntitled;
      setIsUntitledProject(isUntitled);
      console.log('[PersistenceProvider] Project loaded, isUntitledProject:', isUntitled);

      // Restore directory-format state if the project was previously saved as a directory
      // CRITICAL: Do this BEFORE setCurrentProject so translations are already on the
      // project object when App.tsx's load effect processes it. Otherwise React sees
      // the same object reference on the second setCurrentProject and skips the re-render,
      // meaning translations never get loaded into TranslationContext.
      if (loadedProject.storageFormat === 'directory' && loadedProject.directoryPath && isElectronWithFS()) {
        const dirPath = loadedProject.directoryPath;
        const pathValid = await validateDirectoryPath(dirPath);

        if (pathValid) {
          console.log('[PersistenceProvider] Restoring directory project state:', dirPath);
          const adapter = new DirectoryAdapter();
          adapter.setProjectPath(dirPath);
          directoryAdapterRef.current = adapter;
          startExternalWatch(adapter, loadedProject.id);
          savedAssetIdsRef.current = new Set();
          setProjectFormat('directory');
          setProjectPath(dirPath);

          // Re-read full project from disk (IndexedDB copy may be stale after
          // external changes, e.g. git operations outside the app)
          try {
            const freshProject = await adapter.openProject(dirPath);
            // Merge all data from disk into the loaded project
            if (freshProject.story) loadedProject.story = freshProject.story;
            if (freshProject.settings) loadedProject.settings = freshProject.settings;
            if (freshProject.translations && freshProject.translations.length > 0) {
              loadedProject.translations = freshProject.translations;
              loadedProject.translationManifest = freshProject.translationManifest;
            }
            console.log('[PersistenceProvider] Restored directory project from disk:', dirPath);
          } catch (e) {
            console.warn('[PersistenceProvider] Failed to re-read project from disk:', e);
          }
        } else {
          // Directory no longer exists — fall back to IndexedDB mode
          console.warn('[PersistenceProvider] Directory path stale, falling back to IndexedDB:', dirPath);
          loadedProject.directoryPath = null;
          loadedProject.storageFormat = 'indexeddb';
          setProjectFormat('indexeddb');
          setProjectPath(null);
          directoryAdapterRef.current = null;
          // Persist the cleared fields
          try {
            await storage.updateProject(loadedProject);
          } catch (e) {
            console.warn('[PersistenceProvider] Failed to clear stale directory metadata:', e);
          }
          // Emit a custom event so App.tsx can show a warning toast
          window.dispatchEvent(new CustomEvent('asaps:stale-directory', { detail: { dirPath } }));
        }
      } else {
        // Not a directory project — ensure state is clean
        setProjectFormat('indexeddb');
        setProjectPath(null);
        directoryAdapterRef.current = null;
      }

      // CRITICAL: Set currentProject ONCE with fully-prepared data (including translations)
      // This ensures App.tsx's load effect sees translations on the first render
      currentProjectRef.current = loadedProject;
      setCurrentProject(loadedProject);

      // Update command manager
      commandManager.setProjectId(projectId);
      await commandManager.loadFromStorage();

      return true;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to load project:', error);
      return false;
    }
  }, [storage, commandManager, cancelPending]);

  /**
   * Create a new project
   */
  const createProject = useCallback(async (
    name: string,
    description?: string
  ): Promise<string> => {
    try {
      const { v4: uuidv4 } = await import('uuid');
      const newProjectId = uuidv4();

      // Auto-uniquify the name against existing projects so AI generation
      // (which often produces convergent titles for the same prompt) and
      // any other create path don't silently produce duplicates. The
      // 'Untitled Project' sentinel is exempt because the auto-save
      // logic below treats it specially — uniquifying it would defeat
      // the "untitled means don't auto-save yet" check. Untitled
      // projects also don't appear in the library list so collisions
      // there are harmless.
      let resolvedName = name;
      if (name !== 'Untitled Project') {
        try {
          const listResult = await storage.listProjects();
          if (listResult.success && Array.isArray(listResult.data)) {
            const existingNames = listResult.data.map((p: Project) => p.name);
            resolvedName = findUniqueProjectName(name, existingNames);
            if (resolvedName !== name) {
              console.log(`[PersistenceProvider] Project name "${name}" already in use; using "${resolvedName}"`);
            }
          }
        } catch (err) {
          // Non-fatal — if listing fails, proceed with the requested
          // name and let any downstream uniqueness constraint handle it.
          console.warn('[PersistenceProvider] Could not list projects for name uniqueness check:', err);
        }
      }

      // Create a new Story instance
      const story = new (await import('@asaps/core')).Story({
        title: resolvedName,
        firstBeatId: '',
      });

      const newProject: Project = {
        id: newProjectId,
        name: resolvedName,
        description,
        story: story as any, // Cast needed - Story class vs serialized format
        settings: {
          width: 1024,
          height: 768,
          fonts: ['Arial', 'Helvetica', 'sans-serif'],
        },
        assetIds: [],
        createdAt: new Date(),
        modifiedAt: new Date(),
        version: '1.0.0',
      };

      const result = await storage.createProject(newProject);

      if (!result.success) {
        throw result.error || new Error('Failed to create project');
      }

      // Born this session — eligible for default-location folder adoption on
      // its first named save (the storage-inversion rule for NEW projects).
      markProjectNew(newProjectId);

      // Reset directory format state — new projects start as IndexedDB and
      // are adopted into a folder by the save pipeline.
      setProjectFormat('indexeddb');
      setProjectPath(null);
      directoryAdapterRef.current = null;
      savedAssetIdsRef.current = new Set();

      currentProjectRef.current = newProject;
      setCurrentProject(newProject);
      setProjectId(newProjectId);
      commandManager.setProjectId(newProjectId);
      commandManager.clear();

      // CRITICAL: Set isUntitledProject based on the project name
      // This ensures auto-save is blocked for untitled projects but enabled for named ones
      if (name === 'Untitled Project') {
        isUntitledProjectRef.current = true;
        setIsUntitledProject(true);
        console.log('[PersistenceProvider] Created untitled project - auto-save blocked');
      } else {
        // CRITICAL FIX: Reset the ref for named projects
        // This ensures auto-save works after the user saves with a name
        isUntitledProjectRef.current = false;
        setIsUntitledProject(false);
        console.log('[PersistenceProvider] Created named project - auto-save enabled');
      }

      return newProjectId;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to create project:', error);
      throw error;
    }
  }, [storage, commandManager]);

  /**
   * Delete a project
   */
  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      const result = await storage.deleteProject(projectId);

      if (!result.success) {
        return false;
      }

      // If deleting current project, clear state
      if (projectId === currentProject?.id) {
        currentProjectRef.current = null;
        setCurrentProject(null);
        setProjectId(null);
        commandManager.clear();
      }

      return true;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to delete project:', error);
      return false;
    }
  }, [storage, commandManager, currentProject]);

  /**
   * Update project metadata
   */
  const updateProjectMetadata = useCallback(async (
    updates: Partial<Pick<Project, 'name' | 'description' | 'themeId' | 'assetsPath'>>
  ) => {
    if (!currentProject) {
      throw new Error('No current project');
    }

    const updatedProject = {
      ...currentProject,
      ...updates,
      modifiedAt: new Date(),
    };

    currentProjectRef.current = updatedProject;
    setCurrentProject(updatedProject);
    markChanged();
  }, [currentProject, markChanged]);

  /**
   * Update project story data (for syncing story state)
   * CRITICAL FIX: Handle Story class instances properly
   */
  const updateProjectStory = useCallback((storyData: Partial<any>) => {
    // CRITICAL: Use ref instead of state to get the most recent project
    // This is essential because saveCurrentProject updates the ref before calling saveNow(),
    // but the state hasn't propagated yet. Using the ref ensures we update the NEW project,
    // not overwrite it with the old one.
    const projectToUpdate = currentProjectRef.current || currentProject;

    if (!projectToUpdate) {
      console.warn('[PersistenceContext] No current project to update story');
      return;
    }

    // DEBUG: Log what's being updated
    console.log('[PersistenceContext] updateProjectStory - BEFORE:', {
      projectId: projectToUpdate.id,
      projectName: projectToUpdate.name,
      storyKeys: Object.keys(projectToUpdate.story || {}),
      storyBeatsCount: (projectToUpdate.story as any)?.beats ? (Array.isArray((projectToUpdate.story as any).beats) ? (projectToUpdate.story as any).beats.length : 'not array') : 0,
      storyConstructor: projectToUpdate.story?.constructor?.name
    });

    // CRITICAL FIX: Check if story is a Story class instance
    // If so, we need to convert it to a plain object before merging
    const isStoryClass = projectToUpdate.story?.constructor?.name === 'Story';
    let newStory: any;

    if (isStoryClass) {
      console.log('[PersistenceContext] Story is a Story class instance, converting to plain object');
      // Convert Story instance to plain object by extracting its data
      const story = projectToUpdate.story as any;

      // CRITICAL: Serialize beats with toJSON() to capture derived connections
      // from choices/props arrays (MovementChoice, PickProp, HyperText, etc.)
      const rawBeats = story.getAllBeats ? story.getAllBeats() : (story.beats instanceof Map ? Array.from(story.beats.values()) : []);
      const serializedBeats = rawBeats.map((beat: any) => {
        if (typeof beat.toJSON === 'function') {
          return beat.toJSON();
        }
        return beat;
      });

      newStory = {
        // Start with serialized story data
        beats: serializedBeats,
        metadata: story.getMetadata ? story.getMetadata() : story.metadata,
        settings: story.getSettings ? story.getSettings() : story.settings,
        environment: story.getEnvironment ? story.getEnvironment() : story.environment,
        characters: story.getCharacters ? story.getCharacters() : story.characters,
        clusters: story.getClusters ? story.getClusters() : story.clusters,
        connections: story.getConnections ? story.getConnections() : story.connections,
        containerBeatPositions: story.containerBeatPositions || [],
        assets: story.assets || [],
        emotionPalette: story.getEmotionPalette ? story.getEmotionPalette() : story.emotionPalette,
        traitModulations: story.getTraitModulations ? story.getTraitModulations() : story.traitModulations,
        // Then apply the updates from storyData
        ...storyData,
      };
    } else {
      // Story is already a plain object, use spread operator
      newStory = {
        ...projectToUpdate.story,
        ...storyData,
      };
    }

    // ONE-NAME MODEL: the project name and the story title are the same
    // concept to authors ("renaming the project"), so the name always
    // follows the title on save. The Browser card's rename-in-place writes
    // both fields too (App.handleRenameProject), so the two edit points
    // converge instead of silently diverging — divergence was the bug:
    // header renames persisted in the story while every project-name
    // surface (library card, banner, window title) kept the old name.
    const nextTitle = (storyData as any)?.title ?? (storyData as any)?.metadata?.title;
    const nameFollowsTitle =
      typeof nextTitle === 'string' &&
      nextTitle.trim().length > 0 &&
      nextTitle !== projectToUpdate.name;

    const updatedProject = {
      ...projectToUpdate,
      ...(nameFollowsTitle ? { name: nextTitle } : {}),
      story: newStory as any,
      modifiedAt: new Date(),
    };
    if (nameFollowsTitle) {
      console.log('[PersistenceContext] Project name follows story title:', nextTitle);
    }

    // DEBUG: Log the updated project
    console.log('[PersistenceContext] updateProjectStory - AFTER:', {
      projectId: updatedProject.id,
      storyKeys: Object.keys(updatedProject.story || {}),
      storyBeatsCount: (updatedProject.story as any)?.beats ? (Array.isArray((updatedProject.story as any).beats) ? (updatedProject.story as any).beats.length : 'not array') : 0,
      beatsArrayLength: Array.isArray((updatedProject.story as any)?.beats) ? (updatedProject.story as any).beats.length : (updatedProject.story as any)?.beats?.size || 0
    });

    // CRITICAL: Update ref FIRST for immediate access (before async state update)
    currentProjectRef.current = updatedProject;
    setCurrentProject(updatedProject);
    // Note: Don't call markChanged() here - let the caller decide when to trigger auto-save
  }, [currentProject]);

  /**
   * Update project's global settings (per-project settings persistence)
   * This directly saves to IndexedDB to ensure settings persist even for untitled projects
   */
  const updateProjectGlobalSettings = useCallback(async (settings: GlobalSettings) => {
    const projectToUpdate = currentProjectRef.current || currentProject;

    if (!projectToUpdate) {
      console.warn('[PersistenceContext] No current project to update global settings');
      return;
    }

    console.log('[PersistenceContext] updateProjectGlobalSettings - Updating global settings');

    const updatedProject = {
      ...projectToUpdate,
      globalSettings: settings,
      modifiedAt: new Date(),
    };

    currentProjectRef.current = updatedProject;
    setCurrentProject(updatedProject);

    // CRITICAL: Directly save to IndexedDB to ensure persistence
    // This bypasses auto-save restrictions for untitled projects
    // because when user explicitly saves settings, they should be persisted
    try {
      const result = await storage.updateProject(updatedProject);
      if (result.success) {
        console.log('[PersistenceContext] Global settings saved to IndexedDB');
      } else {
        console.error('[PersistenceContext] Failed to save global settings:', result.error);
      }
    } catch (error) {
      console.error('[PersistenceContext] Error saving global settings to IndexedDB:', error);
    }
  }, [currentProject, storage]);

  /**
   * Save current project with a new name (convert from untitled to named)
   */
  const saveCurrentProject = useCallback(async (
    name: string,
    description?: string
  ): Promise<string> => {
    // CRITICAL FIX: Sync current React state (beats, connections, etc.) to project
    // BEFORE reading from the ref. This ensures injected beats are captured.
    if (syncCallback) {
      console.log('[PersistenceContext] saveCurrentProject - Syncing project data before save...');
      syncCallback();
    }

    // CRITICAL: Use currentProjectRef.current instead of currentProject state
    // The ref has the immediately updated value from syncProjectData,
    // whereas currentProject state may be stale due to React's async updates
    const projectToSave = currentProjectRef.current || currentProject;

    if (!projectToSave) {
      throw new Error('No current project to save');
    }

    try {
      const { v4: uuidv4 } = await import('uuid');
      const newProjectId = uuidv4();

      console.log('[PersistenceContext] saveCurrentProject - Creating new project:', {
        name,
        sourceProjectId: projectToSave.id,
        storyBeatsCount: (projectToSave.story as any)?.beats?.length || 0,
      });

      // Create new named project with current project data
      const namedProject: Project = {
        ...projectToSave,
        id: newProjectId,
        name,
        description,
        modifiedAt: new Date(),
      };

      const result = await storage.createProject(namedProject);

      if (!result.success) {
        throw result.error || new Error('Failed to save project');
      }

      // The named descendant of an untitled project is also born-this-session
      // — and it REPLACES the scratch project in the adoption line. Unmark
      // the scratch: leaving it marked let any late auto-save of the old
      // project adopt a folder named after the scratch title the author
      // never chose (live test: "My Interactive Story/" while the author had
      // just typed "Inversion Test Alpha").
      consumeProjectNew(projectToSave.id);
      markProjectNew(newProjectId);

      // CRITICAL: Migrate assets from old project to new project BEFORE deleting old project
      // This ensures assets are associated with the new project ID
      try {
        const adapter = getStorageAdapter();
        await adapter.initialize();
        const migratedCount = await adapter.migrateProjectAssets(projectToSave.id, newProjectId);
        console.log(`[PersistenceContext] Migrated ${migratedCount} assets to new project`);
      } catch (migrateError) {
        console.error('[PersistenceContext] Failed to migrate assets:', migrateError);
        // Continue - project is saved, assets might need manual recovery
      }

      // Delete the old untitled project if it was "Untitled Project"
      // This prevents accumulation of ghost untitled projects
      if (projectToSave.name === 'Untitled Project') {
        console.log('[PersistenceContext] Deleting old untitled project:', projectToSave.id);
        try {
          await storage.deleteProject(projectToSave.id);
        } catch (deleteError) {
          console.warn('[PersistenceContext] Failed to delete old untitled project:', deleteError);
          // Non-fatal - continue with saving the new project
        }
      }

      // Update state to reflect new named project
      currentProjectRef.current = namedProject;
      setCurrentProject(namedProject);
      setProjectId(newProjectId);
      // CRITICAL: Update ref FIRST for immediate synchronous access
      // This ensures getProjectData (called by saveNow) sees the updated value
      // before React's async state update propagates
      isUntitledProjectRef.current = false;
      setIsUntitledProject(false);
      // Note: hasUnsavedChanges will be cleared by saveNow() which sets status to 'saved'
      commandManager.setProjectId(newProjectId);
      commandManager.clear();

      // Trigger a save to ensure everything is persisted
      // Now getProjectData will see isUntitledProjectRef.current = false
      await saveNow();

      return newProjectId;
    } catch (error) {
      console.error('[PersistenceContext] Failed to save current project:', error);
      throw error;
    }
  }, [currentProject, storage, commandManager, saveNow, syncCallback]);

  /**
   * Open a directory-format project from the filesystem (Electron only)
   */
  const openDirectoryProject = useCallback(async (dirPath: string): Promise<boolean> => {
    if (!isElectronWithFS()) {
      console.error('[PersistenceProvider] Directory projects require Electron');
      return false;
    }

    try {
      // Cancel any pending auto-save
      cancelPending();

      const adapter = new DirectoryAdapter();
      const project = await adapter.openProject(dirPath);

      // Stamp directory metadata on the project for session persistence
      project.directoryPath = dirPath;
      project.storageFormat = 'directory';

      directoryAdapterRef.current = adapter;
      startExternalWatch(adapter, project.id);
      savedAssetIdsRef.current = new Set(); // Reset saved asset tracking for new project
      currentProjectRef.current = project;
      setCurrentProject(project);
      setProjectId(project.id);
      setProjectFormat('directory');
      setProjectPath(dirPath);
      isUntitledProjectRef.current = false;
      setIsUntitledProject(false);

      // Also save to IndexedDB so existing flows work (including directory metadata)
      try {
        const result = await storage.getProject(project.id);
        if (result.success && result.data) {
          await storage.updateProject(project);
        } else {
          await storage.createProject(project);
        }
      } catch (e) {
        console.warn('[PersistenceProvider] Failed to sync directory project to IndexedDB:', e);
      }

      // Register directory assets in HybridStorageAdapter so the UI can find them
      const manifest = adapter.getManifest();
      if (manifest && Object.keys(manifest.assets).length > 0) {
        try {
          const hybridAdapter = getStorageAdapter();
          await hybridAdapter.initialize();
          const sep = dirPath.includes('\\') ? '\\' : '/';
          const assetsDir = dirPath + sep + 'assets';
          const count = await hybridAdapter.registerDirectoryAssets(project.id, assetsDir, manifest.assets);
          console.log('[PersistenceProvider] Registered', count, 'directory assets');
        } catch (e) {
          console.warn('[PersistenceProvider] Failed to register directory assets:', e);
        }
      }

      commandManager.setProjectId(project.id);
      commandManager.clear();

      console.log('[PersistenceProvider] Opened directory project:', dirPath);
      return true;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to open directory project:', error);
      return false;
    }
  }, [storage, commandManager, cancelPending]);

  /**
   * Save the current project as a directory-format project (Electron only)
   */
  const saveAsDirectory = useCallback(async (dirPath: string): Promise<boolean> => {
    if (!isElectronWithFS()) {
      console.error('[PersistenceProvider] Directory projects require Electron');
      return false;
    }

    // Sync current state
    syncCallback?.();
    const projectToSave = currentProjectRef.current;
    if (!projectToSave) {
      console.error('[PersistenceProvider] No project to save');
      return false;
    }

    try {
      // Load all assets so they're included in the initial directory save
      let assets: import('../storage').StoredAsset[] | undefined;
      try {
        const assetsResult = await storage.getProjectAssets(projectToSave.id);
        if (assetsResult.success && assetsResult.data && assetsResult.data.length > 0) {
          assets = assetsResult.data;
        }
      } catch (assetErr) {
        console.warn('[PersistenceProvider] Failed to load assets for saveAsDirectory:', assetErr);
      }

      const adapter = new DirectoryAdapter();
      adapter.setProjectPath(dirPath);
      lastOwnWriteRef.current = Date.now();
      await adapter.saveProject(projectToSave, assets);

      directoryAdapterRef.current = adapter;
      startExternalWatch(adapter, projectToSave.id);
      savedAssetIdsRef.current = new Set(assets?.map((a) => a.id) || []);
      setProjectFormat('directory');
      setProjectPath(dirPath);

      // Stamp directory metadata on the project and persist to IndexedDB
      const updatedProject = {
        ...projectToSave,
        directoryPath: dirPath,
        storageFormat: 'directory' as const,
        modifiedAt: new Date(),
      };
      currentProjectRef.current = updatedProject;
      setCurrentProject(updatedProject);
      try {
        await storage.updateProject(updatedProject);
      } catch (e) {
        console.warn('[PersistenceProvider] Failed to persist directory metadata to IndexedDB:', e);
      }

      console.log('[PersistenceProvider] Saved project as directory:', dirPath);
      return true;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to save as directory:', error);
      return false;
    }
  }, [storage, syncCallback, startExternalWatch]);
  saveAsDirectoryRef.current = saveAsDirectory;

  /**
   * Clear untitled project state (mark as not untitled)
   */
  const clearUntitledState = useCallback(() => {
    isUntitledProjectRef.current = false;
    setIsUntitledProject(false);
    setPendingNavigationAction(null);
  }, []);

  /**
   * Discard the current untitled project (delete from storage without saving)
   * Used when user navigates away from an unmodified untitled project
   */
  const discardUntitledProject = useCallback(async () => {
    const projectToDiscard = currentProjectRef.current || currentProject;

    if (!projectToDiscard) {
      return;
    }

    // Only discard if it's an untitled project
    if (projectToDiscard.name !== 'Untitled Project') {
      return;
    }

    console.log('[PersistenceContext] Discarding untitled project:', projectToDiscard.id);

    try {
      await storage.deleteProject(projectToDiscard.id);
      console.log('[PersistenceContext] Successfully discarded untitled project');
    } catch (error) {
      console.warn('[PersistenceContext] Failed to discard untitled project:', error);
      // Non-fatal - continue anyway
    }

    // Clear state
    currentProjectRef.current = null;
    setCurrentProject(null);
    setProjectId(null);
    isUntitledProjectRef.current = false;
    setIsUntitledProject(false);
    commandManager.clear();
  }, [currentProject, storage, commandManager]);

  /**
   * Wrapped setter that updates both ref and state
   * This ensures the ref is always in sync with the state
   */
  const setIsUntitledProjectWithRef = useCallback((isUntitled: boolean) => {
    isUntitledProjectRef.current = isUntitled;
    setIsUntitledProject(isUntitled);
  }, []);

  /**
   * Register sync callback for syncing story data before save
   */
  const registerSyncCallback = useCallback((callback: () => void) => {
    if (debug) {
      console.log('[PersistenceContext] Registering sync callback');
    }
    setSyncCallback(() => callback);
  }, [debug]);

  /**
   * Unregister sync callback
   */
  const unregisterSyncCallback = useCallback(() => {
    if (debug) {
      console.log('[PersistenceContext] Unregistering sync callback');
    }
    setSyncCallback(null);
  }, [debug]);

  // Asset deletion for directory projects: removes the binary on disk +
  // prunes the manifest entry. Wired through here (not directly from the
  // asset UI) so we can route through the active DirectoryAdapter.
  const deleteAssetFromDirectory = useCallback(async (assetId: string): Promise<void> => {
    const adapter = directoryAdapterRef.current;
    if (!adapter || !adapter.getProjectPath()) return;
    try {
      await adapter.deleteAsset(assetId);
      // The asset id is no longer "saved" — drop from the optimisation set
      // so a future re-add of the same id (re-imported) actually writes again.
      savedAssetIdsRef.current.delete(assetId);
    } catch (err) {
      console.warn('[PersistenceContext] deleteAssetFromDirectory failed:', err);
    }
  }, []);

  // Context value
  const value: PersistenceContextValue = {
    currentProject,
    projectId,
    isUntitledProject,
    hasUnsavedChanges: saveStatus === 'pending',
    storage,
    commandManager,
    executeCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    saveStatus,
    lastSaved,
    saveError,
    saveNow,
    markChanged,
    pauseAutoSave,
    resumeAutoSave,
    isAutoSavePaused,
    loadProject,
    createProject,
    deleteProject,
    updateProjectMetadata,
    updateProjectStory,
    updateProjectGlobalSettings,
    saveCurrentProject,
    setIsUntitledProject: setIsUntitledProjectWithRef,
    clearUntitledState,
    discardUntitledProject,
    registerSyncCallback,
    unregisterSyncCallback,
    projectFormat,
    projectPath,
    openDirectoryProject,
    saveAsDirectory,
    deleteAssetFromDirectory,
    initialized,
    initError,
  };

  return (
    <PersistenceContext.Provider value={value}>
      {children}
    </PersistenceContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access persistence context
 */
export function usePersistence(): PersistenceContextValue {
  const context = useContext(PersistenceContext);

  if (!context) {
    throw new Error('usePersistence must be used within a PersistenceProvider');
  }

  return context;
}

/**
 * Hook to access just the command system (undo/redo)
 */
export function useCommands() {
  const { executeCommand, undo, redo, canUndo, canRedo, commandManager } = usePersistence();

  return {
    execute: executeCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    manager: commandManager,
  };
}

/**
 * Hook to access just the save system
 */
export function useSave() {
  const { saveStatus, lastSaved, saveError, saveNow, markChanged } = usePersistence();

  return {
    status: saveStatus,
    lastSaved,
    error: saveError,
    saveNow,
    markChanged,
  };
}

/**
 * Hook to access project management
 */
export function useProject() {
  const {
    currentProject,
    projectId,
    loadProject,
    createProject,
    deleteProject,
    updateProjectMetadata,
    updateProjectStory,
    updateProjectGlobalSettings,
    saveCurrentProject,
    discardUntitledProject,
    deleteAssetFromDirectory,
  } = usePersistence();

  return {
    project: currentProject,
    projectId,
    load: loadProject,
    create: createProject,
    delete: deleteProject,
    updateMetadata: updateProjectMetadata,
    updateStory: updateProjectStory,
    updateGlobalSettings: updateProjectGlobalSettings,
    saveCurrent: saveCurrentProject,
    discardUntitled: discardUntitledProject,
    deleteAssetFromDirectory,
  };
}
