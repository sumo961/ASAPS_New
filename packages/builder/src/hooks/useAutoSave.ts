/**
 * useAutoSave Hook - Automatic saving with debouncing
 *
 * Automatically saves project data to IndexedDB with:
 * - Configurable debounce delay (default 30s)
 * - Save status tracking
 * - Manual save trigger
 * - Error handling
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ensurePersistentStorage } from '../utils/storagePersistence';
import { getStorageManager } from '../storage/StorageManager';
import type { Project } from '../storage/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Save status states
 */
export type SaveStatus =
  | 'idle'           // No changes to save
  | 'pending'        // Changes pending, waiting for debounce
  | 'saving'         // Currently saving
  | 'saved'          // Successfully saved
  | 'error';         // Error occurred

/**
 * Auto-save configuration options
 */
export interface AutoSaveOptions {
  /** Debounce delay in milliseconds (default: 30000 = 30s) */
  delay?: number;

  /** Enable auto-save (default: true) */
  enabled?: boolean;

  /** Save drafts in addition to main project (default: true) */
  saveDrafts?: boolean;

  /** Maximum number of drafts to keep (default: 10) */
  maxDrafts?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Called after a successful save with the saved project data.
   *  Use this to persist to additional backends (e.g. filesystem). */
  onAfterSave?: (project: Project) => Promise<void>;
}

/**
 * Return type for useAutoSave hook
 */
export interface UseAutoSaveReturn {
  /** Current save status */
  status: SaveStatus;

  /** Last save timestamp */
  lastSaved: Date | null;

  /** Last error */
  error: Error | null;

  /** Manually trigger a save */
  save: () => Promise<void>;

  /** Force an immediate save (bypasses debounce) */
  saveNow: () => Promise<void>;

  /** Mark data as changed (triggers auto-save after delay) */
  markChanged: () => void;

  /** Clear the pending save timer */
  cancelPending: () => void;

  /** Pause auto-save (e.g., during preview) */
  pause: () => void;

  /** Resume auto-save after pausing */
  resume: () => void;

  /** Whether auto-save is currently paused */
  isPaused: boolean;
}

/**
 * Hook for automatic saving of project data
 *
 * @param projectData - Function that returns the current project data to save
 * @param options - Auto-save configuration
 * @returns Auto-save interface
 *
 * @example
 * ```tsx
 * const { status, lastSaved, save } = useAutoSave(
 *   () => ({
 *     id: projectId,
 *     name: projectName,
 *     story: story,
 *     settings: settings,
 *     // ... other project data
 *   }),
 *   { delay: 30000 }
 * );
 *
 * // Trigger save when data changes
 * useEffect(() => {
 *   markChanged();
 * }, [beats, elements, animations]);
 * ```
 */
export function useAutoSave(
  projectData: () => Partial<Project> & { id: string },
  options: AutoSaveOptions = {}
): UseAutoSaveReturn {
  const {
    delay = 30000,
    enabled = true,
    saveDrafts = true,
    maxDrafts = 10,
    debug = false,
    onAfterSave,
  } = options;

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const saveTimeoutRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const savedTimeoutRef = useRef<number | null>(null);
  const pendingChangesDuringSavedRef = useRef(false);
  const isPausedRef = useRef(false);
  const onAfterSaveRef = useRef(onAfterSave);
  onAfterSaveRef.current = onAfterSave;

  /**
   * Debug logging
   */
  const log = useCallback((...args: any[]) => {
    if (debug) {
      console.log('[useAutoSave]', ...args);
    }
  }, [debug]);

  /**
   * Perform the actual save operation
   */
  const performSave = useCallback(async (isManual: boolean = false) => {
    if (isSavingRef.current) {
      log('Save already in progress, skipping');
      return;
    }

    isSavingRef.current = true;
    setStatus('saving');
    setError(null);

    try {
      const storage = getStorageManager();
      const data = projectData();

      log('Saving project:', data.id);

      // Get existing project or create new one
      const existingResult = await storage.getProject(data.id);
      let project: Project;

      if (existingResult.success && existingResult.data) {
        // Update existing project
        project = {
          ...existingResult.data,
          ...data,
          modifiedAt: new Date(),
        };
      } else {
        // Create new project (shouldn't happen with auto-save, but handle it)
        project = {
          id: data.id,
          name: data.name || 'Untitled Project',
          description: data.description,
          story: data.story!,
          settings: data.settings!,
          assetIds: data.assetIds || [],
          createdAt: data.createdAt || new Date(),
          modifiedAt: new Date(),
          version: data.version || '1.0.0',
        };
      }

      // Save the project
      const saveResult = await storage.updateProject(project);

      if (!saveResult.success) {
        throw saveResult.error || new Error('Failed to save project');
      }

      // Call onAfterSave callback (e.g. write to filesystem for directory projects)
      if (onAfterSaveRef.current) {
        try {
          await onAfterSaveRef.current(project);
        } catch (err) {
          log('onAfterSave callback failed:', err);
          // Non-fatal — IndexedDB save already succeeded
        }
      }

      // Save draft if enabled
      if (saveDrafts) {
        const draftId = `${data.id}_${Date.now()}`;
        const draftResult = await storage.saveDraft({
          id: draftId,
          projectId: data.id,
          projectSnapshot: data,
          createdAt: new Date(),
          isManual,
        });

        if (!draftResult.success) {
          log('Warning: Failed to save draft', draftResult.error);
        } else {
          // Clean up old drafts
          await storage.cleanupOldDrafts(data.id, maxDrafts);
        }
      }

      setLastSaved(new Date());
      setStatus('saved');
      log('Save successful');

      // First successful save is the engagement moment: ask the browser to
      // protect this origin's storage from eviction (web only; Firefox shows
      // a prompt, which is fair right after the user saved). Fire-and-forget
      // and internally once-per-session.
      void ensurePersistentStorage();

      // Reset to idle after 2 seconds (or pending if changes came in)
      savedTimeoutRef.current = window.setTimeout(() => {
        if (pendingChangesDuringSavedRef.current) {
          // Changes came in during saved display - schedule save now
          pendingChangesDuringSavedRef.current = false;
          setStatus('pending');
          saveTimeoutRef.current = window.setTimeout(() => {
            performSave(false);
            saveTimeoutRef.current = null;
          }, delay);
        } else {
          setStatus('idle');
        }
        savedTimeoutRef.current = null;
      }, 2000);

    } catch (err) {
      const error = err as Error;
      console.error('[useAutoSave] Save failed:', error);
      setError(error);
      setStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [projectData, saveDrafts, maxDrafts, log]);

  /**
   * Mark data as changed (triggers debounced save)
   */
  const markChanged = useCallback(() => {
    if (!enabled) return;

    // Don't schedule saves while paused (e.g., during preview)
    if (isPausedRef.current) {
      log('Auto-save paused, skipping markChanged');
      return;
    }

    // Don't interrupt an active save
    if (isSavingRef.current) {
      log('Save in progress, will reschedule after completion');
      return;
    }

    // Don't interrupt the "saved" state display - just flag that changes are pending
    if (savedTimeoutRef.current !== null) {
      log('Showing saved state, marking changes as pending');
      pendingChangesDuringSavedRef.current = true;
      return;
    }

    log('Data marked as changed, scheduling save');
    setStatus('pending');

    // Clear existing timeout
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = window.setTimeout(() => {
      performSave(false);
      saveTimeoutRef.current = null;
    }, delay);
  }, [enabled, delay, performSave, log]);

  /**
   * Manually trigger a save (still debounced)
   */
  const save = useCallback(async () => {
    log('Manual save triggered');
    markChanged();
  }, [markChanged, log]);

  /**
   * Force immediate save (bypasses debounce)
   */
  const saveNow = useCallback(async () => {
    log('Immediate save triggered');

    // Clear pending timeout
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    await performSave(true);
  }, [performSave, log]);

  /**
   * Cancel pending save and clear any error state
   */
  const cancelPending = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    // Always reset to idle and clear error when cancelling
    // This is important when switching projects to clear stale state
    setStatus('idle');
    setError(null);
    log('Pending save cancelled, state reset');
  }, [log]);

  /**
   * Pause auto-save (e.g., during preview)
   * Cancels any pending saves and prevents new ones from being scheduled
   */
  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    // Cancel any pending save
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    // Reset status to idle since we're pausing
    if (status === 'pending') {
      setStatus('idle');
    }
    log('Auto-save paused');
  }, [status, log]);

  /**
   * Resume auto-save after pausing
   */
  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    log('Auto-save resumed');
  }, [log]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (savedTimeoutRef.current !== null) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Save before unload (browser close/refresh)
   */
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'pending' || status === 'saving') {
        // Attempt synchronous save (best effort)
        performSave(false);

        // Show confirmation dialog
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, status, performSave]);

  return {
    status,
    lastSaved,
    error,
    save,
    saveNow,
    markChanged,
    cancelPending,
    pause,
    resume,
    isPaused,
  };
}

/**
 * Hook to auto-save on data changes
 *
 * Watches dependencies and triggers auto-save when they change
 */
export function useAutoSaveOnChange(
  projectData: () => Partial<Project> & { id: string },
  deps: React.DependencyList,
  options?: AutoSaveOptions
) {
  const autoSave = useAutoSave(projectData, options);

  useEffect(() => {
    autoSave.markChanged();
     
  }, deps);

  return autoSave;
}
