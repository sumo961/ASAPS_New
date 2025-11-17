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
  const assets = assetsResult.success ? assetsResult.data || [] : [];

  console.log('[exportProjectAsZip] Exporting project:', {
    id: project.id,
    name: project.name,
    assetCount: assets.length
  });

  // Create ZIP
  const zip = new JSZip();

  // Add project metadata and story data as JSON
  const projectData = {
    metadata: {
      exportVersion: '1.0.0',
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
      story: serializeStory(project.story)
    }
  };

  zip.file('project.json', JSON.stringify(projectData, null, 2));

  // Add assets to ZIP in organized folders
  for (const asset of assets) {
    const folderName = getFolderForAssetType(asset.type);
    const fileName = `${folderName}/${asset.filename}`;

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
 * Import project from ZIP file
 * Extracts and restores a project and all its assets to IndexedDB
 */
export async function importProjectFromZip(
  zipFile: File,
  options: {
    overwrite?: boolean;
    generateNewId?: boolean;
  } = {}
): Promise<{ success: boolean; projectId?: string; error?: string }> {
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
      throw new Error(
        'Project already exists. Use overwrite option or import with new ID.'
      );
    }

    // Import assets first
    const assetIdMap = new Map<string, string>(); // old ID -> new ID mapping
    const assetFolders = ['backgrounds', 'characters', 'props', 'sounds', 'fonts', 'other'];

    for (const folderName of assetFolders) {
      const folder = zip.folder(folderName);
      if (!folder) continue;

      // Get all files in this folder
      const files = Object.keys(zip.files).filter(
        path => path.startsWith(`${folderName}/`) && !path.endsWith('.json')
      );

      for (const filePath of files) {
        const file = zip.file(filePath);
        if (!file) continue;

        // Get corresponding metadata file
        const assetId = filePath.split('/')[1].split('.')[0];
        const metadataPath = filePath.replace(/\.[^.]+$/, '').split('/');
        metadataPath[metadataPath.length - 1] = `${assetId}.json`;
        const metadataFile = zip.file(metadataPath.join('/'));

        let assetMetadata: any = {};
        if (metadataFile) {
          const metadataContent = await metadataFile.async('text');
          assetMetadata = JSON.parse(metadataContent);
        }

        // Read asset blob
        const blob = await file.async('blob');

        // Generate new asset ID
        const newAssetId = options.generateNewId ? uuidv4() : assetMetadata.id || uuidv4();

        // Store old -> new mapping
        if (assetMetadata.id) {
          assetIdMap.set(assetMetadata.id, newAssetId);
        }

        // Create stored asset
        const storedAsset: StoredAsset = {
          id: newAssetId,
          projectId: projectId,
          type: (assetMetadata.type || getAssetTypeFromFolder(folderName)) as AssetType,
          filename: assetMetadata.filename || filePath.split('/').pop() || 'unknown',
          mimeType: assetMetadata.mimeType || blob.type || 'application/octet-stream',
          size: blob.size,
          blob: blob,
          uploadedAt: assetMetadata.uploadedAt ? new Date(assetMetadata.uploadedAt) : new Date(),
          metadata: assetMetadata.metadata
        };

        // Save to IndexedDB
        await storage.createAsset(storedAsset);

        console.log('[importProjectFromZip] Asset imported:', {
          id: newAssetId,
          filename: storedAsset.filename,
          type: storedAsset.type
        });
      }
    }

    // Update asset references in story if IDs changed
    let story = deserializeStory(projectData.project.story);
    if (options.generateNewId && assetIdMap.size > 0) {
      story = updateAssetReferences(story, assetIdMap);
    }

    // Create project
    const project: Project = {
      id: projectId,
      name: projectData.project.name,
      description: projectData.project.description,
      story: story,
      settings: projectData.project.settings || {},
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

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}.asaps.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[downloadProjectAsZip] Download initiated');
  } catch (error) {
    console.error('[downloadProjectAsZip] Download failed:', error);
    throw error;
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
          if (location.char && assetIdMap.has(location.char)) {
            location.char = assetIdMap.get(location.char);
          }
        }
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
        if (node.id && assetIdMap.has(node.id)) {
          const newId = assetIdMap.get(node.id);
          node.id = newId;
        }
      }
    }

    if (updated.environment.props && Array.isArray(updated.environment.props)) {
      for (const prop of updated.environment.props) {
        if (prop.id && assetIdMap.has(prop.id)) {
          prop.id = assetIdMap.get(prop.id);
        }
      }
    }
  }

  // Update character references
  if (updated.characters && Array.isArray(updated.characters)) {
    for (const character of updated.characters) {
      if (character.poses && Array.isArray(character.poses)) {
        for (const pose of character.poses) {
          if (pose.src && assetIdMap.has(pose.src)) {
            pose.src = assetIdMap.get(pose.src);
          }
        }
      }
    }
  }

  return updated;
}
