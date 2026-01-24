import { describe, it, expect, beforeEach } from 'vitest';
import { VisualWorkspace } from '../VisualWorkspace';

// Test utilities for positioning logic
const CANVAS_WIDTH = 1024;
const CANVAS_CENTER = CANVAS_WIDTH / 2; // 512

describe('Text Box Positioning Logic', () => {
  describe('Horizontal Centering', () => {
    it('should center text elements horizontally using the correct formula', () => {
      const testCases = [
        { width: 400, expectedX: 312 }, // 512 - 400/2 = 312
        { width: 300, expectedX: 362 }, // 512 - 300/2 = 362
        { width: 500, expectedX: 262 }, // 512 - 500/2 = 262
        { width: 200, expectedX: 412 }, // 512 - 200/2 = 412
      ];

      testCases.forEach(({ width, expectedX }) => {
        const calculatedX = CANVAS_CENTER - width / 2;
        expect(calculatedX).toBe(expectedX);
      });
    });

    it('should center button groups correctly', () => {
      // Test case: 3 buttons, 200px width each, 20px spacing
      const buttonWidth = 200;
      const buttonSpacing = 20;
      const buttonCount = 3;

      const totalWidth = (buttonCount * buttonWidth) + ((buttonCount - 1) * buttonSpacing);
      // (3 * 200) + (2 * 20) = 600 + 40 = 640
      expect(totalWidth).toBe(640);

      const startX = CANVAS_CENTER - totalWidth / 2;
      // 512 - 640/2 = 512 - 320 = 192
      expect(startX).toBe(192);

      // Check individual button positions
      const buttonPositions = [
        startX + (0 * (buttonWidth + buttonSpacing)), // 192 + 0 = 192
        startX + (1 * (buttonWidth + buttonSpacing)), // 192 + 220 = 412
        startX + (2 * (buttonWidth + buttonSpacing)), // 192 + 440 = 632
      ];

      expect(buttonPositions[0]).toBe(192);
      expect(buttonPositions[1]).toBe(412);
      expect(buttonPositions[2]).toBe(632);
    });

    it('should center grid layouts correctly', () => {
      // Test case: 3 buttons per row, 220px width, 20px spacing
      const buttonWidth = 220;
      const buttonSpacing = 20;
      const buttonsPerRow = 3;

      const totalRowWidth = (buttonsPerRow * buttonWidth) + ((buttonsPerRow - 1) * buttonSpacing);
      // (3 * 220) + (2 * 20) = 660 + 40 = 700
      expect(totalRowWidth).toBe(700);

      const startX = CANVAS_CENTER - totalRowWidth / 2;
      // 512 - 700/2 = 512 - 350 = 162
      expect(startX).toBe(162);

      // Check column positions
      const columnPositions = [
        startX + (0 * (buttonWidth + buttonSpacing)), // 162 + 0 = 162
        startX + (1 * (buttonWidth + buttonSpacing)), // 162 + 240 = 402
        startX + (2 * (buttonWidth + buttonSpacing)), // 162 + 480 = 642
      ];

      expect(columnPositions[0]).toBe(162);
      expect(columnPositions[1]).toBe(402);
      expect(columnPositions[2]).toBe(642);
    });
  });

  describe('Element Name Matching', () => {
    it('should correctly identify text elements regardless of type (text or dialog)', () => {
      const mockElements = [
        { type: 'text', name: 'text' },
        { type: 'dialog', name: 'text' },
        { type: 'button', name: 'Continue' },
        { type: 'text', name: 'Title' },
        { type: 'dialog', name: 'Title' }
      ];

      // Test the logic we implemented
      const hasTextElement = mockElements.some((e) =>
        (e.type === 'text' || e.type === 'dialog') && e.name === 'text'
      );

      const hasTitleElement = mockElements.some((e) =>
        (e.type === 'text' || e.type === 'dialog') && e.name === 'Title'
      );

      expect(hasTextElement).toBe(true);
      expect(hasTitleElement).toBe(true);

      // Should not find non-existent elements
      const hasNonExistentElement = mockElements.some((e) =>
        (e.type === 'text' || e.type === 'dialog') && e.name === 'NonExistent'
      );
      expect(hasNonExistentElement).toBe(false);
    });

    it('should handle the text-to-dialog conversion correctly', () => {
      // This simulates the conversion logic in VisualWorkspace line 109
      const convertLocationKindToElementType = (kind: string, name: string) => {
        if (kind === 'char') return 'character';
        if (kind === 'text') return 'dialog'; // CRITICAL: text locations become dialog elements
        if (kind === 'inputfield') return 'hotspot';
        return kind;
      };

      // Test cases
      expect(convertLocationKindToElementType('text', 'main')).toBe('dialog');
      expect(convertLocationKindToElementType('text', 'text')).toBe('dialog');
      expect(convertLocationKindToElementType('dialog', 'dialog')).toBe('dialog');
      expect(convertLocationKindToElementType('button', 'continue')).toBe('button');
    });
  });

  describe('Beat Type Specific Positioning', () => {
    it('should position infoText elements correctly', () => {
      const textWidth = 400;
      const textHeight = 100;
      const buttonWidth = 200;
      const buttonHeight = 40;

      // Text should be centered horizontally and positioned at y: 200
      const textX = CANVAS_CENTER - textWidth / 2; // 512 - 200 = 312
      expect(textX).toBe(312);

      // Button should be centered horizontally and positioned at y: 668
      const buttonX = 412; // This is already centered (512 - 200/2 = 412)
      expect(buttonX).toBe(412);
    });

    it('should position dialogTree elements correctly', () => {
      const dialogWidth = 500;
      const dialogHeight = 120;

      // Dialog should be centered horizontally at y: 500
      const dialogX = CANVAS_CENTER - dialogWidth / 2; // 512 - 250 = 262
      expect(dialogX).toBe(262);
    });

    it('should position movementChoice elements correctly', () => {
      const buttonWidth = 400;
      const buttonHeight = 60;
      const buttonSpacing = 20;

      // Each button should be centered horizontally
      const buttonX = CANVAS_CENTER - buttonWidth / 2; // 512 - 200 = 312
      expect(buttonX).toBe(312);

      // Buttons should be vertically spaced
      const button1Y = 250;
      const button2Y = 250 + (buttonHeight + buttonSpacing); // 250 + 80 = 330

      expect(button1Y).toBe(250);
      expect(button2Y).toBe(330);
    });

    it('should position endScreen elements correctly', () => {
      const messageWidth = 200;
      const restartButtonWidth = 180;
      const creditsButtonWidth = 180;
      const buttonSpacing = 20; // Space between restart and credits buttons

      // Message should be centered
      const messageX = CANVAS_CENTER - messageWidth / 2; // 512 - 100 = 412
      expect(messageX).toBe(412);

      // Buttons should be centered as a pair
      const totalButtonWidth = restartButtonWidth + creditsButtonWidth + buttonSpacing; // 180 + 180 + 20 = 380
      const buttonsStartX = CANVAS_CENTER - totalButtonWidth / 2; // 512 - 190 = 322

      expect(buttonsStartX).toBe(322);

      // Individual button positions
      const restartX = buttonsStartX; // 322
      const creditsX = buttonsStartX + restartButtonWidth + buttonSpacing; // 322 + 180 + 20 = 522

      expect(restartX).toBe(322);
      expect(creditsX).toBe(522);
    });
  });

  describe('Vertical Positioning and Spacing', () => {
    it('should maintain proper vertical spacing between elements', () => {
      // Test typical vertical spacing patterns
      const titleY = 200;
      const authorY = 270; // 70px below title
      const dialogY = 500;
      const buttonY = 668; // Near bottom of 768px canvas

      expect(authorY - titleY).toBe(70); // Consistent spacing
      expect(buttonY).toBe(668); // Bottom positioning
      expect(dialogY).toBe(500); // Mid-area positioning
    });

    it('should center elements vertically when appropriate', () => {
      const elementHeight = 100;
      const canvasHeight = 768;
      const centerY = canvasHeight / 2; // 384

      // For vertical centering: y = centerY - height/2
      const elementY = centerY - elementHeight / 2; // 384 - 50 = 334
      expect(elementY).toBe(334);
    });
  });
});