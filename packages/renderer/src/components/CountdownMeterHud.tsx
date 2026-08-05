import React, { useMemo } from 'react';

export interface CountdownMeterConfig {
  enabled: boolean;
  counterName: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  label: string;
  showLabel: boolean;
  showNumericValue: boolean;
  numericFormat: 'value' | 'fraction' | 'percentage';
  meterColor: string;
  meterBackgroundColor: string;
  meterHeight: number;
  meterWidth: number; // Percentage of stage width (10-90)
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  warningThreshold: number;
  warningColor: string;
  criticalThreshold: number;
  criticalColor: string;
  showByDefault?: boolean; // When true (default), meter shows on all beats unless overridden per-beat
  counterMin?: number; // Counter minimum value (default 0)
  counterMax?: number; // Counter maximum value (default 100)
}

export interface CountdownMeterHudProps {
  /** Current counter value */
  counterValue: number;
  /** Counter minimum value */
  counterMin: number;
  /** Counter maximum value */
  counterMax: number;
  /** Configuration from GlobalSettings */
  config: CountdownMeterConfig;
  /** Whether the HUD should be visible */
  visible: boolean;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
}

/**
 * Get position CSS based on position setting
 */
function getPositionStyle(position: CountdownMeterConfig['position']): React.CSSProperties {
  const margin = 12;
  switch (position) {
    case 'top-left':
      return { top: margin, left: margin };
    case 'top-right':
      return { top: margin, right: margin };
    case 'top-center':
      return { top: margin, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom-left':
      return { bottom: margin, left: margin };
    case 'bottom-right':
      return { bottom: margin, right: margin };
    case 'bottom-center':
      return { bottom: margin, left: '50%', transform: 'translateX(-50%)' };
    default:
      return { top: margin, left: '50%', transform: 'translateX(-50%)' };
  }
}

/**
 * CountdownMeterHud - A screen-docked progress bar HUD overlay
 * driven by a counter value with warning/critical color thresholds.
 */
export const CountdownMeterHud: React.FC<CountdownMeterHudProps> = ({
  counterValue,
  counterMin,
  counterMax,
  config,
  visible,
  fontScale = 1.0,
}) => {
  // Clamp meterWidth to valid percentage range (handles migration from old pixel values)
  const effectiveWidth = Math.min(Math.max(config.meterWidth, 10), 90);
  const percentage = useMemo(() => {
    if (counterMax <= counterMin) return 0;
    return Math.max(0, Math.min(100, ((counterValue - counterMin) / (counterMax - counterMin)) * 100));
  }, [counterValue, counterMin, counterMax]);

  const barColor = useMemo(() => {
    if (percentage <= config.criticalThreshold) return config.criticalColor;
    if (percentage <= config.warningThreshold) return config.warningColor;
    return config.meterColor;
  }, [percentage, config.meterColor, config.warningThreshold, config.warningColor, config.criticalThreshold, config.criticalColor]);

  const numericDisplay = useMemo(() => {
    if (!config.showNumericValue) return null;
    switch (config.numericFormat) {
      case 'fraction':
        return `${counterValue}/${counterMax}`;
      case 'percentage':
        return `${Math.round(percentage)}%`;
      default:
        return `${counterValue}`;
    }
  }, [config.showNumericValue, config.numericFormat, counterValue, counterMax, percentage]);

  if (!visible || !config.enabled) {
    return null;
  }

  const posStyle = getPositionStyle(config.position);

  // Parse background color and apply opacity
  const bgColor = config.backgroundColor || '#1b1f2b';
  const bgOpacity = (config.backgroundOpacity ?? 85) / 100;
  let bgRgba: string;
  if (bgColor.startsWith('#') && bgColor.length >= 7) {
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    bgRgba = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
  } else {
    bgRgba = bgColor;
  }

  const meterBgColor = config.meterBackgroundColor || 'rgba(255, 255, 255, 0.3)';

  return (
    <div
      style={{
        position: 'absolute',
        ...posStyle,
        zIndex: 1001,
        pointerEvents: 'none',
        backgroundColor: bgRgba,
        borderRadius: config.borderRadius,
        padding: 8,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        width: `${effectiveWidth}%`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {/* Label row */}
      {config.showLabel && config.label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <span
            style={{
              fontSize: Math.round(10 * fontScale),
              fontWeight: 'bold',
              color: 'white',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            }}
          >
            {config.label}
          </span>
          {numericDisplay && (
            <span
              style={{
                fontSize: Math.round(9 * fontScale),
                color: 'white',
                opacity: 0.9,
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              }}
            >
              {numericDisplay}
            </span>
          )}
        </div>
      )}

      {/* Meter bar */}
      <div
        style={{
          width: '100%',
          height: config.meterHeight,
          backgroundColor: meterBgColor,
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid rgba(0, 0, 0, 0.3)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: barColor,
            borderRadius: 2,
            transition: 'width 300ms ease-out, background-color 300ms ease',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          }}
        />
      </div>

      {/* Inline numeric value (when no label) */}
      {!config.showLabel && numericDisplay && (
        <span
          style={{
            fontSize: Math.round(10 * fontScale),
            fontWeight: 'bold',
            color: 'white',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
          }}
        >
          {numericDisplay}
        </span>
      )}
    </div>
  );
};

export default CountdownMeterHud;
