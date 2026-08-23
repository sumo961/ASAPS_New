/**
 * The legacy ASML text-location convention, defined ONCE.
 *
 * Legacy imports bake a beat's main text/question into a location literally
 * named 'text' (kind 'text', empty content); the renderer fills it BY NAME at
 * render time. The modern schema calls the same slot 'question' or 'prompt'.
 * Every heuristic that asks "did the author place the text box?" must honor
 * this alias or it synthesizes a duplicate next to the authored one — which
 * has now happened three separate times (VisualWorkspace question supplement,
 * backfillUnplacedDefaults, and the pickProp button variant).
 *
 * These are SCHEMA SLOT NAMES (the vocabulary of core-beats.json `locations`
 * arrays), not story content — no author-visible item or beat names belong in
 * this file, ever.
 *
 * Consumers:
 *  - PositionedBeatView's content-fill rule (renders question text into a
 *    location named 'text' for the beat types below)
 *  - backfillUnplacedDefaults (a default 'question'/'prompt' counts as placed
 *    when an authored 'text' location exists)
 *  - VisualWorkspace's question-supplement heuristic (builder)
 */

/** The location name legacy imports use for the beat's main text box. */
export const LEGACY_TEXT_LOCATION_NAME = 'text';

/** Modern schema slot names that a legacy 'text' location satisfies. */
export const TEXT_ALIAS_SLOT_NAMES: readonly string[] = ['question', 'prompt'];

/** Beat types whose question renders into a legacy 'text' location. */
export const TEXT_ALIAS_BEAT_TYPES: readonly string[] = ['movementChoice', 'pickProp'];

/** Is `slotName` a modern slot that an authored legacy 'text' location fills? */
export function isTextAliasSlot(slotName: string | undefined | null): boolean {
  return !!slotName && TEXT_ALIAS_SLOT_NAMES.includes(slotName.toLowerCase());
}
