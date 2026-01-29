/**
 * Filesystem Storage Adapter
 *
 * Persistent storage implementation for Node.js environment (API server).
 * Stores projects as JSON files and assets as binary files on disk.
 *
 * Directory structure:
 * ~/.asaps-storage/
 *   projects/
 *     {projectId}.json
 *   assets/
 *     {projectId}/
 *       backgrounds/
 *       characters/
 *       props/
 *       sounds/
 *       fonts/
 *       other/
 *   metadata/
 *     {assetId}.json
 *   history/
 *     {projectId}.json
 *   drafts/
 *     {projectId}/
 *       {timestamp}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  IStorageAdapter,
  StorageAdapterConfig,
  AssetStorageInfo,
  StorageLocation,
} from './IStorageAdapter';
import { StorageError } from './IStorageAdapter';
import type { Project, StoredAsset } from './types';

/**
 * Filesystem Storage Adapter Implementation
 */
export class FilesystemStorageAdapter implements IStorageAdapter {
  private baseDir: string;
  private initialized: boolean = false;
  private config: Required<StorageAdapterConfig>;

  constructor(config: StorageAdapterConfig = {}) {
    this.config = {
      sizeThreshold: config.sizeThreshold ?? 5242880, // 5MB (not used in filesystem mode)
      filesystemBasePath: config.filesystemBasePath ?? '~/.asaps-storage',
      enableCache: config.enableCache ?? false,
      cacheLimit: config.cacheLimit ?? 0,
    };

    // Expand home directory
    this.baseDir = this.expandPath(this.config.filesystemBasePath);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async initialize(): Promise<void> {
    try {
      // Create directory structure
      const dirs = [
        this.baseDir,
        path.join(this.baseDir, 'projects'),
        path.join(this.baseDir, 'assets'),
        path.join(this.baseDir, 'metadata'),
        path.join(this.baseDir, 'history'),
        path.join(this.baseDir, 'drafts'),
      ];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this.initialized = true;
      console.log(`[FilesystemStorageAdapter] Initialized at ${this.baseDir}`);
    } catch (err) {
      throw new StorageError(
        'Failed to initialize filesystem storage',
        'STORAGE_UNAVAILABLE',
        err as Error
      );
    }
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================
  // PROJECT OPERATIONS
  // ============================================================

  async saveProject(project: Project): Promise<void> {
    this.ensureReady();

    try {
      const projectPath = path.join(this.baseDir, 'projects', `${project.id}.json`);
      const data = {
        ...project,
        modifiedAt: new Date().toISOString(),
      };

      fs.writeFileSync(projectPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      throw new StorageError(
        `Failed to save project ${project.id}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async loadProject(projectId: string): Promise<Project | null> {
    this.ensureReady();

    try {
      const projectPath = path.join(this.baseDir, 'projects', `${projectId}.json`);

      if (!fs.existsSync(projectPath)) {
        return null;
      }

      const data = fs.readFileSync(projectPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      throw new StorageError(
        `Failed to load project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async listProjects(): Promise<
    Array<Pick<Project, 'id' | 'name' | 'description' | 'modifiedAt' | 'createdAt'>>
  > {
    this.ensureReady();

    try {
      const projectsDir = path.join(this.baseDir, 'projects');
      const files = fs.readdirSync(projectsDir);

      const projects: Array<Pick<Project, 'id' | 'name' | 'description' | 'modifiedAt' | 'createdAt'>> = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(projectsDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const project = JSON.parse(data);

          projects.push({
            id: project.id,
            name: project.name,
            description: project.description,
            modifiedAt: project.modifiedAt,
            createdAt: project.createdAt,
          });
        }
      }

      // Sort by modified date (newest first)
      return projects.sort((a, b) => {
        const dateA = new Date(a.modifiedAt || a.createdAt).getTime();
        const dateB = new Date(b.modifiedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
    } catch (err) {
      throw new StorageError(
        'Failed to list projects',
        'UNKNOWN',
        err as Error
      );
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    this.ensureReady();

    try {
      // Delete project file
      const projectPath = path.join(this.baseDir, 'projects', `${projectId}.json`);
      if (fs.existsSync(projectPath)) {
        fs.unlinkSync(projectPath);
      }

      // Delete associated assets
      const assetsDir = path.join(this.baseDir, 'assets', projectId);
      if (fs.existsSync(assetsDir)) {
        this.removeDirectory(assetsDir);
      }

      // Delete history
      const historyPath = path.join(this.baseDir, 'history', `${projectId}.json`);
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath);
      }

      // Delete drafts
      const draftsDir = path.join(this.baseDir, 'drafts', projectId);
      if (fs.existsSync(draftsDir)) {
        this.removeDirectory(draftsDir);
      }

      // Delete asset metadata for this project
      const metadataDir = path.join(this.baseDir, 'metadata');
      if (fs.existsSync(metadataDir)) {
        const metadataFiles = fs.readdirSync(metadataDir);
        for (const file of metadataFiles) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const metadata = JSON.parse(data);
            if (metadata.projectId === projectId) {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
    } catch (err) {
      throw new StorageError(
        `Failed to delete project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  // ============================================================
  // ASSET OPERATIONS
  // ============================================================

  getStorageLocation(sizeInBytes: number): StorageLocation {
    // All assets go to filesystem
    return 'filesystem';
  }

  async saveAsset(asset: StoredAsset): Promise<AssetStorageInfo> {
    this.ensureReady();

    try {
      // Determine folder based on asset type
      const folderName = this.getFolderForAssetType(asset.type);

      // Create project asset directory structure
      const projectAssetDir = path.join(this.baseDir, 'assets', asset.projectId, folderName);
      if (!fs.existsSync(projectAssetDir)) {
        fs.mkdirSync(projectAssetDir, { recursive: true });
      }

      // Save asset file
      const assetPath = path.join(projectAssetDir, asset.filename);
      const buffer = Buffer.from(await asset.blob.arrayBuffer());
      fs.writeFileSync(assetPath, buffer);

      // Create metadata
      const info: AssetStorageInfo = {
        id: asset.id,
        projectId: asset.projectId,
        filename: asset.filename,
        mimeType: asset.mimeType,
        size: asset.size,
        location: 'filesystem',
        path: assetPath,
        uploadedAt: new Date().toISOString(),
        thumbnail: '', // TODO: Generate thumbnails
      };

      // Save metadata
      const metadataPath = path.join(this.baseDir, 'metadata', `${asset.id}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(info, null, 2), 'utf-8');

      return info;
    } catch (err) {
      throw new StorageError(
        `Failed to save asset ${asset.id}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    this.ensureReady();

    try {
      // Load metadata to get file path
      const metadataPath = path.join(this.baseDir, 'metadata', `${assetId}.json`);

      if (!fs.existsSync(metadataPath)) {
        return null;
      }

      const metadata: AssetStorageInfo = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      if (!metadata.path || !fs.existsSync(metadata.path)) {
        return null;
      }

      // Load file as blob
      const buffer = fs.readFileSync(metadata.path);
      return new Blob([buffer], { type: metadata.mimeType });
    } catch (err) {
      throw new StorageError(
        `Failed to load asset ${assetId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async loadAssetInfo(assetId: string): Promise<AssetStorageInfo | null> {
    this.ensureReady();

    try {
      const metadataPath = path.join(this.baseDir, 'metadata', `${assetId}.json`);

      if (!fs.existsSync(metadataPath)) {
        return null;
      }

      const data = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      throw new StorageError(
        `Failed to load asset info ${assetId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async listAssets(projectId: string): Promise<AssetStorageInfo[]> {
    this.ensureReady();

    try {
      const metadataDir = path.join(this.baseDir, 'metadata');
      const files = fs.readdirSync(metadataDir);

      const assets: AssetStorageInfo[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(metadataDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const metadata: AssetStorageInfo = JSON.parse(data);

          if (metadata.projectId === projectId) {
            assets.push(metadata);
          }
        }
      }

      return assets;
    } catch (err) {
      throw new StorageError(
        `Failed to list assets for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.ensureReady();

    try {
      // Load metadata to get file path
      const metadataPath = path.join(this.baseDir, 'metadata', `${assetId}.json`);

      if (fs.existsSync(metadataPath)) {
        const data = fs.readFileSync(metadataPath, 'utf-8');
        const metadata: AssetStorageInfo = JSON.parse(data);

        // Delete asset file
        if (metadata.path && fs.existsSync(metadata.path)) {
          fs.unlinkSync(metadata.path);
        }

        // Delete metadata
        fs.unlinkSync(metadataPath);
      }
    } catch (err) {
      throw new StorageError(
        `Failed to delete asset ${assetId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    this.ensureReady();

    try {
      const assetsDir = path.join(this.baseDir, 'assets', projectId);

      if (fs.existsSync(assetsDir)) {
        this.removeDirectory(assetsDir);
      }

      // Delete metadata for project assets
      const metadataDir = path.join(this.baseDir, 'metadata');
      if (fs.existsSync(metadataDir)) {
        const files = fs.readdirSync(metadataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const metadata: AssetStorageInfo = JSON.parse(data);
            if (metadata.projectId === projectId) {
              fs.unlinkSync(filePath);
            }
          }
        }
      }
    } catch (err) {
      throw new StorageError(
        `Failed to delete assets for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async reassociateAssets(fromProjectId: string, toProjectId: string): Promise<number> {
    this.ensureReady();

    try {
      // Update metadata files to point to new project ID
      const metadataDir = path.join(this.baseDir, 'metadata');
      let count = 0;

      if (fs.existsSync(metadataDir)) {
        const files = fs.readdirSync(metadataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const metadata: AssetStorageInfo = JSON.parse(data);
            if (metadata.projectId === fromProjectId) {
              metadata.projectId = toProjectId;
              fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
              count++;
            }
          }
        }
      }

      // Move asset files if they exist in project-specific directories
      const fromDir = path.join(this.baseDir, 'assets', fromProjectId);
      const toDir = path.join(this.baseDir, 'assets', toProjectId);

      if (fs.existsSync(fromDir)) {
        if (!fs.existsSync(toDir)) {
          fs.mkdirSync(toDir, { recursive: true });
        }
        const assetFiles = fs.readdirSync(fromDir);
        for (const assetFile of assetFiles) {
          const fromPath = path.join(fromDir, assetFile);
          const toPath = path.join(toDir, assetFile);
          fs.renameSync(fromPath, toPath);
        }
        // Remove empty source directory
        fs.rmdirSync(fromDir);
      }

      return count;
    } catch (err) {
      throw new StorageError(
        `Failed to reassociate assets from ${fromProjectId} to ${toProjectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async getAssetDataURL(assetId: string): Promise<string | null> {
    this.ensureReady();

    try {
      const blob = await this.loadAsset(assetId);
      if (!blob) return null;

      const buffer = Buffer.from(await blob.arrayBuffer());
      const base64 = buffer.toString('base64');
      return `data:${blob.type};base64,${base64}`;
    } catch (err) {
      throw new StorageError(
        `Failed to get asset data URL ${assetId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async getAssetObjectURL(assetId: string): Promise<string | null> {
    // Object URLs don't make sense in Node.js filesystem context
    // Return file path instead
    const info = await this.loadAssetInfo(assetId);
    return info?.path || null;
  }

  // ============================================================
  // STORAGE MANAGEMENT
  // ============================================================

  async getStorageStats(): Promise<{
    totalProjects: number;
    totalAssets: number;
    indexedDBSize: number;
    filesystemSize?: number;
    cacheSize?: number;
    availableSpace?: number;
  }> {
    this.ensureReady();

    try {
      let totalSize = 0;
      let assetCount = 0;

      const metadataDir = path.join(this.baseDir, 'metadata');
      if (fs.existsSync(metadataDir)) {
        const files = fs.readdirSync(metadataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const metadata: AssetStorageInfo = JSON.parse(data);
            totalSize += metadata.size;
            assetCount++;
          }
        }
      }

      // Count projects
      const projectsDir = path.join(this.baseDir, 'projects');
      const projectCount = fs.existsSync(projectsDir)
        ? fs.readdirSync(projectsDir).filter(f => f.endsWith('.json')).length
        : 0;

      return {
        totalProjects: projectCount,
        totalAssets: assetCount,
        indexedDBSize: 0,
        filesystemSize: totalSize,
        cacheSize: 0,
      };
    } catch (err) {
      throw new StorageError(
        'Failed to get storage stats',
        'UNKNOWN',
        err as Error
      );
    }
  }

  async cleanupOrphanedAssets(): Promise<number> {
    this.ensureReady();

    try {
      let cleanedCount = 0;

      // Get all project IDs
      const projectsDir = path.join(this.baseDir, 'projects');
      const projectFiles = fs.readdirSync(projectsDir);
      const validProjectIds = new Set<string>();

      for (const file of projectFiles) {
        if (file.endsWith('.json')) {
          const projectId = file.replace('.json', '');
          validProjectIds.add(projectId);
        }
      }

      // Check metadata for orphaned assets
      const metadataDir = path.join(this.baseDir, 'metadata');
      if (fs.existsSync(metadataDir)) {
        const files = fs.readdirSync(metadataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(metadataDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const metadata: AssetStorageInfo = JSON.parse(data);

            if (!validProjectIds.has(metadata.projectId)) {
              // Delete orphaned asset
              const assetId = file.replace('.json', '');
              await this.deleteAsset(assetId);
              cleanedCount++;
            }
          }
        }
      }

      return cleanedCount;
    } catch (err) {
      throw new StorageError(
        'Failed to cleanup orphaned assets',
        'UNKNOWN',
        err as Error
      );
    }
  }

  async clearCache(): Promise<void> {
    // No cache in filesystem storage
  }

  async compact(): Promise<void> {
    // No compaction needed for filesystem storage
  }

  // ============================================================
  // HISTORY & DRAFTS
  // ============================================================

  async saveHistory(projectId: string, history: any): Promise<void> {
    this.ensureReady();

    try {
      const historyPath = path.join(this.baseDir, 'history', `${projectId}.json`);
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
      throw new StorageError(
        `Failed to save history for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async loadHistory(projectId: string): Promise<any | null> {
    this.ensureReady();

    try {
      const historyPath = path.join(this.baseDir, 'history', `${projectId}.json`);

      if (!fs.existsSync(historyPath)) {
        return null;
      }

      const data = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      throw new StorageError(
        `Failed to load history for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async saveDraft(projectId: string, draft: any): Promise<void> {
    this.ensureReady();

    try {
      const draftsDir = path.join(this.baseDir, 'drafts', projectId);
      if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const draftPath = path.join(draftsDir, `${timestamp}.json`);

      const data = {
        ...draft,
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      throw new StorageError(
        `Failed to save draft for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async loadDrafts(projectId: string): Promise<any[]> {
    this.ensureReady();

    try {
      const draftsDir = path.join(this.baseDir, 'drafts', projectId);

      if (!fs.existsSync(draftsDir)) {
        return [];
      }

      const files = fs.readdirSync(draftsDir);
      const drafts: any[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(draftsDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          drafts.push(JSON.parse(data));
        }
      }

      // Sort by timestamp (newest first)
      return drafts.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      });
    } catch (err) {
      throw new StorageError(
        `Failed to load drafts for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    this.ensureReady();

    try {
      // Find the draft file across all project draft directories
      const draftsBaseDir = path.join(this.baseDir, 'drafts');
      if (!fs.existsSync(draftsBaseDir)) {
        return;
      }

      const projectDirs = fs.readdirSync(draftsBaseDir);
      for (const projectDir of projectDirs) {
        const projectDraftsDir = path.join(draftsBaseDir, projectDir);
        if (fs.lstatSync(projectDraftsDir).isDirectory()) {
          const files = fs.readdirSync(projectDraftsDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(projectDraftsDir, file);
              const data = fs.readFileSync(filePath, 'utf-8');
              const draft = JSON.parse(data);
              if (draft.id === draftId) {
                fs.unlinkSync(filePath);
                return;
              }
            }
          }
        }
      }
    } catch (err) {
      throw new StorageError(
        `Failed to delete draft ${draftId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private ensureReady(): void {
    if (!this.initialized) {
      throw new StorageError('Storage not initialized', 'NOT_INITIALIZED');
    }
  }

  private expandPath(pathStr: string): string {
    if (pathStr.startsWith('~/')) {
      return path.join(os.homedir(), pathStr.slice(2));
    }
    return pathStr;
  }

  private getFolderForAssetType(type: string): string {
    switch (type) {
      case 'image':
      case 'background':
        return 'backgrounds';
      case 'character':
        return 'characters';
      case 'prop':
        return 'props';
      case 'audio':
      case 'sound':
        return 'sounds';
      case 'video':
        return 'videos';
      case 'font':
        return 'fonts';
      default:
        return 'other';
    }
  }

  private removeDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.lstatSync(filePath).isDirectory()) {
          this.removeDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  }
}

// ============================================================================
// Singleton Instance (for API server)
// ============================================================================

let filesystemStorageInstance: FilesystemStorageAdapter | null = null;

export function getFilesystemStorage(
  config?: StorageAdapterConfig
): FilesystemStorageAdapter {
  if (!filesystemStorageInstance) {
    filesystemStorageInstance = new FilesystemStorageAdapter(config);
  }
  return filesystemStorageInstance;
}

export function resetFilesystemStorage(): void {
  filesystemStorageInstance = null;
}
