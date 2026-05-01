/**
 * Effect templates — author-friendly presets for the ChoiceEffectsEditor.
 *
 * Each template is an *intent* ("empathetic max-support", "pushy /
 * dismissive", "boundary respecting") that expands into a coherent set
 * of affect-stack effects. Authors pick the template; the editor fills
 * in the rows; authors fine-tune from there.
 *
 * Template effects don't reference a specific character — the consumer
 * passes in the active `target` (the character the choice is about) and
 * the template's `forge()` returns a concrete Effect[] with that
 * character substituted in. The same template applies to Alex or to any
 * other character; only the values are baked in.
 *
 * Naming follows the Alex example's three-bucket pattern (max / partial /
 * failed empathy) plus three thematic specialty presets (boundary
 * respecting, validating, defensive overreach). Authors aren't
 * commitment-locked to these; templates are starting points, not
 * frozen contracts.
 */
import type { Effect } from '@asaps/core';

export interface EffectTemplate {
  id: string;
  /** Display name shown in the dropdown. */
  name: string;
  /** One-line description shown in the dropdown's caption. */
  description: string;
  /**
   * Build the concrete Effect[] for this template, given:
   *   `target`     — the character id the choice is about
   *   `playerRef`  — usually `'player'`; the entity the character's
   *                  player-directed sentiments target
   *   `counters`   — names of counters that exist in the project (used
   *                  to skip increments for counters the project doesn't
   *                  have, e.g. supportScore in non-Alex stories)
   */
  forge(args: { target: string; playerRef: string; counters: ReadonlyArray<string> }): Effect[];
}

/**
 * Helper: emit `incrementCounter` only when the counter exists in the
 * project. Templates that target named counters (supportScore,
 * maxSupport, etc.) call this so they don't silently create stray
 * counter rows in projects that don't use them.
 */
function maybeCounter(counters: ReadonlyArray<string>, name: string, value: number): Effect[] {
  return counters.includes(name)
    ? [{ type: 'incrementCounter', target: name, value } as Effect]
    : [];
}

export const DEFAULT_EFFECT_TEMPLATES: EffectTemplate[] = [
  {
    id: 'empathetic-max',
    name: 'Empathetic — full support',
    description: 'Player shows up exactly the way the character needed. Mood lifts strongly, fear drops, joy fires, trust grows; small reduction in self-doubt.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', 2),
      ...maybeCounter(counters, 'maxSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.30, arousalDelta: -0.10 } as Effect,
      { type: 'fireEmotion', target, emotion: 'joy', emotionDelta: 0.30 } as Effect,
      { type: 'fireEmotion', target, emotion: 'fear', emotionDelta: -0.20 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'trust', strengthDelta: 0.40 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: target, sentimentEmotion: 'shame', strengthDelta: -0.05 } as Effect,
    ],
  },
  {
    id: 'empathetic-partial',
    name: 'Empathetic — partial / well-meaning',
    description: 'Kind intent that doesn\'t quite land. Mood lifts a little, joy fires gently, gratitude grows but trust doesn\'t fully form.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', 1),
      ...maybeCounter(counters, 'partialSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.15, arousalDelta: -0.05 } as Effect,
      { type: 'fireEmotion', target, emotion: 'joy', emotionDelta: 0.15 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'gratitude', strengthDelta: 0.20 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: target, sentimentEmotion: 'shame', strengthDelta: -0.02 } as Effect,
    ],
  },
  {
    id: 'pushy-dismissive',
    name: 'Pushy / dismissive',
    description: 'Player overrides what the character needs. Mood drops, fear and shame spike, trust erodes; self-doubt deepens.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', -1),
      ...maybeCounter(counters, 'failedSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: -0.30, arousalDelta: 0.30 } as Effect,
      { type: 'fireEmotion', target, emotion: 'fear', emotionDelta: 0.30 } as Effect,
      { type: 'fireEmotion', target, emotion: 'shame', emotionDelta: 0.20 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'trust', strengthDelta: -0.30 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: target, sentimentEmotion: 'shame', strengthDelta: 0.05 } as Effect,
    ],
  },
  {
    id: 'silent-failed',
    name: 'Silent / felt-abandoned',
    description: 'Player doesn\'t step up when needed. Mood drops, sadness fires, trust erodes — the absence registers as harm.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', -1),
      ...maybeCounter(counters, 'failedSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: -0.40, arousalDelta: 0.20 } as Effect,
      { type: 'fireEmotion', target, emotion: 'sadness', emotionDelta: 0.40 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'trust', strengthDelta: -0.40 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: target, sentimentEmotion: 'shame', strengthDelta: 0.05 } as Effect,
    ],
  },
  {
    id: 'boundary-respecting',
    name: 'Boundary respecting',
    description: 'Player names what was inappropriate without making it about themselves. Strong relief, pride fires, deep trust forms.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', 2),
      ...maybeCounter(counters, 'maxSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.30, arousalDelta: -0.20 } as Effect,
      { type: 'fireEmotion', target, emotion: 'pride', emotionDelta: 0.30 } as Effect,
      { type: 'fireEmotion', target, emotion: 'fear', emotionDelta: -0.40 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'trust', strengthDelta: 0.50 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: target, sentimentEmotion: 'fear', strengthDelta: -0.05 } as Effect,
    ],
  },
  {
    id: 'validating',
    name: 'Validating / "I see you"',
    description: 'Player witnesses the character\'s feelings without trying to fix or redirect. Quiet positive shift, gratitude grows, gentle joy.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'supportScore', 1),
      ...maybeCounter(counters, 'partialSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.20, arousalDelta: -0.15 } as Effect,
      { type: 'fireEmotion', target, emotion: 'joy', emotionDelta: 0.20 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'gratitude', strengthDelta: 0.30 } as Effect,
    ],
  },
  {
    id: 'defensive-overreach',
    name: 'Defensive overreach',
    description: 'Player means well but speaks for the character or shares more than they should. Ambivalent — fear ticks up, mood lifts slightly, trust earns and erodes at the same time.',
    forge: ({ target, playerRef, counters }) => [
      ...maybeCounter(counters, 'partialSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.05, arousalDelta: 0.10 } as Effect,
      { type: 'fireEmotion', target, emotion: 'fear', emotionDelta: 0.10 } as Effect,
      { type: 'addSentiment', target, sentimentTarget: playerRef, sentimentEmotion: 'trust', strengthDelta: -0.10 } as Effect,
    ],
  },
  {
    id: 'recovery-quiet',
    name: 'Quiet recovery',
    description: 'Player offers a small, non-demanding presence. Mood eases toward neutral, fear softens, no sentiment shift.',
    forge: ({ target, counters }) => [
      ...maybeCounter(counters, 'partialSupport', 1),
      { type: 'nudgeMood', target, valenceDelta: 0.10, arousalDelta: -0.20 } as Effect,
      { type: 'fireEmotion', target, emotion: 'fear', emotionDelta: -0.20 } as Effect,
    ],
  },
];

/**
 * Look up a template by id. Returns undefined when not found rather than
 * throwing — callers can fall back to a no-op when an unknown id is
 * passed (e.g. from a project authored against a future template
 * library version).
 */
export function findEffectTemplate(
  id: string,
  library: ReadonlyArray<EffectTemplate> = DEFAULT_EFFECT_TEMPLATES,
): EffectTemplate | undefined {
  if (!id) return undefined;
  return library.find((t) => t.id === id);
}
