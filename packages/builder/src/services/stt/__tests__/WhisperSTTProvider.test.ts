import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WhisperSTTProvider } from '../WhisperSTTProvider';

describe('WhisperSTTProvider', () => {
  let provider: WhisperSTTProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new WhisperSTTProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Identity', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('Whisper STT');
    });

    it('should require API key', () => {
      expect(provider.requiresApiKey).toBe(true);
    });

    it('should not support streaming', () => {
      expect(provider.supportsStreaming).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should be ready with API key', () => {
      provider.configure({ provider: 'whisper', apiKey: 'sk-test' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without API key', () => {
      provider.configure({ provider: 'whisper' });
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('transcribe()', () => {
    beforeEach(() => {
      provider.configure({ provider: 'whisper', apiKey: 'sk-test' });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new WhisperSTTProvider();
      const blob = new Blob(['audio']);
      await expect(unconfigured.transcribe(blob)).rejects.toThrow('not configured');
    });

    it('should POST to OpenAI transcriptions endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello world' }),
      });

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      const result = await provider.transcribe(blob);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.text).toBe('Hello world');
      expect(result.isFinal).toBe(true);
    });

    it('should include Authorization header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']));

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer sk-test');
    });

    it('should send FormData with file and model', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']));

      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('model')).toBe('gpt-transcribe');
      expect(body.get('file')).toBeTruthy();
    });

    it('gives gpt-transcribe the language as a list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']), 'de-DE');

      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.getAll('languages[]')).toEqual(['de']);
      expect(body.has('language')).toBe(false);
    });

    it('gives whisper-1 and other servers the single language field', async () => {
      provider.configure({ provider: 'whisper', apiKey: 'sk-test', model: 'whisper-1' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']), 'zh-Hans');

      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('language')).toBe('zh');
      expect(body.has('languages[]')).toBe(false);
    });

    it('asks gpt-transcribe once whisper-1 has been switched off', async () => {
      provider.configure({ provider: 'whisper', apiKey: 'sk-test', model: 'whisper-1' });
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('model_not_found') })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ text: 'Hallo', languages: [{ code: 'de' }] }) });

      const result = await provider.transcribe(new Blob(['audio']), 'de');

      const second = (global.fetch as any).mock.calls[1][1].body as FormData;
      expect(second.get('model')).toBe('gpt-transcribe');
      expect(second.getAll('languages[]')).toEqual(['de']);
      expect(result).toMatchObject({ text: 'Hallo', detectedLanguage: 'de' });
    });

    it('does not swap the model on another server', async () => {
      provider.configure({ provider: 'whisper', apiKey: 'k', model: 'whisper-1', baseUrl: 'http://localhost:9000/v1' });
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('nope') });

      await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow('Whisper API error 404');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should use custom baseUrl when configured', async () => {
      provider.configure({
        provider: 'whisper',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:9000/v1',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']));

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/v1/audio/transcriptions',
        expect.any(Object),
      );
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow(
        'Whisper API error 401: Unauthorized',
      );
    });

    it('should return detected language', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Hallo', language: 'de' }),
      });

      const result = await provider.transcribe(new Blob(['audio']));
      expect(result.detectedLanguage).toBe('de');
    });
  });

  describe('isListening()', () => {
    it('should return false initially', () => {
      expect(provider.isListening()).toBe(false);
    });
  });
});
