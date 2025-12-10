/**
 * Storage Types - TypeScript interfaces for persistence layer
 *
 * Defines all data structures used in IndexedDB storage including
 * projects, assets, command history, and auto-save drafts.
 */

import type { Beat, BeatConfig, Story } from '@asaps/core';

// ============================================================================
// Global Settings Types (per-project)
// ============================================================================

/**
 * Complete project settings including visual, audio, and presentation options.
 * Persisted with each project for project-specific customization.
 */
export interface GlobalSettings {
  project: {
    width: number;              // Project width in pixels
    height: number;             // Project height in pixels
    aspectRatio: string;        // Aspect ratio (e.g., "4:3", "16:9")
    scalingMode: 'none' | 'fit' | 'fill' | 'stretch';  // How to scale content
  };
  colors: {
    pcolor: string;         // Player text color
    palpha: number;         // Player text alpha
    nonpcolor: string;      // Non-player text color
    nonpalpha: number;      // Non-player text alpha
    bgColor: string;        // Background color
    textBoxBg: string;      // Text box background
    textBoxBorder: string;  // Text box border
  };
  fonts: {
    titleFont: string;
    textFont: string;
    btnFont: string;
    fontSize: {
      title: number;
      text: number;
      button: number;
    };
  };
  textbox: {
    radius: number;         // Corner radius
    padding: number;        // Internal padding
    borderWidth: number;    // Border width
    opacity: number;        // Background opacity
    position: 'bottom' | 'top' | 'center';
    boxVisibility: 'all' | 'hideText' | 'hideAll';  // Box visibility mode for editor
  };
  textEffects: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number; // Characters per second
    fadeInDuration: number;   // Milliseconds
  };
  hotspots: {
    visible: boolean;
    labels: boolean;
    highlightColor: string;
  };
  sound: {
    backgroundMusic: string;    // Background music file
    backgroundVolume: number;   // Volume 0-100
    mute: boolean;             // Global mute
  };
  copyright: {
    notice: string;            // Copyright notice text
    year: string;              // Copyright year
    owner: string;             // Copyright owner
  };
  debug: {
    firstbeat: string;
    showvals: boolean;
  };
}

// ============================================================================
// Project Types
// ============================================================================

/**
 * Represents a complete ASAPS project stored in IndexedDB
 */
export interface Project {
  /** Unique project identifier (UUID) */
  id: string;

  /** User-provided project name */
  name: string;

  /** Optional project description */
  description?: string;

  /** The story data including beats and connections */
  story: Story;

  /** Visual editor settings (basic - for backward compatibility) */
  settings: ProjectSettings;

  /** Full global settings (optional, added in v1.1.0) */
  globalSettings?: GlobalSettings;

  /** Asset references used in this project */
  assetIds: string[];

  /** Metadata */
  createdAt: Date;
  modifiedAt: Date;
  version: string; // Schema version for migrations
}

/**
 * Visual editor and project settings
 */
export interface ProjectSettings {
  /** Stage dimensions */
  width: number;
  height: number;

  /** Default fonts */
  fonts: string[];

  /** Theme/styling settings */
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
  };

  /** Editor preferences */
  editor?: {
    gridSnap?: boolean;
    gridSize?: number;
    showGrid?: boolean;
  };
}

// ============================================================================
// Asset Types
// ============================================================================

/**
 * Asset types supported by the system
 */
export type AssetType = 'image' | 'audio' | 'video' | 'font' | 'other';

/**
 * Asset stored in IndexedDB with blob data
 */
export interface StoredAsset {
  /** Unique asset identifier (UUID) */
  id: string;

  /** Project this asset belongs to */
  projectId: string;

  /** Asset type category */
  type: AssetType;

  /** Original filename */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Binary data stored as blob */
  blob: Blob;

  /** Metadata */
  uploadedAt: Date;
  lastUsedAt?: Date;

  /** Optional thumbnail for images/videos */
  thumbnail?: string; // Base64 data URL

  /** Custom metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// Command Pattern Types (for Undo/Redo)
// ============================================================================

/**
 * Base interface for all undoable commands
 */
export interface Command {
  /** Unique command identifier */
  id: string;

  /** Command type for deserialization */
  type: string;

  /** Timestamp when command was executed */
  timestamp: Date;

  /** Execute the command (do) */
  execute(): void;

  /** Reverse the command (undo) */
  undo(): void;

  /** Re-execute after undo (redo) */
  redo(): void;

  /** Serialize command data for storage */
  toJSON(): SerializedCommand;
}

/**
 * Serialized command data for storage
 */
export interface SerializedCommand {
  id: string;
  type: string;
  timestamp: Date;
  data: any; // Command-specific data
}

/**
 * Command history for a project
 */
export interface CommandHistory {
  /** Project this history belongs to */
  projectId: string;

  /** Executed commands (up to 50) */
  commands: SerializedCommand[];

  /** Current position in history */
  currentIndex: number;

  /** Last updated timestamp */
  lastUpdated: Date;
}

// ============================================================================
// Auto-Save Types
// ============================================================================

/**
 * Auto-save draft snapshot
 */
export interface AutoSaveDraft {
  /** Draft identifier: `${projectId}_${timestamp}` */
  id: string;

  /** Project this draft belongs to */
  projectId: string;

  /** Snapshot of project state */
  projectSnapshot: Partial<Project>;

  /** When this draft was created */
  createdAt: Date;

  /** Whether this is a manual or auto save */
  isManual: boolean;
}

// ============================================================================
// Storage Options
// ============================================================================

/**
 * Options for initializing storage
 */
export interface StorageOptions {
  /** Database name */
  dbName?: string;

  /** Database version */
  dbVersion?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of a storage operation
 */
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

// ============================================================================
// Project Queries
// ============================================================================

/**
 * Query options for listing projects
 */
export interface ProjectQuery {
  /** Sort by field */
  sortBy?: 'name' | 'modified' | 'created';

  /** Sort direction */
  sortDirection?: 'asc' | 'desc';

  /** Limit results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Search by name */
  nameFilter?: string;
}

/**
 * Asset query options
 */
export interface AssetQuery {
  /** Filter by project */
  projectId?: string;

  /** Filter by type */
  type?: AssetType;

  /** Limit results */
  limit?: number;
}

// ============================================================================
// Export/Import Types
// ============================================================================

/**
 * Export format for project data
 */
export interface ProjectExport {
  /** Project metadata and story data */
  project: Project;

  /** Assets as base64-encoded data URLs */
  assets: {
    id: string;
    filename: string;
    mimeType: string;
    dataUrl: string; // base64 data URL
  }[];

  /** Export metadata */
  exportedAt: Date;
  exportVersion: string;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Overwrite if project already exists */
  overwrite?: boolean;

  /** Merge with existing project */
  merge?: boolean;

  /** Skip asset import */
  skipAssets?: boolean;
}
