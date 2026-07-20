import React from 'react';

/**
 * CharacterMoodFrame — HUD widget rendering a 2D mood pad (Russell's
 * circumplex) for a character. Read-only, mounted by PositionedBeatView
 * (anchored to a stage character) or by PreviewWindow's overlay layer
 * (screen-docked, independent of stage placement).
 *
 * The HUD is a small *card*: header strip with portrait + name, the
 * Russell's-circumplex disc, optional qualitative label below. Sized to
 * be visible at glance during play without dominating the stage.
 *
 * Self-contained: doesn't import builder's MoodPad to keep the renderer
 * package boundary clean.
 */

// ---------------------------------------------------------------------------
// Types — mirror builder's character.ts shapes (kept local to avoid
// cross-package import).
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
  /** Pixel size of the disc inside the card. Card itself adds ~30-50 px
   *  for the header + qualitative label. Defaults to 140. */
  size: number;
  /** Plot project emotion-palette markers on the disc. */
  showEmotionMarkers: boolean;
  /** Cardinal axis labels (sad / happy / calm / excited) inside the disc. */
  showLabels: boolean;
  /** Qualitative descriptor below the disc, e.g. "sad, alert".
   *  Defaults to true — most useful HUD signal beyond the dot itself. */
  showQualitativeLabel: boolean;
  /** Optional override for the mood-dot fill colour (defaults to the
   *  per-character `color` if available, else a strong default blue). */
  dotColor?: string;
  /** Background opacity (0 = transparent, 1 = opaque). */
  backgroundOpacity: number;
  /**
   * Glance-tier vs detail-tier display (v0.9.81). `'token'` (default) shows
   * the compact glanceable mood token — a coloured blob sitting in the
   * mood's circumplex quadrant, readable at HUD/mobile size and collected
   * into a rail when several characters are on screen. `'disc'` keeps the
   * full Russell's-circumplex card (precise, but the old hard-to-read HUD).
   */
  displayStyle?: 'token' | 'disc';
}

export const DEFAULT_MOOD_FRAME_CONFIG: MoodFrameConfig = {
  enabled: false,
  dockMode: 'character',
  anchor: 'top-right',
  screenPosition: 'screen-top-right',
  offset: { x: 0, y: 0 },
  size: 140,
  showEmotionMarkers: true,
  showLabels: false,
  showQualitativeLabel: true,
  backgroundOpacity: 0.95,
  displayStyle: 'token',
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
  /** Display name shown in the HUD header so the player knows whose
   *  mood they're seeing. Optional — when omitted, the header collapses. */
  characterName?: string;
  /** Optional small portrait (resolved URL) for the HUD header. */
  characterPortraitUrl?: string;
  /** Optional character color (e.g. team / personality color) used for
   *  the mood dot fill and the header accent. Falls back to dotColor
   *  config or a strong default blue. */
  characterColor?: string;
  /** Character position on stage (used for character-relative docking). */
  characterPosition: { x: number; y: number };
  /** Character dimensions. */
  characterDimensions: { width: number; height: number };
  /** Container/viewport dimensions (required for screen docking). */
  containerDimensions?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Positioning math — mirrors CharacterMeterFrame.
// ---------------------------------------------------------------------------

export function calculateCharacterAnchorPosition(
  anchor: MoodFrameAnchor,
  charPos: { x: number; y: number },
  charDims: { width: number; height: number },
  offset: { x: number; y: number },
  cardWidth: number,
  cardHeight: number,
): { x: number; y: number } {
  const cx = charPos.x + charDims.width / 2;
  const cy = charPos.y + charDims.height / 2;
  let x = cx - cardWidth / 2;
  let y = charPos.y - cardHeight;
  switch (anchor) {
    case 'top': x = cx - cardWidth / 2; y = charPos.y - cardHeight; break;
    case 'bottom': x = cx - cardWidth / 2; y = charPos.y + charDims.height; break;
    case 'left': x = charPos.x - cardWidth; y = cy - cardHeight / 2; break;
    case 'right': x = charPos.x + charDims.width; y = cy - cardHeight / 2; break;
    case 'top-left': x = charPos.x - cardWidth; y = charPos.y - cardHeight; break;
    case 'top-right': x = charPos.x + charDims.width; y = charPos.y - cardHeight; break;
    case 'bottom-left': x = charPos.x - cardWidth; y = charPos.y + charDims.height; break;
    case 'bottom-right': x = charPos.x + charDims.width; y = charPos.y + charDims.height; break;
  }
  return { x: x + offset.x, y: y + offset.y };
}

export function calculateScreenPosition(
  pos: MoodFrameScreenPosition,
  containerDims: { width: number; height: number },
  offset: { x: number; y: number },
  cardWidth: number,
  cardHeight: number,
): { x: number; y: number } {
  const margin = 10;
  let x = margin;
  let y = margin;
  switch (pos) {
    case 'screen-top-right': x = containerDims.width - cardWidth - margin; y = margin; break;
    case 'screen-bottom-left': x = margin; y = containerDims.height - cardHeight - margin; break;
    case 'screen-bottom-right':
      x = containerDims.width - cardWidth - margin;
      y = containerDims.height - cardHeight - margin;
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

/**
 * Qualitative descriptor for a 2D mood, mirroring the dossier's
 * `describeMood` so HUD and prompts share vocabulary.
 */
function describeMood(valence: number, arousal: number): string {
  const v = describeAxis(valence, 'valence');
  const a = describeAxis(arousal, 'arousal');
  return `${v}, ${a}`;
}
function describeAxis(value: number, axis: 'valence' | 'arousal'): string {
  if (axis === 'valence') {
    if (value >= 0.6) return 'happy';
    if (value >= 0.2) return 'pleased';
    if (value <= -0.6) return 'sad';
    if (value <= -0.2) return 'displeased';
    return 'even';
  }
  if (value >= 0.6) return 'energetic';
  if (value >= 0.2) return 'alert';
  if (value <= -0.6) return 'lethargic';
  if (value <= -0.2) return 'subdued';
  return 'steady';
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export const CharacterMoodFrame: React.FC<CharacterMoodFrameProps> = ({
  valence, arousal, config, palette,
  characterName, characterPortraitUrl, characterColor,
  characterPosition, characterDimensions, containerDimensions,
}) => {
  if (!config.enabled) return null;

  const discSize = config.size || 140;
  const v = clampUnit(valence);
  const a = clampUnit(arousal);
  const dotColor = config.dotColor || characterColor || '#2563eb';
  const accentColor = characterColor || dotColor;

  // SVG coords: 0..100 viewBox, origin at centre.
  const toPx = (vv: number, aa: number) => ({ x: 50 + vv * 45, y: 50 - aa * 45 });
  const dot = toPx(v, a);

  const showLabels = !!config.showLabels;
  const showMarkers = !!config.showEmotionMarkers && palette && palette.length > 0;
  const showQualitativeLabel = config.showQualitativeLabel !== false;
  const showHeader = !!characterName;

  // Card sizing — header + disc + (optional) label rows.
  const headerH = showHeader ? 22 : 0;
  const labelH = showQualitativeLabel ? 18 : 0;
  const padH = 4;
  const cardWidth = discSize + 8;          // disc + a tiny border on each side
  const cardHeight = headerH + discSize + labelH + padH * 2;

  const pos = config.dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(config.screenPosition, containerDimensions, config.offset, cardWidth, cardHeight)
    : calculateCharacterAnchorPosition(
        config.anchor, characterPosition, characterDimensions, config.offset, cardWidth, cardHeight,
      );

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: cardWidth,
    height: cardHeight,
    background: '#ffffff',
    borderRadius: 8,
    border: `1.5px solid ${accentColor}`,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.10)',
    pointerEvents: 'none',
    opacity: config.backgroundOpacity,
    zIndex: 50,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={cardStyle}>
      {showHeader && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 6px',
          background: accentColor + '22',  // ~13% alpha hex
          borderBottom: `1px solid ${accentColor}55`,
          height: headerH,
          flexShrink: 0,
        }}>
          {characterPortraitUrl ? (
            <img
              src={characterPortraitUrl}
              alt={characterName}
              style={{
                width: 16, height: 16,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `1px solid ${accentColor}`,
                flexShrink: 0,
              }}
            />
          ) : (
            <span style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }} />
          )}
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#1f2937',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1,
          }}>
            {characterName}
          </span>
        </div>
      )}

      <div style={{ width: discSize, height: discSize, alignSelf: 'center', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" width={discSize} height={discSize} style={{ display: 'block' }}>
          <rect x={0} y={0} width={100} height={100} fill="#ffffff" />
          <circle cx={50} cy={50} r={48} fill="#fafafa" stroke="#9ca3af" strokeWidth={0.7} />
          {/* Quadrant tints — saturated enough to read at HUD size,
              colour-coded by Russell's affect interpretation:
                top-right (positive valence, high arousal): yellow ('joy')
                top-left (negative, high arousal):  red    ('fear/anger')
                bottom-left (negative, low arousal): blue   ('sad/calm')
                bottom-right (positive, low arousal): green ('serene')  */}
          <path d="M 50 50 L 100 50 L 100 0 Z" fill="#fde68a" opacity={0.55} />
          <path d="M 50 50 L 0 50 L 0 0 Z" fill="#fca5a5" opacity={0.45} />
          <path d="M 50 50 L 0 50 L 0 100 Z" fill="#93c5fd" opacity={0.45} />
          <path d="M 50 50 L 100 50 L 100 100 Z" fill="#86efac" opacity={0.55} />

          {/* Axis cross — stronger contrast than before */}
          <line x1={2} y1={50} x2={98} y2={50} stroke="#4b5563" strokeWidth={0.6} />
          <line x1={50} y1={2} x2={50} y2={98} stroke="#4b5563" strokeWidth={0.6} />

          {showMarkers && palette!.map((e) => {
            if (Math.abs(e.weightToValence) < 0.05 && Math.abs(e.weightToArousal) < 0.05) return null;
            const p = toPx(clampUnit(e.weightToValence), clampUnit(e.weightToArousal));
            return <circle key={e.name} cx={p.x} cy={p.y} r={1.2} fill="#7c3aed" opacity={0.7} />;
          })}

          {showLabels && (
            <>
              <text x={50} y={7} textAnchor="middle" fontSize={5} fill="#374151" fontWeight={600}>excited</text>
              <text x={50} y={97} textAnchor="middle" fontSize={5} fill="#374151" fontWeight={600}>calm</text>
              <text x={3} y={52} textAnchor="start" fontSize={5} fill="#374151" fontWeight={600}>sad</text>
              <text x={97} y={52} textAnchor="end" fontSize={5} fill="#374151" fontWeight={600}>happy</text>
            </>
          )}

          {/* Mood dot — bigger and using the character's accent color
              with a contrasting outline so it pops against any quadrant. */}
          <circle cx={dot.x} cy={dot.y} r={4} fill={dotColor} stroke="#ffffff" strokeWidth={1.4} />
          <circle cx={dot.x} cy={dot.y} r={4.6} fill="none" stroke="#1f2937" strokeWidth={0.4} opacity={0.7} />
        </svg>
      </div>

      {showQualitativeLabel && (
        <div style={{
          fontSize: 11,
          color: '#374151',
          textAlign: 'center',
          padding: '2px 4px',
          fontStyle: 'italic',
          height: labelH,
          lineHeight: '14px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {describeMood(v, a)}
        </div>
      )}
    </div>
  );
};
