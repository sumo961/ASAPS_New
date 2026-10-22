/**
 * A folder project with no server yet offers the guided GitHub setup right
 * in the version-control panel ("Put it on GitHub…") — before, only New
 * Project on GitHub / Open Project from GitHub reached it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VCSPanel } from '../VCSPanel';

const state: Record<string, any> = {};
vi.mock('../../../vcs/VCSStatusProvider', () => ({ useVCSStatus: () => state }));
vi.mock('../PendingChangesTab', () => ({ PendingChangesTab: () => <div>pending-tab</div> }));
vi.mock('../IncomingChangesTab', () => ({ IncomingChangesTab: () => <div>incoming-tab</div> }));
vi.mock('../HistoryTab', () => ({ HistoryTab: () => <div>history-tab</div> }));
vi.mock('../BranchesTab', () => ({ BranchesTab: () => <div>branches-tab</div> }));

const panel = () => render(<VCSPanel isOpen onToggle={vi.fn()} onViewDiff={vi.fn()} onViewFileHistory={vi.fn()} />);

describe('VCSPanel — Put it on GitHub', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
    Object.assign(state, {
      initialized: true, type: 'git', hasRemote: false, projectPath: '/Users/s/Stories/Story Copy',
      changedFileCount: 0, behind: 0, messageLog: [], clearMessageLog: vi.fn(), refresh: vi.fn(),
      tools: { git: { present: true, version: '2' }, gh: { present: true, version: '2' }, ghAuth: { authenticated: true, username: 'student' } },
    });
    (window as any).electronAPI = { fs: { runCommand: vi.fn() } };
  });

  it('offers the GitHub setup for a folder with no server, with the folder name as the repo name', () => {
    panel();
    expect(screen.getByTestId('vcs-github-setup-bar').textContent).toContain('only on this computer');
    expect(screen.getByText('pending-tab')).toBeTruthy();
    fireEvent.click(screen.getByText('Put it on GitHub…'));
    expect(screen.getByText('Connect this project to GitHub')).toBeTruthy();
    fireEvent.click(screen.getByText('Create a new GitHub repo'));
    expect((screen.getByPlaceholderText('my-asaps-project') as HTMLInputElement).value).toBe('Story-Copy');
    fireEvent.click(screen.getByText('Back to changes'));
    expect(screen.getByText('pending-tab')).toBeTruthy();
  });

  it('does not offer it once the project has a server', () => {
    state.hasRemote = true;
    panel();
    expect(screen.queryByTestId('vcs-github-setup-bar')).toBeNull();
  });

  it('is not offered in the browser build', () => {
    (window as any).electronAPI = undefined;
    panel();
    expect(screen.queryByTestId('vcs-github-setup-bar')).toBeNull();
  });
});
