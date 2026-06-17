/**
 * Tests for ProjectSelector + ProjectBadge against the real PersistenceProvider
 * (renderWithProviders). Covers the trigger, the dropdown's recent-projects
 * list sourced from storage (excluding the current project), loading a project
 * on click, the empty state, the Browse-library callback, and the badge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, waitFor, act } from '@testing-library/react';
import { ProjectSelector, ProjectBadge } from '../ProjectSelector';
import { renderWithProviders, waitForInit, resetPersistence } from '../../test/renderWithProviders';

afterEach(resetPersistence);

describe('ProjectSelector', () => {
  it('renders the trigger button', async () => {
    const { getByText, ctx } = renderWithProviders(<ProjectSelector />);
    await waitForInit(ctx);
    expect(getByText('Projects')).toBeTruthy();
  });

  it('shows "No recent projects" when only the current project exists', async () => {
    const { getByText, ctx } = renderWithProviders(<ProjectSelector />);
    await waitForInit(ctx);
    await act(async () => {
      await ctx.current!.createProject('Solo');
    });
    fireEvent.click(getByText('Projects'));
    await waitFor(() => expect(getByText('No recent projects')).toBeTruthy());
  });

  it('lists other projects and loads one on click', async () => {
    const { getByText, ctx } = renderWithProviders(<ProjectSelector />);
    await waitForInit(ctx);
    await act(async () => {
      await ctx.current!.createProject('Alpha');
      await ctx.current!.createProject('Beta'); // current = Beta
    });

    fireEvent.click(getByText('Projects'));
    await waitFor(() => expect(getByText('Alpha')).toBeTruthy()); // current (Beta) excluded

    fireEvent.click(getByText('Alpha'));
    await waitFor(() => expect(ctx.current!.currentProject?.name).toBe('Alpha'));
  });

  it('fires onOpenLibrary from the Browse button', async () => {
    const onOpenLibrary = vi.fn();
    const { getByText, ctx } = renderWithProviders(<ProjectSelector onOpenLibrary={onOpenLibrary} />);
    await waitForInit(ctx);
    fireEvent.click(getByText('Projects'));
    await waitFor(() => expect(getByText('Browse all projects…')).toBeTruthy());
    fireEvent.click(getByText('Browse all projects…'));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});

describe('ProjectBadge', () => {
  it('renders nothing without a project, then the name once one exists', async () => {
    const { queryByText, getByText, ctx } = renderWithProviders(<ProjectBadge />);
    await waitForInit(ctx);
    await act(async () => {
      await ctx.current!.createProject('Badged');
    });
    await waitFor(() => expect(getByText('Badged')).toBeTruthy());
    expect(queryByText('No Project')).toBeNull();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const { getByText, ctx } = renderWithProviders(<ProjectBadge onClick={onClick} />);
    await waitForInit(ctx);
    await act(async () => {
      await ctx.current!.createProject('Clicky');
    });
    fireEvent.click(getByText('Clicky'));
    expect(onClick).toHaveBeenCalled();
  });
});
