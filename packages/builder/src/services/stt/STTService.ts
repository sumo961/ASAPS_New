/**
 * STT Service
 *
 * Singleton coordinator for speech-to-text operations.
 * Mirrors TTSService architecture: provider registry, active provider, state management.
 */

import type { ISTTProvider, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';

export class STTService {
  private providers: Map<string, ISTTProvider> = new Map();
  private activeProviderName: string | null = null;
  private enabled: boolean = true;
  private language: string | null = null;

  registerProvider(provider: ISTTProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[STTService] Registered provider: ${provider.name}`);
  }

  setProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`STT provider "${name}" is not registered`);
    }
    this.activeProviderName = name;
    console.log(`[STTService] Active provider set to: ${name}`);
  }

  getActiveProvider(): ISTTProvider | null {
    if (!this.activeProviderName) return null;
    return this.providers.get(this.activeProviderName) || null;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isReady(): boolean {
    const provider = this.getActiveProvider();
    return provider !== null && provider.isReady();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopListening();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setLanguage(lang: string): void {
    this.language = lang;
  }

  getLanguage(): string | null {
    return this.language;
  }

  isListening(): boolean {
    const provider = this.getActiveProvider();
    return provider?.isListening() ?? false;
  }

  startListening(options: STTListeningOptions): void {
    if (!this.enabled) return;

    const provider = this.getActiveProvider();
    if (!provider || !provider.isReady()) {
      options.onError(new Error('STT provider not configured'));
      return;
    }

    // Inject service language if not specified in options
    const lang = options.language || this.language || undefined;
    provider.startListening({ ...options, language: lang });
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    const provider = this.getActiveProvider();
    if (!provider || !provider.isListening()) return null;
    return provider.stopListening();
  }

  async transcribe(audio: Blob, language?: string): Promise<STTTranscriptionResult> {
    const provider = this.getActiveProvider();
    if (!provider || !provider.isReady()) {
      throw new Error('STT provider not configured');
    }
    return provider.transcribe(audio, language || this.language || undefined);
  }
}

// Singleton
let sttServiceInstance: STTService | null = null;

export function getSTTService(): STTService {
  if (!sttServiceInstance) {
    sttServiceInstance = new STTService();
  }
  return sttServiceInstance;
}

export function resetSTTService(): void {
  sttServiceInstance = null;
}
