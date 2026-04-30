export { BaseRenderer } from './renderers/BaseRenderer';
export { ReactRenderer } from './renderers/ReactRenderer';
export { EditableReactRenderer, type EditCallbacks } from './renderers/EditableReactRenderer';
export { WebRenderer } from './renderers/WebRenderer';
export type { RenderContext, RenderOptions, RenderTheme, AssetCache } from './types';

// Mood-pad HUD widget — exported so PreviewWindow / standalone player
// can mount screen-docked HUDs as a top-level overlay independent of
// stage character placement.
export {
  CharacterMoodFrame,
  DEFAULT_MOOD_FRAME_CONFIG,
  type MoodFrameConfig as RendererMoodFrameConfig,
  type MoodFrameEmotionMarker,
} from './components/CharacterMoodFrame';

// Export from components/index for cleaner resolution
export {
  PositionedBeatView,
  createPositionedElementData,
  calculateSmartTextBoxDimensions,
  calculateSmartButtonDimensions,
  adjustElementsForCollisions,
  type PositionedBeatViewProps,
  type PositionedElementData,
  type RenderThemeSettings
} from './components';

// Export chat dialog view
export {
  ChatDialogView,
  type ChatDialogViewProps,
  type ChatMessage
} from './components';

// Export audio manager
export { AudioManager, getAudioManager, disposeAudioManager, type AudioManagerOptions } from './audio/AudioManager';

// Export animation engine
export { AnimationEngine, AnimationManager, getAnimationManager, disposeAnimationManager } from './animation/AnimationEngine';
export * from './animation/PathInterpolator';

// Export panorama view component
export { PanoramaView, type PanoramaViewProps, type PanoramaHotspotData, type PanoramaViewerApi } from './components/PanoramaView';

// Export mobile detection utilities
export { isMobileDevice, getDeviceScalingInfo, type DeviceScalingInfo } from './utils/mobileDetection';

// Export markdown-lite renderer
export { renderMarkdownLite } from './utils/markdownLite';
