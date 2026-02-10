import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getP4Status, p4Edit, p4Revert, getP4Locks } from '../PerforceAdapter';

function createMockElectronAPI(runCommand: any) {
  return {
    fs: { runCommand },
    isElectron: true,
  };
}

describe('PerforceAdapter', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  describe('getP4Status', () => {
    it('throws when runCommand is not available', async () => {
      (window as any).electronAPI = { fs: {} };
      await expect(getP4Status('/test')).rejects.toThrow('Electron runCommand API');
    });

    it('returns disconnected status when p4 info fails', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'Connect failed',
        exitCode: 1,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getP4Status('/project');
      expect(status.connected).toBe(false);
      expect(status.clientName).toBe('');
      expect(status.openedFiles).toEqual([]);
    });

    it('parses client name and opened files', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({ // p4 info
          stdout: `User name: dev_user\nClient name: my-workspace\nClient root: /p4/root\nServer address: perforce:1666\n`,
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ // p4 opened
          stdout: "//depot/project/beat1.json#3 - edit change 12345 (text)\n//depot/project/beat2.json#1 - add change 67890 (text)\n",
          stderr: '',
          exitCode: 0,
        });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getP4Status('/project');

      expect(status.connected).toBe(true);
      expect(status.clientName).toBe('my-workspace');
      expect(status.openedFiles.length).toBe(2);
      expect(status.openedFiles[0].depotFile).toBe('//depot/project/beat1.json');
      expect(status.openedFiles[0].action).toBe('edit');
      expect(status.openedFiles[0].change).toBe('12345');
      expect(status.openedFiles[1].depotFile).toBe('//depot/project/beat2.json');
      expect(status.openedFiles[1].action).toBe('add');
    });

    it('handles no opened files', async () => {
      const runCommand = vi.fn()
        .mockResolvedValueOnce({
          stdout: 'Client name: ws\nClient root: /root\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const status = await getP4Status('/project');
      expect(status.connected).toBe(true);
      expect(status.clientName).toBe('ws');
      expect(status.openedFiles).toEqual([]);
    });
  });

  describe('p4Edit', () => {
    it('returns true on successful checkout', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '//depot/file.json#1 - opened for edit\n',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      expect(await p4Edit('/project/file.json', '/project')).toBe(true);
      expect(runCommand).toHaveBeenCalledWith('p4', ['edit', '/project/file.json'], '/project');
    });

    it('returns false on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'file not on client',
        exitCode: 1,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);
      expect(await p4Edit('/project/file.json', '/project')).toBe(false);
    });

    it('returns false when runCommand not available', async () => {
      (window as any).electronAPI = { fs: {} };
      expect(await p4Edit('/file', '/project')).toBe(false);
    });
  });

  describe('p4Revert', () => {
    it('returns true on successful revert', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '//depot/file.json#1 - was edit, reverted\n',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);
      expect(await p4Revert('/project/file.json', '/project')).toBe(true);
    });

    it('returns false on failure', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);
      expect(await p4Revert('/project/file.json', '/project')).toBe(false);
    });
  });

  describe('getP4Locks', () => {
    it('parses lock output into a map', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: `//depot/project/beat1.json - alice@workspace1\n//depot/project/beat2.json - bob@workspace2\n`,
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const locks = await getP4Locks('/project');
      expect(locks.size).toBe(2);
      expect(locks.get('//depot/project/beat1.json')).toBe('alice@workspace1');
      expect(locks.get('//depot/project/beat2.json')).toBe('bob@workspace2');
    });

    it('returns empty map when no locks', async () => {
      const runCommand = vi.fn().mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      (window as any).electronAPI = createMockElectronAPI(runCommand);

      const locks = await getP4Locks('/project');
      expect(locks.size).toBe(0);
    });

    it('returns empty map when runCommand not available', async () => {
      (window as any).electronAPI = { fs: {} };
      const locks = await getP4Locks('/project');
      expect(locks.size).toBe(0);
    });
  });
});
