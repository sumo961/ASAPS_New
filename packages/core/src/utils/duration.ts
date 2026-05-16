/**
 * Duration helpers — single source of truth.
 *
 * CANONICAL UNIT IS SECONDS. The authored/serialized value for timed screens
 * (durScreen.duration, aiDurScreen.min/maxDuration) is seconds, fractional
 * allowed (e.g. 0.5). It is converted to milliseconds exactly once, at the
 * beat→renderer boundary, because the renderer's renderDurScreen contract is
 * a setTimeout in ms.
 *
 * Background: the schema historically documented `duration` as milliseconds
 * (default 3000) while the AI generation prompt told the model "duration
 * (seconds)". The AI emitted small second-values (5/6/7); the runtime read
 * them as 5/6/7 ms and the screens flashed by invisibly. Standardizing on
 * seconds resolves the contract mismatch; this module is the boundary.
 */

/**
 * Migration heuristic: coerce a stored duration value to SECONDS.
 *
 * Existing projects may hold legacy milliseconds (e.g. 3000, 15000). Authored
 * seconds for a timed screen are realistically ~1-45; nobody sets a >60s
 * auto-advance screen, and nobody sets a sub-60ms one — so the value ranges
 * don't overlap. A value > 60 is therefore legacy ms → divide by 1000;
 * anything ≤ 60 is already seconds and passes through untouched. Self-
 * correcting on load + re-save, no schema-version flag required.
 */
export function normalizeDurationToSeconds(value: number | undefined | null): number {
  if (value === undefined || value === null || !isFinite(value) || value <= 0) {
    return 0;
  }
  return value > 60 ? value / 1000 : value;
}

/** Seconds → milliseconds, for the renderer timer boundary. */
export function durationSecondsToMs(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

export interface SuggestDurationOptions {
  /** Reading speed in words/minute. Default 200 (conservative adult avg). */
  wpm?: number;
  /**
   * Safety multiplier for slower readers, re-reading, and reflection on
   * literary prose. Default 1.5 — e.g. a 55-word paragraph (~16.5s raw at
   * 200wpm) suggests ~25s, matching authorial expectation for this content.
   */
  safety?: number;
  /** Minimum suggested seconds regardless of how short the text is. */
  floor?: number;
}

/**
 * Suggested display duration in SECONDS for a block of text, from its word
 * count and a reading-speed model. Shared by AIDurScreenBeat (runtime
 * auto-duration), the AI generation guidance, and the builder Inspector's
 * "suggest from text" affordance so all three agree.
 *
 *   ceil( (words / wpm) * 60 * safety ), clamped to >= floor
 */
export function suggestDurationSeconds(
  text: string,
  opts: SuggestDurationOptions = {}
): number {
  const wpm = opts.wpm && opts.wpm > 0 ? opts.wpm : 200;
  const safety = opts.safety && opts.safety > 0 ? opts.safety : 1.5;
  const floor = opts.floor !== undefined ? opts.floor : 3;
  const words = (text || '').trim().split(/\s+/).filter(w => w.length > 0).length;
  const raw = (words / wpm) * 60 * safety;
  return Math.max(floor, Math.ceil(raw));
}
