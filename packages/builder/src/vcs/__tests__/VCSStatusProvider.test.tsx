import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { VCSStatusProvider, useVCSStatus, useRequiredVCSStatus } from '../VCSStatusProvider';

// Mock the VCS adapters
vi.mock('../VCSDetector', () => ({
  detectVCS: vi.fn().mockResolvedValue({ type: 'none' }),
}));

vi.mock('../GitAdapter', () => ({
  getGitStatus: vi.fn().mockResolvedValue({
    branch: 'main',
    files: [{ path: 'file.json', status: 'M', staged: false }],
    ahead: 1,
    behind: 2,
    isDirty: true,
  }),
  getChangedFiles: vi.fn().mockResolvedValue(['clusters/forest/dialogTree_beat_1.json']),
  gitGetConflicts: vi.fn().mockResolvedValue([]),
  gitInit: vi.fn().mockResolvedValue({ success: true, message: 'Initialized' }),
  gitAddRemote: vi.fn().mockResolvedValue({ success: true, message: 'Added remote' }),
  gitStage: vi.fn().mockResolvedValue({ success: true }),
  gitUnstage: vi.fn().mockResolvedValue({ success: true }),
  gitCommit: vi.fn().mockResolvedValue({ success: true }),
  gitPush: vi.fn().mockResolvedValue({ success: true }),
  gitPull: vi.fn().mockResolvedValue({ success: true }),
  gitFetch: vi.fn().mockResolvedValue({ success: true }),
  gitStash: vi.fn().mockResolvedValue({ success: true }),
  gitStashPop: vi.fn().mockResolvedValue({ success: true }),
  gitRevertFiles: vi.fn().mockResolvedValue({ success: true }),
  gitDetectMergeState: vi.fn().mockResolvedValue(null),
}));

vi.mock('../GitInitHelper', () => ({
  ensureLocalGitIdentity: vi.fn().mockResolvedValue(undefined),
  makeInitialCommit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../PerforceAdapter', () => ({
  getP4Status: vi.fn().mockResolvedValue({
    openedFiles: [],
    clientName: 'workspace',
    connected: true,
  }),
  getP4Locks: vi.fn().mockResolvedValue(new Map()),
  p4Submit: vi.fn(),
  p4Sync: vi.fn(),
  p4Edit: vi.fn(),
  p4Revert: vi.fn(),
  p4Lock: vi.fn(),
  p4Unlock: vi.fn(),
}));

// Import mocked modules
import { detectVCS } from '../VCSDetector';
import { getGitStatus, getChangedFiles, gitInit } from '../GitAdapter';
import { makeInitialCommit } from '../GitInitHelper';
import { getP4Status } from '../PerforceAdapter';

describe('VCSStatusProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper component to read VCS context
  function VCSReader({ onValue }: { onValue: (value: any) => void }) {
    const vcs = useVCSStatus();
    React.useEffect(() => {
      onValue(vcs);
    });
    return null;
  }

  it('provides default uninitialized state', () => {
    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    expect(value).toBeDefined();
    expect(value.initialized).toBe(false);
    expect(value.type).toBe('none');
    expect(value.branch).toBeNull();
    expect(value.changedFileCount).toBe(0);
    expect(value.isDirty).toBe(false);
  });

  it('initializes with Git project and populates state', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main', repoRoot: '/repo' });

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project/path');
    });

    expect(value.initialized).toBe(true);
    expect(value.type).toBe('git');
    expect(value.branch).toBe('main');
    expect(value.ahead).toBe(1);
    expect(value.behind).toBe(2);
    expect(value.isDirty).toBe(true);
    expect(value.changedFileCount).toBe(1);
    expect(value.projectPath).toBe('/project/path');
  });

  it('initRepo ("Track versions") flips a no-repo project to git without a reload and saves a first version', async () => {
    // First detection: no repo (status bar shows "Track versions").
    vi.mocked(detectVCS).mockResolvedValueOnce({ type: 'none' });
    (window as any).electronAPI = {
      fs: {
        runCommand: vi.fn().mockResolvedValue({ stdout: 'x', stderr: '', exitCode: 0 }),
      },
      isElectron: true,
    };

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );
    await act(async () => { await value.initialize('/project/path'); });
    expect(value.type).toBe('none');

    // After git init the SAME provider must re-detect, not trust its cache.
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main', repoRoot: '/project/path' });
    await act(async () => { await value.initRepo(); });

    expect(gitInit).toHaveBeenCalledWith('/project/path');
    expect(makeInitialCommit).toHaveBeenCalledWith(expect.any(Function), '/project/path', expect.any(Function), 'First version');
    expect(value.type).toBe('git');
    expect(value.branch).toBe('main');
    delete (window as any).electronAPI;
  });

  it('clears state correctly', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main' });

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project/path');
    });

    expect(value.initialized).toBe(true);

    act(() => {
      value.clear();
    });

    expect(value.initialized).toBe(false);
    expect(value.type).toBe('none');
    expect(value.branch).toBeNull();
    expect(value.projectPath).toBeNull();
  });

  it('isBeatChanged detects changed beat files', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main' });
    vi.mocked(getChangedFiles).mockResolvedValue([
      'clusters/forest/dialogTree_beat_1.json',
      'project.json',
    ]);

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project');
    });

    expect(value.isBeatChanged('beat_1')).toBe(true);
    expect(value.isBeatChanged('beat_2')).toBe(false);
  });

  it('isFileChanged checks the changed files set', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main' });
    vi.mocked(getChangedFiles).mockResolvedValue(['project.json', 'settings.json']);

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project');
    });

    expect(value.isFileChanged('project.json')).toBe(true);
    expect(value.isFileChanged('settings.json')).toBe(true);
    expect(value.isFileChanged('other.json')).toBe(false);
  });

  it('handles Perforce initialization', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'perforce', branch: 'my-workspace' });
    vi.mocked(getP4Status).mockResolvedValue({
      openedFiles: [
        { depotFile: '//depot/file.json', clientFile: '', action: 'edit', change: '123' },
      ],
      clientName: 'my-workspace',
      connected: true,
    });

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project');
    });

    expect(value.type).toBe('perforce');
    expect(value.branch).toBe('my-workspace');
    expect(value.isDirty).toBe(true);
    expect(value.changedFileCount).toBe(1);
  });

  it('refresh calls the adapters again', async () => {
    vi.mocked(detectVCS).mockResolvedValue({ type: 'git', branch: 'main' });

    let value: any;
    render(
      <VCSStatusProvider>
        <VCSReader onValue={(v) => { value = v; }} />
      </VCSStatusProvider>
    );

    await act(async () => {
      await value.initialize('/project');
    });

    const callsBefore = vi.mocked(getGitStatus).mock.calls.length;

    await act(async () => {
      await value.refresh();
    });

    // VCS type is cached after first detection, but git status adapters
    // should be called on every refresh
    expect(vi.mocked(getGitStatus).mock.calls.length).toBe(callsBefore + 1);
  });
});

describe('useVCSStatus outside provider', () => {
  it('returns null when not wrapped in VCSStatusProvider', () => {
    let value: any = 'initial';
    function Reader() {
      value = useVCSStatus();
      return null;
    }
    render(<Reader />);
    expect(value).toBeNull();
  });
});

describe('useRequiredVCSStatus outside provider', () => {
  it('throws when not wrapped in VCSStatusProvider', () => {
    function Reader() {
      useRequiredVCSStatus();
      return null;
    }

    // Suppress React error boundary output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Reader />)).toThrow('useRequiredVCSStatus must be used within a VCSStatusProvider');
    spy.mockRestore();
  });
});
