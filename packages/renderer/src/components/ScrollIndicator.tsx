import React from 'react';

interface ScrollIndicatorProps {
  position: 'bottom' | 'top';
  /** Custom message to display */
  message?: string;
  /** Whether to show the text message (default: true in preview, false in editor) */
  showMessage?: boolean;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
}

/**
 * Visual indicator showing that content extends beyond visible area.
 * Displays a gradient fade with optional directional message.
 */
export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  position,
  message,
  showMessage = true,
  fontScale = 1.0,
}) => {
  const defaultMessage = position === 'bottom' ? '↓ Scroll for more' : '↑ Scroll up';
  const displayMessage = message ?? defaultMessage;

  return (
    <div
      style={{
        position: 'absolute',
        [position]: 0,
        left: 0,
        right: 0,
        height: 30,
        background:
          position === 'bottom'
            ? 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.3))'
            : 'linear-gradient(to top, transparent, rgba(0, 0, 0, 0.3))',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: position === 'bottom' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        paddingBottom: position === 'bottom' ? 4 : 0,
        paddingTop: position === 'top' ? 4 : 0,
        zIndex: 10,
      }}
    >
      {showMessage && (
        <span
          style={{
            fontSize: Math.round(11 * fontScale),
            color: 'white',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {displayMessage}
        </span>
      )}
    </div>
  );
};

/**
 * Small badge indicator for editor mode showing that content is scrollable.
 * Less intrusive than the full gradient overlay.
 */
export const ScrollBadge: React.FC<{ visible: boolean; fontScale?: number }> = ({ visible, fontScale = 1.0 }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: 'rgba(0, 0, 0, 0.6)',
        color: 'white',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: Math.round(10 * fontScale),
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      Scrollable
    </div>
  );
};

export default ScrollIndicator;
