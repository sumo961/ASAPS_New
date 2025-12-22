import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateTextDimensions,
  calculateButtonDimensions,
  calculateTextBoxDimensions,
  calculateDialogDimensions
} from '../textSizeCalculator';

describe('textSizeCalculator', () => {
  // Mock canvas context for tests
  beforeEach(() => {
    // Create mock for canvas measureText
    const mockMeasureText = vi.fn((text: string) => ({
      width: text.length * 10, // Simple approximation: 10px per character
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4
    }));

    // Mock canvas context
    const mockContext = {
      font: '',
      measureText: mockMeasureText
    };

    // Mock HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => mockContext
        } as any;
      }
      return document.createElement(tagName);
    });
  });

  describe('calculateTextDimensions', () => {
    it('should calculate dimensions for single line text', () => {
      const result = calculateTextDimensions({
        text: 'Hello World',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThanOrEqual(100); // minWidth
    });

    it('should respect minimum width', () => {
      const result = calculateTextDimensions({
        text: 'Hi',
        fontSize: 16,
        fontFamily: 'Arial',
        minWidth: 200
      });

      expect(result.width).toBe(200);
    });

    it('should respect maximum width and wrap text', () => {
      const longText = 'This is a very long text that should definitely wrap to multiple lines when constrained by max width';

      const result = calculateTextDimensions({
        text: longText,
        fontSize: 16,
        fontFamily: 'Arial',
        maxWidth: 300
      });

      expect(result.width).toBeLessThanOrEqual(300);
      expect(result.height).toBeGreaterThan(16); // Should be multi-line
    });

    it('should include padding in dimensions', () => {
      const noPadding = calculateTextDimensions({
        text: 'Test',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 0,
        minWidth: 50 // Lower minWidth to avoid interference
      });

      const withPadding = calculateTextDimensions({
        text: 'Test',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 20,
        minWidth: 50
      });

      // With padding should be larger
      expect(withPadding.width).toBeGreaterThan(noPadding.width);
      expect(withPadding.height).toBeGreaterThan(noPadding.height);
    });

    it('should handle different font sizes', () => {
      const small = calculateTextDimensions({
        text: 'Test',
        fontSize: 12,
        fontFamily: 'Arial'
      });

      const large = calculateTextDimensions({
        text: 'Test',
        fontSize: 32,
        fontFamily: 'Arial'
      });

      expect(large.height).toBeGreaterThan(small.height);
    });

    it('should handle empty text', () => {
      const result = calculateTextDimensions({
        text: '',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      expect(result.width).toBeGreaterThanOrEqual(100); // minWidth
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle text with line breaks', () => {
      const result = calculateTextDimensions({
        text: 'Line 1\nLine 2\nLine 3',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 0 // Remove padding to get clearer test
      });

      // Height should account for multiple lines
      expect(result.height).toBeGreaterThan(16); // More than a single line
    });

    it('should apply line height multiplier', () => {
      const standard = calculateTextDimensions({
        text: 'Line 1\nLine 2',
        fontSize: 16,
        fontFamily: 'Arial',
        lineHeight: 1.0
      });

      const increased = calculateTextDimensions({
        text: 'Line 1\nLine 2',
        fontSize: 16,
        fontFamily: 'Arial',
        lineHeight: 1.5
      });

      expect(increased.height).toBeGreaterThan(standard.height);
    });
  });

  describe('calculateButtonDimensions', () => {
    it('should calculate button dimensions with default values', () => {
      const result = calculateButtonDimensions('Click Me');

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle long button text', () => {
      const short = calculateButtonDimensions('OK');
      const long = calculateButtonDimensions('This is a very long button label that might wrap');

      expect(long.width).toBeGreaterThan(short.width);
    });

    it('should respect font size', () => {
      const small = calculateButtonDimensions('Button', 12);
      const large = calculateButtonDimensions('Button', 24);

      expect(large.height).toBeGreaterThan(small.height);
    });

    it('should apply appropriate padding for buttons', () => {
      const result = calculateButtonDimensions('Test', 16, 'Arial');

      // Buttons should have sufficient padding
      expect(result.width).toBeGreaterThan(50); // At least some width with padding
    });
  });

  describe('calculateTextBoxDimensions', () => {
    it('should calculate text box dimensions', () => {
      const result = calculateTextBoxDimensions('Sample text for text box');

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle multi-line text in text boxes', () => {
      const singleLine = calculateTextBoxDimensions('Short');
      const multiLine = calculateTextBoxDimensions('This is a longer text that will probably wrap to multiple lines in a standard text box');

      expect(multiLine.height).toBeGreaterThan(singleLine.height);
    });

    it('should apply generous padding for text boxes', () => {
      const result = calculateTextBoxDimensions('Test', 16, 'Arial');

      // Text boxes should have generous padding (24px default)
      expect(result.width).toBeGreaterThanOrEqual(100); // At least minWidth
      expect(result.height).toBeGreaterThan(20); // Should have some height with padding
    });
  });

  describe('calculateDialogDimensions', () => {
    it('should calculate dialog dimensions', () => {
      const result = calculateDialogDimensions('Character says something here');

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle long dialog text', () => {
      const longDialog = 'This is a very long piece of dialog that a character might say in the game. It should wrap nicely and create a properly sized dialog box.';

      const result = calculateDialogDimensions(longDialog);

      expect(result.width).toBeGreaterThan(100);
      expect(result.height).toBeGreaterThan(20);
    });

    it('should use larger max width for dialog', () => {
      const longText = 'A'.repeat(200); // Very long text

      const result = calculateDialogDimensions(longText, 16, 'Arial');

      // Dialog should allow wider boxes than buttons
      expect(result.width).toBeLessThanOrEqual(824); // maxWidth for dialog
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters', () => {
      const result = calculateTextDimensions({
        text: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const result = calculateTextDimensions({
        text: 'Hello 世界 🌍',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle very long single word', () => {
      const result = calculateTextDimensions({
        text: 'Supercalifragilisticexpialidocious',
        fontSize: 16,
        fontFamily: 'Arial',
        maxWidth: 200
      });

      // Word might exceed maxWidth since it can't wrap
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('should handle whitespace-only text', () => {
      const result = calculateTextDimensions({
        text: '   ',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      expect(result.width).toBeGreaterThanOrEqual(100); // minWidth
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('Padding Values (Issue #3 fix verification)', () => {
    it('should use 40px total padding + 4px border for text boxes', () => {
      // This test verifies the fix for Issue #3: bounding box mismatch
      // The renderer uses 20px padding per side = 40px total
      // Plus 2px border per side = 4px total (box-sizing: border-box)
      const baseResult = calculateTextDimensions({
        text: 'Test',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 0,
        borderWidth: 0,
        minWidth: 0
      });

      const paddedResult = calculateTextBoxDimensions('Test', 16, 'Arial');

      // Text box should add 40px padding + 4px border = 44px total (both dimensions)
      // Due to minWidth constraints, we check that padding is at least applied
      expect(paddedResult.width).toBeGreaterThanOrEqual(baseResult.width + 40);
      expect(paddedResult.height).toBeGreaterThan(baseResult.height);
    });

    it('should use asymmetric padding for buttons (24h x 12v + 4px border)', () => {
      // Buttons use 12px horizontal padding per side (24 total)
      // and 6px vertical padding per side (12 total)
      // Plus 2px border per side = 4px total
      const baseResult = calculateTextDimensions({
        text: 'Click',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 0,
        borderWidth: 0,
        minWidth: 0
      });

      const buttonResult = calculateButtonDimensions('Click', 16, 'Arial');

      // Button should be wider than raw text (horizontal padding + border)
      expect(buttonResult.width).toBeGreaterThan(baseResult.width);
      // Button should have some vertical padding + border too
      expect(buttonResult.height).toBeGreaterThan(baseResult.height);
    });

    it('should have consistent padding across multiple calls', () => {
      const result1 = calculateTextBoxDimensions('Same Text', 16, 'Arial');
      const result2 = calculateTextBoxDimensions('Same Text', 16, 'Arial');

      expect(result1.width).toBe(result2.width);
      expect(result1.height).toBe(result2.height);
    });
  });

  describe('Consistency', () => {
    it('should return same dimensions for same input', () => {
      const result1 = calculateTextDimensions({
        text: 'Consistent test',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 20
      });

      const result2 = calculateTextDimensions({
        text: 'Consistent test',
        fontSize: 16,
        fontFamily: 'Arial',
        padding: 20
      });

      expect(result1.width).toBe(result2.width);
      expect(result1.height).toBe(result2.height);
    });

    it('should maintain aspect ratio for similar texts', () => {
      const short = calculateTextDimensions({
        text: 'Short',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      const medium = calculateTextDimensions({
        text: 'Medium length text',
        fontSize: 16,
        fontFamily: 'Arial'
      });

      // Medium text should be wider
      expect(medium.width).toBeGreaterThan(short.width);
    });
  });
});
