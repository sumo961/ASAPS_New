/**
 * Tests for ToolsDetector — checks git/gh presence + GitHub auth
 * status via electronAPI.fs.runCommand. The VCSStatusProvider reads
 * these on app start + on demand to gate VCS UI ("Push to GitHub"
 * button etc.). Wrong detection silently disables the UI even when
 * the tools ARE installed.
 *
 * Coverage focus:
 *   - detectGit / detectGh: exitCode 0 → present:true + first-line
 *     version; non-zero exit → present:false; thrown command → safe
 *     present:false (no crash on missing PATH)
 *   - returns safe default when electronAPI.fs is missing (web-only
 *     contexts shouldn't crash this code path)
 *   - detectGhAuth: parses username from the "Logged in to
 *     github.com (as|account) <username>" output; combines stdout
 *     + stderr (gh writes to either); exit 0 → authenticated,
 *     non-zero → not; exceptions captured as raw + not authed
 *   - detectAll: skips auth check when gh is missing (auth would
 *     fail anyway and slow detection)
 *   - getInstallHints: per-platform brew/winget/apt commands and
 *     download URLs
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectGit,
  detectGh,
  detectGhAuth,
  detectAll,
  getInstallHints,
} from '../ToolsDetector';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Build a window.electronAPI stub with a runCommand mock.
 * runCommandImpl: (command, args, cwd, timeout) → { stdout, stderr, exitCode }
 */
function setupRunCommand(
  runCommandImpl?: (
    command: string,
    args: string[],
    cwd?: string,
    timeout?: number,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
  platform?: string,
) {
  const runCommand = vi.fn(
    runCommandImpl ?? (() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })),
  );
  vi.stubGlobal('window', {
    electronAPI: { fs: { runCommand }, platform },
  });
  return runCommand;
}

describe('detectGit', () => {
  it('returns present:true + version string on exit 0', async () => {
    setupRunCommand(async () => ({
      stdout: 'git version 2.42.0',
      stderr: '',
      exitCode: 0,
    }));
    expect(await detectGit()).toEqual({
      present: true,
      version: 'git version 2.42.0',
    });
  });

  it('uses --version flag', async () => {
    const runCommand = setupRunCommand();
    await detectGit();
    expect(runCommand).toHaveBeenCalledWith('git', ['--version'], undefined, 5000);
  });

  it('returns first stdout line as version (ignores extra output)', async () => {
    // Some git wrappers emit multi-line --version output; we only
    // want the first line.
    setupRunCommand(async () => ({
      stdout: 'git version 2.42.0\nWith plugins: foo, bar',
      stderr: '',
      exitCode: 0,
    }));
    const result = await detectGit();
    expect(result.version).toBe('git version 2.42.0');
  });

  it('returns present:false on non-zero exit code', async () => {
    setupRunCommand(async () => ({ stdout: '', stderr: 'oops', exitCode: 127 }));
    expect(await detectGit()).toEqual({ present: false, version: null });
  });

  it('returns present:false when runCommand throws (command not found)', async () => {
    // Critical: a thrown promise from runCommand (e.g. ENOENT)
    // would crash the detector — must be caught.
    setupRunCommand(() => { throw new Error('command not found'); });
    expect(await detectGit()).toEqual({ present: false, version: null });
  });

  it('returns present:false when electronAPI.fs is absent (web context)', async () => {
    // Defensive — web-only builds (no Electron) shouldn't crash;
    // just report tools as missing.
    vi.stubGlobal('window', { electronAPI: {} });
    expect(await detectGit()).toEqual({ present: false, version: null });
  });

  it('returns present:false when electronAPI is absent entirely', async () => {
    vi.stubGlobal('window', {});
    expect(await detectGit()).toEqual({ present: false, version: null });
  });

  it('passes 5-second timeout to runCommand', async () => {
    // The timeout is the safety against a hung subprocess
    // blocking startup. Pin so a future refactor doesn't drop it.
    const runCommand = setupRunCommand();
    await detectGit();
    expect(runCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      undefined,
      5000,
    );
  });
});

describe('detectGh', () => {
  it('invokes the gh binary', async () => {
    const runCommand = setupRunCommand();
    await detectGh();
    expect(runCommand).toHaveBeenCalledWith('gh', ['--version'], undefined, 5000);
  });

  it('returns gh version on exit 0', async () => {
    setupRunCommand(async () => ({
      stdout: 'gh version 2.45.0 (2024-04-04)',
      stderr: '',
      exitCode: 0,
    }));
    const result = await detectGh();
    expect(result.present).toBe(true);
    expect(result.version).toBe('gh version 2.45.0 (2024-04-04)');
  });
});

describe('detectGhAuth', () => {
  it('parses username from "Logged in to github.com account <user>" format', async () => {
    setupRunCommand(async () => ({
      stdout: '',
      stderr: '✓ Logged in to github.com account octocat (oauth_token)',
      exitCode: 0,
    }));
    const result = await detectGhAuth();
    expect(result.authenticated).toBe(true);
    expect(result.username).toBe('octocat');
  });

  it('also parses "Logged in to github.com as <user>" (legacy format)', async () => {
    // gh CLI's output has changed between versions; both shapes
    // appear in the wild. The regex MUST match both.
    setupRunCommand(async () => ({
      stdout: '',
      stderr: '✓ Logged in to github.com as octocat (oauth_token)',
      exitCode: 0,
    }));
    const result = await detectGhAuth();
    expect(result.username).toBe('octocat');
  });

  it('combines stdout + stderr for matching (gh writes to either)', async () => {
    // gh CLI sometimes writes to stdout, sometimes to stderr,
    // depending on version. The detector combines both so the
    // username parse works regardless.
    setupRunCommand(async () => ({
      stdout: 'Logged in to github.com account stdout-user',
      stderr: '',
      exitCode: 0,
    }));
    const result = await detectGhAuth();
    expect(result.username).toBe('stdout-user');
  });

  it('returns authenticated:false on non-zero exit', async () => {
    setupRunCommand(async () => ({
      stdout: '',
      stderr: 'You are not logged in',
      exitCode: 1,
    }));
    const result = await detectGhAuth();
    expect(result.authenticated).toBe(false);
    expect(result.username).toBeNull();
    expect(result.raw).toContain('not logged in');
  });

  it('returns authenticated:false + username:null when authenticated but format unparseable', async () => {
    // Defensive — exit 0 with unexpected stdout format. We still
    // report authenticated (the exit code is trustworthy) but
    // username is null for the UI to handle gracefully.
    setupRunCommand(async () => ({
      stdout: 'You appear authenticated but no username',
      stderr: '',
      exitCode: 0,
    }));
    const result = await detectGhAuth();
    expect(result.authenticated).toBe(true);
    expect(result.username).toBeNull();
  });

  it('captures runCommand error in the raw field', async () => {
    setupRunCommand(() => { throw new Error('subprocess crashed'); });
    const result = await detectGhAuth();
    expect(result.authenticated).toBe(false);
    expect(result.raw).toContain('subprocess crashed');
  });

  it('returns safe default when electronAPI.fs is missing', async () => {
    vi.stubGlobal('window', { electronAPI: {} });
    const result = await detectGhAuth();
    expect(result).toEqual({ authenticated: false, username: null, raw: '' });
  });

  it('uses 10-second timeout (auth check is slower than version)', async () => {
    const runCommand = setupRunCommand();
    await detectGhAuth();
    expect(runCommand).toHaveBeenCalledWith(
      'gh',
      ['auth', 'status'],
      undefined,
      10000,
    );
  });
});

describe('detectAll', () => {
  it('runs git + gh detection in parallel', async () => {
    // Both calls should be issued before either resolves.
    const order: string[] = [];
    setupRunCommand(async (cmd) => {
      order.push(`${cmd}-called`);
      await new Promise(resolve => setTimeout(resolve, 0));
      order.push(`${cmd}-returned`);
      return { stdout: `${cmd} version`, stderr: '', exitCode: 0 };
    });
    await detectAll();
    // Both 'called' entries should appear before either 'returned'.
    const gitCalledIdx = order.indexOf('git-called');
    const ghCalledIdx = order.indexOf('gh-called');
    const gitReturnedIdx = order.indexOf('git-returned');
    expect(Math.max(gitCalledIdx, ghCalledIdx))
      .toBeLessThan(gitReturnedIdx);
  });

  it('skips ghAuth when gh is missing', async () => {
    // gh auth would just fail without gh installed; the detector
    // optimizes by skipping. Pin so a future refactor doesn't
    // re-introduce the extra call.
    const runCommand = setupRunCommand(async (cmd) => {
      if (cmd === 'gh') return { stdout: '', stderr: '', exitCode: 127 };
      return { stdout: 'git version 2.42.0', stderr: '', exitCode: 0 };
    });
    const result = await detectAll();
    expect(result.ghAuth).toBeNull();
    // gh was called ONCE for --version, never again for auth.
    const ghCalls = runCommand.mock.calls.filter(c => c[0] === 'gh');
    expect(ghCalls).toHaveLength(1);
  });

  it('runs ghAuth when gh is present', async () => {
    const runCommand = setupRunCommand(async (cmd, args) => {
      if (cmd === 'gh' && args[0] === '--version') {
        return { stdout: 'gh version 2.45.0', stderr: '', exitCode: 0 };
      }
      if (cmd === 'gh' && args.join(' ') === 'auth status') {
        return {
          stdout: '',
          stderr: 'Logged in to github.com account testuser',
          exitCode: 0,
        };
      }
      return { stdout: 'git version 2.42.0', stderr: '', exitCode: 0 };
    });
    const result = await detectAll();
    expect(result.ghAuth?.authenticated).toBe(true);
    expect(result.ghAuth?.username).toBe('testuser');
    // gh ran twice: --version + auth status.
    const ghCalls = runCommand.mock.calls.filter(c => c[0] === 'gh');
    expect(ghCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getInstallHints', () => {
  it('returns brew commands on darwin', () => {
    setupRunCommand(undefined, 'darwin');
    const hints = getInstallHints();
    expect(hints.manager).toBe('brew');
    expect(hints.gitCommand).toContain('brew install git');
    expect(hints.ghCommand).toContain('brew install gh');
    expect(hints.bothCommand).toContain('brew install git gh');
  });

  it('returns winget commands on win32', () => {
    setupRunCommand(undefined, 'win32');
    const hints = getInstallHints();
    expect(hints.manager).toBe('winget');
    expect(hints.gitCommand).toContain('winget');
    expect(hints.ghCommand).toContain('winget');
    expect(hints.bothCommand).toContain('Git.Git');
    expect(hints.bothCommand).toContain('GitHub.cli');
  });

  it('falls back to apt commands for Linux / unknown platforms', () => {
    setupRunCommand(undefined, 'linux');
    const hints = getInstallHints();
    expect(hints.manager).toBe('apt');
    expect(hints.gitCommand).toContain('apt install git');
    expect(hints.ghCommand).toContain('apt install gh');
  });

  it('returns apt fallback when no platform is set', () => {
    // Defensive — when electronAPI is missing OR platform is
    // undefined (e.g. web fallback), still return something so
    // the missing-tools card can display SOMETHING useful.
    vi.stubGlobal('window', {});
    const hints = getInstallHints();
    expect(hints.manager).toBe('apt');
  });

  it('includes download URLs for users who can\'t use a package manager', () => {
    setupRunCommand(undefined, 'darwin');
    const hints = getInstallHints();
    expect(hints.gitDownloadUrl).toMatch(/^https:\/\/git-scm\.com/);
    expect(hints.ghDownloadUrl).toMatch(/^https:\/\/github\.com\/cli\/cli/);
  });
});
