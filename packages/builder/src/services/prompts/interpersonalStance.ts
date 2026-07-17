/**
 * Interpersonal stance model — the theoretical bridge between disposition
 * variants and Big Five traits, so the character helper does NOT fork the
 * character model into "typed" and "freeform" personalities.
 *
 * Full rationale with references: docs/Interpersonal-Stance-Model.md
 *
 * Theory (2026-07-17 literature check):
 * - Scherer's affect taxonomy separates stable personality TRAITS from
 *   INTERPERSONAL STANCES ("affective position in relation to the other
 *   person in a specific interaction": warm, cold, distant, supportive,
 *   contemptuous). Disposition variants are stances held across a session.
 * - The Interpersonal Circumplex (Leary's Rose; Wiggins IAS) organizes both
 *   on two axes: dominance/control and warmth/affiliation. McCrae & Costa
 *   (1989) showed these axes are ~30° rotations of Big Five extraversion
 *   and agreeableness (E ≈ friendly dominance, A ≈ warm submissiveness);
 *   aspect-level work refines this (assertiveness ≈ dominance, compassion
 *   ≈ warmth). One trait space, two coordinate systems.
 * - Precedent: the TARDIS social-skills trainer modeled virtual-recruiter
 *   stances on Leary's circumplex; police-interview training does the same
 *   for suspect stances.
 * - Speech act / politeness theory (Brown & Levinson) describes how a
 *   stance REALIZES utterance-by-utterance (bald-on-record face threats vs
 *   positive politeness…). That belongs in prompt guidance (the
 *   `manifestation` field), not in the stored model.
 *
 * Consequence: a variant's agreeableness + extraversion are DERIVED from
 * the base character's traits plus the stance rotation — the AI authors
 * only O/C/N and the prose. A shy person turned hostile stays shy.
 */

/** Position on the interpersonal circumplex, both axes in [-1, 1]. */
export interface InterpersonalStance {
  /** Affiliation axis: cold (-1) … warm (+1). */
  warmth: number;
  /** Control axis: submissive (-1) … dominant (+1). */
  dominance: number;
}

export interface DispositionDefinition extends InterpersonalStance {
  id: string;
  label: string;
  /** Speech-act / politeness realization hints, injected into the prompt. */
  manifestation: string;
}

/**
 * The suggested disposition chips, placed on the circumplex. Coordinates
 * follow the octant tradition (hostile = cold-dominant, avoidant =
 * cold-submissive, cooperative = warm with mild deference); ambivalent is
 * near-origin by design — its signature is oscillation, which lives in the
 * manifestation text, not in a static position.
 */
export const SUGGESTED_DISPOSITION_DEFS: DispositionDefinition[] = [
  {
    id: 'cooperative',
    label: 'Cooperative',
    warmth: 0.7,
    dominance: -0.2,
    manifestation:
      'positive politeness: direct answers, offers information unprompted, mild hedges, accepts reframing, thanks and acknowledges',
  },
  {
    id: 'hostile',
    label: 'Hostile',
    warmth: -0.7,
    dominance: 0.5,
    manifestation:
      'bald-on-record face threats: interruptions, demands, refusals, blame assignments, rhetorical challenges, no softening',
  },
  {
    id: 'avoidant',
    label: 'Avoidant',
    warmth: -0.4,
    dominance: -0.6,
    manifestation:
      'off-record and withdrawal moves: topic changes, minimal answers, vague deflections, long pauses, avoids commitment and eye contact',
  },
  {
    id: 'ambivalent',
    label: 'Ambivalent',
    warmth: 0.1,
    dominance: -0.1,
    manifestation:
      'oscillating approach-withdraw cycles: politeness strategy shifts mid-turn, agreement followed by retraction, asks for help then rejects it',
  },
];

/** Case-insensitive lookup by chip label or slug id. */
export function findDispositionDefinition(labelOrId: string): DispositionDefinition | undefined {
  const needle = (labelOrId || '').trim().toLowerCase();
  if (!needle) return undefined;
  return SUGGESTED_DISPOSITION_DEFS.find(
    (d) => d.id === needle || d.label.toLowerCase() === needle,
  );
}

/**
 * Rotate circumplex coordinates into Big Five deltas (each ~[-1, 1]).
 * Standard ~45° rotation: E loads on friendly dominance, A on warm
 * submissiveness (McCrae & Costa 1989; exact literature angle is ~30°,
 * 45° keeps the math symmetric — the weight below absorbs the scale).
 */
export function stanceToTraitDeltas(stance: InterpersonalStance): {
  extraversion: number;
  agreeableness: number;
} {
  return {
    extraversion: (stance.dominance + stance.warmth) / Math.SQRT2,
    agreeableness: (stance.warmth - stance.dominance) / Math.SQRT2,
  };
}

/**
 * Inverse rotation — where a Big Five profile sits on the circumplex
 * (traits in [0, 1] → axes in [-1, 1]). Provided so trait presets /
 * archetypes and stances provably live in ONE space; useful later for
 * showing any character or archetype on a Leary-style rose.
 */
export function bigFiveToStance(traits: {
  extraversion?: number;
  agreeableness?: number;
}): InterpersonalStance {
  const e = (traits.extraversion ?? 0.5) * 2 - 1;
  const a = (traits.agreeableness ?? 0.5) * 2 - 1;
  return {
    dominance: (e - a) / Math.SQRT2,
    warmth: (e + a) / Math.SQRT2,
  };
}

/**
 * How strongly a stance displaces the base character's A/E. 0.35 keeps
 * the person recognizable across dispositions (a shy hostile stays shy)
 * while making the stance clearly legible in the traits. Tunable.
 */
export const STANCE_TRAIT_WEIGHT = 0.35;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Derive a variant's traits from the BASE character's traits plus the
 * stance rotation. Only extraversion and agreeableness are displaced —
 * the circumplex says nothing about O/C/N, which stay whatever the
 * caller provides (AI-authored).
 */
export function applyStanceToTraits(
  baseTraits: Record<string, number>,
  stance: InterpersonalStance,
  weight: number = STANCE_TRAIT_WEIGHT,
): { extraversion: number; agreeableness: number } {
  const deltas = stanceToTraitDeltas(stance);
  return {
    extraversion: clamp01((baseTraits.extraversion ?? 0.5) + weight * deltas.extraversion),
    agreeableness: clamp01((baseTraits.agreeableness ?? 0.5) + weight * deltas.agreeableness),
  };
}

const clampAxis = (n: number) => Math.min(1, Math.max(-1, n));

/** Normalize an AI-returned stance object; null when unusable. */
export function normalizeStance(raw: unknown): InterpersonalStance | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.warmth !== 'number' || typeof obj.dominance !== 'number') return null;
  if (!Number.isFinite(obj.warmth) || !Number.isFinite(obj.dominance)) return null;
  return { warmth: clampAxis(obj.warmth), dominance: clampAxis(obj.dominance) };
}
