/**
 * Three-way merge for .asaps-editing.json.
 *
 * The lock file is tracked by git but rewritten by the app whenever a beat
 * is selected, so it is almost always locally modified. Git refuses to pull,
 * switch branch or merge over a modified tracked file. GitAdapter sets the
 * local copy aside, runs the operation, and calls this to put the local
 * lock changes back on top of whatever the operation brought in.
 *
 * Per beat id: a local change (added, updated or removed relative to the
 * pre-operation commit) wins; everything else comes from the incoming file.
 */

import type { EditingLock, EditingLockFile } from './EditingLocks';

export function parseLockFile(text: string | null | undefined): EditingLockFile | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.v === 1 && parsed.locks && typeof parsed.locks === 'object') {
      return parsed as EditingLockFile;
    }
  } catch {
    // unreadable — treated as absent
  }
  return null;
}

function sameLock(a: EditingLock | undefined, b: EditingLock | undefined): boolean {
  if (!a || !b) return a === b;
  return a.user === b.user && a.since === b.since && a.beat === b.beat;
}

/**
 * @param base     the file as committed before the operation (null if absent)
 * @param local    the working-tree file that was set aside (null if absent)
 * @param incoming the file the operation left behind (null if absent)
 */
export function mergeEditingLocks(
  base: EditingLockFile | null,
  local: EditingLockFile | null,
  incoming: EditingLockFile | null,
): EditingLockFile {
  const baseLocks = base?.locks ?? {};
  const localLocks = local?.locks ?? {};
  const merged: Record<string, EditingLock> = { ...(incoming?.locks ?? {}) };

  const ids = new Set([...Object.keys(baseLocks), ...Object.keys(localLocks)]);
  for (const id of ids) {
    if (sameLock(baseLocks[id], localLocks[id])) continue; // not changed locally
    if (localLocks[id]) merged[id] = localLocks[id];
    else delete merged[id];
  }
  return { v: 1, locks: merged };
}

export function sameLockFile(a: EditingLockFile | null, b: EditingLockFile | null): boolean {
  const al = a?.locks ?? {};
  const bl = b?.locks ?? {};
  const keys = new Set([...Object.keys(al), ...Object.keys(bl)]);
  for (const k of keys) if (!sameLock(al[k], bl[k])) return false;
  return true;
}
