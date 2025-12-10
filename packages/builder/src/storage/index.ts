/**
 * Storage Module Exports
 *
 * Central export point for the ASAPS persistence layer.
 * Provides IndexedDB storage for projects, assets, command history, and auto-save drafts.
 */

// Types
export type {
  Project,
  ProjectSettings,
  GlobalSettings,
  StoredAsset,
  AssetType,
  Command,
  SerializedCommand,
  CommandHistory,
  AutoSaveDraft,
  StorageOptions,
  StorageResult,
  ProjectQuery,
  AssetQuery,
  ProjectExport,
  ImportOptions,
} from './types';

// Schema
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  deleteDatabase,
  databaseExists,
  getDatabaseStats,
  DB_NAME,
  DB_VERSION,
  type AsapsDBSchema,
} from './schema';

// Storage Manager
export {
  StorageManager,
  getStorageManager,
  resetStorageManager,
} from './StorageManager';
