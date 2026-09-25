/**
 * Text-box height estimate must count paragraphs. The First-step text
 * (four paragraphs, blank lines between) was estimated 171px tall and
 * rendered 244px, so the push-below-text rule let buttons overlap it.
 */
import { describe, it, expect } from 'vitest';
import { countWrappedLines, calculateSmartTextBoxDimensions } from '../src/components/PositionedBeatView';

const firstStep = "The case is yours now.\n\nEverything you do before you make contact costs time you will not get back — and while you prepare, the family's first impression of you is being formed by whoever spoke to them first.\n\n**Time remaining: 240 minutes.**\n\nWhat do you do?";

describe('countWrappedLines', () => {
  it('counts every line break and blank line; markdown markers take no space', () => {
    expect(countWrappedLines('a\n\nb', 40)).toBe(3);
    expect(countWrappedLines('x'.repeat(81), 40)).toBe(3);
    expect(countWrappedLines('**bold**', 4)).toBe(1);
    expect(countWrappedLines('literal\\nbreak', 40)).toBe(2);
  });

  it('sizes the four-paragraph First-step box at least as tall as it renders (244px)', () => {
    const dims = calculateSmartTextBoxDimensions(firstStep, 16, { x: 102, y: 50, width: 819, height: 90 }, 20, 42, 1024, 768);
    expect(dims.height).toBeGreaterThanOrEqual(244);
  });
});
