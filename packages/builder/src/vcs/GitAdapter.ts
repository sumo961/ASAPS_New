/**
 * GitAdapter - Git status and diff integration
 *
 * Runs git commands via Electron IPC to show file status,
 * branch info, and changed files for directory-based projects.
 */

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

/** Commit staged changes */
export async function gitCommit(projectPath: string, message: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  console.log('[GitAdapter] Committing:', message, 'in', projectPath);
  const result = await run('git', ['commit', '-m', message], projectPath);
  console.log('[GitAdapter] Commit result:', result);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

/** Push to remote. Automatically sets upstream on first push. */
export async function gitPush(projectPath: string): Promise<GitOperationResult> {
  const run = getRunCommand();
  // Try normal push first
  const result = await run('git', ['push'], projectPath);
  if (result.exitCode === 0) {
    return { success: true, message: result.stderr.trim() || 'Pushed successfully' };
  }

  // If no upstream is set, get current branch and push with -u
  const errMsg = result.stderr.trim();
  if (errMsg.includes('no tracking information') || errMsg.includes('has no upstream branch')) {
    const branchResult = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    const branch = branchResult.stdout.trim() || 'main';
    const retryResult = await run('git', ['push', '-u', 'origin', branch], projectPath);
    return {
      success: retryResult.exitCode === 0,
      message: retryResult.exitCode === 0
        ? retryResult.stderr.trim() || `Pushed and set upstream to origin/${branch}`
        : retryResult.stderr.trim(),
    };
  }

  return { success: false, message: errMsg };
}

/** Pull from remote, optionally with rebase. Automatically sets upstream when missing. */
export async function gitPull(projectPath: string, rebase = false): Promise<GitOperationResult> {
  const run = getRunCommand();
  const args = rebase ? ['pull', '--rebase'] : ['pull'];
  const result = await run('git', args, projectPath);
  if (result.exitCode === 0) {
    return { success: true, message: result.stdout.trim() || 'Already up to date' };
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
      : ['pull', 'origin', branch];
    const retryResult = await run('git', retryArgs, projectPath);
    return {
      success: retryResult.exitCode === 0,
      message: retryResult.exitCode === 0
        ? retryResult.stdout.trim() || `Pulled from origin/${branch} and set upstream`
        : retryResult.stderr.trim(),
    };
  }

  return { success: false, message: errMsg };
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
  const run = getRunCommand();
  const result = await run('git', ['checkout', branchName], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0
      ? result.stderr.trim() || `Switched to ${branchName}`
      : result.stderr.trim(),
  };
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
  const run = getRunCommand();
  const result = await run('git', ['merge', branchName], projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim() || result.stdout.trim(),
  };
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

  // Update remote tracking ref to match HEAD so git doesn't report the
  // reset-from commits as "incoming" (misleading after an intentional reset).
  // The next `git fetch` will restore the real remote state.
  try {
    const run = getRunCommand();
    const branchResult = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    if (branchResult.exitCode === 0) {
      const branch = branchResult.stdout.trim();
      const upstreamResult = await run('git', ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`], projectPath);
      if (upstreamResult.exitCode === 0) {
        const upstream = upstreamResult.stdout.trim(); // e.g. "origin/main"
        await run('git', ['update-ref', `refs/remotes/${upstream}`, 'HEAD'], projectPath);
      }
    }
  } catch { /* cosmetic — don't fail the operation */ }

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

  return result.stdout.trim().split('\n')
    .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'))
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
  const result = await run('git', ['init'], projectPath);
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
    const checkout = await run('git', ['checkout', flag, '--', file], projectPath);
    if (checkout.exitCode !== 0) {
      return { success: false, message: `Failed to resolve ${file}: ${checkout.stderr.trim()}` };
    }
    const add = await run('git', ['add', '--', file], projectPath);
    if (add.exitCode !== 0) {
      return { success: false, message: `Failed to stage ${file}: ${add.stderr.trim()}` };
    }
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

/** Resolve a merge conflict by accepting ours or theirs */
export async function gitResolveConflict(
  projectPath: string,
  filePath: string,
  resolution: 'ours' | 'theirs'
): Promise<GitOperationResult> {
  const run = getRunCommand();
  const checkoutResult = await run(
    'git', ['checkout', `--${resolution}`, '--', filePath], projectPath
  );
  if (checkoutResult.exitCode !== 0) {
    return { success: false, message: checkoutResult.stderr.trim() };
  }
  const addResult = await run('git', ['add', '--', filePath], projectPath);
  return {
    success: addResult.exitCode === 0,
    message: addResult.exitCode === 0
      ? `Resolved ${filePath} using ${resolution}`
      : addResult.stderr.trim(),
  };
}
