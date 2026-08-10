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
import type { MeterCounterData } from '../components/CharacterMeterFrame';

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
    showNumericValue: counter.showNumericValue ?? false,
    numericFormat: counter.numericFormat || 'value',
    orientation: counter.levelMeterOrientation || 'horizontal',
    bands: counter.bands,
  };
}
