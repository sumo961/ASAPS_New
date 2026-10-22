/**
 * The look of an inner voice's line (see core beats/dialogExchange): a
 * thought, not speech — italic text in a dashed, see-through box in the
 * character's Theme Color. Applied on top of the theme's text-box style so
 * radius and padding still follow the project.
 */
import type React from 'react';

const NEUTRAL = 'rgba(255, 255, 255, 0.6)';

export function thoughtBoxStyle(color?: string, base?: React.CSSProperties): React.CSSProperties {
  const padded = base?.padding === 0 || base?.padding === undefined;
  return {
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    border: `2px dashed ${color || NEUTRAL}`,
    boxShadow: 'none',
    fontStyle: 'italic',
    ...(padded ? { padding: '12px 16px', borderRadius: 12 } : {}),
  };
}

/** Name label colour for an inner voice: its Theme Color, else the label's own. */
export function innerVoiceLabelColor(color?: string, fallback?: string): string | undefined {
  return color || fallback;
}
