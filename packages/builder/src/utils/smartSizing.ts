/**
 * Smart Sizing Utility
 *
 * Applies the same smart sizing logic used by the renderer (PositionedBeatView)
 * at element creation/load time in the visual editor. This ensures the editor
 * and preview show identical dimensions.
 *
 * Core principle: Apply smart sizing once, store the results as element dimensions.
 * User edits (drag/resize) set manuallyResized=true which prevents overriding.
 */

import {
  calculateSmartTextBoxDimensions,
  calculateSmartButtonDimensions,
  adjustElementsForCollisions,
  type RenderThemeSettings,
  type PositionedElementData,
} from '@asaps/renderer';
import type { VisualElement } from '../components/visual/VisualBeatEditor';

// Beat types that have a continue/action button (affects text box max height calculation)
const BUTTON_BEAT_TYPES = ['infoText', 'endScreen', 'aiSummary', 'aiInfoText', 'onlineContent'];
const NO_BUTTON_BEAT_TYPES = ['durScreen', 'aiDurScreen'];
const DEFAULT_BUTTON_HEIGHT = 50;

// Beat types where collision detection should be skipped
// (they use user-defined button layout)
const SKIP_COLLISION_BEAT_TYPES = ['endScreen', 'endScreenCredits', 'aiSummary'];

/**
 * Compute auto font size based on content length.
 * Mirrors the logic in PositionedBeatView TextElement (lines 2409-2443).
 */
function computeAutoFontSize(
  content: string,
  locationName: string,
  theme: RenderThemeSettings
): number {
  const contentLength = content?.length || 0;
  const isTitleElement = locationName?.toLowerCase().includes('title') ||
                         locationName?.toLowerCase().includes('author');

  if (isTitleElement && theme.fonts.titleFontSize) {
    return theme.fonts.titleFontSize;
  }
  if (!isTitleElement && theme.fonts.textFontSize) {
    return theme.fonts.textFontSize;
  }

  // Auto-size based on content length
  if (contentLength > 400) return 11;
  if (contentLength > 200) return 12;
  if (contentLength > 80) return 14;
  if (contentLength < 30) return 36;
  return 16;
}

/**
 * Compute auto text alignment based on content length.
 * Mirrors the logic in PositionedBeatView TextElement/DialogElement.
 */
function computeAutoTextAlign(content: string): 'left' | 'center' {
  return (content?.length || 0) > 200 ? 'left' : 'center';
}

/**
 * Apply smart sizing to visual elements.
 *
 * For each element that hasn't been manually resized, this calculates
 * dimensions using the same algorithms as the renderer's runtime mode.
 * The results are stored on the elements so both editor and preview
 * render identically.
 *
 * @param elements - The visual elements to process
 * @param stageWidth - Stage width from project settings
 * @param stageHeight - Stage height from project settings
 * @param theme - Render theme settings
 * @param beatType - The beat type (affects button height calculation)
 * @returns New array of elements with smart-sized dimensions applied
 */
export function applySmartSizing(
  elements: VisualElement[],
  stageWidth: number,
  stageHeight: number,
  theme: RenderThemeSettings,
  beatType: string
): VisualElement[] {
  const result = elements.map(el => {
    // Skip elements that were manually resized by the user
    if (el.manuallyResized) {
      return el;
    }

    // Only apply to text, dialog, and button elements
    if (el.type !== 'text' && el.type !== 'dialog' && el.type !== 'button') {
      return el;
    }

    const content = el.text || '';
    if (!content) {
      return el;
    }

    const updated = { ...el };

    // Auto font size (for elements without fontOverridden)
    if (!el.fontOverridden && (el.type === 'text' || el.type === 'dialog')) {
      const autoFontSize = computeAutoFontSize(content, el.name, theme);
      if (!el.fontSize || el.fontSize !== autoFontSize) {
        updated.fontSize = autoFontSize;
      }
    }

    // Auto text alignment (for elements without explicit textAlign set by user)
    // Only auto-set if the element was auto-sized (not manually configured)
    if (el.initialAutoSized && (el.type === 'text' || el.type === 'dialog')) {
      const autoAlign = computeAutoTextAlign(content);
      updated.textAlign = autoAlign;
    }

    const fontSize = updated.fontSize || el.fontSize || 16;

    if (el.type === 'button') {
      // Button smart sizing
      const btnPaddingH = 16;
      const btnPaddingV = 10;
      const smartDims = calculateSmartButtonDimensions(
        content,
        fontSize,
        { x: el.x, y: el.y, width: el.width, height: el.height },
        btnPaddingH,
        btnPaddingV,
        stageWidth,
        stageHeight
      );
      updated.width = smartDims.width;
      updated.height = smartDims.height;
    } else {
      // Text/dialog smart sizing
      const padding = el.type === 'dialog'
        ? Math.max(Math.floor(el.width * 0.04), 12)
        : (theme.textBox.padding || 20);

      // Determine effective button height for max height calculation
      const hasButton = BUTTON_BEAT_TYPES.includes(beatType);
      const isNoButtonBeat = NO_BUTTON_BEAT_TYPES.includes(beatType);
      const effectiveButtonHeight = (hasButton && !isNoButtonBeat)
        ? DEFAULT_BUTTON_HEIGHT
        : 0;

      const smartDims = calculateSmartTextBoxDimensions(
        content,
        fontSize,
        { x: el.x, y: el.y, width: el.width, height: el.height },
        padding,
        effectiveButtonHeight,
        stageWidth,
        stageHeight
      );

      // Apply xOffset to center the expanded box
      updated.x = el.x - smartDims.xOffset;
      updated.width = smartDims.width;
      updated.height = smartDims.height;
    }

    updated.initialAutoSized = true;
    return updated;
  });

  // Apply collision detection (pushes buttons below expanded text boxes)
  // Skip for beat types that use user-defined button layouts
  if (!SKIP_COLLISION_BEAT_TYPES.includes(beatType)) {
    return applyCollisionDetection(result, stageWidth, stageHeight, theme, beatType);
  }

  return result;
}

/**
 * Apply collision detection by converting VisualElements to PositionedElementData,
 * running adjustElementsForCollisions, then mapping positions back.
 */
function applyCollisionDetection(
  elements: VisualElement[],
  stageWidth: number,
  stageHeight: number,
  theme: RenderThemeSettings,
  beatType: string
): VisualElement[] {
  // Check if there are any text+button elements that could collide
  const hasTextElements = elements.some(el => el.type === 'text' || el.type === 'dialog');
  const hasButtonElements = elements.some(el => el.type === 'button');
  if (!hasTextElements || !hasButtonElements) {
    return elements;
  }

  // Convert VisualElements to PositionedElementData for collision detection
  const positionedElements: PositionedElementData[] = elements.map(el => ({
    location: {
      kind: el.type as any,
      name: el.name,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      zIndex: el.z,
      fontSize: el.fontSize,
      textAlign: el.textAlign,
      font: el.font,
    },
    content: el.text || '',
  }));

  // Calculate button height for collision detection
  const buttonElements = elements.filter(el => el.type === 'button');
  const maxButtonHeight = buttonElements.length > 0
    ? Math.max(...buttonElements.map(el => el.height))
    : DEFAULT_BUTTON_HEIGHT;

  const adjusted = adjustElementsForCollisions(
    positionedElements,
    stageWidth,
    stageHeight,
    theme,
    maxButtonHeight,
    0, // hudBottomY - not relevant for editor
    beatType
  );

  // Map adjusted positions back to VisualElements
  return elements.map((el, i) => {
    const adj = adjusted[i];
    if (adj.location.y !== el.y || adj.location.x !== el.x) {
      return {
        ...el,
        x: adj.location.x,
        y: adj.location.y,
      };
    }
    return el;
  });
}

/**
 * Apply smart sizing to a single element.
 * Useful when content changes for a specific element.
 */
export function applySmartSizingToElement(
  element: VisualElement,
  stageWidth: number,
  stageHeight: number,
  theme: RenderThemeSettings,
  beatType: string
): VisualElement {
  const result = applySmartSizing([element], stageWidth, stageHeight, theme, beatType);
  return result[0];
}
