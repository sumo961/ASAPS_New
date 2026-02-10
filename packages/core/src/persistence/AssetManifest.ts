/**
 * AssetManifest - Asset catalog management for directory-based projects
 *
 * Maps human-readable filenames to internal asset UUIDs.
 * Stored as assets/_manifest.json in the project directory.
 */

import { deterministicStringify } from './BeatSerializer';

/**
 * Single entry in the asset manifest
 */
export interface AssetManifestEntry {
  /** Internal asset UUID */
  id: string;
  /** Human-readable filename on disk (e.g., "forest.jpg") */
  filename: string;
  /** Asset type category */
  type: 'image' | 'audio' | 'video' | 'font' | 'other';
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Subfolder within assets/ (e.g., "backgrounds", "characters") */
  folder: string;
  /** Original upload date */
  uploadedAt?: string;
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * The complete asset manifest for directory-based projects.
 * Named DirectoryAssetManifest to avoid conflict with the XML parser's AssetManifest.
 */
export interface DirectoryAssetManifest {
  /** Format version */
  _format: string;
  /** Map of asset ID -> manifest entry */
  assets: Record<string, AssetManifestEntry>;
}

const FORMAT_VERSION = '1.0';

/**
 * Create an empty asset manifest
 */
export function createEmptyManifest(): DirectoryAssetManifest {
  return {
    _format: FORMAT_VERSION,
    assets: {},
  };
}

/**
 * Serialize an asset manifest to deterministic JSON
 */
export function serializeManifest(manifest: DirectoryAssetManifest): string {
  return deterministicStringify(manifest);
}

/**
 * Parse an asset manifest from JSON string
 */
export function parseManifest(json: string): DirectoryAssetManifest {
  const parsed = JSON.parse(json);
  if (!parsed._format || !parsed.assets) {
    throw new Error('Invalid asset manifest: missing _format or assets field');
  }
  return parsed as DirectoryAssetManifest;
}

/**
 * Add or update an entry in the manifest
 */
export function setManifestEntry(manifest: DirectoryAssetManifest, entry: AssetManifestEntry): void {
  manifest.assets[entry.id] = entry;
}

/**
 * Remove an entry from the manifest
 */
export function removeManifestEntry(manifest: DirectoryAssetManifest, assetId: string): boolean {
  if (manifest.assets[assetId]) {
    delete manifest.assets[assetId];
    return true;
  }
  return false;
}

/**
 * Look up an asset by ID
 */
export function getManifestEntry(manifest: DirectoryAssetManifest, assetId: string): AssetManifestEntry | undefined {
  return manifest.assets[assetId];
}

/**
 * Get the relative file path for an asset within the project directory.
 * Returns path like "assets/backgrounds/forest.jpg"
 */
export function getAssetRelativePath(entry: AssetManifestEntry): string {
  return `assets/${entry.folder}/${entry.filename}`;
}

/**
 * Determine the asset subfolder based on type and optional context.
 * Maps asset types to human-readable folder names.
 */
export function getAssetFolder(type: string, context?: string): string {
  switch (type) {
    case 'image':
      // Use context to distinguish between backgrounds, characters, props
      if (context === 'background' || context === 'node') return 'backgrounds';
      if (context === 'character') return 'characters';
      if (context === 'prop') return 'props';
      return 'backgrounds'; // default for images
    case 'audio':
      return 'sounds';
    case 'video':
      return 'videos';
    case 'font':
      return 'fonts';
    default:
      return 'other';
  }
}

/**
 * Generate a unique human-readable filename, avoiding collisions.
 * If "forest.jpg" already exists, produces "forest_2.jpg", etc.
 */
export function generateUniqueFilename(
  desiredName: string,
  existingNames: Set<string>
): string {
  if (!existingNames.has(desiredName)) {
    return desiredName;
  }

  const dotIdx = desiredName.lastIndexOf('.');
  const base = dotIdx > 0 ? desiredName.substring(0, dotIdx) : desiredName;
  const ext = dotIdx > 0 ? desiredName.substring(dotIdx) : '';

  let counter = 2;
  while (existingNames.has(`${base}_${counter}${ext}`)) {
    counter++;
  }
  return `${base}_${counter}${ext}`;
}
