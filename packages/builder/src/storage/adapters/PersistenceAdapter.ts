/**
 * PersistenceAdapter - Abstraction for project storage backends
 *
 * Provides a unified interface for different storage mechanisms:
 * - directory: Filesystem-based directory format (Electron only)
 * - zip: ZIP file export/import
 * - indexeddb: Browser IndexedDB storage (existing default)
 */

import type { Project, GlobalSettings, StoredAsset } from '../types';
import type { Beat } from '@asaps/core';

/**
 * Project format types
 */
export type ProjectFormat = 'directory' | 'zip' | 'indexeddb';

/**
 * Changed file notification from file watcher
 */
export interface FileChangeEvent {
  /** Relative path within the project directory */
  path: string;
  /** Type of change */
  type: 'added' | 'modified' | 'deleted';
}

/**
 * Conflict information when a file was changed both locally and externally
 */
export interface FileConflict {
  /** Relative path of the conflicting file */
  path: string;
  /** Beat ID if this is a beat file */
  beatId?: string;
  /** Local content */
  localContent: string;
  /** External (disk) content */
  externalContent: string;
}

/**
 * Unified persistence adapter interface
 */
export interface PersistenceAdapter {
  /** The storage format this adapter handles */
  readonly type: ProjectFormat;

  /** Open/load a project from the given source */
  openProject(source: string): Promise<Project>;

  /** Save the entire project */
  saveProject(project: Project): Promise<void>;

  /** Save a single beat file (granular save for directory format) */
  saveBeat?(beat: Beat, clusterId?: string): Promise<void>;

  /** Save settings only (granular save) */
  saveSettings?(settings: GlobalSettings): Promise<void>;

  /** Save project metadata only (granular save) */
  saveProjectMeta?(project: Partial<Project>): Promise<void>;

  /**
   * Watch for external file changes (directory format only).
   * Returns a cleanup function to stop watching.
   */
  watchForChanges?(callback: (changes: FileChangeEvent[]) => void): () => void;

  /**
   * Get the project root path (directory format only).
   * Returns null for non-directory formats.
   */
  getProjectPath?(): string | null;

  /**
   * Read a specific beat from storage by ID.
   * Used for granular reload after external changes.
   */
  readBeat?(beatId: string): Promise<any>;

  /**
   * Save an asset to the project.
   * For directory format, copies the file and updates the manifest.
   */
  saveAsset?(asset: StoredAsset, context?: string): Promise<void>;

  /**
   * Check if this adapter supports granular saves
   */
  supportsGranularSave(): boolean;
}

/**
 * Detect the project format from a file path or source identifier.
 */
export function detectProjectFormat(source: string): ProjectFormat {
  // Directory format: path to a folder containing .asaps/format.json
  // This is detected asynchronously, so we check by extension/pattern
  if (source.endsWith('.asaps.zip') || source.endsWith('.zip')) {
    return 'zip';
  }

  // If it looks like a UUID (IndexedDB project ID), it's indexeddb
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(source)) {
    return 'indexeddb';
  }

  // Otherwise, assume it's a directory path
  return 'directory';
}
