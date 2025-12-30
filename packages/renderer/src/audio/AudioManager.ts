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

/**
 * Tracked sound with its gain node for fade control
 */
interface TrackedSound {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  url: string;
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private masterVolume: number;
  private shouldPreloadSounds: boolean;
  private muted: boolean = false;

  // Tracked sounds by category for proper lifecycle management
  private currentBeatSound: TrackedSound | null = null;
  private currentClusterSound: TrackedSound | null = null;
  private currentClusterId: string | null = null;

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
   * Play a sound directly from a Blob (avoids fetch, works with IndexedDB-stored assets)
   * @param blob - Audio blob data
   * @param volume - Volume level (0-1), defaults to 1.0
   * @param loop - Whether to loop the sound (for background music), defaults to false
   * @param cacheKey - Optional key to cache the decoded buffer for reuse
   */
  async playSoundFromBlob(blob: Blob, volume: number = 1.0, loop: boolean = false, cacheKey?: string): Promise<void> {
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

      // Check cache first if cacheKey provided
      let buffer = cacheKey ? this.soundBuffers.get(cacheKey) : undefined;

      if (!buffer) {
        // Decode directly from blob's array buffer
        const arrayBuffer = await blob.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Cache if key provided
        if (cacheKey && this.shouldPreloadSounds) {
          this.soundBuffers.set(cacheKey, buffer);
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
      console.log('[AudioManager] Playing sound from blob successfully');
    } catch (error) {
      console.error('[AudioManager] Error playing sound from blob:', error);
    }
  }

  /**
   * Play a sound with a preset (reads volume from preset)
   */
  async playSoundWithPreset(soundId: string, soundUrl: string, presetVolume?: number): Promise<void> {
    await this.playSound(soundUrl, presetVolume ?? 1.0);
  }

  /**
   * Play a sound from a Blob and wait for it to finish before resolving
   * Used for button sounds that need to complete before transitioning to the next beat
   * @param blob - Audio blob data
   * @param volume - Volume level (0-1), defaults to 1.0
   * @param cacheKey - Optional key to cache the decoded buffer for reuse
   * @returns Promise that resolves when sound finishes playing
   */
  async playSoundFromBlobAndWait(blob: Blob, volume: number = 1.0, cacheKey?: string): Promise<void> {
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

      // Check cache first if cacheKey provided
      let buffer = cacheKey ? this.soundBuffers.get(cacheKey) : undefined;

      if (!buffer) {
        // Decode directly from blob's array buffer
        const arrayBuffer = await blob.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Cache if key provided
        if (cacheKey && this.shouldPreloadSounds) {
          this.soundBuffers.set(cacheKey, buffer);
        }
      }

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = false; // Never loop for wait-for-completion sounds

      // Create gain node for this sound
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));

      // Connect: source -> gain -> master gain -> destination
      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      // Track active source
      this.activeSourceNodes.add(source);

      // Return a promise that resolves when the sound ends
      return new Promise<void>((resolve) => {
        source.onended = () => {
          this.activeSourceNodes.delete(source);
          resolve();
        };

        // Play the sound
        source.start(0);
        console.log('[AudioManager] Playing sound from blob (waiting for completion)');
      });
    } catch (error) {
      console.error('[AudioManager] Error playing sound from blob:', error);
      // Resolve anyway to not block UI
      return;
    }
  }

  /**
   * Play a sound and wait for it to finish before resolving
   * Used for button sounds that need to complete before transitioning to the next beat
   * @param url - URL of the sound file
   * @param volume - Volume level (0-1), defaults to 1.0
   * @returns Promise that resolves when sound finishes playing
   */
  async playSoundAndWait(url: string, volume: number = 1.0): Promise<void> {
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
      source.loop = false; // Never loop for wait-for-completion sounds

      // Create gain node for this sound
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));

      // Connect: source -> gain -> master gain -> destination
      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      // Track active source
      this.activeSourceNodes.add(source);

      // Return a promise that resolves when the sound ends
      return new Promise<void>((resolve) => {
        source.onended = () => {
          this.activeSourceNodes.delete(source);
          resolve();
        };

        // Play the sound
        source.start(0);
      });
    } catch (error) {
      console.error(`[AudioManager] Error playing sound ${url}:`, error);
      // Resolve anyway to not block UI
      return;
    }
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
    this.currentBeatSound = null;
    this.currentClusterSound = null;
    this.currentClusterId = null;
  }

  /**
   * Play a beat-level sound (stops when leaving the beat)
   * Automatically stops any previously playing beat sound
   */
  async playBeatSound(url: string, volume: number = 1.0, loop: boolean = false, fadeOutMs: number = 200): Promise<void> {
    // Stop previous beat sound with fade
    this.stopBeatSound(fadeOutMs);

    if (this.muted || !url) return;

    this.initAudioContext();
    if (!this.audioContext || !this.masterGainNode) return;

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      let buffer = this.soundBuffers.get(url);
      if (!buffer) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        if (this.shouldPreloadSounds) {
          this.soundBuffers.set(url, buffer);
        }
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));

      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      this.activeSourceNodes.add(source);
      source.onended = () => {
        this.activeSourceNodes.delete(source);
        if (this.currentBeatSound?.source === source) {
          this.currentBeatSound = null;
        }
      };

      this.currentBeatSound = { source, gainNode, url };
      source.start(0);
      console.log(`[AudioManager] Started beat sound: ${url}`);
    } catch (error) {
      console.error(`[AudioManager] Error playing beat sound ${url}:`, error);
    }
  }

  /**
   * Play a beat-level sound from a Blob (stops when leaving the beat)
   * Automatically stops any previously playing beat sound
   */
  async playBeatSoundFromBlob(blob: Blob, volume: number = 1.0, loop: boolean = false, cacheKey?: string, fadeOutMs: number = 200): Promise<void> {
    // Stop previous beat sound with fade
    this.stopBeatSound(fadeOutMs);

    if (this.muted) return;

    this.initAudioContext();
    if (!this.audioContext || !this.masterGainNode) return;

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Check cache first if cacheKey provided
      let buffer = cacheKey ? this.soundBuffers.get(cacheKey) : undefined;
      if (!buffer) {
        const arrayBuffer = await blob.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        if (cacheKey && this.shouldPreloadSounds) {
          this.soundBuffers.set(cacheKey, buffer);
        }
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, volume));

      source.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      this.activeSourceNodes.add(source);
      source.onended = () => {
        this.activeSourceNodes.delete(source);
        if (this.currentBeatSound?.source === source) {
          this.currentBeatSound = null;
        }
      };

      this.currentBeatSound = { source, gainNode, url: cacheKey || 'blob' };
      source.start(0);
      console.log(`[AudioManager] Started beat sound from blob (cacheKey: ${cacheKey || 'none'})`);
    } catch (error) {
      console.error('[AudioManager] Error playing beat sound from blob:', error);
    }
  }

  /**
   * Stop the current beat sound with optional fade out
   */
  stopBeatSound(fadeOutMs: number = 200): void {
    if (!this.currentBeatSound) return;

    const { source, gainNode } = this.currentBeatSound;

    try {
      if (fadeOutMs > 0 && this.audioContext) {
        // Fade out before stopping
        const currentTime = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeOutMs / 1000);

        // Stop after fade completes
        setTimeout(() => {
          try {
            source.stop();
          } catch (e) {
            // Already stopped
          }
        }, fadeOutMs);
      } else {
        source.stop();
      }
    } catch (e) {
      // Source may have already stopped
    }

    this.activeSourceNodes.delete(source);
    this.currentBeatSound = null;
    console.log('[AudioManager] Stopped beat sound');
  }

  /**
   * Play a cluster-level sound (persists across beats within the same cluster)
   * Only changes if entering a different cluster
   * @param clusterId - The cluster ID (null for no cluster)
   * @param source - Sound URL or Blob (null to stop cluster sound)
   * @param volume - Volume level (0-1)
   */
  async playClusterSound(clusterId: string | null, source: string | Blob | null, volume: number = 0.5): Promise<void> {
    // If same cluster, don't restart the sound
    if (clusterId === this.currentClusterId) {
      return;
    }

    // Stop previous cluster sound
    this.stopClusterSound(500); // Longer fade for ambient sounds

    this.currentClusterId = clusterId;

    if (!source || !clusterId || this.muted) return;

    this.initAudioContext();
    if (!this.audioContext || !this.masterGainNode) return;

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      let buffer: AudioBuffer | undefined;
      const cacheKey = typeof source === 'string' ? source : clusterId;

      buffer = this.soundBuffers.get(cacheKey);
      if (!buffer) {
        let arrayBuffer: ArrayBuffer;
        if (source instanceof Blob) {
          arrayBuffer = await source.arrayBuffer();
        } else {
          const response = await fetch(source);
          arrayBuffer = await response.arrayBuffer();
        }
        buffer = await this.audioContext.decodeAudioData(arrayBuffer);
        if (this.shouldPreloadSounds) {
          this.soundBuffers.set(cacheKey, buffer);
        }
      }

      const bufferSource = this.audioContext.createBufferSource();
      bufferSource.buffer = buffer;
      bufferSource.loop = true; // Cluster sounds always loop

      const gainNode = this.audioContext.createGain();
      // Fade in
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, volume)),
        this.audioContext.currentTime + 0.5
      );

      bufferSource.connect(gainNode);
      gainNode.connect(this.masterGainNode);

      this.activeSourceNodes.add(bufferSource);
      bufferSource.onended = () => {
        this.activeSourceNodes.delete(bufferSource);
        if (this.currentClusterSound?.source === bufferSource) {
          this.currentClusterSound = null;
        }
      };

      this.currentClusterSound = { source: bufferSource, gainNode, url: cacheKey };
      bufferSource.start(0);
      console.log(`[AudioManager] Started cluster sound for "${clusterId}"`);
    } catch (error) {
      console.error(`[AudioManager] Error playing cluster sound:`, error);
    }
  }

  /**
   * Stop the current cluster sound with fade out
   */
  stopClusterSound(fadeOutMs: number = 500): void {
    if (!this.currentClusterSound) return;

    const { source, gainNode } = this.currentClusterSound;

    try {
      if (fadeOutMs > 0 && this.audioContext) {
        const currentTime = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeOutMs / 1000);

        setTimeout(() => {
          try {
            source.stop();
          } catch (e) {
            // Already stopped
          }
        }, fadeOutMs);
      } else {
        source.stop();
      }
    } catch (e) {
      // Source may have already stopped
    }

    this.activeSourceNodes.delete(source);
    this.currentClusterSound = null;
    console.log('[AudioManager] Stopped cluster sound');
  }

  /**
   * Get the current cluster ID for sound tracking
   */
  getCurrentClusterId(): string | null {
    return this.currentClusterId;
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
