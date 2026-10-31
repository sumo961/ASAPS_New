/**
 * Tests for PersistenceContext — the provider that wires storage, the
 * command manager, and auto-save into React context, plus the
 * usePersistence/useCommands/useSave/useProject accessor hooks.
 *
 * The provider runs against the real StorageManager over fake-indexeddb
 * (global in the builder test setup). Auto-save is disabled in the wrapper
 * to avoid timers. Each test resets the singleton + DB so state never leaks.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  PersistenceProvider,
  usePersistence,
  useCommands,
  useSave,
  useProject,
} from '../PersistenceContext';
import { resetStorageManager } from '../../storage/StorageManager';
import { deleteDatabase } from '../../storage/schema';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(PersistenceProvider, { autoSave: false }, children);

/** Render usePersistence inside a provider and wait until it initializes. */
async function renderInitialized() {
  const h = renderHook(() => usePersistence(), { wrapper });
  await waitFor(() => expect(h.result.current.initialized).toBe(true));
  return h;
}

afterEach(async () => {
  resetStorageManager();
  await deleteDatabase();
});

describe('accessor hooks require a provider', () => {
  // React logs the (expected) render error to console.error; silence it so
  // these intentional-throw tests don't dump stack traces into the output.
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it('usePersistence throws outside a provider', () => {
    expect(() => renderHook(() => usePersistence())).toThrow(/within a PersistenceProvider/);
  });

  it('useCommands throws outside a provider', () => {
    expect(() => renderHook(() => useCommands())).toThrow(/within a PersistenceProvider/);
  });

  it('useSave throws outside a provider', () => {
    expect(() => renderHook(() => useSave())).toThrow(/within a PersistenceProvider/);
  });

  it('useProject throws outside a provider', () => {
    expect(() => renderHook(() => useProject())).toThrow(/within a PersistenceProvider/);
  });
});

describe('PersistenceProvider initial state', () => {
  it('initializes with no current project and empty undo/redo', async () => {
    const { result } = await renderInitialized();
    expect(result.current.currentProject).toBeNull();
    expect(result.current.projectId).toBeNull();
    expect(result.current.isUntitledProject).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.initError).toBeNull();
  });

  it('exposes storage, the command manager, and the management API', async () => {
    const { result } = await renderInitialized();
    expect(result.current.storage).toBeDefined();
    expect(result.current.commandManager).toBeDefined();
    expect(typeof result.current.createProject).toBe('function');
    expect(typeof result.current.loadProject).toBe('function');
    expect(typeof result.current.deleteProject).toBe('function');
    expect(result.current.projectFormat).toBe('indexeddb');
  });
});

describe('createProject', () => {
  it('creates a project, returns its id, and sets it as current', async () => {
    const { result } = await renderInitialized();

    let id = '';
    await act(async () => {
      id = await result.current.createProject('My Test Project', 'a description');
    });

    expect(id).toBeTruthy();
    await waitFor(() => expect(result.current.currentProject?.id).toBe(id));
    expect(result.current.currentProject?.name).toBe('My Test Project');
    expect(result.current.currentProject?.description).toBe('a description');

    // it was persisted
    const stored = await result.current.storage.getProject(id);
    expect(stored.success).toBe(true);
  });

  it('auto-uniquifies a duplicate project name', async () => {
    const { result } = await renderInitialized();

    let firstId = '';
    let secondId = '';
    await act(async () => { firstId = await result.current.createProject('Dup'); });
    await act(async () => { secondId = await result.current.createProject('Dup'); });

    expect(firstId).not.toBe(secondId);
    const list = await result.current.storage.listProjects();
    const names = (list.data ?? []).map((p) => p.name);
    expect(names).toHaveLength(2);
    // the two names are distinct — the second was de-duplicated
    expect(new Set(names).size).toBe(2);
  });
});

describe('useProject selector', () => {
  it('exposes the current project and renamed action handles', async () => {
    const h = renderHook(
      () => ({ persistence: usePersistence(), project: useProject() }),
      { wrapper },
    );
    await waitFor(() => expect(h.result.current.persistence.initialized).toBe(true));

    let id = '';
    await act(async () => { id = await h.result.current.project.create('Via Selector'); });
    await waitFor(() => expect(h.result.current.project.project?.id).toBe(id));
    expect(h.result.current.project.project?.name).toBe('Via Selector');
    expect(typeof h.result.current.project.load).toBe('function');
  });
});

describe('loadProject saves the project being left', () => {
  // Auto-save ON with a delay no test reaches: an edit stays 'pending', the
  // state an author is in right after an edit (or an undo) inside the
  // auto-save window.
  const autoSaveWrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(PersistenceProvider, { autoSave: true, autoSaveDelay: 600000 }, children);

  async function renderWithAutoSave() {
    const h = renderHook(() => usePersistence(), { wrapper: autoSaveWrapper });
    await waitFor(() => expect(h.result.current.initialized).toBe(true));
    return h;
  }

  /** Stand-in for App's sync callback: writes the editor's beats into the project. */
  function editorWith(result: { current: ReturnType<typeof usePersistence> }, beats: any[]) {
    act(() => {
      result.current.registerSyncCallback(() => result.current.updateProjectStory({ beats }));
    });
  }

  /** Whether the STORED copy of the project has a beat with this id. */
  async function storedHas(result: { current: ReturnType<typeof usePersistence> }, id: string, beatId: string) {
    const stored = await result.current.storage.getProject(id);
    const beats = (stored.data?.story as any)?.beats;
    return Array.isArray(beats) && beats.some((b: any) => b?.id === beatId);
  }

  it('an edit still pending when another project is opened is saved, not dropped', async () => {
    const { result } = await renderWithAutoSave();
    let a = '';
    let b = '';
    await act(async () => { b = await result.current.createProject('Project B'); });
    await act(async () => { a = await result.current.createProject('Project A'); });
    await waitFor(() => expect(result.current.currentProject?.id).toBe(a));

    editorWith(result, [{ id: 'edited-beat', type: 'infoText' }]);
    act(() => result.current.markChanged());
    await waitFor(() => expect(result.current.saveStatus).toBe('pending'));

    await act(async () => { await result.current.loadProject(b); });

    expect(await storedHas(result, a, 'edited-beat')).toBe(true);
    // The switch still resets save state for the project now open.
    expect(result.current.currentProject?.id).toBe(b);
    expect(result.current.saveStatus).toBe('idle');
    expect(result.current.saveError).toBeNull();
    // ...and B was not written with A's editor content.
    expect(await storedHas(result, b, 'edited-beat')).toBe(false);
  });

  it('reloading the same project does not write the in-memory version over storage', async () => {
    const { result } = await renderWithAutoSave();
    let a = '';
    await act(async () => { a = await result.current.createProject('Project A'); });
    await waitFor(() => expect(result.current.currentProject?.id).toBe(a));

    editorWith(result, [{ id: 'stale-in-memory', type: 'infoText' }]);
    act(() => result.current.markChanged());
    await waitFor(() => expect(result.current.saveStatus).toBe('pending'));

    await act(async () => { await result.current.loadProject(a); });

    expect(await storedHas(result, a, 'stale-in-memory')).toBe(false);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('a paused auto-save is not flushed on switch (files changed outside, preview)', async () => {
    const { result } = await renderWithAutoSave();
    let a = '';
    let b = '';
    await act(async () => { b = await result.current.createProject('Project B'); });
    await act(async () => { a = await result.current.createProject('Project A'); });
    await waitFor(() => expect(result.current.currentProject?.id).toBe(a));

    editorWith(result, [{ id: 'held-back', type: 'infoText' }]);
    act(() => result.current.markChanged());
    await waitFor(() => expect(result.current.saveStatus).toBe('pending'));
    act(() => result.current.pauseAutoSave());

    await act(async () => { await result.current.loadProject(b); });

    expect(await storedHas(result, a, 'held-back')).toBe(false);
  });
});
