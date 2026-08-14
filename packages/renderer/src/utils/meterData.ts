/**
 * One place that turns an authored counter definition into the data a meter
 * renders — so the Preview Window, the exported web player and the visual
 * editor cannot disagree about what a counter currently reads.
 *
 * The interesting case is a *derived* counter (one with a `source`): its
 * value is not stored anywhere, it is projected from affect state on every
 * read. Without this helper each call site would have to remember that
 * branch, and the one that forgot would silently render a permanent zero.
 *
 * See docs/Counter-Binding-Design.md.
 */
import {
  isDerivedCounter,
  counterRange,
  resolveCounterValue,
  type AffectReader,
  type BindableCounter,
  type CounterBand,
} from '@asaps/core';
import type { MeterCounterData, MeterFrameConfig } from '../components/CharacterMeterFrame';

/** The authored counter shape this reads — a superset of BindableCounter. */
export interface MeterCounterDef extends BindableCounter {
  displayName?: string;
  color?: string;
  visible?: boolean;
  showLevelMeter?: boolean;
  showNumericValue?: boolean;
  numericFormat?: 'value' | 'fraction' | 'percentage' | 'band';
  levelMeterOrientation?: 'horizontal' | 'vertical';
  bands?: CounterBand[];
}

/**
 * Resolve one counter definition for display.
 *
 * @param counter   authored definition from the character record
 * @param ownerRef  the character the counter belongs to
 * @param reader    live affect state (StoryContext satisfies this)
 * @param scoped    the character's runtime counter values, for authored counters
 * @param globalFallback  optional story-global counter lookup, preserving the
 *                        legacy behaviour where a character meter could read an
 *                        un-scoped counter of the same name
 */
export function toMeterCounterData(
  counter: MeterCounterDef,
  ownerRef: string,
  reader: AffectReader | null | undefined,
  scoped?: Record<string, number>,
  globalFallback?: (name: string) => number | undefined,
): MeterCounterData {
  const range = counterRange(counter);
  const derived = isDerivedCounter(counter);

  // A derived counter has no stored value — never fall back to `counter.value`
  // for one, or it would show the authored placeholder instead of live state.
  // With no reader (the visual editor, where no story is running) it reads
  // zero, which is honest: the value only exists while the story plays.
  const value = derived
    ? (reader ? resolveCounterValue(counter, ownerRef, reader) : 0)
    : scoped?.[counter.name]
      ?? globalFallback?.(counter.name)
      ?? counter.value
      ?? 0;

  return {
    name: counter.name,
    displayName: counter.displayName ?? counter.name,
    value,
    min: range.min,
    max: range.max,
    color: counter.color || '#3B82F6',
    // Choosing the word format and writing the ladder IS the intent to show
    // the words — a format for a value you never display is meaningless. An
    // explicit `false` still wins (?? only fills an absent value), so an author
    // who wants a bare bar keeps one.
    showNumericValue: counter.showNumericValue
      ?? (counter.numericFormat === 'band' && (counter.bands?.length ?? 0) > 0),
    numericFormat: counter.numericFormat || 'value',
    orientation: counter.levelMeterOrientation || 'horizontal',
    bands: counter.bands,
    // Only meaningful for counters the frame renders; a false value means
    // "show the words, not the bar".
    showLevelMeter: counter.showLevelMeter,
  };
}

/**
 * The frame a character's meters render in, falling back when none is authored.
 *
 * A counter marked `visible` with `showLevelMeter` is an explicit instruction
 * to show it — but it renders through a frame, and if the character has none
 * the meter appears nowhere at all. Nothing errors; the meter is simply
 * absent, which is invisible in the data and only shows up at runtime. An
 * AI-generated story hit exactly this: it bound a trust counter, set it
 * visible, wrote an explanation beat telling the player to watch the meter,
 * and shipped no frame.
 *
 * Supplying a default for an ABSENT value is not overriding authored intent —
 * `visible: true, showLevelMeter: true` IS the intent to show it, and an
 * author who wants a counter tracked but hidden sets `visible: false`. An
 * authored frame always wins; this only fills a gap.
 *
 * Returns null when nothing should render, so callers keep their existing
 * "no frame → skip" branch.
 */
export function resolveMeterFrame(
  character: { meterFrame?: MeterFrameConfig | null; counters?: MeterCounterDef[] } | null | undefined,
): MeterFrameConfig | null {
  if (!character) return null;
  if (character.meterFrame) return character.meterFrame;

  const wantsAMeter = (character.counters || []).some(
    (c) => c && c.visible !== false && c.showLevelMeter,
  );
  if (!wantsAMeter) return null;

  return { ...FALLBACK_METER_FRAME };
}

/**
 * Screen-docked rather than character-anchored: a character-anchored frame
 * needs the character to be placed on stage, which is not true in slot-based
 * responsive beats — the fallback has to render wherever it is used.
 */
export const FALLBACK_METER_FRAME: MeterFrameConfig = {
  dockMode: 'screen',
  anchor: 'top',
  screenPosition: 'screen-top-left',
  offset: { x: 0, y: 0 },
  style: {
    backgroundColor: '#1b1f2b',
    borderColor: '#3d4356',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    opacity: 90,
  },
  meterHeight: 12,
  meterSpacing: 6,
  showLabels: true,
  meterWidth: 130,
};
