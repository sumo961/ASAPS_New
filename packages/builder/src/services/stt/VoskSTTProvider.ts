/**
 * Vosk STT Provider
 *
 * Streaming speech-to-text via Vosk WebSocket server.
 * Fully offline — runs locally with no internet required.
 *
 * Server: docker run -p 2700:2700 alphacep/kaldi-en
 * Protocol: WebSocket, send raw PCM audio frames, receive JSON:
 *   { "partial": "interim text" }  — interim result
 *   { "text": "final text" }       — endpoint detected (silence)
 */

import type { STTProviderConfig, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { BaseSTTProvider } from './BaseSTTProvider';

export class VoskSTTProvider extends BaseSTTProvider {
  readonly name = 'Vosk STT';
  readonly requiresApiKey = false;
  readonly supportsStreaming = true;

  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private _isListening = false;
  private currentOptions: STTListeningOptions | null = null;
  private lastFinalText: string = '';

  protected validateConfig(config: STTProviderConfig): boolean {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      console.error(`[${this.name}] baseUrl is required (e.g., ws://localhost:2700)`);
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
      await this.stopListening();
    }

    this.currentOptions = options;
    this.lastFinalText = '';

    // Normalize WebSocket URL
    let wsUrl = this.config!.baseUrl!.replace(/\/$/, '');
    if (wsUrl.startsWith('http://')) {
      wsUrl = 'ws://' + wsUrl.slice(7);
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = 'wss://' + wsUrl.slice(8);
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = 'ws://' + wsUrl;
    }

    try {
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Connect WebSocket to Vosk server
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[${this.name}] WebSocket connected to ${wsUrl}`);
        this._isListening = true;

        // Set up audio processing
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.mediaStream!);

        // Use ScriptProcessor to get raw PCM data
        // Buffer size 4096 at 16kHz = ~256ms chunks
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processor.onaudioprocess = (e) => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);
          // Convert Float32 to Int16 PCM (what Vosk expects)
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.ws!.send(pcm16.buffer);
        };

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.partial !== undefined && data.partial !== '') {
            // Interim result
            options.onResult({
              text: data.partial,
              isFinal: false,
            });
          } else if (data.text !== undefined && data.text !== '') {
            // Final result — Vosk detected endpoint (silence)
            this.lastFinalText = data.text;
            options.onResult({
              text: data.text,
              isFinal: true,
            });
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onerror = (event) => {
        console.error(`[${this.name}] WebSocket error:`, event);
        options.onError(new Error('Vosk WebSocket connection error'));
        this.cleanup();
      };

      this.ws.onclose = () => {
        console.log(`[${this.name}] WebSocket closed`);
        this._isListening = false;
        options.onEnd();
      };
    } catch (err) {
      this.cleanup();
      options.onError(err instanceof Error ? err : new Error('Failed to start Vosk streaming'));
      options.onEnd();
    }
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    if (!this._isListening) return null;

    // Send EOF to Vosk to flush any remaining audio
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send('{"eof" : 1}');
      // Wait briefly for final result
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const result = this.lastFinalText
      ? { text: this.lastFinalText, isFinal: true }
      : null;

    this.cleanup();
    return result;
  }

  async transcribe(audio: Blob, _language?: string): Promise<STTTranscriptionResult> {
    this.ensureReady();

    // For batch transcription, send entire audio file over WebSocket
    let wsUrl = this.config!.baseUrl!.replace(/\/$/, '');
    if (wsUrl.startsWith('http://')) wsUrl = 'ws://' + wsUrl.slice(7);
    else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) wsUrl = 'ws://' + wsUrl;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let resultText = '';

      ws.onopen = async () => {
        const arrayBuffer = await audio.arrayBuffer();
        ws.send(arrayBuffer);
        ws.send('{"eof" : 1}');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.text) resultText = data.text;
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        resolve({ text: resultText, isFinal: true });
      };

      ws.onerror = () => {
        reject(new Error('Vosk WebSocket transcription failed'));
      };
    });
  }

  private cleanup(): void {
    this._isListening = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
