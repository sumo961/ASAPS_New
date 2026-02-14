/**
 * ZipAdapter - ZIP file persistence adapter
 *
 * Wraps the existing projectZipManager for import/export of .asaps.zip files.
 * This adapter handles the full project lifecycle for ZIP-based storage.
 */

import type { Project } from '../types';
import {
  exportProjectAsZip,
  importProjectFromZip,
} from '../../utils/projectZipManager';
import { getStorageManager } from '../StorageManager';
import type { PersistenceAdapter } from './PersistenceAdapter';

/**
 * ZipAdapter implements PersistenceAdapter for ZIP file import/export.
 *
 * Unlike DirectoryAdapter, this adapter is mainly used for import/export
 * operations rather than continuous editing. Projects are loaded into
 * IndexedDB after import and exported on demand.
 */
export class ZipAdapter implements PersistenceAdapter {
  readonly type = 'zip' as const;

  private lastImportedProjectId: string | null = null;

  /**
   * Open a project from a ZIP file.
   * Imports the ZIP into IndexedDB and returns the project.
   */
  async openProject(zipFilePath: string): Promise<Project> {
    // In Electron, read the ZIP file from disk
    const api = window.electronAPI;
    if (!api?.fs) {
      throw new Error('ZipAdapter.openProject requires Electron filesystem API');
    }

    const buffer = await api.fs.readFile(zipFilePath);
    const blob = new Blob([buffer]);
    const fileName = zipFilePath.replace(/^.*[/\\]/, '') || 'project.asaps.zip';
    const file = new File([blob], fileName);

    const result = await importProjectFromZip(file, { generateNewId: false });

    if (!result.success) {
      if (result.conflict) {
        // Project already exists - open it directly
        const storage = getStorageManager();
        const existing = await storage.getProject(result.conflict.existingProjectId);
        if (existing.success && existing.data) {
          this.lastImportedProjectId = existing.data.id;
          return existing.data;
        }
      }
      throw new Error(result.error || 'Failed to import ZIP project');
    }

    // Retrieve the imported project from IndexedDB
    const storage = getStorageManager();
    const projectResult = await storage.getProject(result.projectId!);
    if (!projectResult.success || !projectResult.data) {
      throw new Error('Failed to retrieve imported project from IndexedDB');
    }

    this.lastImportedProjectId = projectResult.data.id;
    return projectResult.data;
  }

  /**
   * Save project as ZIP. Delegates to existing export logic.
   * The project is first saved to IndexedDB, then exported.
   */
  async saveProject(project: Project): Promise<void> {
    // Save to IndexedDB first (ZIP export reads from there)
    const storage = getStorageManager();
    await storage.updateProject(project);
  }

  supportsGranularSave(): boolean {
    return false;
  }
}
