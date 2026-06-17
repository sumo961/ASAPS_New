/**
 * Tests for useAI — the unique hook logic over the (separately-tested)
 * AIService: localStorage config persistence, the claude/openai provider
 * switch, auto-restore-on-mount (only when a saved apiKey exists), and the
 * generateStory state machine (not-configured guard, isGenerating toggle,
 * onProgress forwarding, error→null). The services module is mocked;
 * localStorage is shimmed; fake timers contain the 1s poll.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeAll(() => {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
  if (typeof window !== 'undefined') Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
});

const svc = {
  registerProvider: vi.fn(),
  setProvider: vi.fn(),
  isReady: vi.fn(() => true),
  getCurrentProvider: vi.fn(() => ({ name: 'claude' })),
  generateStory: vi.fn().mockResolvedValue({ story: { beats: [] } }),
  cancel: vi.fn(),
};
vi.mock('../../services', () => ({
  getAIService: vi.fn(() => svc),
  ClaudeProvider: class { name = 'claude'; configure = vi.fn(); },
  OpenAIProvider: class { name = 'openai'; configure = vi.fn(); },
}));

import { useAI, getSavedAIConfig, clearSavedAIConfig } from '../useAI';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.clearAllMocks();
  svc.isReady.mockReturnValue(true);
  svc.getCurrentProvider.mockReturnValue({ name: 'claude' } as any);
  svc.generateStory.mockResolvedValue({ story: { beats: [] } } as any);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('saved-config helpers', () => {
  it('round-trips and clears', () => {
    expect(getSavedAIConfig()).toBeNull();
    localStorage.setItem('asaps_ai_config', JSON.stringify({ provider: 'openai', apiKey: 'sk' }));
    expect(getSavedAIConfig()).toMatchObject({ provider: 'openai' });
    clearSavedAIConfig();
    expect(getSavedAIConfig()).toBeNull();
  });
});

describe('mount auto-configure', () => {
  it('does not configure when no saved config', () => {
    renderHook(() => useAI());
    expect(svc.registerProvider).not.toHaveBeenCalled();
  });

  it('does not configure a saved config that lacks an apiKey', () => {
    localStorage.setItem('asaps_ai_config', JSON.stringify({ provider: 'claude' }));
    renderHook(() => useAI());
    expect(svc.registerProvider).not.toHaveBeenCalled();
  });

  it('restores a saved config that has an apiKey', () => {
    localStorage.setItem('asaps_ai_config', JSON.stringify({ provider: 'openai', apiKey: 'sk-x', providerType: 'openai' }));
    renderHook(() => useAI());
    expect(svc.setProvider).toHaveBeenCalledWith('openai');
  });
});

describe('configure', () => {
  it('claude → ClaudeProvider, persists config', () => {
    const { result } = renderHook(() => useAI());
    act(() => result.current.configure('claude', 'sk-claude', 'claude-opus-4-8'));
    expect(svc.setProvider).toHaveBeenLastCalledWith('claude');
    expect(getSavedAIConfig()).toMatchObject({ provider: 'claude', apiKey: 'sk-claude', model: 'claude-opus-4-8' });
  });

  it('openai → OpenAIProvider', () => {
    const { result } = renderHook(() => useAI());
    act(() => result.current.configure('openai', 'sk-oa'));
    expect(svc.setProvider).toHaveBeenLastCalledWith('openai');
  });
});

describe('generateStory', () => {
  it('returns null + sets error when the service is not configured', async () => {
    svc.isReady.mockReturnValue(false);
    const { result } = renderHook(() => useAI());
    let resp: any = 'x';
    await act(async () => {
      resp = await result.current.generateStory({ prompt: 'a tale' } as any);
    });
    expect(resp).toBeNull();
    expect(result.current.error).toMatch(/not configured/i);
  });

  it('delegates, forwards onProgress, returns the response, and clears isGenerating', async () => {
    // make the service invoke the (wrapped) onProgress so we can assert forwarding
    svc.generateStory.mockImplementation(async (req: any) => {
      req.onProgress?.(42);
      return { story: { beats: [{ id: 'b1' }] } };
    });
    const onProgress = vi.fn();
    const { result } = renderHook(() => useAI());
    let resp: any;
    await act(async () => {
      resp = await result.current.generateStory({ prompt: 'a tale', onProgress } as any);
    });
    expect(svc.generateStory).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(42); // caller callback forwarded
    expect(resp.story.beats).toHaveLength(1);
    expect(result.current.isGenerating).toBe(false);
  });

  it('clears isGenerating and sets nothing-thrown state on a service error', async () => {
    svc.generateStory.mockRejectedValue(new Error('upstream 500'));
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStory({ prompt: 'x' } as any).catch(() => {});
    });
    expect(result.current.isGenerating).toBe(false);
  });
});

describe('cancel + clearError', () => {
  it('cancelGeneration cancels the service and clears isGenerating', () => {
    const { result } = renderHook(() => useAI());
    act(() => result.current.cancelGeneration());
    expect(svc.cancel).toHaveBeenCalled();
    expect(result.current.isGenerating).toBe(false);
  });

  it('clearError resets the error', async () => {
    svc.isReady.mockReturnValue(false);
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStory({ prompt: 'x' } as any);
    });
    expect(result.current.error).toBeTruthy();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
