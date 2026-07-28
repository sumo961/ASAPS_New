/**
 * StorageManager - Main interface for all persistence operations
 *
 * Provides CRUD operations for projects, assets, command history, and auto-save drafts.
 * Handles IndexedDB transactions and error management.
 */

import type { IDBPDatabase } from 'idb';
import { initDatabase, getDatabase, type AsapsDBSchema } from './schema';
import type {
  Project,
  ProjectQuery,
  StoredAsset,
  AssetQuery,
  CommandHistory,
  AutoSaveDraft,
  StorageOptions,
  StorageResult,
  AssetType,
} from './types';

// ============================================================================
// Storage Manager Class
// ============================================================================

/**
 * Main storage manager for IndexedDB operations
 */
export class StorageManager {
  private db: IDBPDatabase<AsapsDBSchema> | null = null;
  private options: Required<StorageOptions>;

  constructor(options: StorageOptions = {}) {
    this.options = {
      dbName: options.dbName || 'asaps-storage',
      dbVersion: options.dbVersion || 1,
      debug: options.debug || false,
    };
  }

  /**
   * Initialize the storage manager and database
   */
  async init(): Promise<void> {
    if (this.db) {
      this.log('Database already initialized');
      return;
    }

    try {
      this.db = await initDatabase();
      this.log('StorageManager initialized successfully');
    } catch (error) {
      this.logError('Failed to initialize database', error);
      throw error;
    }
  }

  /**
   * Get database connection (auto-initialize if needed)
   */
  private async getDb(): Promise<IDBPDatabase<AsapsDBSchema>> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.log('Database connection closed');
    }
  }

  // ============================================================================
  // Project Operations
  // ============================================================================

  /**
   * Create a new project
   */
  async createProject(project: Project): Promise<StorageResult<Project>> {
    try {
      const db = await this.getDb();
      await db.add('projects', project);
      this.log('Project created:', project.id);
      return { success: true, data: project };
    } catch (error) {
      this.logError('Failed to create project', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * IndexedDB's structured clone preserves Date objects, but records that
   * went through a JSON round-trip before being stored (imports, dev
   * tooling, external writers) carry ISO strings instead — and one such
   * record crashes every date consumer (ProjectSelector's formatTimeAgo
   * took down the whole header). Coerce at the read boundary; an
   * unparseable value degrades to epoch rather than throwing.
   */
  private coerceProjectDates(project: Project): Project {
    const coerce = (v: unknown): Date => {
      if (v instanceof Date) return v;
      const d = new Date(v as string | number);
      return isNaN(d.getTime()) ? new Date(0) : d;
    };
    project.createdAt = coerce(project.createdAt);
    project.modifiedAt = coerce(project.modifiedAt);
    return project;
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<StorageResult<Project>> {
    try {
      const db = await this.getDb();
      const project = await db.get('projects', projectId);

      if (!project) {
        return { success: false, error: new Error('Project not found') };
      }

      this.log('Project retrieved:', projectId);
      return { success: true, data: this.coerceProjectDates(project) };
    } catch (error) {
      this.logError('Failed to get project', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Update an existing project
   */
  async updateProject(project: Project): Promise<StorageResult<Project>> {
    try {
      const db = await this.getDb();

      // Update modifiedAt timestamp
      project.modifiedAt = new Date();

      await db.put('projects', project);
      this.log('Project updated:', project.id);
      return { success: true, data: project };
    } catch (error) {
      this.logError('Failed to update project', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Delete a project and all its associated data
   */
  async deleteProject(projectId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      const tx = db.transaction(['projects', 'assets', 'history', 'drafts'], 'readwrite');

      // Delete project
      await tx.objectStore('projects').delete(projectId);

      // Delete all assets for this project
      const assetIndex = tx.objectStore('assets').index('by-project');
      const assetKeys = await assetIndex.getAllKeys(projectId);
      for (const key of assetKeys) {
        await tx.objectStore('assets').delete(key);
      }

      // Delete command history
      await tx.objectStore('history').delete(projectId);

      // Delete auto-save drafts
      const draftIndex = tx.objectStore('drafts').index('by-project');
      const draftKeys = await draftIndex.getAllKeys(projectId);
      for (const key of draftKeys) {
        await tx.objectStore('drafts').delete(key);
      }

      await tx.done;
      this.log('Project and associated data deleted:', projectId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to delete project', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * List all projects with optional filtering and sorting
   */
  async listProjects(query: ProjectQuery = {}): Promise<StorageResult<Project[]>> {
    try {
      const db = await this.getDb();
      let projects: Project[];

      // Get projects using appropriate index
      if (query.sortBy === 'modified') {
        const index = db.transaction('projects').store.index('by-modified');
        projects = await index.getAll();
      } else if (query.sortBy === 'created') {
        const index = db.transaction('projects').store.index('by-created');
        projects = await index.getAll();
      } else if (query.sortBy === 'name') {
        const index = db.transaction('projects').store.index('by-name');
        projects = await index.getAll();
      } else {
        projects = await db.getAll('projects');
      }

      // Apply name filter
      if (query.nameFilter) {
        const filterLower = query.nameFilter.toLowerCase();
        projects = projects.filter((p) => p.name.toLowerCase().includes(filterLower));
      }

      // Apply sort direction
      if (query.sortDirection === 'desc') {
        projects.reverse();
      }

      // Apply pagination
      const start = query.offset || 0;
      const end = query.limit ? start + query.limit : undefined;
      projects = projects.slice(start, end);

      this.log('Projects listed:', projects.length);
      return { success: true, data: projects.map((p) => this.coerceProjectDates(p)) };
    } catch (error) {
      this.logError('Failed to list projects', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Check if a project exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    try {
      const db = await this.getDb();
      const count = await db.count('projects', projectId);
      return count > 0;
    } catch (error) {
      this.logError('Failed to check project existence', error);
      return false;
    }
  }

  // ============================================================================
  // Asset Operations
  // ============================================================================

  /**
   * Store an asset
   */
  async createAsset(asset: StoredAsset): Promise<StorageResult<StoredAsset>> {
    try {
      const db = await this.getDb();
      await db.add('assets', asset);
      this.log('Asset created:', asset.id);
      return { success: true, data: asset };
    } catch (error) {
      this.logError('Failed to create asset', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Get an asset by ID
   */
  async getAsset(assetId: string): Promise<StorageResult<StoredAsset>> {
    try {
      const db = await this.getDb();
      const asset = await db.get('assets', assetId);

      if (!asset) {
        return { success: false, error: new Error('Asset not found') };
      }

      this.log('Asset retrieved:', assetId);
      return { success: true, data: asset };
    } catch (error) {
      this.logError('Failed to get asset', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Update an asset
   */
  async updateAsset(asset: StoredAsset): Promise<StorageResult<StoredAsset>> {
    try {
      const db = await this.getDb();
      asset.lastUsedAt = new Date();
      await db.put('assets', asset);
      this.log('Asset updated:', asset.id);
      return { success: true, data: asset };
    } catch (error) {
      this.logError('Failed to update asset', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      await db.delete('assets', assetId);
      this.log('Asset deleted:', assetId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to delete asset', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * List assets with optional filtering
   */
  async listAssets(query: AssetQuery = {}): Promise<StorageResult<StoredAsset[]>> {
    try {
      const db = await this.getDb();
      let assets: StoredAsset[];

      if (query.projectId && query.type) {
        // Use compound index
        const index = db.transaction('assets').store.index('by-project-type');
        assets = await index.getAll([query.projectId, query.type]);
      } else if (query.projectId) {
        const index = db.transaction('assets').store.index('by-project');
        assets = await index.getAll(query.projectId);
      } else if (query.type) {
        const index = db.transaction('assets').store.index('by-type');
        assets = await index.getAll(query.type);
      } else {
        assets = await db.getAll('assets');
      }

      // Apply limit
      if (query.limit) {
        assets = assets.slice(0, query.limit);
      }

      this.log('Assets listed:', assets.length);
      return { success: true, data: assets };
    } catch (error) {
      this.logError('Failed to list assets', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Get assets for a specific project
   * Falls back to v2 asset-metadata store if v1 assets store is empty
   */
  async getProjectAssets(projectId: string): Promise<StorageResult<StoredAsset[]>> {
    // First try v1 assets store
    const v1Result = await this.listAssets({ projectId });

    // If v1 store has assets, return them
    if (v1Result.success && v1Result.data && v1Result.data.length > 0) {
      return v1Result;
    }

    // Fall back to v2 asset-metadata store (used by HybridStorageAdapter)
    try {
      const db = await this.getDb();

      // Check if asset-metadata store exists
      if (!db.objectStoreNames.contains('asset-metadata')) {
        return v1Result; // Return v1 result (empty) if v2 store doesn't exist
      }

      const tx = db.transaction(['asset-metadata', 'assets'], 'readonly');
      const metadataIndex = tx.objectStore('asset-metadata').index('by-project');
      const metadataList = await metadataIndex.getAll(projectId);

      if (metadataList.length === 0) {
        return v1Result; // Return v1 result if no v2 assets either
      }

      // Load assets from v2 storage
      const storedAssets: StoredAsset[] = [];
      const assetsStore = tx.objectStore('assets');

      for (const metadata of metadataList) {
        // Load blob from assets store (v2 uses same store for small assets)
        const assetData = await assetsStore.get(metadata.id);
        if (assetData?.blob) {
          // Convert v2 metadata + blob to StoredAsset format
          const storedAsset: StoredAsset = {
            id: metadata.id,
            projectId: metadata.projectId,
            type: this.inferAssetType(metadata.mimeType),
            filename: metadata.filename,
            mimeType: metadata.mimeType,
            size: metadata.size,
            blob: assetData.blob,
            uploadedAt: new Date(metadata.uploadedAt),
            lastUsedAt: new Date(),
            metadata: (metadata as any).metadata || {},
          };
          storedAssets.push(storedAsset);
        }
      }

      this.log('Assets loaded from v2 store:', storedAssets.length);
      return { success: true, data: storedAssets };
    } catch (error) {
      this.logError('Failed to load assets from v2 store', error);
      return v1Result; // Return v1 result on error
    }
  }

  /**
   * Infer asset type from MIME type
   */
  private inferAssetType(mimeType: string): AssetType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('font')) return 'font';
    return 'other';
  }

  /**
   * Delete all assets for a project
   */
  async deleteProjectAssets(projectId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      const tx = db.transaction('assets', 'readwrite');
      const index = tx.store.index('by-project');
      const assetKeys = await index.getAllKeys(projectId);

      for (const key of assetKeys) {
        await tx.store.delete(key);
      }

      await tx.done;
      this.log('Project assets deleted:', projectId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to delete project assets', error);
      return { success: false, error: error as Error };
    }
  }

  // ============================================================================
  // Command History Operations
  // ============================================================================

  /**
   * Save command history for a project
   */
  async saveHistory(history: CommandHistory): Promise<StorageResult<CommandHistory>> {
    try {
      const db = await this.getDb();
      await db.put('history', history);
      this.log('History saved:', history.projectId);
      return { success: true, data: history };
    } catch (error) {
      this.logError('Failed to save history', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Get command history for a project
   */
  async getHistory(projectId: string): Promise<StorageResult<CommandHistory>> {
    try {
      const db = await this.getDb();
      const history = await db.get('history', projectId);

      if (!history) {
        // Return empty history if none exists
        const emptyHistory: CommandHistory = {
          projectId,
          commands: [],
          currentIndex: -1,
          lastUpdated: new Date(),
        };
        return { success: true, data: emptyHistory };
      }

      this.log('History retrieved:', projectId);
      return { success: true, data: history };
    } catch (error) {
      this.logError('Failed to get history', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Clear command history for a project
   */
  async clearHistory(projectId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      await db.delete('history', projectId);
      this.log('History cleared:', projectId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to clear history', error);
      return { success: false, error: error as Error };
    }
  }

  // ============================================================================
  // Auto-Save Draft Operations
  // ============================================================================

  /**
   * Save an auto-save draft
   */
  async saveDraft(draft: AutoSaveDraft): Promise<StorageResult<AutoSaveDraft>> {
    try {
      const db = await this.getDb();
      await db.put('drafts', draft);
      this.log('Draft saved:', draft.id);
      return { success: true, data: draft };
    } catch (error) {
      this.logError('Failed to save draft', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Get the latest draft for a project
   */
  async getLatestDraft(projectId: string): Promise<StorageResult<AutoSaveDraft>> {
    try {
      const db = await this.getDb();
      const index = db.transaction('drafts').store.index('by-project');
      const drafts = await index.getAll(projectId);

      if (drafts.length === 0) {
        return { success: false, error: new Error('No drafts found') };
      }

      // Sort by timestamp and get the latest
      drafts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const latest = drafts[0];

      this.log('Latest draft retrieved:', latest.id);
      return { success: true, data: latest };
    } catch (error) {
      this.logError('Failed to get latest draft', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * List all drafts for a project
   */
  async listDrafts(projectId: string): Promise<StorageResult<AutoSaveDraft[]>> {
    try {
      const db = await this.getDb();
      const index = db.transaction('drafts').store.index('by-project');
      const drafts = await index.getAll(projectId);

      // Sort by timestamp descending
      drafts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      this.log('Drafts listed:', drafts.length);
      return { success: true, data: drafts };
    } catch (error) {
      this.logError('Failed to list drafts', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      await db.delete('drafts', draftId);
      this.log('Draft deleted:', draftId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to delete draft', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Delete all drafts for a project
   */
  async deleteProjectDrafts(projectId: string): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      const tx = db.transaction('drafts', 'readwrite');
      const index = tx.store.index('by-project');
      const draftKeys = await index.getAllKeys(projectId);

      for (const key of draftKeys) {
        await tx.store.delete(key);
      }

      await tx.done;
      this.log('Project drafts deleted:', projectId);
      return { success: true };
    } catch (error) {
      this.logError('Failed to delete project drafts', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Clean up old drafts (keep only last N drafts per project)
   */
  async cleanupOldDrafts(projectId: string, keepCount: number = 10): Promise<StorageResult<number>> {
    try {
      const result = await this.listDrafts(projectId);
      if (!result.success || !result.data) {
        return { success: false, error: result.error };
      }

      const drafts = result.data;
      if (drafts.length <= keepCount) {
        return { success: true, data: 0 };
      }

      // Delete old drafts
      const draftsToDelete = drafts.slice(keepCount);
      let deletedCount = 0;

      for (const draft of draftsToDelete) {
        const deleteResult = await this.deleteDraft(draft.id);
        if (deleteResult.success) {
          deletedCount++;
        }
      }

      this.log('Old drafts cleaned up:', deletedCount);
      return { success: true, data: deletedCount };
    } catch (error) {
      this.logError('Failed to cleanup old drafts', error);
      return { success: false, error: error as Error };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageResult<{
    projectCount: number;
    assetCount: number;
    totalAssetSize: number;
    draftCount: number;
  }>> {
    try {
      const db = await this.getDb();

      const projectCount = await db.count('projects');
      const assetCount = await db.count('assets');
      const draftCount = await db.count('drafts');

      // Calculate total asset size
      const assets = await db.getAll('assets');
      const totalAssetSize = assets.reduce((sum, asset) => sum + asset.size, 0);

      const stats = {
        projectCount,
        assetCount,
        totalAssetSize,
        draftCount,
      };

      this.log('Stats retrieved:', stats);
      return { success: true, data: stats };
    } catch (error) {
      this.logError('Failed to get stats', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Clear all data (for testing/reset)
   */
  async clearAll(): Promise<StorageResult<void>> {
    try {
      const db = await this.getDb();
      const tx = db.transaction(['projects', 'assets', 'history', 'drafts'], 'readwrite');

      await tx.objectStore('projects').clear();
      await tx.objectStore('assets').clear();
      await tx.objectStore('history').clear();
      await tx.objectStore('drafts').clear();

      await tx.done;
      this.log('All data cleared');
      return { success: true };
    } catch (error) {
      this.logError('Failed to clear all data', error);
      return { success: false, error: error as Error };
    }
  }

  // ============================================================================
  // Logging Helpers
  // ============================================================================

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[StorageManager]', ...args);
    }
  }

  private logError(message: string, error: any): void {
    console.error(`[StorageManager] ${message}:`, error);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let storageManagerInstance: StorageManager | null = null;

/**
 * Get the singleton StorageManager instance
 */
export function getStorageManager(options?: StorageOptions): StorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager(options);
  }
  return storageManagerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetStorageManager(): void {
  if (storageManagerInstance) {
    storageManagerInstance.close();
    storageManagerInstance = null;
  }
}
