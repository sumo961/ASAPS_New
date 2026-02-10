/**
 * Persistence module - Directory-based project format support
 *
 * Enables VCS-friendly project storage where each beat is a separate file,
 * organized by cluster, with deterministic JSON serialization.
 */

export {
  // DirectoryFormat
  serializeToDirectory,
  deserializeFromDirectory,
  isDirectoryProject,
  type DirectoryFile,
  type DirectoryAssetFile,
  type DirectoryProjectMeta,
  type SerializeResult,
  type SerializeInput,
  type SerializedStoryData,
  type DeserializeResult,
  type DirectoryReader,
} from './DirectoryFormat';

export {
  // BeatSerializer
  serializeBeat,
  serializeBeatFromJSON,
  beatFilename,
  deterministicStringify,
  type SerializedBeat,
} from './BeatSerializer';

export {
  // AssetManifest
  createEmptyManifest,
  serializeManifest,
  parseManifest,
  setManifestEntry,
  removeManifestEntry,
  getManifestEntry,
  getAssetRelativePath,
  getAssetFolder,
  generateUniqueFilename,
  type DirectoryAssetManifest,
  type AssetManifestEntry,
} from './AssetManifest';
