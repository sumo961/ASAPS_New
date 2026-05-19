/**
 * Slot-layout registry — schema-driven.
 *
 * Phase 1 of the responsive-layout effort (see project_responsive_layout_system
 * memory). A beat type opts into slot mode by declaring `layoutMode: "slot"`
 * and a `slots` array in beat-definitions/core-beats.json. The renderer reads
 * that here so the schema stays the single source of truth — no hardcoded
 * per-beat slot tables.
 *
 * Activation is per-instance: slot mode only applies to a beat that has NO
 * author-persisted pixel locations. Instances the author positioned in the
 * Visual Editor keep their baked coordinates and render via the unchanged
 * absolute path. This guarantees zero regression for existing projects.
 */

import beatDefinitions from '../../../../beat-definitions/core-beats.json';

export interface SlotSpec {
  /** Slot id (also the schema location name it draws from for body slots). */
  name: string;
  /** Layout role. 'body' = growing/scrolling text region; 'action' = button row. */
  role: 'body' | 'action' | 'title';
  /** For body/title slots: the content key to render. */
  source?: string;
  /** For body slots: grow with content. */
  grow?: boolean;
  /** For body slots: scroll internally when content exceeds the viewport. */
  scroll?: boolean;
  /** For action slots: the schema location names of the buttons in this row. */
  buttons?: string[];
}

/**
 * Phase 3 — spatial composite. A beat type opts in with
 * `layoutMode: "spatial"`, a `spatialLayer` descriptor (a uniformly-scaled
 * image, optionally with normalized 0–1 hotspots), and the usual `slots`
 * array (the responsive flow layer composited OVER the image). The two
 * layers stay decoupled so the flow text never gets uniformly scaled with
 * the picture (the load-bearing reason slot mode exists) and so each layer
 * can later be wrapped independently by the responsive animation model.
 */
export interface SpatialSpec {
  /** Content key for the image URL (e.g. 'background'). */
  source: string;
  /** How the image fits the stage. 'contain' = whole image, letterboxed
   *  (hotspots stay accurate); 'cover' = fill, may crop. Default 'contain'. */
  fit?: 'contain' | 'cover';
  /** The flow layer composited over the image. */
  slots: SlotSpec[];
}

interface BeatLayoutDef {
  layoutMode?: string;
  slots?: SlotSpec[];
  spatialLayer?: { source?: string; fit?: 'contain' | 'cover' };
}

function beatDef(beatType: string): BeatLayoutDef | undefined {
  return (beatDefinitions as { beatTypes?: Record<string, BeatLayoutDef> })
    .beatTypes?.[beatType];
}

/**
 * Whether this beat TYPE declares slot mode in the schema. Per-instance
 * activation (no author locations) is decided separately by the caller.
 */
export function isSlotModeBeatType(beatType: string): boolean {
  return beatDef(beatType)?.layoutMode === 'slot';
}

/** The ordered slot spec for a slot-mode beat type, or null if not slot-mode. */
export function getSlotSpec(beatType: string): SlotSpec[] | null {
  const def = beatDef(beatType);
  if (def?.layoutMode !== 'slot' || !Array.isArray(def.slots)) return null;
  return def.slots;
}

/**
 * Decide whether a given beat instance should render in slot mode.
 *
 * @param beatType        the beat type
 * @param authorPositioned whether the beat has author-persisted pixel
 *                         locations (baked in the Visual Editor). When true,
 *                         we always keep the absolute path — slot mode is for
 *                         instances the author has NOT manually positioned.
 */
export function shouldUseSlotMode(beatType: string, authorPositioned: boolean): boolean {
  if (authorPositioned) return false;
  return isSlotModeBeatType(beatType);
}

/** Whether this beat TYPE declares the Phase-3 spatial composite. */
export function isSpatialModeBeatType(beatType: string): boolean {
  return beatDef(beatType)?.layoutMode === 'spatial';
}

/**
 * The spatial spec (image layer + flow slots) for a spatial-mode beat type,
 * or null. Requires layoutMode:"spatial", a spatialLayer.source, and slots.
 */
export function getSpatialSpec(beatType: string): SpatialSpec | null {
  const def = beatDef(beatType);
  if (
    def?.layoutMode !== 'spatial' ||
    !def.spatialLayer?.source ||
    !Array.isArray(def.slots)
  ) {
    return null;
  }
  return {
    source: def.spatialLayer.source,
    fit: def.spatialLayer.fit ?? 'contain',
    slots: def.slots,
  };
}

/**
 * Per-instance spatial activation — same zero-regression guard as slot mode:
 * an author-positioned (baked-pixel) instance keeps the absolute path.
 */
export function shouldUseSpatialMode(beatType: string, authorPositioned: boolean): boolean {
  if (authorPositioned) return false;
  return isSpatialModeBeatType(beatType);
}
