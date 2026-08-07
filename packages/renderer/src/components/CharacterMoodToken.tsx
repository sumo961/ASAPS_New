import React from 'react';
import {
  type MoodFrameConfig,
  type MoodFrameAnchor,
  type MoodFrameScreenPosition,
  calculateCharacterAnchorPosition,
  calculateScreenPosition,
} from './CharacterMoodFrame';

/**
 * CharacterMoodToken — the glance-tier mood display (v0.9.81), replacing the
 * hard-to-read miniature circumplex disc as the on-stage default.
 *
 * The token is an SVG square (no canvas → no devicePixelRatio scaling bugs)
 * showing a single dominant hue as a soft gradient blob that SITS in the
 * mood's circumplex quadrant — so position AND colour both name the mood,
 * reading like a little map. Neutral moods show a centred grey blob, never a
 * muddy four-way tint blend. Four vivid corner ticks are an always-on legend
 * of the quadrants. A one-word mood label (from `moodWord`) rides alongside,
 * teaching the code continuously so the token becomes self-explanatory.
 *
 * Three exports:
 *   - MoodToken           — the bare SVG glyph.
 *   - CharacterMoodToken  — a positioned, labelled widget (character-anchored
 *                           or screen-docked single), the token counterpart
 *                           of CharacterMoodFrame.
 *   - MoodRail            — a wrapping row of tokens for the multi-character
 *                           screen-dock case (fixes the old overlapping cards).
 */

// ---------------------------------------------------------------------------
// Affect vocabulary — the circumplex quadrant colours + the one-word label.
// ---------------------------------------------------------------------------

/** Circumplex quadrant hues (strong, distinguishable at HUD/mobile size). */
const Q_NE = '#f59e0b'; // pleasant · activated   → upbeat / elated  (amber)
const Q_NW = '#e5321c'; // unpleasant · activated → tense / hostile  (red)
const Q_SW = '#2f6fd0'; // unpleasant · calm      → withdrawn / down (blue)
const Q_SE = '#12a05f'; // pleasant · calm        → content / serene (green)
const NEUTRAL_GREY = '#8a8f9c';

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

function quadColor(v: number, a: number): string {
  if (v >= 0 && a >= 0) return Q_NE;
  if (v < 0 && a >= 0) return Q_NW;
  if (v < 0 && a < 0) return Q_SW;
  return Q_SE;
}

/**
 * One-word mood descriptor for the self-teaching label. Kept in the same
 * vocabulary the design uses; intentionally single-word (the two-word
 * `describeMood` on CharacterMoodFrame is for the fuller disc card).
 */
export function moodWord(valence: number, arousal: number): string {
  const v = clampUnit(valence), a = clampUnit(arousal);
  const mag = Math.hypot(v, a);
  if (mag < 0.2) return 'neutral';
  const strong = mag > 0.62;
  if (v >= 0 && a >= 0) return strong ? 'elated' : 'upbeat';
  if (v < 0 && a >= 0) return strong ? 'hostile' : 'tense';
  if (v < 0 && a < 0) return strong ? 'despairing' : 'withdrawn';
  return strong ? 'serene' : 'content';
}

// ---------------------------------------------------------------------------
// The bare glyph
// ---------------------------------------------------------------------------

export interface MoodTokenProps {
  valence: number;
  arousal: number;
  /** Pixel size of the square. */
  size: number;
}

export const MoodToken: React.FC<MoodTokenProps> = ({ valence, arousal, size }) => {
  const v = clampUnit(valence), a = clampUnit(arousal);
  const raw = Math.hypot(v, a);
  const mag = Math.min(1, raw / 1.414);
  const neutral = raw < 0.2;
  const col = neutral ? NEUTRAL_GREY : quadColor(v, a);

  // viewBox 0..100. Blob centre pushed toward the mood corner (or centred
  // when neutral). 0.6 factor keeps it inside the frame at max magnitude.
  const bx = neutral ? 50 : 50 + v * 30;
  const by = neutral ? 50 : 50 - a * 30;
  const R = 44 + 26 * mag; // gradient radius grows with intensity
  const inner = neutral ? 0.5 : Math.min(1, 0.9 + 0.1 * mag);
  const mid = neutral ? 0.2 : 0.42 + 0.3 * mag;

  const gid = `mt-${Math.round(bx)}-${Math.round(by)}-${col.slice(1)}`;
  const tick = 16; // corner-tick size in viewBox units

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx={bx} cy={by} r={R}>
          <stop offset="0%" stopColor={col} stopOpacity={inner} />
          <stop offset="50%" stopColor={col} stopOpacity={mid} />
          <stop offset="100%" stopColor={col} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${gid}-clip`}>
          <rect x={0} y={0} width={100} height={100} rx={24} ry={24} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${gid}-clip)`}>
        {/* dark neutral ground so the positioned blob reads by location */}
        <rect x={0} y={0} width={100} height={100} fill="#232733" />
        <rect x={0} y={0} width={100} height={100} fill={`url(#${gid})`} />
        {/* always-on quadrant compass — the learnable legend */}
        <rect x={0} y={0} width={tick} height={tick} fill={Q_NW} opacity={0.92} />
        <rect x={100 - tick} y={0} width={tick} height={tick} fill={Q_NE} opacity={0.92} />
        <rect x={0} y={100 - tick} width={tick} height={tick} fill={Q_SW} opacity={0.92} />
        <rect x={100 - tick} y={100 - tick} width={tick} height={tick} fill={Q_SE} opacity={0.92} />
      </g>
      <rect x={0.75} y={0.75} width={98.5} height={98.5} rx={23.5} ry={23.5}
        fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Chip — token + avatar/dot + name + mood word (the rail item / labelled unit)
// ---------------------------------------------------------------------------

interface MoodChipProps {
  valence: number;
  arousal: number;
  tokenSize: number;
  fontScale: number;
  characterName?: string;
  characterPortraitUrl?: string;
  characterColor?: string;
  showLabel: boolean;
  backgroundOpacity: number;
}

const MoodChip: React.FC<MoodChipProps> = ({
  valence, arousal, tokenSize, fontScale,
  characterName, characterPortraitUrl, characterColor, showLabel, backgroundOpacity,
}) => {
  const accent = characterColor || '#6a5be0';
  const avatarSize = Math.round(tokenSize * 0.9);
  const nameSize = Math.round(11 * fontScale);
  const wordSize = Math.round(10 * fontScale);
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: Math.round(7 * fontScale),
      padding: `${Math.round(4 * fontScale)}px ${Math.round(10 * fontScale)}px ${Math.round(4 * fontScale)}px ${Math.round(4 * fontScale)}px`,
      background: `rgba(15,18,28,${0.62 * backgroundOpacity})`,
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 999,
      color: '#eef2f9',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    }}>
      {characterName && (
        characterPortraitUrl ? (
          <img src={characterPortraitUrl} alt={characterName}
            style={{ width: avatarSize, height: avatarSize, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${accent}` }} />
        ) : (
          <span style={{
            width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
            background: accent, display: 'grid', placeItems: 'center',
            font: `700 ${Math.round(avatarSize * 0.5)}px system-ui, sans-serif`, color: '#fff',
          }}>{(characterName[0] || '').toUpperCase()}</span>
        )
      )}
      <MoodToken valence={valence} arousal={arousal} size={tokenSize} />
      {(characterName || showLabel) && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
          {characterName && (
            <b style={{ fontSize: nameSize, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
              {characterName}
            </b>
          )}
          {showLabel && (
            <span style={{ fontSize: wordSize, color: 'rgba(255,255,255,0.62)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {moodWord(valence, arousal)}
            </span>
          )}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Positioned single token — the character-anchored / screen-docked-single case
// ---------------------------------------------------------------------------

export interface CharacterMoodTokenProps {
  valence: number;
  arousal: number;
  config: MoodFrameConfig;
  characterName?: string;
  characterPortraitUrl?: string;
  characterColor?: string;
  characterPosition: { x: number; y: number };
  characterDimensions: { width: number; height: number };
  containerDimensions?: { width: number; height: number };
  /** Mobile scale-up (>1 on small viewports), mirroring the sibling frames. */
  fontScale?: number;
}

/** Estimated chip footprint for anchor math (rough but keeps it on-screen). */
function chipFootprint(tokenSize: number, hasName: boolean, showLabel: boolean, fontScale: number) {
  const h = Math.round(tokenSize + 8 * fontScale);
  const w = Math.round(
    tokenSize + 20 * fontScale +
    (hasName ? tokenSize * 0.9 + 8 : 0) +
    (hasName || showLabel ? 96 * fontScale : 0),
  );
  return { w, h };
}

export const CharacterMoodToken: React.FC<CharacterMoodTokenProps> = ({
  valence, arousal, config,
  characterName, characterPortraitUrl, characterColor,
  characterPosition, characterDimensions, containerDimensions, fontScale = 1,
}) => {
  if (!config.enabled) return null;
  // The token is small; scale the disc `size` down to a sensible glyph size,
  // then apply the mobile fontScale.
  const tokenSize = Math.max(20, Math.round(Math.min(config.size || 140, 88) * 0.34 * fontScale));
  const showLabel = config.showQualitativeLabel !== false;
  const hasName = !!characterName;
  const { w, h } = chipFootprint(tokenSize, hasName, showLabel, fontScale);

  let pos = config.dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(config.screenPosition, containerDimensions, config.offset, w, h)
    : calculateCharacterAnchorPosition(config.anchor, characterPosition, characterDimensions, config.offset, w, h);

  // Clamp into the container so the chip never leaves the stage — this is
  // the fix for the old frame being pushed off-screen on small viewports.
  if (containerDimensions) {
    const m = 4;
    pos = {
      x: Math.max(m, Math.min(pos.x, containerDimensions.width - w - m)),
      y: Math.max(m, Math.min(pos.y, containerDimensions.height - h - m)),
    };
  }

  return (
    <div style={{ position: 'absolute', left: pos.x, top: pos.y, pointerEvents: 'none', zIndex: 50 }}>
      <MoodChip
        valence={valence} arousal={arousal} tokenSize={tokenSize} fontScale={fontScale}
        characterName={characterName} characterPortraitUrl={characterPortraitUrl}
        characterColor={characterColor} showLabel={showLabel}
        backgroundOpacity={config.backgroundOpacity ?? 0.95}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// The rail — several characters, one wrapping row, never overlapping
// ---------------------------------------------------------------------------

export interface MoodRailEntry {
  key: string;
  valence: number;
  arousal: number;
  characterName?: string;
  characterPortraitUrl?: string;
  characterColor?: string;
  showLabel: boolean;
}

export interface MoodRailProps {
  entries: ReadonlyArray<MoodRailEntry>;
  /** Corner the rail docks to (derived from the characters' screenPosition). */
  screenPosition: MoodFrameScreenPosition;
  containerDimensions: { width: number; height: number };
  fontScale?: number;
  backgroundOpacity?: number;
  /** Distance (px) to push the rail inward from its corner edge so it stacks
   *  clear of other HUDs sharing the corner. Assigned by the unified HUD
   *  layout authority (layoutScreenHuds); 0 means flush to the edge. */
  offsetY?: number;
}

export const MoodRail: React.FC<MoodRailProps> = ({
  entries, screenPosition, containerDimensions, fontScale = 1, backgroundOpacity = 0.95,
  offsetY = 0,
}) => {
  if (entries.length === 0) return null;
  const tokenSize = Math.max(22, Math.round(30 * fontScale));
  const top = screenPosition.includes('top');
  const left = screenPosition.includes('left');
  const margin = Math.round(10 * fontScale);

  return (
    <div style={{
      position: 'absolute',
      [top ? 'top' : 'bottom']: margin + Math.abs(offsetY),
      [left ? 'left' : 'right']: margin,
      // wrap toward the interior; cap so the rail can't span the whole stage
      maxWidth: Math.max(120, containerDimensions.width - margin * 2),
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: left ? 'flex-start' : 'flex-end',
      gap: Math.round(8 * fontScale),
      pointerEvents: 'none',
      zIndex: 40,
    }}>
      {entries.map((e) => (
        <MoodChip
          key={e.key}
          valence={e.valence} arousal={e.arousal} tokenSize={tokenSize} fontScale={fontScale}
          characterName={e.characterName} characterPortraitUrl={e.characterPortraitUrl}
          characterColor={e.characterColor} showLabel={e.showLabel}
          backgroundOpacity={backgroundOpacity}
        />
      ))}
    </div>
  );
};
