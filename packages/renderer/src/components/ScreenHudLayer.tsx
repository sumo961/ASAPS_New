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
import { CharacterMeterFrame, type MeterFrameConfig, type MeterCounterData } from './CharacterMeterFrame';
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
  stage: { width: number; height: number };
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
}

const toCorner = (s?: string): HudCorner => ((s || 'top-left').replace('screen-', '') as HudCorner);

const EMPTY: ScreenHudLayout = {
  boxes: [], placements: new Map(), rects: [], rails: {}, discs: [], meters: [], inventories: [],
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
  const { characters, hudOverlays, stage } = input;
  if (!characters || characters.length === 0) {
    if (!hudOverlays?.timerHud?.enabled && !hudOverlays?.countdownMeter?.enabled) return EMPTY;
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

  const boxes: HudBox[] = [];
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
  for (const m of meters) {
    boxes.push({
      id: `meter-${m.c.id}`, corner: toCorner(m.frame.screenPosition ?? 'screen-top-left'),
      width: m.frame.width ?? 160, height: meterHeightEstimate(m.frame, m.counters.length), kind: 'meter',
    });
  }
  for (const v of inventories) {
    boxes.push({
      id: `inv-${v.c.id}`, corner: toCorner(v.frame.screenPosition ?? 'screen-bottom-right'),
      width: (v.frame.itemSize ?? 36) * Math.max(1, v.frame.columns ?? 4) + 24,
      height: inventoryHeightEstimate(v.frame, v.items.length), kind: 'inventory',
    });
  }
  for (const corner of Object.keys(rails)) {
    boxes.push({ id: `mood-rail-${corner}`, corner: toCorner(corner), width: 200, height: 54, kind: 'mood' });
  }

  const placements = placementMap(layoutScreenHuds(boxes, stage));
  const rects: HudRect[] = boxes.map((b) => {
    const p = placements.get(b.id);
    return { id: b.id, kind: b.kind, corner: b.corner, x: p?.left ?? 0, y: p?.top ?? 0, width: b.width, height: b.height };
  });

  return { boxes, placements, rects, rails, discs, meters, inventories };
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
}

/** Draw a built layout. Pointer-events stay off so the stage below is usable. */
export function ScreenHudLayer({ layout, stage, palette, explanation, zIndex = 40 }: ScreenHudLayerProps) {
  const { rails, discs, meters, inventories, boxes, placements } = layout;
  const offsetFor = (id: string) => placements.get(id)?.offsetY ?? 0;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex }}>
      {Object.entries(rails).map(([corner, entries]) => (
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
      {meters.map(({ c, frame, counters }) => (
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
      {inventories.map(({ c, frame, items }) => (
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
