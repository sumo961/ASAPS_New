/**
 * Tests for useAutoSave — debounced project persistence with status tracking,
 * manual save, pause/resume, and cancel. StorageManager is mocked so we can
 * drive success/failure deterministically; timers are faked to exercise the
 * debounce + "saved → idle" transition without real waits.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../useAutoSave';
import { getStorageManager } from '../../storage/StorageManager';

vi.mock('../../storage/StorageManager', () => ({ getStorageManager: vi.fn() }));

const makeStorage = (over: any = {}) => ({
  getProject: vi.fn().mockResolvedValue({ success: true, data: { id: 'p1', name: 'Existing', story: {}, settings: {} } }),
  updateProject: vi.fn().mockResolvedValue({ success: true }),
  saveDraft: vi.fn().mockResolvedValue({ success: true }),
  cleanupOldDrafts: vi.fn().mockResolvedValue(undefined),
  ...over,
});

let storage: ReturnType<typeof makeStorage>;
const projectData = () => ({ id: 'p1', name: 'My Project', story: {} as any, settings: {} as any });

beforeEach(() => {
  vi.useFakeTimers();
  storage = makeStorage();
  (getStorageManager as any).mockReturnValue(storage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useAutoSave', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAutoSave(projectData));
    expect(result.current.status).toBe('idle');
    expect(result.current.lastSaved).toBeNull();
  });

  it('debounces a change: pending → saving → saved → idle', async () => {
    const { result } = renderHook(() => useAutoSave(projectData, { delay: 1000 }));

    act(() => result.current.markChanged());
    expect(result.current.status).toBe('pending');
    expect(storage.updateProject).not.toHaveBeenCalled();

    // Fire the debounce timer and let the async save settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(storage.updateProject).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSaved).toBeInstanceOf(Date);

    // After the 2s "saved" display, it returns to idle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.status).toBe('idle');
  });

  it('saveNow saves immediately without waiting for the debounce', async () => {
    const { result } = renderHook(() => useAutoSave(projectData, { delay: 99999 }));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(storage.updateProject).toHaveBeenCalledTimes(1);
    expect(storage.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ isManual: true }));
    expect(result.current.status).toBe('saved');
  });

  it('does not save drafts when saveDrafts is false', async () => {
    const { result } = renderHook(() => useAutoSave(projectData, { saveDrafts: false }));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(storage.updateProject).toHaveBeenCalled();
    expect(storage.saveDraft).not.toHaveBeenCalled();
  });

  it('records an error when the save fails', async () => {
    storage.updateProject.mockResolvedValue({ success: false, error: new Error('disk full') });
    const { result } = renderHook(() => useAutoSave(projectData));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('disk full');
  });

  it('markChanged is a no-op when disabled', () => {
    const { result } = renderHook(() => useAutoSave(projectData, { enabled: false }));
    act(() => result.current.markChanged());
    expect(result.current.status).toBe('idle');
  });

  it('pause cancels a pending save and blocks new schedules; resume re-enables', async () => {
    const { result } = renderHook(() => useAutoSave(projectData, { delay: 1000 }));

    act(() => result.current.markChanged());
    expect(result.current.status).toBe('pending');

    act(() => result.current.pause());
    expect(result.current.isPaused).toBe(true);
    expect(result.current.status).toBe('idle');

    // While paused, changes are ignored
    act(() => result.current.markChanged());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(storage.updateProject).not.toHaveBeenCalled();

    act(() => result.current.resume());
    expect(result.current.isPaused).toBe(false);
  });

  it('cancelPending clears a scheduled save and resets state', async () => {
    storage.updateProject.mockResolvedValue({ success: false, error: new Error('x') });
    const { result } = renderHook(() => useAutoSave(projectData, { delay: 1000 }));

    act(() => result.current.markChanged());
    act(() => result.current.cancelPending());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(storage.updateProject).not.toHaveBeenCalled();
  });

  it('invokes onAfterSave with the saved project', async () => {
    const onAfterSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave(projectData, { onAfterSave }));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(onAfterSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });
});
