import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TTSService, getTTSService, resetTTSService } from '../TTSService';
import type { ITTSProvider, TTSVoiceConfig, TTSSynthesisResult } from '../../../types/tts';

// Shared mock AudioManager so we can inspect calls. Production uses
// `playSoundFromBlobAndWait` for the blob path (so isSpeaking stays
// true until playback finishes) and `playStreamingAudio` for the
// streaming Response path. Both are mocked here.
const mockPlaySoundFromBlobAndWait = vi.fn().mockResolvedValue(undefined);
const mockPlayStreamingAudio = vi.fn().mockResolvedValue(undefined);
// Kept as an alias for older tests that still reference the old name.
const mockPlaySoundFromBlob = mockPlaySoundFromBlobAndWait;
vi.mock('@asaps/renderer', () => ({
  getAudioManager: vi.fn(() => ({
    playSoundFromBlob: mockPlaySoundFromBlobAndWait,
    playSoundFromBlobAndWait: mockPlaySoundFromBlobAndWait,
    playStreamingAudio: mockPlayStreamingAudio,
  })),
}));

function createMockProvider(overrides?: Partial<ITTSProvider>): ITTSProvider {
  return {
    name: 'mock-provider',
    requiresApiKey: false,
    configure: vi.fn(),
    isReady: vi.fn(() => true),
    synthesize: vi.fn(async () => ({ audio: null })),
    stop: vi.fn(),
    getVoices: vi.fn(async () => []),
    ...overrides,
  };
}

describe('TTSService', () => {
  let service: TTSService;

  beforeEach(() => {
    resetTTSService();
    service = new TTSService();
  });

  afterEach(() => {
    resetTTSService();
  });

  // -------------------------------------------------------------------------
  // Provider Registry
  // -------------------------------------------------------------------------
  describe('Provider Registry', () => {
    it('should register a provider', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      expect(service.getAvailableProviders()).toContain('mock-provider');
    });

    it('should set active provider', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      expect(service.getActiveProvider()).toBe(provider);
    });

    it('should throw when setting unregistered provider', () => {
      expect(() => service.setProvider('nonexistent')).toThrow(
        'TTS provider "nonexistent" not registered'
      );
    });

    it('should list multiple registered providers', () => {
      service.registerProvider(createMockProvider({ name: 'provider-a' }));
      service.registerProvider(createMockProvider({ name: 'provider-b' }));
      const providers = service.getAvailableProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain('provider-a');
      expect(providers).toContain('provider-b');
    });

    it('should return null active provider when none set', () => {
      expect(service.getActiveProvider()).toBeNull();
    });

    it('should report not ready without a provider', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should report ready when active provider is ready', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      expect(service.isReady()).toBe(true);
    });

    it('should report not ready when active provider is not ready', () => {
      const provider = createMockProvider({ isReady: vi.fn(() => false) });
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      expect(service.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  describe('Settings', () => {
    it('should toggle enabled state', () => {
      expect(service.isEnabled()).toBe(true);
      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
      service.setEnabled(true);
      expect(service.isEnabled()).toBe(true);
    });

    it('should stop speech when disabled', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      service.setEnabled(false);
      expect(provider.stop).toHaveBeenCalled();
    });

    it('should manage readPrompts setting', () => {
      expect(service.shouldReadPrompts()).toBe(false);
      service.setReadPrompts(true);
      expect(service.shouldReadPrompts()).toBe(true);
    });

    it('should manage language setting', () => {
      expect(service.getLanguage()).toBeNull();
      service.setLanguage('de');
      expect(service.getLanguage()).toBe('de');
      service.setLanguage(null);
      expect(service.getLanguage()).toBeNull();
    });

    it('should manage speaker voice configs', () => {
      const config: TTSVoiceConfig = { voiceId: 'onyx', rate: 0.9 };
      service.setSpeakerVoice('Inspector', config);
      expect(service.getSpeakerVoice('Inspector')).toEqual(config);
      expect(service.getSpeakerVoice('Unknown')).toBeUndefined();
    });

    it('should manage default voice config', () => {
      const config: TTSVoiceConfig = { voiceId: 'alloy' };
      service.setDefaultVoiceConfig(config);
      // Default config is used internally by speak() — tested below
    });
  });

  // -------------------------------------------------------------------------
  // Speak
  // -------------------------------------------------------------------------
  describe('speakSegments() — narration by the Narrator, quotes by the character', () => {
    it('speaks each piece in order with its own voice', async () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      service.setSpeakerVoice('Karin', { voiceId: 'karin-voice' } as any);
      service.setSpeakerVoice('Narrator', { voiceId: 'narrator-voice' } as any);
      await service.speakSegments([
        { text: 'She sits down.', speaker: 'Narrator' },
        { text: "I don't see why we're here.", speaker: 'Karin' },
      ], 'whole', 'Karin');
      const calls = (provider.synthesize as any).mock.calls.map((c: any[]) => [c[0], c[1].voiceId]);
      expect(calls).toEqual([['She sits down.', 'narrator-voice'], ["I don't see why we're here.", 'karin-voice']]);
    });

    it('a new line cancels the rest of a running sequence', async () => {
      let release: () => void = () => {};
      const provider = createMockProvider({
        synthesize: vi.fn(async () => { await new Promise<void>((r) => { release = r; }); return { audio: null }; }),
      });
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      const running = service.speakSegments([{ text: 'one' }, { text: 'two' }], 'one two');
      service.stop();
      release();
      await running;
      expect((provider.synthesize as any).mock.calls.map((c: any[]) => c[0])).toEqual(['one']);
    });

    it('Web Speech (no end signal) reads the line whole in the speaker voice', async () => {
      const provider = createMockProvider({ name: 'Web Speech' });
      service.registerProvider(provider);
      service.setProvider('Web Speech');
      await service.speakSegments([{ text: 'a', speaker: 'Narrator' }, { text: 'b', speaker: 'Karin' }], 'a "b"', 'Karin');
      expect((provider.synthesize as any).mock.calls.map((c: any[]) => c[0])).toEqual(['a "b"']);
    });
  });

  describe('speak()', () => {
    let provider: ITTSProvider;

    beforeEach(() => {
      provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
    });

    it('should call synthesize on the active provider', async () => {
      await service.speak('Hello world');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Hello world',
        expect.any(Object)
      );
    });

    it('should not speak when disabled', async () => {
      service.setEnabled(false);
      await service.speak('Hello');
      expect(provider.synthesize).not.toHaveBeenCalled();
    });

    it('should not speak when provider not ready', async () => {
      (provider.isReady as any).mockReturnValue(false);
      await service.speak('Hello');
      expect(provider.synthesize).not.toHaveBeenCalled();
    });

    it('should stop existing speech before starting new', async () => {
      await service.speak('Hello');
      expect(provider.stop).toHaveBeenCalled();
    });

    it('should use speaker-specific voice config', async () => {
      service.setSpeakerVoice('Guard', { voiceId: 'onyx', rate: 0.8 });
      await service.speak('Halt!', 'Guard');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Halt!',
        expect.objectContaining({ voiceId: 'onyx', rate: 0.8 })
      );
    });

    it('should merge default and speaker voice configs', async () => {
      service.setDefaultVoiceConfig({ volume: 0.5 });
      service.setSpeakerVoice('Guard', { voiceId: 'onyx' });
      await service.speak('Halt!', 'Guard');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Halt!',
        expect.objectContaining({ volume: 0.5, voiceId: 'onyx' })
      );
    });

    it('finds a speaker’s voice under a translated name', async () => {
      service.setSpeakerVoice('The Captain', { voiceId: 'onyx' });
      service.setSpeakerAliases({ 'Der Kapitän': 'The Captain' });
      await service.speak('Willkommen an Bord.', 'Der Kapitän');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Willkommen an Bord.',
        expect.objectContaining({ voiceId: 'onyx' })
      );
      expect(service.getSpeakerVoice('Der Kapitän')?.voiceId).toBe('onyx');
    });

    it('should override language when globally set', async () => {
      service.setLanguage('de');
      await service.speak('Hallo');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Hallo',
        expect.objectContaining({ lang: 'de' })
      );
    });

    describe('a line that arrives as one sound file', () => {
      class FakeAudio {
        static all: FakeAudio[] = [];
        volume = 1; paused = false; listeners: Record<string, () => void> = {};
        constructor(public src: string) { FakeAudio.all.push(this); }
        addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; }
        play() { return Promise.resolve(); }
        pause() { this.paused = true; }
      }
      const originalAudio = (globalThis as any).Audio;
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      const wav = new Blob(['audio'], { type: 'audio/wav' });

      beforeEach(() => {
        FakeAudio.all = [];
        (globalThis as any).Audio = FakeAudio;
        URL.createObjectURL = vi.fn(() => 'blob:line');
        URL.revokeObjectURL = vi.fn();
        (provider.synthesize as any).mockResolvedValue({ audio: wav });
      });
      afterEach(() => {
        (globalThis as any).Audio = originalAudio;
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      });
      const started = async (n: number) => { await vi.waitFor(() => expect(FakeAudio.all).toHaveLength(n)); return FakeAudio.all[n - 1]; };

      it('plays it and speaks until it ends', async () => {
        const speaking = service.speak('Hello');
        const audio = await started(1);
        expect(service.isSpeaking()).toBe(true);
        audio.listeners.ended();
        await speaking;
        expect(service.isSpeaking()).toBe(false);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:line');
      });

      it('is cut off by the next line instead of talking over it', async () => {
        const first = service.speak('One');
        const one = await started(1);
        const second = service.speak('Two');
        await first;
        expect(one.paused).toBe(true);
        const two = await started(2);
        expect(two.paused).toBe(false);
        two.listeners.ended();
        await second;
      });

      it('is cut off by stop()', async () => {
        const speaking = service.speak('Hello');
        const audio = await started(1);
        service.stop();
        await speaking;
        expect(audio.paused).toBe(true);
      });
    });

    it('should track isSpeaking state', async () => {
      let resolveSynthesize: (v: TTSSynthesisResult) => void;
      (provider.synthesize as any).mockImplementation(() =>
        new Promise<TTSSynthesisResult>(resolve => { resolveSynthesize = resolve; })
      );

      expect(service.isSpeaking()).toBe(false);
      const speakPromise = service.speak('Hello');
      // isSpeaking should be true during synthesis
      expect(service.isSpeaking()).toBe(true);

      resolveSynthesize!({ audio: null });
      await speakPromise;
      expect(service.isSpeaking()).toBe(false);
    });

    it('should set isSpeaking to false on error', async () => {
      (provider.synthesize as any).mockRejectedValue(new Error('Synthesis failed'));
      await service.speak('Hello');
      expect(service.isSpeaking()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // speakPrompt
  // -------------------------------------------------------------------------
  describe('a line the provider cannot read', () => {
    let spoken: SpeechSynthesisUtterance[];
    const original = (window as any).speechSynthesis;
    const originalUtterance = (window as any).SpeechSynthesisUtterance;

    beforeEach(() => {
      spoken = [];
      (window as any).SpeechSynthesisUtterance = class { lang = ''; voice = null; constructor(public text: string) {} };
      (window as any).speechSynthesis = {
        cancel: vi.fn(),
        getVoices: () => [{ voiceURI: 'Anna', name: 'Anna', lang: 'de-DE', localService: true, default: false }],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        speak: (u: any) => { spoken.push(u); u.onend?.(); },
      };
    });

    afterEach(() => {
      (window as any).speechSynthesis = original;
      (window as any).SpeechSynthesisUtterance = originalUtterance;
    });

    const unavailable = () => Object.assign(new Error('no German'), { name: 'TTSUnavailableError' });

    it('is read with the browser voice, in the line language', async () => {
      const provider = createMockProvider({ synthesize: vi.fn(async () => { throw unavailable(); }) });
      service.registerProvider(provider);
      service.setProvider(provider.name);
      service.setLanguage('de');
      service.setDefaultVoiceConfig({ voiceId: 'am_adam' });

      await service.speak('Guten Tag');

      expect(spoken).toHaveLength(1);
      expect(spoken[0].text).toBe('Guten Tag');
      expect(spoken[0].lang).toBe('de');
      expect((spoken[0].voice as any)?.name).toBe('Anna');
    });

    it('tells the author once when a server is down, and again after it has answered in between', async () => {
      const { notify } = await import('../../../utils/notify');
      const warn = vi.spyOn(notify, 'warning').mockImplementation(() => undefined as any);
      const down = () => Object.assign(new Error("The local speech server can't be reached at http://localhost:4123"), { name: 'TTSUnavailableError', unexpected: true });
      let fail = true;
      const provider = createMockProvider({ synthesize: vi.fn(async () => { if (fail) throw down(); return { audio: null }; }) });
      service.registerProvider(provider);
      service.setProvider(provider.name);

      await service.speak('One');
      await service.speak('Two');
      expect(spoken.map((u) => u.text)).toEqual(['One', 'Two']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/can't be reached.*browser's voice/);

      fail = false; await service.speak('Three');
      fail = true; await service.speak('Four');
      expect(warn).toHaveBeenCalledTimes(2);

      // A language the provider doesn't have is by design: no notice.
      warn.mockClear();
      const quiet = createMockProvider({ name: 'quiet', synthesize: vi.fn(async () => { throw unavailable(); }) });
      service.registerProvider(quiet);
      service.setProvider('quiet');
      await service.speak('Fünf');
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('stays silent for any other error', async () => {
      const provider = createMockProvider({ synthesize: vi.fn(async () => { throw new Error('401'); }) });
      service.registerProvider(provider);
      service.setProvider(provider.name);

      await service.speak('Hello');

      expect(spoken).toHaveLength(0);
    });
  });

  describe('speakPrompt()', () => {
    let provider: ITTSProvider;

    beforeEach(() => {
      provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
    });

    it('should not speak prompts when readPrompts is false', async () => {
      service.setReadPrompts(false);
      await service.speakPrompt('Choose a path');
      expect(provider.synthesize).not.toHaveBeenCalled();
    });

    it('should speak prompts when readPrompts is true', async () => {
      service.setReadPrompts(true);
      await service.speakPrompt('Choose a path');
      expect(provider.synthesize).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stop
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('should call stop on active provider', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-provider');
      service.stop();
      expect(provider.stop).toHaveBeenCalled();
    });

    it('should set isSpeaking to false', () => {
      service.stop();
      expect(service.isSpeaking()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------
  describe('Singleton', () => {
    it('should return same instance', () => {
      resetTTSService();
      const a = getTTSService();
      const b = getTTSService();
      expect(a).toBe(b);
    });

    it('should create new instance after reset', () => {
      const a = getTTSService();
      resetTTSService();
      const b = getTTSService();
      expect(a).not.toBe(b);
    });
  });
});
