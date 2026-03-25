/**
 * Local STT Provider
 *
 * Configurable endpoint for local Whisper-compatible servers
 * (faster-whisper, whisper.cpp, etc.). Uses batch transcription
 * with MediaRecorder for audio capture.
 */

import type { STTProviderConfig, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { BaseSTTProvider } from './BaseSTTProvider';

export class LocalSTTProvider extends BaseSTTProvider {
  readonly name = 'Local STT';
  readonly requiresApiKey = false;
  readonly supportsStreaming = false;

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private _isListening = false;
  private currentOptions: STTListeningOptions | null = null;

  protected validateConfig(config: STTProviderConfig): boolean {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      console.error(`[${this.name}] baseUrl is required for local STT provider`);
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
        stream.getTracks().forEach(t => t.stop());

        if (this.audioChunks.length > 0) {
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
        stream.getTracks().forEach(t => t.stop());
        options.onError(new Error('MediaRecorder error'));
        options.onEnd();
      };

      this._isListening = true;
      this.mediaRecorder.start(1000);
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

    const formData = new FormData();
    formData.append('file', audio, 'audio.webm');
    if (this.config!.model) {
      formData.append('model', this.config!.model);
    }
    if (language) {
      formData.append('language', language);
    }

    const baseUrl = this.config!.baseUrl!.replace(/\/$/, '');
    // Support both /v1/audio/transcriptions (OpenAI-compat) and bare endpoint
    const endpoint = baseUrl.includes('/v1')
      ? `${baseUrl}/audio/transcriptions`
      : `${baseUrl}/v1/audio/transcriptions`;

    const headers: Record<string, string> = {};
    if (this.config!.apiKey) {
      headers['Authorization'] = `Bearer ${this.config!.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local STT error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data.text || data.transcript || '',
      isFinal: true,
      detectedLanguage: data.language,
    };
  }
}
