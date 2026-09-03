import { describe, it, expect } from 'vitest';
import { pillSafeRadius } from '../../src/utils/pillRadius';

// The 999 pill sentinel must never reach border-radius raw: CSS shrinks
// overlapping radii proportionally on both axes, so a tall multi-line choice
// bubble degrades into an ellipse (bake-off Story D, 2026-09-03).
describe('pillSafeRadius', () => {
  it('caps the pill sentinel at a line-height-based curve', () => {
    expect(pillSafeRadius(999)).toBe('calc(0.5lh + 24px)');
  });

  it('treats anything above the slider cutoff (50) as pill intent', () => {
    expect(pillSafeRadius(51)).toBe('calc(0.5lh + 24px)');
  });

  it('passes explicit slider values through untouched', () => {
    expect(pillSafeRadius(0)).toBe('0px');
    expect(pillSafeRadius(14)).toBe('14px');
    expect(pillSafeRadius(50)).toBe('50px');
  });

  it('falls back when the theme has no button radius', () => {
    expect(pillSafeRadius(undefined)).toBe('8px');
    expect(pillSafeRadius(null, 20)).toBe('20px');
  });
});
