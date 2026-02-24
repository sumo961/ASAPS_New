/**
 * VCSStatusProvider - React context for VCS state
 *
 * Provides VCS information to the UI: branch name, changed files,
 * conflict status, and VCS type (Git/Perforce/none).
 *
 * Only active for directory-format projects in Electron.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { detectVCS, type VCSType } from './VCSDetector';
import {
  getGitStatus, getChangedFiles,
  gitInit, gitAddRemote,
  gitStage, gitUnstage, gitCommit, gitPush, gitForcePush, gitPull, gitFetch,
  gitStash, gitStashPop, gitRevertFiles, gitGetConflicts,
  gitDetectMergeState, gitConfigGet,
  gitResetHard, gitClean, gitResetHardAndClean,
  type GitFileStatus, type GitOperationResult,
} from './GitAdapter';
import {
  readRemoteLocks, acquireLock, releaseLock, releaseAllLocks,
  getRemoteLocksForOthers,
  type EditingLock,
} from './EditingLocks';
import {
  getP4Status, getP4Locks,
  p4Submit, p4Sync, p4Edit, p4Revert, p4Lock, p4Unlock,
  type P4OperationResult,
} from './PerforceAdapter';

// ============================================================================
// Types
// ============================================================================

export type BeatVCSStatus = 'added' | 'modified' | 'deleted' | 'conflict' | 'locked' | 'editing' | 'unchanged';

/** Event emitted after VCS operations for toast notifications */
export interface VCSEvent {
  type: 'success' | 'error' | 'info';
  message: string;
}

/** Persistent log entry for VCS operations */
export interface VCSLogEntry {
  id: number;
  timestamp: number;
  type: VCSEvent['type'];
  message: string;
}

/** Check if a git error message indicates a push rejection (remote has newer commits) */
export function isPushRejected(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('rejected') || lower.includes('fetch first') || lower.includes('non-fast-forward');
}

export interface VCSState {
  /** Whether VCS detection is complete */
  initialized: boolean;
  /** Detected VCS type */
  type: VCSType;
  /** True when git binary is not found on the system */
  gitNotInstalled: boolean;
  /** Current branch name */
  branch: string | null;
  /** Set of file paths that have been modified since last commit */
  changedFiles: Set<string>;
  /** Number of changed files */
  changedFileCount: number;
  /** Commits ahead of remote (Git) */
  ahead: number;
  /** Commits behind remote (Git) */
  behind: number;
  /** Whether there are any uncommitted changes */
  isDirty: boolean;
  /** Perforce-specific: files currently checked out */
  p4OpenedFiles: string[];
  /** Files with detected conflicts */
  conflictFiles: Set<string>;
  /** Project directory path */
  projectPath: string | null;
  /** Staged files (Git) */
  stagedFiles: GitFileStatus[];
  /** Unstaged/untracked files (Git) */
  unstagedFiles: GitFileStatus[];
  /** Perforce lock map: depotPath -> user@workspace */
  p4Locks: Map<string, string>;
  /** Persistent log of VCS operation messages */
  messageLog: VCSLogEntry[];
  /** Whether repo is currently mid-merge or mid-rebase */
  mergeState: 'merge' | 'rebase' | null;
  /** Remote editing locks from other users (beatId → lock) */
  editingLocks: Map<string, EditingLock>;
}

export interface VCSContextValue extends VCSState {
  /** Refresh VCS status (re-query git/p4) */
  refresh: () => Promise<void>;
  /** Check if a specific file path has been modified */
  isFileChanged: (relativePath: string) => boolean;
  /** Check if a beat file has been modified, given its beat ID */
  isBeatChanged: (beatId: string) => boolean;
  /** Get the VCS status for a beat */
  getBeatStatus: (beatId: string) => BeatVCSStatus;
  /** Get who has a beat locked (Perforce only) */
  getLockedBy: (beatId: string) => string | null;
  /** Initialize VCS tracking for a project directory */
  initialize: (projectPath: string) => Promise<void>;
  /** Clear VCS state (when closing project or switching to non-directory format) */
  clear: () => void;
  /** Initialize a new Git repository and optionally add a remote */
  initRepo: (remoteUrl?: string) => Promise<GitOperationResult>;

  // --- Git Operations ---
  /** Stage files */
  stage: (filePaths: string[]) => Promise<GitOperationResult>;
  /** Unstage files */
  unstage: (filePaths: string[]) => Promise<GitOperationResult>;
  /** Commit staged changes */
  commit: (message: string) => Promise<GitOperationResult>;
  /** Push to remote */
  push: () => Promise<GitOperationResult>;
  /** Force-push to remote (overwrites remote history) */
  forcePush: () => Promise<GitOperationResult>;
  /** Pull from remote */
  pull: (rebase?: boolean) => Promise<GitOperationResult>;
  /** Fetch from remote */
  fetch: () => Promise<GitOperationResult>;
  /** Stash changes */
  stash: (message?: string) => Promise<GitOperationResult>;
  /** Pop stash */
  stashPop: () => Promise<GitOperationResult>;
  /** Revert files to last committed state */
  revertFiles: (filePaths: string[]) => Promise<GitOperationResult>;
  /** Hard-reset to a specific commit */
  resetHard: (commitHash: string) => Promise<GitOperationResult>;
  /** Remove untracked files (specific paths or all) */
  cleanUntrackedFiles: (filePaths?: string[]) => Promise<GitOperationResult>;
  /** Reset to a commit and clean all untracked files */
  resetHardAndClean: (commitHash: string) => Promise<GitOperationResult>;

  // --- Perforce Operations ---
  /** Submit changelist (P4) */
  p4SubmitChanges: (description: string, filePaths?: string[]) => Promise<P4OperationResult>;
  /** Sync to latest (P4) */
  p4SyncLatest: () => Promise<P4OperationResult>;
  /** Check out file for editing (P4) */
  p4EditFile: (filePath: string) => Promise<boolean>;
  /** Revert file (P4) */
  p4RevertFile: (filePath: string) => Promise<boolean>;
  /** Lock file (P4) */
  p4LockFile: (filePath: string) => Promise<P4OperationResult>;
  /** Unlock file (P4) */
  p4UnlockFile: (filePath: string) => Promise<P4OperationResult>;

  // --- Editing Locks ---
  /** Acquire an advisory editing lock for a beat */
  acquireEditingLock: (beatId: string, beatName: string) => Promise<void>;
  /** Release an advisory editing lock for a beat */
  releaseEditingLock: (beatId: string) => Promise<void>;
  /** Release all advisory editing locks owned by this user */
  releaseAllEditingLocks: () => Promise<void>;

  // --- Event system ---
  /** Subscribe to VCS events (for toasts). Returns unsubscribe fn. */
  onEvent: (handler: (event: VCSEvent) => void) => () => void;
  /** Clear the persistent message log */
  clearMessageLog: () => void;
}

const defaultState: VCSState = {
  initialized: false,
  type: 'none',
  gitNotInstalled: false,
  branch: null,
  changedFiles: new Set(),
  changedFileCount: 0,
  ahead: 0,
  behind: 0,
  isDirty: false,
  p4OpenedFiles: [],
  conflictFiles: new Set(),
  projectPath: null,
  stagedFiles: [],
  unstagedFiles: [],
  p4Locks: new Map(),
  messageLog: [],
  mergeState: null,
  editingLocks: new Map(),
};

const VCSContext = createContext<VCSContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

/** Refresh interval for VCS status polling (ms) */
const POLL_INTERVAL = 30000;

interface VCSProviderProps {
  children: ReactNode;
  /** Optional callback to flush pending saves before VCS refresh */
  onBeforeRefresh?: () => Promise<void>;
}

export const VCSStatusProvider: React.FC<VCSProviderProps> = ({ children, onBeforeRefresh }) => {
  const [state, setState] = useState<VCSState>(defaultState);
  const pollTimerRef = useRef<number | null>(null);
  const projectPathRef = useRef<string | null>(null);
  /** Cached VCS type — only re-detect when path changes */
  const cachedVCSTypeRef = useRef<VCSType | null>(null);
  /** Whether git binary was not found during detection */
  const gitMissingRef = useRef(false);
  /** Guard against re-entrant initialize() calls */
  const initializingRef = useRef(false);
  const eventHandlersRef = useRef<Set<(event: VCSEvent) => void>>(new Set());
  const localUserNameRef = useRef<string | null>(null);
  const logIdRef = useRef(0);
  /** Suppress "behind" count after git reset (cleared on next fetch) */
  const suppressBehindRef = useRef(false);
  const onBeforeRefreshRef = useRef(onBeforeRefresh);
  onBeforeRefreshRef.current = onBeforeRefresh;

  const emitEvent = useCallback((event: VCSEvent) => {
    // Append to persistent message log (capped at 50 entries, newest first)
    const entry: VCSLogEntry = {
      id: ++logIdRef.current,
      timestamp: Date.now(),
      type: event.type,
      message: event.message,
    };
    setState(prev => ({
      ...prev,
      messageLog: [entry, ...prev.messageLog].slice(0, 50),
    }));

    for (const handler of eventHandlersRef.current) {
      try { handler(event); } catch { /* ignore handler errors */ }
    }
  }, []);

  const clearMessageLog = useCallback(() => {
    setState(prev => ({ ...prev, messageLog: [] }));
  }, []);

  const onEvent = useCallback((handler: (event: VCSEvent) => void) => {
    eventHandlersRef.current.add(handler);
    return () => { eventHandlersRef.current.delete(handler); };
  }, []);

  /**
   * Refresh VCS status from disk.
   * Flushes pending in-memory saves first so Git sees the latest edits.
   */
  const refresh = useCallback(async () => {
    const path = projectPathRef.current;
    if (!path) return;

    // Flush pending saves so files on disk reflect latest edits
    if (onBeforeRefreshRef.current) {
      try { await onBeforeRefreshRef.current(); } catch { /* ok — untitled projects may throw */ }
    }

    try {
      // Use cached VCS type if available; only detect on first refresh
      let vcsType = cachedVCSTypeRef.current;
      if (!vcsType) {
        const vcsInfo = await detectVCS(path);
        vcsType = vcsInfo.type;
        cachedVCSTypeRef.current = vcsType;
        gitMissingRef.current = !!vcsInfo.gitMissing;
      }

      if (vcsType === 'git') {
        // Run git queries in parallel to minimize IPC round-trips
        const [status, changed, conflicts, mergeState] = await Promise.all([
          getGitStatus(path),
          getChangedFiles(path),
          gitGetConflicts(path),
          gitDetectMergeState(path),
        ]);

        // Fetch remote editing locks (non-blocking — don't fail refresh on error)
        let editingLocks = new Map<string, EditingLock>();
        if (status.branch && status.branch !== 'unknown' && localUserNameRef.current) {
          try {
            const remoteLockFile = await readRemoteLocks(path, status.branch);
            editingLocks = getRemoteLocksForOthers(remoteLockFile, localUserNameRef.current);
          } catch {
            // Ignore — remote may not exist yet
          }
        }

        // Separate staged and unstaged files
        const stagedFiles = status.files.filter(f => f.staged);
        const unstagedFiles = status.files.filter(f => !f.staged);

        setState(prev => ({
          ...prev,
          type: 'git',
          branch: status.branch,
          changedFiles: new Set(changed),
          changedFileCount: status.files.length,
          ahead: status.ahead,
          behind: suppressBehindRef.current ? 0 : status.behind,
          isDirty: status.isDirty,
          conflictFiles: new Set(conflicts),
          stagedFiles,
          unstagedFiles,
          mergeState,
          editingLocks,
        }));
      } else if (vcsType === 'perforce') {
        const status = await getP4Status(path);
        let locks = new Map<string, string>();
        try {
          locks = await getP4Locks(path);
        } catch { /* ignore lock fetch failure */ }

        setState(prev => ({
          ...prev,
          type: 'perforce',
          branch: status.clientName,
          p4OpenedFiles: status.openedFiles.map(f => f.depotFile),
          isDirty: status.openedFiles.length > 0,
          changedFileCount: status.openedFiles.length,
          p4Locks: locks,
        }));
      } else {
        setState(prev => ({
          ...prev,
          type: 'none',
          gitNotInstalled: gitMissingRef.current,
          branch: null,
          changedFiles: new Set(),
          changedFileCount: 0,
          isDirty: false,
          stagedFiles: [],
          unstagedFiles: [],
        }));
      }
    } catch (error) {
      console.error('[VCSStatusProvider] Refresh failed:', error);
    }
  }, []);

  /**
   * Initialize VCS tracking for a directory project
   */
  const initialize = useCallback(async (projectPath: string) => {
    // Prevent re-entrant calls — initialize sets state which can re-trigger
    // the auto-init effect before the async work completes.
    if (initializingRef.current) return;
    initializingRef.current = true;

    try {
      // Reset cached VCS type when switching projects
      cachedVCSTypeRef.current = null;
      gitMissingRef.current = false;
      projectPathRef.current = projectPath;

      // Cache git user.name for editing lock identity
      try {
        localUserNameRef.current = await gitConfigGet(projectPath, 'user.name');
      } catch {
        localUserNameRef.current = null;
      }

      setState(prev => ({
        ...prev,
        projectPath,
      }));

      await refresh();

      setState(prev => ({
        ...prev,
        initialized: true,
      }));

      // Start polling
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
      pollTimerRef.current = window.setInterval(refresh, POLL_INTERVAL);
    } finally {
      initializingRef.current = false;
    }
  }, [refresh]);

  /**
   * Clear VCS state
   */
  const clear = useCallback(() => {
    projectPathRef.current = null;
    cachedVCSTypeRef.current = null;
    gitMissingRef.current = false;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setState(defaultState);
  }, []);

  /**
   * Check if a file path is in the changed set
   */
  const isFileChanged = useCallback((relativePath: string): boolean => {
    return state.changedFiles.has(relativePath);
  }, [state.changedFiles]);

  /**
   * Find the file path matching a beat ID from the changed/staged/unstaged files
   */
  const findBeatFile = useCallback((beatId: string): string | null => {
    const allFiles = [
      ...state.stagedFiles.map(f => f.path),
      ...state.unstagedFiles.map(f => f.path),
      ...state.changedFiles,
    ];
    const safeBeatId = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    for (const file of allFiles) {
      if (file.includes(`_${beatId}.json`) || file.includes(`_${safeBeatId}.json`)) {
        return file;
      }
    }
    return null;
  }, [state.stagedFiles, state.unstagedFiles, state.changedFiles]);

  /**
   * Check if a beat has been modified (by checking for beat filename patterns)
   */
  const isBeatChanged = useCallback((beatId: string): boolean => {
    return findBeatFile(beatId) !== null;
  }, [findBeatFile]);

  /**
   * Get detailed VCS status for a beat
   */
  const getBeatStatus = useCallback((beatId: string): BeatVCSStatus => {
    const safeBeatId = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Check conflicts first
    for (const file of state.conflictFiles) {
      if (file.includes(`_${beatId}.json`) || file.includes(`_${safeBeatId}.json`)) {
        return 'conflict';
      }
    }

    // Check Perforce locks
    if (state.type === 'perforce') {
      for (const [depotPath] of state.p4Locks) {
        if (depotPath.includes(`_${beatId}.json`) || depotPath.includes(`_${safeBeatId}.json`)) {
          return 'locked';
        }
      }
    }

    // Check advisory editing locks from other users
    if (state.editingLocks.has(beatId)) {
      return 'editing';
    }

    // Check staged/unstaged files for specific status
    const allFiles = [...state.stagedFiles, ...state.unstagedFiles];
    for (const file of allFiles) {
      if (file.path.includes(`_${beatId}.json`) || file.path.includes(`_${safeBeatId}.json`)) {
        if (file.status === 'A' || file.status === '?') return 'added';
        if (file.status === 'D') return 'deleted';
        return 'modified';
      }
    }

    return 'unchanged';
  }, [state.conflictFiles, state.stagedFiles, state.unstagedFiles, state.p4Locks, state.type, state.editingLocks]);

  /**
   * Get who has a beat locked (Perforce only)
   */
  const getLockedBy = useCallback((beatId: string): string | null => {
    // Check advisory editing locks first (works for both git and perforce)
    const editingLock = state.editingLocks.get(beatId);
    if (editingLock) return editingLock.user;

    if (state.type !== 'perforce') return null;
    const safeBeatId = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    for (const [depotPath, user] of state.p4Locks) {
      if (depotPath.includes(`_${beatId}.json`) || depotPath.includes(`_${safeBeatId}.json`)) {
        return user;
      }
    }
    return null;
  }, [state.type, state.p4Locks, state.editingLocks]);

  // ---- Git operation wrappers (delegate + refresh + emit) ----

  const requirePath = () => {
    const path = projectPathRef.current;
    if (!path) throw new Error('No project path set');
    return path;
  };

  const initRepo = useCallback(async (remoteUrl?: string) => {
    const path = requirePath();
    const result = await gitInit(path);
    if (!result.success) {
      emitEvent({ type: 'error', message: result.message });
      return result;
    }
    if (remoteUrl) {
      const remoteResult = await gitAddRemote(path, 'origin', remoteUrl);
      if (!remoteResult.success) {
        emitEvent({ type: 'error', message: remoteResult.message });
        return remoteResult;
      }
    }
    // Re-detect VCS and refresh state now that git is initialized
    await refresh();
    emitEvent({ type: 'success', message: remoteUrl ? 'Initialized Git repository with remote' : 'Initialized Git repository' });
    return result;
  }, [refresh, emitEvent]);

  const stage = useCallback(async (filePaths: string[]) => {
    const result = await gitStage(requirePath(), filePaths);
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    // Delay refresh to avoid rapid re-render cascade that disrupts ReactFlow
    setTimeout(() => refresh(), 150);
    return result;
  }, [refresh, emitEvent]);

  const unstage = useCallback(async (filePaths: string[]) => {
    const result = await gitUnstage(requirePath(), filePaths);
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    setTimeout(() => refresh(), 150);
    return result;
  }, [refresh, emitEvent]);

  const commit = useCallback(async (message: string) => {
    const result = await gitCommit(requirePath(), message);
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    // Delay refresh slightly so the commit result propagates through React
    // before the VCS state update triggers re-renders in the graph editor.
    // Without this delay, rapid state updates can cause ReactFlow to lose nodes.
    setTimeout(() => refresh(), 150);
    return result;
  }, [refresh, emitEvent]);

  const push = useCallback(async () => {
    const result = await gitPush(requirePath());
    if (result.success) suppressBehindRef.current = false;
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const forcePushOp = useCallback(async () => {
    const result = await gitForcePush(requirePath());
    if (result.success) suppressBehindRef.current = false;
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const pull = useCallback(async (rebase = false) => {
    suppressBehindRef.current = false;
    const result = await gitPull(requirePath(), rebase);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const fetchRemote = useCallback(async () => {
    suppressBehindRef.current = false;
    const result = await gitFetch(requirePath());
    await refresh();
    if (result.success) {
      emitEvent({ type: 'success', message: result.message });
    } else {
      emitEvent({ type: 'error', message: result.message });
    }
    return result;
  }, [refresh, emitEvent]);

  const stashChanges = useCallback(async (message?: string) => {
    const result = await gitStash(requirePath(), message);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const stashPopChanges = useCallback(async () => {
    const result = await gitStashPop(requirePath());
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const revertFilesOp = useCallback(async (filePaths: string[]) => {
    const result = await gitRevertFiles(requirePath(), filePaths);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const resetHardOp = useCallback(async (commitHash: string) => {
    const result = await gitResetHard(requirePath(), commitHash);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const cleanUntrackedFilesOp = useCallback(async (filePaths?: string[]) => {
    const result = await gitClean(requirePath(), filePaths);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const resetHardAndCleanOp = useCallback(async (commitHash: string) => {
    const result = await gitResetHardAndClean(requirePath(), commitHash);
    if (result.success) {
      // Suppress "behind" count — after reset, the remote being ahead is
      // expected and not actionable (pulling would undo the reset).
      suppressBehindRef.current = true;
    }
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  // ---- Editing lock wrappers ----

  const acquireEditingLockOp = useCallback(async (beatId: string, beatName: string) => {
    const path = projectPathRef.current;
    const userName = localUserNameRef.current;
    if (!path || !userName || cachedVCSTypeRef.current !== 'git') return;
    try {
      await acquireLock(path, beatId, beatName, userName);
    } catch (e) {
      console.warn('[VCSStatusProvider] Failed to acquire editing lock:', e);
    }
  }, []);

  const releaseEditingLockOp = useCallback(async (beatId: string) => {
    const path = projectPathRef.current;
    const userName = localUserNameRef.current;
    if (!path || !userName || cachedVCSTypeRef.current !== 'git') return;
    try {
      await releaseLock(path, beatId, userName);
    } catch (e) {
      console.warn('[VCSStatusProvider] Failed to release editing lock:', e);
    }
  }, []);

  const releaseAllEditingLocksOp = useCallback(async () => {
    const path = projectPathRef.current;
    const userName = localUserNameRef.current;
    if (!path || !userName || cachedVCSTypeRef.current !== 'git') return;
    try {
      await releaseAllLocks(path, userName);
    } catch (e) {
      console.warn('[VCSStatusProvider] Failed to release all editing locks:', e);
    }
  }, []);

  // ---- Perforce operation wrappers ----

  const p4SubmitChanges = useCallback(async (description: string, filePaths?: string[]) => {
    const result = await p4Submit(requirePath(), description, filePaths);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const p4SyncLatest = useCallback(async () => {
    const result = await p4Sync(requirePath());
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const p4EditFile = useCallback(async (filePath: string) => {
    const result = await p4Edit(filePath, requirePath());
    await refresh();
    emitEvent({ type: result ? 'success' : 'error', message: result ? `Opened ${filePath} for edit` : 'Failed to open for edit' });
    return result;
  }, [refresh, emitEvent]);

  const p4RevertFile = useCallback(async (filePath: string) => {
    const result = await p4Revert(filePath, requirePath());
    await refresh();
    emitEvent({ type: result ? 'success' : 'error', message: result ? `Reverted ${filePath}` : 'Failed to revert' });
    return result;
  }, [refresh, emitEvent]);

  const p4LockFile = useCallback(async (filePath: string) => {
    const result = await p4Lock(requirePath(), filePath);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  const p4UnlockFile = useCallback(async (filePath: string) => {
    const result = await p4Unlock(requirePath(), filePath);
    await refresh();
    emitEvent({ type: result.success ? 'success' : 'error', message: result.message });
    return result;
  }, [refresh, emitEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const value: VCSContextValue = useMemo(() => ({
    ...state,
    refresh,
    isFileChanged,
    isBeatChanged,
    getBeatStatus,
    getLockedBy,
    initialize,
    clear,
    initRepo,
    stage,
    unstage,
    commit,
    push,
    forcePush: forcePushOp,
    pull,
    fetch: fetchRemote,
    stash: stashChanges,
    stashPop: stashPopChanges,
    revertFiles: revertFilesOp,
    resetHard: resetHardOp,
    cleanUntrackedFiles: cleanUntrackedFilesOp,
    resetHardAndClean: resetHardAndCleanOp,
    p4SubmitChanges,
    p4SyncLatest,
    p4EditFile,
    p4RevertFile,
    p4LockFile,
    p4UnlockFile,
    acquireEditingLock: acquireEditingLockOp,
    releaseEditingLock: releaseEditingLockOp,
    releaseAllEditingLocks: releaseAllEditingLocksOp,
    onEvent,
    clearMessageLog,
  }), [
    state, refresh, isFileChanged, isBeatChanged, getBeatStatus, getLockedBy,
    initialize, clear, initRepo, stage, unstage, commit, push, forcePushOp, pull,
    fetchRemote, stashChanges, stashPopChanges, revertFilesOp,
    resetHardOp, cleanUntrackedFilesOp, resetHardAndCleanOp,
    p4SubmitChanges, p4SyncLatest, p4EditFile, p4RevertFile, p4LockFile, p4UnlockFile,
    acquireEditingLockOp, releaseEditingLockOp, releaseAllEditingLocksOp,
    onEvent, clearMessageLog,
  ]);

  return (
    <VCSContext.Provider value={value}>
      {children}
    </VCSContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access VCS status. Returns null if not within a VCSStatusProvider.
 */
export function useVCSStatus(): VCSContextValue | null {
  return useContext(VCSContext);
}

/**
 * Hook that requires VCS status (throws if not in provider).
 * Use this in components that always render within the VCS provider.
 */
export function useRequiredVCSStatus(): VCSContextValue {
  const context = useContext(VCSContext);
  if (!context) {
    throw new Error('useRequiredVCSStatus must be used within a VCSStatusProvider');
  }
  return context;
}
