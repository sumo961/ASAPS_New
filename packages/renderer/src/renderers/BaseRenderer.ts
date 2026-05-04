import type { IRenderer, RenderContext, RenderTheme, AssetCache, RenderOptions } from '../types';
import type { Transition, Sound, Location } from '@asaps/core';
import { getAudioManager } from '../audio/AudioManager';
import { buildSensorAdapter } from '../audio/sensorAdapter';

export abstract class BaseRenderer implements IRenderer {
  protected context: RenderContext;
  protected assetCache: AssetCache;
  protected options: RenderOptions;
  protected state: Map<string, any> = new Map();
  private stateListeners: Map<string, Set<(value: any) => void>> = new Map();
  protected soundBlobResolver: ((assetId: string) => Promise<Blob | null>) | null = null;
  /**
   * Active spatial-sound teardown for the current beat. When a sound
   * with `spatialPosition` is playing, this holds the unsubscribe
   * returned by AudioManager.playSpatialSound — calling it stops the
   * panner sound and tears down the sensor subscription. Cleared on
   * every stopBeatSound.
   */
  private spatialBeatSoundStop: (() => void) | null = null;
  /**
   * Object-URLs we minted for spatial sounds (assetId → blob → URL).
   * Revoked when the spatial sound stops to avoid leaking memory.
   */
  private spatialSoundObjectUrls: string[] = [];

  constructor(context: RenderContext, options: RenderOptions = {}) {
    this.context = context;
    this.options = {
      debug: false,
      animations: true,
      soundEnabled: true,
      fullscreen: false,
      ...options
    };
    
    this.assetCache = {
      images: new Map(),
      sounds: new Map(),
      videos: new Map()
    };

    this.initialize();
  }

  protected abstract initialize(): void;

  // Abstract methods that must be implemented by subclasses
  abstract renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void>;
  abstract renderText(text: string, buttonText: string, locations?: Location[]): Promise<void>;
  abstract renderDialog(speaker: string, text: string, emotion?: string): Promise<void>;
  abstract renderChoices(choices: { id: string; text: string }[]): Promise<string>;
  abstract renderMovement(question: string, choices: { id: string; text: string; location: string }[]): Promise<string>;
  abstract renderPropSelection(question: string, props: { id: string; name: string; description: string }[]): Promise<string>;
  abstract renderVideo(videoFile: string, autoplay: boolean, controls: boolean): Promise<void>;
  abstract renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<string>;
  abstract renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void>;
  abstract renderInputText(prompt: string, placeholder?: string, buttonText?: string, options?: {
    validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }): Promise<string>;
  abstract renderHyperText(data: {
    text: string;
    links: Array<{
      word: string;
      targetBeatId: string;
      style: {
        color: string;
        hoverColor: string;
        underline: boolean;
        bold: boolean;
      };
    }>;
    allowMultiple: boolean;
  }): Promise<string>;

  // Prepare transition - set initial hidden state before rendering
  // This should be called BEFORE the beat content is rendered
  prepareTransition(transition: Transition): void {
    if (!this.options.animations || transition.type === 'none') return;
    // Default implementation does nothing - subclasses override to set hidden state
  }

  // Shared transition implementation - animate to visible after rendering
  // This should be called AFTER the beat content is rendered
  async applyTransition(transition: Transition): Promise<void> {
    if (!this.options.animations) return;

    const duration = transition.duration || 500;

    switch (transition.type) {
      case 'fade':
        await this.fadeTransition(duration, transition.direction);
        break;
      case 'slide':
        await this.slideTransition(duration, transition.direction);
        break;
      case 'zoom':
        await this.zoomTransition(duration, transition.direction);
        break;
      case 'dissolve':
        await this.dissolveTransition(duration);
        break;
      default:
        // No transition
        break;
    }
  }

  protected async fadeTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    // Implementation depends on specific renderer
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  protected async slideTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  protected async zoomTransition(duration: number, direction?: 'in' | 'out' | 'both'): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  protected async dissolveTransition(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  // Default implementation for showChoices - returns a promise that never resolves
  async showChoices<TResult = string>(
    choices: { id: string; text: string; icon?: string }[],
    options?: { fadeIn?: boolean; duration?: number }
  ): Promise<TResult> {
    console.warn('BaseRenderer.showChoices(): Default implementation - this should be overridden by subclass');
    return new Promise(() => {}); // Never resolves by default
  }

  // Sound handling - Uses AudioManager for beat-level sounds
  // Beat sounds automatically stop when transitioning to another beat
  async playSound(sound: Sound): Promise<void> {
    if (!this.options.soundEnabled) return;
    if (!sound.file && !sound.assetId) return;

    try {
      const audioManager = getAudioManager();
      const volume = sound.volume ?? 1.0;
      const loop = sound.loop ?? false;

      // v0.9.48 / S4+ — spatial sound path. When the sound has a
      // spatialPosition (lat/lng or fixed azimuth), route through
      // AudioManager.playSpatialSound which inserts a Web Audio
      // PannerNode into the chain and subscribes to the SensorService
      // for live position / orientation updates. Falls back to the
      // standard beat-sound path silently if no SensorService is
      // available (e.g., in a context that didn't push it into state).
      if (sound.spatialPosition) {
        const sensorService = this.state.get('sensorService');
        if (sensorService) {
          // Resolve URL: prefer assetId-blob → object URL, else http URL.
          let url: string | null = null;
          if (sound.assetId && this.soundBlobResolver) {
            const blob = await this.soundBlobResolver(sound.assetId);
            if (blob) {
              url = URL.createObjectURL(blob);
              this.spatialSoundObjectUrls.push(url);
            }
          }
          if (!url && sound.file && sound.file.startsWith('http')) {
            url = sound.file;
          }
          if (url) {
            // Stop any prior spatial sound on this beat before starting a new one.
            this.stopSpatialBeatSound();
            const stop = await audioManager.playSpatialSound(
              url,
              sound.spatialPosition,
              { volume, loop },
              buildSensorAdapter(sensorService),
            );
            this.spatialBeatSoundStop = stop;
            return;
          }
          console.warn(`[BaseRenderer] Spatial sound has spatialPosition but no resolvable URL — falling back to non-spatial`);
        } else {
          console.warn(`[BaseRenderer] Spatial sound requested but no sensorService in renderer state — falling back to non-spatial`);
        }
      }

      // Prefer assetId for blob-based playback (works across sessions)
      if (sound.assetId && this.soundBlobResolver) {
        console.log(`[BaseRenderer] Loading beat sound from assetId: ${sound.assetId}`);
        const blob = await this.soundBlobResolver(sound.assetId);
        if (blob) {
          await audioManager.playBeatSoundFromBlob(blob, volume, loop, sound.assetId);
          return;
        }
        console.warn(`[BaseRenderer] Could not resolve sound assetId: ${sound.assetId}`);
      }

      // Fallback to file-based playback (for external URLs)
      if (sound.file && sound.file.startsWith('http')) {
        await audioManager.playBeatSound(sound.file, volume, loop);
        return;
      }

      console.warn(`[BaseRenderer] Cannot play beat sound - no valid assetId or URL: ${sound.file}`);
    } catch (error) {
      console.warn(`[BaseRenderer] Failed to play beat sound: ${sound.file}`, error);
    }
  }

  /**
   * Tear down the current spatial beat sound (sensor subscriptions +
   * audio nodes) and revoke any object-URLs minted for it. Idempotent
   * — safe to call when no spatial sound is active.
   */
  private stopSpatialBeatSound(): void {
    if (this.spatialBeatSoundStop) {
      try { this.spatialBeatSoundStop(); } catch { /* swallow */ }
      this.spatialBeatSoundStop = null;
    }
    if (this.spatialSoundObjectUrls.length > 0) {
      for (const url of this.spatialSoundObjectUrls) {
        try { URL.revokeObjectURL(url); } catch { /* swallow */ }
      }
      this.spatialSoundObjectUrls = [];
    }
  }

  // Set the sound blob resolver
  setSoundBlobResolver(resolver: (assetId: string) => Promise<Blob | null>): void {
    this.soundBlobResolver = resolver;
  }

  /**
   * Play or update cluster sound based on current cluster
   * Called during beat transition to handle cluster ambient sounds
   */
  async playClusterSound(clusterId: string | null, sound: Sound | null): Promise<void> {
    if (!this.options.soundEnabled) return;

    try {
      const audioManager = getAudioManager();

      // Try to resolve sound via assetId first
      let soundSource: string | Blob | null = null;
      if (sound?.assetId && this.soundBlobResolver) {
        soundSource = await this.soundBlobResolver(sound.assetId);
      }
      // Fallback to file URL if no blob resolved
      if (!soundSource && sound?.file && sound.file.startsWith('http')) {
        soundSource = sound.file;
      }

      await audioManager.playClusterSound(
        clusterId,
        soundSource,
        sound?.volume ?? 0.5
      );
    } catch (error) {
      console.warn(`[BaseRenderer] Failed to play cluster sound:`, error);
    }
  }

  /**
   * Stop the current beat sound (called when leaving a beat).
   * Tears down both the standard beat sound (managed by AudioManager)
   * and any active spatial sound + its sensor subscriptions.
   */
  stopBeatSound(): void {
    // Spatial sound first — has its own teardown chain that includes
    // sensor unsubscribes; doesn't go through AudioManager.stopBeatSound.
    this.stopSpatialBeatSound();
    try {
      const audioManager = getAudioManager();
      audioManager.stopBeatSound();
    } catch (error) {
      // AudioManager not available
    }
  }

  // Legacy sound handling for backwards compatibility - kept for non-beat sounds
  async playSoundLegacy(sound: Sound): Promise<void> {
    if (!this.options.soundEnabled) return;

    // Check global mute state from AudioManager
    try {
      const audioManager = getAudioManager();
      if (audioManager.isMuted()) {
        console.log('[BaseRenderer] Sound muted, skipping:', sound.file);
        return;
      }
    } catch (e) {
      // AudioManager not available, continue with playback
    }

    try {
      let audio = this.assetCache.sounds.get(sound.file);

      if (!audio) {
        audio = new Audio(sound.file);

        // Test if audio can be loaded
        await new Promise<void>((resolve, reject) => {
          audio!.addEventListener('canplaythrough', () => resolve(), { once: true });
          audio!.addEventListener('error', (e) => {
            console.warn(`Failed to load audio file: ${sound.file}`, e);
            reject(new Error(`Audio file not found: ${sound.file}`));
          }, { once: true });

          // Start loading
          audio!.load();

          // Timeout after 5 seconds
          setTimeout(() => reject(new Error(`Audio loading timeout: ${sound.file}`)), 5000);
        });

        this.assetCache.sounds.set(sound.file, audio);
      }

      audio.volume = sound.volume || 1.0;
      audio.loop = sound.loop || false;

      if (sound.fadeIn) {
        await this.fadeInAudio(audio, sound.fadeIn);
      } else {
        await audio.play().catch(err => {
          console.warn(`Failed to play audio: ${sound.file}`, err);
          // Don't throw - just log the error and continue
        });
      }

      if (sound.fadeOut && audio.duration) {
        const duration = audio.duration * 1000 - sound.fadeOut;
        setTimeout(() => this.fadeOutAudio(audio, sound.fadeOut!), duration);
      }
    } catch (error) {
      // Log the error but don't crash the preview
      console.warn(`Audio playback error for ${sound.file}:`, error);
      
      // Optionally show a non-blocking notification to the user
      if (this.options.debug) {
        console.log(`[Debug] Audio file "${sound.file}" could not be loaded. Continuing without sound.`);
      }
      
      // Continue execution without the sound
      return;
    }
  }

  protected async fadeInAudio(audio: HTMLAudioElement, duration: number): Promise<void> {
    audio.volume = 0;
    
    try {
      await audio.play();
      
      const steps = 20;
      const stepDuration = duration / steps;
      const volumeStep = 1 / steps;
      
      for (let i = 0; i <= steps; i++) {
        audio.volume = Math.min(1, i * volumeStep);
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
    } catch (err) {
      console.warn('Failed to fade in audio:', err);
    }
  }

  protected async fadeOutAudio(audio: HTMLAudioElement, duration: number): Promise<void> {
    try {
      const steps = 20;
      const stepDuration = duration / steps;
      const volumeStep = audio.volume / steps;
      
      for (let i = steps; i >= 0; i--) {
        audio.volume = Math.max(0, i * volumeStep);
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }
      
      audio.pause();
    } catch (err) {
      console.warn('Failed to fade out audio:', err);
    }
  }

  // User interaction
  async waitForUserInput(): Promise<void> {
    return new Promise(resolve => {
      const handler = () => {
        document.removeEventListener('click', handler);
        document.removeEventListener('keydown', handler);
        resolve();
      };
      
      document.addEventListener('click', handler);
      document.addEventListener('keydown', handler);
    });
  }

  // State management
  setState(key: string, value: any): void {
    this.state.set(key, value);
    // Notify listeners for this state key
    const listeners = this.stateListeners.get(key);
    if (listeners) {
      listeners.forEach(listener => listener(value));
    }
  }

  getState(key: string): any {
    return this.state.get(key);
  }

  /**
   * Update the stage dimensions (called after loading a story with custom dimensions)
   */
  setStageDimensions(width: number, height: number): void {
    this.context.width = width;
    this.context.height = height;
  }

  /**
   * Register a listener for state changes on a specific key
   * Returns an unsubscribe function
   */
  onStateChange(key: string, listener: (value: any) => void): () => void {
    if (!this.stateListeners.has(key)) {
      this.stateListeners.set(key, new Set());
    }
    this.stateListeners.get(key)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.stateListeners.get(key);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.stateListeners.delete(key);
        }
      }
    };
  }

  clear(): void {
    // Clear any rendered content
    if (this.context.canvas) {
      const ctx = this.context.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, this.context.width, this.context.height);
      }
    }
    
    if (this.context.container) {
      this.context.container.innerHTML = '';
    }
    
    // Stop all sounds - wrap in try-catch for safety
    this.assetCache.sounds.forEach((audio: HTMLAudioElement) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (err) {
        // Ignore errors when stopping sounds
      }
    });
  }

  // Asset loading helpers with better error handling
  protected async loadImage(src: string): Promise<HTMLImageElement> {
    let img = this.assetCache.images.get(src);
    
    if (!img) {
      img = new Image();
      img.src = src;
      
      try {
        await new Promise((resolve, reject) => {
          img!.onload = resolve;
          img!.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        });
        this.assetCache.images.set(src, img);
      } catch (error) {
        console.warn(`Image loading error: ${src}`, error);
        // Return a placeholder or empty image
        img = new Image();
      }
    }
    
    return img;
  }

  protected async loadVideo(src: string): Promise<HTMLVideoElement> {
    let video = this.assetCache.videos.get(src);
    
    if (!video) {
      video = document.createElement('video');
      video.src = src;
      
      try {
        await new Promise((resolve, reject) => {
          video!.onloadedmetadata = resolve;
          video!.onerror = () => reject(new Error(`Failed to load video: ${src}`));
        });
        this.assetCache.videos.set(src, video);
      } catch (error) {
        console.warn(`Video loading error: ${src}`, error);
        // Return empty video element
        video = document.createElement('video');
      }
    }
    
    return video;
  }
}
