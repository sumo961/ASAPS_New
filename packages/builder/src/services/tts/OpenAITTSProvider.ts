/**
 * OpenAI TTS Provider
 *
 * Cloud TTS using OpenAI's text-to-speech API.
 * Supports tts-1 (fast) and tts-1-hd (high quality) models.
 * All voices are multilingual — no language filtering needed.
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

/** Whether we're running inside Electron (can call APIs directly, no CORS) */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

/** Static voice catalogue — OpenAI voices are all multilingual */
const OPENAI_VOICES: TTSVoiceInfo[] = [
  { id: 'alloy', name: 'Alloy', lang: 'mul', gender: 'neutral' },
  { id: 'ash', name: 'Ash', lang: 'mul', gender: 'male' },
  { id: 'ballad', name: 'Ballad', lang: 'mul', gender: 'male' },
  { id: 'coral', name: 'Coral', lang: 'mul', gender: 'female' },
  { id: 'echo', name: 'Echo', lang: 'mul', gender: 'male' },
  { id: 'fable', name: 'Fable', lang: 'mul', gender: 'neutral' },
  { id: 'nova', name: 'Nova', lang: 'mul', gender: 'female' },
  { id: 'onyx', name: 'Onyx', lang: 'mul', gender: 'male' },
  { id: 'sage', name: 'Sage', lang: 'mul', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', lang: 'mul', gender: 'female' },
];

export class OpenAITTSProvider extends BaseTTSProvider {
  readonly name = 'OpenAI TTS';
  readonly requiresApiKey = true;

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    const voice = voiceConfig?.voiceId || 'alloy';
    const model = this.config!.model || 'tts-1';
    const speed = voiceConfig?.rate ?? 1.0;

    const requestBody = { model, input: text, voice, speed, response_format: 'mp3' };

    let audioBlob: Blob;

    if (isElectron()) {
      // Electron: call OpenAI API directly (no CORS)
      const baseUrl = this.config!.baseUrl || 'https://api.openai.com/v1';
      const endpoint = `${baseUrl.replace(/\/$/, '')}/audio/speech`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config!.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI TTS error ${response.status}: ${errorText}`);
      }

      audioBlob = await response.blob();
    } else {
      // Browser: go through Vite dev proxy
      const response = await fetch('/api/tts/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: this.config!.baseUrl || 'https://api.openai.com/v1',
          apiKey: this.config!.apiKey,
          ...requestBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI TTS proxy error ${response.status}: ${errorText}`);
      }

      audioBlob = await response.blob();
    }

    return { audio: audioBlob };
  }

  stop(): void {
    // No-op — AudioManager manages playback lifecycle
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    // All OpenAI voices are multilingual, no filtering needed
    return OPENAI_VOICES;
  }
}
