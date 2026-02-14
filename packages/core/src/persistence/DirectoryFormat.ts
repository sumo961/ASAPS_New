/**
 * DirectoryFormat - Core serializer/deserializer for directory-based projects
 *
 * Splits a Story + Project into individual files organized by cluster,
 * and reassembles them from a directory structure.
 *
 * Directory layout:
 *   .asaps/format.json
 *   project.json
 *   settings.json
 *   theme.json
 *   characters/_index.json + {characterId}.json
 *   environment.json
 *   clusters/_index.json + {slug}/cluster.json + beat files
 *   assets/_manifest.json + subfolders
 */

import {
  serializeBeat,
  serializeBeatFromJSON,
  beatFilename,
  deterministicStringify,
  type SerializedBeat,
} from './BeatSerializer';
import {
  createEmptyManifest,
  serializeManifest,
  parseManifest,
  setManifestEntry,
  getAssetFolder,
  generateUniqueFilename,
  type DirectoryAssetManifest,
  type AssetManifestEntry,
} from './AssetManifest';
import type { Beat } from '../beats/Beat';
import type { Story } from '../engine/Story';
import type { Cluster, ContainerBeatPosition } from '../types';

// ============================================================================
// Types
// ============================================================================

const DIR_FORMAT_VERSION = '1.0';

/** Represents a file to write in the directory structure */
export interface DirectoryFile {
  /** Relative path from project root (e.g., "clusters/forest/dialogTree_beat_5.json") */
  path: string;
  /** File content as string (JSON) or Buffer (binary assets) */
  content: string;
}

/** Represents a binary asset file */
export interface DirectoryAssetFile {
  /** Relative path from project root */
  path: string;
  /** The asset ID this file represents */
  assetId: string;
  /** The original filename */
  filename: string;
}

/** Project metadata stored in project.json */
export interface DirectoryProjectMeta {
  _format: string;
  id: string;
  name: string;
  description?: string;
  firstBeatId: string;
  statePresets?: any[];
  createdAt: string;
  modifiedAt: string;
  version: string;
}

/** Result of serializing a project to directory format */
export interface SerializeResult {
  /** JSON files to write */
  files: DirectoryFile[];
  /** Asset files that need to be copied (binary) */
  assetFiles: DirectoryAssetFile[];
  /** The asset manifest */
  manifest: DirectoryAssetManifest;
}

/** Input data for serialization (combines Project + Story data) */
export interface SerializeInput {
  /** Project metadata */
  project: {
    id: string;
    name: string;
    description?: string;
    createdAt: Date | string;
    modifiedAt: Date | string;
    version: string;
    settings?: any;
    globalSettings?: any;
    themeId?: string;
    themeOverrides?: any;
  };
  /** Story instance or serialized story data */
  story: Story | SerializedStoryData;
  /** Asset information for building the manifest */
  assets?: Array<{
    id: string;
    filename: string;
    type: string;
    mimeType: string;
    size: number;
    uploadedAt?: Date | string;
    metadata?: Record<string, any>;
    context?: string; // 'background', 'character', 'prop', etc.
  }>;
}

/** Serialized story data (when story is already a plain object) */
export interface SerializedStoryData {
  metadata: any;
  beats: any[];
  settings?: any;
  environment?: { props: any[]; nodes: any[] };
  characters?: any[];
  clusters?: Cluster[];
  containerBeatPositions?: ContainerBeatPosition[];
}

/** Result of reading a directory project */
export interface DeserializeResult {
  project: DirectoryProjectMeta;
  settings: any;
  globalSettings?: any;
  themeId?: string;
  themeOverrides?: any;
  beats: SerializedBeat[];
  clusters: Cluster[];
  containerBeatPositions: ContainerBeatPosition[];
  characters: any[];
  environment: { props: any[]; nodes: any[] };
  manifest: DirectoryAssetManifest;
  storyMetadata: any;
}

// ============================================================================
// Serialization (Story -> Directory Files)
// ============================================================================

/**
 * Serialize a project into a list of files for directory-based storage.
 * Does NOT perform I/O - returns file paths and contents to write.
 */
export function serializeToDirectory(input: SerializeInput): SerializeResult {
  const files: DirectoryFile[] = [];
  const assetFiles: DirectoryAssetFile[] = [];

  // Extract story data
  const storyData = extractStoryData(input.story);

  // 1. .asaps/format.json
  files.push({
    path: '.asaps/format.json',
    content: deterministicStringify({
      version: DIR_FORMAT_VERSION,
      type: 'directory',
    }),
  });

  // 2. project.json
  const projectMeta: DirectoryProjectMeta = {
    _format: DIR_FORMAT_VERSION,
    id: input.project.id,
    name: input.project.name,
    ...(input.project.description ? { description: input.project.description } : {}),
    firstBeatId: storyData.metadata?.firstBeatId || '0',
    ...(storyData.metadata?.statePresets ? { statePresets: storyData.metadata.statePresets } : {}),
    createdAt: toISOString(input.project.createdAt),
    modifiedAt: toISOString(input.project.modifiedAt),
    version: input.project.version,
  };
  files.push({
    path: 'project.json',
    content: deterministicStringify(projectMeta),
  });

  // 3. settings.json (combines basic settings + globalSettings)
  const settingsData: any = {
    _format: DIR_FORMAT_VERSION,
  };
  if (input.project.settings) {
    settingsData.projectSettings = input.project.settings;
  }
  if (input.project.globalSettings) {
    // Strip blob: URLs from sound settings — assetId is the canonical reference
    const gs = { ...input.project.globalSettings };
    if (gs.sound && typeof gs.sound === 'object') {
      gs.sound = { ...gs.sound };
      if (typeof gs.sound.backgroundMusic === 'string' && gs.sound.backgroundMusic.startsWith('blob:')) {
        gs.sound.backgroundMusic = '';
      }
    }
    settingsData.globalSettings = gs;
  }
  files.push({
    path: 'settings.json',
    content: deterministicStringify(settingsData),
  });

  // 4. theme.json (if theme is configured)
  if (input.project.themeId || input.project.themeOverrides) {
    files.push({
      path: 'theme.json',
      content: deterministicStringify({
        _format: DIR_FORMAT_VERSION,
        themeId: input.project.themeId || null,
        overrides: input.project.themeOverrides || null,
      }),
    });
  }

  // 5. characters/
  const characters = storyData.characters || [];
  if (characters.length > 0) {
    files.push({
      path: 'characters/_index.json',
      content: deterministicStringify({
        _format: DIR_FORMAT_VERSION,
        characterIds: characters.map((c: any) => c.id || c.name),
      }),
    });

    for (const character of characters) {
      const charId = sanitizeFilename(character.id || character.name);
      files.push({
        path: `characters/${charId}.json`,
        content: deterministicStringify({
          _format: DIR_FORMAT_VERSION,
          ...sanitizeCharacter(character),
        }),
      });
    }
  }

  // 6. environment.json
  const environment = storyData.environment || { props: [], nodes: [] };
  files.push({
    path: 'environment.json',
    content: deterministicStringify({
      _format: DIR_FORMAT_VERSION,
      props: environment.props || [],
      nodes: environment.nodes || [],
    }),
  });

  // 7. clusters/ and beats
  const clusters = storyData.clusters || [];
  const beats = storyData.beats || [];
  const containerPositions = storyData.containerBeatPositions || [];

  // Build cluster slug map
  const clusterSlugMap = new Map<string, string>();
  for (const cluster of clusters) {
    const slug = clusterSlug(cluster);
    clusterSlugMap.set(cluster.id, slug);
  }

  // Cluster index
  files.push({
    path: 'clusters/_index.json',
    content: deterministicStringify({
      _format: DIR_FORMAT_VERSION,
      clusters: clusters.map((c: Cluster) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        slug: clusterSlugMap.get(c.id),
      })),
      containerBeatPositions: containerPositions,
    }),
  });

  // Cluster settings files
  for (const cluster of clusters) {
    const slug = clusterSlugMap.get(cluster.id)!;
    const clusterData = { ...cluster };
    files.push({
      path: `clusters/${slug}/cluster.json`,
      content: deterministicStringify({
        _format: DIR_FORMAT_VERSION,
        ...clusterData,
      }),
    });
  }

  // Beat files - group by cluster
  for (const beat of beats) {
    const serialized = serializeBeatData(beat);
    const filename = beatFilename(serialized);
    const clusterId = beat.cluster || serialized.cluster;

    let dir: string;
    if (clusterId && clusterSlugMap.has(clusterId)) {
      dir = `clusters/${clusterSlugMap.get(clusterId)}`;
    } else {
      dir = 'clusters/_unclustered';
    }

    files.push({
      path: `${dir}/${filename}`,
      content: deterministicStringify(serialized),
    });
  }

  // 8. Asset manifest — only write when assets are provided.
  //    When no assets are passed (e.g. incremental auto-save where assets
  //    haven't changed) the existing manifest on disk is preserved.
  let manifest = createEmptyManifest();
  if (input.assets && input.assets.length > 0) {
    const existingNames = new Set<string>();

    for (const asset of input.assets) {
      const folder = getAssetFolder(asset.type, asset.context);
      const uniqueFilename = generateUniqueFilename(asset.filename, existingNames);
      existingNames.add(uniqueFilename);

      const entry: AssetManifestEntry = {
        id: asset.id,
        filename: uniqueFilename,
        type: asset.type as AssetManifestEntry['type'],
        mimeType: asset.mimeType,
        size: asset.size,
        folder,
        ...(asset.uploadedAt ? { uploadedAt: toISOString(asset.uploadedAt) } : {}),
        ...(asset.metadata ? { metadata: asset.metadata } : {}),
      };

      setManifestEntry(manifest, entry);
      assetFiles.push({
        path: `assets/${folder}/${uniqueFilename}`,
        assetId: asset.id,
        filename: uniqueFilename,
      });
    }

    files.push({
      path: 'assets/_manifest.json',
      content: serializeManifest(manifest),
    });
  }

  // 9. VCS helper files
  files.push({
    path: '.gitattributes',
    content: `# Auto-generated by ASAPS Builder
*.json text eol=lf
assets/**/* filter=lfs diff=lfs merge=lfs -text
`,
  });

  files.push({
    path: '.gitignore',
    content: `# Auto-generated by ASAPS Builder
*.tmp
.asaps/cache/

# OS-generated files
.DS_Store
Thumbs.db
Desktop.ini
`,
  });

  files.push({
    path: '.p4ignore',
    content: `# Auto-generated by ASAPS Builder
.git/
node_modules/
*.tmp
`,
  });

  return { files, assetFiles, manifest };
}

// ============================================================================
// Deserialization (Directory Files -> Story Data)
// ============================================================================

/**
 * FileReader abstraction for reading directory files.
 * Allows both Electron IPC and Node.js filesystem implementations.
 */
export interface DirectoryReader {
  /** Read a text file and return its contents */
  readText(path: string): Promise<string>;
  /** Check if a file/directory exists */
  exists(path: string): Promise<boolean>;
  /** List files in a directory (non-recursive), return names only */
  listDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
}

/**
 * Deserialize a directory-based project.
 * Reads all JSON files and reconstructs the project data.
 */
export async function deserializeFromDirectory(
  rootPath: string,
  reader: DirectoryReader
): Promise<DeserializeResult> {
  // Use platform-aware separator: if rootPath contains backslashes (Windows), use \
  const isWin = rootPath.includes('\\');
  const join = (...parts: string[]) => {
    const combined = parts.join('/');
    return isWin ? combined.replace(/\//g, '\\') : combined;
  };

  // 1. Verify format
  const formatPath = join(rootPath, '.asaps/format.json');
  if (await reader.exists(formatPath)) {
    const formatData = JSON.parse(await reader.readText(formatPath));
    if (formatData.type !== 'directory') {
      throw new Error(`Unsupported project format type: ${formatData.type}`);
    }
  }

  // 2. Read project.json
  const projectJson = await reader.readText(join(rootPath, 'project.json'));
  const project: DirectoryProjectMeta = JSON.parse(projectJson);

  // 3. Read settings.json
  let settings: any = {};
  let globalSettings: any = undefined;
  const settingsPath = join(rootPath, 'settings.json');
  if (await reader.exists(settingsPath)) {
    const settingsData = JSON.parse(await reader.readText(settingsPath));
    settings = settingsData.projectSettings || {};
    globalSettings = settingsData.globalSettings;
  }

  // 4. Read theme.json
  let themeId: string | undefined;
  let themeOverrides: any;
  const themePath = join(rootPath, 'theme.json');
  if (await reader.exists(themePath)) {
    const themeData = JSON.parse(await reader.readText(themePath));
    themeId = themeData.themeId || undefined;
    themeOverrides = themeData.overrides || undefined;
  }

  // 5. Read characters
  const characters: any[] = [];
  const charsPath = join(rootPath, 'characters');
  if (await reader.exists(charsPath)) {
    const charIndexPath = join(charsPath, '_index.json');
    if (await reader.exists(charIndexPath)) {
      const charIndex = JSON.parse(await reader.readText(charIndexPath));
      for (const charId of charIndex.characterIds || []) {
        const charFile = join(charsPath, `${sanitizeFilename(charId)}.json`);
        if (await reader.exists(charFile)) {
          const charData = JSON.parse(await reader.readText(charFile));
          // Strip _format field from character data
          const { _format, ...charContent } = charData;
          characters.push(charContent);
        }
      }
    }
  }

  // 6. Read environment.json
  let environment = { props: [] as any[], nodes: [] as any[] };
  const envPath = join(rootPath, 'environment.json');
  if (await reader.exists(envPath)) {
    const envData = JSON.parse(await reader.readText(envPath));
    environment = {
      props: envData.props || [],
      nodes: envData.nodes || [],
    };
  }

  // 7. Read clusters and beats
  const clusters: Cluster[] = [];
  const beats: SerializedBeat[] = [];
  let containerBeatPositions: ContainerBeatPosition[] = [];

  const clustersPath = join(rootPath, 'clusters');
  if (await reader.exists(clustersPath)) {
    // Read cluster index
    const clusterIndexPath = join(clustersPath, '_index.json');
    if (await reader.exists(clusterIndexPath)) {
      const clusterIndex = JSON.parse(await reader.readText(clusterIndexPath));
      containerBeatPositions = clusterIndex.containerBeatPositions || [];

      // Read each cluster
      for (const clusterInfo of clusterIndex.clusters || []) {
        const slug = clusterInfo.slug || sanitizeFilename(clusterInfo.name);
        const clusterDir = join(clustersPath, slug);
        const clusterFile = join(clusterDir, 'cluster.json');

        if (await reader.exists(clusterFile)) {
          const clusterData = JSON.parse(await reader.readText(clusterFile));
          const { _format, ...clusterContent } = clusterData;
          clusters.push(clusterContent as Cluster);
        }

        // Read beat files in this cluster directory
        if (await reader.exists(clusterDir)) {
          const clusterFiles = await reader.listDir(clusterDir);
          for (const file of clusterFiles) {
            if (!file.isDirectory && file.name.endsWith('.json') && file.name !== 'cluster.json') {
              const beatJson = await reader.readText(join(clusterDir, file.name));
              const beatData = JSON.parse(beatJson);
              const { _format, ...beatContent } = beatData;
              beats.push(beatContent as SerializedBeat);
            }
          }
        }
      }
    }

    // Read unclustered beats
    const unclusteredDir = join(clustersPath, '_unclustered');
    if (await reader.exists(unclusteredDir)) {
      const unclusteredFiles = await reader.listDir(unclusteredDir);
      for (const file of unclusteredFiles) {
        if (!file.isDirectory && file.name.endsWith('.json')) {
          const beatJson = await reader.readText(join(unclusteredDir, file.name));
          const beatData = JSON.parse(beatJson);
          const { _format, ...beatContent } = beatData;
          beats.push(beatContent as SerializedBeat);
        }
      }
    }
  }

  // 8. Read asset manifest
  let manifest = createEmptyManifest();
  const manifestPath = join(rootPath, 'assets/_manifest.json');
  if (await reader.exists(manifestPath)) {
    manifest = parseManifest(await reader.readText(manifestPath));
  }

  // Build story metadata
  const storyMetadata: any = {
    firstBeatId: project.firstBeatId,
    title: project.name,
    ...(project.statePresets ? { statePresets: project.statePresets } : {}),
    clusters: clusters.length > 0 ? clusters : undefined,
  };

  return {
    project,
    settings,
    globalSettings,
    themeId,
    themeOverrides,
    beats,
    clusters,
    containerBeatPositions,
    characters,
    environment,
    manifest,
    storyMetadata,
  };
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if a given path is a directory-format ASAPS project.
 * Looks for .asaps/format.json or project.json at the root.
 */
export async function isDirectoryProject(
  rootPath: string,
  reader: DirectoryReader
): Promise<boolean> {
  // Use platform-aware separator: if rootPath contains backslashes (Windows), use \
  const isWin = rootPath.includes('\\');
  const join = (...parts: string[]) => {
    const combined = parts.join('/');
    return isWin ? combined.replace(/\//g, '\\') : combined;
  };

  // Primary check: .asaps/format.json
  if (await reader.exists(join(rootPath, '.asaps/format.json'))) {
    try {
      const formatData = JSON.parse(await reader.readText(join(rootPath, '.asaps/format.json')));
      return formatData.type === 'directory';
    } catch {
      return false;
    }
  }

  // Fallback check: project.json + clusters/ directory
  if (
    await reader.exists(join(rootPath, 'project.json')) &&
    await reader.exists(join(rootPath, 'clusters'))
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Helper to check if a URL is non-portable (blob: or data:)
 */
function isNonPortableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('data:');
}

/**
 * Sanitize character data for directory-based storage.
 * Strips non-portable URLs (blob: and data:) while preserving asset IDs
 * so images can be reconstructed on reload.
 */
function sanitizeCharacter(character: any): any {
  const sanitized = JSON.parse(JSON.stringify(character));

  if (sanitized.visual) {
    // Strip non-portable defaultImage (keep defaultAssetId)
    if (isNonPortableUrl(sanitized.visual.defaultImage)) {
      delete sanitized.visual.defaultImage;
    }

    // Strip non-portable spriteSheet URL (keep assetId)
    if (sanitized.visual.spriteSheet && isNonPortableUrl(sanitized.visual.spriteSheet.url)) {
      sanitized.visual.spriteSheet.url = '';
    }
  }

  // Strip non-portable state images (keep assetId)
  if (sanitized.states && Array.isArray(sanitized.states)) {
    for (const state of sanitized.states) {
      if (state.visual && isNonPortableUrl(state.visual.image)) {
        delete state.visual.image;
      }
    }
  }

  // Strip non-portable inventory icons (keep assetId)
  if (sanitized.inventory && Array.isArray(sanitized.inventory)) {
    for (const item of sanitized.inventory) {
      if (isNonPortableUrl(item.icon)) {
        item.icon = '';
      }
    }
  }

  return sanitized;
}

/**
 * Extract story data from either a Story instance or serialized data
 */
function extractStoryData(story: Story | SerializedStoryData): SerializedStoryData {
  // Check if it's a Story class instance
  if (typeof (story as any).getAllBeats === 'function') {
    const s = story as Story;
    return {
      metadata: s.getMetadata(),
      beats: s.getAllBeats().map((b: Beat) => b.toJSON()),
      settings: s.getSettings(),
      environment: s.getEnvironment(),
      characters: s.getCharacters(),
      clusters: s.getClusters(),
      containerBeatPositions: s.getContainerBeatPositions(),
    };
  }
  return story as SerializedStoryData;
}

/**
 * Serialize beat data from either a Beat instance JSON or raw data
 */
function serializeBeatData(beat: any): SerializedBeat {
  if (typeof beat.toJSON === 'function') {
    return serializeBeat(beat);
  }
  return serializeBeatFromJSON(beat);
}

/**
 * Generate a filesystem-safe slug from a cluster
 */
function clusterSlug(cluster: Cluster): string {
  const base = cluster.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `cluster-${cluster.id}`;
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Convert Date or string to ISO string
 */
function toISOString(date: Date | string): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return typeof date === 'string' ? date : new Date().toISOString();
}
