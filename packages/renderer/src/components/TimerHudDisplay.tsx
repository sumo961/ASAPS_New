import React, { useMemo } from 'react';

export interface TimerHudConfig {
  enabled: boolean;
  mode: 'timer' | 'static';
  timerName: string;
  staticText: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  style: 'digital' | 'minimal';
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  padding: number;
  showLabel: boolean;
  label: string;
  showWhenInactive: boolean;
}

export interface TimerHudDisplayProps {
  /** Remaining time in seconds (timer mode) */
  remainingTime?: number;
  /** Total time in seconds (timer mode) */
  totalTime?: number;
  /** Override display text (static mode, per-beat override) */
  displayText?: string;
  /** Whether the HUD should be visible */
  visible: boolean;
  /** Configuration from GlobalSettings */
  config: TimerHudConfig;
}

/**
 * Format seconds to a zero-padded time string.
 * HH:MM:SS if >= 1 hour, otherwise MM:SS
 */
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get position CSS based on corner position
 */
function getPositionStyle(position: TimerHudConfig['position']): React.CSSProperties {
  const margin = 12;
  switch (position) {
    case 'top-left':
      return { top: margin, left: margin };
    case 'top-right':
      return { top: margin, right: margin };
    case 'bottom-left':
      return { bottom: margin, left: margin };
    case 'bottom-right':
      return { bottom: margin, right: margin };
    default:
      return { top: margin, right: margin };
  }
}

/**
 * TimerHudDisplay - A HUD overlay that shows either a real-time countdown
 * or static narrative time text (e.g. "9:00 AM", "Day 3").
 *
 * Positioned absolutely in a specified corner with pointer-events: none.
 */
export const TimerHudDisplay: React.FC<TimerHudDisplayProps> = ({
  remainingTime,
  totalTime,
  displayText,
  visible,
  config,
}) => {
  // Determine display content based on mode
  const content = useMemo(() => {
    if (config.mode === 'static') {
      // Static mode: show override text or global default
      return displayText || config.staticText || '';
    }
    // Timer mode: show countdown
    if (remainingTime !== undefined && remainingTime >= 0) {
      return formatTime(remainingTime);
    }
    // No active timer
    if (config.showWhenInactive) {
      return '00:00';
    }
    return null;
  }, [config.mode, config.staticText, config.showWhenInactive, remainingTime, displayText]);

  // Timer mode color shift: green -> yellow -> red
  const timerColor = useMemo(() => {
    if (config.mode !== 'timer' || !totalTime || totalTime <= 0 || remainingTime === undefined) {
      return config.textColor;
    }
    const ratio = remainingTime / totalTime;
    if (ratio > 0.5) return config.textColor; // Normal
    if (ratio > 0.25) return '#EAB308'; // Yellow warning
    return '#EF4444'; // Red critical
  }, [config.mode, config.textColor, remainingTime, totalTime]);

  if (!visible || !config.enabled || content === null || content === '') {
    return null;
  }

  const posStyle = getPositionStyle(config.position);

  // Parse background color and apply opacity
  const bgColor = config.backgroundColor || '#000000';
  const bgOpacity = (config.backgroundOpacity ?? 80) / 100;
  let bgRgba: string;
  if (bgColor.startsWith('#') && bgColor.length >= 7) {
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    bgRgba = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
  } else {
    bgRgba = bgColor;
  }

  const isDigital = config.style === 'digital';

  return (
    <div
      style={{
        position: 'absolute',
        ...posStyle,
        zIndex: 1001,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: bgRgba,
        borderRadius: config.borderRadius,
        padding: config.padding,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Optional label */}
      {config.showLabel && config.label && (
        <div
          style={{
            fontSize: Math.max(10, config.fontSize * 0.5),
            color: config.textColor,
            opacity: 0.7,
            marginBottom: 2,
            fontFamily: isDigital ? 'monospace' : 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}
        >
          {config.label}
        </div>
      )}
      {/* Main display */}
      <div
        style={{
          fontSize: config.fontSize,
          color: config.mode === 'timer' ? timerColor : config.textColor,
          fontFamily: isDigital ? '"Courier New", "Consolas", monospace' : 'inherit',
          fontWeight: isDigital ? 700 : 500,
          letterSpacing: isDigital ? '0.05em' : 'normal',
          lineHeight: 1.2,
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
          transition: 'color 0.5s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {content}
      </div>
    </div>
  );
};

export default TimerHudDisplay;
