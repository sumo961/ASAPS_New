/**
 * Speaker names across a translation. A character's voice is kept under the
 * speaker's name in the story's own language. A translation translates
 * speaker names too, so "The Captain" plays as "Der Kapitän" and the voice
 * is not found. This walks the story as written and its translated copy
 * side by side and returns translated name → original name for every field
 * that names who speaks.
 */

/** Fields whose value is a speaker's (or character's) name. */
const NAME_FIELDS = new Set(['speaker', 'displayName', 'npcName', 'name']);

export function speakerAliasesBetween(source: unknown, translated: unknown): Record<string, string> {
  const aliases: Record<string, string> = {};
  const walk = (a: any, b: any, depth: number): void => {
    if (depth > 40 || a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return;
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return;
      for (let i = 0; i < a.length && i < b.length; i++) walk(a[i], b[i], depth + 1);
      return;
    }
    for (const key of Object.keys(a)) {
      const x = a[key];
      const y = b[key];
      if (typeof x === 'string' && typeof y === 'string') {
        if (NAME_FIELDS.has(key) && x && y && x !== y && !(y in aliases)) aliases[y] = x;
      } else {
        walk(x, y, depth + 1);
      }
    }
  };
  walk(source, translated, 0);
  return aliases;
}
