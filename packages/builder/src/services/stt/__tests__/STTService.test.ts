import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STTService, getSTTService, resetSTTService } from '../STTService';
import type { ISTTProvider, STTListeningOptions, STTTranscriptionResult } from '../../../types/stt';

function createMockProvider(overrides?: Partial<ISTTProvider>): ISTTProvider {
  return {
    name: 'mock-stt',
    requiresApiKey: false,
    supportsStreaming: true,
    configure: vi.fn(),
    isReady: vi.fn(() => true),
    startListening: vi.fn(),
    stopListening: vi.fn(async () => ({ text: 'hello', isFinal: true })),
    transcribe: vi.fn(async () => ({ text: 'transcribed', isFinal: true })),
    isListening: vi.fn(() => false),
    ...overrides,
  };
}

describe('STTService', () => {
  let service: STTService;

  beforeEach(() => {
    resetSTTService();
    service = getSTTService();
  });

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------
  describe('Singleton', () => {
    it('should return same instance', () => {
      expect(getSTTService()).toBe(service);
    });

    it('should return new instance after reset', () => {
      resetSTTService();
      expect(getSTTService()).not.toBe(service);
    });
  });

  // -------------------------------------------------------------------------
  // Provider management
  // -------------------------------------------------------------------------
  describe('Provider management', () => {
    it('should register and set provider', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-stt');
      expect(service.getActiveProvider()).toBe(provider);
    });

    it('should throw when setting unregistered provider', () => {
      expect(() => service.setProvider('nonexistent')).toThrow('not registered');
    });

    it('should list available providers', () => {
      service.registerProvider(createMockProvider());
      service.registerProvider(createMockProvider({ name: 'another-stt' }));
      expect(service.getAvailableProviders()).toEqual(['mock-stt', 'another-stt']);
    });

    it('should return null active provider when none set', () => {
      expect(service.getActiveProvider()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Readiness
  // -------------------------------------------------------------------------
  describe('isReady()', () => {
    it('should be false with no provider', () => {
      expect(service.isReady()).toBe(false);
    });

    it('should be true when provider is ready', () => {
      service.registerProvider(createMockProvider());
      service.setProvider('mock-stt');
      expect(service.isReady()).toBe(true);
    });

    it('should be false when provider is not ready', () => {
      service.registerProvider(createMockProvider({ isReady: vi.fn(() => false) }));
      service.setProvider('mock-stt');
      expect(service.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  describe('Settings', () => {
    it('should manage enabled state', () => {
      expect(service.isEnabled()).toBe(true);
      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
    });

    it('should manage language', () => {
      expect(service.getLanguage()).toBeNull();
      service.setLanguage('de-DE');
      expect(service.getLanguage()).toBe('de-DE');
    });
  });

  // -------------------------------------------------------------------------
  // Listening
  // -------------------------------------------------------------------------
  describe('startListening()', () => {
    it('should delegate to active provider', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-stt');

      const options: STTListeningOptions = {
        onResult: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };
      service.startListening(options);

      expect(provider.startListening).toHaveBeenCalled();
    });

    it('should inject service language when not specified', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-stt');
      service.setLanguage('fr-FR');

      const options: STTListeningOptions = {
        onResult: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };
      service.startListening(options);

      const passedOptions = (provider.startListening as any).mock.calls[0][0];
      expect(passedOptions.language).toBe('fr-FR');
    });

    it('should call onError when no provider configured', () => {
      const onError = vi.fn();
      service.startListening({
        onResult: vi.fn(),
        onError,
        onEnd: vi.fn(),
      });
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should not start when disabled', () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-stt');
      service.setEnabled(false);

      service.startListening({
        onResult: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      });

      expect(provider.startListening).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Stop listening
  // -------------------------------------------------------------------------
  describe('stopListening()', () => {
    it('should return result from provider', async () => {
      const provider = createMockProvider({
        isListening: vi.fn(() => true),
      });
      service.registerProvider(provider);
      service.setProvider('mock-stt');

      const result = await service.stopListening();
      expect(result).toEqual({ text: 'hello', isFinal: true });
    });

    it('should return null when not listening', async () => {
      service.registerProvider(createMockProvider());
      service.setProvider('mock-stt');

      const result = await service.stopListening();
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Transcribe
  // -------------------------------------------------------------------------
  describe('transcribe()', () => {
    it('should delegate to provider', async () => {
      const provider = createMockProvider();
      service.registerProvider(provider);
      service.setProvider('mock-stt');

      const blob = new Blob(['audio'], { type: 'audio/webm' });
      const result = await service.transcribe(blob);

      expect(provider.transcribe).toHaveBeenCalledWith(blob, undefined);
      expect(result.text).toBe('transcribed');
    });

    it('should throw when no provider configured', async () => {
      const blob = new Blob(['audio']);
      await expect(service.transcribe(blob)).rejects.toThrow('not configured');
    });
  });

  // -------------------------------------------------------------------------
  // isListening
  // -------------------------------------------------------------------------
  describe('isListening()', () => {
    it('should return false with no provider', () => {
      expect(service.isListening()).toBe(false);
    });

    it('should delegate to provider', () => {
      service.registerProvider(createMockProvider({ isListening: vi.fn(() => true) }));
      service.setProvider('mock-stt');
      expect(service.isListening()).toBe(true);
    });
  });
});
