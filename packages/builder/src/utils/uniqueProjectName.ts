/**
 * Project-name uniqueness helper.
 *
 * Centralizes the logic for "if a project named X already exists, give
 * me X 1, X 2, …". Used by every project-create entry point — AI
 * generation save, manual create, ASML import, Twine import — so no
 * code path silently overwrites or duplicates a name.
 *
 * Convention: append a space + integer counter starting at 1. We do NOT
 * recognize an existing trailing counter ("Holding the Line 0" → check
 * "Holding the Line 0 1" rather than "Holding the Line 1") because the
 * AI sometimes generates names that legitimately end in digits ("Beat 7
 * Investigation"), and stripping the suffix would cluster unrelated
 * stories. Round-tripping is more important than visually clean numbering.
 *
 * Comparison is case-insensitive — "Holding the Line" and "HOLDING THE
 * LINE" collide. Trailing whitespace is trimmed before comparison.
 */

/**
 * Find a unique project name given a desired name and the list of names
 * already in use. Returns the desired name unchanged if no collision.
 *
 * @param desired   the name the caller wants to use (will be trimmed)
 * @param existing  list of names currently in use (case insensitive)
 * @returns a name guaranteed not to collide with any entry in `existing`
 */
export function findUniqueProjectName(
  desired: string,
  existing: ReadonlyArray<string>,
): string {
  const base = (desired || '').trim();
  if (!base) return 'Untitled Project';

  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  // Counter starts at 1 — the user already has an unsuffixed copy, so
  // "X 1" is the natural next sibling. We bound at 9999 to avoid an
  // accidental infinite loop if the existing list contains every
  // suffix; in that pathological case we fall through to a timestamped
  // name so the create still succeeds.
  for (let n = 1; n <= 9999; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  // Fallback — astronomically unlikely. Timestamp guarantees uniqueness
  // and stays human-readable.
  return `${base} ${Date.now()}`;
}
