/**
 * Base STT Provider
 *
 * Abstract base class that all STT providers must extend.
 * Mirrors BaseTTSProvider for consistency.
 */

import type {
  ISTTProvider,
  STTProviderConfig,
  STTListeningOptions,
  STTTranscriptionResult,
} from '../../types/stt';

export abstract class BaseSTTProvider implements ISTTProvider {
  protected config: STTProviderConfig | null = null;
  protected _isReady: boolean = false;

  abstract readonly name: string;
  abstract readonly requiresApiKey: boolean;
  abstract readonly supportsStreaming: boolean;

  configure(config: STTProviderConfig): void {
    this.config = config;
    this._isReady = this.validateConfig(config);

    if (this._isReady) {
      console.log(`[${this.name}] STT provider configured successfully`);
    } else {
      console.warn(`[${this.name}] STT provider configuration incomplete`);
    }
  }

  isReady(): boolean {
    return this._isReady;
  }

  protected validateConfig(config: STTProviderConfig): boolean {
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
      throw new Error(`${this.name} STT provider is not configured. Call configure() first.`);
    }
  }

  abstract startListening(options: STTListeningOptions): void;
  abstract stopListening(): Promise<STTTranscriptionResult | null>;
  abstract transcribe(audio: Blob, language?: string): Promise<STTTranscriptionResult>;
  abstract isListening(): boolean;
}
