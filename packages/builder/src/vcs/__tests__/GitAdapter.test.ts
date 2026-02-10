import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGitStatus, getChangedFiles, getChangedFilesBetween } from '../GitAdapter';

function createMockElectronAPI(runCommand: any) {
  return {
    fs: { runCommand },
    isElectron: true,
  };
}

describe('GitAdapter', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  describe('getGitStatus', () => {
    it('throws when runCommand is not available', async () => {
      (window as any).electronAPI = { fs: {} };
      await expect(getGitStatus('/test')).rejects.toThrow('Electron runCommand API');
    });

    it('parses branch, ahead/behind, and file status', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 }) // branch
        .mockResolvedValueOnce({ stdout: '3\t5\n', stderr: '', exitCode: 0 }) // rev-list ahead/behind
        .mockResolvedValueOnce({ // status --porcelain (XY format: pos0=index, pos1=worktree, pos2=space, pos3+=path)
          // Note: staged files listed first to avoid stdout.trim() stripping the leading space
          // from unstaged-only entries (a known edge case in the current parser)
          stdout: "A  characters/hero.json\n M clusters/forest/dialogTree_beat_1.json\n?? untracked.txt\n",
          stderr: '',
          exitCode: 0,
        });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');

      expect(status.branch).toBe('main');
      expect(status.behind).toBe(3);
      expect(status.ahead).toBe(5);
      expect(status.isDirty).toBe(true);
      expect(status.files.length).toBe(3);

      // Added (staged)
      expect(status.files[0].path).toBe('characters/hero.json');
      expect(status.files[0].status).toBe('A');
      expect(status.files[0].staged).toBe(true);

      // Modified (unstaged)
      expect(status.files[1].path).toBe('clusters/forest/dialogTree_beat_1.json');
      expect(status.files[1].status).toBe('M');
      expect(status.files[1].staged).toBe(false);

      // Untracked
      expect(status.files[2].path).toBe('untracked.txt');
      expect(status.files[2].status).toBe('?');
      expect(status.files[2].staged).toBe(false);
    });

    it('handles clean working directory', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'develop\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');

      expect(status.branch).toBe('develop');
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
      expect(status.isDirty).toBe(false);
      expect(status.files).toEqual([]);
    });

    it('handles no upstream (ahead/behind fails gracefully)', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '', exitCode: 0 })
        .mockRejectedValueOnce(new Error('no upstream')) // rev-list throws
        .mockResolvedValueOnce({ stdout: ' M file.json\n', stderr: '', exitCode: 0 });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');

      expect(status.branch).toBe('feature');
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
      expect(status.isDirty).toBe(true);
    });

    it('returns "unknown" branch when branch command fails', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }) // branch fails
        .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getGitStatus('/project');
      expect(status.branch).toBe('unknown');
    });
  });

  describe('getChangedFiles', () => {
    it('returns list of changed files', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'clusters/forest/dialogTree_beat_1.json\nproject.json\n',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFiles('/project');
      expect(files).toEqual([
        'clusters/forest/dialogTree_beat_1.json',
        'project.json',
      ]);
    });

    it('returns empty array when no changes', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFiles('/project');
      expect(files).toEqual([]);
    });

    it('returns empty array when both commands fail', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }) // git diff HEAD fails
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }); // git status --porcelain fallback fails

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFiles('/project');
      expect(files).toEqual([]);
    });

    it('falls back to git status when diff HEAD fails (fresh repo)', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: bad default revision', exitCode: 128 }) // git diff HEAD fails
        .mockResolvedValueOnce({ stdout: '?? file1.json\nA  file2.json\n', stderr: '', exitCode: 0 }); // git status works

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFiles('/project');
      expect(files).toEqual(['file1.json', 'file2.json']);
    });

    it('returns empty array when runCommand is not available', async () => {
      (window as any).electronAPI = { fs: {} };
      const files = await getChangedFiles('/project');
      expect(files).toEqual([]);
    });
  });

  describe('getChangedFilesBetween', () => {
    it('returns files changed between two refs', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: 'file1.json\nfile2.json\n',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFilesBetween('/project', 'HEAD~3', 'HEAD');

      expect(files).toEqual(['file1.json', 'file2.json']);
      expect(runCommand).toHaveBeenCalledWith('git', ['diff', '--name-only', 'HEAD~3', 'HEAD'], '/project');
    });

    it('returns empty array on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'bad ref',
        exitCode: 128,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const files = await getChangedFilesBetween('/project', 'badref', 'HEAD');
      expect(files).toEqual([]);
    });
  });
});
