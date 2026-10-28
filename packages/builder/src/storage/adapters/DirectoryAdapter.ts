/**
 * DirectoryAdapter - Filesystem persistence for directory-based projects
 *
 * Reads and writes project files to the filesystem via Electron IPC.
 * Supports granular saves (single beat, settings, etc.) and file watching.
 *
 * Electron-only: requires window.electronAPI.fs
 */

import { onlyStampsDiffer, keepNewestSavedWith } from '../../utils/projectMetaStamps';
import { isNewerVersion, NewerProjectError } from '../../utils/appVersion';
import type { Project, GlobalSettings, StoredAsset } from '../types';
import type { Beat, Cluster } from '@asaps/core';
import {
  serializeToDirectory,
  deserializeFromDirectory,
  isDirectoryProject,
  deterministicStringify,
  serializeBeat,
  serializeBeatFromJSON,
  beatFilename,
  type DirectoryFile,
  type DirectoryReader,
  type SerializeInput,
  type DirectoryAssetManifest,
  type DuplicateBeatId,
  setManifestEntry,
  parseManifest,
  serializeManifest,
  getAssetFolder,
  generateUniqueFilename,
  type AssetManifestEntry,
} from '@asaps/core';
import type { PersistenceAdapter, FileChangeEvent } from './PersistenceAdapter';
import { APP_VERSION } from '../../utils/appVersion';

/** Join path segments using the separator detected from the base path */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base, ...parts].join(sep);
}

/** Get parent directory of a path (cross-platform) */
function parentDir(filePath: string): string {
  // Find the last separator (either / or \)
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
}

type KnownFile = { text: string } | { bytes: string } | { gone: true };

/** Size + FNV-1a hash: enough to recognise our own asset write coming back. */
function bytesPrint(data: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${data.length}:${(h >>> 0).toString(16)}`;
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return null;
}

/**
 * DirectoryAdapter implements PersistenceAdapter for filesystem-based projects.
 */
/** Opening refused: files still carry Git merge-conflict markers. */
export class ConflictMarkersError extends Error {
  readonly files: string[];
  constructor(files: string[]) {
    super(`Unresolved Git merge conflicts in ${files.length} file${files.length === 1 ? '' : 's'}: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ' …' : ''}`);
    this.name = 'ConflictMarkersError';
    this.files = files;
  }
}

export class DirectoryAdapter implements PersistenceAdapter {
  readonly type = 'directory' as const;

  private projectPath: string | null = null;
  private unwatchFn: (() => void) | null = null;
  /** Asset manifest from last openProject() — used to register assets in storage */
  private lastManifest: DirectoryAssetManifest | null = null;
  private lastDuplicateBeatIds: DuplicateBeatId[] = [];
  /**
   * What this app last wrote (or read on open) at each project path, so the
   * watcher can tell our own saves echoing back from changes made outside.
   * A Windows student got "files changed outside ASAPS … and 70 more" over
   * and over without touching anything (2026-10-27): every save rewrote every
   * file and the echo was only ignored for 5 seconds — on a slow disk or a
   * OneDrive-synced folder it arrives later.
   */
  private known = new Map<string, KnownFile>();

  /**
   * Create an Electron IPC-based DirectoryReader
   */
  private createReader(): DirectoryReader {
    const api = window.electronAPI;
    if (!api?.fs) {
      throw new Error('DirectoryAdapter requires Electron filesystem API');
    }

    return {
      readText: async (path: string) => {
        const buffer = await api.fs.readFile(path);
        // Buffer from IPC might be a Uint8Array
        if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
          return new TextDecoder().decode(buffer);
        }
        return String(buffer);
      },
      exists: async (path: string) => {
        return api.fs.exists(path);
      },
      listDir: async (path: string) => {
        const entries = await api.fs.readDir(path);
        return entries.map((e: any) => ({
          name: e.name,
          isDirectory: typeof e.isDirectory === 'function' ? e.isDirectory() : !!e.isDirectory,
        }));
      },
    };
  }

  /**
   * Open a directory-based project
   */
  async openProject(dirPath: string): Promise<Project> {
    console.log('[DirectoryAdapter] openProject:', dirPath);
    const reader = this.createReader();

    // Verify this is a directory project
    const isDir = await isDirectoryProject(dirPath, reader);
    if (!isDir) {
      throw new Error(`Not a valid ASAPS directory project: ${dirPath}`);
    }

    // A merge committed with its conflict markers still in leaves files no
    // one can read; opening (and then saving) such a folder dropped beats
    // and re-imported the project under a new id (NarrativDesign, 2026-10-20).
    const conflicted = await this.findConflictMarkers(dirPath);
    if (conflicted.length > 0) throw new ConflictMarkersError(conflicted);

    this.projectPath = dirPath;
    this.known.clear();

    // What we read now is the version on screen: the watcher compares against it.
    const recording: DirectoryReader = {
      ...reader,
      readText: async (path: string) => {
        const text = await reader.readText(path);
        const rel = this.relPath(path);
        if (rel) this.known.set(rel, { text });
        return text;
      },
    };
    const result = await deserializeFromDirectory(dirPath, recording);

    // Save manifest for asset registration
    this.lastManifest = result.manifest;
    this.lastDuplicateBeatIds = result.duplicateBeatIds ?? [];
    console.log('[DirectoryAdapter] Manifest loaded with', Object.keys(result.manifest.assets).length, 'assets');

    // Convert deserialized data back into a Project structure
    // The story data needs to stay as a plain object (beats array, not Story instance)
    // because the builder works with serialized story data
    const project: Project = {
      id: result.project.id,
      name: result.project.name,
      description: result.project.description,
      story: {
        metadata: result.storyMetadata,
        beats: result.beats,
        settings: {},
        environment: result.environment,
        characters: result.characters,
        clusters: result.clusters,
        containerBeatPositions: result.containerBeatPositions,
      } as any,
      settings: result.settings,
      globalSettings: result.globalSettings,
      themeId: result.themeId,
      themeOverrides: result.themeOverrides,
      assetIds: Object.keys(result.manifest.assets),
      createdAt: new Date(result.project.createdAt),
      modifiedAt: new Date(result.project.modifiedAt),
      version: result.project.version,
      ...(result.project.savedWith ? { savedWith: result.project.savedWith } : {}),
      translations: result.translations.length > 0 ? result.translations : undefined,
      translationManifest: result.translationManifest,
      ...(result.generationReview ? { generationReview: result.generationReview } : {}),
      ...(result.aiEdits ? { aiEdits: result.aiEdits } : {}),
      ...(result.ideatorSessions?.length ? { ideatorSessions: result.ideatorSessions } : {}),
      ...(result.coDesignerSessions?.length ? { coDesignerSessions: result.coDesignerSessions } : {}),
    };

    return project;
  }

  /** Beat ids the last openProject() found in more than one file. */
  getDuplicateBeatIds(): DuplicateBeatId[] {
    return this.lastDuplicateBeatIds;
  }

  /** Get the asset manifest from the last openProject() call */
  getManifest(): DirectoryAssetManifest | null {
    return this.lastManifest;
  }

  /** The folder's asset list as it is on disk now (empty when there is none). */
  async readAssetManifest(): Promise<DirectoryAssetManifest> {
    if (!this.projectPath) throw new Error('No project path set');
    const reader = this.createReader();
    const path = joinPath(this.projectPath, 'assets', '_manifest.json');
    if (!await reader.exists(path)) return { _format: '1.0', assets: {} };
    return parseManifest(await reader.readText(path));
  }

  /** The bytes of one asset file in the folder, or null when it can't be read. */
  async readAssetBytes(entry: Pick<AssetManifestEntry, 'folder' | 'filename'>): Promise<Uint8Array | null> {
    const api = window.electronAPI?.fs;
    if (!this.projectPath || !api) return null;
    try {
      const data = await api.readFile(joinPath(this.projectPath, 'assets', ...(entry.folder ? [entry.folder] : []), entry.filename));
      return toBytes(data);
    } catch {
      return null;
    }
  }

  /**
   * Save the entire project to directory.
   * When `assets` are provided, their binaries are written to disk and the
   * manifest is populated correctly in a single pass (no need for separate
   * saveAsset() calls).
   */
  /**
   * Refuse to write a folder a NEWER ASAPS saved (project.json savedWith) —
   * the backstop for every save path: auto-save, Save, repairs, assets.
   */
  private async refuseIfNewer(): Promise<void> {
    if (!this.projectPath) return;
    const reader = this.createReader();
    const path = joinPath(this.projectPath, 'project.json');
    let savedWith: string | undefined;
    try {
      if (await reader.exists(path)) savedWith = JSON.parse(await reader.readText(path))?.savedWith;
    } catch {
      return; // unreadable project.json is someone else's problem to report
    }
    if (savedWith && isNewerVersion(savedWith, APP_VERSION)) throw new NewerProjectError(savedWith);
  }

  async saveProject(project: Project, assets?: StoredAsset[]): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project path set. Open a project first or set projectPath.');
    }
    await this.refuseIfNewer();

    const api = window.electronAPI;
    if (!api?.fs) {
      throw new Error('DirectoryAdapter requires Electron filesystem API');
    }

    console.log('[DirectoryAdapter] saveProject:', this.projectPath);

    // Assets the folder already lists keep their file, and it is never
    // rewritten from this computer's copy (2026-10-28, Narrative-bullying
    // group: the first save after opening wrote every asset again, naming
    // them afresh in the local database's order — pictures uploaded twice
    // under one name took turns as `_2`, `_3`, `_2_2`, overwriting other
    // pictures' files and showing up as changes nobody made). Only assets
    // the manifest doesn't know are written, under names no listed file uses;
    // a listed file that is missing is put back at its path.
    const manifestPath = joinPath(this.projectPath, 'assets', '_manifest.json');
    let listed: DirectoryAssetManifest | null = null;
    if (assets && assets.length > 0 && await api.fs.exists(manifestPath)) {
      try {
        listed = parseManifest(await this.createReader().readText(manifestPath));
      } catch {
        listed = null; // unreadable — write the assets as before
      }
    }
    let newAssets = assets;
    const missing: Array<{ path: string; blob: Blob }> = [];
    if (listed) {
      newAssets = [];
      for (const a of assets!) {
        const entry = listed.assets[a.id];
        if (!entry) { newAssets.push(a); continue; }
        const path = joinPath(this.projectPath, 'assets', ...(entry.folder ? [entry.folder] : []), entry.filename);
        if (!await api.fs.exists(path)) missing.push({ path, blob: a.blob });
      }
    }
    const input = {
      ...this.projectToSerializeInput(project, newAssets),
      ...(listed ? { reservedAssetFilenames: Object.values(listed.assets).map((e) => e.filename) } : {}),
    };
    const { files, assetFiles } = serializeToDirectory(input);

    // VCS helper files that should only be created, never overwritten — except
    // when the existing file contains a known-problematic directive we need to
    // migrate away from. The original `.gitattributes` shipped with an
    // `assets/**/* filter=lfs` line that broke clone/pull on systems with
    // git-lfs configured; we replace any such file with the current template.
    const VCS_HELPER_FILES = new Set(['.gitignore', '.p4ignore', '.gitattributes']);
    const reader = this.createReader();

    // Write all JSON files (includes the manifest with asset entries)
    for (const file of files) {
      const fullPath = joinPath(this.projectPath, ...file.path.split('/'));

      // Don't overwrite VCS helper files — they may have user customizations.
      // Exception: migrate away from the legacy LFS-tracked-assets directive.
      if (VCS_HELPER_FILES.has(file.path) && await api.fs.exists(fullPath)) {
        if (file.path === '.gitattributes') {
          try {
            const existing = await reader.readText(fullPath);
            if (existing.includes('filter=lfs')) {
              console.log('[DirectoryAdapter] Migrating .gitattributes off legacy LFS filter');
              // fall through to overwrite below
            } else {
              continue;
            }
          } catch {
            continue;
          }
        } else {
          continue;
        }
      }

      // Asset manifest: MERGE new entries into existing manifest instead of replacing.
      // serializeToDirectory only includes newly-added assets, so a naive overwrite
      // would delete all previously-saved assets from the manifest.
      if (file.path === 'assets/_manifest.json' && newAssets && newAssets.length > 0) {
        if (await reader.exists(fullPath)) {
          const existingManifest = parseManifest(await reader.readText(fullPath));
          const newManifest = parseManifest(file.content);
          // Merge: add new entries to existing manifest
          for (const [id, entry] of Object.entries(newManifest.assets)) {
            setManifestEntry(existingManifest, entry);
          }
          await api.fs.mkdir(parentDir(fullPath));
          await this.writeText(fullPath, serializeManifest(existingManifest));
          continue;
        }
      }

      // project.json: leave it alone when only its stamps (modifiedAt,
      // savedWith) would change — otherwise opening a project made it
      // "modified" and Git refused teammates' pulls.
      let content = file.content;
      if (file.path === 'project.json' && await api.fs.exists(fullPath)) {
        try {
          const existing = await reader.readText(fullPath);
          content = keepNewestSavedWith(existing, content);
          if (onlyStampsDiffer(existing, content)) continue;
        } catch {
          // unreadable — write it fresh below
        }
      }

      // Ensure parent directory exists
      await api.fs.mkdir(parentDir(fullPath));
      await this.writeText(fullPath, content);
    }

    // Clean up orphaned beat files (beats deleted from the project)
    await this.cleanupOrphanedBeatFiles(files);

    for (const m of missing) {
      await api.fs.mkdir(parentDir(m.path));
      await this.writeBytes(m.path, new Uint8Array(await m.blob.arrayBuffer()));
    }

    // Write binary asset files
    if (newAssets && newAssets.length > 0) {
      // Build a quick lookup from assetId -> StoredAsset blob
      const blobMap = new Map<string, Blob>();
      for (const a of newAssets) {
        blobMap.set(a.id, a.blob);
      }

      for (const af of assetFiles) {
        const blob = blobMap.get(af.assetId);
        if (!blob) continue; // skip assets without a blob (shouldn't happen)

        const fullPath = joinPath(this.projectPath, ...af.path.split('/'));
        await api.fs.mkdir(parentDir(fullPath));
        const arrayBuffer = await blob.arrayBuffer();
        await this.writeBytes(fullPath, new Uint8Array(arrayBuffer));
      }
    }
  }

  /**
   * Delete an asset from a directory project: removes the binary on disk
   * AND prunes the entry from `assets/_manifest.json`. Without this, the
   * IndexedDB-only delete leaves the file in the working tree where git
   * happily commits it back, and the manifest keeps a stale reference that
   * triggers the Missing Assets popup on every load.
   */
  async deleteAsset(assetId: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI;
    if (!api?.fs) throw new Error('Requires Electron filesystem API');

    const reader = this.createReader();
    const manifestPath = joinPath(this.projectPath, 'assets', '_manifest.json');

    if (!(await reader.exists(manifestPath))) return;

    let manifest;
    try {
      const raw = await reader.readText(manifestPath);
      manifest = parseManifest(raw);
    } catch (err) {
      console.warn('[DirectoryAdapter] deleteAsset: failed to read manifest:', err);
      return;
    }

    const entry = manifest.assets[assetId];
    if (!entry) return; // nothing to do

    // Remove binary on disk first; ignore "doesn't exist" — we still want the
    // manifest entry gone either way.
    const filePath = joinPath(this.projectPath, 'assets', entry.folder, entry.filename);
    try {
      if (await reader.exists(filePath) && api.fs.unlink) {
        this.remember(filePath, { gone: true });
        await api.fs.unlink(filePath);
      }
    } catch (err) {
      console.warn('[DirectoryAdapter] deleteAsset: unlink failed for', filePath, err);
    }

    // Update manifest
    delete manifest.assets[assetId];
    await this.writeText(manifestPath, serializeManifest(manifest));

    // Drop from the in-memory cached manifest so subsequent saves don't
    // resurrect the entry via the merge-into-existing logic.
    if (this.lastManifest && this.lastManifest.assets[assetId]) {
      delete this.lastManifest.assets[assetId];
    }
  }

  /**
   * Save a single beat file (granular save)
   */
  async saveBeat(beat: Beat, clusterId?: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    const serialized = typeof beat.toJSON === 'function'
      ? serializeBeat(beat)
      : serializeBeatFromJSON(beat as any);
    const filename = beatFilename(serialized);

    // Determine cluster directory
    const clusterDir = clusterId
      ? await this.findClusterDir(clusterId)
      : 'clusters/_unclustered';

    const fullPath = joinPath(this.projectPath, ...clusterDir.split('/'), filename);
    await api.mkdir(parentDir(fullPath));
    await this.writeText(fullPath, deterministicStringify(serialized));
  }

  /**
   * Delete a beat file from disk.
   */
  async deleteBeat(beatId: string, beatType: string, clusterId?: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    const filename = beatFilename({ type: beatType, id: beatId });
    const clusterDir = clusterId
      ? await this.findClusterDir(clusterId)
      : 'clusters/_unclustered';

    const fullPath = joinPath(this.projectPath, ...clusterDir.split('/'), filename);
    if (await api.exists(fullPath)) {
      this.remember(fullPath, { gone: true });
      await api.unlink(fullPath);
      console.log(`[DirectoryAdapter] Deleted beat file: ${fullPath}`);
    }
  }

  /**
   * Remove beat JSON files from disk that are no longer in the project.
   * Compares files written in this save against files on disk in cluster dirs.
   */
  private async cleanupOrphanedBeatFiles(writtenFiles: DirectoryFile[]): Promise<void> {
    if (!this.projectPath) return;
    const api = window.electronAPI?.fs;
    if (!api) return;

    // Build set of beat file paths that were just written
    const writtenPaths = new Set(
      writtenFiles
        .filter(f => f.path.startsWith('clusters/') && f.path.endsWith('.json')
          && !f.path.endsWith('cluster.json') && !f.path.endsWith('_index.json'))
        .map(f => f.path)
    );

    // Scan cluster directories for existing beat files
    const clustersDir = joinPath(this.projectPath, 'clusters');
    if (!await api.exists(clustersDir)) return;

    try {
      const clusterEntries = await api.readDir(clustersDir);
      for (const entry of clusterEntries) {
        const isDir = typeof entry.isDirectory === 'function' ? entry.isDirectory() : !!entry.isDirectory;
        if (!isDir) continue;

        const dirPath = joinPath(clustersDir, entry.name);
        const files = await api.readDir(dirPath);

        for (const file of files) {
          const isFile = typeof file.isDirectory === 'function' ? !file.isDirectory() : !file.isDirectory;
          if (!isFile || !file.name.endsWith('.json')) continue;
          if (file.name === 'cluster.json' || file.name === '_index.json') continue;

          const relativePath = `clusters/${entry.name}/${file.name}`;
          if (!writtenPaths.has(relativePath)) {
            // This beat file is on disk but not in the current project — delete it
            const fullPath = joinPath(dirPath, file.name);
            this.remember(fullPath, { gone: true });
            await api.unlink(fullPath);
            console.log(`[DirectoryAdapter] Cleaned up orphaned beat file: ${relativePath}`);
          }
        }
      }
    } catch (err) {
      console.warn('[DirectoryAdapter] Error during beat file cleanup:', err);
    }
  }

  /**
   * Save settings only (granular save)
   */
  async saveSettings(settings: GlobalSettings): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    // Read existing settings to preserve projectSettings
    let existing: any = {};
    const settingsPath = joinPath(this.projectPath!, 'settings.json');
    try {
      const reader = this.createReader();
      if (await reader.exists(settingsPath)) {
        existing = JSON.parse(await reader.readText(settingsPath));
      }
    } catch {
      // Continue with fresh settings
    }

    const settingsData = {
      ...existing,
      _format: '1.0',
      globalSettings: settings,
    };

    await this.writeText(settingsPath, deterministicStringify(settingsData));
  }

  /**
   * Save project metadata only (granular save)
   */
  async saveProjectMeta(project: Partial<Project>): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    // Read existing project.json and update fields
    const reader = this.createReader();
    const projectPath = joinPath(this.projectPath!, 'project.json');
    let existing: any = {};
    if (await reader.exists(projectPath)) {
      existing = JSON.parse(await reader.readText(projectPath));
    }

    const updated = {
      ...existing,
      _format: '1.0',
      ...(project.name !== undefined ? { name: project.name } : {}),
      ...(project.description !== undefined ? { description: project.description } : {}),
      modifiedAt: new Date().toISOString(),
    };

    const text = deterministicStringify(updated);
    if (Object.keys(existing).length > 0 && onlyStampsDiffer(deterministicStringify(existing), text)) return;
    await this.writeText(projectPath, text);
  }

  /**
   * Project files (JSON) that still contain Git conflict markers
   * (<<<<<<< / >>>>>>>), as paths relative to the folder. Assets are skipped.
   */
  async findConflictMarkers(dirPath: string): Promise<string[]> {
    const reader = this.createReader();
    const found: string[] = [];
    const marker = /^(<{7}|>{7})(\s|$)/m;
    const walk = async (rel: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      let entries: Array<{ name: string; isDirectory: boolean }>;
      try {
        entries = await reader.listDir(rel ? joinPath(dirPath, ...rel.split('/')) : dirPath);
      } catch {
        return;
      }
      for (const e of entries) {
        // Dot-files (.git, .asaps, the editing-lock file) are not story data.
        if (e.name.startsWith('.')) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory) {
          if (e.name === 'assets' || e.name === '.git' || e.name === 'node_modules') continue;
          await walk(childRel, depth + 1);
        } else if (e.name.endsWith('.json')) {
          try {
            if (marker.test(await reader.readText(joinPath(dirPath, ...childRel.split('/'))))) found.push(childRel);
          } catch { /* unreadable: deserialization reports it */ }
        }
      }
    };
    await walk('', 0);
    return found;
  }

  /** The project id stored in a folder's project.json, or null if unreadable. */
  async readFolderProjectId(dirPath: string): Promise<string | null> {
    try {
      const reader = this.createReader();
      const data = JSON.parse(await reader.readText(joinPath(dirPath, 'project.json')));
      return typeof data?.id === 'string' && data.id ? data.id : null;
    } catch {
      return null;
    }
  }

  /** Give the open folder a new project id (and name) in its project.json. */
  async assignProjectId(id: string, name?: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');
    const reader = this.createReader();
    const projectPath = joinPath(this.projectPath, 'project.json');
    const existing = JSON.parse(await reader.readText(projectPath));
    await this.writeText(projectPath, deterministicStringify({ ...existing, id, ...(name ? { name } : {}) }));
  }

  /**
   * Watch for external file changes
   */
  watchForChanges(callback: (changes: FileChangeEvent[]) => void): () => void {
    if (!this.projectPath) throw new Error('No project path set');

    const api = (window.electronAPI as any);
    if (!api?.fs?.watchDir) {
      console.warn('[DirectoryAdapter] File watching not available');
      return () => {};
    }

    // Use Electron IPC-based file watcher; our own writes coming back are dropped
    this.unwatchFn = api.fs.watchDir(
      this.projectPath,
      (changedFiles: string[]) => {
        void this.changedOutside(changedFiles).then((paths) => {
          if (paths.length === 0) return;
          callback(paths.map((path): FileChangeEvent => ({ path, type: 'modified' })));
        });
      }
    );

    return () => {
      if (this.unwatchFn) {
        this.unwatchFn();
        this.unwatchFn = null;
      }
    };
  }

  getProjectPath(): string | null {
    return this.projectPath;
  }

  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  /**
   * Read a single beat from disk
   */
  async readBeat(beatId: string): Promise<any> {
    if (!this.projectPath) throw new Error('No project path set');

    const reader = this.createReader();
    // We need to search for the beat file across all cluster directories
    const clustersPath = joinPath(this.projectPath!, 'clusters');
    if (!await reader.exists(clustersPath)) return null;

    const dirs = await reader.listDir(clustersPath);
    for (const dir of dirs) {
      if (!dir.isDirectory) continue;
      const dirPath = joinPath(clustersPath, dir.name);
      const files = await reader.listDir(dirPath);
      for (const file of files) {
        if (file.name.endsWith('.json') && file.name !== 'cluster.json' && file.name !== '_index.json') {
          const content = await reader.readText(joinPath(dirPath, file.name));
          const beat = JSON.parse(content);
          if (beat.id === beatId) {
            const { _format, ...beatData } = beat;
            return beatData;
          }
        }
      }
    }

    return null;
  }

  /**
   * Save an asset file and update the manifest
   */
  async saveAsset(asset: StoredAsset, context?: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    await this.refuseIfNewer();
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    const reader = this.createReader();
    const manifestPath = joinPath(this.projectPath!, 'assets', '_manifest.json');

    // Read or create manifest
    let manifest: DirectoryAssetManifest;
    if (await reader.exists(manifestPath)) {
      manifest = parseManifest(await reader.readText(manifestPath));
    } else {
      manifest = { _format: '1.0', assets: {} };
    }

    // Determine folder and unique filename
    const folder = getAssetFolder(asset.type, context);
    const existingNames = new Set(
      Object.values(manifest.assets).map(a => a.filename)
    );
    const uniqueFilename = generateUniqueFilename(asset.filename, existingNames);

    // Create manifest entry
    const entry: AssetManifestEntry = {
      id: asset.id,
      filename: uniqueFilename,
      type: asset.type,
      mimeType: asset.mimeType,
      size: asset.size,
      folder,
      uploadedAt: asset.uploadedAt?.toISOString(),
      metadata: asset.metadata,
    };
    setManifestEntry(manifest, entry);

    // Write the asset binary
    const assetDir = joinPath(this.projectPath!, 'assets', folder);
    await api.mkdir(assetDir);
    const arrayBuffer = await asset.blob.arrayBuffer();
    await this.writeBytes(joinPath(assetDir, uniqueFilename), new Uint8Array(arrayBuffer));

    // Write updated manifest
    await this.writeText(manifestPath, serializeManifest(manifest));
  }

  supportsGranularSave(): boolean {
    return true;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Path inside the project, with forward slashes; null if outside it. */
  private relPath(fullPath: string): string | null {
    if (!this.projectPath) return null;
    const norm = (p: string) => p.replace(/\\/g, '/');
    const base = norm(this.projectPath).replace(/\/+$/, '') + '/';
    const path = norm(fullPath);
    return path.startsWith(base) ? path.slice(base.length) : null;
  }

  private remember(fullPath: string, file: KnownFile): void {
    const rel = this.relPath(fullPath);
    if (rel) this.known.set(rel, file);
  }

  /**
   * Write a text file — unless it already says exactly this: rewriting every
   * file on every save made Git, sync clients and the watcher see 70 changes.
   */
  private async writeText(fullPath: string, content: string): Promise<void> {
    const api = window.electronAPI!.fs;
    this.remember(fullPath, { text: content });
    try {
      if (await api.exists(fullPath) && await this.createReader().readText(fullPath) === content) return;
    } catch {
      // unreadable — write it
    }
    await api.writeFile(fullPath, content);
  }

  private async writeBytes(fullPath: string, data: Uint8Array): Promise<void> {
    const api = window.electronAPI!.fs;
    const print = bytesPrint(data);
    this.remember(fullPath, { bytes: print });
    try {
      const existing = await api.exists(fullPath) ? toBytes(await api.readFile(fullPath)) : null;
      if (existing && bytesPrint(existing) === print) return;
    } catch {
      // unreadable — write it
    }
    await api.writeFile(fullPath, data);
  }

  /**
   * The reported paths whose content is not what this app last wrote or
   * read there. Paths we know nothing about count as changed.
   */
  private async changedOutside(changedFiles: string[]): Promise<string[]> {
    const api = window.electronAPI?.fs;
    const out: string[] = [];
    for (const raw of changedFiles) {
      const rel = raw.replace(/\\/g, '/');
      const known = this.known.get(rel);
      if (!known || !api || !this.projectPath) { out.push(rel); continue; }
      const fullPath = joinPath(this.projectPath, ...rel.split('/'));
      try {
        if (!await api.exists(fullPath)) {
          if (!('gone' in known)) out.push(rel);
          continue;
        }
        if ('gone' in known) { out.push(rel); continue; }
        const data = toBytes(await api.readFile(fullPath)) ?? new Uint8Array();
        const same = 'text' in known
          ? new TextDecoder().decode(data) === known.text
          : bytesPrint(data) === known.bytes;
        if (!same) out.push(rel);
      } catch {
        out.push(rel);
      }
    }
    return out;
  }

  /**
   * Convert a Project to SerializeInput for the directory format serializer.
   * When StoredAsset[] is provided, maps them to the SerializeInput.assets
   * format so the manifest is built correctly in a single serialization pass.
   */
  private projectToSerializeInput(project: Project, assets?: StoredAsset[]): SerializeInput {
    const story = project.story as any;

    // Handle both Story instances and plain objects
    let storyData: any;
    if (typeof story?.getAllBeats === 'function') {
      storyData = {
        metadata: story.getMetadata(),
        beats: story.getAllBeats().map((b: any) => typeof b.toJSON === 'function' ? b.toJSON() : b),
        settings: story.getSettings(),
        environment: story.getEnvironment(),
        characters: story.getCharacters(),
        clusters: story.getClusters(),
        containerBeatPositions: story.getContainerBeatPositions?.() || [],
      };
    } else {
      storyData = {
        metadata: story.metadata,
        beats: Array.isArray(story.beats)
          ? story.beats
          : story.beats instanceof Map
            ? Array.from(story.beats.values())
            : [],
        settings: story.settings,
        environment: story.environment || { props: [], nodes: [] },
        characters: story.characters || [],
        clusters: story.clusters || [],
        containerBeatPositions: story.containerBeatPositions || [],
      };
    }

    // Convert StoredAsset[] to the SerializeInput.assets format
    const inputAssets = assets?.map((a) => ({
      id: a.id,
      filename: a.filename,
      type: a.type,
      mimeType: a.mimeType,
      size: a.size,
      uploadedAt: a.uploadedAt,
      metadata: a.metadata,
      context: a.metadata?.subType as string | undefined,
    }));

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt,
        version: project.version,
        savedWith: APP_VERSION,
        settings: project.settings,
        globalSettings: project.globalSettings,
        themeId: project.themeId,
        themeOverrides: project.themeOverrides,
      },
      story: storyData,
      ...(inputAssets && inputAssets.length > 0 ? { assets: inputAssets } : {}),
      ...(project.translations && project.translations.length > 0 ? { translations: project.translations } : {}),
      ...(project.translationManifest ? { translationManifest: project.translationManifest } : {}),
      ...(project.generationReview ? { generationReview: project.generationReview } : {}),
      ...(project.aiEdits ? { aiEdits: project.aiEdits } : {}),
      ...(project.ideatorSessions?.length ? { ideatorSessions: project.ideatorSessions } : {}),
      ...(project.coDesignerSessions?.length ? { coDesignerSessions: project.coDesignerSessions } : {}),
    };
  }

  /**
   * Find the directory for a cluster by its ID
   */
  private async findClusterDir(clusterId: string): Promise<string> {
    if (!this.projectPath) return 'clusters/_unclustered';

    const reader = this.createReader();
    const indexPath = joinPath(this.projectPath!, 'clusters', '_index.json');

    if (await reader.exists(indexPath)) {
      const index = JSON.parse(await reader.readText(indexPath));
      const cluster = (index.clusters || []).find((c: any) => c.id === clusterId);
      if (cluster?.slug) {
        return `clusters/${cluster.slug}`;
      }
    }

    return 'clusters/_unclustered';
  }
}

/**
 * Check if we're in an Electron environment with filesystem access
 */
export function isElectronWithFS(): boolean {
  return !!(window as any).electronAPI?.fs;
}
