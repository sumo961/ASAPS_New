/**
 * Spotting a counter that will be drawn twice on one beat.
 *
 * A character's screen-docked meter frame is standing scenery: it shows the
 * same counters on every beat. A `kind: 'meter'` element placed on one beat is
 * emphasis for that beat. Both are legitimate, and an author may well want the
 * big readout *and* the persistent row — so nothing here suppresses either.
 *
 * What it does is name the case, because until the Visual Editor started
 * drawing screen HUDs there was no way to notice it while authoring. Warning
 * rather than fixing is the deliberate choice: suppressing the frame row makes
 * the HUD change shape between beats, which reads as "the counter vanished",
 * and suppressing the placed element makes something the author positioned
 * silently do nothing.
 */

export interface DuplicateHudCheckElement {
  type?: string;
  characterId?: string;
  counterName?: string;
}

export interface DuplicateHudCheckCharacter {
  id: string;
  name?: string;
  displayName?: string;
  meterFrame?: { dockMode?: string } | null;
  counters?: Array<{ name?: string; visible?: boolean }>;
}

/**
 * Name of the character whose HUD frame already shows this element's counter,
 * or null when there is no duplication.
 *
 * Returns a name rather than a boolean so the warning can say whose HUD it is —
 * with several characters on screen, "shown twice" alone leaves the author
 * hunting for the other one.
 */
export function duplicateHudCounterOwner(
  element: DuplicateHudCheckElement | null | undefined,
  characters: DuplicateHudCheckCharacter[] | null | undefined,
): string | null {
  if (!element || element.type !== 'meter' || !element.counterName) return null;

  const owner = (characters || []).find(
    (c) => c.id === element.characterId || c.name === element.characterId,
  );
  if (!owner) return null;

  // A character-anchored frame is positioned relative to the character on
  // stage, not pinned to a corner, so it is not the same kind of duplication —
  // and it only appears at all when that character is placed.
  if (owner.meterFrame?.dockMode !== 'screen') return null;

  // `visible` defaults to true, matching the counter model everywhere else.
  const inFrame = (owner.counters || []).some(
    (k) => k.name === element.counterName && k.visible !== false,
  );
  return inFrame ? (owner.displayName || owner.name || owner.id) : null;
}
