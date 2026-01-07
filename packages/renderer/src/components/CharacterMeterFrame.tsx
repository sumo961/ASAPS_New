import React from 'react';

/**
 * Dock mode: relative to character or fixed to screen corner
 * (Mirrors MeterFrameDockMode from builder types)
 */
export type MeterFrameDockMode = 'character' | 'screen';

/**
 * Anchor position for meter frame relative to character
 * (Mirrors MeterFrameAnchor from builder types)
 */
export type MeterFrameAnchor =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Screen corner positions for fixed docking
 * (Mirrors MeterFrameScreenPosition from builder types)
 */
export type MeterFrameScreenPosition =
  | 'screen-top-left' | 'screen-top-right'
  | 'screen-bottom-left' | 'screen-bottom-right';

/**
 * Meter frame style configuration
 */
export interface MeterFrameStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  opacity: number;  // 0-100
}

/**
 * Configuration for the grouped meter frame
 * (Mirrors MeterFrameConfig from builder types)
 */
export interface MeterFrameConfig {
  dockMode: MeterFrameDockMode;
  anchor: MeterFrameAnchor;
  screenPosition: MeterFrameScreenPosition;
  offset: { x: number; y: number };
  style: MeterFrameStyle;
  meterHeight: number;
  meterSpacing: number;
  showLabels: boolean;
  meterWidth: number;
}

/**
 * Counter data needed for rendering
 */
export interface MeterCounterData {
  name: string;
  displayName: string;
  value: number;
  min: number;
  max: number;
  color: string;
  showNumericValue: boolean;
  numericFormat: 'value' | 'fraction' | 'percentage';
  orientation: 'horizontal' | 'vertical';
}

/**
 * Props for CharacterMeterFrame component
 */
export interface CharacterMeterFrameProps {
  /** Visible counters to display (already filtered to those with showLevelMeter) */
  counters: MeterCounterData[];
  /** Meter frame configuration */
  config: MeterFrameConfig;
  /** Character position on stage */
  characterPosition: { x: number; y: number };
  /** Character dimensions */
  characterDimensions: { width: number; height: number };
  /** Container/viewport dimensions (required for screen docking) */
  containerDimensions?: { width: number; height: number };
}

/**
 * Calculate frame position based on anchor and character position/dimensions
 */
function calculateCharacterAnchorPosition(
  anchor: MeterFrameAnchor,
  charPos: { x: number; y: number },
  charDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const charCenterX = charPos.x + charDims.width / 2;
  const charCenterY = charPos.y + charDims.height / 2;

  let x: number;
  let y: number;

  switch (anchor) {
    case 'top':
      x = charCenterX - frameWidth / 2;
      y = charPos.y - frameHeight;
      break;
    case 'bottom':
      x = charCenterX - frameWidth / 2;
      y = charPos.y + charDims.height;
      break;
    case 'left':
      x = charPos.x - frameWidth;
      y = charCenterY - frameHeight / 2;
      break;
    case 'right':
      x = charPos.x + charDims.width;
      y = charCenterY - frameHeight / 2;
      break;
    case 'top-left':
      x = charPos.x - frameWidth;
      y = charPos.y - frameHeight;
      break;
    case 'top-right':
      x = charPos.x + charDims.width;
      y = charPos.y - frameHeight;
      break;
    case 'bottom-left':
      x = charPos.x - frameWidth;
      y = charPos.y + charDims.height;
      break;
    case 'bottom-right':
      x = charPos.x + charDims.width;
      y = charPos.y + charDims.height;
      break;
    default:
      x = charCenterX - frameWidth / 2;
      y = charPos.y - frameHeight;
  }

  return {
    x: x + offset.x,
    y: y + offset.y,
  };
}

/**
 * Calculate frame position for screen corner docking
 */
function calculateScreenPosition(
  screenPosition: MeterFrameScreenPosition,
  containerDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameWidth: number,
  frameHeight: number
): { x: number; y: number } {
  const margin = 10; // Base margin from screen edges

  let x: number;
  let y: number;

  switch (screenPosition) {
    case 'screen-top-left':
      x = margin;
      y = margin;
      break;
    case 'screen-top-right':
      x = containerDims.width - frameWidth - margin;
      y = margin;
      break;
    case 'screen-bottom-left':
      x = margin;
      y = containerDims.height - frameHeight - margin;
      break;
    case 'screen-bottom-right':
      x = containerDims.width - frameWidth - margin;
      y = containerDims.height - frameHeight - margin;
      break;
    default:
      x = margin;
      y = margin;
  }

  return {
    x: x + offset.x,
    y: y + offset.y,
  };
}

/**
 * Individual meter bar component
 */
const MeterBar: React.FC<{
  counter: MeterCounterData;
  showLabel: boolean;
  height: number;
  width: number;
}> = ({ counter, showLabel, height, width }) => {
  const { value, min, max, color, showNumericValue, numericFormat, orientation } = counter;
  const percentage = max > min
    ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
    : 0;

  const barColor = color || '#3B82F6';
  const bgColor = 'rgba(255, 255, 255, 0.3)';

  // Format numeric value based on format setting
  const formatValue = (): string | null => {
    if (!showNumericValue) return null;
    switch (numericFormat) {
      case 'fraction':
        return `${value}/${max}`;
      case 'percentage':
        return `${Math.round(percentage)}%`;
      default:
        return `${value}`;
    }
  };

  const numericDisplay = formatValue();
  const isHorizontal = orientation !== 'vertical';

  return (
    <div style={{ width: '100%' }}>
      {/* Label row */}
      {showLabel && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '2px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{counter.displayName}</span>
          {numericDisplay && (
            <span style={{ fontSize: '9px', opacity: 0.9 }}>{numericDisplay}</span>
          )}
        </div>
      )}

      {/* Bar container */}
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <div
          style={{
            width: isHorizontal ? width : height,
            height: isHorizontal ? height : width,
            backgroundColor: bgColor,
            borderRadius: '3px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column-reverse',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Fill bar */}
          <div
            style={{
              width: isHorizontal ? `${percentage}%` : '100%',
              height: isHorizontal ? '100%' : `${percentage}%`,
              backgroundColor: barColor,
              borderRadius: '2px',
              transition: 'all 300ms ease-out',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          />
        </div>

        {/* Inline numeric value (when no label) */}
        {!showLabel && numericDisplay && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              minWidth: '30px',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {numericDisplay}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * CharacterMeterFrame - Grouped HUD overlay for character counters
 *
 * Renders all visible counters for a character in a single auto-growing frame
 * that anchors to the character's position and follows animations.
 */
export const CharacterMeterFrame: React.FC<CharacterMeterFrameProps> = ({
  counters,
  config,
  characterPosition,
  characterDimensions,
  containerDimensions,
}) => {
  // Counters are pre-filtered by the resolver (visible && showLevelMeter)
  if (counters.length === 0) {
    return null;
  }

  const { style, meterHeight, meterSpacing, showLabels, meterWidth } = config;
  // Handle backward compatibility - dockMode may be undefined in older configs
  const dockMode = config.dockMode ?? 'character';

  // Calculate frame dimensions based on content
  const labelHeight = showLabels ? 14 : 0;
  const singleMeterHeight = meterHeight + labelHeight + 2; // 2px for margins
  const frameContentHeight = counters.length * singleMeterHeight +
    (counters.length - 1) * meterSpacing;
  const frameHeight = frameContentHeight + style.padding * 2;
  const frameWidth = meterWidth + style.padding * 2;

  // Calculate position based on dock mode
  const position = dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(
        config.screenPosition ?? 'screen-top-left',
        containerDimensions,
        config.offset,
        frameWidth,
        frameHeight
      )
    : calculateCharacterAnchorPosition(
        config.anchor,
        characterPosition,
        characterDimensions,
        config.offset,
        frameWidth,
        frameHeight
      );

  const frameStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: frameWidth,
    backgroundColor: style.backgroundColor,
    border: `${style.borderWidth}px solid ${style.borderColor}`,
    borderRadius: style.borderRadius,
    padding: style.padding,
    opacity: style.opacity / 100,
    display: 'flex',
    flexDirection: 'column',
    gap: meterSpacing,
    pointerEvents: 'none', // Don't interfere with character interactions
    zIndex: 1000, // Above character but below UI
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  };

  return (
    <div style={frameStyle}>
      {counters.map((counter) => (
        <MeterBar
          key={counter.name}
          counter={counter}
          showLabel={showLabels}
          height={meterHeight}
          width={meterWidth}
        />
      ))}
    </div>
  );
};

export default CharacterMeterFrame;
