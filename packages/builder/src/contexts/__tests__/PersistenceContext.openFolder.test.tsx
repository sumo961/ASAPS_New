/**
 * Opening a project folder on a computer that never opened it before (a
 * teammate's fresh Git clone): the folder's assets must be registered before
 * the project reaches the editor, whose asset loading starts as soon as the
 * project is set. Registered afterwards, a fresh clone showed no pictures,
 * sounds or fonts until it was opened again (2026-10-27).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { resetStorageManager } from '../../storage/StorageManager';
import { deleteDatabase } from '../../storage/schema';

const events: string[] = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

vi.mock('../../storage/adapters/DirectoryAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/adapters/DirectoryAdapter')>();
  class FakeDirectoryAdapter {
    async openProject() {
      return {
        id: 'clone-project',
        name: 'Cloned',
        story: { beats: [] },
        createdAt: new Date(),
        modifiedAt: new Date(),
      };
    }
    getManifest() {
      return {
        assets: {
          frame: { id: 'frame', filename: 'textbox.png', type: 'image', mimeType: 'image/png', size: 3, folder: 'backgrounds' },
        },
      };
    }
    getDuplicateBeatIds() { return []; }
    watchForChanges() { return () => {}; }
    async readFolderProjectId() { return null; }
  }
  return { ...actual, DirectoryAdapter: FakeDirectoryAdapter, isElectronWithFS: () => true };
});

vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage')>();
  return {
    ...actual,
    getStorageAdapter: () => ({
      initialize: async () => {},
      registerDirectoryAssets: async (_projectId: string, _dir: string, manifest: Record<string, unknown>) => {
        events.push('registered');
        return Object.keys(manifest).length;
      },
    }),
  };
});

import { PersistenceProvider, usePersistence } from '../PersistenceContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(PersistenceProvider, { autoSave: false }, children);

afterEach(async () => {
  events.length = 0;
  resetStorageManager();
  await deleteDatabase();
});

describe('openDirectoryProject', () => {
  it('registers the folder assets before the project reaches the editor', async () => {
    const h = renderHook(() => {
      const p = usePersistence();
      // What the editor's asset loading sees: it starts on this change.
      if (p.currentProject && !events.includes('project set')) events.push('project set');
      return p;
    }, { wrapper });
    await waitFor(() => expect(h.result.current.initialized).toBe(true));

    // Not inside act(): act holds every render until the open has finished,
    // which hides the order. In the app, React renders between the awaits.
    const prevActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
    actEnv.IS_REACT_ACT_ENVIRONMENT = false;
    let opened = false;
    try {
      opened = await h.result.current.openDirectoryProject('/clones/Cloned');
      await waitFor(() => expect(h.result.current.currentProject?.id).toBe('clone-project'));
    } finally {
      actEnv.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    }

    expect(opened).toBe(true);
    expect(events).toEqual(['registered', 'project set']);
  });
});
