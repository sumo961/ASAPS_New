/**
 * Typewriter reveal granularity — letter (classic), word, or line.
 *
 * The reveal clock stays character-based everywhere (one tick per character,
 * so `typewriterSpeed` keeps meaning characters-per-second and total duration
 * is identical across granularities). Granularity is applied at RENDER time:
 * the visible text snaps to the last COMPLETED unit, so words/lines pop in
 * whole instead of dribbling. A pleasant side effect for word/line modes:
 * markdown-lite markers never render half-open mid-word.
 */

export type TypewriterGranularity = 'letter' | 'word' | 'line';

/**
 * Largest prefix length ≤ `index` that ends on a completed unit boundary.
 * 'letter' returns index unchanged. Whitespace after a word counts as part
 * of the completed unit, so the space appears together with its word.
 */
export function revealBoundary(
  text: string,
  index: number,
  granularity: TypewriterGranularity = 'letter',
): number {
  if (index >= text.length) return text.length;
  // Never stop between a backslash and the character it escapes (\*):
  // the reveal would show a stray backslash for a tick.
  if (granularity === 'letter') return index > 0 && text[index - 1] === '\\' ? index - 1 : index;

  const sep = granularity === 'line' ? '\n' : /\s/;
  // Walk back from `index` to the most recent separator; everything up to
  // AND including it is complete.
  for (let i = index; i > 0; i--) {
    const ch = text[i - 1];
    const isSep = typeof sep === 'string' ? ch === sep : sep.test(ch);
    if (isSep) return i;
  }
  return 0;
}
