/**
 * Item names that are probably the same item (2026-10-29, class feedback:
 * "so you can be sure that one type of item [is used] instead of having to
 * guess whether a PC got a correct sword"). "Sword", "sword" and "Sword "
 * are three different items to the engine.
 */

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * A known name that `typed` probably means: the same apart from case or
 * spacing. Undefined when `typed` is known as written, or nothing is close.
 */
export function closeItemName(typed: string, known: ReadonlyArray<string>): string | undefined {
  const t = typed.trim();
  if (!t || known.includes(t)) return undefined;
  return known.find((k) => norm(k) === norm(t));
}
