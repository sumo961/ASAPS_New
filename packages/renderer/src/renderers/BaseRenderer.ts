import type { IRenderer, RenderContext, RenderTheme, AssetCache, RenderOptions } from '../types';
import type { Transition, Sound, Location } from '@asaps/core';

export abstract class BaseRenderer implements IRenderer {
  protected context: RenderContext;
  protected assetCache: AssetCache;
  protected options: RenderOptions;
  protected state: Map<string, any> = new Map();

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
  abstract renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<void>;
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

  // Shared transition implementation
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

  // Sound handling - FIXED: Handle missing audio files gracefully
  async playSound(sound: Sound): Promise<void> {
    if (!this.options.soundEnabled) return;

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
  }

  getState(key: string): any {
    return this.state.get(key);
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
