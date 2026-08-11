/**
 * Opening stance suggestions. The load-bearing property is the negative
 * case: a character with no personality must get no proposal, or the affect
 * opt-out leaks back in through a "helpful" default.
 */
import { describe, it, expect } from 'vitest';
import {
  suggestOpeningStance,
  describeOpeningStance,
  OPENING_STANCE_SCALE,
} from '../../src/engine/openingStance';

describe('suggestOpeningStance', () => {
  it('proposes nothing for a character with no personality', () => {
    // Blank Character creates no traits at all. Fabricating a neutral
    // suggestion here would push affect on an author who opted out.
    expect(suggestOpeningStance(undefined)).toBeNull();
    expect(suggestOpeningStance({})).toBeNull();
    expect(suggestOpeningStance({ extraversion: 0.9 })).toBeNull();
  });

  it('proposes nothing for a non-finite trait value', () => {
    expect(suggestOpeningStance({ agreeableness: NaN })).toBeNull();
  });

  it('opens an agreeable character mildly trusting', () => {
    const s = suggestOpeningStance({ agreeableness: 0.9 })!;
    expect(s.strength).toBeCloseTo(0.28, 2);
    expect(s.description).toBe('openly trusting');
    expect(s.basis).toContain('agreeableness');
  });

  it('opens a disagreeable character guarded, on the same scale', () => {
    const s = suggestOpeningStance({ agreeableness: 0.1 })!;
    expect(s.strength).toBeCloseTo(-0.28, 2);
    expect(s.description).toBe('guarded');
  });

  it('opens an average character at neutral', () => {
    const s = suggestOpeningStance({ agreeableness: 0.5 })!;
    expect(s.strength).toBe(0);
    expect(s.description).toBe('neutral');
  });

  it('never proposes more than the cap — the story earns the rest', () => {
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      const s = suggestOpeningStance({ agreeableness: a })!;
      expect(Math.abs(s.strength)).toBeLessThanOrEqual(OPENING_STANCE_SCALE + 1e-9);
    }
  });

  it('is monotonic in agreeableness', () => {
    const vals = [0, 0.2, 0.4, 0.6, 0.8, 1].map(a => suggestOpeningStance({ agreeableness: a })!.strength);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('ignores extraversion — a shy character can still be trusting', () => {
    const shy = suggestOpeningStance({ agreeableness: 0.9, extraversion: 0.05 })!;
    const loud = suggestOpeningStance({ agreeableness: 0.9, extraversion: 0.95 })!;
    expect(shy.strength).toBe(loud.strength);
  });

  it('clamps out-of-range trait values rather than extrapolating', () => {
    expect(suggestOpeningStance({ agreeableness: 5 })!.strength)
      .toBeCloseTo(OPENING_STANCE_SCALE, 2);
  });
});

describe('describeOpeningStance', () => {
  it('names the whole line, with neutral covering zero', () => {
    expect(describeOpeningStance(0.3)).toBe('openly trusting');
    expect(describeOpeningStance(0.15)).toBe('mildly trusting');
    expect(describeOpeningStance(0)).toBe('neutral');
    expect(describeOpeningStance(-0.15)).toBe('mildly wary');
    expect(describeOpeningStance(-0.3)).toBe('guarded');
  });
});
