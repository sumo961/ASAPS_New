/**
 * Asset Storage Adapter
 *
 * Bridges the UI Asset type and the persistence StoredAsset type.
 * Handles conversion between blob URLs (UI) and blob storage (persistence).
 */

import type { Asset } from '../components/assets/AssetManager';
import type { StoredAsset, AssetType } from './types';

// ============================================================================
// Type Conversion
// ============================================================================

/**
 * Map UI asset types to storage asset types
 */
function mapAssetType(uiType: Asset['type']): AssetType {
  const mapping: Record<Asset['type'], AssetType> = {
    image: 'image',
    audio: 'audio',
    video: 'video',
    font: 'font',
  };
  return mapping[uiType] || 'other';
}

/**
 * Map storage asset types back to UI types
 */
function mapStorageType(storageType: AssetType): Asset['type'] {
  // UI doesn't have 'other', default to 'image'
  if (storageType === 'other') {
    return 'image';
  }

  const mapping: Partial<Record<AssetType, Asset['type']>> = {
    image: 'image',
    audio: 'audio',
    video: 'video',
    font: 'font',
  };
  return mapping[storageType] || 'image';
}

// ============================================================================
// Asset Conversion Functions
// ============================================================================

/**
 * Convert UI Asset to StoredAsset for persistence
 *
 * @param asset - UI asset with blob URL
 * @param projectId - Current project ID
 * @param blob - Blob data (extracted from File or fetched from URL)
 * @returns StoredAsset ready for IndexedDB
 */
export async function assetToStored(
  asset: Asset,
  projectId: string,
  blob: Blob
): Promise<StoredAsset> {
  // Extract filename from asset name or generate one
  const extension = getExtensionFromMimeType(blob.type) || getExtensionFromName(asset.name);
  const filename = asset.name.includes('.') ? asset.name : `${asset.name}.${extension}`;

  const storedAsset: StoredAsset = {
    id: asset.id,
    projectId,
    type: mapAssetType(asset.type),
    filename,
    mimeType: blob.type || getMimeTypeFromName(asset.name),
    size: blob.size,
    blob,
    uploadedAt: asset.uploadedAt,
    lastUsedAt: new Date(),
    metadata: {
      ...asset.metadata,
      subType: asset.subType,
      dimensions: asset.dimensions,
      duration: asset.duration,
      // Phase 3.3 — persist asset variants under metadata so the
      // round-trip through StoredAsset preserves them. storedToAsset
      // lifts them back to the top-level Asset.variants the UI uses.
      ...(asset.variants ? { variants: asset.variants } : {}),
    },
  };

  // Generate thumbnail for images
  if (asset.type === 'image' && asset.dimensions) {
    try {
      const thumbnail = await generateThumbnail(blob, 200, 200);
      storedAsset.thumbnail = thumbnail;
    } catch (error) {
      console.warn('[AssetStorageAdapter] Failed to generate thumbnail:', error);
    }
  }

  return storedAsset;
}

/**
 * Convert StoredAsset to UI Asset
 * Creates a blob URL from stored blob data
 *
 * @param storedAsset - Stored asset from IndexedDB
 * @returns UI asset with blob URL
 */
export function storedToAsset(storedAsset: StoredAsset): Asset {
  // Create blob URL for UI usage
  const url = URL.createObjectURL(storedAsset.blob);

  const asset: Asset = {
    id: storedAsset.id,
    name: storedAsset.filename,
    type: mapStorageType(storedAsset.type),
    subType: storedAsset.metadata?.subType,
    url,
    // Don't include File object - it's not stored
    size: storedAsset.size,
    dimensions: storedAsset.metadata?.dimensions,
    duration: storedAsset.metadata?.duration,
    metadata: storedAsset.metadata,
    uploadedAt: storedAsset.uploadedAt,
    // Phase 3.3 — lift variants from the nested metadata bag back to
    // the top-level Asset.variants the AssetManager UI reads and writes.
    // Defensive: only when the array is non-empty so an authored-but-
    // emptied list serializes as absent.
    ...(Array.isArray((storedAsset.metadata as any)?.variants) &&
    (storedAsset.metadata as any).variants.length > 0
      ? { variants: (storedAsset.metadata as any).variants }
      : {}),
  };

  return asset;
}

/**
 * Extract Blob from UI Asset
 * Handles both File objects and blob URLs
 *
 * @param asset - UI asset
 * @returns Blob data
 */
export async function extractBlobFromAsset(asset: Asset): Promise<Blob> {
  // If we have a File object, use it directly
  if (asset.file) {
    return asset.file;
  }

  // Otherwise, fetch from blob URL
  try {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    return await response.blob();
  } catch (error) {
    console.error('[AssetStorageAdapter] Failed to extract blob from asset:', error);
    throw new Error(`Could not extract blob from asset: ${asset.name}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string | null {
  const mapping: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'font/ttf': 'ttf',
    'font/otf': 'otf',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
  };
  return mapping[mimeType] || null;
}

/**
 * Get file extension from filename
 */
function getExtensionFromName(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'dat';
}

/**
 * Guess MIME type from filename
 */
function getMimeTypeFromName(filename: string): string {
  const ext = getExtensionFromName(filename).toLowerCase();

  const mapping: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    // Fonts
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };

  return mapping[ext] || 'application/octet-stream';
}

/**
 * Generate a thumbnail from an image blob
 *
 * @param blob - Image blob
 * @param maxWidth - Maximum thumbnail width
 * @param maxHeight - Maximum thumbnail height
 * @returns Base64 data URL of thumbnail
 */
async function generateThumbnail(
  blob: Blob,
  maxWidth: number,
  maxHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        // Calculate scaled dimensions
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        // Create canvas and draw scaled image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        // Cleanup
        URL.revokeObjectURL(url);

        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail generation'));
    };

    img.src = url;
  });
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Convert multiple UI assets to StoredAssets
 */
export async function assetsToStored(
  assets: Asset[],
  projectId: string
): Promise<StoredAsset[]> {
  const promises = assets.map(async (asset) => {
    const blob = await extractBlobFromAsset(asset);
    return assetToStored(asset, projectId, blob);
  });

  return Promise.all(promises);
}

/**
 * Convert multiple StoredAssets to UI assets
 */
export function storedToAssets(storedAssets: StoredAsset[]): Asset[] {
  return storedAssets.map(storedToAsset);
}

// ============================================================================
// Blob URL Management
// ============================================================================

/**
 * Revoke blob URLs to free memory
 */
export function revokeBlobUrls(assets: Asset[]): void {
  assets.forEach(asset => {
    try {
      if (asset.url.startsWith('blob:')) {
        URL.revokeObjectURL(asset.url);
      }
    } catch (error) {
      console.warn('[AssetStorageAdapter] Failed to revoke blob URL:', error);
    }
  });
}

/**
 * Revoke a single blob URL
 */
export function revokeBlobUrl(url: string): void {
  try {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.warn('[AssetStorageAdapter] Failed to revoke blob URL:', error);
  }
}
