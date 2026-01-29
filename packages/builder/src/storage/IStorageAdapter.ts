/**
 * Storage Adapter Interface
 *
 * Abstraction layer for storage backends (IndexedDB, filesystem, etc.)
 * Enables hybrid storage: small assets in DB, large assets on filesystem
 */

import type { Project, StoredAsset } from './types';

/**
 * Storage location for assets
 */
export type StorageLocation = 'indexeddb' | 'filesystem' | 'cache-api';

/**
 * Asset storage info
 */
export interface AssetStorageInfo {
  id: string;
  projectId: string;
  location: StorageLocation;
  size: number;
  path?: string;          // Filesystem path (if location = 'filesystem')
  thumbnail?: string;     // Base64 thumbnail for quick preview
  mimeType: string;
  filename: string;
  uploadedAt: string;     // ISO timestamp
}

/**
 * Storage adapter configuration
 */
export interface StorageAdapterConfig {
  /**
   * Size threshold in bytes for determining storage location
   * Assets smaller than this go to IndexedDB, larger to filesystem
   * @default 5242880 (5MB)
   */
  sizeThreshold?: number;

  /**
   * Base path for filesystem storage (Electron/Node.js only)
   * @default ~/.asaps-cache
   */
  filesystemBasePath?: string;

  /**
   * Enable caching for frequently accessed assets
   * @default true
   */
  enableCache?: boolean;

  /**
   * Cache size limit in bytes
   * @default 52428800 (50MB)
   */
  cacheLimit?: number;
}

/**
 * Storage Adapter Interface
 *
 * Implementations:
 * - BrowserStorageAdapter (IndexedDB + Cache API)
 * - ElectronStorageAdapter (IndexedDB + Node.js fs)
 */
export interface IStorageAdapter {
  /**
   * Initialize storage adapter
   */
  initialize(): Promise<void>;

  /**
   * Check if storage is available and ready
   */
  isReady(): boolean;

  // ============================================================
  // PROJECT OPERATIONS (Always in database)
  // ============================================================

  /**
   * Save project metadata and structure
   * Note: Asset references only, not asset blobs
   */
  saveProject(project: Project): Promise<void>;

  /**
   * Load project by ID
   */
  loadProject(projectId: string): Promise<Project | null>;

  /**
   * List all projects (metadata only)
   */
  listProjects(): Promise<Array<Pick<Project, 'id' | 'name' | 'description' | 'modifiedAt' | 'createdAt'>>>;

  /**
   * Delete project and associated assets
   */
  deleteProject(projectId: string): Promise<void>;

  // ============================================================
  // ASSET OPERATIONS (Hybrid: DB for small, filesystem for large)
  // ============================================================

  /**
   * Save asset blob with automatic storage location routing
   * Returns asset storage info
   */
  saveAsset(asset: StoredAsset): Promise<AssetStorageInfo>;

  /**
   * Load asset blob by ID
   * Automatically retrieves from correct storage location
   */
  loadAsset(assetId: string): Promise<Blob | null>;

  /**
   * Load asset metadata without blob data
   */
  loadAssetInfo(assetId: string): Promise<AssetStorageInfo | null>;

  /**
   * List assets for a project
   */
  listAssets(projectId: string): Promise<AssetStorageInfo[]>;

  /**
   * Delete asset from all storage locations
   */
  deleteAsset(assetId: string): Promise<void>;

  /**
   * Delete all assets for a project
   */
  deleteProjectAssets(projectId: string): Promise<void>;

  /**
   * Reassociate all assets from one project ID to another
   * Used when importing assets with a temp ID then creating the real project
   */
  reassociateAssets(fromProjectId: string, toProjectId: string): Promise<number>;

  /**
   * Get asset as data URL (for embedding in HTML)
   * Useful for small assets that need inline embedding
   */
  getAssetDataURL(assetId: string): Promise<string | null>;

  /**
   * Get asset as object URL (for DOM usage)
   * Preferred for images, videos, audio in UI
   */
  getAssetObjectURL(assetId: string): Promise<string | null>;

  // ============================================================
  // STORAGE MANAGEMENT
  // ============================================================

  /**
   * Determine storage location for an asset based on size
   */
  getStorageLocation(sizeInBytes: number): StorageLocation;

  /**
   * Get storage statistics
   */
  getStorageStats(): Promise<{
    totalProjects: number;
    totalAssets: number;
    indexedDBSize: number;
    filesystemSize?: number;
    cacheSize?: number;
    availableSpace?: number;
  }>;

  /**
   * Clear cache (does not affect primary storage)
   */
  clearCache(): Promise<void>;

  /**
   * Cleanup orphaned assets (not referenced by any project)
   */
  cleanupOrphanedAssets(): Promise<number>;

  /**
   * Compact storage (defragment, remove deleted items)
   */
  compact(): Promise<void>;

  // ============================================================
  // HISTORY & DRAFTS (Always in database)
  // ============================================================

  /**
   * Save command history for undo/redo
   */
  saveHistory(projectId: string, history: any): Promise<void>;

  /**
   * Load command history
   */
  loadHistory(projectId: string): Promise<any>;

  /**
   * Save draft (auto-save snapshot)
   */
  saveDraft(projectId: string, draft: any): Promise<void>;

  /**
   * Load drafts for a project
   */
  loadDrafts(projectId: string): Promise<any[]>;

  /**
   * Delete draft
   */
  deleteDraft(draftId: string): Promise<void>;
}

/**
 * Storage adapter error types
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'STORAGE_UNAVAILABLE' | 'NOT_INITIALIZED' | 'UNKNOWN',
    public originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
