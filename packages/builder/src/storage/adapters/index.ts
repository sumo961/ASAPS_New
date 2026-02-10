/**
 * Persistence Adapters - Unified storage backend abstraction
 */

export {
  type PersistenceAdapter,
  type ProjectFormat,
  type FileChangeEvent,
  type FileConflict,
  detectProjectFormat,
} from './PersistenceAdapter';

export { DirectoryAdapter, isElectronWithFS } from './DirectoryAdapter';
export { IndexedDBAdapter } from './IndexedDBAdapter';
export { ZipAdapter } from './ZipAdapter';
