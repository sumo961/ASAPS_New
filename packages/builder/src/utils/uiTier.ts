/**
 * The author's disclosure tier — "show advanced options" as a PERSISTED
 * author preference instead of a per-panel boolean that reset on every
 * deselect (and every delete deselects).
 *
 * Scope: author/profile (localStorage), NOT the project. A story doesn't
 * get simpler because its author is a novice — the author does; and a
 * workshop's lab machines provision as novice-mode per profile.
 *
 * The first-run prompt (see Inspector) only SEEDS the value; afterwards
 * the Inspector's toggle is the permanent switch.
 */

export type UiTier = 'basic' | 'advanced';

const TIER_KEY = 'asaps_ui_tier';
const OFFERED_KEY = 'asaps_ui_tier_prompted';

export function getUiTier(): UiTier {
  try {
    return localStorage.getItem(TIER_KEY) === 'advanced' ? 'advanced' : 'basic';
  } catch {
    return 'basic';
  }
}

export function setUiTier(tier: UiTier): void {
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch {
    /* private mode etc. — the session still works, just unpersisted */
  }
}

/** True until the author has answered (or dismissed) the one-time choice. */
export function shouldOfferTierChoice(): boolean {
  try {
    return !localStorage.getItem(OFFERED_KEY) && !localStorage.getItem(TIER_KEY);
  } catch {
    return false;
  }
}

export function markTierChoiceOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    /* ignore */
  }
}
