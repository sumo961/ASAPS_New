/**
 * TTS (Text-to-Speech) Types
 *
 * Type definitions for the vendor-agnostic TTS provider system
 */

/**
 * Supported TTS provider types
 */
export type TTSProviderType = 'web-speech' | 'openai' | 'elevenlabs' | 'custom';

/**
 * TTS provider configuration
 */
export interface TTSProviderConfig {
  /** Provider type */
  provider: TTSProviderType;

  /** API key (not needed for web-speech) */
  apiKey?: string;

  /** Custom base URL for API-compatible providers */
  baseUrl?: string;

  /** Model identifier (e.g., 'tts-1', 'tts-1-hd') */
  model?: string;

  /** Default voice ID to use when no speaker-specific voice is set */
  defaultVoiceId?: string;
}

/**
 * Information about an available TTS voice
 */
export interface TTSVoiceInfo {
  /** Voice identifier (browser voiceURI or provider voice ID) */
  id: string;

  /** Human-readable voice name */
  name: string;

  /** BCP 47 language tag (e.g., 'en-US', 'de-DE') */
  lang: string;

  /** Voice gender if known */
  gender?: 'male' | 'female' | 'neutral';

  /** Whether this is a local (on-device) voice */
  isLocal?: boolean;
}

/**
 * Voice configuration for synthesis
 */
export interface TTSVoiceConfig {
  /** Voice identifier */
  voiceId?: string;

  /** Pitch adjustment (0.0 to 2.0, default 1.0) */
  pitch?: number;

  /** Speech rate (0.1 to 10.0, default 1.0) */
  rate?: number;

  /** Volume (0.0 to 1.0, default 1.0) */
  volume?: number;

  /** BCP 47 language tag override */
  lang?: string;
}

/**
 * Result of a speech synthesis operation
 */
export interface TTSSynthesisResult {
  /** Audio blob for cloud providers, null for Web Speech API (plays directly) */
  audio: Blob | null;

  /** Estimated duration in milliseconds */
  durationMs?: number;
}

/**
 * TTS provider interface — all providers must implement this
 */
export interface ITTSProvider {
  /** Provider display name */
  readonly name: string;

  /** Whether this provider requires an API key */
  readonly requiresApiKey: boolean;

  /** Configure the provider */
  configure(config: TTSProviderConfig): void;

  /** Check if provider is configured and ready */
  isReady(): boolean;

  /** Synthesize speech from text */
  synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult>;

  /** Stop any in-progress speech */
  stop(): void;

  /** Get available voices, optionally filtered by language prefix */
  getVoices(lang?: string): Promise<TTSVoiceInfo[]>;
}
