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

/** Supported animation presets. New presets land per P3-anim phasing. */
export type SlotAnimationPreset =
  | 'fade'
  | 'slide-in-left'
  | 'slide-in-right'
  | 'slide-in-top'
  | 'slide-in-bottom'
  | 'scale-in'
  | 'pulse'
  | 'shake';

/**
 * A single animation event on a slot. `preset` is the kind; timing is
 * optional with sensible defaults. `distance` is RELATIVE (percent of the
 * slot's resolved box) — never pixels — so it survives any viewport.
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
