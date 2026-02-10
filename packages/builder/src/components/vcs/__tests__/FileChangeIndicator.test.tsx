import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { FileChangeIndicator, VCSBadge } from '../FileChangeIndicator';

// Mock VCS state
const mockVCSState = {
  initialized: false,
  type: 'none' as const,
  branch: null as string | null,
  changedFiles: new Set<string>(),
  changedFileCount: 0,
  ahead: 0,
  behind: 0,
  isDirty: false,
  p4OpenedFiles: [] as string[],
  conflictFiles: new Set<string>(),
  projectPath: null as string | null,
  refresh: vi.fn(),
  isFileChanged: vi.fn(),
  isBeatChanged: vi.fn().mockReturnValue(false),
  getBeatStatus: vi.fn().mockReturnValue('unchanged'),
  getLockedBy: vi.fn().mockReturnValue(null),
  initialize: vi.fn(),
  clear: vi.fn(),
  stagedFiles: [],
  unstagedFiles: [],
  p4Locks: new Map(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
  fetch: vi.fn(),
  stash: vi.fn(),
  stashPop: vi.fn(),
  revertFiles: vi.fn(),
  p4SubmitChanges: vi.fn(),
  p4SyncLatest: vi.fn(),
  p4EditFile: vi.fn(),
  p4RevertFile: vi.fn(),
  p4LockFile: vi.fn(),
  p4UnlockFile: vi.fn(),
  onEvent: vi.fn(),
};

vi.mock('../../../vcs/VCSStatusProvider', () => ({
  useVCSStatus: () => mockVCSState,
}));

describe('FileChangeIndicator', () => {
  it('renders nothing when VCS is not initialized', () => {
    mockVCSState.initialized = false;
    mockVCSState.type = 'none';

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when beat is not changed', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('unchanged');

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders indicator dot when beat is modified', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('modified');

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    const dot = container.firstChild as HTMLElement;

    expect(dot).not.toBeNull();
    expect(dot.title).toBe('Modified since last commit');
    expect(dot.style.position).toBe('absolute');
    expect(dot.style.borderRadius).toBe('50%');
  });

  it('applies top-right position by default', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('modified');

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    const dot = container.firstChild as HTMLElement;

    expect(dot.style.top).toBe('-4px'); // -size/2 = -8/2 = -4
    expect(dot.style.right).toBe('-4px');
  });

  it('applies custom position', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('modified');

    const { container } = render(<FileChangeIndicator beatId="beat_1" position="bottom-right" />);
    const dot = container.firstChild as HTMLElement;

    expect(dot.style.bottom).toBe('-4px');
    expect(dot.style.right).toBe('-4px');
  });

  it('applies custom size', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('modified');

    const { container } = render(<FileChangeIndicator beatId="beat_1" size={12} />);
    const dot = container.firstChild as HTMLElement;

    expect(dot.style.width).toBe('12px');
    expect(dot.style.height).toBe('12px');
  });

  it('calls getBeatStatus with the correct beatId', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('unchanged');

    render(<FileChangeIndicator beatId="beat_42" />);
    expect(mockVCSState.getBeatStatus).toHaveBeenCalledWith('beat_42');
  });

  it('renders green dot for added status', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('added');

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    const dot = container.firstChild as HTMLElement;

    expect(dot).not.toBeNull();
    expect(dot.title).toBe('New file (untracked/added)');
    expect(dot.style.backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('renders red dot with special border for conflict status', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('conflict');

    const { container } = render(<FileChangeIndicator beatId="beat_1" />);
    const dot = container.firstChild as HTMLElement;

    expect(dot).not.toBeNull();
    expect(dot.title).toBe('Merge conflict');
    expect(dot.style.backgroundColor).toBe('rgb(220, 38, 38)');
  });
});

describe('VCSBadge', () => {
  it('renders nothing when VCS is not active', () => {
    mockVCSState.initialized = false;
    mockVCSState.type = 'none';

    const { container } = render(<VCSBadge beatId="beat_1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when beat is not changed', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('unchanged');

    const { container } = render(<VCSBadge beatId="beat_1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders inline badge when beat is modified', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.getBeatStatus = vi.fn().mockReturnValue('modified');

    const { container } = render(<VCSBadge beatId="beat_1" />);
    const badge = container.firstChild as HTMLElement;

    expect(badge).not.toBeNull();
    expect(badge.title).toBe('Modified since last commit');
    expect(badge.style.display).toBe('inline-block');
    expect(badge.style.borderRadius).toBe('50%');
  });
});
