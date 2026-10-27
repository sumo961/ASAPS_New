import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const plan = {
  copy: { name: 'BirkaV13,1', exportedAt: '2026-10-26T22:34:19.295Z', appVersion: '0.9.137' },
  newAssets: [{ id: 'asset_new' }],
  reusedAssets: 1,
  beats: { added: ['Shore meeting with Eyvind'], changed: ['Free her now.'], removed: ['DialogTree beat_200'] },
};
const planUpdateFromCopy = vi.fn(async () => plan);
const applyUpdateFromCopy = vi.fn(async () => {});
vi.mock('../../contexts/PersistenceContext', () => ({
  usePersistence: () => ({ planUpdateFromCopy, applyUpdateFromCopy, currentProject: { name: 'BirkaV2' } }),
}));
vi.mock('../../vcs/VCSStatusProvider', () => ({ useVCSStatus: () => ({ type: 'git', isDirty: true }) }));

import { UpdateFromCopyDialog } from '../UpdateFromCopyDialog';

describe('UpdateFromCopyDialog', () => {
  it('reads the copy, shows what it changes, and updates the folder', async () => {
    const onClose = vi.fn();
    const { container } = render(<UpdateFromCopyDialog isOpen onClose={onClose} />);
    expect(screen.getByText(/keeps its name/)).toBeTruthy();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['zip'], 'BirkaV13.asaps')] } });

    await waitFor(() => expect(screen.getByText('New beats (1)')).toBeTruthy());
    expect(screen.getByText(/Shore meeting with Eyvind/)).toBeTruthy();
    expect(screen.getByText('Changed beats (1)')).toBeTruthy();
    expect(screen.getByText(/will be removed \(1\)/)).toBeTruthy();
    expect(screen.getByText(/1 already here, 1 new/)).toBeTruthy();
    expect(screen.getByText(/changes that aren’t committed/)).toBeTruthy();

    fireEvent.click(screen.getByText('Update this folder'));
    await waitFor(() => expect(applyUpdateFromCopy).toHaveBeenCalledWith(plan));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
