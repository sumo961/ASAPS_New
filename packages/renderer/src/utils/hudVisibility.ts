/**
 * hudVisibility — which beats show screen-docked HUD chrome.
 *
 * A title screen is the story's front door: the timer hasn't started, counters
 * are still at their authored initial values and nobody's mood has moved yet,
 * so HUD chrome there is pure noise competing with the title. Every
 * screen-docked HUD (timer, countdown, mood, meter, inventory) is therefore
 * suppressed on titleScreen by DEFAULT.
 *
 * It is a default, not a lock: `hudOverlays.showOnTitleScreen` turns the
 * chrome back on for authors who deliberately want a HUD visible from the
 * first frame (a countdown that is already running, a pre-set reputation
 * meter). Runtime never silently overrides an explicit authored choice — it
 * only picks the quieter default when the author hasn't expressed one.
 *
 * Both the renderer-owned HUDs (timer / countdown) and the host-owned
 * character frames (mood / meter / inventory) consult this one predicate, so
 * the start screen is uniformly clean rather than half-suppressed.
 */

/** Beat types that render without any screen HUD chrome by default. */
export const HUD_FREE_BEAT_TYPES: ReadonlySet<string> = new Set(['titleScreen']);

export interface HudVisibilityOptions {
  /** Author opt-in: show HUD chrome on the title screen anyway. */
  showOnTitleScreen?: boolean;
}

/**
 * True when this beat should paint NO screen-docked HUDs.
 *
 * @param beatType the beat being painted ('titleScreen', 'infoText', …)
 * @param options  the project's hudOverlays settings (opt-outs)
 */
export function beatSuppressesScreenHuds(
  beatType?: string | null,
  options?: HudVisibilityOptions,
): boolean {
  if (!beatType) return false;
  if (!HUD_FREE_BEAT_TYPES.has(beatType)) return false;
  return !options?.showOnTitleScreen;
}
