import React from 'react';
import { moodLabel } from '../utils/moodWords';
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
  /** The token sits on its own character: who it belongs to needs no saying. */
  own?: boolean;
  /** Name and mood word only after a click (MoodFrameConfig.labelMode 'onClick'). */
  collapsible?: boolean;
  /** It opened or closed, and so changed size. */
  onResize?: () => void;
}

/**
 * What a chip shows. Never the initial (or portrait) and the name together:
 * the mark stands for the name while the name is not shown.
 *  - open: the coloured square, the name (unless the chip sits on its own
 *    character and is always open) and the mood word;
 *  - closed (collapsible, before a click): the square, and the mark when the
 *    chip is away from its character.
 */
export function chipParts(opts: { hasName: boolean; showLabel: boolean; own: boolean; collapsible: boolean; open: boolean }): { mark: boolean; name: boolean; word: boolean } {
  const name = opts.open && opts.hasName && (!opts.own || opts.collapsible);
  return { name, word: opts.open && opts.showLabel, mark: opts.hasName && !name && !opts.own };
}

const MoodChip: React.FC<MoodChipProps> = ({
  valence, arousal, tokenSize, fontScale,
  characterName, characterPortraitUrl, characterColor, showLabel, backgroundOpacity,
  own = false, collapsible = false, onResize,
}) => {
  const [opened, setOpened] = React.useState(false);
  const open = !collapsible || opened;
  const resized = React.useRef(onResize);
  resized.current = onResize;
  React.useLayoutEffect(() => { resized.current?.(); }, [open]);
  const parts = chipParts({ hasName: !!characterName, showLabel, own, collapsible, open });
  const word = moodLabel(moodWord(valence, arousal));
  const accent = characterColor || '#6a5be0';
  const avatarSize = Math.round(tokenSize * 0.9);
  const nameSize = Math.round(11 * fontScale);
  const wordSize = Math.round(10 * fontScale);
  const labelled = parts.name || parts.word;
  const pad = Math.round(4 * fontScale);
  const chipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: Math.round(7 * fontScale),
    padding: `${pad}px ${labelled ? Math.round(10 * fontScale) : pad}px ${pad}px ${pad}px`,
    background: `rgba(15,18,28,${0.62 * backgroundOpacity})`,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 999,
    color: '#eef2f9',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    font: 'inherit',
    margin: 0,
  };
  // A click opens and closes it, and is the token's own: it must not also
  // count as a click on the stage (which continues a line).
  const mine = (e: React.SyntheticEvent) => e.stopPropagation();
  const inside = (
    <>
      {parts.mark && characterName && (
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
      {labelled && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0, textAlign: 'start' }}>
          {parts.name && (
            <b style={{ fontSize: nameSize, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
              {characterName}
            </b>
          )}
          {parts.word && (
            <span style={{ fontSize: wordSize, color: 'rgba(255,255,255,0.62)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {word}
            </span>
          )}
        </span>
      )}
    </>
  );
  return collapsible ? (
    <button
      type="button"
      data-mood-chip={open ? 'open' : 'closed'}
      aria-expanded={open}
      aria-label={[characterName, word].filter(Boolean).join(', ')}
      title={open ? undefined : [characterName, word].filter(Boolean).join(' · ')}
      onClick={(e) => { e.stopPropagation(); setOpened((o) => !o); }}
      onMouseDown={mine} onPointerDown={mine} onTouchStart={mine}
      style={{ ...chipStyle, cursor: 'pointer', pointerEvents: 'auto' }}
    >{inside}</button>
  ) : (
    <div data-mood-chip="open" style={chipStyle}>{inside}</div>
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
function chipFootprint(tokenSize: number, parts: { mark: boolean; name: boolean; word: boolean }, fontScale: number) {
  const h = Math.round(tokenSize + 8 * fontScale);
  const labelled = parts.name || parts.word;
  const w = Math.round(
    tokenSize + (labelled ? 20 : 10) * fontScale +
    (parts.mark ? tokenSize * 0.9 + 8 : 0) +
    (parts.name ? 96 * fontScale : parts.word ? 70 * fontScale : 0),
  );
  return { w, h };
}

/** The character-docked tokens now drawn, so they can make room for one another. */
const onStage = new Set<{ el: React.RefObject<HTMLDivElement | null>; settle: () => void }>();
function settleAll(): void {
  const live = Array.from(onStage).filter((t) => t.el.current);
  live.sort((a, b) => (a.el.current!.compareDocumentPosition(b.el.current!) & 4 ? -1 : 1));
  for (const t of live) t.settle();
}

/** Anchors that put the token on its own character's axis: above, below, or at their feet. */
const ON_OWN_CHARACTER = new Set<MoodFrameAnchor>(['base', 'top', 'bottom']);

interface Box { left: number; top: number; right: number; bottom: number }
const crosses = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * How far to move a token so it stands clear of the tokens placed before
 * it: straight up, or down where there is no room above. Characters who
 * stand close together would otherwise have their tokens on top of one
 * another. `mine` and `others` in the same coordinates as `stage`.
 */
export function stepAside(mine: Box, others: ReadonlyArray<Box>, stage: Box, gap = 4): number {
  const h = mine.bottom - mine.top;
  const { left, right } = mine;
  const hitAt = (dy: number) => others.find((o) => crosses({ left, right, top: mine.top + dy, bottom: mine.bottom + dy }, o));
  if (!hitAt(0)) return 0;
  // All the way one way, past whatever else is there.
  const go = (up: boolean): number | null => {
    let dy = 0;
    for (let pass = 0; pass <= others.length; pass++) {
      const hit = hitAt(dy);
      if (!hit) return dy;
      dy = up ? hit.top - gap - h - mine.top : hit.bottom + gap - mine.top;
      if (up ? mine.top + dy < stage.top : mine.bottom + dy > stage.bottom) return null;
    }
    return null;
  };
  const above = go(true);
  const below = go(false);
  // The shorter way, so it stays near its character; up when it is a tie.
  if (above === null || below === null) return above ?? below ?? 0;
  return -above <= below ? above : below;
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
  const own = config.dockMode !== 'screen' && ON_OWN_CHARACTER.has(config.anchor);
  const collapsible = config.labelMode === 'onClick';
  // Placed by its size when closed (or always open): opening it grows it to the right.
  const { w, h } = chipFootprint(tokenSize, chipParts({ hasName, showLabel, own, collapsible, open: !collapsible }), fontScale);
  const ref = React.useRef<HTMLDivElement>(null);
  // Clear of the tokens before it on this stage (see stepAside).
  const settle = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    // Each token is drawn inside its own character's element: the stage is
    // the first thing around this one that holds other tokens too.
    let host: HTMLElement | null = el.parentElement;
    while (host && host !== host.ownerDocument.body && host.querySelectorAll('[data-mood-token]').length < 2) host = host.parentElement;
    // A plain box: a DOMRect's sides are not its own properties, so a copy of one ({...rect}) is empty.
    const chipOf = (t: HTMLElement): Box & { width: number } => {
      const r = (t.firstElementChild ?? t).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
    };
    const box = chipOf(el);
    if (!host || host === host.ownerDocument.body || box.width <= 0) return;
    const before: Box[] = [];
    for (const other of Array.from(host.querySelectorAll<HTMLElement>('[data-mood-token]'))) {
      if (other === el) break;
      before.push(chipOf(other));
    }
    if (before.length === 0) return;
    // Not under a meter, an inventory or a mood panel on the way either
    // (those are drawn over the stage, some from outside it).
    host.ownerDocument.querySelectorAll<HTMLElement>('[data-hud-frame]').forEach((panel) => {
      const r = panel.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) before.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
    const scale = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
    const dy = stepAside(box, before, host.getBoundingClientRect(), 4 * scale);
    if (dy) el.style.transform = `translateY(${dy / scale}px)`;
  }, []);
  const docked = config.dockMode !== 'screen';
  // Tokens come and go one by one (each appears when its character is met),
  // and one that opens grows: whenever that happens, all of them look again,
  // first to last, so each sees where the ones before it ended up.
  React.useLayoutEffect(() => {
    if (!docked) return;
    const entry = { el: ref, settle };
    onStage.add(entry);
    settleAll();
    // A stage drawn before it has a size (or scaled later) gives no
    // measurements at first: look again once this token has its size.
    const chip = ref.current?.firstElementChild;
    const sized = chip && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => settleAll()) : null;
    if (chip) sized?.observe(chip);
    return () => { sized?.disconnect(); onStage.delete(entry); settleAll(); };
  }, [docked, settle]);
  React.useLayoutEffect(() => { if (docked) settleAll(); }, [docked, config.anchor, characterPosition.x, characterPosition.y, characterDimensions.width, characterDimensions.height, w, h]);

  let pos = config.dockMode === 'screen' && containerDimensions
    ? calculateScreenPosition(config.screenPosition, containerDimensions, config.offset, w, h)
    : calculateCharacterAnchorPosition(config.anchor, characterPosition, characterDimensions, config.offset, w, h);

  // Beside a character at the edge of the stage there is no room: the chip
  // goes above (or below) them instead. Sliding it back onto the stage put
  // it on the neighbour's chip.
  if (containerDimensions && config.dockMode !== 'screen') {
    const m = 4;
    const offStage = pos.x < m || pos.x + w > containerDimensions.width - m;
    const over = config.anchor === 'top-left' || config.anchor === 'top-right' ? 'top'
      : config.anchor === 'bottom-left' || config.anchor === 'bottom-right' ? 'bottom' : null;
    if (offStage && over) pos = calculateCharacterAnchorPosition(over, characterPosition, characterDimensions, config.offset, w, h);
  }

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
    <div ref={ref} data-mood-token={characterName || ''} style={{ position: 'absolute', left: pos.x, top: pos.y, pointerEvents: 'none', zIndex: 50 }}>
      <MoodChip
        valence={valence} arousal={arousal} tokenSize={tokenSize} fontScale={fontScale}
        characterName={characterName} characterPortraitUrl={characterPortraitUrl}
        characterColor={characterColor} showLabel={showLabel}
        backgroundOpacity={config.backgroundOpacity ?? 0.95}
        own={own} collapsible={collapsible} onResize={docked ? settleAll : undefined}
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
  /** Name and mood word only after a click. */
  collapsible?: boolean;
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
          backgroundOpacity={backgroundOpacity} collapsible={e.collapsible}
        />
      ))}
    </div>
  );
};
