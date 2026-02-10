import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VCSStatusBar } from '../VCSStatusBar';

// Mock the VCS hook
const mockVCSState: Record<string, any> = {
  initialized: false,
  type: 'none',
  branch: null,
  changedFiles: new Set<string>(),
  changedFileCount: 0,
  ahead: 0,
  behind: 0,
  isDirty: false,
  p4OpenedFiles: [],
  conflictFiles: new Set<string>(),
  projectPath: null,
  refresh: vi.fn(),
  isFileChanged: vi.fn(),
  isBeatChanged: vi.fn(),
  getBeatStatus: vi.fn().mockReturnValue('unchanged'),
  getLockedBy: vi.fn().mockReturnValue(null),
  initialize: vi.fn(),
  clear: vi.fn(),
  initRepo: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  fetch: vi.fn(),
  stash: vi.fn(),
  stashPop: vi.fn(),
  revertFiles: vi.fn(),
  onEvent: vi.fn(),
};

vi.mock('../../../vcs/VCSStatusProvider', () => ({
  useVCSStatus: () => mockVCSState,
}));

describe('VCSStatusBar', () => {
  it('renders nothing when VCS is not initialized', () => {
    mockVCSState.initialized = false;
    mockVCSState.type = 'none';
    mockVCSState.projectPath = null;

    const { container } = render(<VCSStatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when VCS type is none and no project path', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'none';
    mockVCSState.projectPath = null;

    const { container } = render(<VCSStatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Set up Git" button when no VCS detected but project is open', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'none';
    mockVCSState.projectPath = '/some/project';

    const onInitRepo = vi.fn();
    render(<VCSStatusBar onInitRepo={onInitRepo} />);

    const btn = screen.getByText('Set up Git');
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onInitRepo).toHaveBeenCalled();
  });

  it('renders Git status bar with branch name', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.branch = 'main';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.ahead = 0;
    mockVCSState.behind = 0;
    mockVCSState.conflictFiles = new Set();

    render(<VCSStatusBar />);

    expect(screen.getByText('Git')).toBeDefined();
    expect(screen.getByText('main')).toBeDefined();
  });

  it('shows changed file count when dirty', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.branch = 'feature';
    mockVCSState.isDirty = true;
    mockVCSState.changedFileCount = 5;
    mockVCSState.ahead = 0;
    mockVCSState.behind = 0;
    mockVCSState.conflictFiles = new Set();

    render(<VCSStatusBar />);

    expect(screen.getByText('5 changed')).toBeDefined();
  });

  it('shows ahead/behind indicators for Git', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.branch = 'main';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.ahead = 3;
    mockVCSState.behind = 2;
    mockVCSState.conflictFiles = new Set();

    render(<VCSStatusBar />);

    // Unicode arrows with numbers
    expect(screen.getByText(/↑3/)).toBeDefined();
    expect(screen.getByText(/↓2/)).toBeDefined();
  });

  it('shows conflict indicator', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.branch = 'main';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.ahead = 0;
    mockVCSState.behind = 0;
    mockVCSState.conflictFiles = new Set(['file1.json', 'file2.json']);

    render(<VCSStatusBar />);

    expect(screen.getByText('2 conflicts')).toBeDefined();
  });

  it('shows P4 label for Perforce', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'perforce';
    mockVCSState.branch = 'my-workspace';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.ahead = 0;
    mockVCSState.behind = 0;
    mockVCSState.conflictFiles = new Set();

    render(<VCSStatusBar />);

    expect(screen.getByText('P4')).toBeDefined();
    expect(screen.getByText('my-workspace')).toBeDefined();
  });

  it('calls refresh when refresh button is clicked', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'git';
    mockVCSState.branch = 'main';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.conflictFiles = new Set();
    mockVCSState.refresh = vi.fn();

    render(<VCSStatusBar />);

    const refreshButton = screen.getByTitle('Refresh VCS status');
    fireEvent.click(refreshButton);

    expect(mockVCSState.refresh).toHaveBeenCalled();
  });

  it('does not show ahead/behind for Perforce', () => {
    mockVCSState.initialized = true;
    mockVCSState.type = 'perforce';
    mockVCSState.branch = 'ws';
    mockVCSState.isDirty = false;
    mockVCSState.changedFileCount = 0;
    mockVCSState.ahead = 5; // Should be ignored for P4
    mockVCSState.behind = 3;
    mockVCSState.conflictFiles = new Set();

    const { container } = render(<VCSStatusBar />);

    // Arrows should not appear
    expect(container.textContent).not.toContain('↑');
    expect(container.textContent).not.toContain('↓');
  });
});
