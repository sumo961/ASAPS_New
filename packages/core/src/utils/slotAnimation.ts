/**
 * slotAnimation — responsive motion intent (P3-anim).
 *
 * The legacy `Beat.animations: AnimationPath[]` is keyframed paths over
 * absolute element x/y, which is meaningless in slot/spatial mode (no
 * authored x/y at runtime — the layout engine resolves position). The
 * responsive analog is INTENT, not pixel keyframes: declare what should
 * happen, the renderer applies it against the currently-resolved slot box
 * / spatial-image rect, so it survives reflow / orientation / viewport.
 *
 * Field name `slotAnimations` (distinct from the legacy `animations`)
 * carries the slot enter/exit/emphasis subset today; will extend with
 * `spatial` (pan/zoom) and `hotspot` (reveal) subkeys in later P3-anim
 * increments per the spec in project_responsive_layout_system memory.
 *
 * P3-anim-1 ships with a single supported preset: `fade` slot enter.
 */

/** Supported animation presets. New presets land per P3-anim phasing.
 *
 * `'path'` is the keyframe-driven escape hatch: the renderer drives a
 * transform along the SlotPath waypoints (anchor + percent offsets)
 * rather than picking a built-in CSS animation. Use this when the
 * presets don't express the motion an author needs — the migrator
 * targets this for legacy AnimationPath[] beats. */
export type SlotAnimationPreset =
  | 'fade'
  | 'slide-in-left'
  | 'slide-in-right'
  | 'slide-in-top'
  | 'slide-in-bottom'
  | 'scale-in'
  | 'pulse'
  | 'shake'
  | 'path';

/**
 * A single animation event on a slot. `preset` is the kind; timing is
 * optional with sensible defaults. `distance` is RELATIVE (percent of the
 * slot's resolved box) — never pixels — so it survives any viewport.
 *
 * When `preset === 'path'`, the renderer reads `path.waypoints` and
 * drives a frame-by-frame transform instead of one of the CSS preset
 * animations. The `path` field is ignored for any other preset.
 */
export interface SlotAnimation {
  preset: SlotAnimationPreset;
  /** Milliseconds. Default ~400 for enter, ~250 for emphasis. */
  duration?: number;
  /** Milliseconds. */
  delay?: number;
  /** CSS easing keyword or cubic-bezier. Default 'ease-out'. */
  easing?: string;
  /** % of slot box for slide presets. Default 100 (= one slot-box). */
  distance?: number;
  /** Required when preset === 'path'. Ignored otherwise. */
  path?: SlotPath;
}

/**
 * A waypoint along a slot path. Encoded layout-agnostic so it survives
 * reflow / viewport / orientation:
 *
 *  - `anchor` picks a point on the slot's RESOLVED box (e.g. center,
 *    top-left). Default { h: 'center', v: 'center' }.
 *  - `dxPercent` / `dyPercent` are signed percentages of the STAGE
 *    width / height, applied from the anchor point. The renderer
 *    recomputes them every frame against the current stage box, so a
 *    waypoint at `{ h:'center', v:'center', dxPercent: -20 }` always
 *    lands 20% of the stage to the LEFT of the slot's center, on any
 *    viewport.
 *  - `t` (0..1) is the normalized time along the total animation
 *    duration this waypoint should be hit. Defaults to evenly-spaced
 *    distribution across the waypoint array when omitted.
 *  - `easing` overrides the leg's easing for the segment ENDING at
 *    this waypoint. Falls back to the animation's `easing` then to
 *    'linear'.
 */
export interface SlotWaypoint {
  anchor?: {
    h?: 'left' | 'center' | 'right';
    v?: 'top' | 'center' | 'bottom';
  };
  dxPercent?: number;
  dyPercent?: number;
  t?: number;
  easing?: string;
}

/**
 * A keyframe path. Two or more waypoints required for motion; a single
 * waypoint is treated as an end-state hold. `type` controls the
 * inter-waypoint interpolation: `'linear'` (default) is straight
 * segments; `'bezier'` is a Catmull-Rom-derived smooth curve through
 * the waypoints. `loop` repeats from waypoint 0 after reaching the end.
 */
export interface SlotPath {
  type?: 'linear' | 'bezier';
  loop?: boolean;
  waypoints: SlotWaypoint[];
}

/**
 * Per-slot motion intent. Keyed by slot `name` (matches SlotSpec.name).
 * `enter` plays on mount, `exit` on unmount, `emphasis` is an array of
 * one-shot effects that can be fired by beat events (later).
 */
export interface SlotAnimationEntry {
  enter?: SlotAnimation;
  exit?: SlotAnimation;
  emphasis?: SlotAnimation[];
}

/** Top-level shape stored on a beat. */
export type SlotAnimations = Record<string, SlotAnimationEntry>;

/** Defensive type guard — slotAnimations arriving from JSON / params. */
export function isSlotAnimations(value: unknown): value is SlotAnimations {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Lookup helper. */
export function slotAnimationsFor(
  slotAnimations: unknown,
  slotName: string,
): SlotAnimationEntry | undefined {
  if (!isSlotAnimations(slotAnimations)) return undefined;
  const entry = (slotAnimations as SlotAnimations)[slotName];
  return entry && typeof entry === 'object' ? entry : undefined;
}
