import { describe, it, expect } from 'vitest';
import { exportSpeechOptions, summarizeSpeechSetup, speechCanUseRelay } from '../exportSpeech';

const eleven = { provider: 'elevenlabs', providerType: 'elevenlabs', apiKey: 'xi-secret-key', model: 'eleven_v3', defaultVoiceId: 'v1' } as any;
const voices = { elevenlabs: { Ingrid: 'voice-ingrid' }, openai: { Ingrid: 'marin' } };

describe('what an export carries for reading aloud', () => {
  it("the browser's voice: nothing of the speech setup, and no key", () => {
    const o = exportSpeechOptions({ readAloud: true, source: 'browser', saved: eleven, speakerVoices: voices, readPrompts: true });
    expect(o).toEqual({ ttsProvider: 'web-speech', ttsReadPrompts: true, ttsEnabled: true });
    expect(JSON.stringify(o)).not.toContain('xi-secret-key');
  });

  it('reading aloud off: no key either, whatever the voices were set to', () => {
    const o = exportSpeechOptions({ readAloud: false, source: 'setup', saved: eleven, speakerVoices: voices, readPrompts: true });
    expect(o).toEqual({ ttsProvider: 'web-speech', ttsReadPrompts: true, ttsEnabled: false });
  });

  it("the speech setup's voices: provider, key and the story's voices for that provider", () => {
    const o = exportSpeechOptions({ readAloud: true, source: 'setup', saved: eleven, speakerVoices: voices, readPrompts: false });
    expect(o).toEqual({
      ttsProvider: 'elevenlabs', ttsApiKey: 'xi-secret-key', ttsModel: 'eleven_v3', ttsBaseUrl: undefined, ttsDefaultVoiceId: 'v1',
      ttsReadPrompts: false, ttsSpeakerVoices: { Ingrid: 'voice-ingrid' }, ttsEnabled: true,
    });
  });

  it("no setup, or the browser's voice as setup: the browser's voice", () => {
    for (const saved of [null, undefined, { provider: 'web-speech', providerType: 'web-speech' } as any]) {
      expect(exportSpeechOptions({ readAloud: true, source: 'setup', saved, readPrompts: true }).ttsProvider).toBe('web-speech');
    }
  });

  it('describes the setup for the dialog', () => {
    expect(summarizeSpeechSetup(eleven)).toEqual({ kind: 'cloud', name: 'ElevenLabs', embedsKey: true, reachable: true });
    expect(summarizeSpeechSetup({ provider: 'openai', providerType: 'openai' } as any)).toMatchObject({ kind: 'cloud', name: 'OpenAI', embedsKey: false, reachable: false });
    expect(summarizeSpeechSetup({ provider: 'local', providerType: 'local', baseUrl: 'http://localhost:4123/v1' } as any)).toMatchObject({ kind: 'own-server', embedsKey: false, reachable: false });
    expect(summarizeSpeechSetup({ provider: 'custom', providerType: 'custom', baseUrl: 'https://speech.example.org/v1', apiKey: 'k' } as any)).toMatchObject({ kind: 'own-server', embedsKey: true, reachable: true });
    expect(summarizeSpeechSetup(null).kind).toBe('none');
  });

  it('through a relay: the voices without the key', () => {
    const o = exportSpeechOptions({ readAloud: true, source: 'setup', saved: eleven, speakerVoices: voices, readPrompts: true, relayUrl: '/.netlify/functions/asaps-ai' });
    expect(o).toMatchObject({ ttsProvider: 'elevenlabs', ttsRelayUrl: '/.netlify/functions/asaps-ai', ttsModel: 'eleven_v3', ttsSpeakerVoices: { Ingrid: 'voice-ingrid' } });
    expect(o.ttsApiKey).toBeUndefined();
    expect(JSON.stringify(o)).not.toContain('xi-secret-key');
  });

  it("a relay is not used for a setup it can't reach for", () => {
    const own = { provider: 'custom', providerType: 'custom', baseUrl: 'https://speech.example.org/v1', apiKey: 'k' } as any;
    const o = exportSpeechOptions({ readAloud: true, source: 'setup', saved: own, readPrompts: true, relayUrl: '/relay' });
    expect(o).toMatchObject({ ttsApiKey: 'k', ttsBaseUrl: 'https://speech.example.org/v1' });
    expect(o.ttsRelayUrl).toBeUndefined();
    expect(speechCanUseRelay(own)).toBe(false);
    expect(speechCanUseRelay(eleven)).toBe(true);
    expect(speechCanUseRelay({ providerType: 'openai' } as any)).toBe(true);
    expect(speechCanUseRelay({ providerType: 'openai', baseUrl: 'https://api.openai.com/v1' } as any)).toBe(true);
    // OpenAI's protocol at another address: the relay only knows OpenAI's own.
    expect(speechCanUseRelay({ providerType: 'openai', baseUrl: 'https://my-proxy.example/v1' } as any)).toBe(false);
    expect(speechCanUseRelay(null)).toBe(false);
  });

  it('speakers without a voice get one of their own (OpenAI), under the ones the author chose', () => {
    const openai = { provider: 'openai', providerType: 'openai', apiKey: 'sk-x', model: 'gpt-realtime-2.1-mini', defaultVoiceId: 'marin' } as any;
    const o = exportSpeechOptions({
      readAloud: true, source: 'setup', saved: openai, readPrompts: true,
      speakerVoices: { openai: { Ingrid: 'marin', Tomas: '' } },
      autoVoices: { Tomas: 'ash', 'Karin Lindqvist': 'alloy', Ingrid: 'coral' },
    });
    // Ingrid keeps the author's voice; Tomas ("Auto", stored empty) and Karin get theirs.
    expect(o.ttsSpeakerVoices).toEqual({ Ingrid: 'marin', Tomas: 'ash', 'Karin Lindqvist': 'alloy' });
  });

  it('not for ElevenLabs, whose voices belong to the account', () => {
    const o = exportSpeechOptions({ readAloud: true, source: 'setup', saved: eleven, speakerVoices: voices, readPrompts: true, autoVoices: { Tomas: 'ash' } });
    expect(o.ttsSpeakerVoices).toEqual({ Ingrid: 'voice-ingrid' });
  });
});

