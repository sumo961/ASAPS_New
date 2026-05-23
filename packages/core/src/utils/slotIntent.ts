/**
 * slotIntent — soft, responsive layout annotations for slot-mode beats.
 *
 * This is the data model for "intent-annotated responsive slots" (see the
 * project_responsive_layout_system plan). The author expresses *preferences*,
 * never geometry. The renderer honors them when it can and overrides them
 * only when reflow would otherwise break legibility.
 *
 * THE LOAD-BEARING INVARIANT: slotIntent is a beat PARAMETER
 * (beat.parameters.slotIntent). It must NEVER be serialized as the legacy
 * baked-pixel `locations[]` array. A beat carrying slotIntent — and no
 * legacy locations[] — stays slot-mode (responsive); slotIntent only hints
 * the flow, it does not pin pixels. Treating it as absolute geometry would
 * silently revert beats to the pre-slot layout bugs. This is the spine of
 * the whole feature.
 */

/**
 * How an element is anchored. NEVER raw x/y. An anchored element keeps its
 * relationship across every viewport and scale.
 *
 * `relativeTo`:
 *  - 'slot'         — within the element's own slot region
 *  - 'stage'        — the overall stage/flow area
 *  - 'element'      — relative to another element's resolved box (use
 *                     relativeElementId + edge + gap). e.g. a button that is
 *                     always `gap` px below the body's actual bottom,
 *                     wherever the body ends.
 *  - 'spatialLayer' — RESERVED for Phase 3 (map image + hotspots). Unused by
 *                     the current renderer; declared now so the data model
 *                     already supports normalized pinning to a uniformly-
 *                     scaled pictorial layer without a later migration.
 */
export interface SlotAnchor {
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'middle' | 'bottom';
  offset?: { x?: number; y?: number };
  relativeTo?: 'slot' | 'stage' | 'element' | 'spatialLayer';
  /** Required when relativeTo === 'element'. */
  relativeElementId?: string;
  /** Side of the reference element to anchor against (element-relative). */
  edge?: 'above' | 'below' | 'left' | 'right';
  /** Gap in px for element-relative anchoring. */
  gap?: number;
}

export interface SlotIntentEntry {
  /**
   * Soft target line count for a text slot (e.g. a title "should be 2
   * lines"). Honored at the design width and wider; the flow engine may
   * collapse or expand it on a viewport where keeping it would force text
   * under the legibility floor. Legibility always wins over this preference.
   */
  preferredLines?: number;
  /** Anchor for buttons / hotspots / movable slots. */
  anchor?: SlotAnchor;
  /**
   * Per-button anchor overrides for action slots that host multiple named
   * buttons (e.g. endScreen: 'restartButton' + 'creditsButton'). Keys are
   * the button identifiers the beat emits via `actionSlot.buttons`. A
   * button with an entry here is lifted OUT of the default flex row and
   * positioned independently inside the action region; buttons without an
   * entry stay in the row using the slot's `anchor` (the shared
   * align/gap/below-body policy). Use this for designs like "Credits in
   * the corner, Restart centered" without splitting beats.
   */
  buttonAnchors?: Record<string, SlotAnchor>;
}

/** Per-beat map: slot name → author intent for that slot. */
export type SlotIntent = Record<string, SlotIntentEntry>;

/**
 * Outcome of resolving one slot's intent at a given viewport — consumed by
 * the Visual Editor to show the author WHERE and WHY a preference was
 * overridden (override-visibility is an explicit Phase-1.5 requirement).
 */
export interface SlotIntentResolution {
  slot: string;
  /** What the author asked for. */
  requested?: SlotIntentEntry;
  /** Whether the request was honored at the resolved viewport. */
  applied: boolean;
  /** Human-readable reason when applied === false. */
  overrideReason?: string;
  /**
   * Viewport width (px) at/below which this preference stops holding, when
   * known. Lets the VE show "2-line title holds ≥ 900px".
   */
  holdsAboveWidth?: number;
}

/**
 * Whether a value is a usable slotIntent map. Defensive: slotIntent arrives
 * from serialized projects and AI output, so never assume shape.
 */
export function isSlotIntent(value: unknown): value is SlotIntent {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Read one slot's intent, tolerant of missing/garbage input. */
export function slotIntentFor(
  slotIntent: unknown,
  slotName: string
): SlotIntentEntry | undefined {
  if (!isSlotIntent(slotIntent)) return undefined;
  const entry = (slotIntent as SlotIntent)[slotName];
  return entry && typeof entry === 'object' ? entry : undefined;
}
