/**
 * Tests for the Web Speech TTS provider. Focus on the pure voice-ranking logic
 * (pickBestVoice: preferred/novelty lists + premium/enhanced/compact keywords +
 * local/default tiebreakers, lang-prefix filtering) and the graceful behavior
 * when the speechSynthesis API is absent (jsdom default) vs. stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechProvider } from '../WebSpeechProvider';

const voice = (name: string, lang: string, opts: Partial<SpeechSynthesisVoice> = {}) =>
  ({ name, lang, voiceURI: name, localService: false, default: false, ...opts }) as SpeechSynthesisVoice;

describe('WebSpeechProvider (TTS)', () => {
  let provider: WebSpeechProvider;
  beforeEach(() => {
    provider = new WebSpeechProvider();
    provider.configure({ provider: 'web-speech' });
  });
  afterEach(() => {
    delete (window as any).speechSynthesis;
  });

  describe('Identity', () => {
    it('has the expected name and needs no API key', () => {
      expect(provider.name).toBe('Web Speech');
      expect(provider.requiresApiKey).toBe(false);
      expect(provider.isReady()).toBe(true);
    });
  });

  describe('pickBestVoice', () => {
    const pick = (voices: SpeechSynthesisVoice[], lang: string) => (provider as any).pickBestVoice(voices, lang);

    it('returns null when no candidate matches the language', () => {
      expect(pick([voice('Samantha', 'en-US')], 'de')).toBeNull();
    });

    it('returns the sole candidate without scoring', () => {
      const only = voice('Anna', 'de-DE');
      expect(pick([only, voice('Samantha', 'en-US')], 'de')).toBe(only);
    });

    it('prefers a known high-quality voice over a novelty voice', () => {
      const picked = pick([voice('Zarvox', 'en-US'), voice('Samantha', 'en-US')], 'en');
      expect(picked.name).toBe('Samantha');
    });

    it('rewards premium/enhanced and penalizes compact', () => {
      const picked = pick(
        [voice('Aria Compact', 'en-GB'), voice('Aria Premium', 'en-GB'), voice('Aria Enhanced', 'en-GB')],
        'en-GB',
      );
      expect(picked.name).toBe('Aria Premium');
    });

    it('uses local + default as tiebreakers among equal names', () => {
      const remote = voice('Neutral One', 'fr-FR');
      const localDefault = voice('Neutral Two', 'fr-FR', { localService: true, default: true });
      expect(pick([remote, localDefault], 'fr').name).toBe('Neutral Two');
    });

    it('strips parenthetical locale when matching the preferred list', () => {
      // "Daniel (English (UK))" → base "daniel" is a PREFERRED voice
      const picked = pick([voice('Daniel (English (UK))', 'en-GB'), voice('RandomVoice', 'en-GB')], 'en');
      expect(picked.name).toMatch(/^Daniel/);
    });
  });

  describe('speechSynthesis availability', () => {
    it('synthesize rejects when the Web Speech API is unavailable', async () => {
      await expect(provider.synthesize('hello')).rejects.toThrow(/not available/i);
    });

    it('getVoices returns [] when the API is unavailable', async () => {
      expect(await provider.getVoices()).toEqual([]);
    });

    it('stop is a safe no-op when the API is unavailable', () => {
      expect(() => provider.stop()).not.toThrow();
    });

    it('getVoices maps + filters by language when the API is present', async () => {
      (window as any).speechSynthesis = {
        getVoices: () => [voice('Samantha', 'en-US', { localService: true }), voice('Anna', 'de-DE')],
        cancel: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      const all = await provider.getVoices();
      expect(all.map((v) => v.id)).toEqual(['Samantha', 'Anna']);
      expect(all[0]).toMatchObject({ name: 'Samantha', lang: 'en-US', isLocal: true });

      const fresh = new WebSpeechProvider();
      fresh.configure({ provider: 'web-speech' });
      expect((await fresh.getVoices('de')).map((v) => v.name)).toEqual(['Anna']);
    });

    it('stop cancels via the API when present', () => {
      const cancel = vi.fn();
      (window as any).speechSynthesis = { cancel };
      provider.stop();
      expect(cancel).toHaveBeenCalled();
    });
  });
});
