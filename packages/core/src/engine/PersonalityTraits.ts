/**
 * Personality traits — Step 6 of the rich-character roadmap.
 *
 * A character's traits are a static, author-set keyed bag with values in
 * [0, 1]. The default schema is Big Five (openness, conscientiousness,
 * extraversion, agreeableness, neuroticism) — the most defensible default
 * per the design doc — but the trait names are open: authors can rename,
 * remove, or add (e.g. a horror story might prefer a single
 * "courage / cowardice" axis).
 *
 * Traits never *gate* choices on their own. They *modulate* incoming
 * emotion deltas: e.g., a high-neuroticism character experiences fear and
 * sadness more strongly; high-extraversion amplifies joy and pride; high-
 * agreeableness dampens anger. The math is intentionally gentle so a
 * neutral [0.5, 0.5, 0.5, 0.5, 0.5] character behaves identically to a
 * trait-less character.
 *
 * Modulation formula (per fired emotion, per trait):
 *
 *     scale = 1 + Σ (trait_value - 0.5) × 2 × weight
 *     effective_delta = base_delta × scale
 *
 * `(value - 0.5) × 2` re-maps trait values from [0,1] into [-1, +1] around
 * the neutral midpoint; `weight` is the per-(trait, emotion) influence in
 * the project's TraitModulationProfile. With default weights and a neutral
 * trait value, scale = 1 → no change. Above-midpoint traits amplify any
 * emotion they have a positive weight on; below-midpoint traits dampen
 * those same emotions. Negative weights flip the polarity (high
 * agreeableness → less anger).
 *
 * The modulation is also clamped so a runaway combination of traits and
 * weights can't flip the sign of an emotion or amplify it past 4×.
 */

export const DEFAULT_TRAIT_NAMES = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
] as const;

export type DefaultTraitName = (typeof DEFAULT_TRAIT_NAMES)[number];

/**
 * Default trait values for a freshly-authored character that hasn't been
 * tuned yet. Neutral on every axis so the character is well-behaved
 * without further authoring.
 */
export const DEFAULT_TRAIT_VALUES: Record<DefaultTraitName, number> = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

/**
 * Per-trait short description shown in the character editor next to each
 * slider. Author-facing only — not load-bearing on runtime math.
 */
export const TRAIT_DESCRIPTIONS: Record<DefaultTraitName, string> = {
  openness:          'Curious, imaginative, open to new experiences.',
  conscientiousness: 'Organized, reliable, self-disciplined.',
  extraversion:      'Outgoing, energetic, draws energy from others.',
  agreeableness:     'Cooperative, trusting, slow to anger.',
  neuroticism:       'Emotionally reactive, prone to anxiety and sadness.',
};

/**
 * Trait → emotion influence weight. `weight` is in [-1, 1]:
 *   +1   means the trait fully amplifies that emotion at trait_value=1
 *   -1   means it fully dampens (or inverts toward zero) at trait_value=1
 *    0   means no influence — same as omitting the row.
 */
export interface TraitEmotionWeight {
  trait: string;
  emotion: string;
  weight: number;
}

/**
 * Project-level set of trait → emotion modulations. Empty by default →
 * traits don't affect emotion deltas at all (safe baseline). Authors can
 * add weights via the Personality settings UI.
 *
 * The defaults below capture the broad consensus wiring you'd expect from
 * a Big-Five + Ekman setup (mostly drawn from MM's published affect
 * tables, gentled down): neuroticism amplifies negative emotions,
 * extraversion amplifies positive emotions, agreeableness dampens anger
 * and disgust. None of these is load-bearing — authors should retune for
 * their genre.
 */
export const DEFAULT_TRAIT_MODULATIONS: TraitEmotionWeight[] = [
  // Neuroticism — emotional reactivity, mostly the negative emotions.
  { trait: 'neuroticism',   emotion: 'fear',     weight:  0.5 },
  { trait: 'neuroticism',   emotion: 'sadness',  weight:  0.4 },
  { trait: 'neuroticism',   emotion: 'anger',    weight:  0.3 },
  { trait: 'neuroticism',   emotion: 'shame',    weight:  0.3 },
  { trait: 'neuroticism',   emotion: 'joy',      weight: -0.2 },

  // Extraversion — positive affect, sociability.
  { trait: 'extraversion',  emotion: 'joy',      weight:  0.4 },
  { trait: 'extraversion',  emotion: 'pride',    weight:  0.3 },
  { trait: 'extraversion',  emotion: 'interest', weight:  0.3 },

  // Agreeableness — cooperation; dampens anger and disgust.
  { trait: 'agreeableness', emotion: 'anger',    weight: -0.4 },
  { trait: 'agreeableness', emotion: 'disgust',  weight: -0.3 },

  // Openness — engagement with novelty.
  { trait: 'openness',      emotion: 'interest', weight:  0.4 },
  { trait: 'openness',      emotion: 'surprise', weight:  0.2 },

  // Conscientiousness — left mostly out of the affect path on purpose
  // (it shows up much more in goal/planning behaviour, which lives in
  // Step 8). One subtle row: high conscientiousness amplifies shame.
  { trait: 'conscientiousness', emotion: 'shame', weight: 0.2 },
];

/**
 * Modulate a base emotion delta by a character's traits and the project's
 * trait → emotion weight table. See the module-level docstring for the
 * formula. Returns the effective delta — clamped so traits can't flip
 * polarity or amplify past 4×.
 *
 * Cheap, allocates nothing if `traits` is missing or empty, so it can run
 * inside every fireCharacterEmotion call without a perf concern.
 */
export function modulateEmotionDelta(
  baseDelta: number,
  emotion: string,
  traits: Record<string, number> | null | undefined,
  modulations: ReadonlyArray<TraitEmotionWeight> | null | undefined,
): number {
  if (!traits || !modulations || modulations.length === 0) return baseDelta;
  if (baseDelta === 0) return 0;

  const lowerEmotion = emotion.toLowerCase();
  let scale = 1;
  for (const m of modulations) {
    if (m.emotion.toLowerCase() !== lowerEmotion) continue;
    const traitValue = traits[m.trait];
    if (typeof traitValue !== 'number') continue;
    // Re-center [0,1] → [-1,1]. Neutral 0.5 contributes 0.
    const centered = (traitValue - 0.5) * 2;
    scale += centered * m.weight;
  }
  // Clamp scale so degenerate trait/weight combos can't reverse polarity
  // or blow up the delta. 0 = "fully cancelled", 4 = "wildly amplified".
  if (scale < 0) scale = 0;
  if (scale > 4) scale = 4;
  return baseDelta * scale;
}
