/**
 * WhisperCpp STT Provider
 *
 * Speech-to-text via local whisper.cpp server with VAD (Voice Activity Detection).
 * Fully offline — runs locally with no internet required.
 *
 * Server: whisper-server -m ~/.cache/whisper-cpp/ggml-small.bin --port 8178 --convert
 *
 * The --convert flag lets us send webm/ogg audio (ffmpeg converts to WAV on server).
 *
 * Approach: VAD-gated recording
 * 1. Poll audio level cheaply until speech is detected (level > threshold)
 * 2. Start recording
 * 3. Keep recording while speech continues
 * 4. Stop recording after 2s of silence — send full utterance to Whisper
 * 5. This gives Whisper the entire utterance as context → much better accuracy
 *
 * TTS-aware: pauses recording entirely while TTS is playing.
 */

import type { STTProviderConfig, STTListeningOptions, STTTranscriptionResult } from '../../types/stt';
import { BaseSTTProvider } from './BaseSTTProvider';

/** Minimal interface for the TTS service — just need isSpeaking() */
interface TTSServiceLike {
  isSpeaking(): boolean;
}

export class WhisperCppSTTProvider extends BaseSTTProvider {
  readonly name = 'Whisper.cpp STT';
  readonly requiresApiKey = false;
  readonly supportsStreaming = true;

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private _isListening = false;
  private currentOptions: STTListeningOptions | null = null;
  private chunkInterval: ReturnType<typeof setInterval> | null = null;
  private accumulatedText = '';
  private silenceCount = 0;
  private inferenceEndpoint = '/inference';
  /** Context prompt to improve recognition (scenario keywords, NPC names, etc.) */
  private contextPrompt = '';
  /** Persistent mic stream — kept alive across sessions to avoid re-requesting getUserMedia */
  private persistentStream: MediaStream | null = null;
  /** Session counter — incremented each time startListening is called, used to detect stale sessions */
  private sessionId = 0;
  /** AbortController for in-flight transcription requests */
  private transcribeAbort: AbortController | null = null;
  /** Optional TTS service reference — used to pause STT while TTS is playing */
  private ttsService: TTSServiceLike | null = null;

  // VAD tuning constants
  /** Audio level threshold for speech detection (0-255 scale, typical speech is 8-50) */
  private static readonly SPEECH_THRESHOLD = 6;
  /** How long silence must last after speech to stop recording (ms) */
  private static readonly SILENCE_TIMEOUT_MS = 2000;
  /** Audio level polling interval (ms) */
  private static readonly POLL_INTERVAL_MS = 50;
  /** Maximum recording duration to prevent runaway recordings (ms) */
  private static readonly MAX_RECORDING_MS = 30000;

  protected validateConfig(config: STTProviderConfig): boolean {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      console.error(`[${this.name}] baseUrl is required (e.g., http://localhost:8178)`);
      return false;
    }
    return true;
  }

  isListening(): boolean {
    return this._isListening;
  }

  /** Set the TTS service so the provider can pause during playback */
  setTTSService(ttsService: TTSServiceLike | null): void {
    this.ttsService = ttsService;
  }

  /** Check if TTS is currently speaking */
  private isTTSSpeaking(): boolean {
    return this.ttsService?.isSpeaking() ?? false;
  }

  async startListening(options: STTListeningOptions): Promise<void> {
    this.ensureReady();

    // Stop any previous session but keep the mic stream alive
    if (this._isListening) {
      this._isListening = false;
      this.transcribeAbort?.abort();
      this.transcribeAbort = null;
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch { /* ignore */ }
      }
      this.mediaRecorder = null;
    }

    this.currentOptions = options;
    this.accumulatedText = '';
    this.silenceCount = 0;
    this.sessionId++;
    const currentSession = this.sessionId;

    const baseUrl = this.config!.baseUrl!.replace(/\/$/, '');

    try {
      // Reuse persistent mic stream or get a new one
      if (!this.persistentStream || this.persistentStream.getTracks().some(t => t.readyState === 'ended')) {
        this.persistentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        console.log(`[${this.name}] New mic stream acquired`);
      } else {
        console.log(`[${this.name}] Reusing existing mic stream`);
      }
      this.mediaStream = this.persistentStream;
      this._isListening = true;

      // Set up audio analyser for level monitoring
      let audioAnalyser: AnalyserNode | null = null;
      let audioData: Uint8Array<ArrayBuffer> | null = null;
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(this.mediaStream!);
        audioAnalyser = ctx.createAnalyser();
        audioAnalyser.fftSize = 256;
        source.connect(audioAnalyser);
        audioData = new Uint8Array(audioAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      } catch { /* ignore */ }

      const getAudioLevel = (): number => {
        if (!audioAnalyser || !audioData) return 0;
        audioAnalyser.getByteFrequencyData(audioData);
        return audioData.reduce((a, b) => a + b, 0) / audioData.length;
      };

      console.log(`[${this.name}] Session ${currentSession} started (VAD mode)`);

      const isSessionActive = (): boolean =>
        !!(this._isListening && this.mediaStream && this.sessionId === currentSession);

      const vadLoop = async () => {
        while (isSessionActive()) {
          try {
            // Phase 1: Wait for speech (or TTS to finish)
            await this.waitForSpeech(getAudioLevel, isSessionActive);
            if (!isSessionActive()) break;

            // Phase 2: Record until silence
            const audioBlob = await this.recordUntilSilence(getAudioLevel, isSessionActive);
            if (!audioBlob || !isSessionActive()) continue;

            console.log(`[${this.name}] Utterance recorded: ${(audioBlob.size / 1024).toFixed(1)}KB`);

            // Phase 3: Transcribe the full utterance
            const abortCtrl = new AbortController();
            this.transcribeAbort = abortCtrl;
            let text: string;
            try {
              text = await this.transcribeChunk(baseUrl, audioBlob, undefined, abortCtrl.signal);
            } catch (err) {
              if (abortCtrl.signal.aborted) break;
              throw err;
            }
            this.transcribeAbort = null;
            if (!isSessionActive()) break;

            console.log(`[${this.name}] Transcription: "${text}" (accumulated: "${this.accumulatedText}")`);

            if (text.trim()) {
              this.silenceCount = 0;
              this.accumulatedText = this.accumulatedText
                ? this.accumulatedText + ' ' + text.trim()
                : text.trim();
              // Emit as interim — user might continue speaking
              options.onResult({
                text: this.accumulatedText,
                isFinal: false,
              });
            } else {
              // Whisper returned empty for an utterance with speech — unusual but possible
              this.silenceCount++;
            }
          } catch (err) {
            if (isSessionActive()) {
              console.warn(`[${this.name}] VAD loop error:`, err);
            }
          }
        }
      };

      // Also run a silence auto-submit watcher alongside the VAD loop.
      // When the user stops speaking entirely (no new utterances for a while),
      // auto-submit whatever has accumulated.
      const silenceWatcher = async () => {
        while (isSessionActive()) {
          await this.sleep(1000);
          if (!isSessionActive()) break;

          // If we have accumulated text AND audio has been quiet for the poll,
          // check if we should auto-submit
          if (this.accumulatedText.trim()) {
            const level = getAudioLevel();
            if (level < WhisperCppSTTProvider.SPEECH_THRESHOLD && !this.isTTSSpeaking()) {
              this.silenceCount++;
              if (this.silenceCount >= 2) { // ~2s of post-utterance silence
                console.log(`[${this.name}] Auto-submitting: "${this.accumulatedText}"`);
                options.onResult({
                  text: this.accumulatedText.trim(),
                  isFinal: true,
                });
                this.accumulatedText = '';
                this.silenceCount = 0;
              }
            } else {
              this.silenceCount = 0;
            }
          }
        }
      };

      vadLoop();
      silenceWatcher();

    } catch (err) {
      this.cleanup();
      options.onError(err instanceof Error ? err : new Error('Failed to start Whisper.cpp STT'));
      options.onEnd();
    }
  }

  /**
   * Wait until speech is detected (audio level above threshold).
   * Also waits for TTS to finish before listening.
   */
  private async waitForSpeech(
    getAudioLevel: () => number,
    isActive: () => boolean,
  ): Promise<void> {
    while (isActive()) {
      // Wait for TTS to finish
      if (this.isTTSSpeaking()) {
        await this.sleep(200);
        continue;
      }

      const level = getAudioLevel();
      if (level >= WhisperCppSTTProvider.SPEECH_THRESHOLD) {
        return; // Speech detected!
      }

      await this.sleep(WhisperCppSTTProvider.POLL_INTERVAL_MS);
    }
  }

  /**
   * Record audio until silence is detected (2s below threshold).
   * Returns the recorded audio blob, or null if recording was interrupted.
   */
  private async recordUntilSilence(
    getAudioLevel: () => number,
    isActive: () => boolean,
  ): Promise<Blob | null> {
    if (!this.mediaStream || !this._isListening) return null;

    // If TTS starts right as we're about to record, bail
    if (this.isTTSSpeaking()) return null;

    const chunks: Blob[] = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    return new Promise<Blob | null>((resolve) => {
      if (!this.mediaStream) { resolve(null); return; }

      const recorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (chunks.length === 0) {
          resolve(null);
        } else {
          resolve(new Blob(chunks, { type: mimeType }));
        }
      };

      recorder.onerror = () => {
        resolve(null);
      };

      // Request data frequently so we get chunks even if we stop early
      recorder.start(500);

      const startTime = Date.now();
      let lastSpeechTime = Date.now();

      const monitor = setInterval(() => {
        // Session ended or TTS started — stop recording
        if (!isActive() || this.isTTSSpeaking()) {
          clearInterval(monitor);
          if (recorder.state === 'recording') {
            // If TTS interrupted us, discard the recording
            if (this.isTTSSpeaking()) {
              console.log(`[${this.name}] TTS started — discarding partial recording`);
              chunks.length = 0;
            }
            recorder.stop();
          }
          return;
        }

        const level = getAudioLevel();
        const now = Date.now();

        if (level >= WhisperCppSTTProvider.SPEECH_THRESHOLD) {
          lastSpeechTime = now;
        }

        const silenceDuration = now - lastSpeechTime;
        const totalDuration = now - startTime;

        // Stop if silence timeout reached or max duration exceeded
        if (silenceDuration >= WhisperCppSTTProvider.SILENCE_TIMEOUT_MS ||
            totalDuration >= WhisperCppSTTProvider.MAX_RECORDING_MS) {
          clearInterval(monitor);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, WhisperCppSTTProvider.POLL_INTERVAL_MS);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    if (!this._isListening) return null;

    const finalText = this.accumulatedText.trim();
    console.log(`[${this.name}] stopListening called, finalText: "${finalText}"`);

    // Emit final result if we have accumulated text
    if (finalText && this.currentOptions) {
      this.currentOptions.onResult({
        text: finalText,
        isFinal: true,
      });
    }

    this.cleanup();

    return finalText ? { text: finalText, isFinal: true } : null;
  }

  async transcribe(audio: Blob, language?: string): Promise<STTTranscriptionResult> {
    this.ensureReady();
    const baseUrl = this.config!.baseUrl!.replace(/\/$/, '');
    const text = await this.transcribeChunk(baseUrl, audio, language);
    return { text, isFinal: true };
  }

  /**
   * Whisper hallucination patterns — returned for silence/noise, not real speech.
   */
  private static readonly NOISE_PATTERNS = new RegExp(
    '^\\s*(' +
    '\\[.*?\\]' +                    // [music], [silence], [BLANK_AUDIO]
    '|\\(.*?\\)' +                   // (music), (inaudible)
    '|\\.{1,}' +                     // . or ...
    '|,+' +                          // ,,,
    '|—|-' +                         // dashes
    '|\\*.*?\\*' +                   // *music*
    '|thank you\\.?' +               // common hallucination
    '|thanks for watching\\.?' +
    '|you$' +
    '|bye\\.?' +
    '|uh+\\.?' +
    '|um+\\.?' +
    '|hmm+\\.?' +
    '|huh\\.?' +
    ')\\s*$',
    'i'
  );

  /** Detect repetitive hallucinations (same phrase repeated 3+ times) */
  private static readonly REPETITION_PATTERN = /(.{3,}?)\1{2,}/;

  private cleanTranscription(text: string): string {
    if (!text) return '';
    let cleaned = text.trim();

    if (WhisperCppSTTProvider.NOISE_PATTERNS.test(cleaned)) {
      console.log(`[${this.name}] Filtered noise: "${cleaned}"`);
      return '';
    }

    if (WhisperCppSTTProvider.REPETITION_PATTERN.test(cleaned)) {
      console.log(`[${this.name}] Filtered repetition: "${cleaned}"`);
      return '';
    }

    return cleaned;
  }

  /**
   * Set context prompt to improve recognition accuracy.
   */
  setContextPrompt(prompt: string): void {
    this.contextPrompt = prompt;
  }

  private async transcribeChunk(
    baseUrl: string,
    audio: Blob,
    language?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', audio, 'audio.webm');
    if (language) {
      formData.append('language', language.split('-')[0].toLowerCase());
    }
    formData.append('response_format', 'json');
    formData.append('temperature', '0');
    if (this.contextPrompt) {
      formData.append('prompt', this.contextPrompt);
    }

    const endpoint = `${baseUrl}${this.inferenceEndpoint}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper.cpp error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const raw = data.text || '';
    const cleaned = this.cleanTranscription(raw);
    if (raw && raw.trim() !== cleaned) {
      console.log(`[${this.name}] Raw: "${raw.trim()}" → Cleaned: "${cleaned}"`);
    }
    return cleaned;
  }

  private cleanup(): void {
    console.log(`[${this.name}] Cleanup (session ${this.sessionId})`);
    this._isListening = false;

    // Abort any in-flight transcription
    if (this.transcribeAbort) {
      this.transcribeAbort.abort();
      this.transcribeAbort = null;
    }

    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    this.mediaRecorder = null;

    // Don't kill the persistent stream — reused across sessions
    this.mediaStream = null;

    const opts = this.currentOptions;
    this.currentOptions = null;
    this.accumulatedText = '';
    this.silenceCount = 0;

    opts?.onEnd();
  }
}
