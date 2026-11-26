/**
 * OpenAI STT Provider (named after Whisper, its first model)
 *
 * Batch transcription through /v1/audio/transcriptions: records audio, then
 * transcribes. No streaming.
 *
 * OpenAI switches off whisper-1 (and gpt-4o-transcribe, gpt-4o-mini-transcribe)
 * on 2027-02-26; gpt-transcribe replaces them on the same endpoint. It takes
 * the language as `languages[]` (a list) where the older models take
 * `language`, and answers with `languages: [{ code }]`.
 * (developers.openai.com/api/docs/guides/speech-to-text, checked 2026-11-18)
 *
 * A custom base URL (Groq, a local server) keeps its own model names.
 */

import type { STTProviderConfig, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { speechLanguageCode, watchSpeech, canWatchSpeech } from '@asaps/core';
import { BaseSTTProvider } from './BaseSTTProvider';

/** The model for a setup that names none. */
export const OPENAI_STT_MODEL = 'gpt-transcribe';

/** The day OpenAI switches off whisper-1. */
export const OPENAI_WHISPER_SHUTDOWN = '2027-02-26';

const OPENAI_BASE = 'https://api.openai.com/v1';
const isRetired = (model: string) => /^(whisper-1|gpt-4o(-mini)?-transcribe)/.test(model);

export class WhisperSTTProvider extends BaseSTTProvider {
  readonly name = 'Whisper STT';
  readonly requiresApiKey = true;
  readonly supportsStreaming = false;

  private mediaRecorder: MediaRecorder | null = null;
  private stopWatching: () => void = () => undefined;
  private nobodySpoke = false;

  /** The microphone can be left to itself: the recording ends when the speaker has finished (core `watchSpeech`). */
  get detectsSpeechEnd(): boolean {
    return canWatchSpeech();
  }
  private audioChunks: Blob[] = [];
  private _isListening = false;
  private currentOptions: STTListeningOptions | null = null;

  protected validateConfig(config: STTProviderConfig): boolean {
    if (!config.apiKey || config.apiKey.trim() === '') {
      console.error(`[${this.name}] API key is required`);
      return false;
    }
    return true;
  }

  isListening(): boolean {
    return this._isListening;
  }

  async startListening(options: STTListeningOptions): Promise<void> {
    this.ensureReady();

    if (this._isListening) {
      this.mediaRecorder?.stop();
    }

    this.currentOptions = options;
    this.audioChunks = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this._isListening = false;
        this.stopWatching();
        // Stop all tracks to release microphone
        stream.getTracks().forEach(t => t.stop());

        // Nobody spoke: nothing is sent off to be written down.
        if (this.audioChunks.length > 0 && !this.nobodySpoke) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          try {
            const result = await this.transcribe(audioBlob, options.language);
            options.onResult(result);
          } catch (err) {
            options.onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
        options.onEnd();
      };

      this.mediaRecorder.onerror = () => {
        this._isListening = false;
        this.stopWatching();
        stream.getTracks().forEach(t => t.stop());
        options.onError(new Error('MediaRecorder error'));
        options.onEnd();
      };

      this._isListening = true;
      this.mediaRecorder.start(1000); // Collect in 1s chunks
      // The recording ends by itself when the speaker has finished, as the
      // recognisers that listen while one speaks do; it is dropped when
      // nobody spoke. (Where loudness can't be measured, a click ends it.)
      const recorder = this.mediaRecorder;
      this.nobodySpoke = false;
      this.stopWatching = watchSpeech(stream, {
        onSpeechEnd: () => { if (recorder.state !== 'inactive') recorder.stop(); },
        onNoSpeech: () => { this.nobodySpoke = true; if (recorder.state !== 'inactive') recorder.stop(); },
      });
    } catch (err) {
      options.onError(err instanceof Error ? err : new Error('Microphone access denied'));
      options.onEnd();
    }
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    if (!this._isListening || !this.mediaRecorder) {
      return null;
    }

    return new Promise((resolve) => {
      const origOnEnd = this.currentOptions?.onEnd;
      const origOnResult = this.currentOptions?.onResult;

      // Capture the result from the onstop handler
      if (this.currentOptions) {
        this.currentOptions.onResult = (result) => {
          origOnResult?.(result);
          resolve(result);
        };
        this.currentOptions.onEnd = () => {
          origOnEnd?.();
        };
      }

      this.mediaRecorder!.stop();
    });
  }

  async transcribe(audio: Blob, language?: string): Promise<STTTranscriptionResult> {
    this.ensureReady();

    const baseUrl = (this.config!.baseUrl || OPENAI_BASE).replace(/\/$/, '');
    const model = this.config!.model || OPENAI_STT_MODEL;

    let response = await this.request(baseUrl, model, audio, language);
    let errorText = response.ok ? '' : await response.text();
    // After its shutdown OpenAI refuses the older model; ask the current one.
    const gone = response.status === 404 || response.status === 410 || /model_not_found|deprecat|does not exist/i.test(errorText);
    if (!response.ok && gone && baseUrl === OPENAI_BASE && isRetired(model)) {
      console.warn(`[${this.name}] "${model}" is no longer offered; using ${OPENAI_STT_MODEL}`);
      response = await this.request(baseUrl, OPENAI_STT_MODEL, audio, language);
      errorText = response.ok ? '' : await response.text();
    }

    if (!response.ok) {
      throw new Error(`Whisper API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data.text,
      isFinal: true,
      detectedLanguage: data.language ?? data.languages?.[0]?.code,
    };
  }

  private request(baseUrl: string, model: string, audio: Blob, language?: string): Promise<Response> {
    const formData = new FormData();
    formData.append('file', audio, 'audio.webm');
    formData.append('model', model);
    // The bare code ('de'), not 'de-DE', 'zh-Hans' or a typed name.
    const code = speechLanguageCode(language);
    if (code) {
      // gpt-transcribe takes a list and refuses the single field.
      formData.append(/^gpt-transcribe/.test(model) ? 'languages[]' : 'language', code);
    }

    return fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config!.apiKey}`,
      },
      body: formData,
    });
  }
}
