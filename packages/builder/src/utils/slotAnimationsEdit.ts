import type {
  SlotAnimations,
  SlotAnimationEntry,
  SlotAnimation,
} from '@asaps/core';

/**
 * Pure merge for Visual-Editor slotAnimations edits (P3-anim-3). The
 * Animations tab editor calls this; the caller persists the result via the
 * normal beat-param command path (`onBeatUpdate(beatId, { parameters })`).
 *
 * - `partial === null` removes the slot's entire entry.
 * - `enter: null` inside a partial clears just that sub-slot.
 * - Otherwise the partial shallow-merges onto the existing entry.
 * - Empty entries are dropped; when no slots remain the whole
 *   `slotAnimations` returns as `undefined` (absent → no animation).
 *
 * Never mutates its input.
 */
export function mergeSlotAnimations(
  prev: SlotAnimations | undefined,
  slot: string,
  partial: Partial<SlotAnimationEntry> | null,
): SlotAnimations | undefined {
  const base: SlotAnimations =
    prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {};
  const next: SlotAnimations = { ...base };

  if (partial === null) {
    delete next[slot];
  } else {
    const merged: SlotAnimationEntry = { ...(base[slot] ?? {}), ...partial };
    // Drop sub-keys explicitly nulled / undefined.
    (Object.keys(merged) as Array<keyof SlotAnimationEntry>).forEach((k) => {
      const v = merged[k] as SlotAnimation | SlotAnimation[] | null | undefined;
      if (v === null || v === undefined) delete merged[k];
    });
    if (Object.keys(merged).length === 0) delete next[slot];
    else next[slot] = merged;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
