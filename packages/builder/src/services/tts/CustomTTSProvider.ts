/**
 * Custom TTS Provider
 *
 * OpenAI-compatible API at a custom base URL (local Piper, Coqui, etc.).
 * Same interface as OpenAI TTS but no API key required and uses baseUrl directly
 * (typically localhost, so no proxy needed).
 */

import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../types/tts';
import { BaseTTSProvider } from './BaseTTSProvider';

export class CustomTTSProvider extends BaseTTSProvider {
  readonly name = 'Custom TTS';
  readonly requiresApiKey = false;

  protected validateConfig(config: import('../../types/tts').TTSProviderConfig): boolean {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      console.error(`[${this.name}] baseUrl is required for custom TTS provider`);
      return false;
    }
    return true;
  }

  async synthesize(text: string, voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();

    const voice = voiceConfig?.voiceId || 'default';
    const model = this.config!.model || 'tts-1';
    const speed = voiceConfig?.rate ?? 1.0;
    const baseUrl = this.config!.baseUrl!.replace(/\/$/, '');

    const requestBody = { model, input: text, voice, speed, response_format: 'mp3' };

    // Custom providers are typically local — call directly (no proxy needed)
    const endpoint = `${baseUrl}/audio/speech`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config!.apiKey) {
      headers['Authorization'] = `Bearer ${this.config!.apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom TTS error ${response.status}: ${errorText}`);
    }

    const audioBlob = await response.blob();
    return { audio: audioBlob };
  }

  stop(): void {
    // No-op — AudioManager manages playback lifecycle
  }

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    // Custom providers may support an OpenAI-compatible /voices endpoint
    const baseUrl = this.config?.baseUrl?.replace(/\/$/, '');
    if (!baseUrl) return [];

    try {
      const headers: Record<string, string> = {};
      if (this.config!.apiKey) {
        headers['Authorization'] = `Bearer ${this.config!.apiKey}`;
      }

      const response = await fetch(`${baseUrl}/voices`, { headers });
      if (!response.ok) return [];

      const data = await response.json();
      // Support both OpenAI-style { voices: [...] } and array responses
      const voiceList = Array.isArray(data) ? data : data.voices || [];
      return voiceList.map((v: any) => ({
        id: v.id || v.voice_id || v.name,
        name: v.name || v.id,
        lang: v.lang || 'mul',
        gender: v.gender as 'male' | 'female' | 'neutral' | undefined,
      }));
    } catch {
      // Voice listing is optional for custom providers
      return [];
    }
  }
}
