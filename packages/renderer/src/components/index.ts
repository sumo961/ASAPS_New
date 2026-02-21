// components/index.ts - Direct export for better type resolution
export {
  PositionedBeatView,
  createPositionedElementData,
  calculateSmartTextBoxDimensions,
  calculateSmartButtonDimensions,
  adjustElementsForCollisions,
  type PositionedBeatViewProps,
  type PositionedElementData,
  type RenderThemeSettings
} from './PositionedBeatView';

export {
  CharacterMeterFrame,
  type CharacterMeterFrameProps,
  type MeterFrameConfig,
  type MeterFrameAnchor,
  type MeterFrameScreenPosition,
  type MeterFrameDockMode,
  type MeterFrameStyle,
  type MeterCounterData
} from './CharacterMeterFrame';

export {
  CharacterInventoryFrame,
  type CharacterInventoryFrameProps,
  type InventoryFrameConfig,
  type InventoryFrameAnchor,
  type InventoryFrameScreenPosition,
  type InventoryFrameDockMode,
  type InventoryFrameStyle,
  type InventoryItemData
} from './CharacterInventoryFrame';

export {
  ChatDialogView,
  type ChatDialogViewProps,
  type ChatMessage
} from './ChatDialogView';

export {
  TimerProgressBar,
  type TimerProgressBarProps
} from './TimerProgressBar';
