/**
 * Which voice and language an utterance gets: the language wins over a
 * voice that can't read it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechProvider } from '../WebSpeechProvider';

const voice = (name: string, lang: string) =>
  ({ name, lang, voiceURI: name, localService: true, default: false }) as SpeechSynthesisVoice;

describe('WebSpeechProvider: voice and language of an utterance', () => {
  let spoken: any[];
  let provider: WebSpeechProvider;
  beforeEach(() => {
    spoken = [];
    (globalThis as any).SpeechSynthesisUtterance = class { text: string; lang = ''; voice: any = null; rate = 1; volume = 1; pitch = 1; onend: any; onerror: any; constructor(t: string) { this.text = t; } };
    (window as any).speechSynthesis = {
      getVoices: () => [voice('Samantha', 'en-US'), voice('Anna', 'de-DE'), voice('Tingting', 'zh-CN')],
      speak: (u: any) => { spoken.push(u); u.onend?.(); },
      cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    provider = new WebSpeechProvider();
    provider.configure({ provider: 'web-speech' });
  });
  afterEach(() => {
    delete (window as any).speechSynthesis;
    delete (globalThis as any).SpeechSynthesisUtterance;
  });

  it('keeps the speaker’s own voice when it can read the language', async () => {
    await provider.synthesize('Hello', { voiceId: 'Samantha', lang: 'en' });
    expect(spoken[0].voice.name).toBe('Samantha');
  });

  it('uses a voice of the language when the speaker’s voice can’t read it', async () => {
    await provider.synthesize('Hallo', { voiceId: 'Samantha', lang: 'de' });
    expect(spoken[0].voice.name).toBe('Anna');
    expect(spoken[0].lang).toBe('de');
  });

  it('uses a voice of the language when the speaker’s voice isn’t installed here', async () => {
    await provider.synthesize('Hallo', { voiceId: 'Petra (Premium)', lang: 'de' });
    expect(spoken[0].voice.name).toBe('Anna');
  });

  it('gives the browser a region for a script code', async () => {
    await provider.synthesize('你好', { lang: 'zh-Hans' });
    expect(spoken[0].lang).toBe('zh-CN');
    expect(spoken[0].voice.name).toBe('Tingting');
  });
});
