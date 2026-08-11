/**
 * Tracked quantities — turning "this character's trust matters" into a real
 * counter, without making the author assemble one by hand.
 *
 * The character helper can propose *which* feeling is worth tracking; this
 * module turns that proposal plus two authorial decisions into the counter
 * that results. The two decisions are deliberately about the fiction, not
 * about the machinery (docs/Counter-Binding-Design.md):
 *
 *   1. How does it move?  authored — you set it at specific moments
 *                         responsive — it shifts from what happens
 *   2. How is it seen?    meter | words | hidden
 *
 * They are independent, which is the whole point: "responsive + hidden" is a
 * modelled feeling with no HUD, and "responsive + words" is the case that
 * used to be unrepresentable — a simple readable label fronting a full
 * affect model. Neither is a tier of the other.
 */
import type { BindableCounter, CounterBand, CounterSource } from './counterBinding';

/** How the quantity changes during play. */
export type QuantityMovement = 'authored' | 'responsive';

/** What, if anything, the interactor sees. */
export type QuantityVisibility = 'meter' | 'words' | 'hidden';

export interface TrackedQuantityProposal {
  /** Sentiment emotion name, lowercase. */
  emotion: string;
  /** Author-facing meter label. */
  displayName?: string;
  /**
   * Whether the feeling has a real opposite. Trust does (distrust); fear
   * does not — its absence is calm, not anti-fear. Drives the range, and
   * therefore whether the bar grows from the centre or from the left edge.
   */
  bipolar?: boolean;
}

export interface TrackedQuantityChoice {
  movement: QuantityMovement;
  visibility: QuantityVisibility;
  /** Entity the feeling points at. Defaults to the player sentinel. */
  toEntityRef?: string;
}

/** Ladder for a feeling with a real opposite. Zero gets its own name. */
function bipolarBands(min: number, max: number, label: string): CounterBand[] {
  const noun = label.toLowerCase();
  return [
    { from: min, label: `strong dis${noun}` },
    { from: min * 0.6, label: 'wary' },
    { from: min * 0.2, label: 'neutral' },
    { from: max * 0.2, label: noun },
    { from: max * 0.6, label: `deep ${noun}` },
  ];
}

/** Intensity ladder for a feeling with no opposite. Zero is genuinely "none". */
function unipolarBands(min: number, max: number): CounterBand[] {
  const span = max - min;
  return [
    { from: min, label: 'none' },
    { from: min + span * 0.25, label: 'slight' },
    { from: min + span * 0.5, label: 'moderate' },
    { from: min + span * 0.75, label: 'strong' },
  ];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Build the counter a proposal + choice implies.
 *
 * Returns null for `visibility: 'hidden'` on a responsive quantity: the
 * feeling is modelled in the affect system already, and adding an invisible
 * counter that mirrors it would be a second representation of one thing with
 * no way to see either. An authored quantity always yields a counter, since
 * without one there is nothing to move.
 */
export function buildTrackedQuantityCounter(
  proposal: TrackedQuantityProposal,
  choice: TrackedQuantityChoice,
): BindableCounter & { displayName: string; visible: boolean } | null {
  const emotion = (proposal.emotion || '').trim().toLowerCase();
  if (!emotion) return null;

  const responsive = choice.movement === 'responsive';
  if (responsive && choice.visibility === 'hidden') return null;

  const displayName = proposal.displayName?.trim()
    || emotion.charAt(0).toUpperCase() + emotion.slice(1);

  // Only a responsive quantity can be bipolar in the honest sense: an
  // authored counter's range is whatever the author decides to move it
  // between, and 0..100 is the familiar shape.
  const bipolar = responsive && proposal.bipolar !== false;
  const min = bipolar ? -100 : 0;
  const max = 100;

  const source: CounterSource | undefined = responsive
    ? { kind: 'sentiment', toEntityRef: choice.toEntityRef || 'player', emotion }
    : undefined;

  const showsBar = choice.visibility === 'meter';
  const showsWords = choice.visibility === 'words';

  return {
    name: slug(emotion) || 'feeling',
    displayName,
    value: 0,
    min,
    max,
    visible: choice.visibility !== 'hidden',
    ...(source ? { source } : {}),
    showLevelMeter: showsBar,
    levelMeterOrientation: 'horizontal',
    showNumericValue: showsBar || showsWords,
    numericFormat: showsWords ? 'band' : 'value',
    ...(showsWords
      ? { bands: bipolar ? bipolarBands(min, max, displayName) : unipolarBands(min, max) }
      : {}),
  } as BindableCounter & { displayName: string; visible: boolean };
}

/**
 * One-line summary of what the author just chose, for the confirmation the
 * helper shows before it writes anything.
 */
export function describeTrackedQuantity(
  proposal: TrackedQuantityProposal,
  choice: TrackedQuantityChoice,
): string {
  const label = proposal.displayName || proposal.emotion;
  const moves = choice.movement === 'responsive'
    ? 'shifts from what happens in the story'
    : 'changes only where you set it';
  const seen =
    choice.visibility === 'meter' ? 'shown as a meter'
    : choice.visibility === 'words' ? 'shown as a word ("wary", "trusting")'
    : 'never shown — it shapes what happens, the interactor infers it';
  return `${label} ${moves}, ${seen}.`;
}
