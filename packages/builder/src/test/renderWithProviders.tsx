/**
 * Shared test harness for UI components that consume PersistenceContext
 * (useProject / usePersistence / useCommands / useSave). Wraps the subject in a
 * real PersistenceProvider (autoSave off) running against the StorageManager on
 * fake-indexeddb, and exposes the live context value via `ctx` + a
 * `waitForInit` helper so tests can wait until storage is ready before driving
 * create/load/save flows.
 *
 * Reset between tests with resetPersistence() in afterEach (clears the
 * StorageManager singleton, the command-manager singleton, and the DB).
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { PersistenceProvider, usePersistence, type PersistenceContextValue } from '../contexts/PersistenceContext';
import { resetStorageManager } from '../storage/StorageManager';
import { getCommandManager } from '../commands/CommandManager';
import { deleteDatabase } from '../storage/schema';

export interface RenderWithProvidersResult extends ReturnType<typeof render> {
  /** Live PersistenceContext value (populated after the provider mounts). */
  ctx: { current: PersistenceContextValue | null };
}

export function renderWithProviders(
  ui: React.ReactElement,
  { autoSave = false }: { autoSave?: boolean } = {},
): RenderWithProvidersResult {
  const ctx: { current: PersistenceContextValue | null } = { current: null };

  const Probe: React.FC = () => {
    ctx.current = usePersistence();
    return null;
  };

  const utils = render(
    <PersistenceProvider autoSave={autoSave}>
      <Probe />
      {ui}
    </PersistenceProvider>,
  );

  return { ...utils, ctx };
}

/** Wait until the PersistenceProvider has finished its async initialization. */
export async function waitForInit(ctx: { current: PersistenceContextValue | null }): Promise<void> {
  await waitFor(() => {
    if (!ctx.current?.initialized) throw new Error('PersistenceProvider not initialized yet');
  });
}

/** Reset all persistence singletons + the DB. Call in afterEach. */
export async function resetPersistence(): Promise<void> {
  resetStorageManager();
  getCommandManager().clear();
  await deleteDatabase();
}
