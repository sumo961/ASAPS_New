/**
 * Text Size Calculator
 *
 * Calculates optimal dimensions for text boxes and buttons based on content,
 * font size, and font family with equal padding on all sides.
 */

export interface TextDimensions {
  width: number;
  height: number;
}

export interface TextMeasurementOptions {
  text: string;
  fontSize: number;
  fontFamily?: string;
  minWidth?: number;
  maxWidth?: number;
  padding?: number;
  lineHeight?: number;
  isButton?: boolean;
  borderWidth?: number; // Total border width (both sides), default 4 (2px per side)
}

/**
 * Measures text dimensions using a canvas
 * This is more accurate than DOM-based measurements
 */
function measureTextCanvas(
  text: string,
  fontSize: number,
  fontFamily: string = 'Arial'
): { width: number; height: number } {
  // Create a temporary canvas for text measurement
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    // Fallback calculation if canvas not available
    return {
      width: text.length * fontSize * 0.6,
      height: fontSize * 1.2
    };
  }

  context.font = `${fontSize}px ${fontFamily}`;
  const metrics = context.measureText(text);

  return {
    width: metrics.width,
    height: fontSize * 1.2 // Approximate height based on font size
  };
}

/**
 * Calculate optimal text box dimensions with equal padding
 *
 * @param options - Text measurement options
 * @returns Dimensions with equal padding on all sides
 */
export function calculateTextDimensions(options: TextMeasurementOptions): TextDimensions {
  const {
    text,
    fontSize,
    fontFamily = 'Arial',
    minWidth = 100,
    maxWidth = 824,
    padding = 40, // Total padding (20px per side × 2) to match defaultSettings.textbox.padding
    lineHeight = 1.4,
    isButton = false,
    borderWidth = 4 // Total border (2px per side × 2) to match defaultSettings.textbox.borderWidth
  } = options;

  if (!text || text.trim().length === 0) {
    // Empty text: return minimum size
    return {
      width: minWidth,
      height: fontSize * lineHeight + padding + borderWidth
    };
  }

  // Measure single-line width
  const measured = measureTextCanvas(text, fontSize, fontFamily);
  const singleLineWidth = measured.width + padding; // Add horizontal padding

  // For buttons, prefer single line if possible
  if (isButton) {
    const buttonWidth = Math.max(minWidth, Math.min(singleLineWidth, maxWidth));
    const buttonHeight = fontSize * lineHeight + padding + borderWidth;
    return {
      width: Math.round(buttonWidth),
      height: Math.round(buttonHeight)
    };
  }

  // For text boxes, determine if we need multiple lines
  let width: number;
  let lines: number;

  if (singleLineWidth <= maxWidth) {
    // Fits in one line
    width = Math.max(minWidth, singleLineWidth);
    lines = 1;
  } else {
    // Need multiple lines - calculate based on content length
    const charCount = text.length;

    if (charCount <= 40) {
      // Short text: compact width, few lines
      width = 300;
    } else if (charCount <= 80) {
      // Medium text: moderate width
      width = 400;
    } else if (charCount <= 150) {
      // Long text: wider for readability
      width = 500;
    } else {
      // Very long text: maximum width
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

  // Calculate height with equal padding and border
  const contentHeight = lines * fontSize * lineHeight;
  const height = contentHeight + padding + borderWidth;

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Calculate dimensions for a button with text
 * Buttons prefer single line and have specific size constraints
 * Buttons have asymmetric padding: 12px horizontal, 6px vertical per side
 */
export function calculateButtonDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial'
): TextDimensions {
  // Measure text width
  const measured = measureTextCanvas(text, fontSize, fontFamily);

  // Button padding matches renderer: 12px horizontal per side, 6px vertical per side
  const horizontalPadding = 24; // 12 * 2 sides
  const verticalPadding = 12;   // 6 * 2 sides
  const borderWidth = 4;        // 2px per side × 2 to match theme.button.borderWidth
  const lineHeight = 1.4;

  const minWidth = 120;
  const maxWidth = 400;

  const contentWidth = measured.width + horizontalPadding + borderWidth;
  const width = Math.max(minWidth, Math.min(contentWidth, maxWidth));
  const height = fontSize * lineHeight + verticalPadding + borderWidth;

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

/**
 * Calculate dimensions for a text box
 * Text boxes can be multi-line and have different size constraints
 */
export function calculateTextBoxDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial'
): TextDimensions {
  return calculateTextDimensions({
    text,
    fontSize,
    fontFamily,
    minWidth: 100,
    maxWidth: 824,
    padding: 40, // 20px per side × 2 to match defaultSettings.textbox.padding
    isButton: false
  });
}

/**
 * Calculate dimensions for a dialog box
 * Dialog boxes are similar to text boxes but may have different defaults
 * Renderer uses dynamic padding: h=max(width*0.04,12), v=max(height*0.1,12) per side
 */
export function calculateDialogDimensions(
  text: string,
  fontSize: number = 16,
  fontFamily: string = 'Arial'
): TextDimensions {
  return calculateTextDimensions({
    text,
    fontSize,
    fontFamily,
    minWidth: 200,
    maxWidth: 600,
    padding: 36, // Approximate: accounts for min 12px + dynamic padding
    isButton: false
  });
}
