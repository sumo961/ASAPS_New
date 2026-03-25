/**
 * Whisper STT Provider
 *
 * Uses OpenAI's Whisper API for batch audio transcription.
 * Does not support streaming — records audio, then transcribes.
 */

import type { STTProviderConfig, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { BaseSTTProvider } from './BaseSTTProvider';

export class WhisperSTTProvider extends BaseSTTProvider {
  readonly name = 'Whisper STT';
  readonly requiresApiKey = true;
  readonly supportsStreaming = false;

  private mediaRecorder: MediaRecorder | null = null;
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
        // Stop all tracks to release microphone
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
      this.mediaRecorder.start(1000); // Collect in 1s chunks
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

    const formData = new FormData();
    formData.append('file', audio, 'audio.webm');
    formData.append('model', this.config!.model || 'whisper-1');
    if (language) {
      // Whisper API requires ISO 639-1 (e.g., 'en'), not BCP 47 (e.g., 'en-US')
      const iso639 = language.split('-')[0].toLowerCase();
      formData.append('language', iso639);
    }

    const baseUrl = (this.config!.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config!.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      text: data.text,
      isFinal: true,
      detectedLanguage: data.language,
    };
  }
}
