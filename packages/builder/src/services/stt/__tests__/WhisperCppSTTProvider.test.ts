/**
 * Tests for WhisperCppSTTProvider — the offline whisper.cpp STT provider. The
 * VAD recording loop (getUserMedia/MediaRecorder/AudioContext) isn't exercised
 * here; we cover the directly-testable surface: identity, baseUrl-required
 * config, the fetch-based transcribe() (FormData shape, language normalization,
 * context prompt, error path) and its noise/repetition hallucination filtering,
 * plus stopListening/TTS-pause wiring.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhisperCppSTTProvider } from '../WhisperCppSTTProvider';

describe('WhisperCppSTTProvider', () => {
  let provider: WhisperCppSTTProvider;
  let originalFetch: typeof global.fetch;

  const mockFetch = (text: string, ok = true, status = 200) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve({ text }),
      text: () => Promise.resolve(text),
    });
  };

  beforeEach(() => {
    provider = new WhisperCppSTTProvider();
    originalFetch = global.fetch;
    provider.configure({ provider: 'whisper-cpp', baseUrl: 'http://localhost:8178' });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Identity', () => {
    it('has the expected name and capability flags', () => {
      expect(provider.name).toBe('Whisper.cpp STT');
      expect(provider.requiresApiKey).toBe(false);
      expect(provider.supportsStreaming).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('is ready with a baseUrl, not ready without one', () => {
      expect(provider.isReady()).toBe(true);
      const bare = new WhisperCppSTTProvider();
      bare.configure({ provider: 'whisper-cpp' });
      expect(bare.isReady()).toBe(false);
    });

    it('isListening is false initially', () => {
      expect(provider.isListening()).toBe(false);
    });
  });

  describe('transcribe()', () => {
    it('throws when not configured', async () => {
      const bare = new WhisperCppSTTProvider();
      await expect(bare.transcribe(new Blob(['a']))).rejects.toThrow();
    });

    it('POSTs FormData to the /inference endpoint and returns the text', async () => {
      mockFetch('Hello there');
      const result = await provider.transcribe(new Blob(['audio'], { type: 'audio/webm' }));
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8178/inference', expect.objectContaining({ method: 'POST' }));
      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('response_format')).toBe('json');
      expect(body.get('temperature')).toBe('0');
      expect(body.get('file')).toBeTruthy();
      expect(result).toEqual({ text: 'Hello there', isFinal: true });
    });

    it('normalizes the language to a lowercase base code', async () => {
      mockFetch('Hallo');
      await provider.transcribe(new Blob(['a']), 'de-DE');
      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('language')).toBe('de');
    });

    it('includes the context prompt when set', async () => {
      mockFetch('ok');
      provider.setContextPrompt('Elena, Bergen, ferry');
      await provider.transcribe(new Blob(['a']));
      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('prompt')).toBe('Elena, Bergen, ferry');
    });

    it('strips a trailing slash from baseUrl', async () => {
      provider.configure({ provider: 'whisper-cpp', baseUrl: 'http://localhost:8178/' });
      mockFetch('ok');
      await provider.transcribe(new Blob(['a']));
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8178/inference', expect.any(Object));
    });

    it('throws with status + body on a non-OK response', async () => {
      mockFetch('model not loaded', false, 503);
      await expect(provider.transcribe(new Blob(['a']))).rejects.toThrow('Whisper.cpp error 503: model not loaded');
    });
  });

  describe('hallucination filtering (via transcribe)', () => {
    it.each(['[BLANK_AUDIO]', '(music)', 'Thank you.', 'you', 'um', '...', 'Thanks for watching'])(
      'filters noise pattern %s to empty',
      async (noise) => {
        mockFetch(noise);
        const result = await provider.transcribe(new Blob(['a']));
        expect(result.text).toBe('');
      },
    );

    it('filters a repeated phrase to empty', async () => {
      mockFetch('abcabcabc');
      expect((await provider.transcribe(new Blob(['a']))).text).toBe('');
    });

    it('keeps genuine speech untouched (trimmed)', async () => {
      mockFetch('  Where is the ferry terminal?  ');
      expect((await provider.transcribe(new Blob(['a']))).text).toBe('Where is the ferry terminal?');
    });
  });

  describe('stopListening + TTS wiring', () => {
    it('returns null when not listening', async () => {
      expect(await provider.stopListening()).toBeNull();
    });

    it('isTTSSpeaking reflects the attached TTS service', () => {
      expect((provider as any).isTTSSpeaking()).toBe(false); // none attached
      provider.setTTSService({ isSpeaking: () => true });
      expect((provider as any).isTTSSpeaking()).toBe(true);
      provider.setTTSService(null);
      expect((provider as any).isTTSSpeaking()).toBe(false);
    });
  });
});
