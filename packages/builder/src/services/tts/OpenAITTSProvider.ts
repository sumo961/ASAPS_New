/**
 * OpenAI TTS Provider
 *
 * Cloud TTS using OpenAI's /v1/audio/speech.
 *
 * OpenAI switches off every model of this endpoint (tts-1, tts-1-hd,
 * gpt-4o-mini-tts) on 2027-01-06. The replacement, gpt-realtime-2.1-mini,
 * runs on the Realtime API, a different workflow this provider does not
 * speak. Once the models are gone the provider throws TTSUnavailableError
 * and TTSService reads with the browser's voice.
 * (developers.openai.com/api/docs/deprecations, checked 2026-11-18)
 *
 * There is no language parameter: the voice follows the language of the text.
 *
 * Returns raw Response for streaming playback (AudioManager decides
 * whether to use MediaSource streaming or blob fallback).
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import { TTSUnavailableError } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

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
  return OPENAI_VOICES.filter((v) => !(v.newer && isOlderModel(model))).map(({ newer: _newer, ...voice }) => voice);
}

export class OpenAITTSProvider extends BaseTTSProvider {
  readonly name = 'OpenAI TTS';
  readonly requiresApiKey = true;

  private abortController?: AbortController;

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    const model = this.config!.model || 'tts-1';
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
      // The model has been switched off (see the note at the top).
      if (response.status === 404 || response.status === 410 || /model_not_found|deprecat|does not exist/i.test(errorText)) {
        throw new TTSUnavailableError(`OpenAI no longer offers the speech model "${model}": ${errorText}`);
      }
      throw new Error(`OpenAI TTS error ${response.status}: ${errorText}`);
    }

    // Return raw response for streaming playback
    return { audio: null, response };
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    // All OpenAI voices are multilingual; which ones exist depends on the model.
    return voicesFor(this.config?.model || 'tts-1');
  }
}
