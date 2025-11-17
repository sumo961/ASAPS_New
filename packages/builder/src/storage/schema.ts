/**
 * IndexedDB Schema Definition
 *
 * Defines the database schema for ASAPS persistence using the idb library.
 * Includes object stores for projects, assets, command history, and auto-save drafts.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project,
  StoredAsset,
  CommandHistory,
  AutoSaveDraft,
  AssetType,
} from './types';

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
   * Assets object store
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
}

// ============================================================================
// Database Constants
// ============================================================================

export const DB_NAME = 'asaps-storage';
export const DB_VERSION = 1;

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the IndexedDB database with all object stores and indexes
 */
export async function initDatabase(): Promise<IDBPDatabase<AsapsDBSchema>> {
  const db = await openDB<AsapsDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[Storage] Upgrading database from v${oldVersion} to v${newVersion}`);

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
    },

    blocked() {
      console.warn('[Storage] Database upgrade blocked - another tab may have an older version open');
    },

    blocking() {
      console.warn('[Storage] This tab is blocking a database upgrade in another tab');
    },

    terminated() {
      console.error('[Storage] Database connection was unexpectedly terminated');
    },
  });

  console.log('[Storage] Database initialized successfully');
  return db;
}

/**
 * Get a database connection (creates if not exists)
 */
export async function getDatabase(): Promise<IDBPDatabase<AsapsDBSchema>> {
  return await openDB<AsapsDBSchema>(DB_NAME, DB_VERSION);
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
