/**
 * Web Speech API TTS Provider
 *
 * Free built-in provider using the browser's speechSynthesis API.
 * No API key required — works out of the box.
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

export class WebSpeechProvider extends BaseTTSProvider {
  readonly name = 'Web Speech';
  readonly requiresApiKey = false;

  private cachedVoices: SpeechSynthesisVoice[] | null = null;

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Web Speech API not available');
    }

    // Ensure voices are loaded (handles Chrome's async loading)
    const voices = await this.loadVoices();

    // Stop any in-progress speech first
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    if (voiceConfig?.pitch != null) utterance.pitch = voiceConfig.pitch;
    if (voiceConfig?.rate != null) utterance.rate = voiceConfig.rate;
    if (voiceConfig?.volume != null) utterance.volume = voiceConfig.volume;
    if (voiceConfig?.lang) utterance.lang = voiceConfig.lang;

    // Set specific voice by ID, or auto-select best voice for language
    if (voiceConfig?.voiceId) {
      const match = voices.find(v => v.voiceURI === voiceConfig.voiceId);
      if (match) utterance.voice = match;
    } else if (voiceConfig?.lang && voices.length > 0) {
      const best = this.pickBestVoice(voices, voiceConfig.lang);
      if (best) utterance.voice = best;
    }

    return new Promise((resolve, reject) => {
      utterance.onend = () => resolve({ audio: null });
      utterance.onerror = (event) => {
        // 'interrupted' and 'canceled' are normal when stop() is called
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve({ audio: null });
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  async getVoices(lang?: string): Promise<TTSVoiceInfo[]> {
    const raw = await this.loadVoices();

    const voices: TTSVoiceInfo[] = raw.map(v => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      isLocal: v.localService,
    }));

    if (lang) {
      const prefix = lang.toLowerCase();
      return voices.filter(v => v.lang.toLowerCase().startsWith(prefix));
    }

    return voices;
  }

  // Well-known high-quality narrator voices (macOS, Windows, Linux)
  private static readonly PREFERRED_VOICES = new Set([
    'samantha', 'daniel', 'karen', 'moira', 'rishi', 'tessa',  // macOS quality voices
    'fred', 'ralph',                                             // macOS classic
    'alex', 'victoria', 'allison', 'ava', 'susan', 'tom',       // macOS additional
    'microsoft david', 'microsoft zira', 'microsoft mark',      // Windows
    'google us english', 'google uk english female', 'google uk english male', // Chrome
  ]);

  // Known novelty/joke voices to avoid
  private static readonly NOVELTY_VOICES = new Set([
    'albert', 'bahh', 'boing', 'cellos', 'junior', 'monster',
    'wobble', 'zarvox', 'superstar', 'trinoids', 'hysterical',
    'whisper',
    // German-named macOS novelty voices
    'flüstern', 'glocken', 'gute neuigkeiten', 'schlechte neuigkeiten',
    'seifenblasen', 'spaßvogel', 'orgel', 'katrin',
  ]);

  /**
   * Pick the best available voice for a language.
   * Uses known-good/novelty lists + quality keyword heuristics.
   */
  private pickBestVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
    const prefix = lang.toLowerCase();
    const candidates = voices.filter(v => v.lang.toLowerCase().startsWith(prefix));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const score = (v: SpeechSynthesisVoice): number => {
      // Extract the base name (before any parenthetical locale info)
      const baseName = v.name.split('(')[0].trim().toLowerCase();
      let s = 0;

      // Strong preference for known high-quality voices
      if (WebSpeechProvider.PREFERRED_VOICES.has(baseName)) s += 25;

      // Heavy penalty for novelty/joke voices
      if (WebSpeechProvider.NOVELTY_VOICES.has(baseName)) s -= 30;

      // Quality keyword heuristics (Windows, some Linux distros)
      if (baseName.includes('premium')) s += 15;
      if (baseName.includes('enhanced')) s += 10;
      if (baseName.includes('compact')) s -= 20;

      // Prefer local voices (lower latency, works offline)
      if (v.localService) s += 5;

      // Slight preference for default voice
      if (v.default) s += 3;

      return s;
    };

    candidates.sort((a, b) => score(b) - score(a));
    const picked = candidates[0];
    console.log(`[WebSpeech] Picked voice "${picked.name}" for lang "${lang}" (from ${candidates.length} candidates)`);
    return picked;
  }

  /**
   * Load browser voices, handling Chrome's async voice loading.
   * Chrome doesn't populate getVoices() synchronously on first call —
   * we listen for the voiceschanged event as a one-time fallback.
   */
  private loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (this.cachedVoices) return Promise.resolve(this.cachedVoices);

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return Promise.resolve([]);
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.cachedVoices = voices;
      return Promise.resolve(voices);
    }

    // Chrome loads voices asynchronously
    return new Promise(resolve => {
      const handler = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        const loaded = window.speechSynthesis.getVoices();
        this.cachedVoices = loaded;
        resolve(loaded);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
    });
  }
}
