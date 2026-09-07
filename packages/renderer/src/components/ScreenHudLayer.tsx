/**
 * ScreenHudLayer — the one place screen-docked HUDs are assembled and drawn.
 *
 * A screen-docked HUD (character meter frame, inventory frame, mood token or
 * disc) is anchored to a corner of the stage rather than to a character
 * standing on it. That distinction matters structurally: `PositionedBeatView`
 * mounts character-anchored frames from its `case 'character'` branch, so a
 * character who is not placed on stage gets no HUD from it at all. Screen HUDs
 * therefore have to be a top-level layer over the stage.
 *
 * That layer existed twice — written out inline in PreviewWindow and again in
 * WebPlayer — and not at all in the Visual Editor, which is why an author
 * could configure four counters, see an empty stage while editing, and only
 * discover the HUD by running the story. `hudLayout.ts` was written to end
 * exactly this class of problem for HUD-vs-HUD collisions; this module extends
 * the same single-authority idea to who draws them.
 *
 * Two exports, deliberately split:
 *
 *   buildScreenHudLayout()  decides what exists and where it goes, from plain
 *                           data. No engine, no React. It returns absolute
 *                           `rects`, which is what lets stage content reserve
 *                           space against HUDs it would otherwise slide under.
 *   <ScreenHudLayer>        draws that layout.
 *
 * Hosts resolve their own values before calling — the players read a live
 * engine, the editor has none and shows authored ranges at rest. Keeping value
 * resolution outside means the editor and the runtime share the layout without
 * the editor having to pretend a story is running.
 */
import React from 'react';
import { detectDeviceClass } from '@asaps/core';
import { CharacterMeterFrame, type MeterFrameConfig, type MeterCounterData } from './CharacterMeterFrame';
import {
  CompactHudStrip,
  compactStripWidthEstimate,
  COMPACT_STRIP_HEIGHT,
  type CompactHudItem,
} from './CompactHudStrip';
import { CharacterInventoryFrame, type InventoryItemData } from './CharacterInventoryFrame';
import { CharacterMoodFrame } from './CharacterMoodFrame';
import { MoodRail, type MoodRailEntry } from './CharacterMoodToken';
import { HudExplanationLayer } from './HudExplanationLayer';
import {
  layoutScreenHuds,
  placementMap,
  type HudBox,
  type HudCorner,
  type HudKind,
  type HudPlacement,
} from '../utils/hudLayout';

export interface ScreenHudCharacter {
  id: string;
  name: string;
  color?: string;
  portraitUrl?: string;
  /** Already resolved — `resolveMeterFrame` supplies the fallback. */
  meterFrame?: MeterFrameConfig | null;
  /** Already resolved to live (or at-rest) values via `toMeterCounterData`. */
  counters?: MeterCounterData[];
  inventoryFrame?: any;
  inventoryItems?: InventoryItemData[];
  moodFrame?: any;
  mood?: { valence: number; arousal: number };
}

export interface ScreenHudLayoutInput {
  characters: ScreenHudCharacter[];
  /** globalSettings.hudOverlays — timer / countdown reserve their corners. */
  hudOverlays?: any;
  /**
   * Boxes the host draws itself and this layer must flow around — the exported
   * player's language panel, for one. Same treatment as the global timer: not
   * rendered here, but occupying its corner so character frames pack clear.
   */
  extraBoxes?: HudBox[];
  stage: { width: number; height: number };
  /**
   * Phone HUD collapse. 'auto' (default) folds each corner's screen HUDs into
   * a slim tap-to-expand strip when the STAGE is phone-class (< 640px wide —
   * responsive stories on phones, or fixed stories authored at phone size);
   * 'always' forces the strip on every stage; 'never' keeps full cards.
   * Falls back to `hudOverlays.compactMode` when omitted.
   */
  compactMode?: HudCompactMode;
}

export type HudCompactMode = 'auto' | 'always' | 'never';

/** Decide whether this stage gets the collapsed strip. Pure; exported for tests and hosts. */
export function resolveHudCompact(mode: HudCompactMode | undefined, stage: { width: number }): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return detectDeviceClass(stage.width) === 'phone';
}

/** One corner's collapsed HUDs. */
export interface CompactStrip {
  id: string;
  corner: HudCorner;
  items: CompactHudItem[];
}

/** A packed HUD's absolute box on the stage, for reserving space against it. */
export interface HudRect {
  id: string;
  kind: HudKind;
  /** Which corner it is anchored to — a stack is per corner. */
  corner: HudCorner;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenHudLayout {
  boxes: HudBox[];
  placements: Map<string, HudPlacement>;
  /** Every packed HUD in absolute stage coordinates. */
  rects: HudRect[];
  rails: Record<string, MoodRailEntry[]>;
  discs: ScreenHudCharacter[];
  meters: Array<{ c: ScreenHudCharacter; frame: any; counters: MeterCounterData[] }>;
  inventories: Array<{ c: ScreenHudCharacter; frame: any; items: InventoryItemData[] }>;
  /** Phone collapse active: `boxes`/`rects` describe the strips, not the cards. */
  compact: boolean;
  strips: CompactStrip[];
  /** In compact mode, where the full cards go when a strip is expanded. */
  expanded?: { boxes: HudBox[]; placements: Map<string, HudPlacement> };
}

const toCorner = (s?: string): HudCorner => ((s || 'top-left').replace('screen-', '') as HudCorner);

const EMPTY: ScreenHudLayout = {
  boxes: [], placements: new Map(), rects: [], rails: {}, discs: [], meters: [], inventories: [],
  compact: false, strips: [],
};

/**
 * Height a meter frame will occupy. Estimated rather than measured because
 * packing has to happen before anything renders — the name header and its gap
 * are counted explicitly, since forgetting them lets the next HUD in the
 * corner overlap the first one's title.
 */
function meterHeightEstimate(frame: any, counterCount: number): number {
  return (frame.style?.padding ?? 8) * 2 +
    counterCount * ((frame.meterHeight ?? 12) + (frame.showLabels ? 16 : 0)) +
    Math.max(0, counterCount - 1) * (frame.meterSpacing ?? 6) +
    (16 + (frame.meterSpacing ?? 6));
}

function inventoryHeightEstimate(frame: any, itemCount: number): number {
  const cols = Math.max(1, frame.columns ?? 4);
  const rows = Math.ceil(itemCount / cols);
  return (frame.style?.padding ?? 10) * 2 + 20 +
    rows * ((frame.itemSize ?? 36) + (frame.showLabels ? 14 : 0)) +
    Math.max(0, rows - 1) * (frame.itemSpacing ?? 6);
}

/**
 * Decide which screen HUDs exist and pack them into their corners.
 *
 * Global timer and countdown HUDs are drawn by the renderer, not by this
 * layer, but they still enter the box list: they occupy their corner, and
 * character frames must flow clear of them.
 */
export function buildScreenHudLayout(input: ScreenHudLayoutInput): ScreenHudLayout {
  const { characters, hudOverlays, stage, extraBoxes } = input;
  if (!characters || characters.length === 0) {
    if (!hudOverlays?.timerHud?.enabled && !hudOverlays?.countdownMeter?.enabled
        && !(extraBoxes && extraBoxes.length > 0)) return EMPTY;
  }

  const rails: Record<string, MoodRailEntry[]> = {};
  const discs: ScreenHudCharacter[] = [];
  const meters: ScreenHudLayout['meters'] = [];
  const inventories: ScreenHudLayout['inventories'] = [];

  for (const c of characters || []) {
    // Token-style mood HUDs group into a per-corner rail; disc-style ones are
    // self-anchored cards and are not packed with the rest.
    const mf = c.moodFrame;
    if (mf?.enabled && mf.dockMode === 'screen' && c.mood) {
      if ((mf.displayStyle ?? 'token') === 'disc') {
        discs.push(c);
      } else {
        const corner = mf.screenPosition || 'screen-top-right';
        (rails[corner] ||= []).push({
          key: c.id,
          valence: c.mood.valence,
          arousal: c.mood.arousal,
          characterName: c.name,
          characterPortraitUrl: c.portraitUrl,
          characterColor: c.color,
          showLabel: mf.showQualitativeLabel !== false,
        });
      }
    }

    const frame: any = c.meterFrame;
    if (frame && frame.dockMode === 'screen' && (c.counters?.length ?? 0) > 0) {
      meters.push({ c, frame, counters: c.counters! });
    }

    const inv: any = c.inventoryFrame;
    if (inv && inv.dockMode === 'screen' && (c.inventoryItems?.length ?? 0) > 0) {
      inventories.push({ c, frame: inv, items: c.inventoryItems! });
    }
  }

  const compact = resolveHudCompact(input.compactMode ?? hudOverlays?.compactMode, stage);

  const boxes: HudBox[] = [...(extraBoxes || [])];
  if (hudOverlays?.timerHud?.enabled) {
    boxes.push({
      id: '__timer', corner: toCorner(hudOverlays.timerHud.position), width: 160,
      height: (hudOverlays.timerHud.fontSize ?? 18) + (hudOverlays.timerHud.padding ?? 8) * 2 + 8,
      kind: 'timer',
    });
  }
  if (hudOverlays?.countdownMeter?.enabled) {
    boxes.push({
      id: '__countdown', corner: toCorner(hudOverlays.countdownMeter.position),
      width: Math.round(stage.width * ((hudOverlays.countdownMeter.meterWidth ?? 60) / 100)),
      height: (hudOverlays.countdownMeter.meterHeight ?? 12) + 26, kind: 'countdown',
    });
  }
  // The full cards, packed as they would be drawn. In compact mode this is the
  // EXPANDED layout (drawn as an overlay, reserving nothing); otherwise it is
  // the layout, full stop.
  const cardBoxes: HudBox[] = [...boxes];
  for (const m of meters) {
    cardBoxes.push({
      id: `meter-${m.c.id}`, corner: toCorner(m.frame.screenPosition ?? 'screen-top-left'),
      width: m.frame.width ?? 160, height: meterHeightEstimate(m.frame, m.counters.length), kind: 'meter',
    });
  }
  for (const v of inventories) {
    cardBoxes.push({
      id: `inv-${v.c.id}`, corner: toCorner(v.frame.screenPosition ?? 'screen-bottom-right'),
      width: (v.frame.itemSize ?? 36) * Math.max(1, v.frame.columns ?? 4) + 24,
      height: inventoryHeightEstimate(v.frame, v.items.length), kind: 'inventory',
    });
  }
  for (const corner of Object.keys(rails)) {
    cardBoxes.push({ id: `mood-rail-${corner}`, corner: toCorner(corner), width: 200, height: 54, kind: 'mood' });
  }

  const toRects = (bs: HudBox[], pl: Map<string, HudPlacement>): HudRect[] => bs.map((b) => {
    const p = pl.get(b.id);
    return { id: b.id, kind: b.kind, corner: b.corner, x: p?.left ?? 0, y: p?.top ?? 0, width: b.width, height: b.height };
  });

  if (!compact) {
    const placements = placementMap(layoutScreenHuds(cardBoxes, stage));
    return { boxes: cardBoxes, placements, rects: toRects(cardBoxes, placements), rails, discs, meters, inventories, compact: false, strips: [] };
  }

  // Compact: fold every card in a corner into one strip. Timer / countdown /
  // host chrome keep their own boxes — they are small, drawn elsewhere, and
  // the strip packs below them like a card would.
  const byCorner = new Map<HudCorner, CompactHudItem[]>();
  const push = (corner: HudCorner, item: CompactHudItem) => {
    (byCorner.get(corner) ?? byCorner.set(corner, []).get(corner)!).push(item);
  };
  for (const m of meters) {
    push(toCorner(m.frame.screenPosition ?? 'screen-top-left'),
      { kind: 'meter', characterId: m.c.id, name: m.c.name, color: m.c.color, counters: m.counters });
  }
  for (const v of inventories) {
    push(toCorner(v.frame.screenPosition ?? 'screen-bottom-right'),
      { kind: 'inventory', characterId: v.c.id, name: v.c.name, count: v.items.reduce((n, it) => n + (it.quantity ?? 1), 0) });
  }
  for (const [corner, entries] of Object.entries(rails)) {
    for (const e of entries) {
      push(toCorner(corner), { kind: 'mood', characterId: e.key, name: e.characterName ?? '', valence: e.valence, arousal: e.arousal });
    }
  }
  const strips: CompactStrip[] = [];
  const stripBoxes: HudBox[] = [...boxes];
  for (const [corner, items] of byCorner) {
    const id = `compact-${corner}`;
    strips.push({ id, corner, items });
    stripBoxes.push({ id, corner, width: compactStripWidthEstimate(items), height: COMPACT_STRIP_HEIGHT, kind: 'meter' });
  }
  const placements = placementMap(layoutScreenHuds(stripBoxes, stage));
  // Expanded cards stack BELOW their strip (same kind, earlier index), so the
  // tapped strip stays visible as the handle that folds them again.
  const stripOnly = stripBoxes.slice(boxes.length);
  const expandedBoxes: HudBox[] = [...boxes, ...stripOnly, ...cardBoxes.slice(boxes.length)];
  const expandedPlacements = placementMap(layoutScreenHuds(expandedBoxes, stage));
  return {
    boxes: stripBoxes, placements, rects: toRects(stripBoxes, placements),
    rails, discs, meters, inventories,
    compact: true, strips, expanded: { boxes: expandedBoxes, placements: expandedPlacements },
  };
}

export interface ScreenHudLayerProps {
  layout: ScreenHudLayout;
  stage: { width: number; height: number };
  palette?: any;
  /** Callout annotations over the HUDs — explanation beats and the overlay trigger. */
  explanation?: {
    captions?: any;
    skipKinds?: any;
    onAcknowledge?: () => void;
    accentColor?: string;
    accentTextColor?: string;
    textColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
  };
  zIndex?: number;
  /**
   * Compact mode: an expanded strip collapses again when this changes —
   * hosts pass the current beat id so a panel opened on one beat does not
   * sit over the next.
   */
  collapseKey?: string;
  fontScale?: number;
}

const PULSE_MS = 2200;
const EXPAND_AUTO_COLLAPSE_MS = 8000;

/** Values worth pulsing about while the strip is collapsed. */
function valueSnapshot(layout: ScreenHudLayout): Map<string, { label: string; value: number }> {
  const m = new Map<string, { label: string; value: number }>();
  for (const { c, counters } of layout.meters) {
    for (const k of counters) {
      m.set(`m:${c.id}:${k.name}`, { label: k.displayName || k.name || c.name, value: k.value });
    }
  }
  for (const { c, items } of layout.inventories) {
    m.set(`i:${c.id}`, { label: c.name, value: items.reduce((n, it) => n + (it.quantity ?? 1), 0) });
  }
  return m;
}

/** Draw a built layout. Pointer-events stay off so the stage below is usable. */
export function ScreenHudLayer({ layout, stage, palette, explanation, zIndex = 40, collapseKey, fontScale = 1 }: ScreenHudLayerProps) {
  const { rails, discs, meters, inventories, boxes, placements, compact, strips } = layout;
  const cardPlacements = compact && layout.expanded ? layout.expanded.placements : placements;
  const offsetFor = (id: string) => cardPlacements.get(id)?.offsetY ?? 0;

  // ---- compact-mode interaction state ----
  const [expandedCorner, setExpandedCorner] = React.useState<HudCorner | null>(null);
  const [pulses, setPulses] = React.useState<Record<string, { text: string; at: number }>>({});
  const prevSnapshot = React.useRef<Map<string, { label: string; value: number }> | null>(null);
  // Per-corner clear timers. They must NOT be the change-effect's cleanup:
  // that effect re-runs on every layout tick, and a cleanup there cancelled
  // the clear, so the first pulse's element lived forever (faded to opacity 0
  // by its own animation) and every later pulse only retexted an invisible
  // node — "pulses once per playthrough". Timers only die on unmount.
  const pulseTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  React.useEffect(() => () => { Object.values(pulseTimers.current).forEach(clearTimeout); }, []);

  // Beat change (or leaving compact mode) folds an open panel.
  React.useEffect(() => { setExpandedCorner(null); }, [collapseKey, compact]);

  // An open panel folds itself after a while — it reserves nothing and would
  // otherwise sit over the next thing the player needs to read.
  React.useEffect(() => {
    if (!expandedCorner) return;
    const t = setTimeout(() => setExpandedCorner(null), EXPAND_AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [expandedCorner]);

  // Change pulses: a value that moves while the strip is collapsed flashes the
  // strip and shows the delta for a moment — the "+1 suspicion" beat that an
  // always-on card used to carry for free.
  React.useEffect(() => {
    const next = valueSnapshot(layout);
    const prev = prevSnapshot.current;
    prevSnapshot.current = next;
    if (!compact || !prev) return;
    const perCorner: Record<string, string[]> = {};
    for (const strip of strips) {
      for (const it of strip.items) {
        if (it.kind === 'meter') {
          for (const k of it.counters) {
            const key = `m:${it.characterId}:${k.name}`;
            const was = prev.get(key);
            if (was && was.value !== k.value) {
              const d = k.value - was.value;
              (perCorner[strip.corner] ||= []).push(`${(k.displayName || k.name || it.name)} ${d > 0 ? '+' : ''}${Math.round(d * 100) / 100}`);
            }
          }
        } else if (it.kind === 'inventory') {
          const was = prev.get(`i:${it.characterId}`);
          if (was && was.value !== it.count) {
            const d = it.count - was.value;
            (perCorner[strip.corner] ||= []).push(d > 0 ? `+${d} item${d === 1 ? '' : 's'}` : `${d} item${d === -1 ? '' : 's'}`);
          }
        }
      }
    }
    const corners = Object.keys(perCorner);
    if (corners.length === 0) return;
    const at = Date.now();
    setPulses((p) => {
      const n = { ...p };
      for (const c of corners) n[c] = { text: perCorner[c].join(' · '), at };
      return n;
    });
    for (const c of corners) {
      clearTimeout(pulseTimers.current[c]);
      pulseTimers.current[c] = setTimeout(() => {
        setPulses((p) => {
          if (p[c]?.at !== at) return p; // a newer pulse owns this corner now
          const n = { ...p }; delete n[c]; return n;
        });
      }, PULSE_MS);
    }
    // Layout identity changes on every value tick; that is exactly the signal.
  }, [layout, compact, strips]);

  const cornerOf = (screenPosition: string | undefined, fallback: string) =>
    toCorner(screenPosition ?? fallback);
  const showCard = (corner: HudCorner) => !compact || expandedCorner === corner;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex }}>
      {compact && (
        <style>{`@keyframes asapsHudPulse { 0% { opacity: 0; transform: translateY(-4px); } 12% { opacity: 1; transform: translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>
      )}
      {compact && expandedCorner && (
        // Scrim: tap anywhere to fold the panel back. Reserves nothing.
        <div
          data-testid="compact-hud-scrim"
          onClick={() => setExpandedCorner(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', pointerEvents: 'auto' }}
        />
      )}
      {compact && strips.map((strip) => {
        const p = placements.get(strip.id);
        return (
          <CompactHudStrip
            key={strip.id}
            items={strip.items}
            left={p?.left ?? 12}
            top={p?.top ?? 12}
            fontScale={fontScale}
            pulse={pulses[strip.corner] ? { text: pulses[strip.corner].text, at: pulses[strip.corner].at } : null}
            atBottom={strip.corner.startsWith('bottom')}
            expanded={expandedCorner === strip.corner}
            onToggle={() => setExpandedCorner((c) => (c === strip.corner ? null : strip.corner))}
          />
        );
      })}
      {Object.entries(rails).filter(([corner]) => showCard(toCorner(corner))).map(([corner, entries]) => (
        <MoodRail
          key={`mood-rail-${corner}`}
          entries={entries}
          screenPosition={corner as any}
          containerDimensions={stage}
          offsetY={offsetFor(`mood-rail-${corner}`)}
        />
      ))}
      {discs.map((c) => (
        <CharacterMoodFrame
          key={`mood-hud-${c.id}`}
          valence={c.mood!.valence}
          arousal={c.mood!.arousal}
          config={c.moodFrame}
          palette={palette}
          characterName={c.name}
          characterPortraitUrl={c.portraitUrl}
          characterColor={c.color}
          characterPosition={{ x: 0, y: 0 }}
          characterDimensions={{ width: 0, height: 0 }}
          containerDimensions={stage}
        />
      ))}
      {meters.filter(({ frame }) => showCard(cornerOf(frame.screenPosition, 'screen-top-left'))).map(({ c, frame, counters }) => (
        <CharacterMeterFrame
          key={`meter-hud-${c.id}`}
          counters={counters}
          config={{
            ...frame,
            offset: { x: frame.offset?.x ?? 0, y: (frame.offset?.y ?? 0) + offsetFor(`meter-${c.id}`) },
          }}
          characterPosition={{ x: 0, y: 0 }}
          characterDimensions={{ width: 0, height: 0 }}
          containerDimensions={stage}
          characterName={c.name}
          characterColor={c.color}
        />
      ))}
      {inventories.filter(({ frame }) => showCard(cornerOf(frame.screenPosition, 'screen-bottom-right'))).map(({ c, frame, items }) => (
        <CharacterInventoryFrame
          key={`inventory-hud-${c.id}`}
          items={items}
          config={{
            ...frame,
            offset: { x: frame.offset?.x ?? 0, y: (frame.offset?.y ?? 0) + offsetFor(`inv-${c.id}`) },
          }}
          characterPosition={{ x: 0, y: 0 }}
          characterDimensions={{ width: 0, height: 0 }}
          containerDimensions={stage}
          isVisible={true}
        />
      ))}
      {explanation && (
        <HudExplanationLayer
          boxes={boxes}
          placements={placements}
          stage={stage}
          captions={explanation.captions}
          skipKinds={explanation.skipKinds}
          onAcknowledge={explanation.onAcknowledge}
          accentColor={explanation.accentColor}
          accentTextColor={explanation.accentTextColor}
          textColor={explanation.textColor}
          backgroundColor={explanation.backgroundColor}
          fontFamily={explanation.fontFamily}
        />
      )}
    </div>
  );
}
