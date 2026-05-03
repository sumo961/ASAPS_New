import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ElevenLabsProvider } from '../ElevenLabsProvider';

describe('ElevenLabsProvider', () => {
  let provider: ElevenLabsProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new ElevenLabsProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (window as any).electronAPI;
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------
  describe('Identity', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('ElevenLabs');
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
      provider.configure({ provider: 'elevenlabs', apiKey: 'xi-test123' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without API key', () => {
      provider.configure({ provider: 'elevenlabs' });
      expect(provider.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize (browser proxy)
  // -------------------------------------------------------------------------
  describe('synthesize() — browser proxy', () => {
    beforeEach(() => {
      provider.configure({ provider: 'elevenlabs', apiKey: 'xi-test123' });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new ElevenLabsProvider();
      await expect(unconfigured.synthesize('hello')).rejects.toThrow('not configured');
    });

    it('should POST to proxy endpoint and return raw Response for streaming', async () => {
      // The provider now returns { audio: null, response } so the
      // AudioManager can decide between MediaSource streaming and blob
      // fallback. Tests assert on the raw response, not a pre-built blob.
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts/elevenlabs',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.audio).toBeNull();
      expect(result.response).toBe(mockResponse);
    });

    it('should include voiceId, text, and model_id in body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test', { voiceId: 'custom-voice-id' });

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voiceId).toBe('custom-voice-id');
      expect(body.text).toBe('Test');
      // Default model upgraded to eleven_v3 (latest ElevenLabs flagship).
      expect(body.model_id).toBe('eleven_v3');
    });

    it('should use custom model from config', async () => {
      provider.configure({ provider: 'elevenlabs', apiKey: 'xi-test', model: 'eleven_turbo_v2_5' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test');

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.model_id).toBe('eleven_turbo_v2_5');
    });

    it('should use default voiceId when none specified', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Test');

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.voiceId).toBe('EXAVITQu4vr4xnSDxMaL');
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      // Error message format unified across browser-proxy and Electron-direct
      // paths — single "ElevenLabs error N: …" instead of distinguishing
      // proxy vs direct in the message.
      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'ElevenLabs error 403: Forbidden'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize (Electron direct)
  // -------------------------------------------------------------------------
  describe('synthesize() — Electron direct', () => {
    beforeEach(() => {
      (window as any).electronAPI = { isElectron: true };
      provider.configure({ provider: 'elevenlabs', apiKey: 'xi-test123' });
    });

    it('should call ElevenLabs streaming endpoint directly in Electron', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      });

      await provider.synthesize('Hello', { voiceId: 'voice123' });

      // Provider now uses the /stream endpoint for faster time-to-first-audio.
      // eleven_v3 (default) doesn't support optimize_streaming_latency, so the
      // URL has no query params for the default model.
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/voice123/stream',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'xi-test123',
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // getVoices (browser proxy)
  // -------------------------------------------------------------------------
  describe('getVoices() — browser proxy', () => {
    beforeEach(() => {
      provider.configure({ provider: 'elevenlabs', apiKey: 'xi-test123' });
    });

    it('should fetch and map voices from API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          voices: [
            { voice_id: 'v1', name: 'Rachel', labels: { gender: 'female' } },
            { voice_id: 'v2', name: 'Adam', labels: { gender: 'male' } },
          ],
        }),
      });

      const voices = await provider.getVoices();

      expect(voices).toHaveLength(2);
      expect(voices[0]).toEqual({
        id: 'v1',
        name: 'Rachel',
        lang: 'mul',
        gender: 'female',
      });
      expect(voices[1]).toEqual({
        id: 'v2',
        name: 'Adam',
        lang: 'mul',
        gender: 'male',
      });
    });

    it('should cache voices after first fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ voices: [{ voice_id: 'v1', name: 'Test' }] }),
      });

      await provider.getVoices();
      await provider.getVoices();

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
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
