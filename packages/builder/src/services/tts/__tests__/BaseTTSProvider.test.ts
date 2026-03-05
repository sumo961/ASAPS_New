import { describe, it, expect, vi } from 'vitest';
import { BaseTTSProvider } from '../BaseTTSProvider';
import type { TTSVoiceConfig, TTSVoiceInfo, TTSSynthesisResult } from '../../../types/tts';

// Concrete implementation for testing the abstract class
class TestProvider extends BaseTTSProvider {
  readonly name = 'Test Provider';
  readonly requiresApiKey = true;

  async synthesize(_text: string, _voiceConfig?: TTSVoiceConfig): Promise<TTSSynthesisResult> {
    this.ensureReady();
    return { audio: null };
  }

  stop(): void {}

  async getVoices(_lang?: string): Promise<TTSVoiceInfo[]> {
    return [];
  }

  // Expose protected method for testing
  public testEnsureReady(): void {
    this.ensureReady();
  }
}

class NoKeyProvider extends BaseTTSProvider {
  readonly name = 'No Key Provider';
  readonly requiresApiKey = false;

  async synthesize(): Promise<TTSSynthesisResult> { return { audio: null }; }
  stop(): void {}
  async getVoices(): Promise<TTSVoiceInfo[]> { return []; }
}

describe('BaseTTSProvider', () => {
  describe('configure()', () => {
    it('should set ready when config is valid', () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai', apiKey: 'sk-test' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without API key when required', () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with empty API key when required', () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai', apiKey: '' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with whitespace-only API key', () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai', apiKey: '   ' });
      expect(provider.isReady()).toBe(false);
    });

    it('should be ready without API key when not required', () => {
      const provider = new NoKeyProvider();
      provider.configure({ provider: 'web-speech' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without provider type', () => {
      const provider = new NoKeyProvider();
      provider.configure({ provider: '' as any });
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('isReady()', () => {
    it('should return false before configure', () => {
      const provider = new TestProvider();
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('ensureReady()', () => {
    it('should throw when not configured', () => {
      const provider = new TestProvider();
      expect(() => provider.testEnsureReady()).toThrow(
        'Test Provider TTS provider is not configured. Call configure() first.'
      );
    });

    it('should not throw when configured', () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai', apiKey: 'sk-test' });
      expect(() => provider.testEnsureReady()).not.toThrow();
    });
  });

  describe('synthesize() via ensureReady guard', () => {
    it('should throw if synthesize called before configure', async () => {
      const provider = new TestProvider();
      await expect(provider.synthesize('hello')).rejects.toThrow('not configured');
    });

    it('should succeed when configured', async () => {
      const provider = new TestProvider();
      provider.configure({ provider: 'openai', apiKey: 'sk-test' });
      const result = await provider.synthesize('hello');
      expect(result.audio).toBeNull();
    });
  });
});
