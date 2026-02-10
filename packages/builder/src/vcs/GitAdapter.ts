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

/** Pull from remote, optionally with rebase */
export async function gitPull(projectPath: string, rebase = false): Promise<GitOperationResult> {
  const run = getRunCommand();
  const args = rebase ? ['pull', '--rebase'] : ['pull'];
  const result = await run('git', args, projectPath);
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
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

/** Get list of files with merge conflicts */
export async function gitGetConflicts(projectPath: string): Promise<string[]> {
  const run = getRunCommand();
  const result = await run('git', ['status', '--porcelain'], projectPath);
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];

  return result.stdout.trim().split('\n')
    .filter(line => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'))
    .map(line => line.substring(3).trim());
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
    const gitignorePath = `${projectPath}/.gitignore`;
    const exists = await api.fs.exists(gitignorePath);
    if (!exists) {
      await api.fs.writeFile(gitignorePath, [
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
