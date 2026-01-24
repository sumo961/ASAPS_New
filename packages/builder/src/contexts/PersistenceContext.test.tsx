/**
 * Tests for PersistenceContext - Save Project Feature
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { PersistenceProvider, useProject, useSave, usePersistence } from './PersistenceContext';
import { Beat } from '@asaps/core';

// Mock dependencies
jest.mock('@asaps/core', () => ({
  Story: jest.fn().mockImplementation(({ title }) => ({
    title,
    beats: [],
    addBeat: jest.fn(),
  })),
}));

describe('PersistenceContext - SaveCurrentProject', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PersistenceProvider autoSave={false}>{children}</PersistenceProvider>
  );

  beforeEach(() => {
    // Reset IndexedDB mocks
    const { storageManager } = require('../storage');
    storageManager.getStorageManager = jest.fn().mockReturnValue({
      init: jest.fn().mockResolvedValue(undefined),
      createProject: jest.fn().mockImplementation(async (project) => ({
        success: true,
        data: project,
      })),
      getProject: jest.fn().mockResolvedValue({
        success: false,
        data: null,
      }),
    });
  });

  test('should initialize with no current project', () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    expect(result.current.project).toBeNull();
    expect(result.current.projectId).toBeNull();
  });

  test('should create a new project with saveCurrent', async () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    // Start with current project data (simulating untitled project)
    act(() => {
      result.current.updateStory({
        title: 'My Untitled Story',
        beats: [
          { id: '1', type: 'infoText', name: 'Introduction' } as Beat,
          { id: '2', type: 'dialogTree', name: 'First Choice' } as Beat,
        ],
        characters: [{ id: 'char1', name: 'Hero' }],
      });
    });

    // Save as a named project
    await act(async () => {
      await result.current.saveCurrent('My Story Project', 'A test project');
    });

    await waitFor(() => {
      expect(result.current.project).not.toBeNull();
      expect(result.current.project?.name).toBe('My Story Project');
      expect(result.current.project?.description).toBe('A test project');
    });
  });

  test('should preserve project data when saving current project', async () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    const mockBeats = [
      { id: '1', type: 'infoText', name: 'Introduction' } as Beat,
      { id: '2', type: 'dialogTree', name: 'Choice 1' } as Beat,
    ];

    act(() => {
      result.current.updateStory({
        title: 'Test Story',
        beats: mockBeats,
        characters: [{ id: 'char1', name: 'Protagonist' }],
      });
    });

    await act(async () => {
      await result.current.saveCurrent('Preserved Project', 'Data should be preserved');
    });

    await waitFor(() => {
      expect(result.current.project?.story.beats).toEqual(mockBeats);
      expect(result.current.project?.story.characters).toHaveLength(1);
      expect(result.current.project?.story.characters[0].name).toBe('Protagonist');
    });
  });

  test('should generate new project ID when saving current project', async () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    act(() => {
      result.current.updateStory({ title: 'Test' });
    });

    const initialProjectId = result.current.projectId;

    await act(async () => {
      await result.current.saveCurrent('New Named Project');
    });

    await waitFor(() => {
      expect(result.current.projectId).not.toBe(initialProjectId);
      expect(result.current.projectId).toMatch(/[a-f0-9-]{36}/); // UUID format
    });
  });

  test('should update modifiedAt timestamp when saving current project', async () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    const beforeSave = new Date();

    act(() => {
      result.current.updateStory({ title: 'Test Story for Timestamp' });
    });

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    await act(async () => {
      await result.current.saveCurrent('Timestamp Test');
    });

    await waitFor(() => {
      expect(result.current.project?.modifiedAt).toBeDefined();
      expect(result.current.project?.modifiedAt.getTime()).toBeGreaterThan(beforeSave.getTime());
    });
  });

  test('should throw error when trying to saveCurrent with no project', async () => {
    const { result } = renderHook(() => useProject(), { wrapper });

    await expect(
      result.current.saveCurrent('Should Fail')
    ).rejects.toThrow('No current project to save');
  });

  test('should clear command manager when saving current project', async () => {
    const { result } = renderHook(() => usePersistence(), { wrapper });

    act(() => {
      result.current.updateProjectStory({ title: 'Test' });
    });

    // Execute some commands
    await act(async () => {
      await result.current.executeCommand({
        id: 'cmd1',
        type: 'update-beat',
        execute: jest.fn(),
        undo: jest.fn(),
      } as any);
    });

    expect(result.current.commandManager.commandHistory).toHaveLength(1);

    await act(async () => {
      await result.current.saveCurrentProject('Project With Cleared Commands');
    });

    await waitFor(() => {
      expect(result.current.commandManager.commandHistory).toHaveLength(0);
    });
  });
});

describe('PersistenceContext - Save Status', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PersistenceProvider autoSave={false}>{children}</PersistenceProvider>
  );

  test('should track unsaved changes correctly across save statuses', async () => {
    const { result } = renderHook(() => useSave(), { wrapper });

    // Initially should be idle (no changes)
    expect(result.current.status).toBe('idle');

    // Mark a change
    act(() => {
      result.current.markChanged();
    });

    // Should be pending (has unsaved changes)
    await waitFor(() => {
      expect(result.current.status).toBe('pending');
    });

    // After auto-save completes, status should be 'saved'
    act(() => {
      // Simulate auto-save completion
    });

    // Using usePersistence to check hasUnsavedChanges
    const { result: persistResult } = renderHook(() => usePersistence(), { wrapper });

    expect(persistResult.current.hasUnsavedChanges).toBe(true);
  });

  test('saveNow should trigger immediate save', async () => {
    const { result } = renderHook(() => useSave(), { wrapper });

    act(() => {
      result.current.markChanged();
    });

    expect(result.current.status).toBe('pending');

    await act(async () => {
      await result.current.saveNow();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('saved');
      expect(result.current.lastSaved).not.toBeNull();
    });
  });
});

describe('PersistenceContext - Integration', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PersistenceProvider>{children}</PersistenceProvider>
  );

  test('complete workflow: create project, make changes, save as named project', async () => {
    const { result } = renderHook(() => ({
      project: useProject(),
      save: useSave(),
      persist: usePersistence(),
    }), { wrapper });

    // Start with changes (simulating working on untitled project)
    act(() => {
      result.current.persist.updateProjectStory({
        title: 'My Story',
        beats: [{ id: '1', type: 'infoText', name: 'Intro' } as Beat],
      });
      result.current.save.markChanged();
    });

    // Verify unsaved changes
    expect(result.current.persist.hasUnsavedChanges).toBe(true);

    // Save as named project
    await act(async () => {
      await result.current.project.saveCurrent('My Named Project', 'A great story');
    });

    await waitFor(() => {
      expect(result.current.project.project).not.toBeNull();
      expect(result.current.project.project?.name).toBe('My Named Project');
      expect(result.current.persist.isUntitledProject).toBe(false);
    });
  });
});
