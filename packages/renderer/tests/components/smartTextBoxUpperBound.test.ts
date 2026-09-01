import { describe, it, expect } from 'vitest';
import { calculateSmartTextBoxDimensions } from '../../src/components/PositionedBeatView';

/**
 * Field case (Environmental Choices 4, onlineContent ai-query): Title at
 * y=40 h≈70, Text box at y=160 h=250, button at y=668 on a 1024×768 stage.
 * Long runtime content grew the text box UPWARD through the title because
 * maxTopGrowth only respected the stage-top margin — the scroll verdict
 * never fired. upperBoundY is the fix: upward growth stops at the box above.
 */
const stage = { w: 1024, h: 768 };
const textLoc = { x: 112, y: 160, width: 800, height: 250 };
const longContent = 'word '.repeat(900); // far more than the box can hold

describe('smart text box upward-growth bound', () => {
  it('without a bound, long content grows upward past the title line (the old bug)', () => {
    const d = calculateSmartTextBoxDimensions(longContent, 16, textLoc, 20, 43, stage.w, stage.h);
    // Upward growth reaches toward the stage top: the rendered top edge
    // (y - yOffset) lands above the title's bottom (110).
    expect(textLoc.y - d.yOffset).toBeLessThan(110);
  });

  it('with upperBoundY at the title bottom, the box stays below it and scrolls instead', () => {
    const titleBottom = 110 + 12; // title bottom + stack gap
    const d = calculateSmartTextBoxDimensions(longContent, 16, textLoc, 20, 43, stage.w, stage.h, 0, titleBottom);
    expect(textLoc.y - d.yOffset).toBeGreaterThanOrEqual(titleBottom);
    expect(d.needsScroll).toBe(true);
    // And it still respects the bottom (button area): top + height ≤ button top-ish
    expect((textLoc.y - d.yOffset) + d.height).toBeLessThanOrEqual(768 - 43);
  });

  it('short content is unaffected by the bound', () => {
    const d1 = calculateSmartTextBoxDimensions('hello there', 16, textLoc, 20, 43, stage.w, stage.h);
    const d2 = calculateSmartTextBoxDimensions('hello there', 16, textLoc, 20, 43, stage.w, stage.h, 0, 122);
    expect(d2).toEqual(d1);
  });
});
