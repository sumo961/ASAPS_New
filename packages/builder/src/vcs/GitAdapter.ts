/**
 * GitAdapter - Git status and diff integration
 *
 * Runs git commands via Electron IPC to show file status,
 * branch info, and changed files for directory-based projects.
 */

import type { EditingLockFile } from './EditingLocks';
import { mergeEditingLocks, parseLockFile, sameLockFile } from './editingLockMerge';
import { onlyStampsDiffer } from '../utils/projectMetaStamps';
import { APP_VERSION, isNewerVersion, newerVersionWarning } from '../utils/appVersion';
import { resolveKeepBoth, fixDuplicateIdsAfterMerge, movedSummary, type KeepBothResult } from './keepBoth';
import { findUndoneMerge, planRestore, applyRestore, type RestorePlan, type RestoreResult } from './undoneMerge';

export interface GitFileStatus {
  /** Relative file path */
  path: string;
  /** Git status code: 'M'odified, 'A'dded, 'D'eleted, '?'untracked, 'R'enamed */
  status: string;
  /** Whether the file is staged */
  staged: boolean;
}

export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Files with changes */
  files: GitFileStatus[];
  /** Number of commits ahead of remote */
  ahead: number;
  /** Number of commits behind remote */
  behind: number;
  /** Whether there are any changes */
  isDirty: boolean;
}

/**
 * Get the full git status for a project directory
 */
export async function getGitStatus(projectPath: string): Promise<GitStatus> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    throw new Error('Git status requires Electron runCommand API');
  }

  // Get branch name
  const branchResult = await api.fs.runCommand(
    'git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath
  );
  const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : 'unknown';

  // Get ahead/behind counts
  let ahead = 0;
  let behind = 0;
  try {
    const revResult = await api.fs.runCommand(
      'git', ['rev-list', '--left-right', '--count', `@{upstream}...HEAD`], projectPath
    );
    if (revResult.exitCode === 0) {
      const parts = revResult.stdout.trim().split(/\s+/);
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }
  } catch {
    // No upstream set, which is fine
  }

  // Get file status (porcelain v1 for machine-readable output)
  const statusResult = await api.fs.runCommand(
    'git', ['status', '--porcelain'], projectPath
  );

  // OS-generated files to hide from the VCS panel
  const OS_IGNORED = new Set(['.DS_Store', 'Thumbs.db', 'Desktop.ini']);

  const files: GitFileStatus[] = [];
  if (statusResult.exitCode === 0 && statusResult.stdout.trim()) {
    // IMPORTANT: Do NOT trim() stdout before splitting — the leading space
    // on lines like " M file.json" is the index-status column (= not staged).
    // Trimming the whole string strips that space from the first line, causing
    // the file path to be parsed one character too late.
    const lines = statusResult.stdout.split('\n');
    for (const line of lines) {
      if (line.length < 4) continue;
      const indexStatus = line[0];
      const workStatus = line[1];
      const path = line.substring(3).trim();

      // Skip OS-generated files (check basename)
      const basename = path.split('/').pop() || path;
      if (OS_IGNORED.has(basename)) continue;

      // Determine if staged or not
      const staged = indexStatus !== ' ' && indexStatus !== '?';
      const status = staged ? indexStatus : workStatus;

      files.push({ path, status, staged });
    }
  }

  return {
    branch,
    files,
    ahead,
    behind,
    isDirty: files.length > 0,
  };
}

/**
 * Get list of files changed since last commit (for beat-level indicators).
 * Falls back to listing all tracked/staged files on repos with no commits.
 */
export async function getChangedFiles(projectPath: string): Promise<string[]> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) return [];

  const result = await api.fs.runCommand(
    'git', ['diff', '--name-only', 'HEAD'], projectPath
  );

  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean);
  }

  // On a fresh repo with no commits, list all files from status instead
  const statusResult = await api.fs.runCommand(
    'git', ['status', '--porcelain'], projectPath
  );
  if (statusResult.exitCode === 0 && statusResult.stdout.trim()) {
    return statusResult.stdout.trim().split('\n')
      .map(line => line.substring(3).trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Get files changed between two commits (useful for merge conflict detection)
 */
export async function getChangedFilesBetween(
  projectPath: string,
  fromRef: string,
  toRef: string
): Promise<string[]> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) return [];

  const result = await api.fs.runCommand(
    'git', ['diff', '--name-only', fromRef, toRef], projectPath
  );

  if (result.exitCode !== 0) return [];

  return result.stdout.trim().split('\n').filter(Boolean);
}

// ============================================================================
// Git Operations
// ============================================================================

/** Result of a git operation */
export interface GitOperationResult {
  success: boolean;
  message: string;
}

/** A parsed git log entry */
export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
}

/** A parsed git branch entry */
export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

/** A parsed git stash entry */
export interface GitStashEntry {
  index: number;
  message: string;
  branch: string;
}

function getRunCommand() {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    throw new Error('Git operations require Electron runCommand API');
  }
  return api.fs.runCommand;
}

/**
 * Remove a stale .git/index.lock file if it exists.
 * This can be left behind when a git operation is interrupted
 * (e.g. by app close) or when VCS polling collides with a user action.
 */
async function removeStaleIndexLock(projectPath: string): Promise<void> {
  try {
    const api = window.electronAPI;
    const sep = projectPath.includes('\\') ? '\\' : '/';
    const lockPath = `${projectPath}${sep}.git${sep}index.lock`;
    if (api?.fs?.exists && await api.fs.exists(lockPath)) {
      console.warn('[GitAdapter] Removing stale index.lock:', lockPath);
      await api.fs.unlink(lockPath);
    }
  } catch (e) {
    console.warn('[GitAdapter] Could not remove index.lock:', e);
  }
}

/** The app-written editing-lock file (see EditingLocks.ts) */
const EDITING_LOCK_FILE = '.asaps-editing.json';

/**
 * Run a git operation that updates the working tree (pull, branch switch,
 * merge) with the local .asaps-editing.json set aside. The app rewrites
 * that tracked file whenever a beat is selected, so without this git
 * refuses with "Your local changes … would be overwritten". Afterwards the
 * local lock changes are merged back onto whatever the operation brought in.
 */
async function withEditingLocksSetAside(
  projectPath: string,
  op: () => Promise<GitOperationResult>,
): Promise<GitOperationResult> {
  const api = window.electronAPI;
  if (!api?.fs?.exists || !api.fs.readFile || !api.fs.writeFile || !api.fs.unlink) return op();
  const run = getRunCommand();
  const sep = projectPath.includes('\\') ? '\\' : '/';
  const filePath = `${projectPath}${sep}${EDITING_LOCK_FILE}`;

  let local: EditingLockFile | null = null;
  let base: EditingLockFile | null = null;
  let clean = false;
  let code = '';
  try {
    const status = await run('git', ['status', '--porcelain', '--', EDITING_LOCK_FILE], projectPath);
    code = status.exitCode === 0 ? status.stdout.slice(0, 2) : '';
    if (!code.trim()) clean = true;
  } catch {
    clean = true;
  }
  if (clean) return op();

  try {
    if (await api.fs.exists(filePath)) {
      local = parseLockFile(new TextDecoder().decode(await api.fs.readFile(filePath)));
    }
    const committed = await run('git', ['show', `HEAD:${EDITING_LOCK_FILE}`], projectPath);
    base = committed.exitCode === 0 ? parseLockFile(committed.stdout) : null;

    if (committed.exitCode === 0) {
      await run('git', ['checkout', 'HEAD', '--', EDITING_LOCK_FILE], projectPath);
    } else {
      if (code !== '??') await run('git', ['rm', '--cached', '-q', '--', EDITING_LOCK_FILE], projectPath);
      if (await api.fs.exists(filePath)) await api.fs.unlink(filePath);
    }
  } catch (e) {
    // Couldn't set it aside — run the operation anyway; git reports the problem.
    console.warn('[GitAdapter] Could not set editing locks aside:', e);
  }

  const result = await op();

  try {
    // Leave an in-progress merge or rebase alone; locks are re-acquired
    // the next time a beat is selected.
    if (await gitDetectMergeState(projectPath)) return result;
    const incoming = (await api.fs.exists(filePath))
      ? parseLockFile(new TextDecoder().decode(await api.fs.readFile(filePath)))
      : null;
    const merged = mergeEditingLocks(base, local, incoming);
    if (!sameLockFile(merged, incoming)) {
      await api.fs.writeFile(filePath, JSON.stringify(merged, null, 2) + '\n');
    }
  } catch (e) {
    console.warn('[GitAdapter] Could not restore editing locks:', e);
  }
  return result;
}

/** Check if an error message indicates a lock file conflict */
function isLockError(message: string): boolean {
  return message.includes('index.lock') || message.includes('Unable to create') && message.includes('.lock');
}

/** Stage specific files */
export async function gitStage(projectPath: string, filePaths: string[]): Promise<GitOperationResult> {
  const run = getRunCommand();
  console.log('[GitAdapter] Staging files:', filePaths, 'in', projectPath);
  const result = await run('git', ['add', '--', ...filePaths], projectPath);
  console.log('[GitAdapter] Stage result:', result);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Staged ${filePaths.length} file(s)` : result.stderr.trim(),
  };
}

/** Stage all changes in the project directory (new, modified, deleted) */
export async function gitStageAll(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['add', '-A'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? 'Staged all changes' : result.stderr.trim(),
  };
}

/** Unstage specific files (handles both initial commit and normal cases) */
export async function gitUnstage(projectPath: string, filePaths: string[]): Promise<GitOperationResult> {
  const run = getRunCommand();
  // Try normal reset first
  const result = await run('git', ['reset', 'HEAD', '--', ...filePaths], projectPath);
  if (result.exitCode === 0) {
    return { success: true, message: `Unstaged ${filePaths.length} file(s)` };
  }
  // On a fresh repo with no commits, use rm --cached
  const fallback = await run('git', ['rm', '--cached', '--', ...filePaths], projectPath);
  return {
    success: fallback.exitCode === 0,
    message: fallback.exitCode === 0 ? `Unstaged ${filePaths.length} file(s)` : fallback.stderr.trim(),
  };
}

/**
 * The newest ASAPS version recorded for this project — in project.json on
 * disk, in the last commit, and on the remote branch. An older ASAPS doesn't
 * commit or push a project a newer one saved (2026-10-21, strict on purpose:
 * an outdated copy stripped a group's dialogs on save and the push spread it).
 */
async function refuseIfNewerProject(projectPath: string): Promise<GitOperationResult | null> {
  const run = getRunCommand();
  const versions: string[] = [];
  const api = window.electronAPI;
  try {
    const file = `${projectPath}${sepOf(projectPath)}project.json`;
    if (api?.fs && await api.fs.exists(file)) {
      versions.push(String(JSON.parse(new TextDecoder().decode(await api.fs.readFile(file)))?.savedWith ?? ''));
    }
  } catch { /* unreadable — the commits below still count */ }
  for (const rev of ['HEAD', '@{u}']) {
    const r = await run('git', ['show', `${rev}:./project.json`], projectPath);
    if (r.exitCode !== 0) continue;
    try { versions.push(String(JSON.parse(r.stdout)?.savedWith ?? '')); } catch { /* skip */ }
  }
  const newest = versions.filter(Boolean).reduce((a, b) => (isNewerVersion(b, a) ? b : a), '');
  if (newest && isNewerVersion(newest, APP_VERSION)) {
    return { success: false, message: newerVersionWarning(newest) ?? `Update ASAPS to v${newest} first.` };
  }
  return null;
}

/** Commit staged changes */
export async function gitCommit(projectPath: string, message: string): Promise<GitOperationResult> {
  const refused = await refuseIfNewerProject(projectPath);
  if (refused) return refused;
  const run = getRunCommand();
  console.log('[GitAdapter] Committing:', message, 'in', projectPath);
  const result = await run('git', ['commit', '-m', message], projectPath);
  console.log('[GitAdapter] Commit result:', result);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Plain-language replacement for git's "no remote" failures. The raw text
 *  ("fatal: No configured push destination … git remote add <name> <url>")
 *  reached authors who chose "On this computer only" in Track versions. */
export const NO_REMOTE_MESSAGE =
  "This project's history is kept on this computer only. To back it up or sync, add a server under Branches.";

function isNoRemoteError(stderr: string): boolean {
  return /No configured push destination|does not appear to be a git repository|no such remote|There is no tracking information/i.test(stderr);
}

/** Push to remote. Automatically sets upstream on first push. */
export async function gitPush(projectPath: string): Promise<GitOperationResult> {
  const refused = await refuseIfNewerProject(projectPath);
  if (refused) return refused;
  const run = getRunCommand();
  // Try normal push first
  const result = await run('git', ['push'], projectPath);
  if (result.exitCode === 0) {
    return { success: true, message: result.stderr.trim() || 'Pushed successfully' };
  }

  // If no upstream is set, get current branch and push with -u
  const errMsg = result.stderr.trim();
  if (errMsg.includes('No configured push destination')) {
    return { success: false, message: NO_REMOTE_MESSAGE };
  }
  if (errMsg.includes('no tracking information') || errMsg.includes('has no upstream branch')) {
    const branchResult = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    const branch = branchResult.stdout.trim() || 'main';
    const retryResult = await run('git', ['push', '-u', 'origin', branch], projectPath);
    const retryErr = retryResult.stderr.trim();
    return {
      success: retryResult.exitCode === 0,
      message: retryResult.exitCode === 0
        ? retryResult.stderr.trim() || `Pushed and set upstream to origin/${branch}`
        : isNoRemoteError(retryErr) ? NO_REMOTE_MESSAGE : retryErr,
    };
  }

  return { success: false, message: errMsg };
}

/** Force-push to remote (overwrites remote history). Use after git reset --hard. */
export async function gitForcePush(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  // Use --force for safety: fails if remote has commits we haven't seen
  const result = await run('git', ['push', '--force'], projectPath);
  if (result.exitCode === 0) {
    return { success: true, message: result.stderr.trim() || 'Force-pushed successfully' };
  }
  // Fallback: if --force fails (e.g. no upstream), try with -u
  const errMsg = result.stderr.trim();
  if (errMsg.includes('no tracking information') || errMsg.includes('has no upstream branch')) {
    const branchResult = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    const branch = branchResult.stdout.trim() || 'main';
    const retryResult = await run('git', ['push', '--force', '-u', 'origin', branch], projectPath);
    return {
      success: retryResult.exitCode === 0,
      message: retryResult.exitCode === 0
        ? retryResult.stderr.trim() || `Force-pushed to origin/${branch}`
        : retryResult.stderr.trim(),
    };
  }
  return { success: false, message: errMsg };
}

/** Pull from remote, optionally with rebase. Automatically sets upstream when missing. */
export async function gitPull(projectPath: string, rebase = false): Promise<GitOperationResult> {
  return withEditingLocksSetAside(projectPath, () => pullUnguarded(projectPath, rebase));
}

/** Write a file through the Electron bridge (for the Keep-both resolution). */
function getWriteFile(): (path: string, content: string) => Promise<void> {
  const api = window.electronAPI;
  if (!api?.fs?.writeFile) throw new Error('Git operations require the Electron filesystem API');
  return async (path, content) => { await api.fs.writeFile(path, content); };
}

const sepOf = (projectPath: string) => (projectPath.includes('\\') ? '\\' : '/');

/** Where HEAD is: on a branch, or not (detached) — and whether a rebase stopped halfway. */
export async function gitHeadState(projectPath: string): Promise<{ branch: string | null; rebasing: boolean }> {
  const run = getRunCommand();
  const ref = await run('git', ['symbolic-ref', '-q', '--short', 'HEAD'], projectPath);
  const state = await gitDetectMergeState(projectPath);
  return { branch: ref.exitCode === 0 ? (ref.stdout.trim() || 'HEAD') : null, rebasing: state === 'rebase' };
}

/**
 * Back onto a branch from a detached HEAD (a past commit, or a remote branch
 * checked out directly), keeping any commits made there: they are merged
 * into the branch. Git otherwise answers every pull with "You are not
 * currently on a branch" (NarrativDesign, 2026-10-20).
 */
export async function gitReturnToBranch(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const git = (args: string[]) => run('git', args, projectPath);
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const containing = (await git(['branch', '--format=%(refname:short)', '--contains', 'HEAD'])).stdout
    .split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('('));
  const locals = (await git(['branch', '--format=%(refname:short)'])).stdout
    .split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('('));
  const target = containing[0] || (locals.includes('main') ? 'main' : locals.includes('master') ? 'master' : locals[0]);
  if (!target) return { success: false, message: 'Git is not on a branch, and there is no branch to return to.' };
  const keep = !containing.includes(target);
  const rescue = `asaps-kept-${head.slice(0, 7)}`;
  if (keep) await git(['branch', '-f', rescue, head]);
  const checkout = await git(['checkout', target]);
  if (checkout.exitCode !== 0) {
    return { success: false, message: `Git is not on a branch, and could not go back to "${target}": ${checkout.stderr.trim()} Commit or discard your changes, then try again.` };
  }
  if (!keep) return { success: true, message: `Back on branch "${target}".` };
  const merge = await git(['merge', '--no-edit', rescue]);
  if (merge.exitCode !== 0) {
    return { success: false, message: `Back on branch "${target}"; merging the commits made off the branch hit a CONFLICT. ${merge.stdout.trim()}` };
  }
  await git(['branch', '-d', rescue]);
  return { success: true, message: `Back on branch "${target}", with the commits made off the branch merged in.` };
}

/** Resolve a pull's merge conflicts keeping everyone's beats (see keepBoth.ts). */
export async function gitKeepBoth(projectPath: string): Promise<KeepBothResult> {
  return resolveKeepBoth(projectPath, getRunCommand(), getWriteFile(), sepOf(projectPath));
}

/** The merge of `branch` someone undid, if any, and what it would take to bring its beats back. */
export async function gitPlanUndoneMerge(projectPath: string, branch: string): Promise<RestorePlan | null> {
  const run = getRunCommand();
  const undone = await findUndoneMerge(projectPath, run, branch);
  if (!undone) return null;
  const plan = await planRestore(projectPath, run, sepOf(projectPath), branch, undone);
  return plan.items.length > 0 ? plan : null;
}

/** Bring back the chosen beats of an undone merge, as one commit. */
export async function gitRestoreUndoneMerge(projectPath: string, plan: RestorePlan, chosen: Set<string>): Promise<RestoreResult> {
  return applyRestore(projectPath, getRunCommand(), getWriteFile(), sepOf(projectPath), plan, chosen);
}

/**
 * A project.json that differs from the last commit only in its stamps
 * (modifiedAt, savedWith) is put back before pulling. Older versions
 * rewrote the stamps on every save, and Git refused the pull: "Your local
 * changes … would be overwritten by merge: project.json".
 */
async function restoreStampOnlyProjectJson(projectPath: string): Promise<void> {
  const api = window.electronAPI;
  if (!api?.fs) return;
  const run = getRunCommand();
  const status = await run('git', ['status', '--porcelain', '--', 'project.json'], projectPath);
  if (status.exitCode !== 0 || !/^.M /m.test(status.stdout) && !/^M. /m.test(status.stdout)) return;
  const committed = await run('git', ['show', 'HEAD:./project.json'], projectPath);
  if (committed.exitCode !== 0) return;
  const local = new TextDecoder().decode(await api.fs.readFile(`${projectPath}${sepOf(projectPath)}project.json`));
  // A version bump alone is put back too; the next save stamps it again.
  if (onlyStampsDiffer(committed.stdout, local, { ignoreVersionBump: true })) {
    await run('git', ['checkout', 'HEAD', '--', 'project.json'], projectPath);
  }
}

async function pullUnguarded(projectPath: string, rebase: boolean): Promise<GitOperationResult> {
  const run = getRunCommand();
  try {
    await restoreStampOnlyProjectJson(projectPath);
  } catch (e) {
    console.warn('[GitAdapter] Could not check project.json before pulling:', e);
  }
  // A rebase that stopped halfway, or a detached HEAD, make every pull fail
  // with Git's "You are not currently on a branch".
  const head = await gitHeadState(projectPath);
  if (head.rebasing) {
    return { success: false, message: 'A pull with rebase stopped halfway because of a CONFLICT. Choose a side for it, or abort the rebase and pull again without rebase (that offers Keep both).' };
  }
  if (!head.branch) {
    const back = await gitReturnToBranch(projectPath);
    if (!back.success) return back;
  }
  const args = rebase ? ['pull', '--rebase'] : ['pull', '--no-edit'];
  const result = await run('git', args, projectPath);
  if (result.exitCode === 0) {
    // Two people's beats under one id in DIFFERENT files: no conflict was
    // reported, but the next save would drop one of them.
    let extra = '';
    try {
      extra = movedSummary(await fixDuplicateIdsAfterMerge(projectPath, run, getWriteFile(), sepOf(projectPath)));
    } catch (e) {
      console.warn('[GitAdapter] duplicate-id check after pull failed:', e);
    }
    return { success: true, message: (result.stdout.trim() || 'Already up to date') + (extra ? `\n${extra.trim()}` : '') };
  }

  // If no upstream tracking is set, retry with explicit origin/<branch>
  const errMsg = (result.stderr + ' ' + result.stdout).trim();
  if (errMsg.includes('no tracking information') || errMsg.includes('no upstream')) {
    const branchResult = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    const branch = branchResult.stdout.trim() || 'main';

    // Set upstream tracking so future pulls work without specifying the remote
    await run('git', ['branch', '--set-upstream-to', `origin/${branch}`, branch], projectPath);

    const retryArgs = rebase
      ? ['pull', '--rebase', 'origin', branch]
      : ['pull', '--no-edit', 'origin', branch];
    const retryResult = await run('git', retryArgs, projectPath);
    return {
      success: retryResult.exitCode === 0,
      message: retryResult.exitCode === 0
        ? retryResult.stdout.trim() || `Pulled from origin/${branch} and set upstream`
        : isNoRemoteError(retryResult.stderr) ? NO_REMOTE_MESSAGE : retryResult.stderr.trim(),
    };
  }

  return { success: false, message: isNoRemoteError(errMsg) ? NO_REMOTE_MESSAGE : errMsg };
}

/** Fetch from remote */
export async function gitFetch(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['fetch'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? result.stderr.trim() || 'Fetched successfully'
      : result.stderr.trim(),
  };
}

/** Stash current changes */
export async function gitStash(projectPath: string, message?: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const args = message ? ['stash', 'push', '-m', message] : ['stash', 'push'];
  const result = await run('git', args, projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Pop the most recent stash */
export async function gitStashPop(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['stash', 'pop'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** List all stashes */
export async function gitListStashes(projectPath: string): Promise<GitStashEntry[]> {
  const run = getRunCommand();
  const result = await run('git', ['stash', 'list'], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout.trim().split('\n').map(line => {
    // Format: stash@{0}: On branch: message
    const match = line.match(/^stash@\{(\d+)\}:\s+(?:On\s+(\S+):\s*)?(.*)$/);
    if (!match) return { index: 0, message: line, branch: '' };
    return {
      index: parseInt(match[1], 10),
      branch: match[2] || '',
      message: match[3] || '',
    };
  });
}

/** Get commit log, optionally for a specific file */
export async function gitLog(projectPath: string, limit = 50, filePath?: string): Promise<GitLogEntry[]> {
  const run = getRunCommand();
  const SEP = '---GIT_LOG_SEP---';
  const args = [
    'log',
    `--max-count=${limit}`,
    `--format=${SEP}%n%H%n%an%n%ai%n%s`,
    '--name-only',
  ];
  if (filePath) args.push('--', filePath);

  const result = await run('git', args, projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  const entries: GitLogEntry[] = [];
  const blocks = result.stdout.split(SEP).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 4) continue;
    const hash = lines[0];
    const author = lines[1];
    const date = lines[2];
    const message = lines[3];
    const files = lines.slice(4).filter(Boolean);
    entries.push({ hash, author, date, message, files });
  }

  return entries;
}

/** Get diff for a file, optionally against a ref */
export async function gitDiff(projectPath: string, filePath: string, ref?: string): Promise<string> {
  const run = getRunCommand();
  const args = ref ? ['diff', ref, '--', filePath] : ['diff', '--', filePath];
  const result = await run('git', args, projectPath);
  // Also check staged diff if nothing from working tree
  if (result.exitCode === 0 && !result.stdout.trim()) {
    const stagedResult = await run('git', ['diff', '--cached', '--', filePath], projectPath);
    return stagedResult.stdout;
  }
  return result.stdout;
}

/** List local and remote branches */
export async function gitListBranches(projectPath: string): Promise<GitBranch[]> {
  const run = getRunCommand();
  const result = await run('git', ['branch', '-a'], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout.trim().split('\n').map(line => {
    const current = line.startsWith('*');
    const name = line.replace(/^\*?\s+/, '').trim();
    const remote = name.startsWith('remotes/');
    return {
      name: remote ? name.replace('remotes/', '') : name,
      current,
      remote,
    };
  }).filter(b => !b.name.includes('HEAD ->'));
}

/** Switch to an existing branch */
export async function gitSwitchBranch(projectPath: string, branchName: string): Promise<GitOperationResult> {
  return withEditingLocksSetAside(projectPath, async () => {
    const run = getRunCommand();
    // A remote branch ("origin/Pablo") checked out directly leaves Git on no
    // branch: make (or reuse) a local branch that follows it instead.
    const isLocal = (await run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], projectPath)).exitCode === 0;
    const isRemote = !isLocal && (await run('git', ['show-ref', '--verify', '--quiet', `refs/remotes/${branchName}`], projectPath)).exitCode === 0;
    if (isRemote) {
      const localName = branchName.replace(/^[^/]+\//, '');
      const hasLocal = (await run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${localName}`], projectPath)).exitCode === 0;
      const r = await run('git', hasLocal ? ['checkout', localName] : ['checkout', '-b', localName, '--track', branchName], projectPath);
      return {
        success: r.exitCode === 0,
        message: r.exitCode === 0 ? `Switched to ${localName} (following ${branchName})` : r.stderr.trim(),
      };
    }
    const result = await run('git', ['checkout', branchName], projectPath);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0
        ? result.stderr.trim() || `Switched to ${branchName}`
        : result.stderr.trim(),
    };
  });
}

/** Create a new branch and switch to it */
export async function gitCreateBranch(projectPath: string, branchName: string, startPoint?: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const args = startPoint
    ? ['checkout', '-b', branchName, startPoint]
    : ['checkout', '-b', branchName];
  const result = await run('git', args, projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? result.stderr.trim() || `Created and switched to ${branchName}`
      : result.stderr.trim(),
  };
}

/** Merge another branch into the current branch */
export async function gitMerge(projectPath: string, branchName: string): Promise<GitOperationResult> {
  return withEditingLocksSetAside(projectPath, async () => {
    const run = getRunCommand();
    const result = await run('git', ['merge', branchName], projectPath);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim() || result.stdout.trim(),
    };
  });
}

/** Revert changes to specific files (discard local modifications) */
export async function gitRevertFiles(projectPath: string, filePaths: string[]): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['checkout', '--', ...filePaths], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Reverted ${filePaths.length} file(s)` : result.stderr.trim(),
  };
}

/** Hard-reset to a specific commit (discards all staged/unstaged changes) */
export async function gitResetHard(projectPath: string, commitHash: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  await removeStaleIndexLock(projectPath);
  let result = await run('git', ['reset', '--hard', commitHash], projectPath);
  // Retry once if a concurrent git operation (e.g. VCS poll) held the lock
  if (result.exitCode !== 0 && isLockError(result.stderr)) {
    await new Promise(r => setTimeout(r, 500));
    await removeStaleIndexLock(projectPath);
    result = await run('git', ['reset', '--hard', commitHash], projectPath);
  }
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Reset to ${commitHash.substring(0, 7)}` : result.stderr.trim(),
  };
}

/** Remove untracked files. If filePaths given, removes only those; otherwise removes all untracked files+dirs. */
export async function gitClean(projectPath: string, filePaths?: string[]): Promise<GitOperationResult> {
  const run = getRunCommand();
  await removeStaleIndexLock(projectPath);
  const args = filePaths && filePaths.length > 0
    ? ['clean', '-f', '--', ...filePaths]
    : ['clean', '-fd'];
  let result = await run('git', args, projectPath);
  if (result.exitCode !== 0 && isLockError(result.stderr)) {
    await new Promise(r => setTimeout(r, 500));
    await removeStaleIndexLock(projectPath);
    result = await run('git', args, projectPath);
  }
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? filePaths ? `Removed ${filePaths.length} untracked file(s)` : 'Removed all untracked files'
      : result.stderr.trim(),
  };
}

/** Reset to a commit and clean all untracked files in one operation */
export async function gitResetHardAndClean(projectPath: string, commitHash: string): Promise<GitOperationResult> {
  const resetResult = await gitResetHard(projectPath, commitHash);
  if (!resetResult.success) return resetResult;

  const cleanResult = await gitClean(projectPath);
  if (!cleanResult.success) {
    return {
      success: false,
      message: `Reset succeeded but clean failed: ${cleanResult.message}`,
    };
  }

  return {
    success: true,
    message: `Reset to ${commitHash.substring(0, 7)} and cleaned untracked files`,
  };
}

/** Get list of files with merge conflicts */
export async function gitGetConflicts(projectPath: string): Promise<string[]> {
  const run = getRunCommand();
  const result = await run('git', ['status', '--porcelain'], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  // Every unmerged state: both changed (UU), both added (AA), both deleted
  // (DD), and the one-sided ones a rename on each side produces (AU/UA, UD/DU).
  // Listing only UU/AA/DD left those unresolvable (group report, 2026-10-21).
  return result.stdout.trim().split('\n')
    .filter(line => /^(UU|AA|DD|AU|UA|UD|DU) /.test(line))
    .map(line => line.substring(3).trim());
}

/** Join path segments using the separator detected from the base path */
function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base, ...parts].join(sep);
}

/** Initialize a new git repository and create a default .gitignore */
export async function gitInit(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  // Same default branch as the GitHub-creation flows (GitInitHelper): a
  // repo that starts on 'master' collides with 'main' the moment a remote
  // is added later. `-c init.defaultBranch` is a silent no-op on Git < 2.28.
  const result = await run('git', ['-c', 'init.defaultBranch=main', 'init'], projectPath);
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr.trim() };
  }

  // Create .gitignore with common macOS/Windows exclusions if it doesn't exist
  try {
    const api = window.electronAPI;
    const gitignorePath = joinPath(projectPath, '.gitignore');
    const exists = await api!.fs.exists(gitignorePath);
    if (!exists) {
      await api!.fs.writeFile(gitignorePath, [
        '# OS-generated files',
        '.DS_Store',
        'Thumbs.db',
        'Desktop.ini',
        '',
        '# Editor files',
        '.vscode/',
        '*.swp',
        '*~',
        '',
      ].join('\n'));
    }
  } catch (e) {
    console.warn('[GitAdapter] Failed to create .gitignore:', e);
    // Non-fatal — continue even if .gitignore creation fails
  }

  return {
    success: true,
    message: result.stdout.trim() || 'Initialized empty Git repository',
  };
}

/** Add a remote to the repository */
export async function gitAddRemote(projectPath: string, name: string, url: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['remote', 'add', name, url], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? `Added remote '${name}' -> ${url}`
      : result.stderr.trim(),
  };
}

/** List configured remotes */
export async function gitListRemotes(projectPath: string): Promise<{ name: string; url: string }[]> {
  const run = getRunCommand();
  const result = await run('git', ['remote', '-v'], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  const seen = new Set<string>();
  return result.stdout.trim().split('\n')
    .map(line => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match || seen.has(match[1])) return null;
      seen.add(match[1]);
      return { name: match[1], url: match[2] };
    })
    .filter((r): r is { name: string; url: string } => r !== null);
}

/** Set a git config value (local to repo) */
export async function gitConfigSet(projectPath: string, key: string, value: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['config', key, value], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Set ${key}` : result.stderr.trim(),
  };
}

/** Get a git config value */
export async function gitConfigGet(projectPath: string, key: string): Promise<string | null> {
  const run = getRunCommand();
  const result = await run('git', ['config', key], projectPath);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

/** Abort an in-progress merge */
export async function gitAbortMerge(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['merge', '--abort'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? 'Merge aborted' : result.stderr.trim(),
  };
}

/** Abort an in-progress rebase */
export async function gitAbortRebase(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  const result = await run('git', ['rebase', '--abort'], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? 'Rebase aborted' : result.stderr.trim(),
  };
}

/** Detect whether we're in a merge or rebase state */
export async function gitDetectMergeState(projectPath: string): Promise<'merge' | 'rebase' | null> {
  const run = getRunCommand();
  // Use `git status` as the authoritative source — it explicitly reports in-progress operations
  // and avoids false positives from stale REBASE_HEAD/MERGE_HEAD files.
  const statusResult = await run('git', ['status'], projectPath);
  if (statusResult.exitCode === 0) {
    const output = statusResult.stdout;
    if (output.includes('rebase in progress') || output.includes('interactive rebase') || output.includes('currently rebasing')) {
      return 'rebase';
    }
    if (output.includes('unmerged paths') || output.includes('you are still merging') || output.includes('All conflicts fixed but you are still merging')) {
      return 'merge';
    }
  }
  // Fall back to ref checks for edge cases where `git status` might not be explicit
  const mergeCheck = await run('git', ['rev-parse', '--verify', 'MERGE_HEAD'], projectPath);
  if (mergeCheck.exitCode === 0) return 'merge';
  return null;
}

/**
 * Resolve all merge conflicts by choosing one side for all files.
 *
 * `keepMine` = true means keep local changes, false means accept remote.
 * Note: In rebase, git's ours/theirs are swapped relative to the user's
 * mental model, so `isRebase` controls the flag mapping.
 */
export async function gitResolveAllConflicts(
  projectPath: string,
  keepMine: boolean,
  isRebase: boolean,
): Promise<GitOperationResult> {
  const run = getRunCommand();

  // Get conflict file list
  const conflicts = await gitGetConflicts(projectPath);
  if (conflicts.length === 0) {
    return { success: true, message: 'No conflicts to resolve' };
  }

  // In merge: mine = ours, remote = theirs
  // In rebase: mine = theirs (replayed commits), remote = ours (target branch)
  const useOurs = (keepMine && !isRebase) || (!keepMine && isRebase);
  const flag = useOurs ? '--ours' : '--theirs';

  for (const file of conflicts) {
    const taken = await takeConflictSide(projectPath, file, useOurs ? 2 : 3);
    if (!taken.success) return { success: false, message: `Failed to resolve ${file}: ${taken.message}` };
  }

  const label = keepMine ? 'local' : 'remote';
  return { success: true, message: `Resolved ${conflicts.length} conflict(s) using ${label} version` };
}

/**
 * Continue a merge or rebase after conflicts have been resolved.
 * For merge: commits with the default merge message.
 * For rebase: continues to the next step.
 */
export async function gitContinueMergeOrRebase(
  projectPath: string,
  isRebase: boolean,
): Promise<GitOperationResult> {
  const run = getRunCommand();
  if (isRebase) {
    // Use -c core.editor=true to prevent editor from opening in non-interactive context
    const result = await run('git', ['-c', 'core.editor=true', 'rebase', '--continue'], projectPath);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Rebase completed' : result.stderr.trim(),
    };
  } else {
    const result = await run('git', ['commit', '--no-edit'], projectPath);
    return {
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? 'Merge committed' : result.stderr.trim(),
    };
  }
}

/**
 * Resolve all conflicts and complete the entire merge/rebase in a loop.
 *
 * For rebases, each replayed commit may create new conflicts. This function
 * loops: resolve → continue → resolve → continue → ... until done.
 * For merges, resolves once and commits.
 *
 * Reports progress via optional callback.
 */
export async function gitResolveAllAndComplete(
  projectPath: string,
  keepMine: boolean,
  isRebase: boolean,
  onProgress?: (step: number, message: string) => void,
): Promise<GitOperationResult> {
  let step = 0;
  const maxSteps = 500; // safety limit
  let totalResolved = 0;

  while (step < maxSteps) {
    step++;

    // Check for conflicts
    const conflicts = await gitGetConflicts(projectPath);
    if (conflicts.length > 0) {
      onProgress?.(step, `Resolving ${conflicts.length} conflicts (step ${step})...`);
      const resolveResult = await gitResolveAllConflicts(projectPath, keepMine, isRebase);
      if (!resolveResult.success) return resolveResult;
      totalResolved += conflicts.length;
    }

    // Continue the merge/rebase
    onProgress?.(step, isRebase ? `Continuing rebase (step ${step})...` : 'Committing merge...');
    const continueResult = await gitContinueMergeOrRebase(projectPath, isRebase);

    if (continueResult.success) {
      // Check if we're truly done
      const state = await gitDetectMergeState(projectPath);
      if (!state) {
        return {
          success: true,
          message: `${isRebase ? 'Rebase' : 'Merge'} completed (${totalResolved} conflict${totalResolved !== 1 ? 's' : ''} resolved)`,
        };
      }
      // Still in rebase — more commits to replay, loop continues
      continue;
    }

    // Continue failed — check if there are new conflicts (next rebase step)
    if (isRebase) {
      const newConflicts = await gitGetConflicts(projectPath);
      if (newConflicts.length > 0) {
        // More conflicts — loop will resolve them on next iteration
        continue;
      }
    }

    // No conflicts but continue failed — genuine error
    return continueResult;
  }

  return { success: false, message: `Resolution exceeded ${maxSteps} steps — aborting` };
}

/** Read a file from the remote branch via git show */
export async function gitShowRemoteFile(
  projectPath: string, branch: string, filePath: string
): Promise<string | null> {
  const run = getRunCommand();
  const result = await run('git', ['show', `origin/${branch}:${filePath}`], projectPath);
  return result.exitCode === 0 ? result.stdout : null;
}

/** Clone a remote repository into a target directory */
export async function gitClone(
  remoteUrl: string,
  targetDir: string,
): Promise<GitOperationResult> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    throw new Error('Git clone requires Electron runCommand API');
  }
  // Use a 5-minute timeout for clone (repos can be large)
  console.log('[GitAdapter] git clone', remoteUrl, targetDir);
  const result = await api.fs.runCommand('git', ['clone', remoteUrl, targetDir], undefined, 300000);
  console.log('[GitAdapter] clone result: exitCode=%d stdout=%s stderr=%s', result.exitCode, result.stdout?.substring(0, 200), result.stderr?.substring(0, 200));
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? result.stderr.trim() || `Cloned into ${targetDir}`
      : result.stderr.trim() || result.stdout.trim() || 'Clone failed (no error details from git)',
  };
}

/**
 * Settle one conflicted file with one side's version (2 = ours, 3 = theirs).
 * When that side has no version — it deleted or renamed the file — taking
 * its side means removing the file. `git checkout --theirs` failed there
 * with "does not have their version" (group report, 2026-10-21).
 */
async function takeConflictSide(projectPath: string, filePath: string, stage: 2 | 3): Promise<GitOperationResult> {
  const run = getRunCommand();
  // Conflict paths come from the repository root; ":/" makes Git read them
  // that way when the project is a subfolder of the repository.
  const spec = `:/${filePath}`;
  const staged = await run('git', ['show', `:${stage}:${filePath}`], projectPath);
  if (staged.exitCode !== 0) {
    const rm = await run('git', ['rm', '-q', '-f', '--', spec], projectPath);
    return { success: rm.exitCode === 0, message: rm.exitCode === 0 ? `Removed ${filePath}` : rm.stderr.trim() };
  }
  // A file renamed differently on each side carries a merged copy WITH
  // conflict markers in its one-sided stage — take the side's commit then.
  const marked = /^(<{7}|>{7})/m.test(staged.stdout);
  let source: string[] = ['--ours'];
  if (stage === 3) source = ['--theirs'];
  if (marked) {
    const merging = (await run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], projectPath)).exitCode === 0;
    source = [stage === 2 ? 'HEAD' : (merging ? 'MERGE_HEAD' : 'REBASE_HEAD')];
  }
  const checkout = await run('git', ['checkout', ...source, '--', spec], projectPath);
  if (checkout.exitCode !== 0) return { success: false, message: checkout.stderr.trim() };
  const add = await run('git', ['add', '--', spec], projectPath);
  return { success: add.exitCode === 0, message: add.exitCode === 0 ? `Resolved ${filePath}` : add.stderr.trim() };
}

/** Resolve a merge conflict by accepting ours or theirs */
export async function gitResolveConflict(
  projectPath: string,
  filePath: string,
  resolution: 'ours' | 'theirs'
): Promise<GitOperationResult> {
  const result = await takeConflictSide(projectPath, filePath, resolution === 'ours' ? 2 : 3);
  return result.success ? { success: true, message: `Resolved ${filePath} using ${resolution}` } : result;
}
