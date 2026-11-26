/**
 * WebSTTProvider - Lightweight STT for HTML export player
 *
 * Uses browser's SpeechRecognition API for real-time voice input.
 * Mirrors WebTTSProvider pattern: reads config from window.ASAPS_CONFIG.
 *
 * A story exported with "OpenAI transcription, through the relay"
 * (config.relayUrl) records the answer in the browser instead: the
 * microphone is clicked to start and again to stop, the recording goes to
 * the story's relay (relayKit.ts, target "transcribe"), which holds the key,
 * and the text comes back. Where the relay refuses (one deployed before it
 * knew this, no key on the host) or the browser can't record, the browser's
 * own recognition takes over.
 */

import { speechLanguageCode, watchSpeech, canWatchSpeech } from '@asaps/core';

export interface STTConfig {
  provider: 'web-speech' | 'whisper' | 'local' | 'openai';
  apiKey?: string;
  baseUrl?: string;
  language?: string;
  /** The story's relay: it holds the key and has the recording transcribed (provider 'openai'). */
  relayUrl?: string;
  model?: string;
}

interface ListeningOptions {
  language?: string;
  onResult: (result: { text: string; isFinal: boolean }) => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}

const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
const browserListens = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** What the browser can record that OpenAI takes (Safari records mp4, the others webm). */
function recordingType(): string | undefined {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return undefined;
}

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error ?? new Error('The recording could not be read'));
  reader.readAsDataURL(blob);
});

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
  private recorder: MediaRecorder | null = null;

  constructor() {
    this.config = getEmbeddedSTTConfig();
    // Through the relay, but this browser can't record: it listens by itself, where it can.
    if (this.config?.relayUrl && !canRecord()) this.config = null;
    if (!this.config) {
      // Default to web-speech if SpeechRecognition is available
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.config = { provider: 'web-speech' };
      }
    }
    // A story exported with voice input off (the app's STT switch at export
    // time): the microphone stays away.
    try { if ((window as any).ASAPS_CONFIG?.sttEnabled === false) this.enabled = false; } catch { /* as configured */ }
    if (this.config) {
      console.log(`[WebSTT] Initialized with provider: ${this.config.provider}, enabled: ${this.enabled}`);
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

  getLanguage(): string {
    return this.language;
  }

  isListening(): boolean {
    return this._isListening;
  }

  /**
   * The renderer's conversation input calls this on every submit, as it does
   * on the builder's service. Without it a spoken or typed answer threw
   * before it was handed on, and the conversation stopped.
   */
  stopListening(): void {
    // A recording ends here and is sent off; its text comes through the callbacks.
    if (this.recorder && this.recorder.state !== 'inactive') { this.recorder.stop(); return; }
    this.stop();
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
    if (this.recorder) {
      const recorder = this.recorder;
      this.recorder = null; // dropped: what it recorded is not sent
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
    this._isListening = false;
  }

  /** Records and has the relay transcribe (see the top of this file). */
  private viaRelay(): boolean {
    return !!this.config?.relayUrl && this.config.provider === 'openai';
  }

  /**
   * For the renderer's conversation input: a recogniser that takes the whole
   * answer at once, like the builder's OpenAI and Whisper providers. Nothing
   * for the browser's own recognition, which the input drives itself.
   */
  getActiveProvider(): { name: string; supportsStreaming: boolean; detectsSpeechEnd: boolean } | undefined {
    return this.viaRelay() ? { name: 'OpenAI transcription (relay)', supportsStreaming: false, detectsSpeechEnd: canWatchSpeech() } : undefined;
  }

  /** Start recording an answer; `stopListening()` ends it and the text arrives in `onResult`. */
  startListening(options: ListeningOptions): void {
    if (!this.isEnabled() || !this.viaRelay()) { options.onEnd(); return; }
    this.stop();
    const relayUrl = this.config!.relayUrl!;
    const model = this.config!.model;
    const language = speechLanguageCode(options.language || this.language) || undefined;
    this._isListening = true;
    void (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        this._isListening = false;
        options.onError(err instanceof Error ? err : new Error('The microphone could not be used'));
        options.onEnd();
        return;
      }
      const type = recordingType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      this.recorder = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      // The recording ends by itself when the speaker has finished; it is dropped when nobody spoke.
      let nobodySpoke = false;
      const stopWatching = watchSpeech(stream, {
        onSpeechEnd: () => { if (recorder.state !== 'inactive') recorder.stop(); },
        onNoSpeech: () => { nobodySpoke = true; if (recorder.state !== 'inactive') recorder.stop(); },
      });
      recorder.onerror = () => { stopWatching(); stream.getTracks().forEach((t) => t.stop()); this._isListening = false; this.recorder = null; options.onError(new Error('Recording failed')); options.onEnd(); };
      recorder.onstop = async () => {
        stopWatching();
        stream.getTracks().forEach((t) => t.stop());
        this._isListening = false;
        // Dropped by stop() (the screen moved on): nothing is sent.
        const dropped = this.recorder !== recorder;
        if (!dropped) this.recorder = null;
        if (dropped || nobodySpoke || chunks.length === 0) { options.onEnd(); return; }
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
          const answer = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'openai', target: 'transcribe', audio: await toBase64(blob), mime: blob.type, model, language }),
          });
          if (!answer.ok) throw new Error(`The relay refused the recording (${answer.status})`);
          const text = String((await answer.json()).text ?? '').trim();
          if (text) options.onResult({ text, isFinal: true });
        } catch (err: any) {
          this.relayFailed(err);
          options.onError(err instanceof Error ? err : new Error(String(err)));
        }
        options.onEnd();
      };
      recorder.start();
    })();
  }

  /** The relay can't transcribe (deployed before it knew how, no key on the host): the browser listens from now on, where it can. */
  private relayFailed(err: unknown): void {
    console.warn('[WebSTT] Voice input through the relay failed; using the browser\'s own recognition from here:', (err as any)?.message || err);
    this.config = browserListens() ? { provider: 'web-speech' } : null;
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
