/**
 * EditingLocks - Advisory beat editing locks for Git-based collaboration
 *
 * Tracks which beats are currently being edited by which users via a
 * JSON file (.asaps-editing.json) in the project root. Locks propagate
 * through the normal git commit/push/fetch workflow.
 */

import { gitShowRemoteFile } from './GitAdapter';

export interface EditingLock {
  user: string;
  since: string;     // ISO timestamp
  beat: string;      // Beat display name
}

export interface EditingLockFile {
  v: 1;
  locks: Record<string, EditingLock>;  // keyed by beatId
}

const LOCK_FILENAME = '.asaps-editing.json';
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

function emptyLockFile(): EditingLockFile {
  return { v: 1, locks: {} };
}

/** Join path segments using the separator detected from the base path */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base, ...parts].join(sep);
}

/** Read the local .asaps-editing.json from disk */
export async function readLocalLocks(projectPath: string): Promise<EditingLockFile> {
  const api = window.electronAPI;
  if (!api?.fs?.readFile) return emptyLockFile();

  try {
    const filePath = joinPath(projectPath, LOCK_FILENAME);
    const exists = await api.fs.exists(filePath);
    if (!exists) return emptyLockFile();

    const buffer = await api.fs.readFile(filePath);
    const text = new TextDecoder().decode(buffer);
    const parsed = JSON.parse(text);
    if (parsed && parsed.v === 1 && parsed.locks) return parsed as EditingLockFile;
    return emptyLockFile();
  } catch {
    return emptyLockFile();
  }
}

/** Write the lock file to disk */
export async function writeLocalLocks(projectPath: string, locks: EditingLockFile): Promise<void> {
  const api = window.electronAPI;
  if (!api?.fs?.writeFile) return;

  const filePath = joinPath(projectPath, LOCK_FILENAME);
  await api.fs.writeFile(filePath, JSON.stringify(locks, null, 2) + '\n');
}

/** Read the remote lock file via git show */
export async function readRemoteLocks(projectPath: string, branch: string): Promise<EditingLockFile> {
  try {
    const content = await gitShowRemoteFile(projectPath, branch, LOCK_FILENAME);
    if (!content) return emptyLockFile();
    const parsed = JSON.parse(content);
    if (parsed && parsed.v === 1 && parsed.locks) return parsed as EditingLockFile;
    return emptyLockFile();
  } catch {
    return emptyLockFile();
  }
}

/** Acquire a lock for a beat (add/update in local file) */
export async function acquireLock(
  projectPath: string, beatId: string, beatName: string, userName: string
): Promise<void> {
  const locks = await readLocalLocks(projectPath);
  locks.locks[beatId] = {
    user: userName,
    since: new Date().toISOString(),
    beat: beatName,
  };
  await writeLocalLocks(projectPath, locks);
}

/** Release a specific lock if owned by userName */
export async function releaseLock(
  projectPath: string, beatId: string, userName: string
): Promise<void> {
  const locks = await readLocalLocks(projectPath);
  const existing = locks.locks[beatId];
  if (existing && existing.user === userName) {
    delete locks.locks[beatId];
    await writeLocalLocks(projectPath, locks);
  }
}

/** Release all locks owned by userName */
export async function releaseAllLocks(
  projectPath: string, userName: string
): Promise<void> {
  const locks = await readLocalLocks(projectPath);
  let changed = false;
  for (const [beatId, lock] of Object.entries(locks.locks)) {
    if (lock.user === userName) {
      delete locks.locks[beatId];
      changed = true;
    }
  }
  if (changed) {
    await writeLocalLocks(projectPath, locks);
  }
}

/** Filter remote locks to only include other users' non-stale locks */
export function getRemoteLocksForOthers(
  remoteLocks: EditingLockFile, localUserName: string
): Map<string, EditingLock> {
  const result = new Map<string, EditingLock>();
  const now = Date.now();

  for (const [beatId, lock] of Object.entries(remoteLocks.locks)) {
    // Skip own locks
    if (lock.user === localUserName) continue;
    // Skip stale locks (> 2 hours old)
    const lockTime = new Date(lock.since).getTime();
    if (isNaN(lockTime) || now - lockTime > STALE_THRESHOLD_MS) continue;
    result.set(beatId, lock);
  }

  return result;
}
