/**
 * DirectoryAdapter - Filesystem persistence for directory-based projects
 *
 * Reads and writes project files to the filesystem via Electron IPC.
 * Supports granular saves (single beat, settings, etc.) and file watching.
 *
 * Electron-only: requires window.electronAPI.fs
 */

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
  type DirectoryReader,
  type SerializeInput,
  type DirectoryAssetManifest,
  setManifestEntry,
  parseManifest,
  serializeManifest,
  getAssetFolder,
  generateUniqueFilename,
  type AssetManifestEntry,
} from '@asaps/core';
import type { PersistenceAdapter, FileChangeEvent } from './PersistenceAdapter';

/**
 * DirectoryAdapter implements PersistenceAdapter for filesystem-based projects.
 */
export class DirectoryAdapter implements PersistenceAdapter {
  readonly type = 'directory' as const;

  private projectPath: string | null = null;
  private unwatchFn: (() => void) | null = null;

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
    const reader = this.createReader();

    // Verify this is a directory project
    const isDir = await isDirectoryProject(dirPath, reader);
    if (!isDir) {
      throw new Error(`Not a valid ASAPS directory project: ${dirPath}`);
    }

    this.projectPath = dirPath;

    const result = await deserializeFromDirectory(dirPath, reader);

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
    };

    return project;
  }

  /**
   * Save the entire project to directory.
   * When `assets` are provided, their binaries are written to disk and the
   * manifest is populated correctly in a single pass (no need for separate
   * saveAsset() calls).
   */
  async saveProject(project: Project, assets?: StoredAsset[]): Promise<void> {
    if (!this.projectPath) {
      throw new Error('No project path set. Open a project first or set projectPath.');
    }

    const api = window.electronAPI;
    if (!api?.fs) {
      throw new Error('DirectoryAdapter requires Electron filesystem API');
    }

    const input = this.projectToSerializeInput(project, assets);
    const { files, assetFiles } = serializeToDirectory(input);

    // Write all JSON files (includes the manifest with asset entries)
    for (const file of files) {
      const fullPath = `${this.projectPath}/${file.path}`;
      // Ensure parent directory exists
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      await api.fs.mkdir(parentDir);
      await api.fs.writeFile(fullPath, file.content);
    }

    // Write binary asset files
    if (assets && assets.length > 0) {
      // Build a quick lookup from assetId -> StoredAsset blob
      const blobMap = new Map<string, Blob>();
      for (const a of assets) {
        blobMap.set(a.id, a.blob);
      }

      for (const af of assetFiles) {
        const blob = blobMap.get(af.assetId);
        if (!blob) continue; // skip assets without a blob (shouldn't happen)

        const fullPath = `${this.projectPath}/${af.path}`;
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        await api.fs.mkdir(parentDir);
        const arrayBuffer = await blob.arrayBuffer();
        await api.fs.writeFile(fullPath, new Uint8Array(arrayBuffer));
      }
    }
  }

  /**
   * Save a single beat file (granular save)
   */
  async saveBeat(beat: Beat, clusterId?: string): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
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

    const fullPath = `${this.projectPath}/${clusterDir}/${filename}`;
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await api.mkdir(parentDir);
    await api.writeFile(fullPath, deterministicStringify(serialized));
  }

  /**
   * Save settings only (granular save)
   */
  async saveSettings(settings: GlobalSettings): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    // Read existing settings to preserve projectSettings
    let existing: any = {};
    const settingsPath = `${this.projectPath}/settings.json`;
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

    await api.writeFile(settingsPath, deterministicStringify(settingsData));
  }

  /**
   * Save project metadata only (granular save)
   */
  async saveProjectMeta(project: Partial<Project>): Promise<void> {
    if (!this.projectPath) throw new Error('No project path set');
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    // Read existing project.json and update fields
    const reader = this.createReader();
    const projectPath = `${this.projectPath}/project.json`;
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

    await api.writeFile(projectPath, deterministicStringify(updated));
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

    // Use Electron IPC-based file watcher
    this.unwatchFn = api.fs.watchDir(
      this.projectPath,
      (changedFiles: string[]) => {
        const events: FileChangeEvent[] = changedFiles.map(f => ({
          path: f,
          type: 'modified' as const,
        }));
        callback(events);
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
    const clustersPath = `${this.projectPath}/clusters`;
    if (!await reader.exists(clustersPath)) return null;

    const dirs = await reader.listDir(clustersPath);
    for (const dir of dirs) {
      if (!dir.isDirectory) continue;
      const dirPath = `${clustersPath}/${dir.name}`;
      const files = await reader.listDir(dirPath);
      for (const file of files) {
        if (file.name.endsWith('.json') && file.name !== 'cluster.json' && file.name !== '_index.json') {
          const content = await reader.readText(`${dirPath}/${file.name}`);
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
    const api = window.electronAPI?.fs;
    if (!api) throw new Error('Requires Electron filesystem API');

    const reader = this.createReader();
    const manifestPath = `${this.projectPath}/assets/_manifest.json`;

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
    const assetDir = `${this.projectPath}/assets/${folder}`;
    await api.mkdir(assetDir);
    const arrayBuffer = await asset.blob.arrayBuffer();
    await api.writeFile(
      `${assetDir}/${uniqueFilename}`,
      new Uint8Array(arrayBuffer)
    );

    // Write updated manifest
    await api.writeFile(manifestPath, serializeManifest(manifest));
  }

  supportsGranularSave(): boolean {
    return true;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

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
        settings: project.settings,
        globalSettings: project.globalSettings,
        themeId: project.themeId,
        themeOverrides: project.themeOverrides,
      },
      story: storyData,
      ...(inputAssets && inputAssets.length > 0 ? { assets: inputAssets } : {}),
    };
  }

  /**
   * Find the directory for a cluster by its ID
   */
  private async findClusterDir(clusterId: string): Promise<string> {
    if (!this.projectPath) return 'clusters/_unclustered';

    const reader = this.createReader();
    const indexPath = `${this.projectPath}/clusters/_index.json`;

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
