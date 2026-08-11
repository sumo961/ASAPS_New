/**
 * Counter binding — "counter as display, not mechanic".
 *
 * A character counter may declare a `source`, which turns it from an
 * authored quantity (moved only by setCounter/changeCounter effects) into a
 * **read-only window onto affect state**. It still renders as an ordinary
 * meter; only where its value comes from changes.
 *
 * See `docs/Counter-Binding-Design.md` for the design and the decisions
 * behind it. The rules this module implements:
 *
 *   1. The bar **originates at zero**, wherever zero falls in [min, max],
 *      and grows toward the value. There is no projection setting — the
 *      author's min/max already says everything. `min: 0` therefore means
 *      "this word has no opposite", and negatives read as an empty bar.
 *   2. Bands partition the range by last-threshold-≤-value, so every value
 *      resolves to a label and there is never a blank readout.
 *   3. Nothing here mutates. Derivation is read-only by construction: a
 *      derived counter that could also be written would become a second
 *      authority over affect state and lose to the next appraisal tick.
 *
 * Everything in this file is pure — the runtime is reached only through the
 * narrow `AffectReader` interface, which `StoryContext` satisfies
 * structurally. That keeps the projection and band arithmetic exhaustively
 * testable without constructing an engine.
 */

/**
 * Where a derived counter reads from. Each kind names one of the three
 * affect stores, which differ in a way that matters for display:
 *
 *   - `sentiment` — `characterSentiments`, **directed** and **bipolar**
 *     ([-1, 1]). Negative trust is distrust: a real, nameable state.
 *   - `emotion`   — `characterEmotionLevels`, undirected **intensity**
 *     ([0, 1]). Fear has no opposite; the store cannot go below zero.
 *   - `mood`      — `characterMoods`, one axis of the circumplex ([-1, 1]).
 *
 * Note that a *directed* sentiment is still not always bipolar — "fear of
 * the wolf" is legitimately unipolar — which is why polarity is declared by
 * the counter's `min` rather than inferred from the store.
 */
export type CounterSource =
  | {
      kind: 'sentiment';
      /** Entity the sentiment points at — character id, item name, or author tag. */
      toEntityRef: string;
      /** Emotion label, matching the authored sentiment (free text). */
      emotion: string;
      /**
       * Whose sentiment is shown. Omitted = the counter's own character.
       * Set it to point a meter at someone else — the player-facing
       * "how much does the caseworker trust you" bar.
       */
      fromCharacterRef?: string;
    }
  | { kind: 'emotion'; emotion: string }
  | { kind: 'mood'; axis: 'valence' | 'arousal' };

/**
 * One named region of a counter's range. `from` is the inclusive lower
 * bound; the band runs until the next band's `from`. Player-facing text —
 * `label` must ride through both translation extractors.
 */
export interface CounterBand {
  from: number;
  label: string;
}

/**
 * The slice of a character counter this module needs. Deliberately
 * structural rather than an import of the builder's `CharacterCounter`,
 * which carries display fields core has no business knowing about.
 */
export interface BindableCounter {
  name: string;
  /** Authored value. Ignored entirely when `source` is set. */
  value?: number;
  min?: number;
  max?: number;
  source?: CounterSource;
  bands?: CounterBand[];
}

/**
 * The runtime reads a derived counter needs. `StoryContext` already
 * implements all three with these exact signatures, so it satisfies this
 * interface without an adapter.
 */
export interface AffectReader {
  getSentimentTo(fromCharRef: string, toEntityRef: string, emotion?: string): number;
  getCharacterEmotion(charRef: string, emotion: string): number;
  getCharacterMood(charRef: string): { valence: number; arousal: number } | undefined;
}

/** Inclusive numeric range a counter's bar spans. */
export interface CounterRange {
  min: number;
  max: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** True when this counter derives its value from affect state. */
export function isDerivedCounter(counter: BindableCounter | null | undefined): boolean {
  return !!counter?.source;
}

/**
 * The counter's effective range, falling back to a default chosen by source
 * kind when the author hasn't set min/max.
 *
 * The defaults follow one rule: **never hide state**. A sentiment store is
 * signed, so an unset range defaults to bipolar — defaulting it to [0, 100]
 * would silently floor real negative state and make the meter under-read
 * while the underlying value kept drifting. Emotion levels are already
 * [0, 1] in the store, so a unipolar default loses nothing.
 *
 * An author who wants the unipolar reading for a sentiment ("I don't model
 * distrust") declares it by setting `min: 0`.
 */
export function counterRange(counter: BindableCounter | null | undefined): CounterRange {
  const kind = counter?.source?.kind;
  const bipolarByDefault = kind === 'sentiment' || kind === 'mood';
  const min = typeof counter?.min === 'number' ? counter.min : bipolarByDefault ? -100 : 0;
  const max = typeof counter?.max === 'number' ? counter.max : 100;
  // A degenerate or inverted range would make every ratio meaningless.
  // Repair it rather than emitting NaN into the renderer.
  return max > min ? { min, max } : { min, max: min + 1 };
}

/**
 * Project a signed affect strength ∈ [-1, 1] onto a counter range.
 *
 * The two halves scale independently against their own bound, which is what
 * makes asymmetric ranges (`min: -50, max: 100`) behave and what makes
 * `min: 0` clamp negatives to empty as a consequence of the rule rather
 * than as a special case.
 */
export function projectStrength(strength: number, range: CounterRange): number {
  const s = clamp(Number.isFinite(strength) ? strength : 0, -1, 1);
  const raw = s >= 0 ? s * range.max : s * Math.abs(range.min);
  // Round before clamping: floating-point multiplication produces values like
  // -43.99999999999999, which reach the player as-is in a numeric readout.
  // Two decimals keeps small ranges (0..1) usable while killing the noise.
  return clamp(Math.round(raw * 100) / 100, range.min, range.max);
}

/**
 * Where zero sits along the bar, as a 0..1 ratio of its width. This is the
 * bar's origin: 0 for a [0, 100] range (left edge), 0.5 for [-100, 100]
 * (centre), a third for [-50, 100].
 */
export function zeroOffsetRatio(range: CounterRange): number {
  return clamp((0 - range.min) / (range.max - range.min), 0, 1);
}

/** Fill geometry for a bar that grows outward from zero. */
export interface BarFill {
  /** Left edge of the filled span, as a 0..1 ratio. */
  start: number;
  /** Right edge of the filled span, as a 0..1 ratio. */
  end: number;
  /** True when the value is below zero — for optional negative-direction colouring. */
  negative: boolean;
}

/**
 * Fill span for `value` within `range`, always anchored at zero.
 *
 * A positive value fills rightward from the zero point, a negative value
 * leftward from it. With `min: 0` the zero point is the left edge, so this
 * degenerates to the familiar left-filling gauge with no special-casing.
 *
 * Direction alone carries the sign, so the negative colour is optional
 * polish rather than a requirement.
 */
export function barFill(value: number, range: CounterRange): BarFill {
  const span = range.max - range.min;
  const v = clamp(Number.isFinite(value) ? value : 0, range.min, range.max);
  const valueRatio = clamp((v - range.min) / span, 0, 1);
  const zeroRatio = zeroOffsetRatio(range);
  return {
    start: Math.min(zeroRatio, valueRatio),
    end: Math.max(zeroRatio, valueRatio),
    negative: v < 0,
  };
}

/**
 * The band label covering `value`: the last band whose `from` is ≤ value.
 *
 * Bands need not be authored in order. A value below every threshold falls
 * back to the lowest band rather than returning nothing — a readout that
 * blanks out at the bottom of its own range would be a rendering bug, not
 * an authoring signal. Returns undefined only when there are no bands.
 */
export function resolveBand(
  value: number,
  bands: readonly CounterBand[] | null | undefined,
): string | undefined {
  if (!bands || bands.length === 0) return undefined;
  const sorted = [...bands]
    .filter((b) => b && typeof b.from === 'number')
    .sort((a, b) => a.from - b.from);
  if (sorted.length === 0) return undefined;
  let match = sorted[0];
  for (const band of sorted) {
    if (value >= band.from) match = band;
    else break;
  }
  return match.label;
}

/**
 * Read the raw affect strength behind a source, in the store's own units
 * ([-1, 1] for sentiment and mood, [0, 1] for emotion levels).
 *
 * `ownerRef` is the character the counter belongs to; a sentiment source may
 * override the *holder* via `fromCharacterRef` while still living on the
 * owner's meter.
 */
export function readSourceStrength(
  source: CounterSource,
  ownerRef: string,
  reader: AffectReader,
): number {
  switch (source.kind) {
    case 'sentiment':
      return reader.getSentimentTo(
        source.fromCharacterRef || ownerRef,
        source.toEntityRef,
        source.emotion,
      );
    case 'emotion':
      return reader.getCharacterEmotion(ownerRef, source.emotion);
    case 'mood': {
      const mood = reader.getCharacterMood(ownerRef);
      if (!mood) return 0;
      const axis = source.axis === 'arousal' ? mood.arousal : mood.valence;
      return typeof axis === 'number' ? axis : 0;
    }
    default:
      return 0;
  }
}

/**
 * The value to display for a counter — authored counters return their own
 * value untouched, derived ones project live affect state onto their range.
 *
 * This is the single derive-on-read entry point; nothing else should
 * reimplement the branch.
 */
export function resolveCounterValue(
  counter: BindableCounter,
  ownerRef: string,
  reader: AffectReader,
): number {
  if (!counter.source) return typeof counter.value === 'number' ? counter.value : 0;
  const strength = readSourceStrength(counter.source, ownerRef, reader);
  return projectStrength(strength, counterRange(counter));
}

/** Everything a meter needs to draw one counter, resolved in one call. */
export interface ResolvedCounter {
  value: number;
  range: CounterRange;
  fill: BarFill;
  /** Band label covering the value, when the counter defines bands. */
  band?: string;
  derived: boolean;
}

/**
 * Resolve a counter to its full display state. Renderers and the editor's
 * live readout share this so the number, the bar, and the phrase can never
 * disagree about the same counter.
 */
export function resolveCounter(
  counter: BindableCounter,
  ownerRef: string,
  reader: AffectReader,
): ResolvedCounter {
  const range = counterRange(counter);
  const value = resolveCounterValue(counter, ownerRef, reader);
  return {
    value,
    range,
    fill: barFill(value, range),
    band: resolveBand(value, counter.bands),
    derived: isDerivedCounter(counter),
  };
}
