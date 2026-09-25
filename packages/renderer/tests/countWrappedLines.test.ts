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

describe('measureWrappedLines (canvas, rendered font)', () => {
  it('word-wraps in the measured font instead of the wide heuristic', async () => {
    const { vi } = await import('vitest');
    // 8px per character (≈ Arial at 18px): the 184-char paragraph fits in 2 lines at 779px,
    // where the 0.58 heuristic (10.4px at 18px) predicted 3.
    const ctx = { font: '', measureText: (t: string) => ({ width: t.length * 8 / 1.04 }) };
    const orig = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? ({ getContext: () => ctx } as any) : orig(tag)) as any);
    vi.resetModules();
    const mod = await import('../src/components/PositionedBeatView');
    expect(mod.measureWrappedLines(firstStep, 18, 'Arial', 779)).toBe(8);
    expect(mod.measureWrappedLines(firstStep, 18, undefined, 779)).toBeUndefined();
    spy.mockRestore();
  });
});
