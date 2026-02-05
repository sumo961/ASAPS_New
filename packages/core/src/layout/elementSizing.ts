/**
 * Element Sizing Module
 *
 * Consolidated sizing utilities for text boxes, buttons, and dialogs.
 * This is the SINGLE SOURCE OF TRUTH for dimension calculations.
 *
 * Used by:
 * - Visual Editor (VisualWorkspace)
 * - Preview Renderer (PositionedBeatView)
 * - Beat execution (DialogTreeBeat)
 * - Auto-layout (autoLayout.ts)
 */

/**
 * Font name to CSS font-family mapping
 */
const FONT_FAMILIES: Record<string, string> = {
  'Arial': 'Arial, sans-serif',
  'Helvetica': 'Helvetica, Arial, sans-serif',
  'Times New Roman': 'Times New Roman, serif',
  'Courier New': 'Courier New, monospace',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Gothic': 'Georgia, serif',
  'Handwriting': 'Brush Script MT, cursive',
  'Handwriting2': 'Lucida Handwriting, cursive',
  'Comic Sans MS': 'Comic Sans MS, cursive',
  'Impact': 'Impact, sans-serif',
  'Trebuchet MS': 'Trebuchet MS, sans-serif',
  'Palatino': 'Palatino Linotype, Book Antiqua, Palatino, serif',
};

/**
 * Convert font name to CSS font-family value
 */
export function getFontFamily(fontName: string): string {
  return FONT_FAMILIES[fontName] || fontName;
}

/**
 * Check if a font is a built-in font (not a custom theme font)
 */
export function isBuiltInFont(fontName: string | undefined): boolean {
  if (!fontName) return true;
  return fontName in FONT_FAMILIES;
}

/**
 * Dimensions returned from sizing calculations
 */
export interface ElementDimensions {
  width: number;
  height: number;
}

/**
 * Extended dimensions for text boxes (includes scroll and offset info)
 */
export interface TextBoxDimensions extends ElementDimensions {
  needsScroll: boolean;
  xOffset: number;
}

/**
 * Options for text dimension calculations
 */
export interface SizingOptions {
  text: string;
  fontSize: number;
  fontFamily?: string;
  padding?: number;
  lineHeight?: number;
}

/**
 * Options for constrained sizing (with min/max bounds)
 */
export interface ConstrainedSizingOptions extends SizingOptions {
  minWidth?: number;
  maxWidth?: number;
  borderWidth?: number;
}

/**
 * Options for smart text box sizing (with stage constraints)
 */
export interface SmartTextBoxOptions {
  content: string;
  fontSize: number;
  location: { x: number; y: number; width: number; height: number };
  padding: number;
  buttonHeight: number;
  stageWidth: number;
  stageHeight: number;
}

/**
 * Options for smart button sizing
 */
export interface SmartButtonOptions {
  content: string;
  fontSize: number;
  location: { x: number; y: number; width: number; height: number };
  paddingH: number;
  paddingV: number;
  stageWidth: number;
  stageHeight: number;
}

// Default button height and padding
const DEFAULT_BUTTON_HEIGHT = 50;
const BUTTON_PADDING_PERCENT = 0.05; // 5% padding above button

/**
 * Measure text width using canvas
 * Returns the width needed to fit text on a single line
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family (defaults to Arial)
 */
export function measureTextWidth(text: string, fontSize: number, fontFamily: string = 'Arial'): number {
  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    // Fallback for server-side: estimate based on character count
    return text.length * fontSize * 0.55;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.length * fontSize * 0.55; // Fallback estimate
  }
  context.font = `${fontSize}px ${getFontFamily(fontFamily)}`;
  return context.measureText(text).width;
}

/**
 * Calculate basic text dimensions (width/height needed for content)
 *
 * @param options - Sizing options
 */
export function calculateTextDimensions(options: ConstrainedSizingOptions): ElementDimensions {
  const {
    text,
    fontSize,
    fontFamily = 'Arial',
    minWidth = 100,
    maxWidth = 824,
    padding = 40,
    lineHeight = 1.4,
    borderWidth = 4,
  } = options;

  if (!text || text.trim().length === 0) {
    return {
      width: minWidth,
      height: fontSize * lineHeight + padding + borderWidth
    };
  }

  // Measure single-line width
  const textWidth = measureTextWidth(text, fontSize, fontFamily);
  const singleLineWidth = textWidth + padding;

  // Determine width and line count
  let width: number;
  let lines: number;

  if (singleLineWidth <= maxWidth) {
    width = Math.max(minWidth, singleLineWidth);
    lines = 1;
  } else {
    // Need multiple lines - calculate based on content length
    const charCount = text.length;
    if (charCount <= 40) {
      width = 300;
    } else if (charCount <= 80) {
      width = 400;
    } else if (charCount <= 150) {
      width = 500;
    } else {
      width = 600;
    }
    width = Math.min(width, maxWidth);
    width = Math.max(width, minWidth);

    // Calculate how many lines we need
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - padding;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    lines = Math.max(1, Math.ceil(charCount / charsPerLine));
  }

  const contentHeight = lines * fontSize * lineHeight;
  const height = contentHeight + padding + borderWidth;

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Calculate text box dimensions (convenience wrapper)
 * Text boxes can be multi-line and have standard constraints
 *
 * @param text - Text content
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family
 */
export function calculateTextBoxDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial'
): ElementDimensions {
  return calculateTextDimensions({
    text,
    fontSize,
    fontFamily,
    minWidth: 100,
    maxWidth: 824,
    padding: 40, // 20px per side × 2
  });
}

/**
 * Calculate button dimensions based on text content
 *
 * @param text - Button text
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family
 * @param maxWidth - Maximum button width (default 614 = 60% of 1024px stage)
 */
export function calculateButtonDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial',
  maxWidth: number = 614
): ElementDimensions {
  const textWidth = measureTextWidth(text, fontSize, fontFamily);

  // Button padding - aligned with PositionedBeatView.estimateButtonHeight
  const horizontalPadding = 40; // 20px per side (contentPaddingH)
  const verticalPadding = 24;   // 12px per side (contentPaddingV)
  const lineHeight = 1.4;       // Aligned with renderer
  const charWidth = fontSize * 0.6; // Aligned with renderer

  const minWidth = 120;

  const contentWidth = textWidth + horizontalPadding;
  const width = Math.max(minWidth, Math.min(contentWidth, maxWidth));

  // Calculate number of lines based on actual width
  const availableWidth = width - horizontalPadding;
  const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth));
  const numLines = Math.max(1, Math.ceil(text.length / charsPerLine));

  const height = numLines * fontSize * lineHeight + verticalPadding;

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Calculate dialog box dimensions
 * Dialog boxes have specific padding for comfortable text display
 *
 * @param text - Dialog text
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family
 */
export function calculateDialogDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial'
): ElementDimensions {
  const result = calculateTextDimensions({
    text,
    fontSize,
    fontFamily,
    minWidth: 200,
    maxWidth: 600,
    padding: 48, // 24px per side for dynamic vertical padding
  });

  // Add extra buffer for dynamic vertical padding (10% of height)
  return {
    width: result.width,
    height: Math.round(result.height * 1.15) // 15% buffer
  };
}

/**
 * Calculate smart button dimensions that grow to fit content
 *
 * Logic:
 * 1. Start with location's width and height
 * 2. If text doesn't fit, grow horizontally first (max: mirror left margin on right)
 * 3. Then grow vertically if needed
 */
export function calculateSmartButtonDimensions(options: SmartButtonOptions): ElementDimensions {
  const { content, fontSize, location, paddingH, paddingV, stageWidth, stageHeight } = options;

  // Estimate text dimensions
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.4;
  const contentPaddingH = paddingH * 2;
  const contentPaddingV = paddingV * 2;

  // Calculate text width needed
  const textWidth = content.length * charWidth;
  const minWidthNeeded = textWidth + contentPaddingH;

  // Calculate available width - leave 5% margin on the right edge
  const rightMargin = stageWidth * 0.05;
  const maxWidth = stageWidth - location.x - rightMargin;

  // Start with location dimensions
  let newWidth = Math.max(location.width, minWidthNeeded);
  let newHeight = location.height;

  // Cap width at max
  if (newWidth > maxWidth) {
    newWidth = maxWidth;
  }

  // Calculate how many lines needed at this width
  const availableContentWidth = newWidth - contentPaddingH;
  const charsPerLine = Math.floor(availableContentWidth / charWidth);
  const linesNeeded = charsPerLine > 0 ? Math.ceil(content.length / charsPerLine) : 1;
  const heightNeeded = linesNeeded * lineHeight + contentPaddingV;

  // Grow height if needed (max: mirror top margin at bottom)
  const maxHeight = stageHeight - (location.y * 2);
  if (heightNeeded > location.height) {
    newHeight = Math.min(heightNeeded, maxHeight);
  }

  return { width: newWidth, height: newHeight };
}

/**
 * Calculate smart text box dimensions that grow to fit content
 *
 * Logic:
 * 1. Start with location's width and height
 * 2. If text doesn't fit, grow horizontally first (max: mirror left margin on right)
 * 3. Then grow vertically (max: leave room for button if applicable)
 * 4. Only scroll if content still doesn't fit
 */
export function calculateSmartTextBoxDimensions(options: SmartTextBoxOptions): TextBoxDimensions {
  const { content, fontSize, location, padding, buttonHeight, stageWidth, stageHeight } = options;

  // Use 0.42 ratio for proportional fonts - measured from actual rendering
  const charWidth = fontSize * 0.42;
  const lineHeight = fontSize * 1.5;
  const contentPadding = padding * 2;

  // Calculate available content area
  const availableContentWidth = location.width - contentPadding;

  // Estimate how many lines the text needs at current width
  const estimatedCharsPerLine = Math.floor(availableContentWidth / charWidth);
  const estimatedLines = estimatedCharsPerLine > 0 ? Math.ceil(content.length / estimatedCharsPerLine) : 1;
  const estimatedContentHeight = estimatedLines * lineHeight;
  const estimatedTotalHeight = estimatedContentHeight + contentPadding;

  // Check if content fits in original dimensions
  if (estimatedTotalHeight <= location.height) {
    return { width: location.width, height: location.height, needsScroll: false, xOffset: 0 };
  }

  // Calculate maximum allowed dimensions
  const rightMargin = stageWidth * 0.05;
  const maxRightGrowth = stageWidth - location.x - rightMargin - location.width;
  const leftMargin = stageWidth * 0.05;
  const maxLeftGrowth = location.x - leftMargin;
  const maxWidth = location.width + Math.max(0, maxRightGrowth) + Math.max(0, maxLeftGrowth);

  // Max height: available space from text box top to button area (or bottom margin)
  const buttonSpace = buttonHeight > 0 ? (buttonHeight + stageHeight * BUTTON_PADDING_PERCENT) : (stageHeight * 0.05);
  const bottomMargin = stageHeight * 0.02;
  const maxHeight = stageHeight - location.y - buttonSpace - bottomMargin;

  // Try growing horizontally first
  let newWidth = location.width;
  let newHeight = location.height;
  let needsScroll = false;

  // For long content, use more horizontal space for better readability
  const isLongContent = content.length > 200;
  const minPreferredWidth = isLongContent ? Math.floor(maxWidth * 0.85) : location.width;
  const absoluteMinWidth = Math.max(150, stageWidth * 0.3);

  // Check if current width is too narrow
  if (location.width < absoluteMinWidth && estimatedCharsPerLine < 10) {
    newWidth = Math.min(absoluteMinWidth, maxWidth);
  }

  // Step 1: Ensure minimum preferred width for long content
  if (newWidth < minPreferredWidth && newWidth < maxWidth) {
    newWidth = Math.min(minPreferredWidth, maxWidth);
  }

  // Height buffer for long content
  const heightBuffer = content.length > 200 ? 1.15 : 1.0;

  // Step 2: Check if content fits at current width, grow if needed
  if (newWidth < maxWidth) {
    for (let testWidth = newWidth; testWidth <= maxWidth; testWidth += 50) {
      const testContentWidth = testWidth - contentPadding;
      const testCharsPerLine = Math.floor(testContentWidth / charWidth);
      const testLines = testCharsPerLine > 0 ? Math.ceil(content.length / testCharsPerLine) : 1;
      const testContentHeight = testLines * lineHeight;
      const testTotalHeight = testContentHeight + contentPadding;
      const bufferedHeight = Math.ceil(testTotalHeight * heightBuffer);

      newWidth = testWidth;

      // Calculate xOffset: prefer growing right, then left if right is exhausted
      const widthIncrease = newWidth - location.width;
      let xOffset = 0;
      if (widthIncrease > 0) {
        const rightGrowthUsed = Math.min(widthIncrease, Math.max(0, maxRightGrowth));
        const leftGrowthUsed = widthIncrease - rightGrowthUsed;
        xOffset = -leftGrowthUsed;
      }

      if (testTotalHeight <= location.height) {
        return { width: newWidth, height: location.height, needsScroll: false, xOffset };
      }
      if (bufferedHeight <= maxHeight) {
        newHeight = Math.min(bufferedHeight, maxHeight);
        return { width: newWidth, height: newHeight, needsScroll: false, xOffset };
      }
    }
    newWidth = maxWidth;
  }

  // Calculate final xOffset
  const finalWidthIncrease = newWidth - location.width;
  let finalXOffset = 0;
  if (finalWidthIncrease > 0) {
    const rightGrowthUsed = Math.min(finalWidthIncrease, Math.max(0, maxRightGrowth));
    const leftGrowthUsed = finalWidthIncrease - rightGrowthUsed;
    finalXOffset = -leftGrowthUsed;
  }

  // Step 3: Calculate needed height at max width
  const finalContentWidth = newWidth - contentPadding;
  const finalCharsPerLine = Math.floor(finalContentWidth / charWidth);
  const finalLines = finalCharsPerLine > 0 ? Math.ceil(content.length / finalCharsPerLine) : 1;
  const finalContentHeight = finalLines * lineHeight + contentPadding;
  const bufferedFinalHeight = Math.ceil(finalContentHeight * heightBuffer);

  if (bufferedFinalHeight <= maxHeight) {
    newHeight = bufferedFinalHeight;
    return { width: newWidth, height: newHeight, needsScroll: false, xOffset: finalXOffset };
  }

  // Step 4: Content doesn't fit - enable scrolling
  newHeight = maxHeight;
  needsScroll = true;

  return { width: newWidth, height: newHeight, needsScroll, xOffset: finalXOffset };
}

/**
 * Calculate dimensions for a text box using stage constraints
 * This is the layout-aware version used for auto-layout calculations
 *
 * @param text - Text content
 * @param fontSize - Font size in pixels
 * @param fontFamily - Font family
 * @param locationWidth - Current location width
 * @param maxWidth - Maximum allowed width
 * @param padding - Padding in pixels
 */
export function calculateTextBoxDimensionsForLayout(
  text: string,
  fontSize: number,
  fontFamily: string,
  locationWidth: number,
  maxWidth: number,
  padding: number
): ElementDimensions {
  const lineHeight = 1.4;
  const contentPadding = padding * 2;

  // Measure single-line width
  const textWidth = measureTextWidth(text, fontSize, fontFamily);
  const singleLineWidth = textWidth + contentPadding;

  // If fits in single line at location width, use location dimensions
  if (singleLineWidth <= locationWidth) {
    return {
      width: locationWidth,
      height: fontSize * lineHeight + contentPadding
    };
  }

  // If fits in single line at max width, expand width
  if (singleLineWidth <= maxWidth) {
    return {
      width: Math.ceil(singleLineWidth),
      height: fontSize * lineHeight + contentPadding
    };
  }

  // Need multiple lines - use max width and calculate height
  const availableWidth = maxWidth - contentPadding;
  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.floor(availableWidth / avgCharWidth);
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));

  return {
    width: maxWidth,
    height: lines * fontSize * lineHeight + contentPadding
  };
}
