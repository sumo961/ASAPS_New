/**
 * Tests for advanced GitAdapter operations not covered by GitAdapter.test.ts
 * and GitAdapterOps.test.ts:
 *
 * - gitStageAll, gitInit, gitAddRemote, gitListRemotes
 * - gitConfigSet, gitConfigGet
 * - gitAbortMerge, gitAbortRebase, gitDetectMergeState
 * - gitResolveAllConflicts, gitContinueMergeOrRebase, gitResolveAllAndComplete
 * - gitClone
 * - Push/pull upstream auto-setup paths
 * - OS_IGNORED file filtering (.DS_Store)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGitStatus,
  gitStageAll,
  gitInit,
  gitAddRemote,
  gitListRemotes,
  gitConfigSet,
  gitConfigGet,
  gitAbortMerge,
  gitAbortRebase,
  gitDetectMergeState,
  gitResolveAllConflicts,
  gitContinueMergeOrRebase,
  gitResolveAllAndComplete,
  gitClone,
  gitPush,
  gitPull,
  gitUnstage,
  gitDiff,
} from '../GitAdapter';

function createMockElectronAPI(runCommand: any, fsOverrides: any = {}) {
  return {
    fs: { runCommand, ...fsOverrides },
    isElectron: true,
  };
}

describe('GitAdapter Advanced Operations', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  // ==========================================================================
  // OS_IGNORED filtering
  // ==========================================================================
  describe('getGitStatus - OS file filtering', () => {
    it('should filter out .DS_Store files', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: ' M project.json\n?? .DS_Store\n?? subdir/.DS_Store\n M real-file.json\n',
          stderr: '',
          exitCode: 0,
        });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');
      expect(status.files).toHaveLength(2);
      expect(status.files.map(f => f.path)).toEqual(['project.json', 'real-file.json']);
    });

    it('should filter out Thumbs.db and Desktop.ini', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: '?? Thumbs.db\n?? Desktop.ini\n M real.json\n',
          stderr: '',
          exitCode: 0,
        });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');
      expect(status.files).toHaveLength(1);
      expect(status.files[0].path).toBe('real.json');
    });
  });

  // ==========================================================================
  // gitStageAll
  // ==========================================================================
  describe('gitStageAll', () => {
    it('stages all changes', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStageAll('/project');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Staged all changes');
      expect(runCommand).toHaveBeenCalledWith('git', ['add', '-A'], '/project');
    });

    it('returns error on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'fatal: error', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStageAll('/project');
      expect(result.success).toBe(false);
      expect(result.message).toContain('fatal: error');
    });
  });

  // ==========================================================================
  // gitUnstage - fallback to rm --cached
  // ==========================================================================
  describe('gitUnstage - fresh repo fallback', () => {
    it('falls back to git rm --cached when reset fails (fresh repo)', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: ambiguous argument HEAD', exitCode: 1 }) // reset fails
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // rm --cached succeeds
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitUnstage('/project', ['new-file.json']);

      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['rm', '--cached', '--', 'new-file.json'], '/project');
    });
  });

  // ==========================================================================
  // gitInit
  // ==========================================================================
  describe('gitInit', () => {
    it('initializes a new repo and creates .gitignore', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Initialized empty Git repository in /project/.git/',
        stderr: '',
        exitCode: 0,
      });
      const exists = vi.fn().mockResolvedValue(false);
      const writeFile = vi.fn().mockResolvedValue(undefined);

      (window as any).electronAPI = {
        fs: { runCommand, exists, writeFile },
        isElectron: true,
      };

      const result = await gitInit('/project');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Initialized');
      expect(runCommand).toHaveBeenCalledWith('git', ['-c', 'init.defaultBranch=main', 'init'], '/project');
      expect(exists).toHaveBeenCalledWith('/project/.gitignore');
      expect(writeFile).toHaveBeenCalledWith('/project/.gitignore', expect.stringContaining('.DS_Store'));
    });

    it('does not overwrite existing .gitignore', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: 'Initialized', stderr: '', exitCode: 0 });
      const exists = vi.fn().mockResolvedValue(true);
      const writeFile = vi.fn();

      (window as any).electronAPI = {
        fs: { runCommand, exists, writeFile },
        isElectron: true,
      };

      await gitInit('/project');
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('returns error when git init fails', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'permission denied', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitInit('/project');
      expect(result.success).toBe(false);
      expect(result.message).toContain('permission denied');
    });

    it('succeeds even if .gitignore creation fails', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: 'Initialized', stderr: '', exitCode: 0 });
      const exists = vi.fn().mockRejectedValue(new Error('FS error'));

      (window as any).electronAPI = {
        fs: { runCommand, exists },
        isElectron: true,
      };

      const result = await gitInit('/project');
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // gitAddRemote / gitListRemotes
  // ==========================================================================
  describe('gitAddRemote', () => {
    it('adds a remote', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitAddRemote('/project', 'origin', 'https://github.com/user/repo.git');

      expect(result.success).toBe(true);
      expect(result.message).toContain("Added remote 'origin'");
      expect(runCommand).toHaveBeenCalledWith(
        'git', ['remote', 'add', 'origin', 'https://github.com/user/repo.git'], '/project'
      );
    });

    it('returns error when remote already exists', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '', stderr: 'fatal: remote origin already exists.', exitCode: 3,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitAddRemote('/project', 'origin', 'https://example.com/repo.git');
      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });
  });

  describe('gitListRemotes', () => {
    it('parses remote list with deduplication', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'origin\thttps://github.com/user/repo.git (fetch)\norigin\thttps://github.com/user/repo.git (push)\nupstream\thttps://github.com/other/repo.git (fetch)\nupstream\thttps://github.com/other/repo.git (push)\n',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const remotes = await gitListRemotes('/project');

      expect(remotes).toHaveLength(2);
      expect(remotes[0]).toEqual({ name: 'origin', url: 'https://github.com/user/repo.git' });
      expect(remotes[1]).toEqual({ name: 'upstream', url: 'https://github.com/other/repo.git' });
    });

    it('returns empty array when no remotes', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const remotes = await gitListRemotes('/project');
      expect(remotes).toEqual([]);
    });

    it('returns empty array on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const remotes = await gitListRemotes('/project');
      expect(remotes).toEqual([]);
    });
  });

  // ==========================================================================
  // gitConfigSet / gitConfigGet
  // ==========================================================================
  describe('gitConfigSet', () => {
    it('sets a config value', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitConfigSet('/project', 'user.name', 'Test User');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Set user.name');
      expect(runCommand).toHaveBeenCalledWith('git', ['config', 'user.name', 'Test User'], '/project');
    });

    it('returns error for invalid key', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'error: key does not contain a section', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitConfigSet('/project', 'invalid', 'value');
      expect(result.success).toBe(false);
    });
  });

  describe('gitConfigGet', () => {
    it('returns config value', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: 'Test User\n', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const value = await gitConfigGet('/project', 'user.name');
      expect(value).toBe('Test User');
    });

    it('returns null for missing key', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const value = await gitConfigGet('/project', 'user.nonexistent');
      expect(value).toBeNull();
    });
  });

  // ==========================================================================
  // gitAbortMerge / gitAbortRebase
  // ==========================================================================
  describe('gitAbortMerge', () => {
    it('aborts an in-progress merge', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitAbortMerge('/project');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Merge aborted');
      expect(runCommand).toHaveBeenCalledWith('git', ['merge', '--abort'], '/project');
    });

    it('returns error when no merge in progress', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'fatal: There is no merge to abort', exitCode: 128 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitAbortMerge('/project');
      expect(result.success).toBe(false);
      expect(result.message).toContain('no merge');
    });
  });

  describe('gitAbortRebase', () => {
    it('aborts an in-progress rebase', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitAbortRebase('/project');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rebase aborted');
      expect(runCommand).toHaveBeenCalledWith('git', ['rebase', '--abort'], '/project');
    });
  });

  // ==========================================================================
  // gitDetectMergeState
  // ==========================================================================
  describe('gitDetectMergeState', () => {
    it('detects merge state from git status output', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'On branch main\nYou have unmerged paths.\n  (fix conflicts and run "git commit")',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const state = await gitDetectMergeState('/project');
      expect(state).toBe('merge');
    });

    it('detects rebase state from git status output', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'interactive rebase in progress; onto abc1234\nLast command done:\n   pick abc1234 message',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const state = await gitDetectMergeState('/project');
      expect(state).toBe('rebase');
    });

    it('detects "All conflicts fixed but you are still merging"', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'On branch main\nAll conflicts fixed but you are still merging.\n',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const state = await gitDetectMergeState('/project');
      expect(state).toBe('merge');
    });

    it('falls back to MERGE_HEAD check when status is clean', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'On branch main\nnothing to commit', stderr: '', exitCode: 0 }) // git status
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '', exitCode: 0 }); // rev-parse MERGE_HEAD
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const state = await gitDetectMergeState('/project');
      expect(state).toBe('merge');
    });

    it('returns null when no merge or rebase is in progress', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'On branch main\nnothing to commit', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: Not a valid object name', exitCode: 128 }); // No MERGE_HEAD
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const state = await gitDetectMergeState('/project');
      expect(state).toBeNull();
    });
  });

  // ==========================================================================
  // gitResolveAllConflicts
  // ==========================================================================
  describe('gitResolveAllConflicts', () => {
    it('resolves all conflicts keeping local (merge)', async () => {
      const runCommand = vi.fn()
        // gitGetConflicts: status --porcelain
        .mockResolvedValueOnce({ stdout: 'UU file1.json\nUU file2.json\n', stderr: '', exitCode: 0 })
        // checkout --ours file1.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // add file1.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // checkout --ours file2.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // add file2.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveAllConflicts('/project', true, false);

      expect(result.success).toBe(true);
      expect(result.message).toContain('local');
      expect(result.message).toContain('2 conflict');
      // In merge: keepMine=true → --ours
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['checkout', '--ours', '--', 'file1.json'], '/project');
    });

    it('resolves all conflicts keeping remote (merge)', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'UU file1.json\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveAllConflicts('/project', false, false);

      expect(result.success).toBe(true);
      expect(result.message).toContain('remote');
      // In merge: keepMine=false → --theirs
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['checkout', '--theirs', '--', 'file1.json'], '/project');
    });

    it('swaps ours/theirs in rebase mode', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'UU file1.json\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      // keepMine=true + isRebase=true → --theirs (swapped!)
      await gitResolveAllConflicts('/project', true, true);
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['checkout', '--theirs', '--', 'file1.json'], '/project');
    });

    it('returns success when no conflicts exist', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: ' M clean-file.json\n', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveAllConflicts('/project', true, false);
      expect(result.success).toBe(true);
      expect(result.message).toContain('No conflicts');
    });

    it('returns error when checkout fails', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'UU broken.json\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'error: path broken.json is unmerged', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveAllConflicts('/project', true, false);
      expect(result.success).toBe(false);
      expect(result.message).toContain('broken.json');
    });
  });

  // ==========================================================================
  // gitContinueMergeOrRebase
  // ==========================================================================
  describe('gitContinueMergeOrRebase', () => {
    it('commits for merge', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '[main abc1234] Merge branch feature',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitContinueMergeOrRebase('/project', false);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Merge committed');
      expect(runCommand).toHaveBeenCalledWith('git', ['commit', '--no-edit'], '/project');
    });

    it('continues rebase with editor disabled', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Successfully rebased and updated refs/heads/main.',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitContinueMergeOrRebase('/project', true);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rebase completed');
      expect(runCommand).toHaveBeenCalledWith('git', ['-c', 'core.editor=true', 'rebase', '--continue'], '/project');
    });

    it('returns error when continue fails', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '', stderr: 'error: could not apply commit', exitCode: 1,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitContinueMergeOrRebase('/project', true);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // gitResolveAllAndComplete
  // ==========================================================================
  describe('gitResolveAllAndComplete', () => {
    it('resolves and completes a simple merge', async () => {
      // Trace through gitResolveAllAndComplete for a merge with 1 conflict:
      // 1. gitGetConflicts → runCommand('git', ['status', '--porcelain'])
      // 2. gitResolveAllConflicts:
      //    a. gitGetConflicts → runCommand('git', ['status', '--porcelain'])
      //    b. checkout --ours file.json → runCommand
      //    c. add file.json → runCommand
      // 3. gitContinueMergeOrRebase (merge) → runCommand('git', ['commit', '--no-edit'])
      // 4. gitDetectMergeState:
      //    a. runCommand('git', ['status'])
      //    b. runCommand('git', ['rev-parse', '--verify', 'MERGE_HEAD'])
      const runCommand = vi.fn()
        // (1) gitGetConflicts in main loop
        .mockResolvedValueOnce({ stdout: 'UU file.json\n', stderr: '', exitCode: 0 })
        // (2a) gitGetConflicts inside gitResolveAllConflicts
        .mockResolvedValueOnce({ stdout: 'UU file.json\n', stderr: '', exitCode: 0 })
        // (2b) checkout --ours file.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // (2c) add file.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // (3) git commit --no-edit
        .mockResolvedValueOnce({ stdout: 'Merge committed', stderr: '', exitCode: 0 })
        // (4a) git status (detect merge state)
        .mockResolvedValueOnce({ stdout: 'On branch main\nnothing to commit', stderr: '', exitCode: 0 })
        // (4b) rev-parse MERGE_HEAD (no merge)
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal', exitCode: 128 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const onProgress = vi.fn();
      const result = await gitResolveAllAndComplete('/project', true, false, onProgress);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Merge completed');
      expect(result.message).toContain('1 conflict');
      expect(onProgress).toHaveBeenCalled();
    });

    it('loops through multiple rebase steps', async () => {
      // Step 1: resolve 1 conflict, continue rebase → fails with new conflict
      // Step 2: resolve new conflict, continue rebase → success
      const runCommand = vi.fn()
        // Step 1: (1) gitGetConflicts in loop
        .mockResolvedValueOnce({ stdout: 'UU file.json\n', stderr: '', exitCode: 0 })
        // Step 1: (2a) gitGetConflicts in gitResolveAllConflicts
        .mockResolvedValueOnce({ stdout: 'UU file.json\n', stderr: '', exitCode: 0 })
        // Step 1: (2b) checkout --theirs
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // Step 1: (2c) add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // Step 1: (3) rebase --continue → fails
        .mockResolvedValueOnce({ stdout: '', stderr: 'CONFLICT', exitCode: 1 })
        // Step 1: (4) gitGetConflicts after failed continue
        .mockResolvedValueOnce({ stdout: 'UU file2.json\n', stderr: '', exitCode: 0 })
        // Step 2: (1) gitGetConflicts in loop
        .mockResolvedValueOnce({ stdout: 'UU file2.json\n', stderr: '', exitCode: 0 })
        // Step 2: (2a) gitGetConflicts in gitResolveAllConflicts
        .mockResolvedValueOnce({ stdout: 'UU file2.json\n', stderr: '', exitCode: 0 })
        // Step 2: (2b) checkout --theirs
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // Step 2: (2c) add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // Step 2: (3) rebase --continue → success
        .mockResolvedValueOnce({ stdout: 'Successfully rebased', stderr: '', exitCode: 0 })
        // Step 2: (4a) git status
        .mockResolvedValueOnce({ stdout: 'On branch main\nnothing to commit', stderr: '', exitCode: 0 })
        // Step 2: (4b) rev-parse MERGE_HEAD (no merge)
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal', exitCode: 128 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveAllAndComplete('/project', true, true);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Rebase completed');
      expect(result.message).toContain('2 conflict');
    });
  });

  // ==========================================================================
  // gitClone
  // ==========================================================================
  describe('gitClone', () => {
    it('clones a repository', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: "Cloning into '/target'...\n",
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitClone('https://github.com/user/repo.git', '/target');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Cloning');
      expect(runCommand).toHaveBeenCalledWith('git', ['clone', 'https://github.com/user/repo.git', '/target'], undefined, 300000);
    });

    it('returns error on clone failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'fatal: repository not found',
        exitCode: 128,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitClone('https://github.com/user/nonexistent.git', '/target');
      expect(result.success).toBe(false);
      expect(result.message).toContain('repository not found');
    });

    it('throws when runCommand is not available', async () => {
      (window as any).electronAPI = { fs: {} };
      await expect(gitClone('url', '/target')).rejects.toThrow('Electron runCommand API');
    });
  });

  // ==========================================================================
  // gitPush - upstream auto-setup
  // ==========================================================================
  describe('gitPush - upstream auto-setup', () => {
    it('auto-sets upstream on first push (no tracking info)', async () => {
      const runCommand = vi.fn()
        // First push fails — no upstream
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: The current branch feature has no upstream branch.', exitCode: 1 })
        // Get current branch
        .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '', exitCode: 0 })
        // Retry with -u
        .mockResolvedValueOnce({ stdout: '', stderr: 'Branch feature set up to track remote branch', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPush('/project');

      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenNthCalledWith(3, 'git', ['push', '-u', 'origin', 'feature'], '/project');
    });

    it('handles push -u failure', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: has no upstream branch', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: remote origin not configured', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPush('/project');
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // gitPull - upstream auto-setup
  // ==========================================================================
  describe('gitPull - upstream auto-setup', () => {
    it('auto-sets upstream on first pull (no tracking info)', async () => {
      const runCommand = vi.fn()
        // First pull fails
        .mockResolvedValueOnce({ stdout: '', stderr: 'There is no tracking information for the current branch.', exitCode: 1 })
        // Get current branch
        .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '', exitCode: 0 })
        // Set upstream
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        // Retry pull
        .mockResolvedValueOnce({ stdout: 'Updating abc..def', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPull('/project');

      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenNthCalledWith(3, 'git', ['branch', '--set-upstream-to', 'origin/feature', 'feature'], '/project');
      expect(runCommand).toHaveBeenNthCalledWith(4, 'git', ['pull', 'origin', 'feature'], '/project');
    });

    it('auto-sets upstream on first pull --rebase', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'There is no tracking information', stderr: '', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'Successfully rebased', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPull('/project', true);

      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenNthCalledWith(4, 'git', ['pull', '--rebase', 'origin', 'main'], '/project');
    });
  });

  // ==========================================================================
  // gitDiff - staged fallback
  // ==========================================================================
  describe('gitDiff - staged diff fallback', () => {
    it('falls back to staged diff when working diff is empty', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // working diff empty
        .mockResolvedValueOnce({ stdout: '--- staged diff ---', stderr: '', exitCode: 0 }); // staged diff
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const diff = await gitDiff('/project', 'staged-file.json');
      expect(diff).toBe('--- staged diff ---');
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['diff', '--cached', '--', 'staged-file.json'], '/project');
    });
  });
});
