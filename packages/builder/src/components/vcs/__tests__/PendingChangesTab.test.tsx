import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PendingChangesTab } from '../PendingChangesTab';

const confirmAction = vi.fn();
vi.mock('../../../utils/notify', () => ({ confirmAction: (o: any) => confirmAction(o) }));
vi.mock('../../../contexts/TranslationContext', () => ({ useTranslationState: () => ({ translations: [] }) }));

const vcs: Record<string, any> = {};
vi.mock('../../../vcs/VCSStatusProvider', () => ({ useVCSStatus: () => vcs }));

beforeEach(() => {
  confirmAction.mockReset();
  Object.assign(vcs, {
    branch: 'main',
    stagedFiles: [],
    unstagedFiles: [
      { path: 'beats/a_Hall.json', status: 'M' },
      { path: 'beats/b_Yard.json', status: 'M' },
      { path: 'beats/c_New.json', status: '?' },
    ],
    stage: vi.fn(),
    unstage: vi.fn(),
    revertFiles: vi.fn().mockResolvedValue({ success: true }),
    cleanUntrackedFiles: vi.fn().mockResolvedValue({ success: true }),
  });
});

describe('PendingChangesTab: several files at once', () => {
  it('discards the ticked files after one question: changed ones revert, new ones are deleted', async () => {
    confirmAction.mockResolvedValue(true);
    const reset = vi.fn();
    window.addEventListener('asaps:git-reset', reset);
    render(<PendingChangesTab />);
    fireEvent.click(screen.getByLabelText('Select beats/a_Hall.json'));
    fireEvent.click(screen.getByLabelText('Select beats/c_New.json'));
    fireEvent.click(screen.getByText('Discard (2)'));
    await waitFor(() => expect(vcs.revertFiles).toHaveBeenCalledWith(['beats/a_Hall.json']));
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(confirmAction.mock.calls[0][0].message).toContain('revert  beats/a_Hall.json');
    expect(confirmAction.mock.calls[0][0].message).toContain('delete  beats/c_New.json');
    // Only the ticked new file — never the "clean everything" call without a list.
    expect(vcs.cleanUntrackedFiles).toHaveBeenCalledWith(['beats/c_New.json']);
    expect(reset).toHaveBeenCalled();
    window.removeEventListener('asaps:git-reset', reset);
  });

  it('does nothing when the question is answered no', async () => {
    confirmAction.mockResolvedValue(false);
    render(<PendingChangesTab />);
    fireEvent.click(screen.getByLabelText('Select all changes'));
    fireEvent.click(screen.getByText('Discard (3)'));
    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(vcs.revertFiles).not.toHaveBeenCalled();
    expect(vcs.cleanUntrackedFiles).not.toHaveBeenCalled();
  });

  it('stages just the ticked files', async () => {
    render(<PendingChangesTab />);
    fireEvent.click(screen.getByLabelText('Select beats/b_Yard.json'));
    fireEvent.click(screen.getByText('Stage (1)'));
    await waitFor(() => expect(vcs.stage).toHaveBeenCalledWith(['beats/b_Yard.json']));
  });
});
