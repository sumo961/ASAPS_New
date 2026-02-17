/**
 * TranslationStaleIndicator - Visual indicator for beats with stale translations
 *
 * Shows an amber triangle overlay on beats in the canvas when any loaded
 * translation has stale entries for that beat. Follows the same pattern
 * as FileChangeIndicator.
 */

import React from 'react';
import { useTranslationState } from '../../contexts/TranslationContext';

interface TranslationStaleIndicatorProps {
  /** Beat ID to check */
  beatId: string;
  /** Position relative to the parent element */
  position?: 'top-right' | 'top-left' | 'bottom-right';
  /** Size of the indicator */
  size?: number;
}

export const TranslationStaleIndicator: React.FC<TranslationStaleIndicatorProps> = ({
  beatId,
  position = 'top-left',
  size = 10,
}) => {
  const { translations } = useTranslationState();

  if (translations.length === 0) return null;

  // Check if any translation has stale entries for this beat
  const beatKeyPrefix = `beat:${beatId}.`;
  const hasStale = translations.some(t =>
    Object.entries(t.strings).some(
      ([key, entry]) => key.startsWith(beatKeyPrefix) && entry.status === 'stale'
    )
  );

  if (!hasStale) return null;

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-right': { top: -size / 2, right: -size / 2 },
    'top-left': { top: -size / 2, left: -size / 2 },
    'bottom-right': { bottom: -size / 2, right: -size / 2 },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        width: 0,
        height: 0,
        borderLeft: `${size / 2}px solid transparent`,
        borderRight: `${size / 2}px solid transparent`,
        borderBottom: `${size}px solid #f59e0b`,
        zIndex: 10,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.3))',
      }}
      title="Stale translations — source text has changed"
    />
  );
};

/**
 * Inline badge version for sidebar lists
 */
export const TranslationStaleBadge: React.FC<{ beatId: string }> = ({ beatId }) => {
  const { translations } = useTranslationState();

  if (translations.length === 0) return null;

  const beatKeyPrefix = `beat:${beatId}.`;
  const staleCount = translations.reduce((count, t) =>
    count + Object.entries(t.strings).filter(
      ([key, entry]) => key.startsWith(beatKeyPrefix) && entry.status === 'stale'
    ).length,
    0
  );

  if (staleCount === 0) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderBottom: '7px solid #f59e0b',
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
      title={`${staleCount} stale translation(s)`}
    />
  );
};
