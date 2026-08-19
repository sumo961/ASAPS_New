/**
 * Move-library-to-disk migration — Stage 2 of the storage inversion.
 *
 * Pre-existing IndexedDB projects don't auto-adopt folders (that would be a
 * silent bulk rewrite of a library the author never asked to move); this is
 * the explicit action instead. Each project is written to the default
 * location as a directory-format project and its DB row flipped to
 * storageFormat 'directory' — content truth moves to disk, the row stays as
 * the library index, and nothing is deleted: a migration failure leaves that
 * project exactly as it was.
 *
 * The currently-open project is deliberately SKIPPED here: it has a live
 * save pipeline, and converting it out from under an active adapter is how
 * you get two truths. The caller reports it; the author converts it with
 * File → Save As Folder (or it simply stays put).
 */
import type { StorageManager } from '../storage/StorageManager';
import { DirectoryAdapter, isElectronWithFS } from '../storage/adapters/DirectoryAdapter';
import { sanitizeFolderName } from './newProjectRegistry';

export interface MigrationProgress {
  done: number;
  total: number;
  currentName: string;
}

export interface MigrationResult {
  migrated: number;
  skipped: number;
  failures: Array<{ id: string; name: string; error: string }>;
  /** True when the open project was left in place for the caller to mention. */
  skippedCurrent: boolean;
}

export async function migrateLibraryToDisk(
  storage: StorageManager,
  options: {
    currentProjectId?: string | null;
    onProgress?: (p: MigrationProgress) => void;
  } = {},
): Promise<MigrationResult> {
  if (!isElectronWithFS()) {
    throw new Error('Library migration requires the desktop app');
  }
  const api = (window as any).electronAPI;
  const documents: string = await api.app.getPath('documents');
  const baseDir = `${documents}/ASAPS Projects`;
  await api.fs.mkdir(baseDir).catch(() => undefined);

  const listResult = await storage.listProjects({ sortBy: 'modified', sortDirection: 'desc' });
  const projects = (listResult.success && listResult.data) || [];

  const result: MigrationResult = { migrated: 0, skipped: 0, failures: [], skippedCurrent: false };
  const candidates = projects.filter((p) => p.storageFormat !== 'directory');
  let done = 0;

  for (const meta of candidates) {
    done += 1;
    options.onProgress?.({ done, total: candidates.length, currentName: meta.name });

    if (options.currentProjectId && meta.id === options.currentProjectId) {
      result.skippedCurrent = true;
      result.skipped += 1;
      continue;
    }

    try {
      // The list row can be a slim projection — load the full project.
      const full = await storage.getProject(meta.id);
      if (!full.success || !full.data) throw new Error('project not readable');
      const project = full.data;

      const assetsResult = await storage.getProjectAssets(project.id);
      const assets = (assetsResult.success && assetsResult.data) || [];

      const folderBase = sanitizeFolderName(project.name);
      let dirPath = `${baseDir}/${folderBase}`;
      for (let i = 2; await api.fs.exists(dirPath); i++) {
        dirPath = `${baseDir}/${folderBase} ${i}`;
      }

      const adapter = new DirectoryAdapter();
      adapter.setProjectPath(dirPath);
      await adapter.saveProject(project, assets.length > 0 ? assets : undefined);

      // Flip the row — disk is now this project's truth. Direct put so the
      // migration doesn't masquerade as an edit (updateProject force-bumps
      // modifiedAt).
      await storage.stampProjectDirectory(project.id, dirPath);
      result.migrated += 1;
    } catch (e) {
      result.failures.push({
        id: meta.id,
        name: meta.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
