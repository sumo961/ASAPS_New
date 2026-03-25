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
      expect(body.get('model')).toBe('whisper-1');
      expect(body.get('file')).toBeTruthy();
    });

    it('should include language when specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']), 'de');

      const body = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(body.get('language')).toBe('de');
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
