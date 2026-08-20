/**
 * Typewriter granularity — the reveal clock is per-character everywhere;
 * granularity only decides where the VISIBLE prefix may end. So the contract
 * is: letter = identity, word/line = snap down to the last completed unit,
 * full length passes through untouched.
 */
import { describe, it, expect } from 'vitest';
import { revealBoundary } from '../src/utils/typewriterGranularity';

const TEXT = 'Two words here.\nNew line.';

describe('revealBoundary', () => {
  it('letter mode is the identity', () => {
    for (const i of [0, 3, 7, TEXT.length]) {
      expect(revealBoundary(TEXT, i, 'letter')).toBe(i);
    }
  });

  it('word mode snaps down to the last completed word (space included)', () => {
    // index inside "words" → only "Two " is complete
    expect(revealBoundary(TEXT, 6, 'word')).toBe(4);
    // index exactly after the space following "words" → "Two words " complete
    expect(revealBoundary(TEXT, 10, 'word')).toBe(10);
    // mid first word → nothing complete yet
    expect(revealBoundary(TEXT, 2, 'word')).toBe(0);
  });

  it('line mode snaps to the last completed line', () => {
    expect(revealBoundary(TEXT, 10, 'line')).toBe(0);
    // index past the newline (position 15) → first line complete
    expect(revealBoundary(TEXT, 18, 'line')).toBe(16);
  });

  it('full length reveals everything regardless of granularity', () => {
    expect(revealBoundary(TEXT, TEXT.length, 'word')).toBe(TEXT.length);
    expect(revealBoundary(TEXT, TEXT.length + 5, 'line')).toBe(TEXT.length);
  });

  it('defaults to letter when granularity is omitted', () => {
    expect(revealBoundary(TEXT, 6)).toBe(6);
  });
});
