/**
 * Prose lines mix narration and a character's speech:
 *
 *   Karin sits down without taking her coat off. "I don't see why we're here."
 *
 * Read aloud, the quoted part is the character's and the rest the
 * narrator's. splitVoicedSegments cuts a line at its quotation marks
 * ("…", “…”, „…“, «…», »…«). A line with NO quotes returns null: it is
 * read whole in the speaker's voice, as before — plenty of stories write a
 * labelled character's speech without quote marks.
 */

export interface VoicedSegment {
  text: string;
  /** true = inside quotation marks (the character speaks). */
  quoted: boolean;
}

const PAIRS: Record<string, string> = { '"': '"', '“': '”', '„': '“', '«': '»', '»': '«' };

export function splitVoicedSegments(text: string | null | undefined): VoicedSegment[] | null {
  if (!text) return null;
  const segments: VoicedSegment[] = [];
  let buffer = '';
  let closer: string | null = null;
  const push = (quoted: boolean) => {
    const t = buffer.trim();
    if (t) segments.push({ text: t, quoted });
    buffer = '';
  };
  for (const ch of text) {
    if (closer === null && PAIRS[ch] !== undefined) {
      push(false);
      closer = PAIRS[ch];
      continue;
    }
    if (closer !== null && ch === closer) {
      push(true);
      closer = null;
      continue;
    }
    buffer += ch;
  }
  // An unclosed quote runs to the end of the line (dialogue often does).
  push(closer !== null);
  if (!segments.some((s) => s.quoted)) return null;
  // Adjacent pieces of the same voice read as one utterance.
  const merged: VoicedSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.quoted === s.quoted) last.text = `${last.text} ${s.text}`;
    else merged.push({ ...s });
  }
  return merged;
}
