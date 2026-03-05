/**
 * ElevenLabs TTS Provider
 *
 * Cloud TTS using ElevenLabs' text-to-speech API.
 * Supports dynamic voice fetching and high-quality multilingual synthesis.
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

/** Whether we're running inside Electron (can call APIs directly, no CORS) */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export class ElevenLabsProvider extends BaseTTSProvider {
  readonly name = 'ElevenLabs';
  readonly requiresApiKey = true;

  private cachedVoices: TTSVoiceInfo[] | null = null;

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    const voiceId = voiceConfig?.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // "Sarah" default
    const modelId = this.config!.model || 'eleven_multilingual_v2';

    const requestBody = { text, model_id: modelId };

    let audioBlob: Blob;

    if (isElectron()) {
      // Electron: call ElevenLabs API directly
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.config!.apiKey!,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs error ${response.status}: ${errorText}`);
      }

      audioBlob = await response.blob();
    } else {
      // Browser: go through Vite dev proxy
      const response = await fetch('/api/tts/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.config!.apiKey,
          voiceId,
          ...requestBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs proxy error ${response.status}: ${errorText}`);
      }

      audioBlob = await response.blob();
    }

    return { audio: audioBlob };
  }

  stop(): void {
    // No-op — AudioManager manages playback lifecycle
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    if (this.cachedVoices) return this.cachedVoices;

    this.ensureReady();

    try {
      let data: any;

      if (isElectron()) {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': this.config!.apiKey! },
        });
        if (!response.ok) throw new Error(`ElevenLabs voices error ${response.status}`);
        data = await response.json();
      } else {
        const response = await fetch('/api/tts/elevenlabs/voices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: this.config!.apiKey }),
        });
        if (!response.ok) throw new Error(`ElevenLabs voices proxy error ${response.status}`);
        data = await response.json();
      }

      const voices: TTSVoiceInfo[] = (data.voices || []).map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        lang: 'mul', // ElevenLabs multilingual voices work across languages
        gender: v.labels?.gender as 'male' | 'female' | undefined,
      }));

      this.cachedVoices = voices;
      return voices;
    } catch (error) {
      console.error('[ElevenLabs] Failed to fetch voices:', error);
      return [];
    }
  }
}
