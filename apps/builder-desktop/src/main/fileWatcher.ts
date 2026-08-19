/**
 * FileWatcher - Chokidar-based file watcher for directory projects
 *
 * Watches a project directory for external changes (e.g., from git pull/sync),
 * debounces events, and emits a consolidated list of changed files.
 */

import chokidar from 'chokidar';
import { relative } from 'path';

/** Debounce delay for change events (ms) */
const DEBOUNCE_MS = 500;

/**
 * Manages file watching for a single project directory.
 */
export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private projectPath: string;
  private pendingChanges = new Set<string>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private onChanges: ((files: string[]) => void) | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Start watching the project directory.
   * @param callback Called with relative paths of changed files (debounced)
   */
  start(callback: (changedFiles: string[]) => void): void {
    if (this.watcher) {
      this.stop();
    }

    this.onChanges = callback;

    this.watcher = chokidar.watch(this.projectPath, {
      persistent: true,
      ignoreInitial: true,
      // Ignore VCS metadata, temp files, and binary assets (large files)
      ignored: [
        /(^|[/\\])\../, // hidden files (but we DO want .asaps/)
        '**/node_modules/**',
        '**/*.tmp',
        // Atomic-write temp files (fs:write-file writes sibling temps and
        // renames over the target) — the temp appearing must not read as an
        // external change.
        '**/*.asaps-tmp-*',
        '.git/**',
        '.p4/**',
        // Don't ignore .asaps/ since format.json is there
      ],
      // Only watch JSON files and the .asaps directory
      depth: 5,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', (filePath: string) => {
      this.handleChange(filePath);
    });

    this.watcher.on('add', (filePath: string) => {
      this.handleChange(filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      this.handleChange(filePath);
    });

    this.watcher.on('error', (error: Error) => {
      console.error('[FileWatcher] Error:', error);
    });

    console.log(`[FileWatcher] Watching: ${this.projectPath}`);
  }

  /**
   * Stop watching and clean up
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.pendingChanges.clear();
    this.onChanges = null;

    console.log(`[FileWatcher] Stopped watching: ${this.projectPath}`);
  }

  /**
   * Handle a single file change event. Debounces and batches changes.
   */
  private handleChange(absolutePath: string): void {
    const relativePath = relative(this.projectPath, absolutePath);

    // Skip non-project files
    if (this.shouldIgnore(relativePath)) {
      return;
    }

    this.pendingChanges.add(relativePath);

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, DEBOUNCE_MS);
  }

  /**
   * Flush pending changes to the callback
   */
  private flush(): void {
    if (this.pendingChanges.size === 0 || !this.onChanges) {
      return;
    }

    const files = Array.from(this.pendingChanges);
    this.pendingChanges.clear();
    this.debounceTimer = null;

    console.log(`[FileWatcher] Detected ${files.length} changed files:`, files);

    // Classify external changes for VCS notifications
    const beatFiles = files.filter(f => f.includes('/') && f.endsWith('.json'));
    if (beatFiles.length > 0) {
      console.log(`[FileWatcher] ${beatFiles.length} beat file(s) changed externally (possible sync)`);
    }

    this.onChanges(files);
  }

  /**
   * Check if a relative path should be ignored
   */
  private shouldIgnore(relativePath: string): boolean {
    // Ignore .git directory contents
    if (relativePath.startsWith('.git/') || relativePath.startsWith('.git\\')) {
      return true;
    }
    // Ignore .p4 files
    if (relativePath.startsWith('.p4')) {
      return true;
    }
    // Ignore temp files
    if (relativePath.endsWith('.tmp')) {
      return true;
    }
    return false;
  }
}

// ============================================================================
// Module-level state for IPC integration
// ============================================================================

let activeWatcher: FileWatcher | null = null;

/**
 * Start watching a project directory.
 * Only one directory can be watched at a time.
 */
export function startWatching(
  projectPath: string,
  callback: (changedFiles: string[]) => void
): void {
  // Stop existing watcher
  if (activeWatcher) {
    activeWatcher.stop();
  }

  activeWatcher = new FileWatcher(projectPath);
  activeWatcher.start(callback);
}

/**
 * Stop the active file watcher
 */
export function stopWatching(): void {
  if (activeWatcher) {
    activeWatcher.stop();
    activeWatcher = null;
  }
}
