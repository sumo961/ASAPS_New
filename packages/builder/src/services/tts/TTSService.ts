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
    if (!this._enabled || !this.activeProvider?.isReady()) return;

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

    this._isSpeaking = true;
    try {
      const result = await this.activeProvider.synthesize(text, voiceConfig);

      // Cloud providers return an audio blob — play it through AudioManager
      if (result.audio) {
        const audioManager = getAudioManager();
        await audioManager.playSoundFromBlob(result.audio, voiceConfig.volume ?? 1.0);
      }
    } catch (error) {
      console.error('[TTSService] Speech failed:', error);
    } finally {
      this._isSpeaking = false;
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
