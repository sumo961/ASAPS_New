/**
 * Base TTS Provider
 *
 * Abstract base class that all TTS providers must extend.
 * Mirrors BaseAIProvider from services/providers/IProvider.ts.
 */

import type { ITTSProvider, TTSProviderConfig, TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';

export abstract class BaseTTSProvider implements ITTSProvider {
  protected config: TTSProviderConfig | null = null;
  protected _isReady: boolean = false;

  abstract readonly name: string;
  abstract readonly requiresApiKey: boolean;

  configure(config: TTSProviderConfig): void {
    this.config = config;
    this._isReady = this.validateConfig(config);

    if (this._isReady) {
      console.log(`[${this.name}] TTS provider configured successfully`);
    } else {
      console.warn(`[${this.name}] TTS provider configuration incomplete`);
    }
  }

  isReady(): boolean {
    return this._isReady;
  }

  protected validateConfig(config: TTSProviderConfig): boolean {
    if (this.requiresApiKey && (!config.apiKey || config.apiKey.trim() === '')) {
      console.error(`[${this.name}] API key is required`);
      return false;
    }

    if (!config.provider) {
      console.error(`[${this.name}] Provider type must be specified`);
      return false;
    }

    return true;
  }

  protected ensureReady(): void {
    if (!this.isReady()) {
      throw new Error(`${this.name} TTS provider is not configured. Call configure() first.`);
    }
  }

  abstract synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult>;
  abstract stop(): void;
  abstract getVoices(lang?: string): Promise<TTSVoiceInfo[]>;
}
