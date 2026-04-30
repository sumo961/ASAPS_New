/**
 * Variant resolution helpers — merge a Character with the active variant
 * to produce the effective character record the runtime should reason
 * about. Variants are *partial overlays*: only fields the variant
 * explicitly sets replace the base. Everything else (id, role, beats,
 * goals, …) is inherited unchanged.
 */

import type { CharacterVariant } from '../types';

/**
 * Apply a variant overlay to a base character. Returns a new object with
 * the variant's fields merged on top. When no variant is provided, the
 * base is returned unchanged (same reference, no allocation).
 *
 * Fields the variant can override:
 *   displayName, characterDescription → description, portrait, traits,
 *   dossierPolicy, initialMood, initialSentiments
 *
 * Fields it cannot override (kept from base):
 *   id, role, name, color, tags, goals, states, counters, inventory,
 *   visual.spriteSheet, etc. — those are character-identity-level.
 */
export function resolveCharacterWithVariant<T extends { id: string; description?: string; displayName?: string; portrait?: any; traits?: Record<string, number>; dossierPolicy?: 'reAnchor' | 'reflection'; initialMood?: any; initialSentiments?: any }>(
  base: T,
  variant: CharacterVariant | undefined | null,
): T {
  if (!variant) return base;
  const overlay: Partial<T> = {};
  if (variant.displayName !== undefined) (overlay as any).displayName = variant.displayName;
  if (variant.characterDescription !== undefined) (overlay as any).description = variant.characterDescription;
  if (variant.portrait !== undefined) (overlay as any).portrait = variant.portrait;
  if (variant.traits !== undefined) (overlay as any).traits = variant.traits;
  if (variant.dossierPolicy !== undefined) (overlay as any).dossierPolicy = variant.dossierPolicy;
  if (variant.initialMood !== undefined) (overlay as any).initialMood = variant.initialMood;
  if (variant.initialSentiments !== undefined) (overlay as any).initialSentiments = variant.initialSentiments;
  return { ...base, ...overlay };
}

/**
 * Look up the variant by id on a character (which carries `variants?: CharacterVariant[]`).
 * Returns undefined when not found.
 */
export function findCharacterVariant(
  character: { variants?: ReadonlyArray<CharacterVariant> } | null | undefined,
  variantId: string | null | undefined,
): CharacterVariant | undefined {
  if (!character || !variantId || !character.variants) return undefined;
  return character.variants.find((v) => v.id === variantId);
}
