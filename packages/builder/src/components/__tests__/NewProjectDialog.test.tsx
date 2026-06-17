/**
 * Tests for NewProjectDialog — exercises the full create flow against the real
 * PersistenceProvider (StorageManager on fake-indexeddb) via renderWithProviders.
 * Covers the required-name validation gate, a successful create →
 * onProjectCreated(id) + onClose, and the close button. Proves the shared
 * provider harness works for context-dependent UI.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { NewProjectDialog } from '../NewProjectDialog';
import { renderWithProviders, waitForInit, resetPersistence } from '../../test/renderWithProviders';

afterEach(resetPersistence);

describe('NewProjectDialog', () => {
  it('renders the form', async () => {
    const { getByText, getByPlaceholderText, ctx } = renderWithProviders(<NewProjectDialog onClose={vi.fn()} />);
    await waitForInit(ctx);
    expect(getByText('New Project')).toBeTruthy();
    expect(getByPlaceholderText('My Awesome Story')).toBeTruthy();
  });

  it('blocks submit and shows an error when the name is empty', async () => {
    const onClose = vi.fn();
    const { getByText, container, ctx } = renderWithProviders(<NewProjectDialog onClose={onClose} />);
    await waitForInit(ctx);
    fireEvent.submit(container.querySelector('form')!); // jsdom doesn't submit on button click
    await waitFor(() => expect(getByText(/name is required/i)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('creates the project then fires onProjectCreated + onClose', async () => {
    const onClose = vi.fn();
    const onProjectCreated = vi.fn();
    const { getByText, getByPlaceholderText, ctx } = renderWithProviders(
      <NewProjectDialog onClose={onClose} onProjectCreated={onProjectCreated} />,
    );
    await waitForInit(ctx);

    fireEvent.change(getByPlaceholderText('My Awesome Story'), { target: { value: 'My Saga' } });
    fireEvent.click(getByText('Create Project'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onProjectCreated).toHaveBeenCalledWith(expect.any(String));

    // the new project really landed in storage under its (unique) name
    const result = await ctx.current!.storage.listProjects();
    expect(result.success).toBe(true);
    expect(result.data!.some((p: any) => p.name === 'My Saga')).toBe(true);
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const { container, ctx } = renderWithProviders(<NewProjectDialog onClose={onClose} isModal={false} />);
    await waitForInit(ctx);
    // header close button is the first <button> (the X)
    fireEvent.click(container.querySelector('button')!);
    expect(onClose).toHaveBeenCalled();
  });
});
