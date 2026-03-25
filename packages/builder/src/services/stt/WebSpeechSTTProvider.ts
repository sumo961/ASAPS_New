/**
 * Web Speech STT Provider
 *
 * Uses the browser's built-in SpeechRecognition API for real-time
 * speech-to-text with streaming partial results. No API key needed.
 */

import type { STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { BaseSTTProvider } from './BaseSTTProvider';

// Browser SpeechRecognition types (not in all TS libs)
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export class WebSpeechSTTProvider extends BaseSTTProvider {
  readonly name = 'Web Speech STT';
  readonly requiresApiKey = false;
  readonly supportsStreaming = true;

  private recognition: SpeechRecognitionInstance | null = null;
  private _isListening = false;
  private lastResult: STTTranscriptionResult | null = null;
  private currentOptions: STTListeningOptions | null = null;

  protected validateConfig(): boolean {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error(`[${this.name}] SpeechRecognition API not available in this browser`);
      return false;
    }
    return true;
  }

  isListening(): boolean {
    return this._isListening;
  }

  startListening(options: STTListeningOptions): void {
    this.ensureReady();

    // Stop any existing session
    if (this._isListening) {
      this.recognition?.abort();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      options.onError(new Error('SpeechRecognition not available'));
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = options.language || this.config?.language || 'en-US';
    this.currentOptions = options;
    this.lastResult = null;

    this.recognition.onstart = () => {
      this._isListening = true;
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
          this.lastResult = {
            text: result[0].transcript,
            isFinal: true,
            confidence: result[0].confidence,
          };
          options.onResult(this.lastResult);
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript && !finalTranscript) {
        options.onResult({
          text: interimTranscript,
          isFinal: false,
        });
      }
    };

    this.recognition.onerror = (event) => {
      // 'no-speech' and 'aborted' are expected, not real errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      options.onError(new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.onend = () => {
      this._isListening = false;
      options.onEnd();
    };

    this.recognition.start();
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    if (!this._isListening || !this.recognition) {
      return null;
    }

    return new Promise((resolve) => {
      const savedResult = this.lastResult;
      const origOnEnd = this.currentOptions?.onEnd;

      // Override onend to resolve promise
      this.recognition!.onend = () => {
        this._isListening = false;
        origOnEnd?.();
        resolve(savedResult);
      };

      this.recognition!.stop();
    });
  }

  async transcribe(_audio: Blob, _language?: string): Promise<STTTranscriptionResult> {
    throw new Error('Web Speech STT does not support batch transcription. Use startListening() instead.');
  }
}
