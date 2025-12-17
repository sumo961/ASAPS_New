/**
 * AudioManager
 *
 * Manages audio playback for UI sounds and effects.
 * Uses Web Audio API for better control and performance.
 */

export interface AudioManagerOptions {
  masterVolume?: number; // 0-1, default 0.7
  preloadSounds?: boolean; // Whether to preload sounds, default true
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private masterVolume: number;
  private shouldPreloadSounds: boolean;
  private muted: boolean = false;

  constructor(options: AudioManagerOptions = {}) {
    this.masterVolume = options.masterVolume ?? 0.7;
    this.shouldPreloadSounds = options.preloadSounds ?? true;

    // Initialize Web Audio API lazily on first play
  }

  /**
   * Initialize Audio Context (called on first play to comply with browser autoplay policies)
   */
  private initAudioContext(): void {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.masterVolume;
      this.masterGainNode.connect(this.audioContext.destination);
      console.log('[AudioManager] Audio context initialized');
    } catch (error) {
      console.error('[AudioManager] Failed to initialize audio context:', error);
    }
  }

  /**
   * Preload a sound from URL
   */
  async preloadSound(url: string): Promise<void> {
    if (!this.shouldPreloadSounds) return;
    if (this.soundBuffers.has(url)) return; // Already loaded

    this.initAudioContext();
    if (!this.audioContext) return;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.soundBuffers.set(url, audioBuffer);
      console.log(`[AudioManager] Preloaded sound: ${url}`);
    } catch (error) {
      console.error(`[AudioManager] Failed to preload sound ${url}:`, error);
    }
  }

  /**
   * Preload multiple sounds
   */
  async preloadSounds(urls: string[]): Promise<void> {
    await Promise.all(urls.map(url => this.preloadSound(url)));
  }

  /**
   * Play a sound from URL
   * @param url - URL of the sound file
   * @param volume - Volume level (0-1), defaults to 1.0
   * @param loop - Whether to loop the sound (for background music), defaults to false
   */
  async playSound(url: string, volume: number = 1.0, loop: boolean = false): Promise<void> {
    // Don't play if muted
    if (this.muted) {
      return;
    }

    this.initAudioContext();
    if (!this.audioContext || !this.masterGainNode) {
      console.warn('[AudioManager] Audio context not available');
      return;
    }

    try {
      // Resume audio context if suspended (common on mobile)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Get or load the sound buffer
      let buffer = this.soundBuffers.get(url);
      if (!buffer) {
        // Load on demand if not preloaded
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);

        if (this.shouldPreloadSounds) {
          this.soundBuffers.set(url, buffer);
        }
      }

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;

      // Create gain node for this sound
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));

      // Connect: source -> gain -> master gain -> destination
      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      // Track active source
      this.activeSourceNodes.add(source);

      // Remove from active set when done (only if not looping)
      source.onended = () => {
        this.activeSourceNodes.delete(source);
      };

      // Play the sound
      source.start(0);
    } catch (error) {
      console.error(`[AudioManager] Error playing sound ${url}:`, error);
    }
  }

  /**
   * Play a sound with a preset (reads volume from preset)
   */
  async playSoundWithPreset(soundId: string, soundUrl: string, presetVolume?: number): Promise<void> {
    await this.playSound(soundUrl, presetVolume ?? 1.0);
  }

  /**
   * Stop all currently playing sounds
   */
  stopAllSounds(): void {
    this.activeSourceNodes.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may have already stopped
      }
    });
    this.activeSourceNodes.clear();
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.masterVolume;
    }
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Set muted state - uses gain control to mute/unmute without stopping playback
   * This allows sounds to continue playing silently and resume when unmuted
   */
  setMuted(muted: boolean): void {
    this.muted = muted;

    // Use gain-based muting to pause/resume without stopping
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = muted ? 0 : this.masterVolume;
    }

    console.log(`[AudioManager] Sound ${muted ? 'muted' : 'unmuted'}`);
  }

  /**
   * Check if audio is muted
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Cleanup and dispose of audio resources
   */
  dispose(): void {
    this.stopAllSounds();
    this.soundBuffers.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGainNode = null;
    }
  }

  /**
   * Check if audio is available
   */
  isAvailable(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }
}

// Global singleton instance
let globalAudioManager: AudioManager | null = null;

/**
 * Get the global AudioManager instance
 */
export function getAudioManager(): AudioManager {
  if (!globalAudioManager) {
    globalAudioManager = new AudioManager();
  }
  return globalAudioManager;
}

/**
 * Dispose the global AudioManager
 */
export function disposeAudioManager(): void {
  if (globalAudioManager) {
    globalAudioManager.dispose();
    globalAudioManager = null;
  }
}
