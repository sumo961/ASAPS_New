import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CustomTTSProvider } from '../CustomTTSProvider';

describe('CustomTTSProvider', () => {
  let provider: CustomTTSProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new CustomTTSProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------
  describe('Identity', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('Custom TTS');
    });

    it('should not require API key', () => {
      expect(provider.requiresApiKey).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  describe('Configuration', () => {
    it('should be ready with baseUrl', () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without baseUrl', () => {
      provider.configure({ provider: 'custom' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with empty baseUrl', () => {
      provider.configure({ provider: 'custom', baseUrl: '   ' });
      expect(provider.isReady()).toBe(false);
    });

    it('should accept optional apiKey', () => {
      provider.configure({
        provider: 'custom',
        baseUrl: 'http://localhost:8080',
        apiKey: 'optional-key',
      });
      expect(provider.isReady()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize
  // -------------------------------------------------------------------------
  describe('synthesize()', () => {
    beforeEach(() => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new CustomTTSProvider();
      await expect(unconfigured.synthesize('hello')).rejects.toThrow('not configured');
    });

    it('should POST to baseUrl/audio/speech', async () => {
      const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const result = await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/audio/speech',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.audio).toBe(mockBlob);
    });

    it('should strip trailing slash from baseUrl', async () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1/' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/audio/speech',
        expect.any(Object)
      );
    });

    it('should include voice, model, speed, and input in body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test text', { voiceId: 'custom-voice', rate: 1.2 });

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.input).toBe('Test text');
      expect(body.voice).toBe('custom-voice');
      expect(body.speed).toBe(1.2);
      expect(body.model).toBe('tts-1');
    });

    it('should default voice to "default"', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test');

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voice).toBe('default');
    });

    it('should include Authorization header when apiKey is set', async () => {
      provider.configure({
        provider: 'custom',
        baseUrl: 'http://localhost:8080',
        apiKey: 'my-key',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Hello');

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-key');
    });

    it('should not include Authorization header when no apiKey', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Hello');

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Custom TTS error 500: Internal Server Error'
      );
    });
  });

  // -------------------------------------------------------------------------
  // getVoices
  // -------------------------------------------------------------------------
  describe('getVoices()', () => {
    it('should return empty when not configured', async () => {
      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should fetch voices from baseUrl/voices', async () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          voices: [
            { id: 'v1', name: 'Voice One', lang: 'en', gender: 'female' },
          ],
        }),
      });

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0]).toEqual({ id: 'v1', name: 'Voice One', lang: 'en', gender: 'female' });
    });

    it('should handle array response format', async () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: 'v1', name: 'Voice One' },
          { id: 'v2', name: 'Voice Two' },
        ]),
      });

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(2);
    });

    it('should return empty on fetch failure', async () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should return empty on network error', async () => {
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:8080/v1' });
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should include Authorization when apiKey set', async () => {
      provider.configure({
        provider: 'custom',
        baseUrl: 'http://localhost:8080/v1',
        apiKey: 'my-key',
      });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await provider.getVoices();

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-key');
    });
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('should be a no-op', () => {
      expect(() => provider.stop()).not.toThrow();
    });
  });
});
