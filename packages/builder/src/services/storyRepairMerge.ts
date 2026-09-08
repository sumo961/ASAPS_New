/**
 * Merge an AI "repair" response back over the story it was asked to fix.
 *
 * The repair prompt says "preserve ALL existing content — only ADD", but the
 * model re-emits the whole story and, when that re-emission is truncated or
 * the model simply omits sections it did not touch, top-level fields vanish:
 * observed 2026-09-08 on an 85-beat story — the repaired response came back
 * with beats only, so characters, variables, clusters and the suggested
 * theme were lost even though the first pass had them.
 *
 * Rule: the repaired response wins for anything it actually carries; the
 * original supplies every field the repair dropped or emptied.
 */
export function mergeRepairedStory<T extends Record<string, any>>(original: T, repaired: Record<string, any>): T {
  const out: Record<string, any> = { ...original, ...repaired };
  for (const key of Object.keys(original)) {
    const orig = original[key];
    const rep = repaired[key];
    const repMissing = rep === undefined || rep === null;
    const repEmptyArray = Array.isArray(rep) && rep.length === 0 && Array.isArray(orig) && orig.length > 0;
    // `beats` is the one field a repair legitimately rewrites; never fall
    // back to the old beats under a shorter repaired list — the caller
    // rejects a repair that lost beats.
    if (key === 'beats') continue;
    if (repMissing || repEmptyArray) out[key] = orig;
  }
  return out as T;
}
