/**
 * Opening stance — what a character feels toward someone *before* the story
 * has given them any reason to feel anything.
 *
 * Today every sentiment starts at exactly zero. Archetypes deliberately seed
 * only self-directed sentiments ("a project-agnostic preset cannot know the
 * cast"), so even a fully specified personality opens neutral toward the
 * entire cast. The consequence shows up the moment a bound meter is on
 * screen: every relationship meter reads dead centre on beat one, and a
 * qualitative ladder without a neutral band opens by calling someone wary
 * before they have met anyone.
 *
 * This module proposes an opening value from the character's traits. It is
 * **only ever a suggestion**: an opening stance toward another character is
 * an authorial decision, and deriving it silently would overrule authors who
 * meant zero. Nothing here is called by the runtime — the editor offers it,
 * the author accepts or ignores it, and what gets stored is an ordinary
 * authored `initialSentiments` entry indistinguishable from a hand-typed one.
 *
 * See docs/Counter-Binding-Design.md ("Follow-on") and
 * docs/Interpersonal-Stance-Model.md.
 */

/**
 * How far traits are allowed to move an opening sentiment.
 *
 * Deliberately modest. A maximally agreeable character opens *mildly*
 * trusting, not devoted — the story is supposed to earn the rest, and a
 * strong opening value would leave little headroom for anything that happens
 * later to register on the meter.
 */
export const OPENING_STANCE_SCALE = 0.35;

export interface OpeningStanceSuggestion {
  /** Suggested sentiment strength ∈ [−OPENING_STANCE_SCALE, +OPENING_STANCE_SCALE]. */
  strength: number;
  /** Short author-facing phrase, e.g. "mildly trusting". */
  description: string;
  /** The trait that drove it, so the editor can explain itself. */
  basis: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Suggest an opening `trust`-like sentiment from personality.
 *
 * Grounded in **Agreeableness**, whose NEO-PI-R facet A1 *is* Trust — a more
 * direct warrant for this particular quantity than the interpersonal
 * circumplex, which models the broader warmth/dominance plane. Extraversion
 * is deliberately not mixed in: a shy character can be perfectly trusting,
 * and blending the two would make the suggestion harder to predict without
 * making it more accurate.
 *
 * Returns `null` when the character has no agreeableness value — a character
 * with no personality gets no proposal rather than a fabricated neutral one.
 * That is the affect opt-out working as intended, not a missing case.
 */
export function suggestOpeningStance(
  traits: Record<string, number> | null | undefined,
  scale: number = OPENING_STANCE_SCALE,
): OpeningStanceSuggestion | null {
  const agreeableness = traits?.agreeableness;
  if (typeof agreeableness !== 'number' || !Number.isFinite(agreeableness)) return null;

  // Traits are [0, 1] with 0.5 average; centre to [-1, 1] before scaling.
  const centred = clamp(agreeableness, 0, 1) * 2 - 1;
  const strength = Math.round(centred * scale * 100) / 100;

  return {
    strength,
    description: describeOpeningStance(strength),
    basis:
      agreeableness >= 0.8 ? 'very high agreeableness'
      : agreeableness >= 0.6 ? 'high agreeableness'
      : agreeableness <= 0.2 ? 'very low agreeableness'
      : agreeableness <= 0.4 ? 'low agreeableness'
      : 'average agreeableness',
  };
}

/**
 * Phrase for a suggested opening strength. Bands are narrow because the
 * suggestion itself is capped well below ±1 — "trusting" here means the
 * disposition a stranger starts with, not a relationship's end state.
 */
export function describeOpeningStance(strength: number): string {
  if (strength >= 0.25) return 'openly trusting';
  if (strength >= 0.1) return 'mildly trusting';
  if (strength > -0.1) return 'neutral';
  if (strength > -0.25) return 'mildly wary';
  return 'guarded';
}
