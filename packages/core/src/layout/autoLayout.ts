/**
 * Auto Layout System
 *
 * Shared auto-layout logic for positioning visual elements
 * Used by both the visual editor and the renderer to ensure consistent layout.
 *
 * Key features:
 * - Text box auto-sizing (prefer width up to 80% before growing taller)
 * - Text box centering when expansion needed
 * - Button width normalization
 * - Button horizontal alignment
 * - Collision detection and vertical spacing
 */

/**
 * Minimal theme settings needed for auto-layout calculations
 */
export interface AutoLayoutTheme {
  /** Text box padding in pixels */
  textBoxPadding: number;
  /** Maximum text box width as fraction of stage (0-1), default 0.8 */
  maxTextWidthRatio?: number;
  /** Maximum button width as fraction of stage (0-1), default 0.6 */
  maxButtonWidthRatio?: number;
  /** Gap between text box and buttons in pixels, default 15 */
  textButtonGap?: number;
  /** Gap between buttons in pixels, default 20 */
  buttonGap?: number;
}

/**
 * Element type for layout calculations
 */
export type LayoutElementKind = 'text' | 'dialog' | 'button' | 'image' | 'hotspot' | 'video' | 'inputText';

/**
 * Input element for auto-layout
 */
export interface LayoutElement {
  /** Unique element identifier */
  id: string;
  /** Element type */
  kind: LayoutElementKind;
  /** Text content (for text boxes and buttons) */
  content: string;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Width */
  width: number;
  /** Height */
  height: number;
  /** Font size in pixels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Speaker name (for dialog text) */
  speaker?: string;
}

/**
 * Output element after layout adjustments
 */
export interface LayoutResult {
  /** Element ID */
  id: string;
  /** Adjusted X position */
  x: number;
  /** Adjusted Y position */
  y: number;
  /** Adjusted width */
  width: number;
  /** Adjusted height */
  height: number;
  /** Whether this element was adjusted from its original position */
  wasAdjusted: boolean;
}

/**
 * Complete auto-layout result
 */
export interface AutoLayoutOutput {
  /** Layout results for each element */
  results: Map<string, LayoutResult>;
  /** Elements array with applied adjustments (for convenience) */
  adjustedElements: LayoutElement[];
}

/**
 * Default theme values for auto-layout
 */
const DEFAULT_THEME: Required<AutoLayoutTheme> = {
  textBoxPadding: 20,
  maxTextWidthRatio: 0.8,
  maxButtonWidthRatio: 0.6,
  textButtonGap: 15,
  buttonGap: 20,
};

/**
 * Measure text dimensions using canvas
 * Returns the width needed to fit text on a single line
 */
function measureTextWidth(text: string, fontSize: number, fontFamily: string = 'Arial'): number {
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
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
}

/**
 * Calculate optimal text box dimensions
 * Prefers wider boxes (up to maxWidth) before growing taller
 */
function calculateTextBoxDimensions(
  text: string,
  fontSize: number,
  fontFamily: string,
  locationWidth: number,
  maxWidth: number,
  padding: number
): { width: number; height: number } {
  const lineHeight = 1.4;
  const contentPadding = padding * 2; // padding on both sides

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

/**
 * Compute auto-layout for a set of elements
 *
 * This function adjusts element positions to:
 * 1. Auto-size text boxes based on content
 * 2. Center text boxes when they need more width
 * 3. Normalize button widths to the maximum
 * 4. Align buttons horizontally
 * 5. Prevent collisions between text boxes and buttons
 * 6. Prevent collisions between buttons
 *
 * @param elements - Array of elements to layout
 * @param stageWidth - Width of the stage in pixels
 * @param stageHeight - Height of the stage in pixels (for bounds checking)
 * @param theme - Theme settings for layout calculations
 * @returns Layout output with adjusted positions
 */
export function computeAutoLayout(
  elements: LayoutElement[],
  stageWidth: number,
  stageHeight: number,
  theme: AutoLayoutTheme
): AutoLayoutOutput {
  // Merge with defaults
  const t: Required<AutoLayoutTheme> = { ...DEFAULT_THEME, ...theme };

  const padding = t.textBoxPadding;
  const maxTextWidth = stageWidth * t.maxTextWidthRatio;

  // Separate element types
  const textElements = elements.filter(el =>
    el.kind === 'text' || el.kind === 'dialog'
  );
  const buttonElements = elements.filter(el =>
    el.kind === 'button'
  );
  const otherElements = elements.filter(el =>
    el.kind !== 'text' && el.kind !== 'dialog' && el.kind !== 'button'
  );

  const results = new Map<string, LayoutResult>();
  const adjustedElements: LayoutElement[] = [];

  // Calculate actual dimensions for text elements
  // Center text boxes horizontally when they need more width
  const textBoxBounds: { bottom: number; left: number; right: number }[] = [];

  for (const el of textElements) {
    const fontSize = el.fontSize || 16;
    const fontFamily = el.fontFamily || 'Arial';
    const dims = calculateTextBoxDimensions(
      el.content || '',
      fontSize,
      fontFamily,
      el.width,
      maxTextWidth,
      padding
    );

    // If text needs more width, center it horizontally on the stage
    const needsMoreWidth = dims.width > el.width;
    const newWidth = needsMoreWidth ? dims.width : el.width;

    // Center the text box if it needs more width, otherwise keep original position
    // Also ensure it doesn't go off-screen
    let newX = el.x;
    if (needsMoreWidth) {
      // Center on stage
      newX = (stageWidth - newWidth) / 2;
    } else {
      // Ensure original position doesn't cause overflow
      if (newX + newWidth > stageWidth - 20) {
        newX = stageWidth - newWidth - 20;
      }
      if (newX < 20) {
        newX = 20;
      }
    }

    // Calculate the actual bounds of the text box
    const bottom = el.y + dims.height;
    const left = newX;
    const right = newX + newWidth;
    textBoxBounds.push({ bottom, left, right });

    const wasAdjusted = newWidth !== el.width || newX !== el.x;
    results.set(el.id, {
      id: el.id,
      x: newX,
      y: el.y,
      width: newWidth,
      height: dims.height,
      wasAdjusted
    });

    adjustedElements.push({
      ...el,
      x: newX,
      width: newWidth,
      height: dims.height
    });
  }

  // Process other elements (no adjustment)
  for (const el of otherElements) {
    results.set(el.id, {
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      wasAdjusted: false
    });
    adjustedElements.push(el);
  }

  // Process buttons
  if (buttonElements.length === 0) {
    return { results, adjustedElements };
  }

  // Calculate uniform button width (use max width among all buttons, capped)
  const maxButtonWidth = Math.min(
    Math.max(...buttonElements.map(el => el.width)),
    stageWidth * t.maxButtonWidthRatio
  );

  // Calculate common X position: average center of all buttons
  const avgCenterX = buttonElements.reduce(
    (sum, el) => sum + el.x + el.width / 2, 0
  ) / buttonElements.length;
  const commonX = Math.max(0, Math.min(avgCenterX - maxButtonWidth / 2, stageWidth - maxButtonWidth));

  // Process buttons in order of their Y position (top to bottom)
  const sortedButtons = [...buttonElements].sort((a, b) => a.y - b.y);
  const buttonBounds: { top: number; bottom: number; left: number; right: number }[] = [];

  for (const el of sortedButtons) {
    let newY = el.y;
    // Use common X position for all buttons (aligned)
    const newX = commonX;
    const buttonLeft = newX;
    const buttonRight = newX + maxButtonWidth;
    const buttonHeight = el.height;

    // Check collision with each text box
    for (const bounds of textBoxBounds) {
      const horizontalOverlap = buttonLeft < bounds.right && buttonRight > bounds.left;
      if (horizontalOverlap && newY < bounds.bottom + t.textButtonGap) {
        newY = Math.max(newY, bounds.bottom + t.textButtonGap);
      }
    }

    // Check collision with previously placed buttons
    for (const bounds of buttonBounds) {
      const horizontalOverlap = buttonLeft < bounds.right && buttonRight > bounds.left;
      if (horizontalOverlap && newY < bounds.bottom + t.buttonGap && newY + buttonHeight > bounds.top) {
        newY = Math.max(newY, bounds.bottom + t.buttonGap);
      }
    }

    // Record this button's bounds for subsequent buttons
    buttonBounds.push({
      top: newY,
      bottom: newY + buttonHeight,
      left: buttonLeft,
      right: buttonRight
    });

    const wasAdjusted = newX !== el.x || newY !== el.y || maxButtonWidth !== el.width;
    results.set(el.id, {
      id: el.id,
      x: newX,
      y: newY,
      width: maxButtonWidth,
      height: buttonHeight,
      wasAdjusted
    });

    adjustedElements.push({
      ...el,
      x: newX,
      y: newY,
      width: maxButtonWidth
    });
  }

  return { results, adjustedElements };
}

/**
 * Apply layout results to elements, but only for elements
 * that don't have saved overrides
 *
 * @param elements - Original elements
 * @param layoutResults - Results from computeAutoLayout
 * @param overrides - Map of element ID to saved position overrides
 * @returns Elements with layout applied, respecting overrides
 */
export function applyLayoutWithOverrides(
  elements: LayoutElement[],
  layoutResults: AutoLayoutOutput,
  overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number }>>
): LayoutElement[] {
  return elements.map(el => {
    const layoutResult = layoutResults.results.get(el.id);
    const override = overrides[el.id];

    if (!layoutResult) {
      // No layout result, use original
      return override ? { ...el, ...override } : el;
    }

    // Start with layout result
    const result = {
      ...el,
      x: layoutResult.x,
      y: layoutResult.y,
      width: layoutResult.width,
      height: layoutResult.height,
    };

    // Apply overrides on top (partial overrides supported)
    if (override) {
      if (override.x !== undefined) result.x = override.x;
      if (override.y !== undefined) result.y = override.y;
      if (override.width !== undefined) result.width = override.width;
      if (override.height !== undefined) result.height = override.height;
    }

    return result;
  });
}

/**
 * Calculate which elements have been manually positioned
 * (differ from auto-layout)
 *
 * @param elements - Current elements with their positions
 * @param autoLayoutResults - Results from computeAutoLayout
 * @returns Map of element ID to override values (only for changed elements)
 */
export function calculateOverrides(
  elements: LayoutElement[],
  autoLayoutResults: AutoLayoutOutput
): Record<string, Partial<{ x: number; y: number; width: number; height: number }>> {
  const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number }>> = {};

  for (const el of elements) {
    const autoResult = autoLayoutResults.results.get(el.id);
    if (!autoResult) continue;

    const diff: Partial<{ x: number; y: number; width: number; height: number }> = {};
    let hasChanges = false;

    // Use small epsilon for float comparison
    const epsilon = 0.5;

    if (Math.abs(el.x - autoResult.x) > epsilon) {
      diff.x = el.x;
      hasChanges = true;
    }
    if (Math.abs(el.y - autoResult.y) > epsilon) {
      diff.y = el.y;
      hasChanges = true;
    }
    if (Math.abs(el.width - autoResult.width) > epsilon) {
      diff.width = el.width;
      hasChanges = true;
    }
    if (Math.abs(el.height - autoResult.height) > epsilon) {
      diff.height = el.height;
      hasChanges = true;
    }

    if (hasChanges) {
      overrides[el.id] = diff;
    }
  }

  return overrides;
}
