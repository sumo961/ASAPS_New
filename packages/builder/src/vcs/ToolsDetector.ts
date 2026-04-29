/**
 * VCS Tools Detector — checks whether `git` and `gh` are installed and reachable,
 * and whether the user is authenticated with GitHub via `gh auth status`.
 *
 * Pure functions over `electronAPI.fs.runCommand`; no React, no module-level cache.
 * The caller (VCSStatusProvider) owns the session-level cache.
 */

export interface ToolStatus {
  /** Tool is on PATH and runs successfully */
  present: boolean;
  /** Version string from `--version` (e.g. "git version 2.42.0") */
  version: string | null;
}

export interface GhAuthStatus {
  /** Authenticated to github.com */
  authenticated: boolean;
  /** Logged-in username (parsed from `gh auth status`), if any */
  username: string | null;
  /** Raw output, useful for surfacing in the onboarding panel */
  raw: string;
}

export interface VCSToolsState {
  git: ToolStatus;
  gh: ToolStatus;
  ghAuth: GhAuthStatus | null;
}

function getApi() {
  return (window as unknown as { electronAPI?: { fs?: { runCommand?: (cmd: string, args: string[], cwd?: string, timeout?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }> } } }).electronAPI;
}

async function checkVersion(command: string): Promise<ToolStatus> {
  const api = getApi();
  if (!api?.fs?.runCommand) return { present: false, version: null };
  try {
    const result = await api.fs.runCommand(command, ['--version'], undefined, 5000);
    if (result.exitCode === 0) {
      const version = (result.stdout || '').trim().split('\n')[0] || null;
      return { present: true, version };
    }
  } catch {
    // command not found / timeout — fall through
  }
  return { present: false, version: null };
}

export async function detectGit(): Promise<ToolStatus> {
  return checkVersion('git');
}

export async function detectGh(): Promise<ToolStatus> {
  return checkVersion('gh');
}

/**
 * Run `gh auth status`. Exit code 0 means authed.
 * Parses the username from the standard output format:
 *   "✓ Logged in to github.com account <username> ..."
 */
export async function detectGhAuth(): Promise<GhAuthStatus> {
  const api = getApi();
  if (!api?.fs?.runCommand) {
    return { authenticated: false, username: null, raw: '' };
  }
  try {
    const result = await api.fs.runCommand('gh', ['auth', 'status'], undefined, 10000);
    const raw = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    if (result.exitCode === 0) {
      // Output may go to stderr; combine both for matching.
      const match = raw.match(/Logged in to github\.com (?:as|account) ([^\s(]+)/i);
      return { authenticated: true, username: match?.[1] || null, raw };
    }
    return { authenticated: false, username: null, raw };
  } catch (e) {
    return { authenticated: false, username: null, raw: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Detect everything in parallel. Auth check is skipped if `gh` is missing.
 */
export async function detectAll(): Promise<VCSToolsState> {
  const [git, gh] = await Promise.all([detectGit(), detectGh()]);
  const ghAuth = gh.present ? await detectGhAuth() : null;
  return { git, gh, ghAuth };
}

/**
 * Platform-specific install hints for the missing-tools card.
 */
export function getInstallHints(): {
  manager: 'brew' | 'winget' | 'apt' | 'unknown';
  gitCommand: string;
  ghCommand: string;
  bothCommand: string;
  gitDownloadUrl: string;
  ghDownloadUrl: string;
} {
  const platform = (window as unknown as { electronAPI?: { platform?: string } }).electronAPI?.platform;
  if (platform === 'darwin') {
    return {
      manager: 'brew',
      gitCommand: 'brew install git',
      ghCommand: 'brew install gh',
      bothCommand: 'brew install git gh',
      gitDownloadUrl: 'https://git-scm.com/download/mac',
      ghDownloadUrl: 'https://github.com/cli/cli/releases/latest',
    };
  }
  if (platform === 'win32') {
    return {
      manager: 'winget',
      gitCommand: 'winget install --id Git.Git -e',
      ghCommand: 'winget install --id GitHub.cli -e',
      bothCommand: 'winget install --id Git.Git -e ; winget install --id GitHub.cli -e',
      gitDownloadUrl: 'https://git-scm.com/download/win',
      ghDownloadUrl: 'https://github.com/cli/cli/releases/latest',
    };
  }
  // Linux fallback — Debian/Ubuntu instructions cover the common case
  return {
    manager: 'apt',
    gitCommand: 'sudo apt install git',
    ghCommand: 'sudo apt install gh',
    bothCommand: 'sudo apt install git gh',
    gitDownloadUrl: 'https://git-scm.com/download/linux',
    ghDownloadUrl: 'https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
  };
}
