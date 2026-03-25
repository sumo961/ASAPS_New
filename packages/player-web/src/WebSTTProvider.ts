/**
 * WebSTTProvider - Lightweight STT for HTML export player
 *
 * Uses browser's SpeechRecognition API for real-time voice input.
 * Mirrors WebTTSProvider pattern: reads config from window.ASAPS_CONFIG.
 */

export interface STTConfig {
  provider: 'web-speech' | 'whisper' | 'local';
  apiKey?: string;
  baseUrl?: string;
  language?: string;
}

// Browser SpeechRecognition types
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getEmbeddedSTTConfig(): STTConfig | null {
  try {
    return (window as any).ASAPS_CONFIG?.sttConfig || null;
  } catch {
    return null;
  }
}

export class WebSTTService {
  private config: STTConfig | null = null;
  private enabled = true;
  private recognition: SpeechRecognitionInstance | null = null;
  private _isListening = false;
  private language = 'en-US';

  constructor() {
    this.config = getEmbeddedSTTConfig();
    if (!this.config) {
      // Default to web-speech if SpeechRecognition is available
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.config = { provider: 'web-speech' };
      }
    }
    if (this.config) {
      console.log(`[WebSTT] Initialized with provider: ${this.config.provider}`);
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  isEnabled(): boolean {
    return this.enabled && this.isConfigured();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setLanguage(lang: string): void {
    this.language = lang;
  }

  isListening(): boolean {
    return this._isListening;
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
    this._isListening = false;
  }

  /**
   * Start listening for speech. Returns a promise that resolves with the final transcript.
   */
  listen(): Promise<string> {
    if (!this.isEnabled()) return Promise.resolve('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return Promise.resolve('');

    return new Promise<string>((resolve) => {
      this.stop();

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.language;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        const result = event.results[0];
        if (result?.isFinal) {
          resolve(result[0].transcript);
        }
      };

      this.recognition.onerror = () => {
        this._isListening = false;
        resolve('');
      };

      this.recognition.onend = () => {
        this._isListening = false;
      };

      this._isListening = true;
      this.recognition.start();
    });
  }

  /**
   * Start streaming recognition with callbacks for interim/final results.
   */
  startStreaming(options: {
    onResult: (text: string, isFinal: boolean) => void;
    onEnd: () => void;
  }): void {
    if (!this.isEnabled()) { options.onEnd(); return; }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { options.onEnd(); return; }

    this.stop();

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.language;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        options.onResult(result[0].transcript, result.isFinal);
      }
    };

    this.recognition.onerror = () => {
      this._isListening = false;
    };

    this.recognition.onend = () => {
      this._isListening = false;
      options.onEnd();
    };

    this._isListening = true;
    this.recognition.start();
  }
}
