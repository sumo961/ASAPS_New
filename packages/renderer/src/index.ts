export { BaseRenderer } from './renderers/BaseRenderer';
export { ReactRenderer } from './renderers/ReactRenderer';
export { EditableReactRenderer, type EditCallbacks } from './renderers/EditableReactRenderer';
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
export {
  MoodToken,
  CharacterMoodToken,
  MoodRail,
  moodWord,
  type MoodRailEntry,
} from './components/CharacterMoodToken';
export {
  CharacterMeterFrame,
  type MeterFrameConfig,
  type MeterCounterData,
} from './components/CharacterMeterFrame';
export { CharacterInventoryFrame, type InventoryItemData } from './components/CharacterInventoryFrame';
export { layoutScreenHuds, placementMap, type HudBox, type HudPlacement, type HudCorner, type HudKind } from './utils/hudLayout';
export { beatSuppressesScreenHuds, HUD_FREE_BEAT_TYPES, type HudVisibilityOptions } from './utils/hudVisibility';
export { HudExplanationLayer, DEFAULT_HUD_CAPTIONS, type HudExplanationLayerProps } from './components/HudExplanationLayer';

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

// Responsive slot-mode rendering — exported so the Visual Editor can show
// a FAITHFUL preview of slot-mode beats (the real component) instead of a
// misleading pixel-positioned approximation, and reuse the schema-driven
// slot registry.
export { SlotFlowView } from './components/SlotFlowView';
export { SpatialFlowView, imageRectInsets, imageRectPx } from './components/SpatialFlowView';
export { OrientationGate, type OrientationPolicy } from './components/OrientationGate';
export {
  isSlotModeBeatType,
  getSlotSpec,
  shouldUseSlotMode,
  isSpatialModeBeatType,
  getSpatialSpec,
  shouldUseSpatialMode,
  type SlotSpec,
  type SpatialSpec,
} from './utils/slotLayout';

// Export mobile detection utilities
export { isMobileDevice, getDeviceScalingInfo, type DeviceScalingInfo } from './utils/mobileDetection';

// Timer / fictional-time HUD — exported so the Visual Editor can show
// the same chip the runtime renders (faithful preview of the
// project's HUD overlay), driven by globalSettings.hudOverlays.
export { TimerHudDisplay, type TimerHudConfig } from './components/TimerHudDisplay';

// Export markdown-lite renderer
export { renderMarkdownLite } from './utils/markdownLite';
