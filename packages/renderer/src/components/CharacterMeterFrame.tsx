import React from 'react';
import { barFill, resolveBand, type CounterBand } from '@asaps/core';

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
  /** 'band' shows the qualitative phrase from `bands` in place of the number. */
  numericFormat: 'value' | 'fraction' | 'percentage' | 'band';
  orientation: 'horizontal' | 'vertical';
  /** Optional named ranges — see docs/Counter-Binding-Design.md. */
  bands?: CounterBand[];
  /**
   * False renders the readout WITHOUT a bar — a counter shown purely as a
   * word ("wary", "trusting"). Defaults to true, so every existing meter is
   * unaffected. Previously the frame's callers filtered on `visible` alone
   * and this flag never reached the renderer, which made "words, no bar"
   * unreachable despite being an offered choice.
   */
  showLevelMeter?: boolean;
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
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
  /**
   * Whose meters these are, shown as a header. Always worth showing: two
   * screen-docked frames stack in the same corner and are otherwise
   * indistinguishable. Omit to render the bare frame (legacy behaviour).
   */
  characterName?: string;
  /** Character's theme colour, shown as a dot beside the name. */
  characterColor?: string;
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
  fontScale?: number;
}> = ({ counter, showLabel, height, width, fontScale = 1.0 }) => {
  const { value, min, max, color, showNumericValue, numericFormat, orientation, bands } = counter;
  const showBar = counter.showLevelMeter !== false;
  const range = max > min ? { min, max } : { min, max: min + 1 };
  const percentage = ((value - min) / (range.max - range.min)) * 100;

  // The bar originates at zero wherever zero falls in [min, max] and grows
  // toward the value — so a 0..100 counter fills from the left edge as it
  // always has, while a -100..100 one grows outward from the centre. One
  // rule, shared with the editor preview and the core seam.
  const fill = barFill(value, range);
  const fillStartPct = fill.start * 100;
  const fillSizePct = (fill.end - fill.start) * 100;
  const zeroPct = ((0 - range.min) / (range.max - range.min)) * 100;
  const showZeroTick = range.min < 0;

  const barColor = color || '#5B8DEF';
  // Direction already carries the sign; the second colour is polish.
  const negativeColor = '#DC2626';
  const bgColor = 'rgba(255, 255, 255, 0.3)';

  // Format numeric value based on format setting
  const formatValue = (): string | null => {
    if (!showNumericValue) return null;
    switch (numericFormat) {
      case 'fraction':
        return `${value}/${max}`;
      case 'percentage':
        return `${Math.round(Math.min(100, Math.max(0, percentage)))}%`;
      case 'band':
        // Fall back to the number when the author enabled words but hasn't
        // written any — a blank readout would look like a broken meter.
        return resolveBand(value, bands) ?? `${value}`;
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
            fontSize: `${Math.round(10 * fontScale)}px`,
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
            <span style={{ fontSize: `${Math.round(9 * fontScale)}px`, opacity: 0.9 }}>{numericDisplay}</span>
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
        {showBar && <div
          style={{
            width: isHorizontal ? width : height,
            height: isHorizontal ? height : width,
            backgroundColor: bgColor,
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Fill bar — anchored at zero, not at the track edge. Absolute
              rather than a flex child, because it must be able to start
              part-way along the track and grow either direction. */}
          <div
            data-meter-fill={counter.name}
            style={{
              position: 'absolute',
              ...(isHorizontal
                ? { left: `${fillStartPct}%`, width: `${fillSizePct}%`, top: 0, bottom: 0 }
                : { bottom: `${fillStartPct}%`, height: `${fillSizePct}%`, left: 0, right: 0 }),
              backgroundColor: fill.negative ? negativeColor : barColor,
              borderRadius: '2px',
              transition: 'all 300ms ease-out',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          />
          {/* Origin tick — only meaningful when zero is inside the range. */}
          {showZeroTick && (
            <div
              data-meter-zero-tick=""
              style={{
                position: 'absolute',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                ...(isHorizontal
                  ? { left: `${zeroPct}%`, width: '1px', top: 0, bottom: 0 }
                  : { bottom: `${zeroPct}%`, height: '1px', left: 0, right: 0 }),
              }}
            />
          )}
        </div>}

        {/* Inline numeric value (when no label) */}
        {!showLabel && numericDisplay && (
          <span
            style={{
              fontSize: `${Math.round(10 * fontScale)}px`,
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
  fontScale = 1.0,
  characterName,
  characterColor,
}) => {
  // Counters are pre-filtered by the resolver (visible && showLevelMeter)
  if (counters.length === 0) {
    return null;
  }

  const { style, meterHeight, meterSpacing, showLabels, meterWidth } = config;
  // Handle backward compatibility - dockMode may be undefined in older configs
  const dockMode = config.dockMode ?? 'character';

  // Whose meters these are. Two screen-docked frames stack in the same
  // corner and are otherwise indistinguishable — an author reads them as one
  // set of duplicated counters. Mood frames already carry a name header;
  // this brings meter frames in line. Shown even for a single character, so
  // the HUD says what it is rather than relying on the reader to infer it.
  const showHeader = !!characterName;
  const HEADER_HEIGHT = 16;

  // Calculate frame dimensions based on content
  const labelHeight = showLabels ? 14 : 0;
  // A words-only counter contributes no bar height.
  const barlessCount = counters.filter((c) => c.showLevelMeter === false).length;
  const singleMeterHeight = meterHeight + labelHeight + 2; // 2px for margins
  const frameContentHeight = -barlessCount * meterHeight + counters.length * singleMeterHeight +
    (counters.length - 1) * meterSpacing +
    (showHeader ? HEADER_HEIGHT + meterSpacing : 0);
  const frameHeight = frameContentHeight + style.padding * 2;
  const frameWidth = meterWidth + style.padding * 2;

  // Calculate position based on dock mode
  const rawPosition = dockMode === 'screen' && containerDimensions
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

  // Clamp position to stay within stage bounds (prevent clipping by overflow:hidden)
  const stageW = containerDimensions?.width ?? 1024;
  const stageH = containerDimensions?.height ?? 768;
  const position = {
    x: Math.max(0, Math.min(rawPosition.x, stageW - frameWidth)),
    y: Math.max(0, Math.min(rawPosition.y, stageH - frameHeight)),
  };

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
    <div style={frameStyle} data-meter-frame={characterName || ''}>
      {showHeader && (
        <div
          data-meter-frame-name=""
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: HEADER_HEIGHT,
            flexShrink: 0,
          }}
        >
          {characterColor && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: characterColor, flexShrink: 0,
            }} />
          )}
          <span style={{
            fontSize: `${Math.round(11 * fontScale)}px`,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.75)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            lineHeight: 1,
          }}>
            {characterName}
          </span>
        </div>
      )}
      {counters.map((counter) => (
        <MeterBar
          key={counter.name}
          counter={counter}
          showLabel={showLabels}
          height={meterHeight}
          width={meterWidth}
          fontScale={fontScale}
        />
      ))}
    </div>
  );
};

export default CharacterMeterFrame;
