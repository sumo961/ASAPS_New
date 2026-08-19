/**
 * The born-this-session registry — the line between projects that adopt a
 * default-location folder (new) and projects the explicit migration owns
 * (pre-existing). The consume is one-shot so a failed adoption can't loop.
 */
import { describe, it, expect } from 'vitest';
import { markProjectNew, consumeProjectNew, isProjectNew, sanitizeFolderName } from '../newProjectRegistry';

describe('newProjectRegistry', () => {
  it('consume is one-shot', () => {
    markProjectNew('p1');
    expect(isProjectNew('p1')).toBe(true);
    expect(consumeProjectNew('p1')).toBe(true);
    expect(consumeProjectNew('p1')).toBe(false);
    expect(isProjectNew('p1')).toBe(false);
  });

  it('unmarked projects never consume', () => {
    expect(consumeProjectNew('never-marked')).toBe(false);
  });
});

describe('sanitizeFolderName', () => {
  it('strips filesystem-hostile characters and collapses whitespace', () => {
    expect(sanitizeFolderName('What: a "story"?  <draft>')).toBe('What a story draft');
    expect(sanitizeFolderName('a/b\\c|d')).toBe('a b c d');
  });

  it('trims leading/trailing dots and spaces (Windows chokes on both)', () => {
    expect(sanitizeFolderName('  .Hidden Story.  ')).toBe('Hidden Story');
  });

  it('sidesteps Windows reserved device names', () => {
    expect(sanitizeFolderName('CON')).toBe('Project CON');
    expect(sanitizeFolderName('lpt1')).toBe('Project lpt1');
  });

  it('never returns empty', () => {
    expect(sanitizeFolderName('???')).toBe('Project');
    expect(sanitizeFolderName('')).toBe('Project');
  });
});
