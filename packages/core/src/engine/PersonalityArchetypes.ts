/**
 * Personality archetypes — Big Five preset library (UX polish on Step 6).
 *
 * Each archetype is a named, well-grounded mapping from a personality
 * description ("narcissist", "stoic", …) to a Big Five trait vector. The
 * editor surfaces these as a "Load archetype…" dropdown so authors can
 * start from a coherent profile and fine-tune from there, rather than
 * tuning five sliders blind.
 *
 * Trait values follow Costa & McCrae's NEO-PI-R interpretive bands:
 *   ≤ 0.20  very low      ~0.50 average     ≥ 0.80  very high
 *
 * Optional `selfSentiments`: directed sentiments the preset seeds toward
 * the character themselves. Sentiments are inherently directed — a project-
 * agnostic preset cannot know the cast, so we deliberately keep the
 * sentiment seeds *self-directed only* (e.g. a narcissist's pride toward
 * self). When applied, the editor uses the character's own id as the
 * `toEntityRef` so the seed resolves consistently. Sentiments toward
 * *other* characters remain the author's job.
 *
 * The library is intentionally small (under a dozen). Each entry is broad
 * enough to fit many concrete characters with a few slider tweaks. Adding
 * dozens of fine-grained archetypes (paranoid-narcissist vs grandiose-
 * narcissist, etc.) makes the dropdown noisy without much authoring win.
 */

import type { DefaultTraitName } from './PersonalityTraits';

export interface ArchetypeSelfSentiment {
  /** Emotion label — should match the project's emotion palette. */
  emotion: string;
  /** Strength ∈ [-1, 1]. Negative inverts the sense of the named emotion. */
  strength: number;
}

export interface PersonalityArchetype {
  /** Stable identifier used in the dropdown value. */
  id: string;
  /** Display name shown in the dropdown. */
  name: string;
  /** One-line author-facing description. Shown beside the name. */
  description: string;
  /** Big Five trait vector — values clamped to [0, 1]. */
  traits: Record<DefaultTraitName, number>;
  /** Optional self-directed sentiment seeds — applied with the character's
   *  own id as the toEntityRef. The editor will append (not replace)
   *  these to existing initialSentiments. */
  selfSentiments?: ArchetypeSelfSentiment[];
}

/**
 * Trait letters used in the per-archetype rationale comments below:
 *   O — openness
 *   C — conscientiousness
 *   E — extraversion
 *   A — agreeableness
 *   N — neuroticism
 */
export const DEFAULT_PERSONALITY_ARCHETYPES: PersonalityArchetype[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Average on every trait — a neutral baseline.',
    traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
  },
  {
    id: 'narcissist',
    name: 'Narcissist',
    description: 'Charming on the surface, low warmth, sees self as exceptional. Low A, low N, high E.',
    traits: { openness: 0.55, conscientiousness: 0.45, extraversion: 0.85, agreeableness: 0.15, neuroticism: 0.25 },
    selfSentiments: [
      { emotion: 'pride', strength: 0.7 },
    ],
  },
  {
    id: 'anxious-introvert',
    name: 'Anxious introvert',
    description: 'Inward, sensitive to threat, prone to worry. High N, low E, often introspective.',
    traits: { openness: 0.65, conscientiousness: 0.55, extraversion: 0.20, agreeableness: 0.55, neuroticism: 0.85 },
    selfSentiments: [
      { emotion: 'shame', strength: 0.4 },
    ],
  },
  {
    id: 'conscientious-leader',
    name: 'Conscientious leader',
    description: 'Disciplined, reliable, socially confident, slow to anger. High C, low N.',
    traits: { openness: 0.55, conscientiousness: 0.85, extraversion: 0.65, agreeableness: 0.65, neuroticism: 0.25 },
    selfSentiments: [
      { emotion: 'pride', strength: 0.4 },
    ],
  },
  {
    id: 'free-spirit',
    name: 'Free spirit',
    description: 'Curious, exuberant, allergic to structure. High O and E, low C.',
    traits: { openness: 0.85, conscientiousness: 0.30, extraversion: 0.75, agreeableness: 0.55, neuroticism: 0.40 },
    selfSentiments: [
      { emotion: 'joy', strength: 0.3 },
    ],
  },
  {
    id: 'recluse',
    name: 'Recluse',
    description: 'Inward, prefers solitude, observant rather than sociable. Low E, mid-high N.',
    traits: { openness: 0.70, conscientiousness: 0.50, extraversion: 0.15, agreeableness: 0.35, neuroticism: 0.65 },
  },
  {
    id: 'hothead',
    name: 'Hothead',
    description: 'Reactive, easily slighted, low impulse-control. Low A, high N, low C.',
    traits: { openness: 0.50, conscientiousness: 0.30, extraversion: 0.65, agreeableness: 0.15, neuroticism: 0.75 },
  },
  {
    id: 'peacekeeper',
    name: 'Peacekeeper',
    description: 'Cooperative, slow to anger, soothes conflict. High A, low N.',
    traits: { openness: 0.55, conscientiousness: 0.60, extraversion: 0.55, agreeableness: 0.85, neuroticism: 0.30 },
  },
  {
    id: 'stoic',
    name: 'Stoic',
    description: 'Self-contained, emotionally even, dutiful. Low N, high C.',
    traits: { openness: 0.50, conscientiousness: 0.75, extraversion: 0.35, agreeableness: 0.55, neuroticism: 0.15 },
  },
  {
    id: 'trickster',
    name: 'Trickster',
    description: 'Playful, novelty-seeking, indifferent to rules. High O and E, low C and A.',
    traits: { openness: 0.80, conscientiousness: 0.25, extraversion: 0.70, agreeableness: 0.40, neuroticism: 0.50 },
    selfSentiments: [
      { emotion: 'interest', strength: 0.4 },
    ],
  },
];

/**
 * Look up an archetype by id. Returns undefined when not found rather than
 * throwing — callers can fall back to a no-op when the id is stale (e.g.
 * a project authored with a future version of the library).
 */
/**
 * Reverse lookup: which archetype does this trait bag correspond to?
 *
 * `findPersonalityArchetype` only resolves an id, so anything that STARTED from
 * an archetype (a character template, an imported project, a hand-tuned set
 * that happens to land on one) had no way to say so — the editor's archetype
 * picker sat blank next to traits that exactly matched a named archetype.
 *
 * Matching is tolerant by `epsilon` because trait values round-trip through
 * JSON and sliders; the default is tight enough that two distinct archetypes
 * can never both match, since none of them sit within 0.01 on every axis.
 * Returns undefined when the traits are genuinely custom — a bespoke character
 * should NOT be mislabelled with an archetype the author never picked.
 */
export function matchPersonalityArchetype(
  traits: Record<string, number> | undefined,
  library: ReadonlyArray<PersonalityArchetype> = DEFAULT_PERSONALITY_ARCHETYPES,
  epsilon = 0.01,
): PersonalityArchetype | undefined {
  if (!traits) return undefined;
  return library.find((a) =>
    Object.entries(a.traits).every(([axis, value]) => {
      const actual = traits[axis];
      return typeof actual === 'number' && Math.abs(actual - value) <= epsilon;
    }),
  );
}

export function findPersonalityArchetype(
  id: string,
  library: ReadonlyArray<PersonalityArchetype> = DEFAULT_PERSONALITY_ARCHETYPES,
): PersonalityArchetype | undefined {
  if (!id) return undefined;
  return library.find((a) => a.id === id);
}
