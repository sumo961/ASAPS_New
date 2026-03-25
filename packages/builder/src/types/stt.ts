/**
 * STT (Speech-to-Text) Types
 *
 * Type definitions for the vendor-agnostic STT provider system.
 * Mirrors the TTS type architecture for consistency.
 */

/**
 * Supported STT provider types
 */
export type STTProviderType = 'web-speech' | 'whisper' | 'local' | 'vosk' | 'whisper-cpp';

/**
 * STT provider configuration
 */
export interface STTProviderConfig {
  /** Provider type */
  provider: STTProviderType;

  /** API key (not needed for web-speech) */
  apiKey?: string;

  /** Custom base URL for API-compatible providers */
  baseUrl?: string;

  /** Model identifier (e.g., 'whisper-1') */
  model?: string;

  /** Default language (BCP 47, e.g., 'en-US') */
  language?: string;
}

/**
 * Result of a speech transcription operation
 */
export interface STTTranscriptionResult {
  /** Transcribed text */
  text: string;

  /** Whether this is a final (vs. interim) result */
  isFinal: boolean;

  /** Confidence score (0-1) */
  confidence?: number;

  /** Detected language */
  detectedLanguage?: string;
}

/**
 * Options for starting a listening session
 */
export interface STTListeningOptions {
  /** BCP 47 language tag (e.g., 'en-US') */
  language?: string;

  /** Called with transcription results (may be interim or final) */
  onResult: (result: STTTranscriptionResult) => void;

  /** Called on error */
  onError: (error: Error) => void;

  /** Called when listening ends */
  onEnd: () => void;
}

/**
 * STT provider interface — all providers must implement this
 */
export interface ISTTProvider {
  /** Provider display name */
  readonly name: string;

  /** Whether this provider requires an API key */
  readonly requiresApiKey: boolean;

  /** Whether this provider supports real-time streaming results */
  readonly supportsStreaming: boolean;

  /** Configure the provider */
  configure(config: STTProviderConfig): void;

  /** Check if provider is configured and ready */
  isReady(): boolean;

  /** Start listening for speech (streaming mode) */
  startListening(options: STTListeningOptions): void;

  /** Stop listening and return final result */
  stopListening(): Promise<STTTranscriptionResult | null>;

  /** Transcribe an audio blob (batch mode) */
  transcribe(audio: Blob, language?: string): Promise<STTTranscriptionResult>;

  /** Whether the provider is currently listening */
  isListening(): boolean;
}
