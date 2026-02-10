/**
 * VCSDetector - Detect version control system in project directory
 *
 * Checks whether a directory-based project is under Git or Perforce control.
 * Requires Electron filesystem API (fs.exists, fs.runCommand).
 */

export type VCSType = 'git' | 'perforce' | 'none';

export interface VCSInfo {
  type: VCSType;
  /** Current branch (Git) or workspace (Perforce) */
  branch?: string;
  /** Repository root path */
  repoRoot?: string;
  /** True when git was expected but the binary was not found on the system */
  gitMissing?: boolean;
}

/**
 * Detect which VCS (if any) manages the given project directory.
 */
export async function detectVCS(projectPath: string): Promise<VCSInfo> {
  const api = window.electronAPI;
  if (!api?.fs) {
    return { type: 'none' };
  }

  // Check for Git
  try {
    // Check if .git directory exists (fast check)
    const gitDirExists = await api.fs.exists(`${projectPath}/.git`);
    if (gitDirExists) {
      return await getGitInfo(projectPath);
    }

    // Could be in a subdirectory of a git repo - try git rev-parse
    if (api.fs.runCommand) {
      const result = await api.fs.runCommand('git', ['rev-parse', '--git-dir'], projectPath);
      if (result.exitCode === 0) {
        return await getGitInfo(projectPath);
      }
    }
  } catch (err: any) {
    // Detect if git binary itself is not installed
    const msg = String(err?.message || err?.stderr || '');
    if (msg.includes('ENOENT') || msg.includes('command not found') || msg.includes('not recognized')) {
      return { type: 'none', gitMissing: true };
    }
    // Git not available for other reasons, continue
  }

  // Check for Perforce
  try {
    if (api.fs.runCommand) {
      const result = await api.fs.runCommand('p4', ['info'], projectPath);
      if (result.exitCode === 0 && result.stdout.includes('Client root:')) {
        return getPerforceInfo(result.stdout);
      }
    }
  } catch {
    // P4 not available, continue
  }

  return { type: 'none' };
}

async function getGitInfo(projectPath: string): Promise<VCSInfo> {
  const api = window.electronAPI;
  if (!api?.fs?.runCommand) {
    return { type: 'git' };
  }

  let branch: string | undefined;
  let repoRoot: string | undefined;

  try {
    const branchResult = await api.fs.runCommand(
      'git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath
    );
    if (branchResult.exitCode === 0) {
      branch = branchResult.stdout.trim();
    }
  } catch { /* ignore */ }

  try {
    const rootResult = await api.fs.runCommand(
      'git', ['rev-parse', '--show-toplevel'], projectPath
    );
    if (rootResult.exitCode === 0) {
      repoRoot = rootResult.stdout.trim();
    }
  } catch { /* ignore */ }

  return { type: 'git', branch, repoRoot };
}

function getPerforceInfo(p4Output: string): VCSInfo {
  let branch: string | undefined;
  let repoRoot: string | undefined;

  const clientMatch = p4Output.match(/Client name:\s*(.+)/);
  if (clientMatch) {
    branch = clientMatch[1].trim();
  }

  const rootMatch = p4Output.match(/Client root:\s*(.+)/);
  if (rootMatch) {
    repoRoot = rootMatch[1].trim();
  }

  return { type: 'perforce', branch, repoRoot };
}
