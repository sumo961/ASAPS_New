/**
 * Project ZIP Manager - Export and import complete projects as ZIP files
 *
 * Handles packaging projects with all assets into a single ZIP file for backup
 * and transfer, and restoring them back into IndexedDB.
 */

import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { getStorageManager } from '../storage/StorageManager';
import type { Project, StoredAsset, AssetType } from '../storage/types';

/**
 * Export project as ZIP file
 * Creates a ZIP containing project data and all assets
 */
export async function exportProjectAsZip(projectId: string): Promise<Blob> {
  const storage = getStorageManager();

  // Get project data
  const projectResult = await storage.getProject(projectId);
  if (!projectResult.success || !projectResult.data) {
    throw new Error('Project not found');
  }

  const project = projectResult.data;

  // Get all assets for this project
  const assetsResult = await storage.getProjectAssets(projectId);
  const linkedAssets = assetsResult.success ? assetsResult.data || [] : [];
  const linkedAssetIds = new Set(linkedAssets.map(a => a.id));

  // Also scan story for referenced asset IDs that might not be linked to project
  const storyData = serializeStory(project.story);
  const referencedIds = extractAssetIdsFromStory(storyData);

  // Also scan project.settings for background music and other asset references
  const projectSettingsIds = extractAssetIdsFromSettings(project.settings);

  // Also scan project.globalSettings for background music and other asset references
  const globalSettingsIds = extractAssetIdsFromGlobalSettings(project.globalSettings);

  const allReferencedIds = [...new Set([...referencedIds, ...projectSettingsIds, ...globalSettingsIds])];

  console.log('[exportProjectAsZip] Referenced asset IDs found in story:', referencedIds.length);
  console.log('[exportProjectAsZip] Referenced asset IDs found in project settings:', projectSettingsIds.length, projectSettingsIds);
  console.log('[exportProjectAsZip] Referenced asset IDs found in globalSettings:', globalSettingsIds.length, globalSettingsIds);
  console.log('[exportProjectAsZip] Sample referenced IDs:', allReferencedIds.slice(0, 10));

  // Find any referenced assets not in the linked assets
  const missingIds = allReferencedIds.filter(id => !linkedAssetIds.has(id));
  console.log('[exportProjectAsZip] Missing/orphaned IDs:', missingIds);
  const additionalAssets: StoredAsset[] = [];

  for (const assetId of missingIds) {
    try {
      const assetResult = await storage.getAsset(assetId);
      if (assetResult.success && assetResult.data) {
        additionalAssets.push(assetResult.data);
        console.log(`[exportProjectAsZip] Found orphaned asset: ${assetId} (${assetResult.data.filename})`);
      }
    } catch (e) {
      console.warn(`[exportProjectAsZip] Could not load referenced asset: ${assetId}`);
    }
  }

  // Combine linked and orphaned assets
  const assets = [...linkedAssets, ...additionalAssets];

  console.log('[exportProjectAsZip] Exporting project:', {
    id: project.id,
    name: project.name,
    linkedAssetCount: linkedAssets.length,
    orphanedAssetCount: additionalAssets.length,
    totalAssetCount: assets.length
  });

  // Create ZIP
  const zip = new JSZip();

  // Add project metadata and story data as JSON
  const projectData = {
    metadata: {
      exportVersion: '1.1.0',  // Bumped version for settings support
      exportedAt: new Date().toISOString(),
      exportedBy: 'ASAPS Builder',
      projectId: project.id,
      projectName: project.name
    },
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
      version: project.version,
      settings: project.settings,
      globalSettings: project.globalSettings,  // Full global settings
      themeId: project.themeId,                // Theme reference
      themeOverrides: project.themeOverrides,  // Theme customizations
      story: serializeStory(project.story)
    }
  };

  zip.file('project.json', JSON.stringify(projectData, null, 2));

  // Add assets to ZIP in organized folders
  // Use unique filenames (assetId_filename) to prevent duplicates from overwriting each other
  for (const asset of assets) {
    const folderName = getFolderForAssetType(asset.type);
    // Include asset ID prefix to ensure unique filenames
    const fileName = `${folderName}/${asset.id}_${asset.filename}`;

    // Convert blob to array buffer
    const arrayBuffer = await asset.blob.arrayBuffer();

    // Add to ZIP
    zip.file(fileName, arrayBuffer, { binary: true });

    // Add asset metadata
    const metadataFileName = `${folderName}/${asset.id}.json`;
    const assetMetadata = {
      id: asset.id,
      filename: asset.filename,
      type: asset.type,
      mimeType: asset.mimeType,
      size: asset.size,
      uploadedAt: asset.uploadedAt,
      metadata: asset.metadata
    };
    zip.file(metadataFileName, JSON.stringify(assetMetadata, null, 2));
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob' });

  console.log('[exportProjectAsZip] ZIP created, size:', blob.size);
  return blob;
}

/**
 * Result of import operation
 */
export interface ImportResult {
  success: boolean;
  projectId?: string;
  error?: string;
  conflict?: {
    existingProjectId: string;
    existingProjectName?: string;
    incomingProjectName?: string;
  };
}

/**
 * Import project from ZIP file
 * Extracts and restores a project and all its assets to IndexedDB
 */
export async function importProjectFromZip(
  zipFile: File,
  options: {
    overwrite?: boolean;
    generateNewId?: boolean;
    newName?: string; // Optional new name for the project
  } = {}
): Promise<ImportResult> {
  const storage = getStorageManager();

  try {
    console.log('[importProjectFromZip] Loading ZIP file:', zipFile.name);

    // Load ZIP
    const zip = await JSZip.loadAsync(zipFile);

    // Read project.json
    const projectJsonFile = zip.file('project.json');
    if (!projectJsonFile) {
      throw new Error('Invalid project ZIP: project.json not found');
    }

    const projectJsonContent = await projectJsonFile.async('text');
    const projectData = JSON.parse(projectJsonContent);

    if (!projectData.project || !projectData.metadata) {
      throw new Error('Invalid project.json structure');
    }

    console.log('[importProjectFromZip] Project data loaded:', {
      name: projectData.project.name,
      version: projectData.metadata.exportVersion
    });

    // Generate new ID if requested
    const projectId = options.generateNewId ? uuidv4() : projectData.project.id;

    // Check if project already exists
    const exists = await storage.projectExists(projectId);
    if (exists && !options.overwrite) {
      // Return conflict info instead of throwing - let caller handle it
      const existingProject = await storage.getProject(projectId);
      return {
        success: false,
        conflict: {
          existingProjectId: projectId,
          existingProjectName: existingProject?.name,
          incomingProjectName: projectData.project.name,
        }
      };
    }

    // Apply new name if provided
    if (options.newName) {
      projectData.project.name = options.newName;
    }

    // Import assets first
    const assetIdMap = new Map<string, string>(); // old ID -> new ID mapping
    const assetFolders = ['backgrounds', 'characters', 'props', 'sounds', 'fonts', 'other'];

    for (const folderName of assetFolders) {
      const folder = zip.folder(folderName);
      if (!folder) continue;

      // First, read ALL metadata files in this folder to build ID -> metadata map
      const metadataFiles = Object.keys(zip.files).filter(
        path => path.startsWith(`${folderName}/`) && path.endsWith('.json')
      );

      const metadataById = new Map<string, any>();
      for (const metadataPath of metadataFiles) {
        const metadataFile = zip.file(metadataPath);
        if (!metadataFile) continue;

        try {
          const metadataContent = await metadataFile.async('text');
          const metadata = JSON.parse(metadataContent);
          if (metadata.id) {
            metadataById.set(metadata.id, metadata);
            console.log(`[importProjectFromZip] Loaded metadata for ID: ${metadata.id} (filename: ${metadata.filename})`);
          }
        } catch (e) {
          console.warn(`[importProjectFromZip] Failed to parse metadata: ${metadataPath}`, e);
        }
      }

      // Get all asset files in this folder (non-JSON files)
      const assetFiles = Object.keys(zip.files).filter(
        path => path.startsWith(`${folderName}/`) && !path.endsWith('.json') && !zip.files[path].dir
      );

      for (const filePath of assetFiles) {
        const file = zip.file(filePath);
        if (!file) continue;

        // Get filename from path - may be in format "assetId_originalFilename" or just "originalFilename"
        const fullFilename = filePath.split('/').pop() || 'unknown';

        // Try to extract asset ID from filename prefix (new format: uuid_filename.ext)
        // UUID format: 8-4-4-4-12 characters = 36 characters + underscore = 37
        let extractedId: string | null = null;
        let originalFilename = fullFilename;

        const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/i;
        const match = fullFilename.match(uuidPattern);
        if (match) {
          extractedId = match[1];
          originalFilename = match[2];
          console.log(`[importProjectFromZip] Extracted ID from filename: ${extractedId} -> ${originalFilename}`);
        }

        // Look up metadata by ID (from filename prefix or from metadata file)
        const assetMetadata = extractedId ? metadataById.get(extractedId) : null;

        // Fallback: try to find metadata by original filename (for legacy ZIP format)
        let fallbackMetadata: any = null;
        if (!assetMetadata) {
          for (const [id, meta] of metadataById) {
            if (meta.filename === fullFilename || meta.filename === originalFilename) {
              fallbackMetadata = meta;
              console.log(`[importProjectFromZip] Found metadata by filename fallback: ${meta.filename} (id: ${id})`);
              break;
            }
          }
        }

        const finalMetadata = assetMetadata || fallbackMetadata || {};

        // Read asset blob
        const blob = await file.async('blob');

        // Generate new asset ID or use original
        // Use extracted ID from filename, or fallback to metadata ID
        const originalId = extractedId || finalMetadata.id;
        const newAssetId = options.generateNewId ? uuidv4() : (originalId || uuidv4());

        // Store old -> new mapping (needed for updating story references)
        if (originalId) {
          assetIdMap.set(originalId, newAssetId);
          console.log(`[importProjectFromZip] Asset ID mapping: ${originalId} -> ${newAssetId}`);
        }

        // Create stored asset
        const storedAsset: StoredAsset = {
          id: newAssetId,
          projectId: projectId,
          type: (finalMetadata.type || getAssetTypeFromFolder(folderName)) as AssetType,
          filename: finalMetadata.filename || originalFilename,
          mimeType: finalMetadata.mimeType || blob.type || 'application/octet-stream',
          size: blob.size,
          blob: blob,
          uploadedAt: finalMetadata.uploadedAt ? new Date(finalMetadata.uploadedAt) : new Date(),
          metadata: finalMetadata.metadata
        };

        // Save to IndexedDB
        await storage.createAsset(storedAsset);

        console.log('[importProjectFromZip] Asset imported:', {
          id: newAssetId,
          originalId: originalId,
          filename: storedAsset.filename,
          type: storedAsset.type
        });
      }
    }

    // Update asset references in story if IDs changed
    let story = deserializeStory(projectData.project.story);
    let settings = projectData.project.settings || {};
    let globalSettings = projectData.project.globalSettings || undefined;
    let themeId = projectData.project.themeId;
    let themeOverrides = projectData.project.themeOverrides;

    // Always apply asset ID mapping if any IDs actually changed
    // (when generateNewId is false, mapping is identity so this is a no-op)
    if (assetIdMap.size > 0) {
      console.log('[importProjectFromZip] Applying asset ID mapping:', Object.fromEntries(assetIdMap));
      story = updateAssetReferences(story, assetIdMap);
      settings = updateSettingsAssetReferences(settings, assetIdMap);
      // Also update globalSettings if present
      if (globalSettings) {
        globalSettings = updateGlobalSettingsAssetReferences(globalSettings, assetIdMap);
      }
    }

    console.log('[importProjectFromZip] Settings loaded:', {
      hasSettings: !!settings,
      hasGlobalSettings: !!globalSettings,
      hasThemeId: !!themeId,
      hasThemeOverrides: !!themeOverrides
    });

    // Create project
    const project: Project = {
      id: projectId,
      name: projectData.project.name,
      description: projectData.project.description,
      story: story,
      settings: settings,
      globalSettings: globalSettings,
      themeId: themeId,
      themeOverrides: themeOverrides,
      assetIds: Array.from(assetIdMap.values()),
      createdAt: new Date(projectData.project.createdAt),
      modifiedAt: new Date(),
      version: projectData.project.version || '1.0.0'
    };

    // Save or update project
    if (exists && options.overwrite) {
      await storage.updateProject(project);
    } else {
      await storage.createProject(project);
    }

    console.log('[importProjectFromZip] Project imported successfully:', {
      id: projectId,
      name: project.name,
      assetCount: assetIdMap.size
    });

    return { success: true, projectId };
  } catch (error) {
    console.error('[importProjectFromZip] Import failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Download project as ZIP file
 */
export async function downloadProjectAsZip(projectId: string, projectName: string): Promise<void> {
  try {
    const blob = await exportProjectAsZip(projectId);
    const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}.asaps.zip`;

    // Check if we're in Electron
    if (window.electronAPI?.dialog?.save) {
      // Use Electron's native save dialog
      const result = await window.electronAPI.dialog.save({
        defaultPath: filename,
        filters: [
          { name: 'ASAPS Project', extensions: ['asaps.zip'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        console.log('[downloadProjectAsZip] User cancelled save dialog');
        return;
      }

      // Write file to selected path - convert to Uint8Array for Electron IPC
      const arrayBuffer = await blob.arrayBuffer();
      await window.electronAPI.fs.writeFile(result.filePath, new Uint8Array(arrayBuffer));
      console.log('[downloadProjectAsZip] File saved to:', result.filePath);
    } else {
      // Browser fallback: use programmatic download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('[downloadProjectAsZip] Download initiated');
    }
  } catch (error) {
    console.error('[downloadProjectAsZip] Download failed:', error);
    throw error;
  }
}

/**
 * Export ASML XML with organized asset folders
 * Creates a ZIP with Story.xml and assets in organized folders
 */
export async function exportAsmlWithAssets(
  projectName: string,
  asmlXml: string,
  assets: StoredAsset[]
): Promise<Blob> {
  const zip = new JSZip();

  // Add ASML file
  zip.file('Story.xml', asmlXml);

  // Add assets in organized folders
  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    for (const asset of assets) {
      const folder = getAssetFolderName(asset.type, asset.mimeType);
      const assetSubfolder = assetsFolder.folder(folder);
      if (assetSubfolder) {
        const arrayBuffer = await asset.blob.arrayBuffer();
        assetSubfolder.file(asset.filename, arrayBuffer, { binary: true });
      }
    }
  }

  console.log('[exportAsmlWithAssets] Created ZIP with', assets.length, 'assets');
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Download ASML with assets as ZIP
 */
export async function downloadAsmlWithAssets(
  projectName: string,
  asmlXml: string,
  assets: StoredAsset[]
): Promise<void> {
  try {
    const blob = await exportAsmlWithAssets(projectName, asmlXml, assets);
    const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}_with_assets.zip`;

    // Check if we're in Electron
    if (window.electronAPI?.dialog?.save) {
      // Use Electron's native save dialog
      const result = await window.electronAPI.dialog.save({
        defaultPath: filename,
        filters: [
          { name: 'ASML with Assets', extensions: ['zip'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        console.log('[downloadAsmlWithAssets] User cancelled save dialog');
        return;
      }

      // Write file to selected path - convert to Uint8Array for Electron IPC
      const arrayBuffer = await blob.arrayBuffer();
      await window.electronAPI.fs.writeFile(result.filePath, new Uint8Array(arrayBuffer));
      console.log('[downloadAsmlWithAssets] File saved to:', result.filePath);
    } else {
      // Browser fallback: use programmatic download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('[downloadAsmlWithAssets] Download initiated');
    }
  } catch (error) {
    console.error('[downloadAsmlWithAssets] Download failed:', error);
    throw error;
  }
}

/**
 * Get organized folder name for asset type (for ASML export)
 */
function getAssetFolderName(type: AssetType, mimeType?: string): string {
  switch (type) {
    case 'image':
      // Could further distinguish backgrounds vs characters vs props based on metadata
      return 'images';
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get folder name for asset type
 */
function getFolderForAssetType(type: AssetType): string {
  switch (type) {
    case 'image':
      return 'backgrounds';
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
 * Get asset type from folder name
 */
function getAssetTypeFromFolder(folder: string): AssetType {
  switch (folder) {
    case 'backgrounds':
    case 'characters':
    case 'props':
      return 'image';
    case 'sounds':
      return 'audio';
    case 'videos':
      return 'video';
    case 'fonts':
      return 'font';
    default:
      return 'other';
  }
}

/**
 * Serialize story for ZIP export
 * Handles both Story instances and plain objects
 */
function serializeStory(story: any): any {
  // If it's a Story instance with methods
  if (story.getAllBeats && typeof story.getAllBeats === 'function') {
    return {
      metadata: story.getMetadata(),
      beats: story.getAllBeats().map((beat: any) => beat.toJSON ? beat.toJSON() : beat),
      settings: story.getSettings(),
      environment: story.getEnvironment(),
      characters: story.getCharacters(),
      clusters: story.getClusters ? story.getClusters() : []
    };
  }

  // Already serialized or plain object
  return story;
}

/**
 * Deserialize story from ZIP import
 */
function deserializeStory(storyData: any): any {
  // Return as-is - will be properly deserialized when project is loaded
  return storyData;
}

/**
 * Update asset references in story when IDs change
 */
function updateAssetReferences(story: any, assetIdMap: Map<string, string>): any {
  // Deep clone to avoid mutating original
  const updated = JSON.parse(JSON.stringify(story));

  // Update beat parameters that reference assets
  if (updated.beats && Array.isArray(updated.beats)) {
    for (const beat of updated.beats) {
      // Update node references (background images)
      if (beat.node && assetIdMap.has(beat.node)) {
        beat.node = assetIdMap.get(beat.node);
      }

      // Update location references
      if (beat.locations && Array.isArray(beat.locations)) {
        for (const location of beat.locations) {
          // Update assetId (primary asset reference for characters/props)
          if (location.assetId && assetIdMap.has(location.assetId)) {
            location.assetId = assetIdMap.get(location.assetId);
          }
          // Update characterId (reference to Character definition)
          if (location.characterId && assetIdMap.has(location.characterId)) {
            location.characterId = assetIdMap.get(location.characterId);
          }
          // Update sound references in locations (button click sounds)
          // Sound can be stored as location.soundAssetId (direct property) or location.sound.assetId (nested)
          if (location.soundAssetId && assetIdMap.has(location.soundAssetId)) {
            location.soundAssetId = assetIdMap.get(location.soundAssetId);
          }
          if (location.sound?.assetId && assetIdMap.has(location.sound.assetId)) {
            location.sound.assetId = assetIdMap.get(location.sound.assetId);
          }
        }
      }

      // Update sound references in beat
      if (beat.sound && beat.sound.assetId && assetIdMap.has(beat.sound.assetId)) {
        beat.sound.assetId = assetIdMap.get(beat.sound.assetId);
      }

      // Update parameters
      if (beat.parameters) {
        if (beat.parameters.node && assetIdMap.has(beat.parameters.node)) {
          beat.parameters.node = assetIdMap.get(beat.parameters.node);
        }
      }
    }
  }

  // Update environment references
  if (updated.environment) {
    if (updated.environment.nodes && Array.isArray(updated.environment.nodes)) {
      for (const node of updated.environment.nodes) {
        // Update node ID (which may reference an asset)
        if (node.id && assetIdMap.has(node.id)) {
          node.id = assetIdMap.get(node.id);
        }
        // Update node assetId if present
        if (node.assetId && assetIdMap.has(node.assetId)) {
          node.assetId = assetIdMap.get(node.assetId);
        }
      }
    }

    if (updated.environment.props && Array.isArray(updated.environment.props)) {
      for (const prop of updated.environment.props) {
        // Update prop ID
        if (prop.id && assetIdMap.has(prop.id)) {
          prop.id = assetIdMap.get(prop.id);
        }
        // Update prop assetId if present
        if (prop.assetId && assetIdMap.has(prop.assetId)) {
          prop.assetId = assetIdMap.get(prop.assetId);
        }
      }
    }
  }

  // Update character references
  if (updated.characters && Array.isArray(updated.characters)) {
    for (const character of updated.characters) {
      // Update character visual.defaultAssetId
      if (character.visual?.defaultAssetId && assetIdMap.has(character.visual.defaultAssetId)) {
        character.visual.defaultAssetId = assetIdMap.get(character.visual.defaultAssetId);
      }
      // Update character states/poses (legacy format)
      if (character.poses && Array.isArray(character.poses)) {
        for (const pose of character.poses) {
          if (pose.src && assetIdMap.has(pose.src)) {
            pose.src = assetIdMap.get(pose.src);
          }
          if (pose.assetId && assetIdMap.has(pose.assetId)) {
            pose.assetId = assetIdMap.get(pose.assetId);
          }
        }
      }
      // Update states array (current format with visual.assetId)
      if (character.states && Array.isArray(character.states)) {
        for (const state of character.states) {
          // State has visual object with assetId
          if (state.visual?.assetId && assetIdMap.has(state.visual.assetId)) {
            state.visual.assetId = assetIdMap.get(state.visual.assetId);
          }
        }
      }
    }
  }

  // Update cluster sound references
  if (updated.metadata?.clusters && Array.isArray(updated.metadata.clusters)) {
    for (const cluster of updated.metadata.clusters) {
      if (cluster.sound?.assetId && assetIdMap.has(cluster.sound.assetId)) {
        cluster.sound.assetId = assetIdMap.get(cluster.sound.assetId);
      }
    }
  }

  // Update settings sound references
  if (updated.settings?.sound) {
    if (updated.settings.sound.backgroundMusicAssetId && assetIdMap.has(updated.settings.sound.backgroundMusicAssetId)) {
      updated.settings.sound.backgroundMusicAssetId = assetIdMap.get(updated.settings.sound.backgroundMusicAssetId);
    }
    if (updated.settings.sound.defaultButtonSoundAssetId && assetIdMap.has(updated.settings.sound.defaultButtonSoundAssetId)) {
      updated.settings.sound.defaultButtonSoundAssetId = assetIdMap.get(updated.settings.sound.defaultButtonSoundAssetId);
    }
  }

  return updated;
}

/**
 * Extract all asset IDs referenced in story data
 * This finds asset IDs that might not be linked to the project but are referenced in beats
 */
function extractAssetIdsFromStory(story: any): string[] {
  const assetIds = new Set<string>();

  // UUID pattern for asset IDs
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (str: string) => uuidPattern.test(str);

  // Helper to add ID if it looks like a UUID
  const addIfUuid = (value: any) => {
    if (typeof value === 'string' && isUuid(value)) {
      assetIds.add(value);
    }
  };

  // Scan beats
  if (story.beats && Array.isArray(story.beats)) {
    for (const beat of story.beats) {
      // Beat node (background)
      addIfUuid(beat.node);

      // Beat sound
      if (beat.sound?.assetId) addIfUuid(beat.sound.assetId);

      // Beat locations
      if (beat.locations && Array.isArray(beat.locations)) {
        for (const location of beat.locations) {
          addIfUuid(location.assetId);
          addIfUuid(location.soundAssetId);
          if (location.sound?.assetId) addIfUuid(location.sound.assetId);
          addIfUuid(location.characterId);
        }
      }

      // Beat parameters
      if (beat.parameters) {
        addIfUuid(beat.parameters.node);
      }
    }
  }

  // Scan environment
  if (story.environment) {
    if (story.environment.nodes && Array.isArray(story.environment.nodes)) {
      for (const node of story.environment.nodes) {
        addIfUuid(node.id);
        addIfUuid(node.assetId);
      }
    }
    if (story.environment.props && Array.isArray(story.environment.props)) {
      for (const prop of story.environment.props) {
        addIfUuid(prop.id);
        addIfUuid(prop.assetId);
      }
    }
  }

  // Scan characters
  if (story.characters && Array.isArray(story.characters)) {
    for (const character of story.characters) {
      if (character.visual?.defaultAssetId) addIfUuid(character.visual.defaultAssetId);
      if (character.poses && Array.isArray(character.poses)) {
        for (const pose of character.poses) {
          addIfUuid(pose.src);
          addIfUuid(pose.assetId);
        }
      }
      if (character.states && Array.isArray(character.states)) {
        for (const state of character.states) {
          if (state.visual?.assetId) addIfUuid(state.visual.assetId);
        }
      }
    }
  }

  // Scan clusters
  if (story.metadata?.clusters && Array.isArray(story.metadata.clusters)) {
    for (const cluster of story.metadata.clusters) {
      if (cluster.sound?.assetId) addIfUuid(cluster.sound.assetId);
    }
  }

  // Scan settings
  if (story.settings?.sound) {
    addIfUuid(story.settings.sound.backgroundMusicAssetId);
    addIfUuid(story.settings.sound.defaultButtonSoundAssetId);
  }

  return Array.from(assetIds);
}

/**
 * Update asset references in project settings
 */
function updateSettingsAssetReferences(settings: any, assetIdMap: Map<string, string>): any {
  if (!settings) return settings;

  // Deep clone to avoid mutating original
  const updated = JSON.parse(JSON.stringify(settings));

  // Update sound settings
  if (updated.sound) {
    if (updated.sound.backgroundMusicAssetId && assetIdMap.has(updated.sound.backgroundMusicAssetId)) {
      console.log(`[updateSettingsAssetReferences] Updating backgroundMusicAssetId: ${updated.sound.backgroundMusicAssetId} -> ${assetIdMap.get(updated.sound.backgroundMusicAssetId)}`);
      updated.sound.backgroundMusicAssetId = assetIdMap.get(updated.sound.backgroundMusicAssetId);
    }
    if (updated.sound.defaultButtonSoundAssetId && assetIdMap.has(updated.sound.defaultButtonSoundAssetId)) {
      console.log(`[updateSettingsAssetReferences] Updating defaultButtonSoundAssetId: ${updated.sound.defaultButtonSoundAssetId} -> ${assetIdMap.get(updated.sound.defaultButtonSoundAssetId)}`);
      updated.sound.defaultButtonSoundAssetId = assetIdMap.get(updated.sound.defaultButtonSoundAssetId);
    }
  }

  return updated;
}

/**
 * Extract asset IDs from project settings (background music, default sounds, etc.)
 * This handles the basic ProjectSettings type
 */
function extractAssetIdsFromSettings(settings: any): string[] {
  const assetIds: string[] = [];

  if (!settings) return assetIds;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (str: string) => typeof str === 'string' && uuidPattern.test(str);

  // Check sound settings
  if (settings.sound) {
    if (isUuid(settings.sound.backgroundMusicAssetId)) {
      assetIds.push(settings.sound.backgroundMusicAssetId);
    }
    if (isUuid(settings.sound.defaultButtonSoundAssetId)) {
      assetIds.push(settings.sound.defaultButtonSoundAssetId);
    }
  }

  return assetIds;
}

/**
 * Extract asset IDs from GlobalSettings (full settings object)
 * This handles the GlobalSettings type with sound.backgroundMusicAssetId
 */
function extractAssetIdsFromGlobalSettings(globalSettings: any): string[] {
  const assetIds: string[] = [];

  if (!globalSettings) return assetIds;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = (str: string) => typeof str === 'string' && uuidPattern.test(str);

  // Check sound settings in GlobalSettings
  if (globalSettings.sound) {
    if (isUuid(globalSettings.sound.backgroundMusicAssetId)) {
      console.log('[extractAssetIdsFromGlobalSettings] Found backgroundMusicAssetId:', globalSettings.sound.backgroundMusicAssetId);
      assetIds.push(globalSettings.sound.backgroundMusicAssetId);
    }
  }

  // Note: fonts in GlobalSettings are font names (strings), not asset IDs
  // Custom fonts are stored as assets but referenced by font family name, not asset ID

  return assetIds;
}

/**
 * Update asset references in GlobalSettings
 */
function updateGlobalSettingsAssetReferences(globalSettings: any, assetIdMap: Map<string, string>): any {
  if (!globalSettings) return globalSettings;

  // Deep clone to avoid mutating original
  const updated = JSON.parse(JSON.stringify(globalSettings));

  // Update sound settings
  if (updated.sound) {
    if (updated.sound.backgroundMusicAssetId && assetIdMap.has(updated.sound.backgroundMusicAssetId)) {
      console.log(`[updateGlobalSettingsAssetReferences] Updating backgroundMusicAssetId: ${updated.sound.backgroundMusicAssetId} -> ${assetIdMap.get(updated.sound.backgroundMusicAssetId)}`);
      updated.sound.backgroundMusicAssetId = assetIdMap.get(updated.sound.backgroundMusicAssetId);
    }
  }

  return updated;
}
