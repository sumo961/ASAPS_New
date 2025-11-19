/**
 * Memory Storage Adapter
 *
 * Simple in-memory storage implementation for Node.js environment (API server).
 * Stores everything in memory - data is lost when server restarts.
 *
 * This is a temporary solution for the HTTP API server.
 * For production, use a proper database or filesystem backend.
 */

import type {
  IStorageAdapter,
  StorageAdapterConfig,
  AssetStorageInfo,
  StorageLocation,
} from './IStorageAdapter';
import { StorageError } from './IStorageAdapter';
import type { Project, StoredAsset } from './types';

/**
 * Memory Storage Adapter Implementation
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private projects: Map<string, Project> = new Map();
  private assets: Map<string, Blob> = new Map();
  private assetMetadata: Map<string, AssetStorageInfo> = new Map();
  private history: Map<string, any> = new Map();
  private drafts: Map<string, any[]> = new Map();
  private initialized: boolean = false;

  constructor(config: StorageAdapterConfig = {}) {
    // Config ignored for in-memory storage
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
    this.initialized = true;
    console.log('[MemoryStorageAdapter] Initialized (in-memory storage)');
  }

  isReady(): boolean {
    return this.initialized;
  }

  // ============================================================
  // PROJECT OPERATIONS
  // ============================================================

  async saveProject(project: Project): Promise<void> {
    this.ensureReady();
    const now = new Date();
    this.projects.set(project.id, {
      ...project,
      modifiedAt: project.modifiedAt instanceof Date ? project.modifiedAt : now,
    });
  }

  async loadProject(projectId: string): Promise<Project | null> {
    this.ensureReady();
    return this.projects.get(projectId) || null;
  }

  async listProjects(): Promise<
    Array<Pick<Project, 'id' | 'name' | 'description' | 'modifiedAt' | 'createdAt'>>
  > {
    this.ensureReady();
    return Array.from(this.projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      modifiedAt: p.modifiedAt,
      createdAt: p.createdAt,
    }));
  }

  async deleteProject(projectId: string): Promise<void> {
    this.ensureReady();

    // Delete project
    this.projects.delete(projectId);

    // Delete associated assets
    const assetsToDelete: string[] = [];
    for (const [assetId, info] of this.assetMetadata.entries()) {
      if (info.projectId === projectId) {
        assetsToDelete.push(assetId);
      }
    }

    for (const assetId of assetsToDelete) {
      this.assets.delete(assetId);
      this.assetMetadata.delete(assetId);
    }

    // Delete history and drafts
    this.history.delete(projectId);
    this.drafts.delete(projectId);
  }

  // ============================================================
  // ASSET OPERATIONS
  // ============================================================

  getStorageLocation(sizeInBytes: number): StorageLocation {
    // Everything goes to "memory" location
    return 'indexeddb'; // Use this to maintain compatibility
  }

  async saveAsset(asset: StoredAsset): Promise<AssetStorageInfo> {
    this.ensureReady();

    const info: AssetStorageInfo = {
      id: asset.id,
      projectId: asset.projectId,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      location: 'indexeddb',
      uploadedAt: new Date().toISOString(),
      thumbnail: '', // No thumbnail in memory storage
    };

    // Store the blob
    this.assets.set(asset.id, asset.blob);

    // Store metadata
    this.assetMetadata.set(asset.id, info);

    return info;
  }

  async loadAsset(assetId: string): Promise<Blob | null> {
    this.ensureReady();
    return this.assets.get(assetId) || null;
  }

  async loadAssetInfo(assetId: string): Promise<AssetStorageInfo | null> {
    this.ensureReady();
    return this.assetMetadata.get(assetId) || null;
  }

  async listAssets(projectId: string): Promise<AssetStorageInfo[]> {
    this.ensureReady();
    const assets: AssetStorageInfo[] = [];

    for (const [assetId, info] of this.assetMetadata.entries()) {
      if (info.projectId === projectId) {
        assets.push(info);
      }
    }

    return assets;
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.ensureReady();
    this.assets.delete(assetId);
    this.assetMetadata.delete(assetId);
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    this.ensureReady();

    const assetsToDelete: string[] = [];
    for (const [assetId, info] of this.assetMetadata.entries()) {
      if (info.projectId === projectId) {
        assetsToDelete.push(assetId);
      }
    }

    for (const assetId of assetsToDelete) {
      this.assets.delete(assetId);
      this.assetMetadata.delete(assetId);
    }
  }

  async getAssetDataURL(assetId: string): Promise<string | null> {
    this.ensureReady();

    const blob = this.assets.get(assetId);
    if (!blob) return null;

    // Convert blob to data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  async getAssetObjectURL(assetId: string): Promise<string | null> {
    this.ensureReady();

    const blob = this.assets.get(assetId);
    if (!blob) return null;

    // Create object URL (caller must revoke it when done)
    return URL.createObjectURL(blob);
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

    let totalSize = 0;
    for (const info of this.assetMetadata.values()) {
      totalSize += info.size;
    }

    return {
      totalProjects: this.projects.size,
      totalAssets: this.assetMetadata.size,
      indexedDBSize: totalSize,
      filesystemSize: 0,
      cacheSize: 0,
    };
  }

  async cleanupOrphanedAssets(): Promise<number> {
    this.ensureReady();

    const validProjectIds = new Set(this.projects.keys());
    const assetsToDelete: string[] = [];

    for (const [assetId, info] of this.assetMetadata.entries()) {
      if (!validProjectIds.has(info.projectId)) {
        assetsToDelete.push(assetId);
      }
    }

    for (const assetId of assetsToDelete) {
      this.assets.delete(assetId);
      this.assetMetadata.delete(assetId);
    }

    return assetsToDelete.length;
  }

  async clearCache(): Promise<void> {
    // No cache to clear in memory storage
  }

  async compact(): Promise<void> {
    // No compaction needed for in-memory storage
  }

  // ============================================================
  // HISTORY & DRAFTS
  // ============================================================

  async saveHistory(projectId: string, history: any): Promise<void> {
    this.ensureReady();
    this.history.set(projectId, history);
  }

  async loadHistory(projectId: string): Promise<any | null> {
    this.ensureReady();
    return this.history.get(projectId) || null;
  }

  async saveDraft(projectId: string, draft: any): Promise<void> {
    this.ensureReady();

    const drafts = this.drafts.get(projectId) || [];
    drafts.push({
      ...draft,
      timestamp: new Date().toISOString(),
    });
    this.drafts.set(projectId, drafts);
  }

  async loadDrafts(projectId: string): Promise<any[]> {
    this.ensureReady();
    return this.drafts.get(projectId) || [];
  }

  async deleteDraft(draftId: string): Promise<void> {
    this.ensureReady();
    // In memory storage, drafts are stored per project, not by draft ID
    // This is a simplified implementation
    for (const [projectId, drafts] of this.drafts.entries()) {
      const filtered = drafts.filter((d: any) => d.id !== draftId);
      if (filtered.length !== drafts.length) {
        this.drafts.set(projectId, filtered);
        return;
      }
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private ensureReady(): void {
    if (!this.initialized) {
      throw new StorageError(
        'Storage not initialized',
        'NOT_INITIALIZED'
      );
    }
  }
}

// ============================================================================
// Singleton Instance (for API server)
// ============================================================================

let memoryStorageInstance: MemoryStorageAdapter | null = null;

export function getMemoryStorage(config?: StorageAdapterConfig): MemoryStorageAdapter {
  if (!memoryStorageInstance) {
    memoryStorageInstance = new MemoryStorageAdapter(config);
  }
  return memoryStorageInstance;
}

export function resetMemoryStorage(): void {
  memoryStorageInstance = null;
}
