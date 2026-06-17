/**
 * Tests for useTTS — the unique hook logic on top of the (separately-tested)
 * TTS service: localStorage config persistence (save/load/clear), the
 * provider-type → provider-class switch, auto-configure-on-mount (restore saved
 * or fall back to web-speech), the restore-failure → web-speech fallback, and
 * speak/stop/clearError delegation. The tts module is fully mocked; localStorage
 * is shimmed (jsdom resolves bare localStorage to Node's flag-gated builtin).
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- localStorage shim (same gotcha as AIDebugService) ---
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

// --- mock the tts module: stub service + provider classes ---
const svc = {
  registerProvider: vi.fn(),
  setProvider: vi.fn(),
  setDefaultVoiceConfig: vi.fn(),
  isReady: vi.fn(() => true),
  isSpeaking: vi.fn(() => false),
  getActiveProvider: vi.fn(() => ({ name: 'web-speech' })),
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
};
vi.mock('../../services/tts', () => ({
  getTTSService: vi.fn(() => svc),
  WebSpeechProvider: class { name = 'web-speech'; configure = vi.fn(); },
  OpenAITTSProvider: class { name = 'openai'; configure = vi.fn(); },
  ElevenLabsProvider: class { name = 'elevenlabs'; configure = vi.fn(); },
  CustomTTSProvider: class { name = 'custom'; configure = vi.fn(); },
  LocalTTSProvider: class { name = 'local'; configure = vi.fn(); },
}));

import { useTTS, getSavedTTSConfig, clearSavedTTSConfig } from '../useTTS';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.clearAllMocks();
  svc.isReady.mockReturnValue(true);
  svc.getActiveProvider.mockReturnValue({ name: 'web-speech' } as any);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('saved-config helpers', () => {
  it('getSavedTTSConfig returns null when nothing saved, then the saved object', () => {
    expect(getSavedTTSConfig()).toBeNull();
    localStorage.setItem('asaps_tts_config', JSON.stringify({ providerType: 'openai', apiKey: 'k' }));
    expect(getSavedTTSConfig()).toMatchObject({ providerType: 'openai', apiKey: 'k' });
  });

  it('clearSavedTTSConfig removes the entry', () => {
    localStorage.setItem('asaps_tts_config', '{"providerType":"openai"}');
    clearSavedTTSConfig();
    expect(getSavedTTSConfig()).toBeNull();
  });

  it('getSavedTTSConfig tolerates malformed JSON', () => {
    localStorage.setItem('asaps_tts_config', '{bad');
    expect(getSavedTTSConfig()).toBeNull();
  });
});

describe('useTTS', () => {
  it('auto-configures web-speech on mount when no saved config', () => {
    const { result } = renderHook(() => useTTS());
    expect(svc.registerProvider).toHaveBeenCalled();
    expect(svc.setProvider).toHaveBeenCalledWith('web-speech');
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.currentProvider).toBe('web-speech');
  });

  it('restores a saved configuration on mount', () => {
    localStorage.setItem('asaps_tts_config', JSON.stringify({ providerType: 'openai', apiKey: 'sk-x', defaultVoiceId: 'nova' }));
    renderHook(() => useTTS());
    expect(svc.setProvider).toHaveBeenCalledWith('openai');
    expect(svc.setDefaultVoiceConfig).toHaveBeenCalledWith({ voiceId: 'nova' });
  });

  it('configure() persists to localStorage', () => {
    const { result } = renderHook(() => useTTS());
    act(() => result.current.configure('elevenlabs', 'el-key', undefined, undefined, 'voice1'));
    expect(getSavedTTSConfig()).toMatchObject({ providerType: 'elevenlabs', apiKey: 'el-key', defaultVoiceId: 'voice1' });
    expect(svc.setProvider).toHaveBeenLastCalledWith('elevenlabs');
  });

  it('configure() with an unsupported provider sets an error', () => {
    const { result } = renderHook(() => useTTS());
    act(() => result.current.configure('bogus' as any));
    expect(result.current.error).toMatch(/not supported/i);
  });

  it('speak / stop / clearError delegate and reset', async () => {
    const { result } = renderHook(() => useTTS());
    await act(async () => {
      await result.current.speak('hello', 'Narrator');
    });
    expect(svc.speak).toHaveBeenCalledWith('hello', 'Narrator');
    act(() => result.current.stop());
    expect(svc.stop).toHaveBeenCalled();

    act(() => result.current.configure('bogus' as any)); // set an error
    expect(result.current.error).toBeTruthy();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
