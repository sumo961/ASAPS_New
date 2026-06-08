/**
 * AudioManager Tests
 * Tests audio playback functionality and Web Audio API integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioManager, getAudioManager, disposeAudioManager } from '../../src/audio/AudioManager';

describe('AudioManager', () => {
  let audioManager: AudioManager;

  beforeEach(() => {
    // Mock Web Audio API. Two vitest-4 changes are at play:
    //   1. global.X = ... no longer aliases to window.X in jsdom;
    //      we use vi.stubGlobal which patches both slots.
    //   2. vi.fn().mockImplementation(() => ...) returns an arrow,
    //      which isn't `new`-able. AudioManager calls
    //      `new AudioContext()`, so the implementation must be a
    //      regular function expression that can be constructed.
    vi.stubGlobal('AudioContext', vi.fn(function () {
      return {
        createGain: vi.fn().mockReturnValue({
          gain: { value: 0.7 },
          connect: vi.fn(),
        }),
        createBufferSource: vi.fn().mockReturnValue({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          onended: null,
        }),
        decodeAudioData: vi.fn().mockResolvedValue({}),
        destination: {},
        state: 'running',
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }));

    audioManager = new AudioManager();
  });

  afterEach(() => {
    audioManager.dispose();
    vi.clearAllMocks();
    // Vitest 4: stubGlobal-installed globals persist across tests
    // unless we explicitly tear them down. Restores `fetch` to the
    // jsdom-vended impl between tests so we don't leak mocks.
    vi.unstubAllGlobals();
  });

  describe('Initialization', () => {
    it('should create AudioManager with default options', () => {
      const manager = new AudioManager();
      expect(manager).toBeDefined();
      expect(manager.getMasterVolume()).toBe(0.7);
    });

    it('should create AudioManager with custom master volume', () => {
      const manager = new AudioManager({ masterVolume: 0.5 });
      expect(manager.getMasterVolume()).toBe(0.5);
      manager.dispose();
    });

    it('should create AudioManager with preload disabled', () => {
      const manager = new AudioManager({ preloadSounds: false });
      expect(manager).toBeDefined();
      manager.dispose();
    });

    it('should check if audio is available', () => {
      expect(audioManager.isAvailable()).toBe(true);
    });
  });

  describe('Master Volume', () => {
    it('should set master volume within valid range', () => {
      audioManager.setMasterVolume(0.8);
      expect(audioManager.getMasterVolume()).toBe(0.8);
    });

    it('should clamp master volume to minimum 0', () => {
      audioManager.setMasterVolume(-0.5);
      expect(audioManager.getMasterVolume()).toBe(0);
    });

    it('should clamp master volume to maximum 1', () => {
      audioManager.setMasterVolume(1.5);
      expect(audioManager.getMasterVolume()).toBe(1);
    });

    it('should get master volume', () => {
      const volume = audioManager.getMasterVolume();
      expect(volume).toBeGreaterThanOrEqual(0);
      expect(volume).toBeLessThanOrEqual(1);
    });
  });

  describe('Sound Preloading', () => {
    it('should preload sound from URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      await audioManager.preloadSound('https://example.com/sound.mp3');
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/sound.mp3');
    });

    it('should preload multiple sounds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      const urls = [
        'https://example.com/sound1.mp3',
        'https://example.com/sound2.mp3',
        'https://example.com/sound3.mp3',
      ];

      await audioManager.preloadSounds(urls);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not preload same sound twice', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      await audioManager.preloadSound('https://example.com/sound.mp3');
      await audioManager.preloadSound('https://example.com/sound.mp3');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle preload errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      // Should not throw
      await expect(audioManager.preloadSound('https://example.com/sound.mp3')).resolves.toBeUndefined();
    });
  });

  describe('Sound Playback', () => {
    it('should play sound with default volume', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      await audioManager.playSound('https://example.com/sound.mp3');
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/sound.mp3');
    });

    it('should play sound with custom volume', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      await audioManager.playSound('https://example.com/sound.mp3', 0.5);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/sound.mp3');
    });

    it('should handle playback errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Playback error'));
      vi.stubGlobal('fetch', mockFetch);

      // Should not throw
      await expect(audioManager.playSound('https://example.com/sound.mp3')).resolves.toBeUndefined();
    });

    it('should play sound with preset', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      });
      vi.stubGlobal('fetch', mockFetch);

      await audioManager.playSoundWithPreset('click', 'https://example.com/click.mp3', 0.8);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/click.mp3');
    });
  });

  describe('Sound Control', () => {
    it('should stop all sounds', () => {
      // Should not throw
      expect(() => audioManager.stopAllSounds()).not.toThrow();
    });

    it('should dispose of audio resources', () => {
      // Should not throw
      expect(() => audioManager.dispose()).not.toThrow();
    });
  });

  describe('Global Singleton', () => {
    it('should get global AudioManager instance', () => {
      const manager1 = getAudioManager();
      const manager2 = getAudioManager();
      expect(manager1).toBe(manager2);
    });

    it('should dispose global AudioManager', () => {
      getAudioManager();
      expect(() => disposeAudioManager()).not.toThrow();
    });

    it('should create new instance after disposal', () => {
      const manager1 = getAudioManager();
      disposeAudioManager();
      const manager2 = getAudioManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Volume Validation', () => {
    it('should validate volume is clamped between 0 and 1', () => {
      const testCases = [
        { input: -1, expected: 0 },
        { input: 0, expected: 0 },
        { input: 0.5, expected: 0.5 },
        { input: 1, expected: 1 },
        { input: 2, expected: 1 },
      ];

      testCases.forEach(({ input, expected }) => {
        audioManager.setMasterVolume(input);
        expect(audioManager.getMasterVolume()).toBe(expected);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing AudioContext gracefully', () => {
      const originalAudioContext = global.AudioContext;
      delete (global as any).AudioContext;

      const manager = new AudioManager();
      expect(manager.isAvailable()).toBe(false);

      global.AudioContext = originalAudioContext;
      manager.dispose();
    });

    it('should handle audio context initialization failure', () => {
      const originalAudioContext = global.AudioContext;
      global.AudioContext = vi.fn().mockImplementation(() => {
        throw new Error('AudioContext creation failed');
      }) as any;

      const manager = new AudioManager();
      // Should not throw, error is caught internally
      expect(manager).toBeDefined();

      global.AudioContext = originalAudioContext;
      manager.dispose();
    });
  });
});
