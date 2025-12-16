/**
 * Hybrid Storage Adapter
 *
 * Implements size-based routing for asset storage:
 * - Small assets (<5MB): IndexedDB for fast access
 * - Large assets (>=5MB): Filesystem or Cache API for storage efficiency
 *
 * Supports both browser (Cache API) and Electron (Node.js fs) environments
 *
 * Uses the shared schema from schema.ts for database consistency.
 */

import type {
  IStorageAdapter,
  StorageAdapterConfig,
  AssetStorageInfo,
  StorageLocation,
} from './IStorageAdapter';
import { StorageError } from './IStorageAdapter';
import type { Project, StoredAsset, StorageResult } from './types';
import type { IDBPDatabase } from 'idb';
import { initDatabase, type AsapsDBSchema } from './schema';

/**
 * Store names matching the schema definitions
 * These type-safe constants ensure we use the correct store names
 */
const STORES = {
  projects: 'projects' as const,
  assets: 'assets' as const,
  assetMetadata: 'asset-metadata' as const,
  history: 'history' as const,
  drafts: 'drafts' as const,
};

/**
 * Hybrid Storage Adapter Implementation
 */
export class HybridStorageAdapter implements IStorageAdapter {
  private db: IDBPDatabase<AsapsDBSchema> | null = null;
  private config: Required<StorageAdapterConfig>;
  private isElectron: boolean = false;
  private cache: Cache | null = null;

  constructor(config: StorageAdapterConfig = {}) {
    this.config = {
      sizeThreshold: config.sizeThreshold ?? 5242880, // 5MB default
      filesystemBasePath: config.filesystemBasePath ?? '~/.asaps-cache',
      enableCache: config.enableCache ?? true,
      cacheLimit: config.cacheLimit ?? 52428800, // 50MB default
    };

    // Detect environment
    this.isElectron = typeof window !== 'undefined' &&
                      !!(window as any).electron;
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async initialize(): Promise<void> {
    try {
      // Check if running in Node.js environment (no IndexedDB)
      const isNodeEnv = typeof indexedDB === 'undefined';

      if (isNodeEnv) {
        // In Node.js, we only use filesystem storage
        // Mark as "ready" for filesystem-only mode
        console.log('[HybridStorageAdapter] Running in Node.js mode - using filesystem only');
        await this.initializeFilesystem();
        return;
      }

      // Use the shared schema initialization from schema.ts
      // This ensures both HybridStorageAdapter and StorageManager use the same database
      console.log('[HybridStorageAdapter] Initializing with shared schema...');
      this.db = await initDatabase();
      console.log('[HybridStorageAdapter] Database initialized successfully');

      // Initialize Cache API (browser only)
      if (this.config.enableCache && typeof caches !== 'undefined') {
        try {
          this.cache = await caches.open('asaps-assets-cache');
          console.log('[HybridStorageAdapter] Cache API initialized');
        } catch (err) {
          console.warn('[HybridStorageAdapter] Cache API not available, using IndexedDB fallback');
        }
      }

      // Initialize filesystem (Electron only)
      if (this.isElectron) {
        await this.initializeFilesystem();
      }
    } catch (err) {
      console.error('[HybridStorageAdapter] Initialization failed:', err);
      throw new StorageError(
        'Failed to initialize storage',
        'STORAGE_UNAVAILABLE',
        err as Error
      );
    }
  }

  private async initializeFilesystem(): Promise<void> {
    if (!this.isElectron) return;

    try {
      const { fs, path } = (window as any).electron;
      const cacheDir = this.expandPath(this.config.filesystemBasePath);

      // Create cache directory structure
      const dirs = [
        cacheDir,
        path.join(cacheDir, 'backgrounds'),
        path.join(cacheDir, 'characters'),
        path.join(cacheDir, 'props'),
        path.join(cacheDir, 'sounds'),
        path.join(cacheDir, 'fonts'),
        path.join(cacheDir, 'other'),
      ];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (err) {
      console.warn('Failed to initialize filesystem cache:', err);
    }
  }

  private expandPath(pathStr: string): string {
    if (pathStr.startsWith('~/')) {
      const homeDir = (window as any).electron?.os?.homedir() || '~';
      return pathStr.replace('~', homeDir);
    }
    return pathStr;
  }

  isReady(): boolean {
    return this.db !== null;
  }

  // ============================================================
  // PROJECT OPERATIONS
  // ============================================================

  async saveProject(project: Project): Promise<void> {
    this.ensureReady();

    try {
      await this.db!.put(STORES.projects, {
        ...project,
        modifiedAt: new Date(),
      });
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
      const project = await this.db!.get(STORES.projects, projectId);
      return project || null;
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
      const projects = await this.db!.getAll(STORES.projects);
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        modifiedAt: p.modifiedAt,
        createdAt: p.createdAt,
      }));
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
      // Delete project
      await this.db!.delete(STORES.projects, projectId);

      // Delete associated assets
      await this.deleteProjectAssets(projectId);

      // Delete history
      await this.db!.delete(STORES.history, projectId);

      // Delete drafts
      const tx = this.db!.transaction(STORES.drafts, 'readwrite');
      const index = tx.store.index('by-project');
      const drafts = await index.getAll(projectId);

      for (const draft of drafts) {
        await tx.store.delete(draft.id);
      }

      await tx.done;
    } catch (err) {
      throw new StorageError(
        `Failed to delete project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  // ============================================================
  // ASSET OPERATIONS (Hybrid Storage)
  // ============================================================

  async saveAsset(asset: StoredAsset): Promise<AssetStorageInfo> {
    this.ensureReady();

    const location = this.getStorageLocation(asset.blob.size);
    const info: AssetStorageInfo = {
      id: asset.id,
      projectId: asset.projectId,
      location,
      size: asset.blob.size,
      mimeType: asset.mimeType,
      filename: asset.filename,
      uploadedAt: new Date().toISOString(),
      thumbnail: '', // Will be set later if image
    };

    try {
      // Generate thumbnail for images
      if (asset.mimeType.startsWith('image/')) {
        info.thumbnail = await this.generateThumbnail(asset.blob);
      }

      // Route to appropriate storage
      if (location === 'indexeddb') {
        await this.saveAssetToIndexedDB(asset);
      } else if (location === 'filesystem' && this.isElectron) {
        const path = await this.saveAssetToFilesystem(asset);
        info.path = path;
      } else if (location === 'cache-api' || location === 'filesystem') {
        // Fallback to Cache API in browser (if available)
        if (this.cache) {
          const path = await this.saveAssetToCache(asset);
          info.path = path;
          info.location = 'cache-api';
        } else {
          // If cache not available, fall back to IndexedDB
          await this.saveAssetToIndexedDB(asset);
          info.location = 'indexeddb';
        }
      }

      // Always save metadata to IndexedDB
      await this.db!.put(STORES.assetMetadata, info);

      return info;
    } catch (err) {
      if ((err as any).name === 'QuotaExceededError') {
        throw new StorageError(
          'Storage quota exceeded',
          'QUOTA_EXCEEDED',
          err as Error
        );
      }
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
      // Get metadata to determine location
      const metadata = await this.db!.get(STORES.assetMetadata, assetId);
      if (!metadata) return null;

      // Load from appropriate storage
      if (metadata.location === 'indexeddb') {
        const asset = await this.db!.get(STORES.assets, assetId);
        return asset?.blob || null;
      } else if (metadata.location === 'filesystem' && this.isElectron) {
        return await this.loadAssetFromFilesystem(metadata.path!);
      } else if (metadata.location === 'cache-api') {
        return await this.loadAssetFromCache(metadata.path!);
      }

      return null;
    } catch (err) {
      throw new StorageError(
        `Failed to load asset ${assetId}`,
        'NOT_FOUND',
        err as Error
      );
    }
  }

  async loadAssetInfo(assetId: string): Promise<AssetStorageInfo | null> {
    this.ensureReady();

    try {
      const metadata = await this.db!.get(STORES.assetMetadata, assetId);
      return metadata || null;
    } catch (err) {
      return null;
    }
  }

  async listAssets(projectId: string): Promise<AssetStorageInfo[]> {
    this.ensureReady();

    try {
      const tx = this.db!.transaction(STORES.assetMetadata, 'readonly');
      const index = tx.store.index('by-project');
      const assets = await index.getAll(projectId);
      return assets;
    } catch (err) {
      throw new StorageError(
        `Failed to list assets for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  /**
   * Get all assets for a project with blob data (compatible with StorageManager API)
   * This method combines metadata from asset-metadata store with blob data
   */
  async getProjectAssets(projectId: string): Promise<StorageResult<StoredAsset[]>> {
    this.ensureReady();

    try {
      const metadataList = await this.listAssets(projectId);
      const storedAssets: StoredAsset[] = [];

      for (const metadata of metadataList) {
        const blob = await this.loadAsset(metadata.id);
        if (blob) {
          // Convert AssetStorageInfo + blob to StoredAsset format
          const storedAsset: StoredAsset = {
            id: metadata.id,
            projectId: metadata.projectId,
            type: this.inferAssetType(metadata.mimeType),
            filename: metadata.filename,
            mimeType: metadata.mimeType,
            size: metadata.size,
            blob,
            uploadedAt: new Date(metadata.uploadedAt),
            lastUsedAt: new Date(),
            metadata: {
              // Include subType and other metadata from the stored info
              ...(metadata as any).metadata,
            },
          };
          storedAssets.push(storedAsset);
        }
      }

      return { success: true, data: storedAssets };
    } catch (err) {
      console.error('[HybridStorageAdapter] Failed to get project assets:', err);
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * Infer asset type from MIME type
   */
  private inferAssetType(mimeType: string): 'image' | 'audio' | 'video' | 'font' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('font') || mimeType === 'application/x-font-ttf' || mimeType === 'application/x-font-opentype') return 'font';
    return 'other';
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.ensureReady();

    try {
      // Get metadata to determine location
      const metadata = await this.db!.get(STORES.assetMetadata, assetId);
      if (!metadata) return;

      // Delete from storage locations
      await this.db!.delete(STORES.assetMetadata, assetId);

      if (metadata.location === 'indexeddb') {
        await this.db!.delete(STORES.assets, assetId);
      } else if (metadata.location === 'filesystem' && this.isElectron) {
        await this.deleteAssetFromFilesystem(metadata.path!);
      } else if (metadata.location === 'cache-api') {
        await this.deleteAssetFromCache(metadata.path!);
      }
    } catch (err) {
      console.warn(`Failed to delete asset ${assetId}:`, err);
    }
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    this.ensureReady();

    try {
      const assets = await this.listAssets(projectId);

      for (const asset of assets) {
        await this.deleteAsset(asset.id);
      }
    } catch (err) {
      throw new StorageError(
        `Failed to delete assets for project ${projectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  /**
   * Migrate all assets from one project to another
   * Used when saving an untitled project as a named project with a new ID
   */
  async migrateProjectAssets(fromProjectId: string, toProjectId: string): Promise<number> {
    this.ensureReady();

    try {
      console.log(`[HybridStorageAdapter] Migrating assets from ${fromProjectId} to ${toProjectId}`);
      const assets = await this.listAssets(fromProjectId);

      if (assets.length === 0) {
        console.log('[HybridStorageAdapter] No assets to migrate');
        return 0;
      }

      console.log(`[HybridStorageAdapter] Found ${assets.length} assets to migrate`);

      for (const assetInfo of assets) {
        // Update metadata record with new project ID
        const updatedInfo: AssetStorageInfo = {
          ...assetInfo,
          projectId: toProjectId,
        };
        await this.db!.put(STORES.assetMetadata, updatedInfo);

        // Also update the asset record in the assets store if it exists there
        const assetRecord = await this.db!.get(STORES.assets, assetInfo.id);
        if (assetRecord) {
          const updatedAsset = {
            ...assetRecord,
            projectId: toProjectId,
          };
          await this.db!.put(STORES.assets, updatedAsset);
        }

        console.log(`[HybridStorageAdapter] Migrated asset: ${assetInfo.filename}`);
      }

      console.log(`[HybridStorageAdapter] Successfully migrated ${assets.length} assets`);
      return assets.length;
    } catch (err) {
      console.error('[HybridStorageAdapter] Failed to migrate assets:', err);
      throw new StorageError(
        `Failed to migrate assets from ${fromProjectId} to ${toProjectId}`,
        'UNKNOWN',
        err as Error
      );
    }
  }

  async getAssetDataURL(assetId: string): Promise<string | null> {
    const blob = await this.loadAsset(assetId);
    if (!blob) return null;

    try {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => {
          // Fallback for test environment
          resolve('data:application/octet-stream;base64,');
        };
        try {
          reader.readAsDataURL(blob);
        } catch (readErr) {
          // Fallback if readAsDataURL fails
          resolve('data:application/octet-stream;base64,');
        }
      });
    } catch (err) {
      // In test environment, FileReader might not work properly
      // Return a placeholder data URL
      return 'data:application/octet-stream;base64,';
    }
  }

  async getAssetObjectURL(assetId: string): Promise<string | null> {
    const blob = await this.loadAsset(assetId);
    if (!blob) return null;

    // Check if URL.createObjectURL is available
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      // Fallback to data URL in test environment
      return this.getAssetDataURL(assetId);
    }

    return URL.createObjectURL(blob);
  }

  // ============================================================
  // STORAGE ROUTING
  // ============================================================

  getStorageLocation(sizeInBytes: number): StorageLocation {
    if (sizeInBytes < this.config.sizeThreshold) {
      return 'indexeddb';
    }

    // Prefer filesystem in Electron
    if (this.isElectron) {
      return 'filesystem';
    }

    // Fallback to Cache API in browser
    return 'cache-api';
  }

  // ============================================================
  // STORAGE-SPECIFIC OPERATIONS
  // ============================================================

  private async saveAssetToIndexedDB(asset: StoredAsset): Promise<void> {
    await this.db!.put(STORES.assets, {
      id: asset.id,
      projectId: asset.projectId,
      type: asset.type,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      blob: asset.blob,
      uploadedAt: asset.uploadedAt,
      thumbnail: asset.thumbnail,
    });
  }

  private async saveAssetToFilesystem(asset: StoredAsset): Promise<string> {
    const { fs, path } = (window as any).electron;
    const cacheDir = this.expandPath(this.config.filesystemBasePath);

    // Determine subfolder based on asset type
    const category = this.getAssetCategory(asset.mimeType);
    const subfolder = path.join(cacheDir, category);

    // Create unique filename
    const filename = `${asset.id}_${asset.filename}`;
    const filepath = path.join(subfolder, filename);

    // Write blob to file
    const buffer = await asset.blob.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));

    return filepath;
  }

  private async saveAssetToCache(asset: StoredAsset): Promise<string> {
    if (!this.cache) {
      throw new Error('Cache API not available');
    }

    const url = `asaps-asset://${asset.id}`;
    const response = new Response(asset.blob, {
      headers: {
        'Content-Type': asset.mimeType,
        'X-Asset-Filename': asset.filename,
      },
    });

    await this.cache.put(url, response);
    return url;
  }

  private async loadAssetFromFilesystem(path: string): Promise<Blob> {
    const { fs } = (window as any).electron;
    const buffer = fs.readFileSync(path);
    return new Blob([buffer]);
  }

  private async loadAssetFromCache(url: string): Promise<Blob | null> {
    if (!this.cache) return null;

    const response = await this.cache.match(url);
    if (!response) return null;

    return await response.blob();
  }

  private async deleteAssetFromFilesystem(path: string): Promise<void> {
    const { fs } = (window as any).electron;
    if (fs.existsSync(path)) {
      fs.unlinkSync(path);
    }
  }

  private async deleteAssetFromCache(url: string): Promise<void> {
    if (this.cache) {
      await this.cache.delete(url);
    }
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

    const projects = await this.db!.count(STORES.projects);
    const assets = await this.db!.count(STORES.assetMetadata);

    // Calculate IndexedDB size
    let indexedDBSize = 0;
    const dbAssets = await this.db!.getAll(STORES.assets);
    for (const asset of dbAssets) {
      if (asset.blob && typeof asset.blob.size === 'number') {
        indexedDBSize += asset.blob.size;
      }
    }

    const stats: any = {
      totalProjects: projects,
      totalAssets: assets,
      indexedDBSize,
    };

    // Add filesystem size if Electron
    if (this.isElectron) {
      stats.filesystemSize = await this.calculateFilesystemSize();
    }

    // Add cache size if available
    if (this.cache) {
      stats.cacheSize = await this.calculateCacheSize();
    }

    // Add available space if available
    if (typeof navigator.storage?.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      stats.availableSpace = (estimate.quota || 0) - (estimate.usage || 0);
    }

    return stats;
  }

  private async calculateFilesystemSize(): Promise<number> {
    if (!this.isElectron) return 0;

    try {
      const { fs, path } = (window as any).electron;
      const cacheDir = this.expandPath(this.config.filesystemBasePath);

      let totalSize = 0;
      const walkDir = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filepath = path.join(dir, file);
          const stat = fs.statSync(filepath);
          if (stat.isDirectory()) {
            walkDir(filepath);
          } else {
            totalSize += stat.size;
          }
        }
      };

      walkDir(cacheDir);
      return totalSize;
    } catch {
      return 0;
    }
  }

  private async calculateCacheSize(): Promise<number> {
    if (!this.cache) return 0;

    try {
      const keys = await this.cache.keys();
      let totalSize = 0;

      for (const request of keys) {
        const response = await this.cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  async clearCache(): Promise<void> {
    if (this.cache) {
      const keys = await this.cache.keys();
      for (const request of keys) {
        await this.cache.delete(request);
      }
    }
  }

  async cleanupOrphanedAssets(): Promise<number> {
    this.ensureReady();

    try {
      const projects = await this.db!.getAll(STORES.projects);
      const projectIds = new Set(projects.map((p) => p.id));

      const allAssets = await this.db!.getAll(STORES.assetMetadata);
      const orphaned = allAssets.filter((a: any) => !projectIds.has(a.projectId));

      for (const asset of orphaned) {
        await this.deleteAsset(asset.id);
      }

      return orphaned.length;
    } catch (err) {
      console.warn('Failed to cleanup orphaned assets:', err);
      return 0;
    }
  }

  async compact(): Promise<void> {
    // IndexedDB doesn't require manual compaction
    // This is a no-op for now
  }

  // ============================================================
  // HISTORY & DRAFTS
  // ============================================================

  async saveHistory(projectId: string, history: any): Promise<void> {
    this.ensureReady();

    // history is expected to contain commands and currentIndex
    await this.db!.put(STORES.history, {
      projectId,
      commands: history.commands || [],
      currentIndex: history.currentIndex || 0,
      lastUpdated: new Date(),
    });
  }

  async loadHistory(projectId: string): Promise<any> {
    this.ensureReady();

    const record = await this.db!.get(STORES.history, projectId);
    if (!record) return null;
    return { commands: record.commands, currentIndex: record.currentIndex };
  }

  async saveDraft(projectId: string, draft: any): Promise<void> {
    this.ensureReady();

    const id = `${projectId}_${Date.now()}`;
    await this.db!.add(STORES.drafts, {
      id,
      projectId,
      projectSnapshot: draft,
      createdAt: new Date(),
      isManual: draft.isManual || false,
    });
  }

  async loadDrafts(projectId: string): Promise<any[]> {
    this.ensureReady();

    const tx = this.db!.transaction(STORES.drafts, 'readonly');
    const index = tx.store.index('by-project');
    const drafts = await index.getAll(projectId);

    return drafts.map((d) => d.projectSnapshot);
  }

  async deleteDraft(draftId: string): Promise<void> {
    this.ensureReady();

    await this.db!.delete(STORES.drafts, draftId);
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  private ensureReady(): void {
    if (!this.isReady()) {
      throw new StorageError(
        'Storage not initialized',
        'STORAGE_UNAVAILABLE'
      );
    }
  }

  private getAssetCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) {
      // Could be background, character, or prop - default to 'other'
      return 'other';
    } else if (mimeType.startsWith('audio/')) {
      return 'sounds';
    } else if (mimeType.startsWith('video/')) {
      return 'other';
    } else if (mimeType.includes('font')) {
      return 'fonts';
    }
    return 'other';
  }

  private async generateThumbnail(blob: Blob): Promise<string> {
    try {
      // Check if URL.createObjectURL is available (not available in test environment)
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return 'data:image/png;base64,';
      }

      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
          try {
            // Create thumbnail (max 200x200)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              URL.revokeObjectURL(url);
              // Return empty data URL if canvas not available (test environment)
              resolve('data:image/png;base64,');
              return;
            }

            const maxSize = 200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } catch (err) {
            URL.revokeObjectURL(url);
            // Return empty data URL on error
            resolve('data:image/png;base64,');
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          // Return empty data URL on error
          resolve('data:image/png;base64,');
        };

        img.src = url;
      });
    } catch {
      // Return empty data URL if anything fails
      return 'data:image/png;base64,';
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let storageInstance: HybridStorageAdapter | null = null;

export function getStorageAdapter(config?: StorageAdapterConfig): HybridStorageAdapter {
  if (!storageInstance) {
    storageInstance = new HybridStorageAdapter(config);
  }
  return storageInstance;
}

export function resetStorageAdapter(): void {
  storageInstance = null;
}
