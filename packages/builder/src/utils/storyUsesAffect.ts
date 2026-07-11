/**
 * Does this story actually use the character-affect (mood/sentiment) system?
 * Used to decide whether the Preview Window shows the mood tracker panel —
 * for stories that never touch affect it is dead sidebar space.
 *
 * Authored signals: updateAffect beats, per-character initial mood /
 * sentiments, or an enabled mood pad (moodFrame).
 */
export function storyUsesAffect(
  characters: ReadonlyArray<any> | undefined | null,
  beats: ReadonlyArray<any> | undefined | null
): boolean {
  if (
    (characters || []).some(
      (c: any) =>
        c?.initialMood ||
        (Array.isArray(c?.initialSentiments) && c.initialSentiments.length > 0) ||
        c?.moodFrame?.enabled
    )
  ) {
    return true;
  }
  return (beats || []).some((b: any) => b?.type === 'updateAffect');
}

/**
 * Live fallback for runtime-driven affect (e.g. AI-conversation sentiment
 * extraction): true when any character's mood left neutral, or has any
 * sentiments / non-zero emotions.
 */
export function anyLiveAffect(
  characters: ReadonlyArray<any> | undefined | null,
  lookup: {
    getCharacterMood: (id: string) => { valence: number; arousal: number };
    getCharacterSentiments: (id: string) => ReadonlyArray<unknown>;
    getCharacterEmotions?: (id: string) => Record<string, number>;
  }
): boolean {
  return (characters || []).some((c: any) => {
    const m = lookup.getCharacterMood(c.id);
    if (m && (m.valence !== 0 || m.arousal !== 0)) return true;
    if ((lookup.getCharacterSentiments(c.id) || []).length > 0) return true;
    const em = lookup.getCharacterEmotions?.(c.id);
    return !!em && Object.values(em).some(v => v > 0);
  });
}
