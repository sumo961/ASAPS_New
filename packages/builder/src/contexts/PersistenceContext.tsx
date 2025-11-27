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
import { getStorageManager, type Project, type StorageManager } from '../storage';
import { CommandManager, type Command } from '../commands';
import { useAutoSave, type SaveStatus } from '../hooks/useAutoSave';

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

  // Project management
  loadProject: (projectId: string) => Promise<boolean>;
  createProject: (name: string, description?: string) => Promise<string>;
  deleteProject: (projectId: string) => Promise<boolean>;
  updateProjectMetadata: (updates: Partial<Pick<Project, 'name' | 'description'>>) => Promise<void>;
  updateProjectStory: (storyData: Partial<any>) => void;
  saveCurrentProject: (name: string, description?: string) => Promise<string>;

  // Untitled project management
  setIsUntitledProject: (isUntitled: boolean) => void;
  clearUntitledState: () => void;

  // Data sync callback registration
  registerSyncCallback: (callback: () => void) => void;
  unregisterSyncCallback: () => void;

  // Initialization
  initialized: boolean;
  initError: Error | null;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

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
    if (isUntitledProject) {
      console.log('[PersistenceContext] getProjectData - BLOCKING auto-save for untitled project:', projectToUse.name);
      throw new Error('Cannot auto-save untitled project');
    }

    // Sync project data before retrieving if sync callback is registered
    // This ensures current beats, characters, etc. are saved to the project story
    if (syncCallback && debug) {
      console.log('[PersistenceContext] getProjectData - Syncing project data before save...');
    }
    syncCallback?.();

    // After sync, get the most recent project from ref (sync updates the ref)
    const finalProject = currentProjectRef.current || projectToUse;

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
  }, [currentProject, syncCallback, debug, isUntitledProject]);

  /**
   * Auto-save hook
   */
  const {
    status: saveStatus,
    lastSaved,
    error: saveError,
    saveNow,
    markChanged,
  } = useAutoSave(getProjectData, {
    enabled: autoSave && !!currentProject,
    delay: autoSaveDelay,
    debug,
  });

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
      const result = await storage.getProject(projectId);

      if (!result.success || !result.data) {
        console.error('[PersistenceProvider] Project not found:', projectId);
        return false;
      }

      currentProjectRef.current = result.data;
      setCurrentProject(result.data);
      setProjectId(projectId);

      // Update command manager
      commandManager.setProjectId(projectId);
      await commandManager.loadFromStorage();

      return true;
    } catch (error) {
      console.error('[PersistenceProvider] Failed to load project:', error);
      return false;
    }
  }, [storage, commandManager]);

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

      // Create a new Story instance
      const story = new (await import('@asaps/core')).Story({
        title: name,
        firstBeatId: '',
      });

      const newProject: Project = {
        id: newProjectId,
        name,
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

      currentProjectRef.current = newProject;
      setCurrentProject(newProject);
      setProjectId(newProjectId);
      commandManager.setProjectId(newProjectId);
      commandManager.clear();

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
    updates: Partial<Pick<Project, 'name' | 'description'>>
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
    if (!currentProject) {
      console.warn('[PersistenceContext] No current project to update story');
      return;
    }

    // DEBUG: Log what's being updated
    console.log('[PersistenceContext] updateProjectStory - BEFORE:', {
      projectId: currentProject.id,
      projectName: currentProject.name,
      storyKeys: Object.keys(currentProject.story || {}),
      storyBeatsCount: (currentProject.story as any)?.beats ? (Array.isArray((currentProject.story as any).beats) ? (currentProject.story as any).beats.length : 'not array') : 0,
      storyConstructor: currentProject.story?.constructor?.name
    });

    // CRITICAL FIX: Check if story is a Story class instance
    // If so, we need to convert it to a plain object before merging
    const isStoryClass = currentProject.story?.constructor?.name === 'Story';
    let newStory: any;

    if (isStoryClass) {
      console.log('[PersistenceContext] Story is a Story class instance, converting to plain object');
      // Convert Story instance to plain object by extracting its data
      const story = currentProject.story as any;

      // CRITICAL: Serialize beats with toJSON() to capture derived connections
      // from choices/props arrays (MovementChoice, PickProp, HyperText, etc.)
      let rawBeats = story.getAllBeats ? story.getAllBeats() : (story.beats instanceof Map ? Array.from(story.beats.values()) : []);
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
        containerBeatPositions: story.containerBeatPositions || {},
        assets: story.assets || [],
        // Then apply the updates from storyData
        ...storyData,
      };
    } else {
      // Story is already a plain object, use spread operator
      newStory = {
        ...currentProject.story,
        ...storyData,
      };
    }

    const updatedProject = {
      ...currentProject,
      story: newStory as any,
      modifiedAt: new Date(),
    };

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
   * Save current project with a new name (convert from untitled to named)
   */
  const saveCurrentProject = useCallback(async (
    name: string,
    description?: string
  ): Promise<string> => {
    if (!currentProject) {
      throw new Error('No current project to save');
    }

    try {
      const { v4: uuidv4 } = await import('uuid');
      const newProjectId = uuidv4();

      // Create new named project with current project data
      const namedProject: Project = {
        ...currentProject,
        id: newProjectId,
        name,
        description,
        modifiedAt: new Date(),
      };

      const result = await storage.createProject(namedProject);

      if (!result.success) {
        throw result.error || new Error('Failed to save project');
      }

      // Update state to reflect new named project
      currentProjectRef.current = namedProject;
      setCurrentProject(namedProject);
      setProjectId(newProjectId);
      setIsUntitledProject(false);
      commandManager.setProjectId(newProjectId);
      commandManager.clear();

      // Trigger a save to ensure everything is persisted
      await saveNow();

      return newProjectId;
    } catch (error) {
      console.error('[PersistenceContext] Failed to save current project:', error);
      throw error;
    }
  }, [currentProject, storage, commandManager, saveNow]);

  /**
   * Clear untitled project state (mark as not untitled)
   */
  const clearUntitledState = useCallback(() => {
    setIsUntitledProject(false);
    setPendingNavigationAction(null);
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
    loadProject,
    createProject,
    deleteProject,
    updateProjectMetadata,
    updateProjectStory,
    saveCurrentProject,
    setIsUntitledProject,
    clearUntitledState,
    registerSyncCallback,
    unregisterSyncCallback,
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
    saveCurrentProject,
  } = usePersistence();

  return {
    project: currentProject,
    projectId,
    load: loadProject,
    create: createProject,
    delete: deleteProject,
    updateMetadata: updateProjectMetadata,
    updateStory: updateProjectStory,
    saveCurrent: saveCurrentProject,
  };
}
