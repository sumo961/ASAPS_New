/**
 * Author-editable emotion palette — Step 5 of the rich-character roadmap.
 *
 * Each emotion is a node with a name + two weights (how firing this emotion
 * nudges mood) + a decay rate. When `fireCharacterEmotion(ref, name, delta)`
 * is called, the emotion's level moves by delta and the character's mood
 * also gets nudged by delta × weight on each axis. Decay reduces every
 * emotion's level toward zero each tick (typically per beat-entry).
 *
 * The default palette ships with Ekman 6 (joy, anger, fear, sadness,
 * surprise, disgust) plus pride / shame / interest — the same nine
 * emotions the design doc recommends as the "sensible default". Authors
 * can rename, delete, add, or re-weight any of them per project.
 *
 * Weight conventions:
 *   weightToValence ∈ [-1, 1]  — positive = pleasant, negative = unpleasant
 *   weightToArousal ∈ [-1, 1]  — positive = activating, negative = subduing
 *   decayRate       ∈ [0, 1]   — fraction decayed per tick (0.2 = 20% / tick)
 *
 * The defaults below align loosely with the MM table and Russell's affect
 * circumplex — adjust per story when the defaults don't fit the genre.
 */

export interface EmotionDefinition {
  /** Identifier — also the user-facing label. Lowercase by convention. */
  name: string;
  /** Per-firing nudge to the character's mood.valence axis. */
  weightToValence: number;
  /** Per-firing nudge to the character's mood.arousal axis. */
  weightToArousal: number;
  /** Fraction of current emotion intensity removed per decay tick. */
  decayRate: number;
  /** Optional one-line author-facing hint shown in the palette editor. */
  description?: string;
}

export const DEFAULT_EMOTION_PALETTE: EmotionDefinition[] = [
  { name: 'joy',      weightToValence:  0.7, weightToArousal:  0.4, decayRate: 0.20, description: 'Happy / delighted' },
  { name: 'anger',    weightToValence: -0.5, weightToArousal:  0.7, decayRate: 0.25, description: 'Hostile / aggressive' },
  { name: 'fear',     weightToValence: -0.6, weightToArousal:  0.6, decayRate: 0.20, description: 'Threatened / anxious' },
  { name: 'sadness',  weightToValence: -0.7, weightToArousal: -0.4, decayRate: 0.10, description: 'Grief / sorrow' },
  { name: 'surprise', weightToValence:  0.0, weightToArousal:  0.8, decayRate: 0.40, description: 'Startled — fast decay' },
  { name: 'disgust',  weightToValence: -0.5, weightToArousal:  0.2, decayRate: 0.25, description: 'Aversion / revulsion' },
  { name: 'pride',    weightToValence:  0.5, weightToArousal:  0.2, decayRate: 0.15, description: 'Self-satisfaction' },
  { name: 'shame',    weightToValence: -0.6, weightToArousal: -0.2, decayRate: 0.10, description: 'Self-reproach' },
  { name: 'interest', weightToValence:  0.3, weightToArousal:  0.3, decayRate: 0.30, description: 'Curiosity / engagement' },
];

/**
 * Look up an emotion definition by name (case-insensitive). Returns null
 * when the palette doesn't contain a matching entry — callers should
 * treat that as "this emotion is unrecognised" rather than crashing.
 */
export function findEmotionDefinition(
  palette: ReadonlyArray<EmotionDefinition> | null | undefined,
  name: string,
): EmotionDefinition | null {
  if (!palette || !name) return null;
  const lower = name.toLowerCase();
  return palette.find((e) => e.name.toLowerCase() === lower) || null;
}
