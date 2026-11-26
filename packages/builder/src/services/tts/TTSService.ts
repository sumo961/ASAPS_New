/**
 * TTS Service
 *
 * Singleton coordinator for text-to-speech operations.
 * Mirrors AIService pattern: provider registry + high-level API.
 */

import type { ITTSProvider, TTSVoiceConfig, TTSUnavailableError } from '../../types/tts';
import { notify } from '../../utils/notify';
import { getAudioManager } from '@asaps/renderer';
import { WebSpeechProvider } from './WebSpeechProvider';

export class TTSService {
  private providers: Map<string, ITTSProvider> = new Map();
  private activeProvider: ITTSProvider | null = null;
  private _enabled: boolean = true;
  private _readPrompts: boolean = false;
  private _isSpeaking: boolean = false;
  /** Generation counter — prevents old speak() finally blocks from clearing the flag */
  private _speakGeneration: number = 0;
  /** Bumped by speak()/stop(): a running speakSegments() sequence stops. */
  private _sequence: number = 0;
  private _inSequence: boolean = false;
  private _language: string | null = null;
  private speakerVoices: Map<string, TTSVoiceConfig> = new Map();
  private speakerAliases: Map<string, string> = new Map();
  private defaultVoiceConfig: TTSVoiceConfig = {};
  /** The browser's voice, for a line the active provider can't read at all. */
  private browserVoice: ITTSProvider | null = null;
  /** The provider whose failing server the author has been told about. */
  private toldUnavailableFor: ITTSProvider | null = null;
  /** A line playing from a whole sound file (OpenAI's Realtime reader). */
  private speechPlayback: { element: HTMLAudioElement; finish: () => void } | null = null;

  // ---------------------------------------------------------------------------
  // Provider registry
  // ---------------------------------------------------------------------------

  registerProvider(provider: ITTSProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[TTSService] Registered provider: ${provider.name}`);
  }

  setProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`TTS provider "${name}" not registered`);
    }
    this.activeProvider = provider;
    console.log(`[TTSService] Active provider set to: ${name}`);
  }

  getActiveProvider(): ITTSProvider | null {
    return this.activeProvider;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isReady(): boolean {
    return this.activeProvider?.isReady() ?? false;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  setReadPrompts(read: boolean): void {
    this._readPrompts = read;
  }

  shouldReadPrompts(): boolean {
    return this._readPrompts;
  }

  setLanguage(lang: string | null): void {
    this._language = lang;
  }

  getLanguage(): string | null {
    return this._language;
  }

  setSpeakerVoice(speaker: string, config: TTSVoiceConfig): void {
    this.speakerVoices.set(speaker, config);
  }

  /**
   * The speaker's voice. Voices are kept under the speaker's name in the
   * story's own language; in a translation the name is translated too
   * ("The Captain" → "Der Kapitän"), so the translated name is looked up
   * through `setSpeakerAliases`.
   */
  getSpeakerVoice(speaker: string): TTSVoiceConfig | undefined {
    return this.speakerVoices.get(speaker) ?? this.speakerVoices.get(this.speakerAliases.get(speaker) ?? '');
  }

  /** Translated speaker name → the name its voice is kept under. Replaces the previous set. */
  setSpeakerAliases(aliases: Record<string, string> | null | undefined): void {
    this.speakerAliases = new Map(Object.entries(aliases ?? {}));
  }

  setDefaultVoiceConfig(config: TTSVoiceConfig): void {
    this.defaultVoiceConfig = config;
  }

  /**
   * Get the provider ready for the story's voices: the default voice and
   * every speaker's, `first` ahead of them. Call it when a story starts and
   * when its voices are known. A no-op for providers with nothing to prepare.
   */
  warmUp(first?: string): void {
    if (!this._enabled || !this.activeProvider?.isReady() || !this.activeProvider.warmUp) return;
    const voices = [first, this.defaultVoiceConfig.voiceId, ...Array.from(this.speakerVoices.values()).map((v) => v.voiceId)];
    this.activeProvider.warmUp(voices.filter((id, i) => i > 0 || id !== undefined));
  }

  isSpeaking(): boolean {
    // Also between the parts of a line read in several (paragraphs, narration
    // and quoted speech): the microphone waits for the whole line.
    return this._isSpeaking || this._inSequence;
  }

  // ---------------------------------------------------------------------------
  // High-level API
  // ---------------------------------------------------------------------------

  /**
   * Speak text, optionally using a speaker-specific voice.
   */
  async speak(text: string, speaker?: string): Promise<void> {
    this._sequence++; // a new line cancels a running segment sequence
    this._inSequence = false;
    return this.speakOne(text, speaker);
  }

  /**
   * Speak a line as consecutive voices — narration by the Narrator, quoted
   * speech by the character (see the renderer's voice segments). Each
   * piece waits for the previous; a new speak()/stop() cancels the rest.
   * Web Speech plays without telling us when it ends, so there the line
   * is read whole in the speaker's voice instead.
   */
  async speakSegments(segments: Array<{ text: string; speaker?: string }>, wholeText: string, speaker?: string): Promise<void> {
    const seq = ++this._sequence;
    if (this.activeProvider?.name === 'Web Speech') return this.speakOne(wholeText, speaker);
    this._inSequence = true;
    try {
      for (const seg of segments) {
        if (this._sequence !== seq) return;
        await this.speakOne(seg.text, seg.speaker);
      }
    } finally {
      if (this._sequence === seq) this._inSequence = false;
    }
  }

  private async speakOne(text: string, speaker?: string): Promise<void> {
    if (!this._enabled || !this.activeProvider?.isReady()) {
      console.log(`[TTSService] speak() skipped: enabled=${this._enabled}, providerReady=${this.activeProvider?.isReady()}, provider=${this.activeProvider?.name || 'none'}`);
      return;
    }
    console.log(`[TTSService] speak(): "${text.substring(0, 60)}..." speaker=${speaker || 'none'}`);

    // Stop any in-progress speech (not the sequence this line belongs to)
    this.halt();

    // Build voice config: speaker-specific → default → empty
    let voiceConfig: TTSVoiceConfig = { ...this.defaultVoiceConfig };
    if (speaker) {
      const speakerConfig = this.getSpeakerVoice(speaker);
      if (speakerConfig) {
        voiceConfig = { ...voiceConfig, ...speakerConfig };
      }
    }

    // Override language if globally set
    if (this._language) {
      voiceConfig.lang = this._language;
    }

    // Capture generation so old speak() calls don't clobber _isSpeaking.
    // Race: new speak() → stop() → old finally runs → sets _isSpeaking=false
    // after new speak() already set it true. The generation counter prevents this.
    // The rest of the cast gets ready while this line is fetched.
    this.warmUp(voiceConfig.voiceId);

    const gen = ++this._speakGeneration;
    this._isSpeaking = true;
    console.log(`[TTSService] isSpeaking → true (gen ${gen})`);
    try {
      const result = await this.activeProvider.synthesize(text, voiceConfig);
      this.toldUnavailableFor = null; // it answers (again)
      const audioManager = getAudioManager();

      if (result.response) {
        // Streaming path — AudioManager decides MediaSource vs blob fallback
        await audioManager.playStreamingAudio(result.response, voiceConfig.volume ?? 1.0);
      } else if (result.audio) {
        // Blob path — must wait for playback to finish so isSpeaking() stays true
        await this.playSpeechBlob(result.audio, voiceConfig.volume ?? 1.0);
      } else if (result.played) {
        // The provider played the line while it arrived, to its end.
      } else {
        // WebSpeech or similar — no audio object returned, provider plays directly.
        // We don't know when it finishes, but the provider should handle its own state.
        console.log('[TTSService] No audio/response returned — provider plays directly');
      }
    } catch (error) {
      // AbortError is expected when a new speak() cancels the previous one via stop()
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Silently ignore — this is normal during speech transitions
      } else if (error instanceof Error && error.name === 'TTSUnavailableError' && this._speakGeneration === gen) {
        // The provider can't read this line (a language it doesn't have, a
        // model that was switched off): the browser's voice reads it, in
        // the line's language and without the provider's voice id.
        console.warn(`[TTSService] ${error.message}; reading with the browser's voice`);
        // A server that is off or failing: say so, once per setup, or the
        // author only hears a different voice and wonders.
        if ((error as TTSUnavailableError).unexpected && this.toldUnavailableFor !== this.activeProvider) {
          this.toldUnavailableFor = this.activeProvider;
          notify.warning(`${error.message}. Lines are read with the browser's voice until it answers again.`);
        }
        await this.speakWithBrowserVoice(text, voiceConfig);
      } else {
        console.error('[TTSService] Speech failed:', error);
      }
    } finally {
      // Only clear if no newer speak() has started
      if (this._speakGeneration === gen) {
        this._isSpeaking = false;
        console.log(`[TTSService] isSpeaking → false (gen ${gen})`);
      } else {
        console.log(`[TTSService] Skipping isSpeaking reset — stale gen ${gen}, current ${this._speakGeneration}`);
      }
    }
  }

  /**
   * Play a line that arrived as one sound file and wait for its end. Unlike
   * AudioManager's blob player this can be stopped: the next line, or
   * stop(), cuts it off instead of talking over it.
   */
  private playSpeechBlob(blob: Blob, volume: number): Promise<void> {
    const audioManager = getAudioManager();
    if (audioManager.isMuted?.()) return Promise.resolve();
    this.stopSpeechPlayback();
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const element = new Audio(url);
      element.volume = Math.max(0, Math.min(1, volume)) * (audioManager.getMasterVolume?.() ?? 1);
      const finish = () => {
        if (this.speechPlayback?.element === element) this.speechPlayback = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      this.speechPlayback = { element, finish };
      element.addEventListener('ended', finish, { once: true });
      element.addEventListener('error', finish, { once: true });
      Promise.resolve(element.play()).catch(() => {
        console.warn('[TTSService] The browser did not let the line play');
        finish();
      });
    });
  }

  private stopSpeechPlayback(): void {
    const playback = this.speechPlayback;
    if (!playback) return;
    this.speechPlayback = null;
    playback.element.pause();
    playback.finish();
  }

  private async speakWithBrowserVoice(text: string, voiceConfig: TTSVoiceConfig): Promise<void> {
    try {
      if (!this.browserVoice) {
        this.browserVoice = new WebSpeechProvider();
        this.browserVoice.configure({ provider: 'web-speech' });
      }
      if (!this.browserVoice.isReady()) return;
      await this.browserVoice.synthesize(text, { ...voiceConfig, voiceId: undefined });
    } catch (error) {
      console.error('[TTSService] Speech failed:', error);
    }
  }

  /**
   * Speak a UI prompt (only if readPrompts is enabled).
   */
  async speakPrompt(text: string, speaker?: string): Promise<void> {
    if (!this._readPrompts) return;
    return this.speak(text, speaker);
  }

  /**
   * Stop any in-progress speech.
   */
  stop(): void {
    this._sequence++; // cancel a running segment sequence
    this._inSequence = false;
    this.halt();
  }

  private halt(): void {
    this._speakGeneration++; // Invalidate any running speak() finally block
    try {
      this.stopSpeechPlayback();
      this.activeProvider?.stop();
      this.browserVoice?.stop();
    } catch {
      // AbortError is expected when cancelling in-progress synthesis
    }
    this._isSpeaking = false;
  }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: TTSService | null = null;

export function getTTSService(): TTSService {
  if (!serviceInstance) {
    serviceInstance = new TTSService();
  }
  return serviceInstance;
}

export function resetTTSService(): void {
  serviceInstance?.stop();
  serviceInstance = null;
}
