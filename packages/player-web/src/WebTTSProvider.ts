/**
 * WebTTSProvider - Lightweight TTS for HTML export player
 *
 * Supports: ElevenLabs, OpenAI, and browser Web Speech.
 * Calls APIs directly (no proxy needed — runs in browser).
 * Uses streaming audio via AudioManager for low-latency playback.
 */


export interface TTSConfig {
  provider: 'elevenlabs' | 'openai' | 'web-speech' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Speaker → voiceId mapping */
  speakerVoices?: Record<string, string>;
  /** Default voice ID */
  defaultVoiceId?: string;
}

// Read embedded TTS config from window.ASAPS_CONFIG
function getEmbeddedTTSConfig(): TTSConfig | null {
  try {
    const config = (window as any).ASAPS_CONFIG?.ttsConfig;
    if (config?.provider && config.provider !== 'web-speech') {
      if (!config.apiKey) return null;
    }
    return config || null;
  } catch {
    return null;
  }
}

export class WebTTSService {
  private config: TTSConfig | null = null;
  private enabled = true;
  private speaking = false;
  private abortController?: AbortController;
  private language = 'en';
  private utterance?: SpeechSynthesisUtterance;

  constructor() {
    this.config = getEmbeddedTTSConfig();
    if (this.config) {
      console.log(`[WebTTS] Initialized with provider: ${this.config.provider}`);
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

  isSpeaking(): boolean {
    return this.speaking;
  }

  stop(): void {
    this.speaking = false;
    this.abortController?.abort();
    this.abortController = undefined;
    if (this._audioElement) {
      this._audioElement.pause();
      this._audioElement = undefined;
    }
    if (this.utterance) {
      window.speechSynthesis?.cancel();
      this.utterance = undefined;
    }
  }

  private getVoiceId(speaker?: string): string | undefined {
    if (!this.config) return undefined;
    if (speaker && this.config.speakerVoices?.[speaker]) {
      return this.config.speakerVoices[speaker];
    }
    return this.config.defaultVoiceId;
  }

  async speak(text: string, speaker?: string): Promise<void> {
    if (!this.isEnabled() || !text.trim()) return;

    this.stop();

    const provider = this.config!.provider;

    if (provider === 'web-speech') {
      return this.speakWebSpeech(text, speaker);
    }

    const voiceId = this.getVoiceId(speaker);
    if (!voiceId) {
      // No voice assigned — use Web Speech as fallback
      return this.speakWebSpeech(text, speaker);
    }

    try {
      this.speaking = true;
      this.abortController = new AbortController();

      let response: Response;

      if (provider === 'elevenlabs') {
        const modelId = this.config!.model || 'eleven_v3';
        const supportsLatencyOpt = !modelId.startsWith('eleven_v3');
        const latencyParam = supportsLatencyOpt ? '?optimize_streaming_latency=3' : '';
        response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream${latencyParam}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': this.config!.apiKey!,
            },
            body: JSON.stringify({ text, model_id: modelId }),
            signal: this.abortController.signal,
          }
        );
      } else if (provider === 'openai' || provider === 'custom') {
        const baseUrl = (this.config!.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        response = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config!.apiKey ? { Authorization: `Bearer ${this.config!.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.config!.model || 'tts-1',
            input: text,
            voice: voiceId || 'alloy',
          }),
          signal: this.abortController.signal,
        });
      } else {
        return;
      }

      if (!response.ok) {
        console.warn(`[WebTTS] ${provider} error: ${response.status}`);
        this.speaking = false;
        return;
      }

      // Play audio — use blob approach for compatibility with file:// origins
      // (MediaSource streaming doesn't work with null origins)
      const blob = await response.blob();
      await this.playAudioBlob(blob);
      this.speaking = false;
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[WebTTS] Speech failed:', err);
      }
      this.speaking = false;
    }
  }

  /** Play audio from a Blob using a temporary Audio element */
  private playAudioBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
      // Store for stop()
      this._audioElement = audio;
      audio.play().catch(reject);
    });
  }

  private _audioElement?: HTMLAudioElement;

  /** Speak using browser Web Speech API (no API key needed) */
  private speakWebSpeech(text: string, _speaker?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      this.speaking = true;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.language;
      this.utterance = utterance;
      utterance.onend = () => { this.speaking = false; this.utterance = undefined; resolve(); };
      utterance.onerror = () => { this.speaking = false; this.utterance = undefined; resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }
}
