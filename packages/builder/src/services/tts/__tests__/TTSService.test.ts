import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TTSService, getTTSService, resetTTSService } from '../TTSService';
import type { ITTSProvider, TTSVoiceConfig, TTSSynthesisResult } from '../../../types/tts';

// Shared mock AudioManager so we can inspect calls
const mockPlaySoundFromBlob = vi.fn().mockResolvedValue(undefined);
vi.mock('@asaps/renderer', () => ({
  getAudioManager: vi.fn(() => ({
    playSoundFromBlob: mockPlaySoundFromBlob,
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

    it('should override language when globally set', async () => {
      service.setLanguage('de');
      await service.speak('Hallo');
      expect(provider.synthesize).toHaveBeenCalledWith(
        'Hallo',
        expect.objectContaining({ lang: 'de' })
      );
    });

    it('should play audio blob through AudioManager for cloud providers', async () => {
      mockPlaySoundFromBlob.mockClear();
      const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' });
      (provider.synthesize as any).mockResolvedValue({ audio: mockBlob });

      await service.speak('Hello');

      expect(mockPlaySoundFromBlob).toHaveBeenCalledWith(mockBlob, 1.0);
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
