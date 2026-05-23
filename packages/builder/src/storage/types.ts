/**
 * Storage Types - TypeScript interfaces for persistence layer
 *
 * Defines all data structures used in IndexedDB storage including
 * projects, assets, command history, and auto-save drafts.
 */

import type { Beat, BeatConfig, Story, ThemeDefinition, TranslationResource, TranslationManifest } from '@asaps/core';

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
    mobileScalingMode?: 'auto' | 'fit' | 'cover' | 'native';  // Mobile display mode
    mobileFontScale?: number;   // Font scale multiplier for mobile (1.0-2.0, default 1.0)
    showMobileSafeZone?: boolean;  // Show mobile crop safe zone overlay in editor
    // P2.5 — device orientation policy. Width-responsiveness is ALWAYS on;
    // this only locks the ORIENTATION axis. 'flexible' (default) = adapt to
    // whichever way the device is held. 'portrait'/'landscape' = locked: the
    // player shows a "rotate your device" overlay when held the other way so
    // the layout is never rendered in the unsupported orientation.
    orientation?: 'flexible' | 'portrait' | 'landscape';
    /**
     * Phase 1 — project-level layout mode. Authors pick ONE mode per
     * project; the editor and the runtime adapt accordingly.
     *
     *  'fixed'      = legacy absolute-positioned layout. Authors place
     *                 elements pixel-precise on a fixed design canvas
     *                 (`width` × `height`). Slot/spatial paths are
     *                 disabled. The Visual Editor exposes x/y handles,
     *                 the AnimationPath system, and all legacy controls.
     *
     *  'responsive' = slot + spatial layout. The engine resolves
     *                 positions from anchors / slot specs at runtime,
     *                 reflowing on any viewport. No pixel positions are
     *                 authored or persisted. SlotFlowView /
     *                 SpatialFlowView own the visual contract.
     *
     * Existing projects load as 'fixed' (zero regression). New projects
     * default to 'responsive'. Switching is a one-shot migration with
     * preview; mixed-mode projects are NOT supported (deliberate — the
     * previous per-beat auto-detection produced UX nobody could reason
     * about). Inverse migration (responsive → fixed) bakes
     * schema-resolved positions at the project's design width.
     */
    layoutMode?: 'fixed' | 'responsive';
  };
  colors: {
    pcolor: string;         // Button/choice background color (player actions)
    palpha: number;         // Button/choice opacity (0-100)
    ptextcolor: string;     // Button/choice text color
    nonpcolor: string;      // NPC/narrator text box background color
    nonpalpha: number;      // NPC/narrator text box opacity (0-100)
    nonptextcolor: string;  // NPC/narrator text color
    bgColor: string;        // Stage background color
    textBoxBorder: string;  // Text box/button border color
    buttonBg?: string;      // Optional explicit button background color
    buttonBgColor?: string; // Alternative button background color field
    useThemeButtonGraphics?: boolean; // Whether to use button graphics from theme (default: true)
  };
  fonts: {
    titleFont: string;
    textFont: string;
    btnFont: string;
    buttonFont?: string;    // Alternative button font field (may override btnFont)
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
    hideTitleTextBox?: boolean;  // Hide text box background for title/author elements (VN style)
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
    opacity: number;  // 0-100 percentage
    showInPreview: 'visible' | 'onHover' | 'invisible';  // Hotspot area visibility in preview
    labelDisplay: 'none' | 'hover' | 'always';  // Label/description display mode in preview
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
  ai?: {
    provider?: 'claude' | 'openai';
    providerType?: 'claude' | 'openai' | 'local';
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  };
  tts?: {
    provider?: 'web-speech' | 'openai' | 'elevenlabs' | 'custom';
    providerType?: 'web-speech' | 'openai' | 'elevenlabs' | 'custom';
    model?: string;
    baseUrl?: string;
    defaultVoiceId?: string;
    readPrompts?: boolean;
    speakerVoices?: Record<string, Record<string, string>>;  // providerKey → { speaker → voiceId }
  };
  speakerDisplay?: {
    showNames?: boolean;                       // Master toggle: show speaker names globally (default derived from nameStyle)
    showGraphics?: boolean;                    // Master toggle: show speaker portraits globally (default derived from graphicPosition)
    nameStyle: 'off' | 'label' | 'inline';   // Off / label above text box / bold first line inside text box
    namePosition: 'left' | 'right';           // Which side the name appears on
    nameColor?: string;                       // Custom color for inline name (default: inherit)
    graphicPosition: 'off' | 'inside-left' | 'inside-right' | 'above-left' | 'above-right';  // Portrait placement
    graphicSize?: number;                     // Portrait size in px (default 48 inside, 80 above)
  };
  translation?: {
    sourceLanguage: string;  // BCP 47 code, default 'en'
  };
  hudOverlays?: {
    timerHud?: {
      enabled: boolean;
      mode?: 'timer' | 'static'; // Deprecated: HUD auto-detects
      timerName: string;
      staticText: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
      style: 'digital' | 'minimal';
      fontSize: number;
      textColor: string;
      backgroundColor: string;
      backgroundOpacity: number;
      borderRadius: number;
      padding: number;
      showLabel: boolean;
      label: string;
      showWhenInactive: boolean;
    };
    fictionalTime?: {
      enabled: boolean;
      initialTime: { year: number; month: number; day: number; hour: number; minute: number };
      displayFormat: 'time-12h' | 'time-24h' | 'date' | 'datetime-12h' | 'datetime-24h' | 'day-number' | 'year';
      showInTimerHud: boolean; // Whether the Timer HUD displays fictional time
    };
    countdownMeter?: {
      enabled: boolean;
      counterName: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
      label: string;
      showLabel: boolean;
      showNumericValue: boolean;
      numericFormat: 'value' | 'fraction' | 'percentage';
      meterColor: string;
      meterBackgroundColor: string;
      meterHeight: number;
      meterWidth: number; // Percentage of stage width (10-90)
      backgroundColor: string;
      backgroundOpacity: number;
      borderRadius: number;
      warningThreshold: number;
      warningColor: string;
      criticalThreshold: number;
      criticalColor: string;
      showByDefault?: boolean; // When true (default), meter shows on all beats unless overridden per-beat
      counterMin?: number; // Counter minimum value (default 0)
      counterMax?: number; // Counter maximum value (default 100)
    };
  };
  /**
   * XR / location settings (v0.9.48+). Optional — projects without any
   * XR beats leave this undefined and pay no runtime cost. When XR beats
   * are present, they read origin / venue / mockLocation off this block.
   *
   * The story origin is a single GPS anchor used by:
   *   - GpsLocationBeat (default centre when no targetLat/targetLng given)
   *   - ARDisplayBeat (yaw=0 reference for 'origin-relative' anchorMode)
   *   - DirectionalSound (bearing reference for spatialPosition)
   *   - All proximity radii (haversine-from-origin shortcuts)
   *
   * See docs/XR-Roadmap.md for the broader design context.
   */
  location?: {
    /** Story origin / anchor — single GPS point. */
    originLat?: number;
    originLng?: number;
    /**
     * Indoor venue — for indoor-positioning beats. Floorplan dimensions
     * are in metres; the floorplan asset is rendered at scale on top of
     * the player's known beacon position.
     */
    venue?: {
      name: string;
      floorPlan?: string;        // assetId of the floorplan image
      floorWidth: number;        // metres
      floorHeight: number;       // metres
      /**
       * Authored beacon definitions (v0.9.49+). Each beacon has a stable
       * UUID that the deployed hardware advertises, an optional display
       * name for the editor, and a position on the floor plan in metres
       * (origin top-left). IndoorLocationBeat references beacons by UUID;
       * the renderer reads x/y from here to place markers on the
       * floor-plan image.
       */
      beacons?: Array<{
        uuid: string;
        displayName?: string;
        x: number;  // metres from floor-plan left
        y: number;  // metres from floor-plan top
      }>;
    };
    /**
     * Default radius (metres) for proximity triggers when an XR beat
     * doesn't specify its own. Typical values: 5m for room-scale,
     * 25m for "you've arrived at the building", 100m for "you're in
     * the right neighbourhood".
     */
    defaultProximityRadiusM?: number;
    /**
     * What the engine does when an XR beat requires a permission the
     * player has denied:
     *   - 'skip'     — fall through to the next beat (silent).
     *   - 'fallback' — redirect to fallbackBeatId (or to next beat if
     *                  fallbackBeatId is unset).
     *
     * This is the global default; individual beats can override.
     */
    onPermissionDenied?: 'skip' | 'fallback';
    fallbackBeatId?: string;
    /**
     * Mock location for desktop authoring / testing. The
     * MockSensorService uses this when no real GPS is available. The
     * PreviewWindow's MockSensorPanel surfaces editable fields seeded
     * from this value. `floor` is optional (1 = ground, 2 = first up,
     * etc.); used by the indoor-position beat's mock path.
     */
    mockLocation?: { lat: number; lng: number; floor?: number };
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

  /** Theme reference (optional, added in v3 for theme system) */
  themeId?: string;

  /** Per-project theme overrides (optional, allows customizing theme values) */
  themeOverrides?: Partial<ThemeDefinition>;

  /** Filesystem path for directory-format projects (Electron only) */
  directoryPath?: string | null;

  /** External assets folder path for large files (Electron only, IndexedDB projects) */
  assetsPath?: string | null;

  /** Storage format: 'directory' for folder-based, 'indexeddb' (default) for browser storage */
  storageFormat?: 'directory' | 'indexeddb';

  /** Origin remote URL, opportunistically detected from Git */
  vcsRemoteUrl?: string | null;

  /** Loaded translation resources (one per target language) */
  translations?: TranslationResource[];

  /** Translation manifest with completeness info */
  translationManifest?: TranslationManifest;

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
