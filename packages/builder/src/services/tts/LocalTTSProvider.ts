/**
 * Local TTS Provider
 *
 * Template-based provider for open-source/local TTS servers.
 * Supports configurable request templates with built-in presets
 * for popular servers (Coqui, Piper, Chatterbox, Kokoro).
 *
 * Interpolation variables: {text}, {voice}, {speed}, {lang}, {model}
 */

import type {
  TTSProviderConfig,
  TTSVoiceConfig,
  TTSVoiceInfo,
  TTSSynthesisResult,
  LocalTTSRequestTemplate,
  LocalTTSPreset,
} from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

/** Built-in Kokoro voice list (used when server doesn't provide /voices endpoint) */
const KOKORO_VOICES: TTSVoiceInfo[] = [
  // American Female
  { id: 'af_heart', name: 'Heart (American F)', lang: 'en', gender: 'female' },
  { id: 'af_alloy', name: 'Alloy (American F)', lang: 'en', gender: 'female' },
  { id: 'af_aoede', name: 'Aoede (American F)', lang: 'en', gender: 'female' },
  { id: 'af_bella', name: 'Bella (American F)', lang: 'en', gender: 'female' },
  { id: 'af_jessica', name: 'Jessica (American F)', lang: 'en', gender: 'female' },
  { id: 'af_kore', name: 'Kore (American F)', lang: 'en', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole (American F)', lang: 'en', gender: 'female' },
  { id: 'af_nova', name: 'Nova (American F)', lang: 'en', gender: 'female' },
  { id: 'af_river', name: 'River (American F)', lang: 'en', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah (American F)', lang: 'en', gender: 'female' },
  { id: 'af_sky', name: 'Sky (American F)', lang: 'en', gender: 'female' },
  // American Male
  { id: 'am_adam', name: 'Adam (American M)', lang: 'en', gender: 'male' },
  { id: 'am_echo', name: 'Echo (American M)', lang: 'en', gender: 'male' },
  { id: 'am_eric', name: 'Eric (American M)', lang: 'en', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir (American M)', lang: 'en', gender: 'male' },
  { id: 'am_liam', name: 'Liam (American M)', lang: 'en', gender: 'male' },
  { id: 'am_michael', name: 'Michael (American M)', lang: 'en', gender: 'male' },
  { id: 'am_onyx', name: 'Onyx (American M)', lang: 'en', gender: 'male' },
  { id: 'am_puck', name: 'Puck (American M)', lang: 'en', gender: 'male' },
  // British Female
  { id: 'bf_emma', name: 'Emma (British F)', lang: 'en', gender: 'female' },
  { id: 'bf_alice', name: 'Alice (British F)', lang: 'en', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella (British F)', lang: 'en', gender: 'female' },
  { id: 'bf_lily', name: 'Lily (British F)', lang: 'en', gender: 'female' },
  // British Male
  { id: 'bm_george', name: 'George (British M)', lang: 'en', gender: 'male' },
  { id: 'bm_daniel', name: 'Daniel (British M)', lang: 'en', gender: 'male' },
  { id: 'bm_fable', name: 'Fable (British M)', lang: 'en', gender: 'male' },
  { id: 'bm_lewis', name: 'Lewis (British M)', lang: 'en', gender: 'male' },
];

/** Built-in presets for common local TTS servers */
export const LOCAL_TTS_PRESETS: LocalTTSPreset[] = [
  {
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
    description: 'Any server with /v1/audio/speech endpoint',
    defaultBaseUrl: 'http://localhost:8080/v1',
    template: {
      method: 'POST',
      path: '/audio/speech',
      contentType: 'json',
      body: { model: '{model}', input: '{text}', voice: '{voice}', speed: '{speed}', response_format: 'mp3' },
      voiceListEndpoint: '/voices',
    },
  },
  {
    id: 'coqui',
    name: 'Coqui TTS',
    description: 'Coqui TTS server (docker)',
    defaultBaseUrl: 'http://localhost:5002',
    template: {
      method: 'GET',
      path: '/api/tts?text={text}&speaker_id={voice}&language_id={lang}',
      responseType: 'audio',
      voiceListEndpoint: '/api/speakers',
      voiceListPath: 'speakers',
    },
  },
  {
    id: 'piper',
    name: 'Piper',
    description: 'Piper TTS (Wyoming / HTTP)',
    defaultBaseUrl: 'http://localhost:5000',
    template: {
      method: 'POST',
      path: '/api/tts',
      contentType: 'json',
      body: { text: '{text}', voice: '{voice}', speed: '{speed}' },
      voiceListEndpoint: '/api/voices',
    },
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    description: 'Chatterbox TTS with voice cloning',
    defaultBaseUrl: 'http://localhost:8150',
    template: {
      method: 'POST',
      path: '/v1/audio/speech',
      contentType: 'multipart',
      body: { text: '{text}', voice: '{voice}', exaggeration: '0.5', cfg_weight: '0.5' },
      referenceAudioField: 'audio_prompt',
      voiceListEndpoint: '/v1/voices',
    },
    supportsVoiceCloning: true,
  },
  {
    id: 'kokoro',
    name: 'Kokoro',
    description: 'Kokoro TTS server',
    defaultBaseUrl: 'http://localhost:8880/v1',
    template: {
      method: 'POST',
      path: '/audio/speech',
      contentType: 'json',
      body: { model: '{model}', input: '{text}', voice: '{voice}', speed: '{speed}', response_format: 'mp3' },
      voiceListEndpoint: '/voices',
    },
  },
];

export class LocalTTSProvider extends BaseTTSProvider {
  readonly name = 'Local TTS';
  readonly requiresApiKey = false;

  private abortController?: AbortController;
  private template: LocalTTSRequestTemplate | null = null;
  private referenceAudios: File[] = [];

  protected validateConfig(config: TTSProviderConfig): boolean {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      console.error(`[${this.name}] baseUrl is required for local TTS provider`);
      return false;
    }

    // Resolve template from preset or custom config
    if (config.localPreset) {
      const preset = LOCAL_TTS_PRESETS.find(p => p.id === config.localPreset);
      if (preset) {
        this.template = preset.template;
      } else {
        console.warn(`[${this.name}] Unknown preset "${config.localPreset}", using default`);
        this.template = LOCAL_TTS_PRESETS[0].template;
      }
    } else if (config.localTemplate) {
      this.template = config.localTemplate;
    } else {
      // Default to OpenAI-compatible
      this.template = LOCAL_TTS_PRESETS[0].template;
    }

    if (config.referenceAudios) {
      this.referenceAudios = config.referenceAudios;
    }

    return true;
  }

  /** Interpolate template variables into a string */
  private interpolate(str: string, vars: Record<string, string>): string {
    return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  }

  /** Interpolate variables into an object (deep) */
  private interpolateObject(obj: Record<string, any>, vars: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolate(value, vars);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.interpolateObject(value, vars);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    if (!this.template) {
      throw new Error('No request template configured');
    }

    const baseUrl = this.config!.baseUrl!.replace(/\/$/, '');
    const vars: Record<string, string> = {
      text,
      voice: voiceConfig?.voiceId || this.config!.defaultVoiceId || 'default',
      speed: String(voiceConfig?.rate ?? 1.0),
      lang: voiceConfig?.lang || 'en',
      model: (this.config!.model || 'default').trim(),
    };

    const url = baseUrl + this.interpolate(this.template.path, vars);
    this.abortController = new AbortController();

    const headers: Record<string, string> = { ...(this.template.headers || {}) };
    if (this.config!.apiKey) {
      headers['Authorization'] = `Bearer ${this.config!.apiKey}`;
    }

    let response: Response;

    if (this.template.method === 'GET') {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
      });
    } else if (this.template.contentType === 'multipart') {
      const formData = new FormData();
      if (this.template.body) {
        const interpolated = this.interpolateObject(this.template.body, vars);
        for (const [key, value] of Object.entries(interpolated)) {
          formData.append(key, String(value));
        }
      }
      // Attach reference audio for voice cloning
      if (this.template.referenceAudioField && this.referenceAudios.length > 0) {
        formData.append(this.template.referenceAudioField, this.referenceAudios[0]);
      }
      // Don't set Content-Type for multipart — browser sets boundary automatically
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: this.abortController.signal,
      });
    } else {
      // JSON body
      headers['Content-Type'] = 'application/json';
      const body = this.template.body
        ? this.interpolateObject(this.template.body, vars)
        : { text, voice: vars.voice };

      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local TTS error ${response.status}: ${errorText}`);
    }

    // Handle JSON responses that contain an audio URL
    if (this.template.responseType === 'json' && this.template.audioUrlField) {
      const data = await response.json();
      const audioUrl = data[this.template.audioUrlField];
      if (audioUrl) {
        const audioResponse = await fetch(audioUrl, { signal: this.abortController.signal });
        return { audio: null, response: audioResponse };
      }
      throw new Error('No audio URL found in JSON response');
    }

    // Default: return raw response for streaming playback
    return { audio: null, response };
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    const baseUrl = this.config?.baseUrl?.replace(/\/$/, '');
    if (!baseUrl) return [];

    // Try fetching from server first
    if (this.template?.voiceListEndpoint) {
      try {
        const headers: Record<string, string> = {};
        if (this.config!.apiKey) {
          headers['Authorization'] = `Bearer ${this.config!.apiKey}`;
        }

        const response = await fetch(`${baseUrl}${this.template.voiceListEndpoint}`, { headers });
        if (response.ok) {
          const data = await response.json();

          // Navigate to voice list using voiceListPath if specified
          let voiceList: any[];
          if (this.template.voiceListPath) {
            const pathParts = this.template.voiceListPath.split('.');
            let current = data;
            for (const part of pathParts) {
              current = current?.[part];
            }
            voiceList = Array.isArray(current) ? current : [];
          } else {
            // Support common response formats
            voiceList = Array.isArray(data) ? data : data.voices || data.speakers || [];
          }

          if (voiceList.length > 0) {
            return voiceList.map((v: any) => ({
              id: typeof v === 'string' ? v : v.id || v.voice_id || v.name,
              name: typeof v === 'string' ? v : v.name || v.id || v.voice_id,
              lang: typeof v === 'string' ? 'mul' : v.lang || v.language || 'mul',
              gender: typeof v === 'string' ? undefined : v.gender as 'male' | 'female' | 'neutral' | undefined,
            }));
          }
        }
      } catch {
        // Fall through to built-in voices
      }
    }

    // Fall back to built-in voice list for known models
    const model = (this.config?.model || '').toLowerCase();
    if (model.includes('kokoro')) {
      return KOKORO_VOICES;
    }

    return [];
  }

  /** Set reference audio files for voice cloning */
  setReferenceAudios(files: File[]): void {
    this.referenceAudios = files;
  }

  /** Get current preset info */
  getPresetId(): string | undefined {
    return this.config?.localPreset;
  }
}
