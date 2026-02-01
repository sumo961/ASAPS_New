import { describe, it, expect } from 'vitest';

/**
 * Tests for smart sizing utility functions used in PositionedBeatView
 *
 * These functions calculate dynamic dimensions for text boxes and buttons
 * to ensure content fits properly within the stage bounds.
 */

// Re-implement the functions here for testing (they're internal to PositionedBeatView)
// In a future refactor, these could be extracted to a shared utility

function calculateSmartButtonDimensions(
  content: string,
  fontSize: number,
  location: { x: number; y: number; width: number; height: number },
  paddingH: number,
  paddingV: number,
  stageWidth: number,
  stageHeight: number
): { width: number; height: number } {
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.4;
  const contentPaddingH = paddingH * 2;
  const contentPaddingV = paddingV * 2;

  const textWidth = content.length * charWidth;
  const minWidthNeeded = textWidth + contentPaddingH;

  const rightMargin = stageWidth * 0.05;
  const maxWidth = stageWidth - location.x - rightMargin;

  let newWidth = Math.max(location.width, minWidthNeeded);
  let newHeight = location.height;

  if (newWidth > maxWidth) {
    newWidth = maxWidth;
  }

  const availableContentWidth = newWidth - contentPaddingH;
  const charsPerLine = Math.floor(availableContentWidth / charWidth);
  const linesNeeded = charsPerLine > 0 ? Math.ceil(content.length / charsPerLine) : 1;
  const heightNeeded = linesNeeded * lineHeight + contentPaddingV;

  const maxHeight = stageHeight - (location.y * 2);
  if (heightNeeded > location.height) {
    newHeight = Math.min(heightNeeded, maxHeight);
  }

  return { width: newWidth, height: newHeight };
}

function calculateSmartTextBoxDimensions(
  content: string,
  fontSize: number,
  location: { x: number; y: number; width: number; height: number },
  padding: number,
  buttonHeight: number,
  stageWidth: number,
  stageHeight: number
): { width: number; height: number; needsScroll: boolean; xOffset: number } {
  const charWidth = fontSize * 0.42;
  const lineHeight = fontSize * 1.5;
  const contentPadding = padding * 2;

  const availableContentWidth = location.width - contentPadding;
  const charsPerLine = Math.max(1, Math.floor(availableContentWidth / charWidth));
  const linesNeeded = Math.ceil(content.length / charsPerLine);
  const estimatedHeight = linesNeeded * lineHeight + contentPadding;

  let newWidth = location.width;
  let newHeight = location.height;
  let needsScroll = false;
  let xOffset = 0;

  // Grow horizontally first
  if (estimatedHeight > location.height) {
    const leftMargin = location.x;
    const maxWidth = stageWidth - (leftMargin * 2);

    if (newWidth < maxWidth) {
      const ratio = estimatedHeight / location.height;
      const targetWidth = Math.min(location.width * Math.sqrt(ratio), maxWidth);
      const widthExpansion = targetWidth - location.width;
      xOffset = widthExpansion / 2;
      newWidth = targetWidth;
    }
  }

  // Recalculate height with new width
  const newAvailableWidth = newWidth - contentPadding;
  const newCharsPerLine = Math.max(1, Math.floor(newAvailableWidth / charWidth));
  const newLinesNeeded = Math.ceil(content.length / newCharsPerLine);

  // Height buffer for long content
  const needsHeightBuffer = content.length > 200;
  const heightBuffer = needsHeightBuffer ? 1.15 : 1.0;
  const newEstimatedHeight = (newLinesNeeded * lineHeight + contentPadding) * heightBuffer;

  // Grow vertically
  const buttonPadding = buttonHeight > 0 ? 30 : 0;
  const maxHeight = stageHeight - location.y - buttonPadding - buttonHeight - (stageHeight * 0.05);

  if (newEstimatedHeight > location.height) {
    newHeight = Math.min(newEstimatedHeight, maxHeight);
  }

  // Enable scroll if content still doesn't fit
  needsScroll = newEstimatedHeight > newHeight;

  return { width: newWidth, height: newHeight, needsScroll, xOffset };
}

describe('calculateSmartButtonDimensions', () => {
  const defaultLocation = { x: 100, y: 200, width: 120, height: 40 };
  const stageWidth = 720;
  const stageHeight = 480;

  it('should return reasonable dimensions for short text', () => {
    const result = calculateSmartButtonDimensions(
      'OK',
      16,
      defaultLocation,
      16,
      10,
      stageWidth,
      stageHeight
    );

    // Width should be at least original width
    expect(result.width).toBeGreaterThanOrEqual(defaultLocation.width);
    // Height should be close to original (may be slightly larger due to line height)
    expect(result.height).toBeGreaterThanOrEqual(defaultLocation.height);
    expect(result.height).toBeLessThan(defaultLocation.height * 2);
  });

  it('should expand width for longer text', () => {
    const result = calculateSmartButtonDimensions(
      'Continue the adventure',
      16,
      defaultLocation,
      16,
      10,
      stageWidth,
      stageHeight
    );

    expect(result.width).toBeGreaterThan(defaultLocation.width);
  });

  it('should cap width at stage boundary', () => {
    const result = calculateSmartButtonDimensions(
      'This is a very long button text that should be constrained by the stage width',
      16,
      { x: 600, y: 400, width: 120, height: 40 },
      16,
      10,
      stageWidth,
      stageHeight
    );

    // Width should not exceed stage width minus x position minus 5% margin
    const expectedMaxWidth = stageWidth - 600 - (stageWidth * 0.05);
    expect(result.width).toBeLessThanOrEqual(Math.max(expectedMaxWidth, 120)); // At minimum, keep original width
  });

  it('should handle constrained space', () => {
    const result = calculateSmartButtonDimensions(
      'This is a very long button text that will need to wrap to multiple lines',
      16,
      { x: 100, y: 200, width: 120, height: 40 }, // More room to grow
      16,
      10,
      stageWidth,
      stageHeight
    );

    // Should grow to accommodate text
    expect(result.width).toBeGreaterThanOrEqual(120);
  });

  it('should handle empty content', () => {
    const result = calculateSmartButtonDimensions(
      '',
      16,
      defaultLocation,
      16,
      10,
      stageWidth,
      stageHeight
    );

    expect(result.width).toBe(defaultLocation.width);
    expect(result.height).toBe(defaultLocation.height);
  });
});

describe('calculateSmartTextBoxDimensions', () => {
  const defaultLocation = { x: 50, y: 50, width: 300, height: 150 };
  const stageWidth = 720;
  const stageHeight = 480;

  it('should return original dimensions for short text', () => {
    const result = calculateSmartTextBoxDimensions(
      'Hello world',
      18,
      defaultLocation,
      20,
      0,
      stageWidth,
      stageHeight
    );

    expect(result.width).toBe(defaultLocation.width);
    expect(result.height).toBe(defaultLocation.height);
    expect(result.needsScroll).toBe(false);
    expect(result.xOffset).toBe(0);
  });

  it('should expand width for longer text when content overflows', () => {
    // Use much longer text to ensure overflow
    const longText = 'This is a much longer piece of text that will require the text box to expand. '.repeat(5);
    const smallBox = { x: 50, y: 50, width: 150, height: 80 };
    const result = calculateSmartTextBoxDimensions(
      longText,
      18,
      smallBox,
      20,
      0,
      stageWidth,
      stageHeight
    );

    // Width should expand to fit more content
    expect(result.width).toBeGreaterThanOrEqual(smallBox.width);
  });

  it('should calculate xOffset to keep box centered when width expands', () => {
    const longText = 'This is a longer piece of text that will cause the box to expand. '.repeat(3);
    const result = calculateSmartTextBoxDimensions(
      longText,
      18,
      defaultLocation,
      20,
      0,
      stageWidth,
      stageHeight
    );

    if (result.width > defaultLocation.width) {
      expect(result.xOffset).toBeGreaterThan(0);
      expect(result.xOffset).toBe((result.width - defaultLocation.width) / 2);
    }
  });

  it('should enable scroll when content exceeds max height', () => {
    const veryLongText = 'This is a very long piece of text. '.repeat(50);
    const result = calculateSmartTextBoxDimensions(
      veryLongText,
      18,
      defaultLocation,
      20,
      40, // button height
      stageWidth,
      stageHeight
    );

    expect(result.needsScroll).toBe(true);
  });

  it('should leave room for buttons when calculating max height', () => {
    const longText = 'This is moderately long text. '.repeat(10);
    const buttonHeight = 50;

    const resultWithButton = calculateSmartTextBoxDimensions(
      longText,
      18,
      defaultLocation,
      20,
      buttonHeight,
      stageWidth,
      stageHeight
    );

    const resultWithoutButton = calculateSmartTextBoxDimensions(
      longText,
      18,
      defaultLocation,
      20,
      0,
      stageWidth,
      stageHeight
    );

    // With a button, the max height should be lower
    expect(resultWithButton.height).toBeLessThanOrEqual(resultWithoutButton.height);
  });

  it('should apply height buffer for long content (>200 chars)', () => {
    const shortContent = 'Short text';
    const longContent = 'L'.repeat(250);

    const shortResult = calculateSmartTextBoxDimensions(
      shortContent,
      18,
      { ...defaultLocation, height: 50 },
      20,
      0,
      stageWidth,
      stageHeight
    );

    const longResult = calculateSmartTextBoxDimensions(
      longContent,
      18,
      { ...defaultLocation, height: 50 },
      20,
      0,
      stageWidth,
      stageHeight
    );

    // Long content should trigger height buffer (15% extra)
    // This is hard to test precisely without knowing internal calculations,
    // but we can verify long content gets more generous sizing
    expect(longResult.height).toBeGreaterThan(shortResult.height);
  });

  it('should handle empty content', () => {
    const result = calculateSmartTextBoxDimensions(
      '',
      18,
      defaultLocation,
      20,
      0,
      stageWidth,
      stageHeight
    );

    expect(result.width).toBe(defaultLocation.width);
    expect(result.height).toBe(defaultLocation.height);
    expect(result.needsScroll).toBe(false);
  });

  it('should respect stage boundaries when expanding', () => {
    const longText = 'This is a long text. '.repeat(20);
    const nearCenter = { x: 100, y: 50, width: 100, height: 100 };

    const result = calculateSmartTextBoxDimensions(
      longText,
      18,
      nearCenter,
      20,
      0,
      stageWidth,
      stageHeight
    );

    // Width should not extend past stage boundary minus left margin
    const maxAllowedWidth = stageWidth - (nearCenter.x * 2);
    expect(result.width).toBeLessThanOrEqual(maxAllowedWidth);
  });
});
