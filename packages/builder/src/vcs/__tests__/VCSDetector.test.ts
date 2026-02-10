import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectVCS, type VCSInfo } from '../VCSDetector';

// Helper to create a mock electronAPI
function createMockElectronAPI(overrides: any = {}) {
  return {
    fs: {
      exists: vi.fn().mockResolvedValue(false),
      runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 }),
      ...overrides,
    },
    isElectron: true,
  };
}

describe('VCSDetector', () => {
  let originalElectronAPI: any;

  beforeEach(() => {
    originalElectronAPI = (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  it('returns "none" when electronAPI is not available', async () => {
    (window as any).electronAPI = undefined;
    const result = await detectVCS('/test/path');
    expect(result.type).toBe('none');
  });

  it('returns "none" when electronAPI.fs is not available', async () => {
    (window as any).electronAPI = { isElectron: true };
    const result = await detectVCS('/test/path');
    expect(result.type).toBe('none');
  });

  it('detects Git when .git directory exists', async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ stdout: 'main\n', stderr: '', exitCode: 0 }) // branch
      .mockResolvedValueOnce({ stdout: '/repo/root\n', stderr: '', exitCode: 0 }); // toplevel

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockImplementation(async (path: string) => path.endsWith('.git')),
      runCommand,
    });

    const result = await detectVCS('/test/project');

    expect(result.type).toBe('git');
    expect(result.branch).toBe('main');
    expect(result.repoRoot).toBe('/repo/root');
  });

  it('detects Git via git rev-parse when .git not at project root', async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ stdout: '.git\n', stderr: '', exitCode: 0 }) // rev-parse --git-dir
      .mockResolvedValueOnce({ stdout: 'feature/branch\n', stderr: '', exitCode: 0 }) // branch
      .mockResolvedValueOnce({ stdout: '/repo/root\n', stderr: '', exitCode: 0 }); // toplevel

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockResolvedValue(false),
      runCommand,
    });

    const result = await detectVCS('/test/project');

    expect(result.type).toBe('git');
    expect(result.branch).toBe('feature/branch');
  });

  it('detects Perforce when p4 info succeeds', async () => {
    const p4Output = `User name: dev_user
Client name: my-workspace
Client host: devmachine
Client root: /p4/workspace
Server address: perforce:1666
`;

    const runCommand = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 }) // git rev-parse fails
      .mockResolvedValueOnce({ stdout: p4Output, stderr: '', exitCode: 0 }); // p4 info

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockResolvedValue(false),
      runCommand,
    });

    const result = await detectVCS('/test/project');

    expect(result.type).toBe('perforce');
    expect(result.branch).toBe('my-workspace');
    expect(result.repoRoot).toBe('/p4/workspace');
  });

  it('returns "none" when neither Git nor Perforce is detected', async () => {
    const runCommand = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 1 });

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockResolvedValue(false),
      runCommand,
    });

    const result = await detectVCS('/test/project');
    expect(result.type).toBe('none');
  });

  it('returns "none" when commands throw errors', async () => {
    const runCommand = vi.fn().mockRejectedValue(new Error('Command not found'));

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockRejectedValue(new Error('FS error')),
      runCommand,
    });

    const result = await detectVCS('/test/project');
    expect(result.type).toBe('none');
  });

  it('returns git type even when branch/root commands fail', async () => {
    const runCommand = vi.fn()
      .mockRejectedValueOnce(new Error('branch error')) // branch
      .mockRejectedValueOnce(new Error('root error')); // toplevel

    (window as any).electronAPI = createMockElectronAPI({
      exists: vi.fn().mockImplementation(async (path: string) => path.endsWith('.git')),
      runCommand,
    });

    const result = await detectVCS('/test/project');
    expect(result.type).toBe('git');
    expect(result.branch).toBeUndefined();
    expect(result.repoRoot).toBeUndefined();
  });
});
