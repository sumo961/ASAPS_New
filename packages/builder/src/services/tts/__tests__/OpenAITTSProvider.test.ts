import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OpenAITTSProvider } from '../OpenAITTSProvider';

describe('OpenAITTSProvider', () => {
  let provider: OpenAITTSProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new OpenAITTSProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Clear electronAPI if set
    delete (window as any).electronAPI;
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------
  describe('Identity', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('OpenAI TTS');
    });

    it('should require API key', () => {
      expect(provider.requiresApiKey).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  describe('Configuration', () => {
    it('should be ready after configuring with API key', () => {
      provider.configure({ provider: 'openai', apiKey: 'sk-test123' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without API key', () => {
      provider.configure({ provider: 'openai' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with empty API key', () => {
      provider.configure({ provider: 'openai', apiKey: '  ' });
      expect(provider.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Voices
  // -------------------------------------------------------------------------
  describe('getVoices()', () => {
    it('should return 10 static voices', async () => {
      const voices = await provider.getVoices();
      expect(voices).toHaveLength(10);
    });

    it('should include expected voice IDs', async () => {
      const voices = await provider.getVoices();
      const ids = voices.map(v => v.id);
      expect(ids).toContain('alloy');
      expect(ids).toContain('nova');
      expect(ids).toContain('onyx');
      expect(ids).toContain('shimmer');
      expect(ids).toContain('echo');
      expect(ids).toContain('sage');
    });

    it('should return all multilingual voices regardless of lang filter', async () => {
      const voices = await provider.getVoices('de');
      expect(voices).toHaveLength(10);
    });

    it('should include gender info on voices', async () => {
      const voices = await provider.getVoices();
      const nova = voices.find(v => v.id === 'nova');
      expect(nova?.gender).toBe('female');
      const onyx = voices.find(v => v.id === 'onyx');
      expect(onyx?.gender).toBe('male');
      const alloy = voices.find(v => v.id === 'alloy');
      expect(alloy?.gender).toBe('neutral');
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize (browser proxy path)
  // -------------------------------------------------------------------------
  describe('synthesize() — browser proxy', () => {
    beforeEach(() => {
      provider.configure({ provider: 'openai', apiKey: 'sk-test123' });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new OpenAITTSProvider();
      await expect(unconfigured.synthesize('hello')).rejects.toThrow(
        'not configured'
      );
    });

    it('should POST to proxy endpoint in browser mode and return raw Response', async () => {
      // Provider returns { audio: null, response } so AudioManager can
      // stream via MediaSource (or fall back to blob() lazily).
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts/openai',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.audio).toBeNull();
      expect(result.response).toBe(mockResponse);
    });

    it('should include voice, model, and speed in request body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test', { voiceId: 'nova', rate: 1.5 });

      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.voice).toBe('nova');
      expect(body.speed).toBe(1.5);
      expect(body.model).toBe('tts-1');
      expect(body.input).toBe('Test');
    });

    it('should use custom model from config', async () => {
      provider.configure({ provider: 'openai', apiKey: 'sk-test', model: 'tts-1-hd' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test');

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.model).toBe('tts-1-hd');
    });

    it('should default voice to alloy', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test');

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voice).toBe('alloy');
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      // Error message format unified — single "OpenAI TTS error N: …"
      // for both browser-proxy and Electron-direct paths.
      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'OpenAI TTS error 401: Unauthorized'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize (Electron direct path)
  // -------------------------------------------------------------------------
  describe('synthesize() — Electron direct', () => {
    beforeEach(() => {
      (window as any).electronAPI = { isElectron: true };
      provider.configure({ provider: 'openai', apiKey: 'sk-test123' });
    });

    it('should call OpenAI API directly in Electron and return raw Response', async () => {
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test123',
          }),
        })
      );
      // Streaming-mode result: audio is null, response is the raw Response.
      expect(result.audio).toBeNull();
      expect(result.response).toBe(mockResponse);
    });

    it('should use custom baseUrl in Electron', async () => {
      provider.configure({
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://custom.api.com/v1',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/audio/speech',
        expect.any(Object)
      );
    });
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('should be a no-op (AudioManager manages playback)', () => {
      expect(() => provider.stop()).not.toThrow();
    });
  });
});
