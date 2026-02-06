// Main exports for @asaps/player
import type { IRenderer } from '@asaps/core';
import { PlayerEngine } from './PlayerEngine';

// Core player engine
export { PlayerEngine };
export type { PlayerConfig, PlayerEvents } from './PlayerEngine';

// Save system
export { SaveSystem } from './SaveSystem';
export type { SaveSlot, ISaveStorageAdapter, SaveSystemConfig } from './SaveSystem';

// Storage adapters
export { WebSaveAdapter } from './storage/WebSaveAdapter';

// Asset resolution
export { AssetResolver } from './AssetResolver';
export type { AssetInfo, LoadedAsset } from './AssetResolver';

// UI Components
export { PlayerUI } from './PlayerUI';
export type { PlayerUIConfig, PlayerSettings } from './PlayerUI';

// Screenshot utility
export { captureScreenshot, createPlaceholderThumbnail } from './utils/screenshot';
export type { ScreenshotOptions } from './utils/screenshot';

// Re-export useful types from core
export type { SerializedStoryState, IRenderer } from '@asaps/core';

// Package info
export const version = '1.0.0';
export const name = 'ASAPS Player';

/**
 * Create a player instance with default configuration
 * Convenience function for quick setup
 */
export function createPlayer(
  container: HTMLElement,
  renderer: IRenderer
): PlayerEngine {
  return new PlayerEngine({
    container,
    renderer,
  });
}
