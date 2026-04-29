/**
 * CharacterRef resolution utilities.
 *
 * The runtime currently receives character references as raw strings — sometimes
 * a Character.id, sometimes a Character.name, sometimes a free-text speaker name
 * with no Character record at all. Layer 2 of the rich-character roadmap needs a
 * single chokepoint that turns any of these into a canonical key, with a graceful
 * fallback for the free-text case.
 *
 * `resolveCharacter` returns the Character record if any field matches.
 * `resolveCharacterKey` returns the canonical key to use for storage:
 *   - The character's `id` if a record was found
 *   - The original ref string if no record matched (legacy / inline persona)
 *
 * Matching priority: `id` (exact) → `name` (case-insensitive) → `displayName`
 * (case-insensitive). The case-insensitive fallbacks exist because legacy beats
 * and inline AI personas often store user-entered display strings.
 */

interface CharacterLike {
  id: string;
  name?: string;
  displayName?: string;
}

/**
 * Find the Character record that a `ref` string identifies, if any.
 * Returns null when the ref doesn't correspond to a defined character.
 */
export function resolveCharacter<C extends CharacterLike>(
  ref: string | null | undefined,
  characters: ReadonlyArray<C> | null | undefined,
): C | null {
  if (!ref || !characters || characters.length === 0) return null;

  // 1. Exact id match (the canonical case)
  const byId = characters.find((c) => c.id === ref);
  if (byId) return byId;

  // 2. Case-insensitive name match
  const lower = ref.toLowerCase();
  const byName = characters.find((c) => c.name?.toLowerCase() === lower);
  if (byName) return byName;

  // 3. Case-insensitive displayName match
  const byDisplay = characters.find((c) => c.displayName?.toLowerCase() === lower);
  if (byDisplay) return byDisplay;

  return null;
}

/**
 * Return the canonical storage key for a character ref.
 *
 * If the ref matches a defined Character, returns that character's `id`.
 * Otherwise returns the ref string unchanged so legacy data and inline-only
 * personas still get a stable bucket — they just don't get cross-beat unification.
 *
 * Returns null when given a null/empty ref so callers can decide whether to
 * use a global / unscoped fallback.
 */
export function resolveCharacterKey<C extends CharacterLike>(
  ref: string | null | undefined,
  characters: ReadonlyArray<C> | null | undefined,
): string | null {
  if (!ref) return null;
  const resolved = resolveCharacter(ref, characters);
  return resolved ? resolved.id : ref;
}

/**
 * True if a ref unambiguously matches a defined Character.
 * Useful for "is this NPC a real Character or just a free-text speaker label?"
 */
export function isKnownCharacter<C extends CharacterLike>(
  ref: string | null | undefined,
  characters: ReadonlyArray<C> | null | undefined,
): boolean {
  return resolveCharacter(ref, characters) !== null;
}
