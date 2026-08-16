/**
 * The banner is scoped to the story it was raised about, not cleared by
 * lifecycle events — because the import itself creates a project, and a
 * clear-on-switch would erase the banner in the same breath that raised it.
 */
import { describe, it, expect } from 'vitest';
import { importIssuesVisible } from '../importIssuesVisible';

const imported = ['r5_title', 'r5_text', 'r5_end'];

describe('importIssuesVisible', () => {
  it('shows while the imported story is the workspace', () => {
    expect(importIssuesVisible(imported, [{ id: 'r5_title' }, { id: 'r5_text' }])).toBe(true);
  });

  it('hides when the author switches to an unrelated project', () => {
    // The lingering-banner bug: "3 choices lead nowhere" floating over a
    // healthy project that was opened after the broken import.
    expect(importIssuesVisible(imported, [{ id: 'beat_0' }, { id: 'beat_1' }])).toBe(false);
  });

  it('still shows if even one referenced beat survives an edit', () => {
    expect(importIssuesVisible(imported, [{ id: 'r5_end' }])).toBe(true);
  });

  it('shows nothing with no record of what was imported', () => {
    expect(importIssuesVisible(undefined, [{ id: 'x' }])).toBe(false);
    expect(importIssuesVisible([], [{ id: 'x' }])).toBe(false);
  });
});
