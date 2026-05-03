import { describe, it, expect } from 'vitest';
import { findUniqueProjectName } from '../uniqueProjectName';

describe('findUniqueProjectName', () => {
  it('returns the desired name unchanged when no collision', () => {
    expect(findUniqueProjectName('Holding the Line', [])).toBe('Holding the Line');
    expect(findUniqueProjectName('Holding the Line', ['Other'])).toBe('Holding the Line');
  });

  it('appends 1 on first collision', () => {
    expect(findUniqueProjectName('Holding the Line', ['Holding the Line']))
      .toBe('Holding the Line 1');
  });

  it('finds the lowest free integer suffix', () => {
    expect(findUniqueProjectName('Story', ['Story', 'Story 1', 'Story 2']))
      .toBe('Story 3');
  });

  it('skips holes in the suffix sequence', () => {
    // "Story 2" is missing — pick that.
    expect(findUniqueProjectName('Story', ['Story', 'Story 1', 'Story 3']))
      .toBe('Story 2');
  });

  it('is case-insensitive', () => {
    expect(findUniqueProjectName('Holding', ['HOLDING'])).toBe('Holding 1');
    expect(findUniqueProjectName('holding', ['Holding', 'holding 1']))
      .toBe('holding 2');
  });

  it('trims whitespace before comparing', () => {
    expect(findUniqueProjectName('  Story  ', ['Story'])).toBe('Story 1');
    expect(findUniqueProjectName('Story', ['  Story  '])).toBe('Story 1');
  });

  it('does NOT recognize an existing trailing counter on the desired name', () => {
    // "Holding the Line 0" is treated as a base name; counter starts at 1
    // off the full string.
    expect(findUniqueProjectName('Holding the Line 0', ['Holding the Line 0']))
      .toBe('Holding the Line 0 1');
  });

  it('falls back to "Untitled Project" for empty input', () => {
    expect(findUniqueProjectName('', [])).toBe('Untitled Project');
    expect(findUniqueProjectName('   ', [])).toBe('Untitled Project');
  });

  it('handles 100+ collisions without infinite-looping', () => {
    const existing = ['Story', ...Array.from({ length: 99 }, (_, i) => `Story ${i + 1}`)];
    expect(findUniqueProjectName('Story', existing)).toBe('Story 100');
  });

  it('mirrors the reported library state — Holding the Line 0..3 all taken', () => {
    // The exact case from the user's screenshot: AI generated "Holding the
    // Line" four times, manually renamed each to "Holding the Line 0..3".
    // The unsuffixed base name is therefore free.
    const existing = [
      'Holding the Line 0', 'Holding the Line 1', 'Holding the Line 2', 'Holding the Line 3',
    ];
    expect(findUniqueProjectName('Holding the Line', existing))
      .toBe('Holding the Line');
    // If the unsuffixed copy is ALSO present, the helper skips over the
    // taken numeric siblings ("Line 1", "Line 2", "Line 3") and lands on
    // "Holding the Line 4" — the lowest free integer suffix.
    expect(findUniqueProjectName('Holding the Line', ['Holding the Line', ...existing]))
      .toBe('Holding the Line 4');
  });
});
