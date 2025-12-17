/**
 * ASML Asset Importer Utility
 *
 * Handles importing assets from an ASML project:
 * 1. Imports image and audio files from a file map
 * 2. Creates Character objects from ASML character definitions
 * 3. Builds mappings from asset names to asset IDs for linking to beats
 */

import type {
  AssetManifest,
  CharacterReference as AsmlCharacterReference,
  AssetReference
} from '@asaps/core';
import type { Asset } from '../components/assets/AssetManager';
import type { Character, CharacterState } from '../types/character';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

/**
 * Options for importing ASML assets
 */
export interface AsmlAssetImportOptions {
  /** The asset manifest extracted from ASML */
  manifest: AssetManifest;
  /** Function to resolve file path to Blob */
  fileResolver: (fPath: string) => Promise<Blob | null>;
  /** Current project ID */
  projectId: string;
  /** Function to add an asset to storage (receives both Asset metadata and the blob for persistence) */
  addAsset: (asset: Asset, blob: Blob) => Promise<boolean>;
}

/**
 * Result of ASML asset import
 */
export interface AsmlAssetImportResult {
  /** Map of asset name to asset ID (for backgrounds, props, sounds) */
  assetMap: Map<string, string>;
  /** Map of asset name to asset URL (for sounds that need URL for playback) */
  urlMap: Map<string, string>;
  /** Map of character name to Character object */
  characterMap: Map<string, Character>;
  /** Map of fPath to asset ID (for direct file lookups) */
  filePathMap: Map<string, string>;
  /** Map of prop name to natural image dimensions */
  propDimensionsMap: Map<string, { width: number; height: number }>;
  /** Errors encountered during import */
  errors: string[];
  /** Statistics about the import */
  stats: {
    backgroundsImported: number;
    propsImported: number;
    soundsImported: number;
    charactersCreated: number;
    characterImagesImported: number;
    totalFilesImported: number;
    totalFilesMissing: number;
  };
}

// ============================================
// File Resolution
// ============================================

/**
 * Create a file resolver from a folder picker result (Map of filename to File/Blob)
 */
export function createFileResolver(fileMap: Map<string, File>): (fPath: string) => Promise<Blob | null> {
  return async (fPath: string): Promise<Blob | null> => {
    // Try exact match first
    let file = fileMap.get(fPath);
    if (file) return file;

    // Try case-insensitive match
    file = fileMap.get(fPath.toLowerCase());
    if (file) return file;

    // Try just the filename (strip any path prefix)
    const filename = fPath.split('/').pop() || fPath;
    file = fileMap.get(filename);
    if (file) return file;

    file = fileMap.get(filename.toLowerCase());
    if (file) return file;

    // Try with common path variations
    const baseName = filename.replace(/\\/g, '/').split('/').pop() || filename;
    file = fileMap.get(baseName);
    if (file) return file;

    file = fileMap.get(baseName.toLowerCase());
    if (file) return file;

    console.warn(`[AsmlAssetImporter] File not found: ${fPath}`);
    return null;
  };
}

// ============================================
// Asset Type Detection
// ============================================

/**
 * Determine asset type from file extension
 */
function getAssetType(filename: string): Asset['type'] {
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
    return 'audio';
  }
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
    return 'video';
  }
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    return 'font';
  }
  // Default to image for unknown types (Asset type doesn't have 'other')
  return 'image';
}

/**
 * Determine asset subType based on category and file type
 */
function getAssetSubType(
  category: 'background' | 'prop' | 'character' | 'sound',
  filename: string
): Asset['subType'] {
  const type = getAssetType(filename);

  switch (category) {
    case 'background':
      return 'background';
    case 'prop':
      return 'prop';
    case 'character':
      return 'character';
    case 'sound':
      return 'sfx';
    default:
      if (type === 'audio') return 'sfx';
      if (type === 'image') return 'background';
      return 'background';
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';

  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    // Video
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    // Fonts
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'woff': 'font/woff',
    'woff2': 'font/woff2'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

// ============================================
// Asset Import
// ============================================

/**
 * Import a single asset file
 */
async function importAssetFile(
  ref: AssetReference,
  category: 'background' | 'prop' | 'sound',
  options: AsmlAssetImportOptions
): Promise<{ assetId: string | null; url: string | null; error: string | null; width?: number; height?: number }> {
  const { fileResolver, addAsset } = options;

  try {
    const blob = await fileResolver(ref.fPath);
    if (!blob) {
      return { assetId: null, url: null, error: `File not found: ${ref.fPath}` };
    }

    const assetId = uuidv4();
    const filename = ref.fPath.split('/').pop() || ref.fPath;
    const type = getAssetType(filename);
    const subType = getAssetSubType(category, filename);

    // Create blob URL for the asset
    const url = URL.createObjectURL(blob);

    // Get natural dimensions for images
    let width: number | undefined;
    let height: number | undefined;
    if (type === 'image') {
      try {
        const dimensions = await getImageDimensions(url);
        width = dimensions.width;
        height = dimensions.height;
        console.log(`[importAssetFile] Image "${ref.name}" dimensions: ${width}x${height}`);
      } catch (dimErr) {
        console.warn(`[importAssetFile] Could not get dimensions for ${ref.fPath}:`, dimErr);
      }
    }

    const asset: Asset = {
      id: assetId,
      name: ref.name || filename,
      type,
      subType,
      url,
      size: blob.size,
      uploadedAt: new Date()
    };

    const success = await addAsset(asset, blob);
    if (!success) {
      URL.revokeObjectURL(url);
      return { assetId: null, url: null, error: `Failed to store asset: ${ref.fPath}` };
    }

    return { assetId, url, error: null, width, height };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { assetId: null, url: null, error: `Error importing ${ref.fPath}: ${error}` };
  }
}

/**
 * Get natural dimensions of an image from its URL
 */
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

// ============================================
// Character Import
// ============================================

/**
 * Import character graphics and create Character object
 */
async function importCharacter(
  charRef: AsmlCharacterReference,
  options: AsmlAssetImportOptions
): Promise<{
  character: Character | null;
  stateAssetMap: Map<string, string>;
  errors: string[];
}> {
  const { fileResolver, addAsset } = options;
  const errors: string[] = [];
  const stateAssetMap = new Map<string, string>();

  // Import all character state images
  const states: CharacterState[] = [];

  for (const stateRef of charRef.states) {
    let assetId: string | undefined;
    let assetUrl: string | undefined;

    const blob = await fileResolver(stateRef.fPath);
    if (blob) {
      assetId = uuidv4();
      const filename = stateRef.fPath.split('/').pop() || stateRef.fPath;
      const url = URL.createObjectURL(blob);

      const asset: Asset = {
        id: assetId,
        name: `${charRef.name}_${stateRef.kind}`,
        type: 'image',
        subType: 'character',
        url,
        size: blob.size,
        uploadedAt: new Date()
      };

      const success = await addAsset(asset, blob);
      if (!success) {
        URL.revokeObjectURL(url);
        errors.push(`Failed to store character image: ${stateRef.fPath}`);
        assetId = undefined;
      } else {
        stateAssetMap.set(stateRef.fPath, assetId);
        assetUrl = url; // Keep the URL for character visual
      }
    } else {
      errors.push(`Character image not found: ${stateRef.fPath}`);
    }

    // Create state even if image import failed (state can exist without image)
    // Store BOTH asset ID (for persistence) and URL (for immediate display)
    // When project is reloaded, URLs will be reconstructed from asset IDs
    states.push({
      id: stateRef.kind,
      name: stateRef.kind,
      displayName: stateRef.kind.charAt(0).toUpperCase() + stateRef.kind.slice(1),
      visual: assetId ? {
        image: assetUrl, // Temporary blob URL for immediate display
        assetId: assetId // Persistent asset ID for reload
      } : {}
    });
  }

  // Ensure at least one default state exists
  if (states.length === 0) {
    states.push({
      id: 'default',
      name: 'default',
      displayName: 'Default',
      visual: {}
    });
  }

  // Determine role
  const role: 'player' | 'npc' = charRef.role === 'interactor' ? 'player' : 'npc';

  // Get the first state's image info as the default if available
  const firstStateVisual = states[0]?.visual as any;
  const firstStateImageUrl = firstStateVisual?.image;
  const firstStateAssetId = firstStateVisual?.assetId;

  // Create character object
  const character: Character = {
    id: `char_${charRef.id}`,
    name: charRef.name.toLowerCase().replace(/\s+/g, '_'),
    displayName: charRef.name,
    role,
    visual: {
      type: 'static',
      defaultImage: firstStateImageUrl, // Temporary URL for immediate display
      defaultAssetId: firstStateAssetId // Persistent asset ID for reload
    },
    states,
    defaultState: states[0]?.id || 'default',
    counters: (charRef.counters || []).map(c => ({
      name: c.name,
      displayName: c.name,
      value: c.value,
      min: 0,
      max: 100,
      visible: true
    })),
    inventory: (charRef.inventory || []).map(itemName => ({
      id: uuidv4(),
      name: itemName.toLowerCase().replace(/\s+/g, '_'),
      displayName: itemName,
      description: '',
      icon: '',
      quantity: 1,
      stackable: true,
      category: 'misc'
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return { character, stateAssetMap, errors };
}

// ============================================
// Main Import Function
// ============================================

/**
 * Import all assets from an ASML project
 *
 * @param options - Import options including manifest and file resolver
 * @returns Import result with asset mappings and characters
 */
export async function importAsmlAssets(
  options: AsmlAssetImportOptions
): Promise<AsmlAssetImportResult> {
  const { manifest } = options;

  const assetMap = new Map<string, string>();
  const urlMap = new Map<string, string>(); // Maps asset name to URL (for sounds)
  const characterMap = new Map<string, Character>();
  const filePathMap = new Map<string, string>();
  const errors: string[] = [];

  const stats = {
    backgroundsImported: 0,
    propsImported: 0,
    soundsImported: 0,
    charactersCreated: 0,
    characterImagesImported: 0,
    totalFilesImported: 0,
    totalFilesMissing: 0
  };

  console.log('[AsmlAssetImporter] Starting import...');
  console.log('[AsmlAssetImporter] Manifest:', {
    backgrounds: manifest.backgrounds.length,
    props: manifest.props.length,
    sounds: manifest.sounds.length,
    characters: manifest.characters.length
  });

  // Import backgrounds - use "bg:" prefix to avoid collision with sounds of same name
  for (const bgRef of manifest.backgrounds) {
    const result = await importAssetFile(bgRef, 'background', options);
    if (result.assetId && result.url) {
      // Store with both prefixed and unprefixed keys for compatibility
      // Prefixed key takes priority in lookups
      assetMap.set(`bg:${bgRef.name}`, result.assetId);
      assetMap.set(bgRef.name, result.assetId); // Fallback for simple lookups
      urlMap.set(`bg:${bgRef.name}`, result.url);
      urlMap.set(bgRef.name, result.url); // Fallback
      filePathMap.set(bgRef.fPath, result.assetId);
      stats.backgroundsImported++;
      stats.totalFilesImported++;
    } else if (result.error) {
      errors.push(result.error);
      stats.totalFilesMissing++;
    }
  }

  // Import props - also track dimensions for proper sizing
  const propDimensionsMap = new Map<string, { width: number; height: number }>();
  for (const propRef of manifest.props) {
    const result = await importAssetFile(propRef, 'prop', options);
    if (result.assetId) {
      assetMap.set(propRef.name, result.assetId);
      filePathMap.set(propRef.fPath, result.assetId);
      // Store dimensions for this prop
      if (result.width && result.height) {
        propDimensionsMap.set(propRef.name, { width: result.width, height: result.height });
      }
      stats.propsImported++;
      stats.totalFilesImported++;
    } else if (result.error) {
      errors.push(result.error);
      stats.totalFilesMissing++;
    }
  }

  // Import sounds - use "sound:" prefix to avoid collision with backgrounds of same name
  for (const soundRef of manifest.sounds) {
    const result = await importAssetFile(soundRef, 'sound', options);
    if (result.assetId && result.url) {
      // Store with "sound:" prefix - don't store unprefixed to avoid overwriting backgrounds
      assetMap.set(`sound:${soundRef.name}`, result.assetId);
      urlMap.set(`sound:${soundRef.name}`, result.url);
      filePathMap.set(soundRef.fPath, result.assetId);
      stats.soundsImported++;
      stats.totalFilesImported++;
    } else if (result.error) {
      errors.push(result.error);
      stats.totalFilesMissing++;
    }
  }

  // Import characters
  for (const charRef of manifest.characters) {
    const result = await importCharacter(charRef, options);
    if (result.character) {
      characterMap.set(charRef.name, result.character);
      // Also map by lowercase name for case-insensitive lookups
      characterMap.set(charRef.name.toLowerCase(), result.character);
      stats.charactersCreated++;
    }

    // Track character image imports
    stats.characterImagesImported += result.stateAssetMap.size;
    stats.totalFilesImported += result.stateAssetMap.size;
    stats.totalFilesMissing += charRef.states.length - result.stateAssetMap.size;

    // Add character state asset mappings to filePathMap
    result.stateAssetMap.forEach((assetId, fPath) => {
      filePathMap.set(fPath, assetId);
    });

    errors.push(...result.errors);
  }

  console.log('[AsmlAssetImporter] Import complete:', stats);
  if (errors.length > 0) {
    console.warn('[AsmlAssetImporter] Errors:', errors);
  }

  return {
    assetMap,
    urlMap,
    characterMap,
    filePathMap,
    propDimensionsMap,
    errors,
    stats
  };
}

// ============================================
// Beat Asset Linking
// ============================================

/**
 * Link imported assets to beats
 * Updates beat locations and parameters with asset IDs
 *
 * @param beats - Array of beats to update
 * @param importResult - Result from importAsmlAssets
 */
export function linkAssetsToBeats(
  beats: any[],
  importResult: AsmlAssetImportResult
): void {
  const { assetMap, urlMap, characterMap } = importResult;

  console.log('[linkAssetsToBeats] Starting asset linking...');
  console.log('[linkAssetsToBeats] AssetMap entries:', Array.from(assetMap.entries()).map(([k, v]) => `${k} → ${v.substring(0, 8)}...`));
  console.log('[linkAssetsToBeats] CharacterMap entries:', Array.from(characterMap.keys()));
  console.log('[linkAssetsToBeats] Beats count:', beats.length);

  for (const beat of beats) {
    // Get node from getParameters() - that's where ASMLParser stores it
    const params = beat.getParameters?.() || {};
    const nodeName = params.node || beat.node;

    console.log(`[linkAssetsToBeats] Processing beat ${beat.id} (${beat.type}):`, {
      hasNode: !!nodeName,
      nodeName: nodeName,
      paramsNode: params.node,
      directNode: beat.node,
      locationsType: beat.locations?.constructor?.name,
      locationsSize: beat.locations?.size ?? (beat.locations?.length ?? 0)
    });

    // Link background - Beat stores 'node' in parameters (via getParameters)
    // VisualWorkspace looks up assets by ID, so we need to replace node name with asset ID
    // Also set the background URL directly for display
    if (nodeName) {
      // Try prefixed lookup first to avoid collision with sounds of same name (e.g., "forest")
      const assetId = assetMap.get(`bg:${nodeName}`) || assetMap.get(nodeName);
      const bgUrl = urlMap.get(`bg:${nodeName}`) || urlMap.get(nodeName);
      console.log(`[linkAssetsToBeats] Beat ${beat.id}: Looking up node "${nodeName}" → ${assetId ? 'FOUND: ' + assetId.substring(0, 8) + '...' : 'NOT FOUND'} (url: ${bgUrl ? 'set' : 'missing'})`);
      if (assetId) {
        // Update beat's node property to be the asset ID (for VisualWorkspace lookup)
        // Also set backgroundUrl for direct display without asset lookup
        // Use updateParameters if available, otherwise set directly
        if (typeof beat.updateParameters === 'function') {
          beat.updateParameters({
            node: assetId,
            backgroundAssetId: assetId,
            backgroundUrl: bgUrl // Direct URL for display
          });
          // Verify the update worked
          const newParams = beat.getParameters?.() || {};
          const newNode = newParams.node || beat.node;
          console.log(`[linkAssetsToBeats] Beat ${beat.id}: After updateParameters, node = ${newNode?.substring?.(0, 8) ?? newNode}...`);
        } else {
          beat.node = assetId;
        }
        console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked background "${nodeName}" → ${assetId}`);
      } else {
        console.warn(`[linkAssetsToBeats] Beat ${beat.id}: NO asset found for node "${nodeName}" - available: ${Array.from(assetMap.keys()).join(', ')}`);
      }
    }

    // Link sound - replace file name with actual URL for playback
    if (beat.sound?.file) {
      const soundName = beat.sound.file;
      // Try prefixed lookup first to avoid collision with backgrounds of same name (e.g., "forest")
      const assetId = assetMap.get(`sound:${soundName}`) || assetMap.get(soundName);
      const soundUrl = urlMap.get(`sound:${soundName}`) || urlMap.get(soundName);
      if (assetId) {
        beat.sound.assetId = assetId;
        // Replace file with URL so renderer can play it directly
        if (soundUrl) {
          beat.sound.file = soundUrl;
        }
        console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked sound "${soundName}" → ${assetId} (url: ${soundUrl ? 'set' : 'missing'})`);
      }
    }

    // Link locations - beat.locations is a Map<string, Location>
    if (beat.locations && beat.locations instanceof Map) {
      console.log(`[linkAssetsToBeats] Beat ${beat.id}: Processing ${beat.locations.size} locations from Map`);
      beat.locations.forEach((loc: any, key: string) => {
        console.log(`[linkAssetsToBeats] Beat ${beat.id}, location "${key}":`, {
          kind: loc.kind,
          name: loc.name,
          characterName: loc.characterName,
          stateId: loc.stateId
        });

        // Link props
        if (loc.kind === 'prop' && loc.name) {
          const assetId = assetMap.get(loc.name);
          if (assetId) {
            loc.assetId = assetId;
            console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked prop "${loc.name}" → ${assetId}`);
          }
        }

        // Link characters (kind is 'character', not 'char')
        if (loc.kind === 'character' && (loc.name || loc.characterName)) {
          const charName = loc.name || loc.characterName;
          console.log(`[linkAssetsToBeats] Beat ${beat.id}: Looking up character "${charName}"...`);
          const character = characterMap.get(charName) || characterMap.get(charName.toLowerCase());
          if (character) {
            loc.characterId = character.id;
            loc.stateId = loc.stateId || character.defaultState;
            // Get the state's image URL for display
            const state = character.states.find(s => s.id === loc.stateId);
            console.log(`[linkAssetsToBeats] Beat ${beat.id}: Found character "${charName}", state "${loc.stateId}":`, {
              stateFound: !!state,
              hasVisual: !!state?.visual,
              hasImage: !!state?.visual?.image,
              imageUrl: state?.visual?.image?.substring?.(0, 50) ?? 'N/A'
            });
            if (state?.visual?.image) {
              loc.imageUrl = state.visual.image;
            }
            console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked character "${charName}" → ${character.id} (state: ${loc.stateId}, hasImage: ${!!loc.imageUrl})`);
          } else {
            console.warn(`[linkAssetsToBeats] Beat ${beat.id}: Character "${charName}" NOT FOUND in characterMap. Available: ${Array.from(characterMap.keys()).join(', ')}`);
          }
        }

        // Link location sounds - replace with URL for playback
        if (loc.sound) {
          const soundAssetId = assetMap.get(loc.sound);
          const soundUrl = urlMap.get(loc.sound);
          if (soundAssetId) {
            loc.soundAssetId = soundAssetId;
            if (soundUrl) {
              loc.sound = soundUrl; // Replace with URL for direct playback
            }
          }
        }
      });
    } else if (beat.locations && Array.isArray(beat.locations)) {
      // Fallback for array-style locations (legacy or serialized format)
      for (const loc of beat.locations) {
        if (loc.kind === 'prop' && loc.name) {
          const assetId = assetMap.get(loc.name);
          if (assetId) {
            loc.assetId = assetId;
            console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked prop "${loc.name}" → ${assetId}`);
          }
        }

        if (loc.kind === 'character' && (loc.name || loc.characterName)) {
          const charName = loc.name || loc.characterName;
          const character = characterMap.get(charName) || characterMap.get(charName.toLowerCase());
          if (character) {
            loc.characterId = character.id;
            loc.stateId = loc.stateId || character.defaultState;
            // Get the state's image URL for display
            const state = character.states.find(s => s.id === loc.stateId);
            if (state?.visual?.image) {
              loc.imageUrl = state.visual.image;
            }
            console.log(`[linkAssetsToBeats] Beat ${beat.id}: linked character "${charName}" → ${character.id} (state: ${loc.stateId}, hasImage: ${!!loc.imageUrl})`);
          }
        }

        // Link location sounds - replace with URL for playback
        if (loc.sound) {
          const soundAssetId = assetMap.get(loc.sound);
          const soundUrl = urlMap.get(loc.sound);
          if (soundAssetId) {
            loc.soundAssetId = soundAssetId;
            if (soundUrl) {
              loc.sound = soundUrl; // Replace with URL for direct playback
            }
          }
        }
      }
    }
  }
}

/**
 * Link global settings to imported assets
 *
 * This resolves asset references in settings (like backgroundMusic) to actual URLs
 * so they can be played during preview.
 */
export function linkAssetsToSettings(
  settings: any,
  importResult: AsmlAssetImportResult
): void {
  if (!settings) return;

  const { assetMap, urlMap } = importResult;

  // Link background music - settings.sound.backgroundMusic contains the sound name from ASML
  if (settings.sound?.backgroundMusic) {
    const soundName = settings.sound.backgroundMusic;

    // Try prefixed lookup first (sounds are imported with "sound:" prefix)
    const assetId = assetMap.get(`sound:${soundName}`) || assetMap.get(soundName);
    const soundUrl = urlMap.get(`sound:${soundName}`) || urlMap.get(soundName);

    if (soundUrl) {
      // Store the original name for display, and the URL for playback
      settings.sound.backgroundMusicName = soundName; // Original filename for UI display
      settings.sound.backgroundMusic = soundUrl;      // Blob URL for playback
      settings.sound.backgroundMusicAssetId = assetId;
      console.log(`[linkAssetsToSettings] Linked background music "${soundName}" → ${soundUrl.substring(0, 50)}...`);
    } else {
      console.warn(`[linkAssetsToSettings] Background music "${soundName}" not found in imported assets. Available sounds:`,
        Array.from(assetMap.keys()).filter(k => k.startsWith('sound:')));
    }
  }
}
