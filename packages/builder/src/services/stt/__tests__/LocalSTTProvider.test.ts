import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalSTTProvider } from '../LocalSTTProvider';

describe('LocalSTTProvider', () => {
  let provider: LocalSTTProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new LocalSTTProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Identity', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('Local STT');
    });

    it('should not require API key', () => {
      expect(provider.requiresApiKey).toBe(false);
    });

    it('should not support streaming', () => {
      expect(provider.supportsStreaming).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should be ready with baseUrl', () => {
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:9000' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without baseUrl', () => {
      provider.configure({ provider: 'local' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with empty baseUrl', () => {
      provider.configure({ provider: 'local', baseUrl: '   ' });
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('transcribe()', () => {
    beforeEach(() => {
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:9000/v1' });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new LocalSTTProvider();
      await expect(unconfigured.transcribe(new Blob(['audio']))).rejects.toThrow('not configured');
    });

    it('should POST to /v1/audio/transcriptions', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello' }),
      });

      const result = await provider.transcribe(new Blob(['audio']));

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9000/v1/audio/transcriptions',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.text).toBe('Hello');
      expect(result.isFinal).toBe(true);
    });

    it('should auto-append /v1 if not in baseUrl', async () => {
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:9000' });

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

    it('should include optional API key', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:9000/v1',
        apiKey: 'local-key',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'test' }),
      });

      await provider.transcribe(new Blob(['audio']));

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer local-key');
    });

    it('should handle transcript field in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transcript: 'Hello from transcript' }),
      });

      const result = await provider.transcribe(new Blob(['audio']));
      expect(result.text).toBe('Hello from transcript');
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Error'),
      });

      await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow(
        'Local STT error 500: Internal Error',
      );
    });
  });

  describe('isListening()', () => {
    it('should return false initially', () => {
      expect(provider.isListening()).toBe(false);
    });
  });
});
