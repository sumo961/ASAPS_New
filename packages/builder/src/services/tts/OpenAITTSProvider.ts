/**
 * OpenAI TTS Provider
 *
 * Two ways to OpenAI's voices:
 *
 *  - /v1/audio/speech with tts-1, tts-1-hd or gpt-4o-mini-tts. OpenAI
 *    switches all three off on 2027-01-06.
 *  - The Realtime API with gpt-realtime-2.1-mini, their named replacement
 *    (see openaiRealtimeSpeech.ts in core). Used when that model is chosen, and by
 *    itself once OpenAI refuses one of the older models.
 * (developers.openai.com/api/docs/deprecations, checked 2026-11-18)
 *
 * There is no language parameter: the voice follows the language of the text.
 *
 * The Speech API path returns the raw Response for streaming playback
 * (AudioManager decides whether to use MediaSource streaming or blob
 * fallback); the Realtime path plays the line itself while it arrives, or
 * returns it as one WAV where the page can't play sound yet.
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import {
  OpenAIRealtimeSpeech, OPENAI_REALTIME_SPEECH_MODEL, OPENAI_REALTIME_VOICES,
  isRealtimeSpeechModel as isRealtimeModel, readerLanguageName as languageName, speechModelRetired,
} from '@asaps/core';
import type { TTSProviderConfig } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';
import { getAudioManager } from '@asaps/renderer';

/** Whether we're running inside Electron (can call APIs directly, no CORS) */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/** The day OpenAI switches off the models of /v1/audio/speech. */
export const OPENAI_TTS_SHUTDOWN = '2027-01-06';

/**
 * Static voice catalogue — OpenAI voices are all multilingual.
 * `newer` voices exist on gpt-4o-mini-tts only; tts-1 and tts-1-hd refuse them.
 */
const OPENAI_VOICES: Array<TTSVoiceInfo & { newer?: boolean }> = [
  { id: 'alloy', name: 'Alloy', lang: 'mul', gender: 'neutral' },
  { id: 'ash', name: 'Ash', lang: 'mul', gender: 'male' },
  { id: 'ballad', name: 'Ballad', lang: 'mul', gender: 'male', newer: true },
  { id: 'cedar', name: 'Cedar', lang: 'mul', gender: 'male', newer: true },
  { id: 'coral', name: 'Coral', lang: 'mul', gender: 'female' },
  { id: 'echo', name: 'Echo', lang: 'mul', gender: 'male' },
  { id: 'fable', name: 'Fable', lang: 'mul', gender: 'neutral' },
  { id: 'marin', name: 'Marin', lang: 'mul', gender: 'female', newer: true },
  { id: 'nova', name: 'Nova', lang: 'mul', gender: 'female' },
  { id: 'onyx', name: 'Onyx', lang: 'mul', gender: 'male' },
  { id: 'sage', name: 'Sage', lang: 'mul', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', lang: 'mul', gender: 'female' },
  { id: 'verse', name: 'Verse', lang: 'mul', gender: 'male', newer: true },
];

const isOlderModel = (model: string) => /^tts-1/.test(model);

/** The voices `model` can use. */
function voicesFor(model: string): TTSVoiceInfo[] {
  return OPENAI_VOICES
    .filter((v) => (isRealtimeModel(model) ? OPENAI_REALTIME_VOICES.includes(v.id) : !(v.newer && isOlderModel(model))))
    .map(({ newer: _newer, ...voice }) => voice);
}

export class OpenAITTSProvider extends BaseTTSProvider {
  readonly name = 'OpenAI TTS';
  readonly requiresApiKey = true;

  private abortController?: AbortController;
  private realtime: OpenAIRealtimeSpeech | null = null;
  /** OpenAI has refused the chosen Speech API model: lines go through the Realtime API. */
  private speechApiGone = false;

  configure(config: TTSProviderConfig): void {
    this.realtime?.dispose();
    this.realtime = null;
    this.speechApiGone = false;
    super.configure(config);
  }

  private async readRealtime(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    const model = this.config!.model || '';
    this.realtime ??= new OpenAIRealtimeSpeech({
      apiKey: this.config!.apiKey!,
      baseUrl: this.config!.baseUrl,
      model: isRealtimeModel(model) ? model : OPENAI_REALTIME_SPEECH_MODEL,
    });
    const language = languageName(voiceConfig?.lang);
    // Muted: nothing is played, so nothing to play early either.
    const audioManager = getAudioManager();
    if (audioManager.isMuted?.()) return { audio: await this.realtime.read(text, voiceConfig?.voiceId, language) };
    // Played while it arrives: the line starts about half a second after it
    // was asked for. Where the page may not play sound yet, the whole line
    // comes back for TTSService to play.
    const volume = (voiceConfig?.volume ?? 1) * (audioManager.getMasterVolume?.() ?? 1);
    const { heard, audio } = await this.realtime.speak(text, voiceConfig?.voiceId, language, volume);
    return heard ? { audio: null, played: true } : { audio };
  }

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    const model = this.config!.model || 'tts-1';
    if (isRealtimeModel(model) || this.speechApiGone) return this.readRealtime(text, voiceConfig);

    // A voice the model doesn't have (Marin on tts-1) is refused by the API.
    const wanted = voiceConfig?.voiceId || 'alloy';
    const known = OPENAI_VOICES.some((v) => v.id === wanted);
    const voice = known && !voicesFor(model).some((v) => v.id === wanted) ? 'alloy' : wanted;
    const speed = voiceConfig?.rate ?? 1.0;

    const requestBody = { model, input: text, voice, speed, response_format: 'mp3' };

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    let response: Response;

    if (isElectron()) {
      // Electron: call OpenAI API directly (no CORS)
      const baseUrl = this.config!.baseUrl || 'https://api.openai.com/v1';
      const endpoint = `${baseUrl.replace(/\/$/, '')}/audio/speech`;

      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config!.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });
    } else {
      // Browser: go through Vite dev proxy
      response = await fetch('/api/tts/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: this.config!.baseUrl || 'https://api.openai.com/v1',
          apiKey: this.config!.apiKey,
          ...requestBody,
        }),
        signal,
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      // The model has been switched off (see the note at the top): from now
      // on this setup reads through the Realtime API.
      if (speechModelRetired(response.status, errorText)) {
        console.warn(`[${this.name}] "${model}" is no longer offered; reading with ${OPENAI_REALTIME_SPEECH_MODEL}`);
        this.speechApiGone = true;
        return this.readRealtime(text, voiceConfig);
      }
      throw new Error(`OpenAI TTS error ${response.status}: ${errorText}`);
    }

    // Return raw response for streaming playback
    return { audio: null, response };
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.realtime?.stop();
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    // All OpenAI voices are multilingual; which ones exist depends on the model.
    return voicesFor(this.config?.model || 'tts-1');
  }
}
