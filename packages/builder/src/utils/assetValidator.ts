/**
 * Asset Validator Utility
 *
 * Validates that all assets listed in the manifest exist on the filesystem.
 * Used with external assets folders and directory-format projects (Electron only).
 */

import type { AssetManifestEntry, DirectoryAssetManifest } from '@asaps/core';
import { parseManifest } from '@asaps/core';

export interface AssetValidationResult {
  valid: AssetManifestEntry[];
  missing: AssetManifestEntry[];
}

/**
 * Validate that all assets in the manifest exist at the given assets path.
 * Requires Electron's fs API to check file existence.
 */
export async function validateProjectAssets(
  assetsPath: string,
): Promise<AssetValidationResult> {
  const api = (window as any).electronAPI;
  if (!api?.fs) {
    throw new Error('Asset validation requires Electron filesystem API');
  }

  const sep = api.path?.sep || '/';
  const manifestPath = [assetsPath, '_manifest.json'].join(sep);

  // Read manifest
  let manifest: DirectoryAssetManifest;
  try {
    const exists = await api.fs.exists(manifestPath);
    if (!exists) {
      return { valid: [], missing: [] };
    }
    const raw = await api.fs.readFile(manifestPath, 'utf-8');
    manifest = parseManifest(raw);
  } catch {
    return { valid: [], missing: [] };
  }

  const valid: AssetManifestEntry[] = [];
  const missing: AssetManifestEntry[] = [];

  for (const entry of Object.values(manifest.assets)) {
    const filePath = [assetsPath, entry.folder, entry.filename].join(sep);
    try {
      const exists = await api.fs.exists(filePath);
      if (exists) {
        valid.push(entry);
      } else {
        missing.push(entry);
      }
    } catch {
      missing.push(entry);
    }
  }

  return { valid, missing };
}
