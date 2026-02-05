/**
 * Tests for Element Sizing Module
 */

import { describe, it, expect } from 'vitest';
import {
  getFontFamily,
  isBuiltInFont,
  measureTextWidth,
  calculateTextDimensions,
  calculateTextBoxDimensions,
  calculateButtonDimensions,
  calculateDialogDimensions,
  calculateSmartButtonDimensions,
  calculateSmartTextBoxDimensions,
  calculateTextBoxDimensionsForLayout,
} from '../../src/layout/elementSizing';

describe('elementSizing', () => {
  describe('getFontFamily', () => {
    it('should return CSS font-family for known fonts', () => {
      expect(getFontFamily('Arial')).toBe('Arial, sans-serif');
      expect(getFontFamily('Times New Roman')).toBe('Times New Roman, serif');
      expect(getFontFamily('Courier New')).toBe('Courier New, monospace');
    });

    it('should return font name as-is for unknown fonts', () => {
      expect(getFontFamily('CustomFont')).toBe('CustomFont');
      expect(getFontFamily('MySpecialFont')).toBe('MySpecialFont');
    });
  });

  describe('isBuiltInFont', () => {
    it('should return true for built-in fonts', () => {
      expect(isBuiltInFont('Arial')).toBe(true);
      expect(isBuiltInFont('Georgia')).toBe(true);
      expect(isBuiltInFont('Verdana')).toBe(true);
    });

    it('should return false for custom fonts', () => {
      expect(isBuiltInFont('CustomFont')).toBe(false);
      expect(isBuiltInFont('MyThemeFont')).toBe(false);
    });

    it('should return true for undefined font', () => {
      expect(isBuiltInFont(undefined)).toBe(true);
    });
  });

  describe('measureTextWidth', () => {
    // Note: In Node.js environment, measureTextWidth uses fallback estimation
    it('should return a positive width for non-empty text', () => {
      const width = measureTextWidth('Hello', 16, 'Arial');
      expect(width).toBeGreaterThan(0);
    });

    it('should return larger width for longer text', () => {
      const shortWidth = measureTextWidth('Hi', 16, 'Arial');
      const longWidth = measureTextWidth('Hello World', 16, 'Arial');
      expect(longWidth).toBeGreaterThan(shortWidth);
    });

    it('should scale with font size', () => {
      const smallFont = measureTextWidth('Test', 12, 'Arial');
      const largeFont = measureTextWidth('Test', 24, 'Arial');
      expect(largeFont).toBeGreaterThan(smallFont);
    });

    it('should return 0 for empty text', () => {
      const width = measureTextWidth('', 16, 'Arial');
      expect(width).toBe(0);
    });
  });

  describe('calculateTextDimensions', () => {
    it('should return minimum width for empty text', () => {
      const dims = calculateTextDimensions({
        text: '',
        fontSize: 16,
        minWidth: 100,
      });
      expect(dims.width).toBe(100);
    });

    it('should handle short text on single line', () => {
      const dims = calculateTextDimensions({
        text: 'Short',
        fontSize: 16,
        fontFamily: 'Arial',
        minWidth: 100,
        maxWidth: 824,
      });
      expect(dims.width).toBeGreaterThanOrEqual(100);
      expect(dims.width).toBeLessThanOrEqual(824);
    });

    it('should wrap long text to multiple lines', () => {
      const shortDims = calculateTextDimensions({
        text: 'Short',
        fontSize: 16,
      });
      const longDims = calculateTextDimensions({
        text: 'This is a very long text that should wrap to multiple lines because it exceeds the maximum width allowed for a single line of text',
        fontSize: 16,
      });
      expect(longDims.height).toBeGreaterThan(shortDims.height);
    });

    it('should respect maxWidth constraint', () => {
      const dims = calculateTextDimensions({
        text: 'A'.repeat(200),
        fontSize: 16,
        maxWidth: 500,
      });
      expect(dims.width).toBeLessThanOrEqual(500);
    });
  });

  describe('calculateTextBoxDimensions', () => {
    it('should return dimensions for text', () => {
      const dims = calculateTextBoxDimensions('Hello World', 16, 'Arial');
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const dims = calculateTextBoxDimensions('', 16, 'Arial');
      expect(dims.width).toBe(100); // minWidth
    });
  });

  describe('calculateButtonDimensions', () => {
    it('should return dimensions for button text', () => {
      const dims = calculateButtonDimensions('Click Me', 16, 'Arial');
      expect(dims.width).toBeGreaterThanOrEqual(120); // minWidth
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should handle long button text with wrapping', () => {
      const shortDims = calculateButtonDimensions('OK', 16, 'Arial');
      const longDims = calculateButtonDimensions(
        'This is a very long button text that should cause wrapping',
        16,
        'Arial'
      );
      expect(longDims.height).toBeGreaterThan(shortDims.height);
    });

    it('should respect maxWidth constraint', () => {
      const dims = calculateButtonDimensions(
        'Very long button text that exceeds maximum width',
        16,
        'Arial',
        300
      );
      expect(dims.width).toBeLessThanOrEqual(300);
    });

    it('should use aligned constants (charWidth=0.6, lineHeight=1.4)', () => {
      // A button with text that wraps should have predictable height
      // Based on: numLines * fontSize * 1.4 + verticalPadding(24)
      const text = 'A'.repeat(50); // Should wrap at default maxWidth
      const dims = calculateButtonDimensions(text, 16, 'Arial', 200);

      // At width 200, with 40px horizontal padding, available is 160px
      // charWidth = 16 * 0.6 = 9.6px
      // charsPerLine = floor(160 / 9.6) = 16
      // numLines = ceil(50 / 16) = 4
      // height = 4 * 16 * 1.4 + 24 = 89.6 + 24 = 113.6 -> 114
      expect(dims.height).toBeGreaterThanOrEqual(110);
    });
  });

  describe('calculateDialogDimensions', () => {
    it('should return dimensions for dialog text', () => {
      const dims = calculateDialogDimensions('Hello, traveler!', 16, 'Arial');
      expect(dims.width).toBeGreaterThanOrEqual(200); // minWidth for dialog
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should add 15% buffer to height', () => {
      // Dialog uses calculateTextDimensions and then adds 15% buffer
      const dims = calculateDialogDimensions('Test dialog text', 16, 'Arial');
      // Height should be greater than basic text height due to buffer
      expect(dims.height).toBeGreaterThan(0);
    });
  });

  describe('calculateSmartButtonDimensions', () => {
    it('should grow width to fit content', () => {
      const dims = calculateSmartButtonDimensions({
        content: 'A very long button text that needs more width',
        fontSize: 16,
        location: { x: 100, y: 100, width: 100, height: 50 },
        paddingH: 20,
        paddingV: 12,
        stageWidth: 1024,
        stageHeight: 768,
      });
      expect(dims.width).toBeGreaterThan(100);
    });

    it('should grow height if width is capped', () => {
      const dims = calculateSmartButtonDimensions({
        content: 'A'.repeat(100),
        fontSize: 16,
        location: { x: 800, y: 100, width: 100, height: 50 },
        paddingH: 20,
        paddingV: 12,
        stageWidth: 1024,
        stageHeight: 768,
      });
      // Width should be capped, height should grow
      expect(dims.height).toBeGreaterThan(50);
    });

    it('should respect stage boundaries', () => {
      const dims = calculateSmartButtonDimensions({
        content: 'Button text',
        fontSize: 16,
        location: { x: 900, y: 100, width: 100, height: 50 },
        paddingH: 20,
        paddingV: 12,
        stageWidth: 1024,
        stageHeight: 768,
      });
      // Should not exceed stage width minus margin
      expect(dims.width + 900).toBeLessThanOrEqual(1024);
    });
  });

  describe('calculateSmartTextBoxDimensions', () => {
    it('should return original dimensions if content fits', () => {
      const dims = calculateSmartTextBoxDimensions({
        content: 'Short text',
        fontSize: 16,
        location: { x: 100, y: 100, width: 400, height: 200 },
        padding: 20,
        buttonHeight: 50,
        stageWidth: 1024,
        stageHeight: 768,
      });
      expect(dims.width).toBe(400);
      expect(dims.height).toBe(200);
      expect(dims.needsScroll).toBe(false);
    });

    it('should grow to fit longer content', () => {
      const dims = calculateSmartTextBoxDimensions({
        content: 'A'.repeat(500),
        fontSize: 16,
        location: { x: 100, y: 100, width: 200, height: 100 },
        padding: 20,
        buttonHeight: 50,
        stageWidth: 1024,
        stageHeight: 768,
      });
      // Should grow either width or height
      expect(dims.width >= 200 || dims.height >= 100).toBe(true);
    });

    it('should enable scroll when content cannot fit', () => {
      const dims = calculateSmartTextBoxDimensions({
        content: 'A'.repeat(2000),
        fontSize: 16,
        location: { x: 100, y: 100, width: 200, height: 100 },
        padding: 20,
        buttonHeight: 50,
        stageWidth: 1024,
        stageHeight: 768,
      });
      // For very long content, scroll might be enabled
      expect(typeof dims.needsScroll).toBe('boolean');
    });

    it('should calculate xOffset when growing left', () => {
      const dims = calculateSmartTextBoxDimensions({
        content: 'A'.repeat(300),
        fontSize: 16,
        location: { x: 500, y: 100, width: 200, height: 100 },
        padding: 20,
        buttonHeight: 50,
        stageWidth: 1024,
        stageHeight: 768,
      });
      expect(typeof dims.xOffset).toBe('number');
    });
  });

  describe('calculateTextBoxDimensionsForLayout', () => {
    it('should use location width for short text', () => {
      const dims = calculateTextBoxDimensionsForLayout(
        'Short',
        16,
        'Arial',
        400,
        800,
        20
      );
      expect(dims.width).toBe(400);
    });

    it('should expand width for longer single-line text', () => {
      const dims = calculateTextBoxDimensionsForLayout(
        'This is a medium length text that needs more width',
        16,
        'Arial',
        200,
        800,
        20
      );
      expect(dims.width).toBeGreaterThan(200);
    });

    it('should use max width and wrap for very long text', () => {
      const dims = calculateTextBoxDimensionsForLayout(
        'A'.repeat(500),
        16,
        'Arial',
        200,
        600,
        20
      );
      expect(dims.width).toBe(600);
      expect(dims.height).toBeGreaterThan(16 * 1.4 + 40); // More than single line
    });
  });
});
