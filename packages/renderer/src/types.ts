import type { Beat, Transition, Sound, Location } from '@asaps/core';

// Re-export IRenderer from core to avoid circular dependencies
export type { IRenderer } from '@asaps/core';

export interface RenderContext {
  canvas?: HTMLCanvasElement;
  container?: HTMLElement;
  width: number;
  height: number;
  theme?: RenderTheme;
}

export interface RenderTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  borderRadius: number;
  padding: number;
}

export interface AssetCache {
  images: Map<string, HTMLImageElement>;
  sounds: Map<string, HTMLAudioElement>;
  videos: Map<string, HTMLVideoElement>;
}

export interface RenderOptions {
  debug?: boolean;
  animations?: boolean;
  soundEnabled?: boolean;
  fullscreen?: boolean;
}
