/**
 * Condition templates — author-friendly presets for the ConditionBeat
 * editor and the RequirementsEditor.
 *
 * Each template is an *intent* ("trust toward player has formed",
 * "Alex's mood has lifted since story start", "fear has eased since the
 * reunion") that expands into a fully-formed `Condition` object. Authors
 * pick the template; the editor seeds the per-field values; authors
 * fine-tune from there.
 *
 * Templates fall into two flavours:
 *   - **threshold**: "value is now ≥ X" — point-in-time state. Cheap and
 *     direct, but reads against an absolute value, so a character who
 *     started off-neutral might already pass / never pass without ever
 *     having moved.
 *   - **delta-from-initial**: "value has improved by ≥ X since story
 *     start" — the runtime captures the slot's value at first-touch and
 *     compares the delta. Robust to off-neutral starting points; the
 *     natural read of "X has grown" / "X has eased" / "X has improved".
 *
 * The bookmarked variant ("X has improved since the reunion-scene
 * bookmark") uses the same baseline switch with `{ bookmark: name }` —
 * the template can't know what bookmark names exist, so we don't seed
 * those; authors pick a delta-from-initial template, then optionally
 * change the baseline source in the editor.
 *
 * Like effect templates, each template's `forge()` takes the active
 * `target` (the character the condition is about) and `playerRef`
 * ('player') so the same template applies to any character.
 */
import type { Condition } from '@asaps/core';

export interface ConditionTemplate {
  id: string;
  /** Display name shown in the dropdown. */
  name: string;
  /** One-line description shown beneath the dropdown. */
  description: string;
  /** Category for optgroup-style grouping. */
  category: 'mood' | 'emotion' | 'sentiment' | 'trait' | 'goal' | 'variant';
  /**
   * Build the concrete Condition for this template.
   *   target    — character id the condition is about (mood-holder,
   *               emotion-holder, sentiment-holder, etc.)
   *   playerRef — usually 'player'; the entity that player-directed
   *               sentiments target.
   */
  forge(args: { target: string; playerRef: string }): Condition;
}

/**
 * Convert a Condition object into a flat parameter patch suitable for
 * the ConditionBeat parameter store. `type` becomes `conditionType`;
 * everything else passes through 1:1. Used by the Inspector when
 * applying a template to a ConditionBeat (which stores condition fields
 * as flat beat parameters rather than as a nested Condition object).
 */
export function conditionToFlatParams(cond: Condition): Record<string, any> {
  const { type, ...rest } = cond as any;
  return { conditionType: type, ...rest };
}

export const DEFAULT_CONDITION_TEMPLATES: ConditionTemplate[] = [
  // ============================================================
  // MOOD
  // ============================================================
  {
    id: 'mood-now-happy',
    name: 'Mood — visibly happy (now)',
    description: 'Character\'s valence is comfortably above neutral. Threshold check, ignores starting point.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'valence', operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'mood-now-sad',
    name: 'Mood — visibly sad (now)',
    description: 'Character\'s valence is below neutral. Threshold check.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'valence', operator: '<=', value: -0.3,
    } as Condition),
  },
  {
    id: 'mood-now-excited',
    name: 'Mood — highly activated (now)',
    description: 'Character\'s arousal is well above resting. Threshold check.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'arousal', operator: '>=', value: 0.4,
    } as Condition),
  },
  {
    id: 'mood-now-calm',
    name: 'Mood — calm / settled (now)',
    description: 'Character\'s arousal is well below resting. Threshold check.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'arousal', operator: '<=', value: -0.3,
    } as Condition),
  },
  {
    id: 'mood-improved-since-start',
    name: 'Mood — improved since start',
    description: 'Mood has lifted by ≥ 0.3 from where the character started. Robust to off-neutral seeds.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'valence', operator: '>=', value: 0.3,
      baseline: 'initial',
    } as Condition),
  },
  {
    id: 'mood-worsened-since-start',
    name: 'Mood — worsened since start',
    description: 'Mood has dropped by ≥ 0.3 from where the character started. Robust to off-neutral seeds.',
    category: 'mood',
    forge: ({ target }) => ({
      type: 'mood', character: target, moodAxis: 'valence', operator: '<=', value: -0.3,
      baseline: 'initial',
    } as Condition),
  },

  // ============================================================
  // EMOTION
  // ============================================================
  {
    id: 'emotion-now-fearful',
    name: 'Emotion — visibly fearful (now)',
    description: 'Character\'s fear intensity is high. Threshold check.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'fear', operator: '>=', value: 0.4,
    } as Condition),
  },
  {
    id: 'emotion-now-joyful',
    name: 'Emotion — visibly joyful (now)',
    description: 'Character\'s joy intensity is high. Threshold check.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'joy', operator: '>=', value: 0.4,
    } as Condition),
  },
  {
    id: 'emotion-now-ashamed',
    name: 'Emotion — carrying shame (now)',
    description: 'Character\'s shame intensity is meaningful. Threshold check.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'shame', operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'emotion-now-proud',
    name: 'Emotion — proud (now)',
    description: 'Character\'s pride intensity is meaningful. Threshold check.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'pride', operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'emotion-now-saddened',
    name: 'Emotion — saddened (now)',
    description: 'Character\'s sadness intensity is meaningful. Threshold check.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'sadness', operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'emotion-fear-eased-since-start',
    name: 'Emotion — fear has eased since start',
    description: 'Fear intensity has dropped by ≥ 0.2 from the starting level. Reads as relief earned.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'fear', operator: '<=', value: -0.2,
      baseline: 'initial',
    } as Condition),
  },
  {
    id: 'emotion-joy-grown-since-start',
    name: 'Emotion — joy has grown since start',
    description: 'Joy intensity has risen by ≥ 0.2 from the starting level.',
    category: 'emotion',
    forge: ({ target }) => ({
      type: 'emotion', character: target, emotionName: 'joy', operator: '>=', value: 0.2,
      baseline: 'initial',
    } as Condition),
  },

  // ============================================================
  // SENTIMENT
  // ============================================================
  {
    id: 'sentiment-trusts-player-now',
    name: 'Sentiment — trusts the player (now)',
    description: 'Character\'s trust toward the player is at a real-bond threshold. Point-in-time check.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'trust',
      operator: '>=', value: 0.4,
    } as Condition),
  },
  {
    id: 'sentiment-distrusts-player-now',
    name: 'Sentiment — distrusts the player (now)',
    description: 'Character\'s trust toward the player has gone negative.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'trust',
      operator: '<=', value: -0.2,
    } as Condition),
  },
  {
    id: 'sentiment-grateful-to-player-now',
    name: 'Sentiment — grateful to the player (now)',
    description: 'Character feels meaningful gratitude toward the player.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'gratitude',
      operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'sentiment-fears-player-now',
    name: 'Sentiment — fears the player (now)',
    description: 'Character feels meaningful fear toward the player.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'fear',
      operator: '>=', value: 0.3,
    } as Condition),
  },
  {
    id: 'sentiment-trust-grown-since-start',
    name: 'Sentiment — trust toward player has grown since start',
    description: 'Trust strength has risen by ≥ 0.3 from the starting value. Reads as a relationship earned.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'trust',
      operator: '>=', value: 0.3,
      baseline: 'initial',
    } as Condition),
  },
  {
    id: 'sentiment-trust-eroded-since-start',
    name: 'Sentiment — trust toward player has eroded since start',
    description: 'Trust strength has dropped by ≥ 0.3 from the starting value. Reads as a relationship damaged.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, sentimentEmotion: 'trust',
      operator: '<=', value: -0.3,
      baseline: 'initial',
    } as Condition),
  },
  {
    id: 'sentiment-overall-positive-now',
    name: 'Sentiment — overall feels positive toward player (now)',
    description: 'Sum of all sentiments toward the player is meaningfully positive. Empty emotion = sum across emotions.',
    category: 'sentiment',
    forge: ({ target, playerRef }) => ({
      type: 'sentiment', character: target,
      sentimentTarget: playerRef, // sentimentEmotion intentionally omitted — sums all
      operator: '>=', value: 0.5,
    } as Condition),
  },

  // ============================================================
  // TRAIT
  // ============================================================
  {
    id: 'trait-high-conscientiousness',
    name: 'Trait — highly conscientious',
    description: 'Big Five conscientiousness ≥ 0.7. Use to gate "they\'d follow through" choices.',
    category: 'trait',
    forge: ({ target }) => ({
      type: 'trait', character: target, traitName: 'conscientiousness',
      operator: '>=', value: 0.7,
    } as Condition),
  },
  {
    id: 'trait-low-agreeableness',
    name: 'Trait — combative (low agreeableness)',
    description: 'Big Five agreeableness ≤ 0.3. Use to gate confrontation-friendly branches.',
    category: 'trait',
    forge: ({ target }) => ({
      type: 'trait', character: target, traitName: 'agreeableness',
      operator: '<=', value: 0.3,
    } as Condition),
  },
  {
    id: 'trait-high-neuroticism',
    name: 'Trait — anxious (high neuroticism)',
    description: 'Big Five neuroticism ≥ 0.7. Use to gate "they\'d catastrophise" reactions.',
    category: 'trait',
    forge: ({ target }) => ({
      type: 'trait', character: target, traitName: 'neuroticism',
      operator: '>=', value: 0.7,
    } as Condition),
  },
  {
    id: 'trait-high-extraversion',
    name: 'Trait — outgoing (high extraversion)',
    description: 'Big Five extraversion ≥ 0.7. Use to gate "they\'d engage" branches.',
    category: 'trait',
    forge: ({ target }) => ({
      type: 'trait', character: target, traitName: 'extraversion',
      operator: '>=', value: 0.7,
    } as Condition),
  },

  // ============================================================
  // GOAL
  // ============================================================
  {
    id: 'goal-met',
    name: 'Goal — met',
    description: 'A specific goal has been satisfied. Fill in the goal id after applying.',
    category: 'goal',
    forge: ({ target }) => ({
      type: 'goal', character: target, goalId: '',
      operator: '==', goalStatus: 'met',
    } as Condition),
  },
  {
    id: 'goal-failed',
    name: 'Goal — failed',
    description: 'A specific goal has been marked as failed. Fill in the goal id after applying.',
    category: 'goal',
    forge: ({ target }) => ({
      type: 'goal', character: target, goalId: '',
      operator: '==', goalStatus: 'failed',
    } as Condition),
  },
  {
    id: 'goal-still-open',
    name: 'Goal — still open',
    description: 'A specific goal hasn\'t been closed yet. Fill in the goal id after applying.',
    category: 'goal',
    forge: ({ target }) => ({
      type: 'goal', character: target, goalId: '',
      operator: '==', goalStatus: 'open',
    } as Condition),
  },

  // ============================================================
  // VARIANT
  // ============================================================
  {
    id: 'variant-active',
    name: 'Variant — specific persona is active',
    description: 'Character is currently running under a specific authored variant. Fill in the variant id after applying.',
    category: 'variant',
    forge: ({ target }) => ({
      type: 'characterVariant', character: target, variantId: '',
      operator: '==',
    } as Condition),
  },
];

/**
 * Look up a template by id. Returns undefined when not found rather than
 * throwing — callers can fall back to a no-op when an unknown id is
 * passed (e.g. from a project authored against a future template
 * library version).
 */
export function findConditionTemplate(
  id: string,
  library: ReadonlyArray<ConditionTemplate> = DEFAULT_CONDITION_TEMPLATES,
): ConditionTemplate | undefined {
  if (!id) return undefined;
  return library.find((t) => t.id === id);
}

/**
 * Group templates by category for optgroup rendering. Returns categories
 * in a stable display order with their members in declaration order.
 */
export function groupConditionTemplates(
  library: ReadonlyArray<ConditionTemplate> = DEFAULT_CONDITION_TEMPLATES,
): Array<{ category: ConditionTemplate['category']; label: string; members: ConditionTemplate[] }> {
  const order: Array<ConditionTemplate['category']> = [
    'mood', 'emotion', 'sentiment', 'trait', 'goal', 'variant',
  ];
  const labels: Record<ConditionTemplate['category'], string> = {
    mood: 'Mood',
    emotion: 'Emotion',
    sentiment: 'Sentiment',
    trait: 'Trait (personality)',
    goal: 'Goal',
    variant: 'Active variant',
  };
  return order
    .map((cat) => ({
      category: cat,
      label: labels[cat],
      members: library.filter((t) => t.category === cat),
    }))
    .filter((g) => g.members.length > 0);
}
