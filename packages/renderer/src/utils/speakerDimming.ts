/**
 * "Dim characters who aren't speaking" (Speaker Display): while a character
 * placed on the stage speaks, the other characters on the stage are drawn
 * darker and greyer, as visual novels do.
 *
 * Only when the speaker stands on the stage: a narrator's line, or a
 * character who isn't in the scene, leaves everyone as they are, so a scene
 * doesn't darken during narration.
 */

/** A stage element that may show a character (a Visual Editor character element). */
export interface StageCharacterLike {
  kind?: string;
  characterId?: string;
  characterName?: string;
}

/** Whether a stage element shows the speaker: by character id, or by the name it was placed with. */
export function showsSpeaker(location: StageCharacterLike, speaker: string | undefined): boolean {
  if (!speaker || location.kind !== 'character') return false;
  if (location.characterId && location.characterId === speaker) return true;
  const name = location.characterName?.trim().toLowerCase();
  return !!name && name === speaker.trim().toLowerCase();
}

/** The CSS filter for a dimmed character; strength 0–100 (default 50). */
export function dimFilter(strength: number | undefined): string {
  const s = Math.min(100, Math.max(0, strength ?? 50)) / 100;
  const brightness = +(1 - 0.6 * s).toFixed(2);
  const saturation = +(1 - 0.7 * s).toFixed(2);
  return `brightness(${brightness}) saturate(${saturation})`;
}

/**
 * The stage characters to dim for this line: every character element except
 * the speaker's, and none when the speaker isn't on the stage (or dimming is off).
 * Returns a filter per element index.
 */
export function silentCharacterFilters(
  locations: ReadonlyArray<StageCharacterLike>,
  speaker: string | undefined,
  settings: { dimSilentCharacters?: boolean; dimStrength?: number } | undefined,
): Map<number, string> {
  const out = new Map<number, string>();
  if (!settings?.dimSilentCharacters || !speaker) return out;
  if (!locations.some((l) => showsSpeaker(l, speaker))) return out;
  const filter = dimFilter(settings.dimStrength);
  locations.forEach((l, i) => {
    if (l.kind === 'character' && !showsSpeaker(l, speaker)) out.set(i, filter);
  });
  return out;
}

/** How long a character takes to dim or brighten between lines. */
export const DIM_TRANSITION = 'filter 250ms ease';
