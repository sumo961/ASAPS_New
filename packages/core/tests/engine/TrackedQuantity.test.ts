/**
 * Tracked quantities — the helper's bridge from "trust matters here" to a
 * real counter. The properties that matter are the ones that keep the two
 * authorial decisions independent: movement must not dictate visibility, and
 * visibility must not dictate movement.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTrackedQuantityCounter,
  describeTrackedQuantity,
} from '../../src/engine/trackedQuantity';

const TRUST = { emotion: 'trust', displayName: 'Trust', bipolar: true };
const FEAR = { emotion: 'fear', displayName: 'Fear', bipolar: false };

describe('buildTrackedQuantityCounter', () => {
  it('binds a responsive quantity to a sentiment, pointed at the player', () => {
    const c = buildTrackedQuantityCounter(TRUST, { movement: 'responsive', visibility: 'meter' })!;
    expect(c.source).toEqual({ kind: 'sentiment', toEntityRef: 'player', emotion: 'trust' });
    expect(c.min).toBe(-100);
    expect(c.showLevelMeter).toBe(true);
  });

  it('leaves an authored quantity unbound — nothing else may move it', () => {
    const c = buildTrackedQuantityCounter(TRUST, { movement: 'authored', visibility: 'meter' })!;
    expect(c.source).toBeUndefined();
    // An authored counter's range is whatever the author moves it between;
    // the familiar 0..100 shape is the honest default.
    expect(c.min).toBe(0);
  });

  it('gives a feeling with no opposite a unipolar range', () => {
    const c = buildTrackedQuantityCounter(FEAR, { movement: 'responsive', visibility: 'meter' })!;
    expect(c.min).toBe(0);
  });

  it('produces words instead of a bar when that is what the author picked', () => {
    const c = buildTrackedQuantityCounter(TRUST, { movement: 'responsive', visibility: 'words' })!;
    expect(c.numericFormat).toBe('band');
    expect(c.showLevelMeter).toBe(false);
    expect(c.bands?.length).toBeGreaterThan(0);
  });

  it('labels zero neutrally on a bipolar ladder', () => {
    // Sentiments start at zero, so the opening word must not be an accusation.
    const c = buildTrackedQuantityCounter(TRUST, { movement: 'responsive', visibility: 'words' })!;
    const sorted = [...c.bands!].sort((a, b) => a.from - b.from);
    let atZero = sorted[0];
    for (const b of sorted) if (0 >= b.from) atZero = b;
    expect(atZero.label).toBe('neutral');
  });

  it('uses an intensity ladder where there is no opposite to name', () => {
    const c = buildTrackedQuantityCounter(FEAR, { movement: 'responsive', visibility: 'words' })!;
    expect(c.bands!.map((b) => b.label)).toEqual(['none', 'slight', 'moderate', 'strong']);
  });

  it('adds no counter for a modelled-but-unseen feeling', () => {
    // The affect system already holds it; a hidden mirror would be a second
    // representation of one thing, with no way to read either.
    expect(buildTrackedQuantityCounter(TRUST, { movement: 'responsive', visibility: 'hidden' })).toBeNull();
  });

  it('still builds an authored counter when hidden — otherwise nothing exists to move', () => {
    const c = buildTrackedQuantityCounter(TRUST, { movement: 'authored', visibility: 'hidden' })!;
    expect(c).not.toBeNull();
    expect(c.visible).toBe(false);
  });

  it('keeps the two decisions independent', () => {
    // Every combination that yields a counter should honour both axes.
    for (const movement of ['authored', 'responsive'] as const) {
      for (const visibility of ['meter', 'words'] as const) {
        const c = buildTrackedQuantityCounter(TRUST, { movement, visibility })!;
        expect(!!c.source).toBe(movement === 'responsive');
        expect(c.numericFormat === 'band').toBe(visibility === 'words');
      }
    }
  });

  it('points the feeling at another character when asked', () => {
    const c = buildTrackedQuantityCounter(TRUST, {
      movement: 'responsive', visibility: 'meter', toEntityRef: 'char_mentor',
    })!;
    expect((c.source as any).toEntityRef).toBe('char_mentor');
  });

  it('slugifies the counter name and falls back for an empty proposal', () => {
    const c = buildTrackedQuantityCounter(
      { emotion: 'Grudging Respect' }, { movement: 'authored', visibility: 'meter' },
    )!;
    expect(c.name).toBe('grudging_respect');
    expect(c.displayName).toBe('Grudging respect');
    expect(buildTrackedQuantityCounter({ emotion: '  ' }, { movement: 'authored', visibility: 'meter' })).toBeNull();
  });
});

describe('describeTrackedQuantity', () => {
  it('says what will happen in the author\'s terms, not the model\'s', () => {
    const s = describeTrackedQuantity(TRUST, { movement: 'responsive', visibility: 'words' });
    expect(s).toContain('shifts from what happens');
    expect(s).toContain('word');
    expect(s).not.toMatch(/sentiment|counter|band/i);
  });

  it('is explicit that a hidden quantity still shapes the story', () => {
    const s = describeTrackedQuantity(TRUST, { movement: 'responsive', visibility: 'hidden' });
    expect(s).toContain('never shown');
  });
});
