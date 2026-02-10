/**
 * IndexedDBAdapter - Wraps existing StorageManager for the adapter interface
 *
 * This is a thin wrapper that delegates to the existing StorageManager,
 * preserving backward compatibility with the current browser-based storage.
 */

import type { Project, GlobalSettings, StoredAsset } from '../types';
import { getStorageManager } from '../StorageManager';
import type { PersistenceAdapter, FileChangeEvent } from './PersistenceAdapter';

/**
 * IndexedDBAdapter implements PersistenceAdapter using the existing StorageManager.
 */
export class IndexedDBAdapter implements PersistenceAdapter {
  readonly type = 'indexeddb' as const;

  /**
   * Open a project from IndexedDB by project ID
   */
  async openProject(projectId: string): Promise<Project> {
    const storage = getStorageManager();
    const result = await storage.getProject(projectId);

    if (!result.success || !result.data) {
      throw new Error(`Project not found in IndexedDB: ${projectId}`);
    }

    return result.data;
  }

  /**
   * Save project to IndexedDB
   */
  async saveProject(project: Project): Promise<void> {
    const storage = getStorageManager();
    const result = await storage.updateProject(project);

    if (!result.success) {
      throw result.error || new Error('Failed to save project to IndexedDB');
    }
  }

  /**
   * IndexedDB doesn't support file watching
   */
  supportsGranularSave(): boolean {
    return false;
  }
}
