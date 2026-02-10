import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gitStage, gitUnstage, gitCommit, gitPush, gitPull, gitFetch,
  gitStash, gitStashPop, gitListStashes, gitLog, gitDiff,
  gitListBranches, gitSwitchBranch, gitCreateBranch, gitMerge,
  gitRevertFiles, gitGetConflicts, gitResolveConflict,
} from '../GitAdapter';

function createMockElectronAPI(runCommand: any) {
  return {
    fs: { runCommand },
    isElectron: true,
  };
}

describe('GitAdapter Operations', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  describe('gitStage', () => {
    it('stages specified files', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStage('/project', ['file1.json', 'file2.json']);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Staged 2 file(s)');
      expect(runCommand).toHaveBeenCalledWith('git', ['add', '--', 'file1.json', 'file2.json'], '/project');
    });

    it('returns error on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: 'pathspec error', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStage('/project', ['nonexistent']);
      expect(result.success).toBe(false);
      expect(result.message).toContain('pathspec error');
    });

    it('throws when runCommand not available', async () => {
      (window as any).electronAPI = { fs: {} };
      await expect(gitStage('/project', ['file'])).rejects.toThrow('Electron runCommand API');
    });
  });

  describe('gitUnstage', () => {
    it('unstages specified files', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitUnstage('/project', ['file1.json']);

      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['reset', 'HEAD', '--', 'file1.json'], '/project');
    });
  });

  describe('gitCommit', () => {
    it('commits with message', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '[main abc1234] My commit message\n 1 file changed',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitCommit('/project', 'My commit message');

      expect(result.success).toBe(true);
      expect(result.message).toContain('abc1234');
      expect(runCommand).toHaveBeenCalledWith('git', ['commit', '-m', 'My commit message'], '/project');
    });

    it('returns error when nothing staged', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'nothing to commit',
        exitCode: 1,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitCommit('/project', 'test');
      expect(result.success).toBe(false);
      expect(result.message).toContain('nothing to commit');
    });
  });

  describe('gitPush', () => {
    it('pushes successfully', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'To origin\n abc..def main -> main',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPush('/project');
      expect(result.success).toBe(true);
    });

    it('returns error on rejection', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'rejected: non-fast-forward',
        exitCode: 1,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPush('/project');
      expect(result.success).toBe(false);
      expect(result.message).toContain('rejected');
    });
  });

  describe('gitPull', () => {
    it('pulls without rebase', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Updating abc..def\n 2 files changed',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitPull('/project');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['pull'], '/project');
    });

    it('pulls with rebase', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Successfully rebased',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      await gitPull('/project', true);
      expect(runCommand).toHaveBeenCalledWith('git', ['pull', '--rebase'], '/project');
    });
  });

  describe('gitFetch', () => {
    it('fetches successfully', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitFetch('/project');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['fetch'], '/project');
    });
  });

  describe('gitStash / gitStashPop', () => {
    it('stashes with message', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Saved working directory',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStash('/project', 'WIP: save my work');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['stash', 'push', '-m', 'WIP: save my work'], '/project');
    });

    it('stashes without message', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Saved working directory',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      await gitStash('/project');
      expect(runCommand).toHaveBeenCalledWith('git', ['stash', 'push'], '/project');
    });

    it('pops stash', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Applied stash',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitStashPop('/project');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['stash', 'pop'], '/project');
    });
  });

  describe('gitListStashes', () => {
    it('parses stash list', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'stash@{0}: On main: WIP\nstash@{1}: On feature: save progress\n',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const stashes = await gitListStashes('/project');
      expect(stashes).toHaveLength(2);
      expect(stashes[0]).toEqual({ index: 0, branch: 'main', message: 'WIP' });
      expect(stashes[1]).toEqual({ index: 1, branch: 'feature', message: 'save progress' });
    });

    it('returns empty array when no stashes', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const stashes = await gitListStashes('/project');
      expect(stashes).toEqual([]);
    });
  });

  describe('gitLog', () => {
    it('parses log entries with files', async () => {
      const SEP = '---GIT_LOG_SEP---';
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: `${SEP}\nabc1234567890\nJohn Doe\n2025-01-15 10:30:00 +0000\nFix bug in dialog tree\nclusters/forest/dialogTree_beat_1.json\nproject.json\n`,
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const log = await gitLog('/project', 10);
      expect(log).toHaveLength(1);
      expect(log[0].hash).toBe('abc1234567890');
      expect(log[0].author).toBe('John Doe');
      expect(log[0].message).toBe('Fix bug in dialog tree');
      expect(log[0].files).toEqual(['clusters/forest/dialogTree_beat_1.json', 'project.json']);
    });

    it('returns empty array on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const log = await gitLog('/project');
      expect(log).toEqual([]);
    });
  });

  describe('gitDiff', () => {
    it('returns diff content', async () => {
      const diffOutput = '--- a/file.json\n+++ b/file.json\n@@ -1,3 +1,3 @@\n-old\n+new\n';
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: diffOutput,
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const diff = await gitDiff('/project', 'file.json');
      expect(diff).toBe(diffOutput);
      expect(runCommand).toHaveBeenCalledWith('git', ['diff', '--', 'file.json'], '/project');
    });

    it('passes ref when provided', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'diff content',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      await gitDiff('/project', 'file.json', 'HEAD~1');
      expect(runCommand).toHaveBeenCalledWith('git', ['diff', 'HEAD~1', '--', 'file.json'], '/project');
    });
  });

  describe('gitListBranches', () => {
    it('parses local and remote branches', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '* main\n  feature-x\n  remotes/origin/main\n  remotes/origin/feature-x\n',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const branches = await gitListBranches('/project');
      expect(branches).toHaveLength(4);
      expect(branches[0]).toEqual({ name: 'main', current: true, remote: false });
      expect(branches[1]).toEqual({ name: 'feature-x', current: false, remote: false });
      expect(branches[2]).toEqual({ name: 'origin/main', current: false, remote: true });
    });

    it('returns empty array when no branches', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const branches = await gitListBranches('/project');
      expect(branches).toEqual([]);
    });
  });

  describe('gitSwitchBranch', () => {
    it('switches to a branch', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: "Switched to branch 'feature'",
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitSwitchBranch('/project', 'feature');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['checkout', 'feature'], '/project');
    });
  });

  describe('gitCreateBranch', () => {
    it('creates and switches to a new branch', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: "Switched to a new branch 'feature-y'",
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitCreateBranch('/project', 'feature-y');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['checkout', '-b', 'feature-y'], '/project');
    });

    it('creates from a start point', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: "Switched to a new branch 'hotfix'",
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      await gitCreateBranch('/project', 'hotfix', 'v1.0');
      expect(runCommand).toHaveBeenCalledWith('git', ['checkout', '-b', 'hotfix', 'v1.0'], '/project');
    });
  });

  describe('gitMerge', () => {
    it('merges a branch', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'Merge made by recursive',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitMerge('/project', 'feature');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('git', ['merge', 'feature'], '/project');
    });
  });

  describe('gitRevertFiles', () => {
    it('reverts specified files', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitRevertFiles('/project', ['file1.json', 'file2.json']);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Reverted 2 file(s)');
      expect(runCommand).toHaveBeenCalledWith('git', ['checkout', '--', 'file1.json', 'file2.json'], '/project');
    });
  });

  describe('gitGetConflicts', () => {
    it('parses UU entries from status', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'UU clusters/forest/dialogTree_beat_1.json\nUU project.json\n M other.json\n',
        stderr: '',
        exitCode: 0,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const conflicts = await gitGetConflicts('/project');
      expect(conflicts).toEqual([
        'clusters/forest/dialogTree_beat_1.json',
        'project.json',
      ]);
    });

    it('returns empty array when no conflicts', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({ stdout: ' M file.json\n', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const conflicts = await gitGetConflicts('/project');
      expect(conflicts).toEqual([]);
    });
  });

  describe('gitResolveConflict', () => {
    it('resolves conflict using ours', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // checkout --ours
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // git add
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveConflict('/project', 'file.json', 'ours');
      expect(result.success).toBe(true);
      expect(result.message).toContain('ours');
      expect(runCommand).toHaveBeenNthCalledWith(1, 'git', ['checkout', '--ours', '--', 'file.json'], '/project');
      expect(runCommand).toHaveBeenNthCalledWith(2, 'git', ['add', '--', 'file.json'], '/project');
    });

    it('resolves conflict using theirs', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveConflict('/project', 'file.json', 'theirs');
      expect(result.success).toBe(true);
      expect(runCommand).toHaveBeenNthCalledWith(1, 'git', ['checkout', '--theirs', '--', 'file.json'], '/project');
    });

    it('returns error when checkout fails', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'not a valid conflict path',
        exitCode: 1,
      });
      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const result = await gitResolveConflict('/project', 'file.json', 'ours');
      expect(result.success).toBe(false);
    });
  });
});
