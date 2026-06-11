/**
 * Tests for duration.ts — the seconds-is-canonical module that
 * mediates between authored timed-screen durations and the
 * renderer's setTimeout(ms) boundary.
 *
 * History: the schema once said durScreen.duration was milliseconds
 * (default 3000) while the AI generation prompt said seconds. The
 * runtime read AI-generated 5/6/7 as 5/6/7 ms — screens flashed by
 * invisibly. Tests pin the migration heuristic and the seconds→ms
 * boundary so the bug can't return silently.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeDurationToSeconds,
  durationSecondsToMs,
  suggestDurationSeconds,
} from '../../src/utils/duration';

describe('normalizeDurationToSeconds', () => {
  describe('legacy ms values (> 60)', () => {
    it('divides legacy 3000 ms → 3 seconds', () => {
      expect(normalizeDurationToSeconds(3000)).toBe(3);
    });

    it('divides legacy 15000 ms → 15 seconds', () => {
      expect(normalizeDurationToSeconds(15000)).toBe(15);
    });

    it('divides legacy 61 (just above threshold) → 0.061 seconds', () => {
      // The heuristic boundary is > 60 ms must be legacy. 61 is the
      // smallest value that gets the divide treatment.
      expect(normalizeDurationToSeconds(61)).toBeCloseTo(0.061, 5);
    });

    it('divides exact 1000 → 1 second', () => {
      expect(normalizeDurationToSeconds(1000)).toBe(1);
    });
  });

  describe('current seconds values (<= 60)', () => {
    it('passes 0.5 through unchanged (fractional sub-second)', () => {
      expect(normalizeDurationToSeconds(0.5)).toBe(0.5);
    });

    it('passes 5 through unchanged (typical AI emission)', () => {
      expect(normalizeDurationToSeconds(5)).toBe(5);
    });

    it('passes 30 through unchanged', () => {
      expect(normalizeDurationToSeconds(30)).toBe(30);
    });

    it('passes 60 (the threshold) through unchanged', () => {
      // Anything <= 60 is treated as seconds, not legacy ms.
      expect(normalizeDurationToSeconds(60)).toBe(60);
    });
  });

  describe('invalid inputs', () => {
    it('returns 0 for undefined', () => {
      expect(normalizeDurationToSeconds(undefined)).toBe(0);
    });

    it('returns 0 for null', () => {
      expect(normalizeDurationToSeconds(null)).toBe(0);
    });

    it('returns 0 for NaN', () => {
      expect(normalizeDurationToSeconds(NaN)).toBe(0);
    });

    it('returns 0 for Infinity', () => {
      expect(normalizeDurationToSeconds(Infinity)).toBe(0);
    });

    it('returns 0 for negative numbers', () => {
      expect(normalizeDurationToSeconds(-1)).toBe(0);
      expect(normalizeDurationToSeconds(-1000)).toBe(0);
    });

    it('returns 0 for zero', () => {
      expect(normalizeDurationToSeconds(0)).toBe(0);
    });
  });
});

describe('durationSecondsToMs', () => {
  it('converts whole seconds', () => {
    expect(durationSecondsToMs(5)).toBe(5000);
  });

  it('converts fractional seconds (rounded)', () => {
    // setTimeout takes integer ms. 0.5s = 500ms exactly.
    expect(durationSecondsToMs(0.5)).toBe(500);
    expect(durationSecondsToMs(0.001)).toBe(1);
  });

  it('rounds fractional results to nearest ms', () => {
    // 0.0005s → 0.5ms → rounds to 1.
    expect(durationSecondsToMs(0.0005)).toBe(1);
    expect(durationSecondsToMs(0.0004)).toBe(0);
  });

  it('returns 0 for zero', () => {
    expect(durationSecondsToMs(0)).toBe(0);
  });

  it('clamps negative seconds to 0 (setTimeout would barf otherwise)', () => {
    expect(durationSecondsToMs(-1)).toBe(0);
    expect(durationSecondsToMs(-1000)).toBe(0);
  });
});

describe('suggestDurationSeconds', () => {
  describe('reading-speed baseline (200 wpm, 1.5x safety, floor 3)', () => {
    it('floors short text at 3 seconds', () => {
      // 3 words at 200 wpm = 0.9s → ×1.5 = 1.35 → ceil = 2 → clamped to 3.
      expect(suggestDurationSeconds('one two three')).toBe(3);
    });

    it('floors at 3 seconds for empty string', () => {
      expect(suggestDurationSeconds('')).toBe(3);
    });

    it('floors at 3 seconds for whitespace-only input', () => {
      expect(suggestDurationSeconds('   \n\t  ')).toBe(3);
    });

    it('reaches typical authorial expectation for a paragraph', () => {
      // 55 words / 200 wpm = 0.275 min = 16.5s × 1.5 = 24.75 → ceil = 25.
      // Doc comment cites this exact case as the design target.
      const text = Array(55).fill('word').join(' ');
      expect(suggestDurationSeconds(text)).toBe(25);
    });

    it('scales linearly with word count', () => {
      // 100 words / 200 wpm × 60 × 1.5 = 45 seconds exactly.
      const text = Array(100).fill('word').join(' ');
      expect(suggestDurationSeconds(text)).toBe(45);
    });
  });

  describe('opts overrides', () => {
    it('honors a higher floor', () => {
      expect(suggestDurationSeconds('one', { floor: 10 })).toBe(10);
    });

    it('honors a floor of 0 (no minimum)', () => {
      // 1 word at 200 wpm = 0.3s ceil to 1; with no floor, returns 1.
      expect(suggestDurationSeconds('one', { floor: 0 })).toBe(1);
    });

    it('honors a faster wpm', () => {
      // 100 words at 400 wpm × 1.5 = 22.5 → ceil = 23.
      const text = Array(100).fill('word').join(' ');
      expect(suggestDurationSeconds(text, { wpm: 400 })).toBe(23);
    });

    it('honors a lower safety multiplier', () => {
      // 100 words at 200 wpm × 1.0 = 30 seconds.
      const text = Array(100).fill('word').join(' ');
      expect(suggestDurationSeconds(text, { safety: 1.0 })).toBe(30);
    });

    it('falls back to defaults when wpm is 0 or negative', () => {
      // Defensive — author UI might pass 0 from a cleared input.
      const text = Array(55).fill('word').join(' ');
      expect(suggestDurationSeconds(text, { wpm: 0 })).toBe(25);
      expect(suggestDurationSeconds(text, { wpm: -100 })).toBe(25);
    });

    it('falls back to default safety when safety is 0 or negative', () => {
      const text = Array(55).fill('word').join(' ');
      expect(suggestDurationSeconds(text, { safety: 0 })).toBe(25);
    });
  });

  describe('word counting', () => {
    it('splits on any whitespace', () => {
      // 5 words across mixed whitespace types.
      const text = 'one\ttwo\nthree four\rfive';
      // 5 × 0.3 × 1.5 = 2.25 → ceil = 3, floored to 3.
      expect(suggestDurationSeconds(text)).toBe(3);
    });

    it('drops empty strings from extra whitespace', () => {
      // '  hello   world  ' has 2 real words despite the spacing.
      expect(suggestDurationSeconds('  hello   world  ')).toBe(3); // floor
    });

    it('counts a single very long word as one word', () => {
      const giant = 'antidisestablishmentarianism';
      expect(suggestDurationSeconds(giant)).toBe(3); // floor
    });
  });
});
