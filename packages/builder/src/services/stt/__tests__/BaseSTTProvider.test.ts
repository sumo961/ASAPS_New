import { describe, it, expect, vi } from 'vitest';
import { BaseSTTProvider } from '../BaseSTTProvider';
import type { STTListeningOptions, STTTranscriptionResult } from '../../../types/stt';

// Concrete test implementation
class TestSTTProvider extends BaseSTTProvider {
  readonly name = 'Test STT';
  readonly requiresApiKey = true;
  readonly supportsStreaming = false;

  private _listening = false;

  startListening(_options: STTListeningOptions): void {
    this.ensureReady();
    this._listening = true;
  }

  async stopListening(): Promise<STTTranscriptionResult | null> {
    this._listening = false;
    return { text: 'test', isFinal: true };
  }

  async transcribe(_audio: Blob): Promise<STTTranscriptionResult> {
    this.ensureReady();
    return { text: 'transcribed', isFinal: true };
  }

  isListening(): boolean {
    return this._listening;
  }

  // Expose protected for testing
  public testEnsureReady(): void {
    this.ensureReady();
  }
}

describe('BaseSTTProvider', () => {
  describe('configure()', () => {
    it('should be ready with valid config', () => {
      const provider = new TestSTTProvider();
      provider.configure({ provider: 'whisper', apiKey: 'sk-test' });
      expect(provider.isReady()).toBe(true);
    });

    it('should not be ready without API key when required', () => {
      const provider = new TestSTTProvider();
      provider.configure({ provider: 'whisper' });
      expect(provider.isReady()).toBe(false);
    });

    it('should not be ready with empty API key', () => {
      const provider = new TestSTTProvider();
      provider.configure({ provider: 'whisper', apiKey: '   ' });
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('ensureReady()', () => {
    it('should throw when not configured', () => {
      const provider = new TestSTTProvider();
      expect(() => provider.testEnsureReady()).toThrow('not configured');
    });

    it('should not throw when configured', () => {
      const provider = new TestSTTProvider();
      provider.configure({ provider: 'whisper', apiKey: 'sk-test' });
      expect(() => provider.testEnsureReady()).not.toThrow();
    });
  });
});
