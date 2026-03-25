import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalTTSProvider, LOCAL_TTS_PRESETS } from '../LocalTTSProvider';

describe('LocalTTSProvider', () => {
  let provider: LocalTTSProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    provider = new LocalTTSProvider();
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
      expect(provider.name).toBe('Local TTS');
    });

    it('should not require API key', () => {
      expect(provider.requiresApiKey).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------------
  describe('Presets', () => {
    it('should have built-in presets', () => {
      expect(LOCAL_TTS_PRESETS.length).toBeGreaterThanOrEqual(4);
    });

    it('should include openai-compatible preset', () => {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === 'openai-compatible');
      expect(preset).toBeDefined();
      expect(preset!.template.method).toBe('POST');
      expect(preset!.template.path).toBe('/audio/speech');
    });

    it('should include coqui preset', () => {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === 'coqui');
      expect(preset).toBeDefined();
      expect(preset!.template.method).toBe('GET');
    });

    it('should include piper preset', () => {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === 'piper');
      expect(preset).toBeDefined();
    });

    it('should include chatterbox preset with voice cloning support', () => {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === 'chatterbox');
      expect(preset).toBeDefined();
      expect(preset!.supportsVoiceCloning).toBe(true);
      expect(preset!.template.referenceAudioField).toBe('audio_prompt');
    });

    it('should include kokoro preset', () => {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === 'kokoro');
      expect(preset).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  describe('Configuration', () => {
    it('should be ready with baseUrl', () => {
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:5002' });
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

    it('should use preset template when localPreset is specified', () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:5002',
        localPreset: 'coqui',
      });
      expect(provider.isReady()).toBe(true);
      expect(provider.getPresetId()).toBe('coqui');
    });

    it('should fall back to openai-compatible for unknown preset', () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080',
        localPreset: 'nonexistent',
      });
      expect(provider.isReady()).toBe(true);
    });

    it('should use custom template when localTemplate is specified', () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:9999',
        localTemplate: {
          method: 'POST',
          path: '/synthesize',
          contentType: 'json',
          body: { text: '{text}', speaker: '{voice}' },
        },
      });
      expect(provider.isReady()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize — OpenAI-compatible (default preset)
  // -------------------------------------------------------------------------
  describe('synthesize() — OpenAI-compatible', () => {
    beforeEach(() => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080/v1',
        localPreset: 'openai-compatible',
      });
    });

    it('should throw when not configured', async () => {
      const unconfigured = new LocalTTSProvider();
      await expect(unconfigured.synthesize('hello')).rejects.toThrow('not configured');
    });

    it('should POST to correct endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await provider.synthesize('Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/audio/speech',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should interpolate text, voice, and speed into body', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await provider.synthesize('Test text', { voiceId: 'nova', rate: 1.5 });

      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.input).toBe('Test text');
      expect(body.voice).toBe('nova');
      expect(body.speed).toBe('1.5');
    });

    it('should include Authorization header when apiKey is set', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080',
        localPreset: 'openai-compatible',
        apiKey: 'my-key',
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      await provider.synthesize('Hello');

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-key');
    });

    it('should return response for streaming playback', async () => {
      const mockResponse = { ok: true };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await provider.synthesize('Hello');

      expect(result.audio).toBeNull();
      expect(result.response).toBe(mockResponse);
    });

    it('should throw on non-OK response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      });

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Local TTS error 500: Server Error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize — Coqui (GET request)
  // -------------------------------------------------------------------------
  describe('synthesize() — Coqui', () => {
    beforeEach(() => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:5002',
        localPreset: 'coqui',
      });
    });

    it('should use GET method', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await provider.synthesize('Hello world', { voiceId: 'speaker1', lang: 'en' });

      const call = (global.fetch as any).mock.calls[0];
      expect(call[1].method).toBe('GET');
      // URL should contain interpolated values
      expect(call[0]).toContain('text=');
      expect(call[0]).toContain('speaker_id=speaker1');
      expect(call[0]).toContain('language_id=en');
    });
  });

  // -------------------------------------------------------------------------
  // Synthesize — Chatterbox (multipart with reference audio)
  // -------------------------------------------------------------------------
  describe('synthesize() — Chatterbox multipart', () => {
    beforeEach(() => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8150',
        localPreset: 'chatterbox',
      });
    });

    it('should use POST with no Content-Type header (multipart)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await provider.synthesize('Hello');

      const call = (global.fetch as any).mock.calls[0];
      expect(call[1].method).toBe('POST');
      expect(call[1].body).toBeInstanceOf(FormData);
      // Should not set Content-Type — browser adds boundary automatically
      expect(call[1].headers['Content-Type']).toBeUndefined();
    });

    it('should attach reference audio when available', async () => {
      const mockFile = new File(['audio-data'], 'reference.wav', { type: 'audio/wav' });
      provider.setReferenceAudios([mockFile]);

      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      await provider.synthesize('Hello');

      const formData = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(formData.get('audio_prompt')).toBeTruthy();
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

    it('should fetch from voiceListEndpoint', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080/v1',
        localPreset: 'openai-compatible',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: 'v1', name: 'Voice One', lang: 'en' },
          { id: 'v2', name: 'Voice Two', lang: 'de' },
        ]),
      });

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(2);
      expect(voices[0].id).toBe('v1');
      expect(voices[1].name).toBe('Voice Two');
    });

    it('should handle { voices: [...] } response format', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080/v1',
        localPreset: 'openai-compatible',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          voices: [{ id: 'v1', name: 'Voice' }],
        }),
      });

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(1);
    });

    it('should handle string array responses', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:5002',
        localPreset: 'coqui',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ speakers: ['Alice', 'Bob', 'Carol'] }),
      });

      const voices = await provider.getVoices();
      expect(voices).toHaveLength(3);
      expect(voices[0].id).toBe('Alice');
      expect(voices[0].name).toBe('Alice');
    });

    it('should return empty on fetch failure', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080',
        localPreset: 'openai-compatible',
      });
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should return empty on network error', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:8080',
        localPreset: 'openai-compatible',
      });
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });

    it('should return empty when preset has no voiceListEndpoint', async () => {
      provider.configure({
        provider: 'local',
        baseUrl: 'http://localhost:9999',
        localTemplate: { method: 'POST', path: '/tts' },
      });

      const voices = await provider.getVoices();
      expect(voices).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('should not throw', () => {
      expect(() => provider.stop()).not.toThrow();
    });
  });
});
