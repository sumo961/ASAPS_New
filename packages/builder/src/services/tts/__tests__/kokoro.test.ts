import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KOKORO_VOICES, describeKokoroVoice, isKokoro, kokoroVoiceFor } from '../kokoro';
import { LocalTTSProvider } from '../LocalTTSProvider';
import { CustomTTSProvider } from '../CustomTTSProvider';

describe('Kokoro voices and languages', () => {
  it('lists a voice for each of its nine language codes', () => {
    expect(KOKORO_VOICES).toHaveLength(54);
    expect(new Set(KOKORO_VOICES.map((v) => v.id.charAt(0)))).toEqual(new Set('abefhijpz'.split('')));
    expect(new Set(KOKORO_VOICES.map((v) => v.id)).size).toBe(54);
  });

  it('reads language and gender from the id', () => {
    expect(describeKokoroVoice('af_heart')).toEqual({ id: 'af_heart', name: 'Heart (American F)', lang: 'en-US', gender: 'female' });
    expect(describeKokoroVoice('jm_kumo')).toMatchObject({ lang: 'ja', gender: 'male' });
    expect(describeKokoroVoice('alloy')).toBeUndefined();
  });

  it('knows a Kokoro setup by its preset or its model name', () => {
    expect(isKokoro({ localPreset: 'kokoro' })).toBe(true);
    expect(isKokoro({ model: 'mlx-community/Kokoro-82M-bf16', localPreset: 'openai-compatible' })).toBe(true);
    expect(isKokoro({ model: 'tts-1' })).toBe(false);
  });

  describe('kokoroVoiceFor', () => {
    it('keeps a voice that reads the language', () => {
      expect(kokoroVoiceFor('am_adam', 'en')).toEqual({ voice: 'am_adam', langCode: 'a' });
      expect(kokoroVoiceFor('bf_emma', 'en-US')).toEqual({ voice: 'bf_emma', langCode: 'b' });
      expect(kokoroVoiceFor('am_adam', undefined)).toEqual({ voice: 'am_adam', langCode: 'a' });
      expect(kokoroVoiceFor('zf_xiaobei', 'zh-Hans')).toEqual({ voice: 'zf_xiaobei', langCode: 'z' });
    });

    it('takes a voice of the language, same gender, when the chosen one cannot read it', () => {
      expect(kokoroVoiceFor('am_adam', 'es-419')).toEqual({ voice: 'em_alex', langCode: 'e' });
      expect(kokoroVoiceFor('af_heart', 'Italian')).toEqual({ voice: 'if_sara', langCode: 'i' });
      expect(kokoroVoiceFor('am_adam', 'pt-BR')).toEqual({ voice: 'pm_alex', langCode: 'p' });
      // French has one voice, a woman's.
      expect(kokoroVoiceFor('am_adam', 'fr')).toEqual({ voice: 'ff_siwis', langCode: 'f' });
      expect(kokoroVoiceFor('default', 'ja')).toEqual({ voice: 'jf_alpha', langCode: 'j' });
    });

    it('returns null for a language Kokoro does not have', () => {
      expect(kokoroVoiceFor('am_adam', 'de')).toBeNull();
      expect(kokoroVoiceFor('default', 'German')).toBeNull();
    });

    it('leaves a custom voice alone for English', () => {
      expect(kokoroVoiceFor('my_clone', 'en')).toEqual({ voice: 'my_clone', langCode: undefined });
    });
  });

  describe('requests', () => {
    let originalFetch: typeof global.fetch;
    beforeEach(() => { originalFetch = global.fetch; global.fetch = vi.fn().mockResolvedValue({ ok: true }); });
    afterEach(() => { global.fetch = originalFetch; });
    const sent = () => JSON.parse((global.fetch as any).mock.calls[0][1].body);

    it('Local: sends the voice language as lang_code (mlx-audio assumes American English without it)', async () => {
      const provider = new LocalTTSProvider();
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:4123/v1', model: 'mlx-community/Kokoro-82M-bf16' });
      await provider.synthesize('Good day', { voiceId: 'bm_george', lang: 'en' });
      expect(sent()).toMatchObject({ voice: 'bm_george', lang_code: 'b', input: 'Good day' });
    });

    it('Local: a Spanish line is read by a Spanish voice', async () => {
      const provider = new LocalTTSProvider();
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:8880/v1', localPreset: 'kokoro' });
      await provider.synthesize('Buenos días', { voiceId: 'af_heart', lang: 'es' });
      expect(sent()).toMatchObject({ voice: 'ef_dora', lang_code: 'e' });
    });

    it('Local: a German line is handed back', async () => {
      const provider = new LocalTTSProvider();
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:8880/v1', localPreset: 'kokoro' });
      await expect(provider.synthesize('Guten Tag', { voiceId: 'af_heart', lang: 'de' })).rejects.toMatchObject({ name: 'TTSUnavailableError' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Local: other servers get no lang_code', async () => {
      const provider = new LocalTTSProvider();
      provider.configure({ provider: 'local', baseUrl: 'http://localhost:8080/v1', model: 'piper' });
      await provider.synthesize('Guten Tag', { voiceId: 'thorsten', lang: 'de' });
      expect(sent()).not.toHaveProperty('lang_code');
      expect(sent().voice).toBe('thorsten');
    });

    it('Custom: the same for Kokoro behind an OpenAI-compatible server', async () => {
      const provider = new CustomTTSProvider();
      provider.configure({ provider: 'custom', baseUrl: 'http://localhost:4123/v1', model: 'Kokoro-82M' });
      await provider.synthesize('Ciao', { voiceId: 'am_adam', lang: 'it' });
      expect(sent()).toMatchObject({ voice: 'im_nicola', lang_code: 'i' });
    });
  });
});
