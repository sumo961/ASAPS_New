/**
 * WebTTSProvider - Lightweight TTS for HTML export player
 *
 * Supports: ElevenLabs, OpenAI, and browser Web Speech.
 * Calls APIs directly (no proxy needed — runs in browser).
 *
 * OpenAI is read through /v1/audio/speech, or through the Realtime API when
 * the story was exported with a gpt-realtime model, and by itself once
 * OpenAI refuses the exported model (tts-1, tts-1-hd and gpt-4o-mini-tts end
 * on 2027-01-06), so stories exported before then keep their voices.
 */


import {
  speechLocale, speechLanguageCode, voiceSpeaksLanguage,
  OpenAIRealtimeSpeech, isRealtimeSpeechModel, readerLanguageName, speechModelRetired,
} from '@asaps/core';

export interface TTSConfig {
  provider: 'elevenlabs' | 'openai' | 'web-speech' | 'custom' | 'local';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Speaker → voiceId mapping */
  speakerVoices?: Record<string, string>;
  /** Default voice ID */
  defaultVoiceId?: string;
  /**
   * Also speak choice questions and input prompts (project setting
   * tts.readPrompts). Undefined = true: exports before this field spoke them.
   */
  readPrompts?: boolean;
  /**
   * Author's TTS toggle state at export time. When false, the player
   * stays silent unless the listener explicitly enables TTS via export
   * UI. Undefined defaults to true for backward compat with old exports.
   */
  enabled?: boolean;
  /** Local TTS request template */
  localTemplate?: {
    method: 'GET' | 'POST';
    path: string;
    contentType?: 'json' | 'multipart';
    body?: Record<string, any>;
    headers?: Record<string, string>;
  };
}

// Read embedded TTS config from window.ASAPS_CONFIG
/** A server only the author's own computer can reach. */
const isLocalAddress = (url?: string) => !url || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(url);

function getEmbeddedTTSConfig(): TTSConfig | null {
  try {
    const config = (window as any).ASAPS_CONFIG?.ttsConfig as TTSConfig | undefined;
    if (!config?.provider) return config || null;
    // A provider the player can't use falls back to the browser's own
    // voice, so "Read text aloud" still reads: a cloud provider without its
    // key, or a local server that only exists on the author's computer.
    const needsKey = config.provider === 'openai' || config.provider === 'elevenlabs';
    const unreachable = (config.provider === 'local' || config.provider === 'custom') && isLocalAddress(config.baseUrl);
    if ((needsKey && !config.apiKey) || unreachable) {
      return { provider: 'web-speech', enabled: config.enabled, readPrompts: config.readPrompts };
    }
    return config;
  } catch {
    return null;
  }
}

/** Translated speaker name → the name its voice is kept under, per language (written by the exporter). */
function getEmbeddedSpeakerAliases(language: string): Record<string, string> {
  try {
    return (window as any).ASAPS_CONFIG?.ttsSpeakerAliases?.[language] || {};
  } catch {
    return {};
  }
}

export class WebTTSService {
  private config: TTSConfig | null = null;
  private enabled = true;
  private speaking = false;
  private abortController?: AbortController;
  private language = 'en';
  private muted = false;
  private speakerAliases: Record<string, string> = {};
  private utterance?: SpeechSynthesisUtterance;
  private realtime: OpenAIRealtimeSpeech | null = null;
  /** OpenAI has refused the exported Speech API model: lines go through the Realtime API. */
  private speechApiGone = false;

  constructor() {
    this.config = getEmbeddedTTSConfig();
    if (this.config) {
      // Honour the author's export-time TTS toggle. Undefined defaults to
      // true so old exports (pre-v0.9.49) keep behaving as before.
      this.enabled = this.config.enabled !== false;
      console.log(`[WebTTS] Initialized with provider: ${this.config.provider}, enabled: ${this.enabled}`);
    }
  }

  /** Whether prompts (questions, input prompts) are spoken as well as story text. */
  readsPrompts(): boolean {
    return this.config?.readPrompts !== false;
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  isEnabled(): boolean {
    return this.enabled && !this.muted && this.isConfigured();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  /** The player's mute switch silences speech too, and stops a line being read. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  setLanguage(lang: string): void {
    this.language = lang;
    this.speakerAliases = getEmbeddedSpeakerAliases(lang);
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  stop(): void {
    this.sequence++; // cancel a running segment sequence
    this.halt();
  }

  private halt(): void {
    this.speaking = false;
    this.abortController?.abort();
    this.abortController = undefined;
    this.realtime?.stop();
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
    // In a translation the speaker goes by a translated name; the voice is
    // kept under the original one.
    const original = speaker ? this.speakerAliases[speaker] : undefined;
    const voice = (speaker && this.config.speakerVoices?.[speaker]) || (original && this.config.speakerVoices?.[original]);
    if (voice) return voice;
    return this.config.defaultVoiceId;
  }

  /** Bumped by speak()/stop(): a running speakSegments() sequence stops. */
  private sequence = 0;

  async speak(text: string, speaker?: string): Promise<void> {
    this.sequence++;
    return this.speakOne(text, speaker);
  }

  /**
   * Speak a line as consecutive voices — narration by the Narrator, quoted
   * speech by the character. Each piece waits for the previous; a new
   * speak()/stop() cancels the rest.
   */
  async speakSegments(segments: Array<{ text: string; speaker?: string }>): Promise<void> {
    const seq = ++this.sequence;
    for (const seg of segments) {
      if (this.sequence !== seq) return;
      await this.speakOne(seg.text, seg.speaker);
    }
  }

  private async speakOne(text: string, speaker?: string): Promise<void> {
    if (!this.isEnabled() || !text.trim()) return;

    this.halt();

    const provider = this.config!.provider;

    if (provider === 'web-speech') {
      return this.speakWebSpeech(text, speaker);
    }

    const voiceId = this.getVoiceId(speaker);
    if (!voiceId) {
      // No voice assigned — use Web Speech as fallback
      return this.speakWebSpeech(text, speaker);
    }

    if (provider === 'openai' && (isRealtimeSpeechModel(this.config!.model) || this.speechApiGone)) {
      return this.speakRealtime(text, voiceId, speaker);
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
            body: JSON.stringify({
              text,
              model_id: modelId,
              // ElevenLabs takes the bare language code ('de'), not 'de-AT',
              // 'zh-Hans' or a typed name; left out when it can't be read.
              // Multilingual v2 doesn't take it and reads the language of the text.
              ...(speechLanguageCode(this.language) && !/multilingual/i.test(modelId) ? { language_code: speechLanguageCode(this.language) } : {}),
            }),
            signal: this.abortController.signal,
          }
        );
      } else if (provider === 'local' && this.config!.localTemplate) {
        const tmpl = this.config!.localTemplate;
        const baseUrl = (this.config!.baseUrl || 'http://localhost:5002').replace(/\/$/, '');
        const interpolate = (s: string) => s
          .replace(/\{text\}/g, encodeURIComponent(text))
          .replace(/\{voice\}/g, encodeURIComponent(voiceId || 'default'))
          .replace(/\{speed\}/g, '1.0')
          .replace(/\{lang\}/g, speechLanguageCode(this.language) || 'en')
          .replace(/\{model\}/g, this.config!.model || 'default');
        const url = baseUrl + interpolate(tmpl.path);
        const headers: Record<string, string> = { ...(tmpl.headers || {}) };
        if (this.config!.apiKey) headers['Authorization'] = `Bearer ${this.config!.apiKey}`;

        if (tmpl.method === 'GET') {
          response = await fetch(url, { method: 'GET', headers, signal: this.abortController.signal });
        } else {
          headers['Content-Type'] = 'application/json';
          const body: Record<string, any> = {};
          if (tmpl.body) {
            for (const [k, v] of Object.entries(tmpl.body)) {
              body[k] = typeof v === 'string' ? interpolate(v) : v;
            }
          }
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: this.abortController.signal,
          });
        }
      } else if (provider === 'openai' || provider === 'custom' || provider === 'local') {
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
        // OpenAI has switched the exported model off: from now on this
        // story is read through the Realtime API, in the same voices.
        if (provider === 'openai' && speechModelRetired(response.status, await response.text().catch(() => ''))) {
          console.warn(`[WebTTS] "${this.config!.model || 'tts-1'}" is no longer offered; reading through the Realtime API`);
          this.speechApiGone = true;
          this.speaking = false;
          return this.speakRealtime(text, voiceId, speaker);
        }
        // The provider refused for another reason (a key that ran out…).
        // The story is still read, with the browser's voice.
        console.warn(`[WebTTS] ${provider} error: ${response.status}; reading with the browser's voice`);
        this.speaking = false;
        return this.speakWebSpeech(text, speaker);
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

  /** Read a line through OpenAI's Realtime API; the browser's voice when that fails. */
  private async speakRealtime(text: string, voiceId: string, speaker?: string): Promise<void> {
    const model = this.config!.model;
    this.realtime ??= new OpenAIRealtimeSpeech({
      apiKey: this.config!.apiKey!,
      baseUrl: this.config!.baseUrl,
      model: isRealtimeSpeechModel(model) ? model : undefined,
    });
    this.speaking = true;
    let line: Blob;
    try {
      line = await this.realtime.read(text, voiceId, readerLanguageName(this.language));
    } catch (err: any) {
      this.speaking = false;
      if (err?.name === 'AbortError') return; // stopped, or the next line came
      console.warn("[WebTTS] OpenAI could not read the line; reading with the browser's voice:", err?.message || err);
      return this.speakWebSpeech(text, speaker);
    }
    try {
      await this.playAudioBlob(line);
    } catch (err) {
      console.warn('[WebTTS] Speech failed:', err);
    }
    this.speaking = false;
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

  /**
   * A voice for the language, when the browser has one. Without this some
   * browsers read a translation with their default (often English) voice
   * even though `lang` is set.
   */
  private voiceFor(language: string): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    const fitting = voices.filter((v) => voiceSpeaksLanguage(v.lang, language));
    return fitting.find((v) => v.default) ?? fitting.find((v) => v.localService) ?? fitting[0];
  }

  /** Speak using browser Web Speech API (no API key needed) */
  private speakWebSpeech(text: string, _speaker?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      this.speaking = true;
      const utterance = new SpeechSynthesisUtterance(text);
      // Voices are tagged by region: 'zh-Hans' → 'zh-CN', 'German' → 'de'.
      utterance.lang = speechLocale(this.language, this.language);
      const voice = this.voiceFor(this.language);
      if (voice) utterance.voice = voice;
      this.utterance = utterance;
      utterance.onend = () => { this.speaking = false; this.utterance = undefined; resolve(); };
      utterance.onerror = () => { this.speaking = false; this.utterance = undefined; resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }
}
