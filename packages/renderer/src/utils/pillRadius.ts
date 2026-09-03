/**
 * Pill-safe button corner radius.
 *
 * buttonRadius 999 is the "pill" sentinel (builder storage/types.ts) and the
 * app default. Passing it straight to border-radius breaks on tall wrapped
 * choices: when corner radii overlap, CSS shrinks them proportionally on BOTH
 * axes, so a near-square multi-line bubble collapses into an ellipse and the
 * text pokes past the paint. Cap the curve at half a line plus a padding
 * budget instead — an over-large radius on a single-line button still clamps
 * to an exact stadium (CSS reduces it to height/2), while wrapped choices
 * keep chat-bubble corners. Explicit slider values (≤ 50) pass through
 * untouched; the > 50 test mirrors the settings slider's pill cutoff.
 */
export function pillSafeRadius(radius: number | null | undefined, fallback = 8): string {
  const r = radius ?? fallback;
  return r > 50 ? 'calc(0.5lh + 24px)' : `${r}px`;
}
