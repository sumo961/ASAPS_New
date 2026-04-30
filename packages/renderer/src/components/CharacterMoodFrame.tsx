import React from 'react';

/**
 * CharacterMoodFrame — HUD widget that renders a compact, read-only
 * 2D mood pad (Russell's circumplex) for a character. Same visual
 * language as the editor's MoodPad, sized down to fit alongside or
 * inside a character. Mounted by PositionedBeatView when a character
 * has `moodFrame.enabled === true`.
 *
 * Mirrors the existing CharacterMeterFrame / CharacterInventoryFrame
 * pattern (anchor + dock-mode + offset positioning) so authors can place
 * it relative to the character or fix it to a screen corner.
 *
 * Self-contained: doesn't import the builder's MoodPad to keep the
 * renderer package independent of the builder. The SVG drawing is small
 * enough that a focused HUD copy is cleaner than cross-package coupling.
 */

// ---------------------------------------------------------------------------
// Types — mirror builder's character.ts shapes (kept local to avoid
// cross-package import). DEFAULT_MOOD_FRAME_CONFIG below tracks the
// builder's default so behaviour matches across packages.
// ---------------------------------------------------------------------------

export type MoodFrameDockMode = 'character' | 'screen';
export type MoodFrameAnchor =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type MoodFrameScreenPosition =
  | 'screen-top-left' | 'screen-top-right'
  | 'screen-bottom-left' | 'screen-bottom-right';

export interface MoodFrameConfig {
  enabled: boolean;
  dockMode: MoodFrameDockMode;
  anchor: MoodFrameAnchor;
  screenPosition: MoodFrameScreenPosition;
  offset: { x: number; y: number };
  /** Square pixel size of the pad — defaults to 96 (compact HUD). */
  size: number;
  /** When true, renders the project's emotion palette as marker dots. */
  showEmotionMarkers: boolean;
  /** Cardinal labels (sad/happy/calm/excited). Default false to keep small HUD readable. */
  showLabels: boolean;
  /** Optional override for the mood-dot fill colour. */
  dotColor?: string;
  /** Background opacity (0 = transparent, 1 = opaque). */
  backgroundOpacity: number;
}

export const DEFAULT_MOOD_FRAME_CONFIG: MoodFrameConfig = {
  enabled: false,
  dockMode: 'character',
  anchor: 'top-right',
  screenPosition: 'screen-top-right',
  offset: { x: 0, y: 0 },
  size: 96,
  showEmotionMarkers: true,
  showLabels: false,
  backgroundOpacity: 0.85,
};

export interface MoodFrameEmotionMarker {
  name: string;
  weightToValence: number;
  weightToArousal: number;
}

export interface CharacterMoodFrameProps {
  valence: number;
  arousal: number;
  config: MoodFrameConfig;
  /** Optional emotion markers from the project palette. */
  palette?: ReadonlyArray<MoodFrameEmotionMarker>;
  /** Character position on stage (used for character-relative docking). */
  characterPosition: { x: number; y: number };
  /** Character dimensions. */
  characterDimensions: { width: number; height: number };
  /** Container/viewport dimensions (required for screen docking). */
  containerDimensions?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Positioning math — copied from CharacterMeterFrame so behaviour is
// identical for HUD widgets across the runtime.
// ---------------------------------------------------------------------------

function calculateCharacterAnchorPosition(
  anchor: MoodFrameAnchor,
  charPos: { x: number; y: number },
  charDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameSize: number,
): { x: number; y: number } {
  const cx = charPos.x + charDims.width / 2;
  const cy = charPos.y + charDims.height / 2;
  let x = cx - frameSize / 2;
  let y = charPos.y - frameSize;
  switch (anchor) {
    case 'top': x = cx - frameSize / 2; y = charPos.y - frameSize; break;
    case 'bottom': x = cx - frameSize / 2; y = charPos.y + charDims.height; break;
    case 'left': x = charPos.x - frameSize; y = cy - frameSize / 2; break;
    case 'right': x = charPos.x + charDims.width; y = cy - frameSize / 2; break;
    case 'top-left': x = charPos.x - frameSize; y = charPos.y - frameSize; break;
    case 'top-right': x = charPos.x + charDims.width; y = charPos.y - frameSize; break;
    case 'bottom-left': x = charPos.x - frameSize; y = charPos.y + charDims.height; break;
    case 'bottom-right': x = charPos.x + charDims.width; y = charPos.y + charDims.height; break;
  }
  return { x: x + offset.x, y: y + offset.y };
}

function calculateScreenPosition(
  pos: MoodFrameScreenPosition,
  containerDims: { width: number; height: number },
  offset: { x: number; y: number },
  frameSize: number,
): { x: number; y: number } {
  const margin = 10;
  let x = margin;
  let y = margin;
  switch (pos) {
    case 'screen-top-right': x = containerDims.width - frameSize - margin; y = margin; break;
    case 'screen-bottom-left': x = margin; y = containerDims.height - frameSize - margin; break;
    case 'screen-bottom-right':
      x = containerDims.width - frameSize - margin;
      y = containerDims.height - frameSize - margin;
      break;
  }
  return { x: x + offset.x, y: y + offset.y };
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return 1;
  if (v < -1) return -1;
  return v === 0 ? 0 : v;
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export const CharacterMoodFrame: React.FC<CharacterMoodFrameProps> = ({
  valence, arousal, config, palette,
  characterPosition, characterDimensions, containerDimensions,
}) => {
  if (!config.enabled) return null;

  const size = config.size || 96;
  const v = clampUnit(valence);
  const a = clampUnit(arousal);
  const dotColor = config.dotColor || '#111827';

  // SVG coords: 0..100 viewBox, origin at centre. Map (-1..+1) onto ±45
  // (rather than ±50) so the mood dot at extreme values stays fully
  // inside the disc (r=48) instead of being clipped by the viewBox edge.
  const toPx = (vv: number, aa: number) => ({ x: 50 + vv * 45, y: 50 - aa * 45 });
  const dot = toPx(v, a);

  const showLabels = !!config.showLabels;
  const showMarkers = !!config.showEmotionMarkers && palette && palette.length > 0;

  const pos = config.dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(config.screenPosition, containerDimensions, config.offset, size)
    : calculateCharacterAnchorPosition(
        config.anchor, characterPosition, characterDimensions, config.offset, size,
      );

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: size,
    height: size,
    pointerEvents: 'none',
    opacity: config.backgroundOpacity,
    zIndex: 50,
  };

  return (
    <div style={containerStyle}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
        <rect x={0} y={0} width={100} height={100} fill="#ffffff" stroke="#e5e7eb" strokeWidth={0.5} rx={4} ry={4} />
        <circle cx={50} cy={50} r={48} fill="#fafafa" stroke="#d1d5db" strokeWidth={0.5} />
        {/* Quadrant tints */}
        <path d="M 50 50 L 100 50 L 100 0 Z" fill="#fef3c7" opacity={0.25} />
        <path d="M 50 50 L 0 50 L 0 0 Z" fill="#fee2e2" opacity={0.25} />
        <path d="M 50 50 L 0 50 L 0 100 Z" fill="#dbeafe" opacity={0.25} />
        <path d="M 50 50 L 100 50 L 100 100 Z" fill="#dcfce7" opacity={0.25} />
        {/* Axis cross */}
        <line x1={2} y1={50} x2={98} y2={50} stroke="#9ca3af" strokeWidth={0.4} />
        <line x1={50} y1={2} x2={50} y2={98} stroke="#9ca3af" strokeWidth={0.4} />
        {showMarkers && palette!.map((e) => {
          if (Math.abs(e.weightToValence) < 0.05 && Math.abs(e.weightToArousal) < 0.05) return null;
          const p = toPx(clampUnit(e.weightToValence), clampUnit(e.weightToArousal));
          return <circle key={e.name} cx={p.x} cy={p.y} r={1.2} fill="#a78bfa" opacity={0.7} />;
        })}
        {showLabels && (
          <>
            <text x={50} y={6.5} textAnchor="middle" fontSize={4.5} fill="#6b7280">excited</text>
            <text x={50} y={97} textAnchor="middle" fontSize={4.5} fill="#6b7280">calm</text>
            <text x={3} y={51.5} textAnchor="start" fontSize={4.5} fill="#6b7280">sad</text>
            <text x={97} y={51.5} textAnchor="end" fontSize={4.5} fill="#6b7280">happy</text>
          </>
        )}
        {/* Mood dot — slightly smaller than editor pad to suit HUD scale */}
        <circle cx={dot.x} cy={dot.y} r={2.6} fill={dotColor} stroke="#ffffff" strokeWidth={0.8} />
      </svg>
    </div>
  );
};
