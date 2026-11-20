import { describe, it, expect } from 'vitest';
import { exportSpeechOptions, summarizeSpeechSetup } from '../exportSpeech';

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
});
