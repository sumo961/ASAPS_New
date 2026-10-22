/**
 * Which beats offer the Inspector's per-beat Time Display setting (what the
 * clock HUD shows on that beat). It sits with the auto-advance settings on
 * the beat types that can auto-advance; End Screens and Multiple Choice beats
 * get it on its own, since an ending or a choice is where a story often
 * jumps in time.
 */
import { DEFAULT_TARGET_TIMEOUT_TYPES, isMultiChoiceLike } from '@asaps/core';

export function offersTimeDisplayOnItsOwn(type: string | undefined): boolean {
  return type === 'endScreen' || isMultiChoiceLike(type);
}

export function offersTimeDisplay(type: string | undefined): boolean {
  return !!type && (DEFAULT_TARGET_TIMEOUT_TYPES.has(type) || offersTimeDisplayOnItsOwn(type));
}
