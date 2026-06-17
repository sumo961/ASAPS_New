/**
 * Tests for useAIDebug — the React state wrapper around AIDebugService. The
 * service itself is mocked (it's tested separately); here we cover the hook's
 * isAnalyzing/result/showModal state machine, the onComplete callback, the
 * error-catch path that synthesizes a failure result, and the modal controls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIDebug } from '../useAIDebug';
import { getAIDebugService } from '../../services/AIDebugService';

vi.mock('../../services/AIDebugService', () => ({ getAIDebugService: vi.fn() }));

const okResult = () => ({
  success: true,
  summary: {
    totalBeats: { expected: 2, actual: 2, matched: 2 },
    totalConnections: { expected: 0, actual: 0, matched: 0 },
    issues: { errors: 0, warnings: 0, info: 0 },
    timestamp: '2026-06-17T00:00:00.000Z',
    durationMs: 12,
  },
  beatComparisons: [],
  issues: [],
  consoleErrors: [],
});

let runDebugAnalysis: ReturnType<typeof vi.fn>;
beforeEach(() => {
  runDebugAnalysis = vi.fn().mockResolvedValue(okResult());
  (getAIDebugService as any).mockReturnValue({ runDebugAnalysis });
});

describe('useAIDebug', () => {
  it('starts idle with no result or modal', () => {
    const { result } = renderHook(() => useAIDebug({ delay: 0 }));
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.showModal).toBe(false);
  });

  it('runDebug stores the result, opens the modal, and fires onComplete', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useAIDebug({ delay: 0, onComplete }));

    let returned: any;
    await act(async () => {
      returned = await result.current.runDebug([{ id: 'b1' }] as any, []);
    });

    expect(runDebugAnalysis).toHaveBeenCalledWith([{ id: 'b1' }], [], { checkUI: true, checkConsole: true, verbose: false });
    expect(result.current.result?.success).toBe(true);
    expect(result.current.showModal).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(returned?.success).toBe(true);
  });

  it('forwards checkUI/checkConsole/verbose options', async () => {
    const { result } = renderHook(() => useAIDebug({ delay: 0, checkUI: false, checkConsole: false, verbose: true }));
    await act(async () => {
      await result.current.runDebug([], []);
    });
    expect(runDebugAnalysis).toHaveBeenCalledWith([], [], { checkUI: false, checkConsole: false, verbose: true });
  });

  it('synthesizes a failure result when the service throws', async () => {
    runDebugAnalysis.mockRejectedValue(new Error('kaboom'));
    const { result } = renderHook(() => useAIDebug({ delay: 0 }));

    let returned: any;
    await act(async () => {
      returned = await result.current.runDebug([{ id: 'b1' }, { id: 'b2' }] as any, [{ source: 'b1', target: 'b2' }]);
    });

    expect(returned.success).toBe(false);
    expect(returned.issues[0].message).toMatch(/kaboom/);
    expect(returned.summary.totalBeats.actual).toBe(2);
    expect(returned.summary.totalConnections.actual).toBe(1);
    expect(result.current.showModal).toBe(true);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('closeModal hides the modal but keeps the result', async () => {
    const { result } = renderHook(() => useAIDebug({ delay: 0 }));
    await act(async () => {
      await result.current.runDebug([], []);
    });
    act(() => result.current.closeModal());
    expect(result.current.showModal).toBe(false);
    expect(result.current.result).not.toBeNull();
  });

  it('openModal reopens only when a result exists', async () => {
    const { result } = renderHook(() => useAIDebug({ delay: 0 }));
    // no result yet → openModal is a no-op
    act(() => result.current.openModal());
    expect(result.current.showModal).toBe(false);

    await act(async () => {
      await result.current.runDebug([], []);
    });
    act(() => result.current.closeModal());
    act(() => result.current.openModal());
    expect(result.current.showModal).toBe(true);
  });

  it('clearResult drops the result and closes the modal', async () => {
    const { result } = renderHook(() => useAIDebug({ delay: 0 }));
    await act(async () => {
      await result.current.runDebug([], []);
    });
    act(() => result.current.clearResult());
    expect(result.current.result).toBeNull();
    expect(result.current.showModal).toBe(false);
  });
});
