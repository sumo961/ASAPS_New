export { BaseRenderer } from './renderers/BaseRenderer';
export { ReactRenderer } from './renderers/ReactRenderer';
export { EditableReactRenderer, type EditCallbacks } from './renderers/EditableReactRenderer';
export { WebRenderer } from './renderers/WebRenderer';
export type { RenderContext, RenderOptions, RenderTheme, AssetCache } from './types';

// Export from components/index for cleaner resolution
export {
  PositionedBeatView,
  createPositionedElementData,
  type PositionedBeatViewProps,
  type PositionedElementData,
  type RenderThemeSettings
} from './components';

// Export audio manager
export { AudioManager, getAudioManager, disposeAudioManager, type AudioManagerOptions } from './audio/AudioManager';

// Export animation engine
export { AnimationEngine, AnimationManager, getAnimationManager, disposeAnimationManager } from './animation/AnimationEngine';
export * from './animation/PathInterpolator';

// Export mobile detection utilities
export { isMobileDevice, getDeviceScalingInfo, type DeviceScalingInfo } from './utils/mobileDetection';
