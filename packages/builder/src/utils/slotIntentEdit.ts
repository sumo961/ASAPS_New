import type { SlotIntent, SlotIntentEntry } from '@asaps/core';

/**
 * Pure merge for Visual-Editor slotIntent edits (3d-1). The control panel /
 * drag handles call this; the caller persists the result via the normal
 * beat-param command path (`onBeatUpdate(beatId, { parameters })`) — NEVER
 * via the location-sync path, so the beat can't bake `locations[]` and flip
 * out of slot mode (the no-bake guard).
 *
 * - `partial === null` removes the slot's intent entirely.
 * - Otherwise the partial is shallow-merged onto the slot's existing entry
 *   (so a panel can set just `preferredLines` without dropping `anchor`).
 * - A slot whose merged entry is empty is dropped; when no slots remain the
 *   whole `slotIntent` is returned as `undefined` so the param serializes
 *   clean (absent === pure flow) rather than as `{}`.
 *
 * Never mutates its input.
 */
export function mergeSlotIntent(
  prev: SlotIntent | undefined,
  slot: string,
  partial: Partial<SlotIntentEntry> | null,
): SlotIntent | undefined {
  const base: SlotIntent =
    prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  const next: SlotIntent = { ...base };

  if (partial === null) {
    delete next[slot];
  } else {
    const mergedEntry: SlotIntentEntry = { ...(base[slot] ?? {}), ...partial };
    // Drop keys explicitly cleared to undefined so they don't linger.
    for (const k of Object.keys(mergedEntry) as Array<keyof SlotIntentEntry>) {
      if (mergedEntry[k] === undefined) delete mergedEntry[k];
    }
    if (Object.keys(mergedEntry).length === 0) delete next[slot];
    else next[slot] = mergedEntry;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
