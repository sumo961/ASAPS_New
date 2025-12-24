/**
 * IndexedDB Schema Definition
 *
 * Defines the database schema for ASAPS persistence using the idb library.
 * Includes object stores for projects, assets, command history, auto-save drafts, and themes.
 *
 * Version History:
 * - v1: Initial schema with projects, assets, history, drafts
 * - v2: Added asset-metadata store for hybrid storage support
 * - v3: Added themes, theme-assets, theme-asset-metadata stores for theme system
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project,
  StoredAsset,
  CommandHistory,
  AutoSaveDraft,
  AssetType,
} from './types';
import type { AssetStorageInfo, StorageLocation } from './IStorageAdapter';
import type { StoredTheme, StoredThemeAsset, ThemeAssetRole } from '@asaps/core';

// ============================================================================
// Database Schema Interface
// ============================================================================

/**
 * IndexedDB schema interface for type-safe database operations
 */
export interface AsapsDBSchema extends DBSchema {
  /**
   * Projects object store
   * Key: projectId (string UUID)
   */
  projects: {
    key: string;
    value: Project;
    indexes: {
      'by-modified': Date;
      'by-created': Date;
      'by-name': string;
    };
  };

  /**
   * Assets object store (stores blobs for small assets)
   * Key: assetId (string UUID)
   */
  assets: {
    key: string;
    value: StoredAsset;
    indexes: {
      'by-project': string;
      'by-type': AssetType;
      'by-project-type': [string, AssetType]; // Compound index
    };
  };

  /**
   * Asset metadata store (for hybrid storage tracking)
   * Key: assetId (string UUID)
   * Added in v2
   */
  'asset-metadata': {
    key: string;
    value: AssetStorageInfo;
    indexes: {
      'by-project': string;
      'by-location': StorageLocation;
    };
  };

  /**
   * Command history object store
   * Key: projectId (string UUID)
   * Only one history record per project
   */
  history: {
    key: string;
    value: CommandHistory;
  };

  /**
   * Auto-save drafts object store
   * Key: draftId (`${projectId}_${timestamp}`)
   */
  drafts: {
    key: string;
    value: AutoSaveDraft;
    indexes: {
      'by-project': string;
      'by-timestamp': Date;
    };
  };

  /**
   * Themes object store
   * Key: themeId (string UUID)
   * Added in v3
   */
  themes: {
    key: string;
    value: StoredTheme & { id: string };
    indexes: {
      'by-name': string;
      'by-source': 'built-in' | 'imported' | 'custom';
      'by-lastUsed': string;
    };
  };

  /**
   * Theme assets object store (stores blobs for small theme assets)
   * Key: assetId (string UUID)
   * Added in v3
   */
  'theme-assets': {
    key: string;
    value: StoredThemeAsset;
    indexes: {
      'by-theme': string;
      'by-role': ThemeAssetRole;
    };
  };

  /**
   * Theme asset metadata store (for hybrid storage tracking)
   * Key: assetId (string UUID)
   * Added in v3
   */
  'theme-asset-metadata': {
    key: string;
    value: ThemeAssetStorageInfo;
    indexes: {
      'by-theme': string;
      'by-location': StorageLocation;
    };
  };
}

/**
 * Theme asset storage info (parallel to AssetStorageInfo for project assets)
 */
export interface ThemeAssetStorageInfo {
  id: string;
  themeId: string;
  location: StorageLocation;
  size: number;
  path?: string;
  mimeType: string;
  filename: string;
  role: ThemeAssetRole;
  uploadedAt: string;
}

// ============================================================================
// Database Constants
// ============================================================================

export const DB_NAME = 'asaps-storage';
export const DB_VERSION = 3;

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the IndexedDB database with all object stores and indexes
 * Handles migration from v1 to v2
 */
export async function initDatabase(): Promise<IDBPDatabase<AsapsDBSchema>> {
  const db = await openDB<AsapsDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[Storage] Upgrading database from v${oldVersion} to v${newVersion}`);

      // ============================================
      // V1 -> V2 MIGRATION: Create new stores first
      // ============================================

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('by-modified', 'modifiedAt');
        projectStore.createIndex('by-created', 'createdAt');
        projectStore.createIndex('by-name', 'name');
        console.log('[Storage] Created projects object store');
      }

      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-project', 'projectId');
        assetStore.createIndex('by-type', 'type');
        assetStore.createIndex('by-project-type', ['projectId', 'type']);
        console.log('[Storage] Created assets object store');
      }

      // V2: Add asset-metadata store for hybrid storage
      if (!db.objectStoreNames.contains('asset-metadata')) {
        const metadataStore = db.createObjectStore('asset-metadata', { keyPath: 'id' });
        metadataStore.createIndex('by-project', 'projectId');
        metadataStore.createIndex('by-location', 'location');
        console.log('[Storage] Created asset-metadata object store (v2)');
      }

      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'projectId' });
        console.log('[Storage] Created history object store');
      }

      if (!db.objectStoreNames.contains('drafts')) {
        const draftStore = db.createObjectStore('drafts', { keyPath: 'id' });
        draftStore.createIndex('by-project', 'projectId');
        draftStore.createIndex('by-timestamp', 'createdAt');
        console.log('[Storage] Created drafts object store');
      }

      // ============================================
      // V3: Theme system stores
      // ============================================
      if (!db.objectStoreNames.contains('themes')) {
        const themeStore = db.createObjectStore('themes', { keyPath: 'id' });
        themeStore.createIndex('by-name', 'definition.meta.name');
        themeStore.createIndex('by-source', 'source');
        themeStore.createIndex('by-lastUsed', 'lastUsedAt');
        console.log('[Storage] Created themes object store (v3)');
      }

      if (!db.objectStoreNames.contains('theme-assets')) {
        const themeAssetStore = db.createObjectStore('theme-assets', { keyPath: 'id' });
        themeAssetStore.createIndex('by-theme', 'themeId');
        themeAssetStore.createIndex('by-role', 'role');
        console.log('[Storage] Created theme-assets object store (v3)');
      }

      if (!db.objectStoreNames.contains('theme-asset-metadata')) {
        const themeAssetMetaStore = db.createObjectStore('theme-asset-metadata', { keyPath: 'id' });
        themeAssetMetaStore.createIndex('by-theme', 'themeId');
        themeAssetMetaStore.createIndex('by-location', 'location');
        console.log('[Storage] Created theme-asset-metadata object store (v3)');
      }

      // ============================================
      // V1 -> V2 MIGRATION: Migrate existing assets
      // ============================================
      if (oldVersion === 1 && newVersion !== null && newVersion >= 2) {
        console.log('[Storage] Migrating v1 assets to v2 format...');

        // We need to migrate existing assets to have metadata entries
        // This happens asynchronously after the upgrade transaction
        // We'll handle it in migrateV1AssetsToV2 called after db is ready
      }
    },

    blocked() {
      console.warn('[Storage] Database upgrade blocked - another tab may have an older version open');
      // Optionally reload or notify user
    },

    blocking() {
      console.warn('[Storage] This tab is blocking a database upgrade in another tab');
      // Close connection to allow upgrade in other tab
    },

    terminated() {
      console.error('[Storage] Database connection was unexpectedly terminated');
    },
  });

  console.log('[Storage] Database initialized successfully at version', DB_VERSION);

  // Run post-upgrade migration if needed
  await migrateV1AssetsToV2(db);

  return db;
}

/**
 * Migrate v1 assets to v2 format by creating metadata entries
 * This runs after the database upgrade is complete
 */
async function migrateV1AssetsToV2(db: IDBPDatabase<AsapsDBSchema>): Promise<void> {
  try {
    // Check if there are assets without metadata entries
    const assets = await db.getAll('assets');
    const existingMetadata = await db.getAll('asset-metadata');
    const existingMetadataIds = new Set(existingMetadata.map(m => m.id));

    const assetsNeedingMigration = assets.filter(a => !existingMetadataIds.has(a.id));

    if (assetsNeedingMigration.length === 0) {
      return; // Nothing to migrate
    }

    console.log(`[Storage] Migrating ${assetsNeedingMigration.length} assets to v2 format...`);

    const tx = db.transaction('asset-metadata', 'readwrite');

    for (const asset of assetsNeedingMigration) {
      const metadata: AssetStorageInfo = {
        id: asset.id,
        projectId: asset.projectId,
        location: 'indexeddb', // All v1 assets are in IndexedDB
        size: asset.size,
        mimeType: asset.mimeType,
        filename: asset.filename,
        uploadedAt: asset.uploadedAt instanceof Date
          ? asset.uploadedAt.toISOString()
          : new Date().toISOString(),
        thumbnail: asset.thumbnail,
      };

      await tx.store.put(metadata);
    }

    await tx.done;
    console.log(`[Storage] Successfully migrated ${assetsNeedingMigration.length} assets to v2 format`);
  } catch (err) {
    console.error('[Storage] Error migrating v1 assets:', err);
    // Don't throw - migration is best-effort
  }
}

/**
 * Get a database connection (creates if not exists)
 */
export async function getDatabase(): Promise<IDBPDatabase<AsapsDBSchema>> {
  return await initDatabase();
}

/**
 * Close the database connection
 */
export async function closeDatabase(db: IDBPDatabase<AsapsDBSchema>): Promise<void> {
  db.close();
  console.log('[Storage] Database connection closed');
}

/**
 * Delete the entire database (for testing or reset)
 */
export async function deleteDatabase(): Promise<void> {
  const { deleteDB } = await import('idb');
  await deleteDB(DB_NAME);
  console.log('[Storage] Database deleted');
}

/**
 * Check if database exists
 */
export async function databaseExists(): Promise<boolean> {
  if (!('indexedDB' in window)) {
    return false;
  }

  try {
    const databases = await window.indexedDB.databases();
    return databases.some((db) => db.name === DB_NAME);
  } catch (error) {
    console.error('[Storage] Error checking database existence:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  projectCount: number;
  assetCount: number;
  totalSize: number;
}> {
  const db = await getDatabase();

  try {
    const projectCount = await db.count('projects');
    const assetCount = await db.count('assets');

    // Calculate approximate total size from assets
    let totalSize = 0;
    const assets = await db.getAll('assets');
    for (const asset of assets) {
      totalSize += asset.size;
    }

    return {
      projectCount,
      assetCount,
      totalSize,
    };
  } finally {
    db.close();
  }
}
