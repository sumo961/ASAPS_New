/**
 * Tests for useSTT — config persistence + provider switch (mirrors useTTS) plus
 * the speech-recognition specifics: auto-configure is gated on
 * window.SpeechRecognition, and startListening wires onResult/onError/onEnd
 * callbacks that accumulate final text (space-joined), surface interim text,
 * and fire onFinalResult. The stt module is mocked; localStorage is shimmed.
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

let captured: any = null; // captures the startListening callbacks bag
const svc = {
  registerProvider: vi.fn(),
  setProvider: vi.fn(),
  setLanguage: vi.fn(),
  isReady: vi.fn(() => true),
  isListening: vi.fn(() => false),
  getActiveProvider: vi.fn(() => ({ name: 'web-speech' })),
  startListening: vi.fn((cb: any) => {
    captured = cb;
  }),
  stopListening: vi.fn().mockResolvedValue({ text: 'final from service' }),
};
vi.mock('../../services/stt', () => ({
  getSTTService: vi.fn(() => svc),
  WebSpeechSTTProvider: class { name = 'web-speech'; configure = vi.fn(); },
  WhisperSTTProvider: class { name = 'whisper'; configure = vi.fn(); },
  LocalSTTProvider: class { name = 'local'; configure = vi.fn(); },
  VoskSTTProvider: class { name = 'vosk'; configure = vi.fn(); },
  WhisperCppSTTProvider: class { name = 'whisper-cpp'; configure = vi.fn(); },
}));

import { useSTT, getSavedSTTConfig, clearSavedSTTConfig } from '../useSTT';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.clearAllMocks();
  captured = null;
  svc.isReady.mockReturnValue(true);
  svc.isListening.mockReturnValue(false);
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('saved-config helpers', () => {
  it('round-trips and clears', () => {
    expect(getSavedSTTConfig()).toBeNull();
    localStorage.setItem('asaps_stt_config', JSON.stringify({ providerType: 'whisper', apiKey: 'k' }));
    expect(getSavedSTTConfig()).toMatchObject({ providerType: 'whisper' });
    clearSavedSTTConfig();
    expect(getSavedSTTConfig()).toBeNull();
  });
});

describe('useSTT mount', () => {
  it('does NOT auto-register when no saved config and no SpeechRecognition', () => {
    renderHook(() => useSTT());
    expect(svc.registerProvider).not.toHaveBeenCalled();
  });

  it('auto-registers web-speech when SpeechRecognition is available', () => {
    (window as any).SpeechRecognition = class {};
    renderHook(() => useSTT());
    expect(svc.setProvider).toHaveBeenCalledWith('web-speech');
  });

  it('restores a saved configuration (with language)', () => {
    localStorage.setItem('asaps_stt_config', JSON.stringify({ providerType: 'whisper', apiKey: 'k', language: 'es' }));
    renderHook(() => useSTT());
    expect(svc.setProvider).toHaveBeenCalledWith('whisper');
    expect(svc.setLanguage).toHaveBeenCalledWith('es');
  });
});

describe('configure', () => {
  it('persists config and sets the provider; unsupported → error', () => {
    const { result } = renderHook(() => useSTT());
    act(() => result.current.configure('vosk', undefined, undefined, undefined, 'de'));
    expect(getSavedSTTConfig()).toMatchObject({ providerType: 'vosk', language: 'de' });
    expect(svc.setProvider).toHaveBeenLastCalledWith('vosk');

    act(() => result.current.configure('bogus' as any));
    expect(result.current.error).toMatch(/not supported/i);
  });
});

describe('listening', () => {
  it('accumulates final results (space-joined), surfaces interim, fires onFinalResult', () => {
    const { result } = renderHook(() => useSTT());
    const onFinal = vi.fn();
    act(() => result.current.startListening(onFinal));
    expect(result.current.isListening).toBe(true);

    act(() => captured.onResult({ text: 'hello', isFinal: true }));
    expect(result.current.finalText).toBe('hello');
    expect(onFinal).toHaveBeenCalledWith('hello');

    act(() => captured.onResult({ text: 'world', isFinal: true }));
    expect(result.current.finalText).toBe('hello world'); // space-joined

    act(() => captured.onResult({ text: 'typ', isFinal: false }));
    expect(result.current.interimText).toBe('typ');
  });

  it('onError sets error and stops listening; onEnd stops listening', () => {
    const { result } = renderHook(() => useSTT());
    act(() => result.current.startListening());
    act(() => captured.onError(new Error('mic blocked')));
    expect(result.current.error).toBe('mic blocked');
    expect(result.current.isListening).toBe(false);

    act(() => result.current.startListening());
    act(() => captured.onEnd());
    expect(result.current.isListening).toBe(false);
  });

  it('stopListening returns the service result text', async () => {
    const { result } = renderHook(() => useSTT());
    let text = '';
    await act(async () => {
      text = await result.current.stopListening();
    });
    expect(text).toBe('final from service');
    expect(result.current.isListening).toBe(false);
  });

  it('stopListening falls back to accumulated finalText when service returns nothing', async () => {
    svc.stopListening.mockResolvedValueOnce(null as any);
    const { result } = renderHook(() => useSTT());
    act(() => result.current.startListening());
    act(() => captured.onResult({ text: 'banked', isFinal: true }));
    let text = '';
    await act(async () => {
      text = await result.current.stopListening();
    });
    expect(text).toBe('banked');
  });

  it('clearText resets interim + final', () => {
    const { result } = renderHook(() => useSTT());
    act(() => result.current.startListening());
    act(() => captured.onResult({ text: 'x', isFinal: true }));
    act(() => result.current.clearText());
    expect(result.current.finalText).toBe('');
    expect(result.current.interimText).toBe('');
  });
});
