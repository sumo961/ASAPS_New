/**
 * TTS Service
 *
 * Singleton coordinator for text-to-speech operations.
 * Mirrors AIService pattern: provider registry + high-level API.
 */

import type { ITTSProvider, TTSVoiceConfig } from '../../types/tts';
import { getAudioManager } from '@asaps/renderer';

export class TTSService {
  private providers: Map<string, ITTSProvider> = new Map();
  private activeProvider: ITTSProvider | null = null;
  private _enabled: boolean = true;
  private _readPrompts: boolean = false;
  private _isSpeaking: boolean = false;
  /** Generation counter — prevents old speak() finally blocks from clearing the flag */
  private _speakGeneration: number = 0;
  private _language: string | null = null;
  private speakerVoices: Map<string, TTSVoiceConfig> = new Map();
  private defaultVoiceConfig: TTSVoiceConfig = {};

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

  getSpeakerVoice(speaker: string): TTSVoiceConfig | undefined {
    return this.speakerVoices.get(speaker);
  }

  setDefaultVoiceConfig(config: TTSVoiceConfig): void {
    this.defaultVoiceConfig = config;
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  // ---------------------------------------------------------------------------
  // High-level API
  // ---------------------------------------------------------------------------

  /**
   * Speak text, optionally using a speaker-specific voice.
   */
  async speak(text: string, speaker?: string): Promise<void> {
    if (!this._enabled || !this.activeProvider?.isReady()) {
      console.log(`[TTSService] speak() skipped: enabled=${this._enabled}, providerReady=${this.activeProvider?.isReady()}, provider=${this.activeProvider?.name || 'none'}`);
      return;
    }
    console.log(`[TTSService] speak(): "${text.substring(0, 60)}..." speaker=${speaker || 'none'}`);

    // Stop any in-progress speech
    this.stop();

    // Build voice config: speaker-specific → default → empty
    let voiceConfig: TTSVoiceConfig = { ...this.defaultVoiceConfig };
    if (speaker) {
      const speakerConfig = this.speakerVoices.get(speaker);
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
    const gen = ++this._speakGeneration;
    this._isSpeaking = true;
    console.log(`[TTSService] isSpeaking → true (gen ${gen})`);
    try {
      const result = await this.activeProvider.synthesize(text, voiceConfig);
      const audioManager = getAudioManager();

      if (result.response) {
        // Streaming path — AudioManager decides MediaSource vs blob fallback
        await audioManager.playStreamingAudio(result.response, voiceConfig.volume ?? 1.0);
      } else if (result.audio) {
        // Blob path — must wait for playback to finish so isSpeaking() stays true
        await audioManager.playSoundFromBlobAndWait(result.audio, voiceConfig.volume ?? 1.0);
      } else {
        // WebSpeech or similar — no audio object returned, provider plays directly.
        // We don't know when it finishes, but the provider should handle its own state.
        console.log('[TTSService] No audio/response returned — provider plays directly');
      }
    } catch (error) {
      console.error('[TTSService] Speech failed:', error);
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
    this._speakGeneration++; // Invalidate any running speak() finally block
    this.activeProvider?.stop();
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
