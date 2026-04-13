import React from 'react';
import ReactDOM from 'react-dom';
import type { Location, AnimationPath, AnimationState } from '@asaps/core';
import { getPresetSound, isPresetSound, getFontFamily, isBuiltInFont } from '@asaps/core';
import { getAudioManager } from '../audio/AudioManager';
import { getAnimationManager } from '../animation/AnimationEngine';
import { CharacterMeterFrame, type MeterFrameConfig, type MeterCounterData } from './CharacterMeterFrame';
import { CharacterInventoryFrame, type InventoryFrameConfig, type InventoryItemData } from './CharacterInventoryFrame';
import { TimerProgressBar } from './TimerProgressBar';
import { TimerHudDisplay } from './TimerHudDisplay';
import { CountdownMeterHud } from './CountdownMeterHud';
import { KeypadElement } from './KeypadElement';
import { ScrollIndicator, ScrollBadge } from './ScrollIndicator';
import { renderMarkdownLite } from '../utils/markdownLite';

// Default stage dimensions (can be overridden by project settings)
const DEFAULT_STAGE_WIDTH = 1024;
const DEFAULT_STAGE_HEIGHT = 768;
const DEFAULT_BUTTON_HEIGHT = 50;
const BUTTON_PADDING_PERCENT = 0.05; // 5% padding above button

/**
 * Calculate smart button dimensions that grow to fit content
 *
 * Logic:
 * 1. Start with location's width and height
 * 2. If text doesn't fit, grow horizontally first (max: mirror left margin on right)
 * 3. Then grow vertically if needed
 *
 * @param content - The button text content
 * @param fontSize - Font size in pixels
 * @param location - The button's location with x, y, width, height
 * @param paddingH - Horizontal padding
 * @param paddingV - Vertical padding
 * @param stageWidth - Stage width from project settings
 * @param stageHeight - Stage height from project settings
 */
export function calculateSmartButtonDimensions(
  content: string,
  fontSize: number,
  location: { x: number; y: number; width: number; height: number },
  paddingH: number,
  paddingV: number,
  stageWidth: number,
  stageHeight: number
): { width: number; height: number } {
  // Estimate text dimensions
  const charWidth = fontSize * 0.6; // Average character width for buttons
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
 *
 * @param content - The text content
 * @param fontSize - Font size in pixels
 * @param location - The element's location with x, y, width, height
 * @param padding - Padding inside the text box
 * @param buttonHeight - Actual calculated button height (0 if no button)
 * @param stageWidth - Stage width from project settings
 * @param stageHeight - Stage height from project settings
 */
export function calculateSmartTextBoxDimensions(
  content: string,
  fontSize: number,
  location: { x: number; y: number; width: number; height: number },
  padding: number,
  buttonHeight: number,
  stageWidth: number,
  stageHeight: number,
  /** Extra horizontal space consumed by inline content (e.g., speaker portrait) */
  inlineContentWidth: number = 0
): { width: number; height: number; needsScroll: boolean; xOffset: number; yOffset: number } {
  // Estimate text dimensions
  // Use 0.42 ratio for proportional fonts - measured from actual rendering
  const charWidth = fontSize * 0.42;
  const lineHeight = fontSize * 1.5;
  const contentPadding = padding * 2; // Padding on both sides

  // Calculate available content area (subtract portrait width — text wraps in remaining space)
  const availableContentWidth = location.width - contentPadding - inlineContentWidth;

  // Estimate how many lines the text needs at current width
  const estimatedCharsPerLine = Math.floor(availableContentWidth / charWidth);
  const estimatedLines = estimatedCharsPerLine > 0 ? Math.ceil(content.length / estimatedCharsPerLine) : 1;
  const estimatedContentHeight = estimatedLines * lineHeight;
  const estimatedTotalHeight = estimatedContentHeight + contentPadding;

  const contentPreview = content.substring(0, 50).replace(/\n/g, '\\n');
  console.log(`[SmartTextBox] Input: loc(x=${location.x}, y=${location.y}, w=${location.width}, h=${location.height}), fontSize=${fontSize}, content="${contentPreview}..." (${content.length} chars), inlineContent=${inlineContentWidth}`);
  console.log(`[SmartTextBox] Estimates: charWidth=${charWidth.toFixed(1)}, lineHeight=${lineHeight.toFixed(1)}, charsPerLine=${estimatedCharsPerLine}, lines=${estimatedLines}, neededHeight=${estimatedTotalHeight.toFixed(1)}`);

  // Check if content fits in original dimensions
  if (estimatedTotalHeight <= location.height) {
    return { width: location.width, height: location.height, needsScroll: false, xOffset: 0, yOffset: 0 };
  }

  // Calculate maximum allowed dimensions
  // Max right growth: leave 5% margin on right edge
  const rightMargin = stageWidth * 0.05;
  const maxRightGrowth = stageWidth - location.x - rightMargin - location.width;

  // Max left growth: can grow left up to 5% from left edge
  const leftMargin = stageWidth * 0.05;
  const maxLeftGrowth = location.x - leftMargin;

  // Total max width considering both directions
  const maxWidth = location.width + Math.max(0, maxRightGrowth) + Math.max(0, maxLeftGrowth);

  // Max height: bi-directional (downward + upward)
  const buttonSpace = buttonHeight > 0 ? (buttonHeight + stageHeight * BUTTON_PADDING_PERCENT) : (stageHeight * 0.05);
  const bottomMargin = stageHeight * 0.02;
  const maxDownwardHeight = stageHeight - location.y - buttonSpace - bottomMargin;
  const topMargin = stageHeight * 0.02;
  const maxTopGrowth = Math.max(0, location.y - topMargin);
  const maxHeight = Math.max(0, maxDownwardHeight) + maxTopGrowth;

  console.log(`[SmartTextBox] Max growth: rightGrowth=${maxRightGrowth.toFixed(1)}, leftGrowth=${maxLeftGrowth.toFixed(1)}, maxWidth=${maxWidth.toFixed(1)}, maxDownwardHeight=${maxDownwardHeight.toFixed(1)}, maxTopGrowth=${maxTopGrowth.toFixed(1)}, maxHeight=${maxHeight.toFixed(1)}`);

  // Try growing horizontally first
  let newWidth = location.width;
  let newHeight = location.height;
  let needsScroll = false;

  // For long content, use more horizontal space for better readability
  const isLongContent = content.length > 200;
  const minPreferredWidth = isLongContent ? Math.floor(maxWidth * 0.85) : location.width;

  // Minimum width to prevent extremely narrow text boxes (at least 150px or 30% of stage)
  const absoluteMinWidth = Math.max(150, stageWidth * 0.3);

  // Check if current width is too narrow
  if (location.width < absoluteMinWidth && estimatedCharsPerLine < 10) {
    console.log(`[SmartTextBox] ⚠️ Width too narrow (${location.width}px, ${estimatedCharsPerLine} chars/line), forcing minimum ${absoluteMinWidth}px`);
    newWidth = Math.min(absoluteMinWidth, maxWidth);
  }

  // Step 1: Ensure minimum preferred width for long content
  if (newWidth < minPreferredWidth && newWidth < maxWidth) {
    newWidth = Math.min(minPreferredWidth, maxWidth);
    console.log(`[SmartTextBox] Expanding to preferred width: ${newWidth.toFixed(1)}`);
  }

  // Height buffer for long content
  const needsHeightBuffer = content.length > 200;
  const heightBuffer = needsHeightBuffer ? 1.15 : 1.0;

  // Step 2: Check if content fits at current width, grow if needed
  if (newWidth < maxWidth) {
    for (let testWidth = newWidth; testWidth <= maxWidth; testWidth += 50) {
      const testContentWidth = testWidth - contentPadding - inlineContentWidth;
      const testCharsPerLine = Math.floor(testContentWidth / charWidth);
      const testLines = testCharsPerLine > 0 ? Math.ceil(content.length / testCharsPerLine) : 1;
      const testContentHeight = testLines * lineHeight;
      const testTotalHeight = testContentHeight + contentPadding;
      const bufferedHeight = Math.ceil(testTotalHeight * heightBuffer);

      newWidth = testWidth;

      // Calculate xOffset: split growth evenly to keep box centered
      const widthIncrease = newWidth - location.width;
      let xOffset = 0;
      if (widthIncrease > 0) {
        // Split growth evenly between left and right to maintain centering
        const halfIncrease = widthIncrease / 2;

        // Check if we can grow evenly on both sides
        if (halfIncrease <= Math.max(0, maxLeftGrowth) && halfIncrease <= Math.max(0, maxRightGrowth)) {
          // Even growth possible - shift left by half to maintain center
          xOffset = halfIncrease;
        } else {
          // Can't grow evenly - use asymmetric growth
          const leftGrowthPossible = Math.max(0, maxLeftGrowth);
          const rightGrowthPossible = Math.max(0, maxRightGrowth);

          // Distribute growth based on available space
          const leftGrowthUsed = Math.min(halfIncrease, leftGrowthPossible);
          const rightGrowthUsed = Math.min(widthIncrease - leftGrowthUsed, rightGrowthPossible);

          // xOffset is positive (shift left by this amount)
          xOffset = leftGrowthUsed;

          console.log(`[SmartTextBox] Asymmetric growth: left=${leftGrowthUsed.toFixed(1)}, right=${rightGrowthUsed.toFixed(1)}, xOffset=${xOffset.toFixed(1)}`);
        }
      }

      if (testTotalHeight <= location.height) {
        console.log(`[SmartTextBox] ✓ Fits at width=${newWidth.toFixed(1)} with original height, xOffset=${xOffset}, yOffset=0`);
        return { width: newWidth, height: location.height, needsScroll: false, xOffset, yOffset: 0 };
      }
      if (bufferedHeight <= maxHeight) {
        newHeight = Math.min(bufferedHeight, maxHeight);
        const yOffset = newHeight > maxDownwardHeight
          ? Math.min(newHeight - maxDownwardHeight, maxTopGrowth)
          : 0;
        console.log(`[SmartTextBox] ✓ Fits at ${newWidth.toFixed(1)}x${newHeight.toFixed(1)}, xOffset=${xOffset}, yOffset=${yOffset}`);
        return { width: newWidth, height: newHeight, needsScroll: false, xOffset, yOffset };
      }
    }
    newWidth = maxWidth;
  }

  // Calculate final xOffset: split growth evenly to keep box centered
  const finalWidthIncrease = newWidth - location.width;
  let finalXOffset = 0;
  if (finalWidthIncrease > 0) {
    const halfIncrease = finalWidthIncrease / 2;
    const leftGrowthPossible = Math.max(0, maxLeftGrowth);
    const rightGrowthPossible = Math.max(0, maxRightGrowth);

    // Try even split first
    if (halfIncrease <= leftGrowthPossible && halfIncrease <= rightGrowthPossible) {
      finalXOffset = halfIncrease;
    } else {
      // Asymmetric: distribute based on available space
      const leftGrowthUsed = Math.min(halfIncrease, leftGrowthPossible);
      finalXOffset = leftGrowthUsed;
    }
  }

  // Step 3: Calculate needed height at max width
  const finalContentWidth = newWidth - contentPadding - inlineContentWidth;
  const finalCharsPerLine = Math.floor(finalContentWidth / charWidth);
  const finalLines = finalCharsPerLine > 0 ? Math.ceil(content.length / finalCharsPerLine) : 1;
  const finalContentHeight = finalLines * lineHeight + contentPadding;
  const bufferedFinalHeight = Math.ceil(finalContentHeight * heightBuffer);

  if (bufferedFinalHeight <= maxHeight) {
    newHeight = bufferedFinalHeight;
    const yOffset = newHeight > maxDownwardHeight
      ? Math.min(newHeight - maxDownwardHeight, maxTopGrowth)
      : 0;
    console.log(`[SmartTextBox] ✓ Final size: ${newWidth.toFixed(1)}x${newHeight.toFixed(1)}, xOffset=${finalXOffset}, yOffset=${yOffset}`);
    return { width: newWidth, height: newHeight, needsScroll: false, xOffset: finalXOffset, yOffset };
  }

  // Step 4: Content doesn't fit - enable scrolling
  newHeight = maxHeight;
  needsScroll = true;
  const yOffset = newHeight > maxDownwardHeight
    ? Math.min(newHeight - maxDownwardHeight, maxTopGrowth)
    : 0;
  console.log(`[SmartTextBox] ⚠️ Needs scroll: ${newWidth.toFixed(1)}x${newHeight.toFixed(1)}, xOffset=${finalXOffset}, yOffset=${yOffset}`);

  return { width: newWidth, height: newHeight, needsScroll, xOffset: finalXOffset, yOffset };
}

/**
 * PositionedBeatView - React component for rendering positioned beat elements
 * 
 * This is the core rendering component used by BOTH:
 * - Preview (via ReactRenderer)
 * - Visual Editor (via VisualBeatEditor)
 * 
 * Key principle: Single source of truth for positioned element rendering
 * 
 * @packageDocumentation
 */

/** Hyperlink data for HyperText beat type */
export interface HyperlinkData {
  word: string;
  targetBeatId: string;
  style?: {
    color?: string;
    hoverColor?: string;
    underline?: boolean;
    bold?: boolean;
  };
}

/** Sprite animation definition for preview playback */
export interface SpriteAnimationData {
  name: string;
  frames: number[];
  frameDuration: number;
  loop: boolean;
}

/** Sprite sheet configuration for rendering a specific frame */
export interface SpriteSheetData {
  /** Width of each frame in pixels */
  frameWidth: number;
  /** Height of each frame in pixels */
  frameHeight: number;
  /** Default frame index to display (0-based) */
  defaultFrame?: number;
  /** Full image width (for calculating columns) */
  imageWidth?: number;
  /** Available animations for this sprite */
  animations?: SpriteAnimationData[];
  /** Currently active animation name (enables frame cycling) */
  activeAnimation?: string;
}

export interface PositionedElementData {
  location: Location;
  content: string;
  assetUrl?: string;
  /** Sprite sheet configuration for character sprites */
  spriteSheet?: SpriteSheetData;
  /** Optional action ID to return when this element is clicked (e.g., choice ID for movementChoice) */
  actionId?: string;
  /** Optional target beat ID for checking if this choice leads to a visited beat */
  targetBeatId?: string;
  /** Whether visited-choice dimming is enabled for this beat */
  markVisited?: boolean;
  /** Optional hyperlinks for HyperText beat type - words in the text that are clickable */
  hyperlinks?: HyperlinkData[];
  /** Counter meter value (for kind='meter') */
  counterValue?: number;
  counterMin?: number;
  counterMax?: number;
  /** Optional tooltip/hover description for interactive elements (e.g., pickProp items) */
  description?: string;
  /** Keypad-specific fields (for kind='keypad') */
  keypadLayout?: 'numeric' | 'phone' | 'pin';
  keypadMaxDigits?: number;
  keypadMinDigits?: number;
  keypadCorrectCode?: string;
  keypadMaxAttempts?: number;
  keypadMaskInput?: boolean;
  keypadButtonText?: string;
  keypadClearButtonText?: string;
  keypadShowDisplay?: boolean;
}

/**
 * Theme settings for rendering elements
 * Maps directly to GlobalSettings from the builder
 */
export interface RenderThemeSettings {
  /** Stage/canvas background color (used when no background image is set) */
  backgroundColor?: string;
  /** Text box styling */
  textBox: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    opacity: number;  // 0-100
    /** Hide text box background for title/author elements (VN style) */
    hideTitleTextBox?: boolean;
  };
  /** Optional textbox frame image URL (from theme assets, e.g., Ren'Py import) */
  textboxFrameUrl?: string;
  /** Button styling */
  button: {
    backgroundColor: string;
    hoverBackgroundColor: string;
    textColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
  };
  /** Optional button background image URL for normal state (from theme assets, e.g., Ren'Py import) */
  buttonNormalUrl?: string;
  /** Optional button background image URL for hover state (from theme assets, e.g., Ren'Py import) */
  buttonHoverUrl?: string;
  /** Optional button layout positioning (from Ren'Py theme import) */
  buttonLayout?: {
    /** Vertical position as fraction (0=top, 0.5=center, 1=bottom) */
    yAlign?: number;
    /** Spacing between buttons in pixels */
    spacing?: number;
    /** Fixed button width (optional) */
    width?: number;
    /** Fixed button height (optional) */
    height?: number;
  };
  /** Text colors */
  colors: {
    textColor: string;
    textAlpha: number;  // 0-100
  };
  /** Fonts */
  fonts: {
    titleFont: string;
    textFont: string;
    buttonFont: string;
    /** Font sizes from theme (optional, elements may override) */
    titleFontSize?: number;
    textFontSize?: number;
    buttonFontSize?: number;
  };
  /** Text effects (animations) */
  textEffects?: {
    animation: 'none' | 'typewriter' | 'fade';
    typewriterSpeed: number;  // Characters per second
    fadeInDuration: number;    // Milliseconds
  };
  /** Hotspot styling */
  hotspot?: {
    highlightColor: string;  // Color for hotspot fill (default yellow #ffff00)
    visible: boolean;        // Whether hotspots are visible at all
    showLabels: boolean;     // Whether to show text labels on hotspots
    opacity: number;         // Base opacity 0-1 (default 0.3)
    showInPreview: 'visible' | 'onHover' | 'invisible';  // Hotspot area visibility
    labelDisplay: 'none' | 'hover' | 'always';  // Label display mode
  };
  /** Speaker display settings */
  speakerDisplay?: {
    showNames?: boolean;                       // Master toggle: show speaker names globally
    showGraphics?: boolean;                    // Master toggle: show speaker portraits globally
    nameStyle: 'off' | 'label' | 'inline';   // Off / label above text box / bold first line inside text box
    namePosition: 'left' | 'right';           // Which side the name appears on
    nameColor?: string;                       // Custom color for inline name (default: inherit)
    graphicPosition: 'off' | 'inside-left' | 'inside-right' | 'above-left' | 'above-right';  // Portrait placement
    graphicSize?: number;                     // Portrait size in px (default 48 inside, 80 above)
  };
}

export interface PositionedBeatViewProps {
  /** Width of the stage/canvas */
  stageWidth: number;
  /** Height of the stage/canvas */
  stageHeight: number;
  /** Background image URL */
  backgroundUrl?: string | null;
  /** Background color/gradient (used if no backgroundUrl) */
  backgroundColor?: string;
  /** Array of positioned elements to render */
  elements: PositionedElementData[];
  /** Callback when an interactive element (button/hotspot) is clicked */
  onAction?: (actionId: string) => void;
  /** Whether elements should be interactive (clickable) */
  interactive?: boolean;
  /** Whether to hide text box backgrounds (show only text content) */
  hideTextBoxes?: boolean;
  /** Whether to hide button box backgrounds (show only button content) */
  hideButtonBoxes?: boolean;
  /** Theme settings for styling elements */
  theme?: RenderThemeSettings;
  /** Sound blob resolver for loading sound data from storage */
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>;
  /** Enable preview mode - auto-sizes text boxes to fit content */
  previewMode?: boolean;
  /** Array of visited beat IDs (for marking visited choices) */
  visitedBeats?: string[];
  /** Array of visited choice IDs for per-choice tracking (recursive dialogs) */
  visitedChoiceIds?: string[];
  /** Only show choice text when hovering over the hotspot (for movementChoice) */
  showTextOnHover?: boolean;
  /** Animation paths for elements (path animations) */
  animations?: AnimationPath[];
  /** Resolver function to get counter values by name (for meter elements) */
  counterResolver?: (counterName: string) => { value: number; min: number; max: number } | null;
  /** Resolver function to get meter frame data for a character (for HUD display) */
  characterMeterFrameResolver?: (characterId: string) => {
    counters: MeterCounterData[];
    config: MeterFrameConfig;
  } | null;
  /** Resolver function to get inventory data for a character (for HUD display) */
  characterInventoryResolver?: (characterId: string) => {
    items: InventoryItemData[];
    config: InventoryFrameConfig;
  } | null;
  /** Whether inventory display is visible (controlled by Ctrl/Cmd+I) */
  inventoryVisible?: boolean;
  /** Timer state for default target countdown display */
  timerState?: {
    totalTime: number;
    remainingTime: number;
    visible: boolean;
    label?: string;
  };
  /** Subscribe to timer state updates for real-time progress bar */
  onSubscribeTimerState?: (listener: (state: PositionedBeatViewProps['timerState']) => void) => () => void;
  /** Beat type for smart text box sizing (determines if there's a button) */
  beatType?: string;
  /** Editor mode - cosmetic differences only (hotspot borders, scroll badges) */
  editorMode?: boolean;
  /** Callback reporting computed element positions after collision detection + smart sizing */
  onLayoutComputed?: (positions: { name: string; id?: string; x: number; y: number; width: number; height: number }[]) => void;
  /** Timer HUD configuration from global settings */
  timerHudConfig?: import('./TimerHudDisplay').TimerHudConfig;
  /** Per-beat override text for static timer HUD mode */
  timerHudOverrideText?: string;
  /** Timer HUD time state (separate from progress bar) */
  timerHudState?: { remainingTime: number; totalTime: number };
  /** Subscribe to timer HUD state updates */
  onSubscribeTimerHudState?: (listener: (state: { remainingTime: number; totalTime: number } | undefined) => void) => () => void;
  /** Subscribe to timer HUD override text updates */
  onSubscribeTimerHudOverrideText?: (listener: (text: string | undefined) => void) => () => void;
  /** Countdown meter HUD configuration from global settings */
  countdownMeterConfig?: import('./CountdownMeterHud').CountdownMeterConfig;
  /** Current counter value for countdown meter HUD */
  countdownMeterValue?: { value: number; min: number; max: number };
  /** Per-beat flag to override default countdown meter visibility */
  overrideCountdownMeter?: boolean;
  /** Formatted fictional time text for Timer HUD */
  fictionalTimeText?: string;
  /** Subscribe to fictional time text updates */
  onSubscribeFictionalTimeText?: (listener: (text: string | undefined) => void) => () => void;
  /** Text direction for the active translation language ('ltr' or 'rtl') */
  textDirection?: 'ltr' | 'rtl';
  /** Additional Noto font families to append to font stacks for script coverage */
  notoFontFallbacks?: string[];
  /** When true, skip applying background styles (parent handles background separately) */
  externalBackground?: boolean;
  /** Mobile font scale multiplier (1.0 = normal, up to 2.0) */
  mobileFontScale?: number;
  /** Speaker name to display as a VN-style label overlay (only when showSpeaker is true) */
  speakerName?: string;
  /** Speaker portrait image URL (resolved from character portrait) */
  speakerPortraitUrl?: string;
}

/**
 * Measure text dimensions using canvas
 * Returns the width needed to fit text on a single line
 */
function measureTextWidth(text: string, fontSize: number, fontFamily: string = 'Arial'): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.length * fontSize * 0.6; // Fallback estimate
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
  const avgCharWidth = fontSize * 0.42; // Measured from actual proportional font rendering
  const charsPerLine = Math.floor(availableWidth / avgCharWidth);
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));

  return {
    width: maxWidth,
    height: lines * fontSize * lineHeight + contentPadding
  };
}

/**
 * Adjust button positions to avoid collisions with text boxes
 * Returns adjusted elements array
 *
 * IMPORTANT: This function now RESPECTS user-defined positions.
 * - Text boxes: Keep original x position, only expand width if needed
 * - Buttons: Keep original x position and width, only adjust y if colliding
 */
export function adjustElementsForCollisions(
  elements: PositionedElementData[],
  stageWidth: number,
  stageHeight: number,
  theme: RenderThemeSettings,
  calculatedButtonHeight: number = 0,
  hudBottomY: number = 0,
  beatType?: string
): PositionedElementData[] {
  const padding = theme.textBox.padding || 20;

  // Separate text and button elements
  const textElements = elements.filter(el =>
    el.location.kind === 'text' || el.location.kind === 'dialog'
  );
  const buttonElements = elements.filter(el =>
    el.location.kind === 'button'
  );
  const otherElements = elements.filter(el =>
    el.location.kind !== 'text' && el.location.kind !== 'dialog' && el.location.kind !== 'button'
  );

  console.log(`[CollisionDetect] Processing ${textElements.length} text elements, ${buttonElements.length} buttons`);

  // Calculate actual bounds for text elements
  // Use SMART-SIZED dimensions to account for text box expansion
  const textBoxBounds: { bottom: number; left: number; right: number; name: string }[] = [];
  const adjustedTextElements = textElements.map(el => {
    const width = el.location.width;
    const originalHeight = el.location.height || 50;

    let height: number;
    let effectiveX: number;
    let effectiveWidth: number;
    let yOffset = 0;

    if (el.location.manuallyResized) {
      // Manually resized: use stored dimensions directly
      height = originalHeight;
      effectiveX = el.location.x;
      effectiveWidth = width;
    } else {
      // Calculate smart dimensions to get the actual rendered height
      const fontSize = el.location.fontSize ?? theme.fonts.textFontSize ?? 16;
      const effectiveButtonHeight = calculatedButtonHeight > 0 ? calculatedButtonHeight : DEFAULT_BUTTON_HEIGHT;
      const smartDims = calculateSmartTextBoxDimensions(
        el.content || '',
        fontSize,
        { x: el.location.x, y: el.location.y, width: el.location.width, height: originalHeight },
        padding,
        effectiveButtonHeight,
        stageWidth,
        stageHeight
      );

      // Use the smart-sized dimensions and apply offsets for collision detection
      // For dynamic content beats, reduce the estimated height since we skip minHeight
      // on the actual element (height:auto sizes tighter than the buffered estimate)
      const DYNAMIC_BEATS = ['aiInfoText', 'aiDurScreen', 'aiDialogTree', 'aiSummary', 'onlineContent'];
      const isDynamic = beatType ? DYNAMIC_BEATS.includes(beatType) : false;
      height = isDynamic ? Math.round(smartDims.height / 1.15) : smartDims.height;
      effectiveX = el.location.x + (smartDims.xOffset || 0);
      effectiveWidth = smartDims.width;
      yOffset = isDynamic ? 0 : (smartDims.yOffset || 0);
    }

    // Calculate bounds using smart-sized dimensions (account for upward growth via yOffset)
    const effectiveY = el.location.y - yOffset;
    const bottom = effectiveY + height;
    const left = effectiveX;
    const right = effectiveX + effectiveWidth;
    textBoxBounds.push({ bottom, left, right, name: el.location.name });

    console.log(`[CollisionDetect] Text "${el.location.name}": original(${el.location.x},${el.location.y},${el.location.width}x${originalHeight}) → smart(${effectiveX},${el.location.y},${effectiveWidth}x${height}), bottom=${bottom}, hudBottomY=${hudBottomY}`);

    // Shift text down if it overlaps with HUD overlays at the top
    if (hudBottomY > 0 && el.location.y < hudBottomY) {
      const shiftedY = hudBottomY;
      const shiftedBottom = shiftedY + height;
      // Update bounds with shifted position
      textBoxBounds[textBoxBounds.length - 1].bottom = shiftedBottom;
      console.log(`[CollisionDetect] Text "${el.location.name}": shifted down from y=${el.location.y} to y=${shiftedY} to avoid HUD overlap`);
      return {
        ...el,
        location: {
          ...el.location,
          y: shiftedY,
        },
      };
    }

    // Return element unchanged - respect user positions
    return el;
  });

  if (buttonElements.length === 0) {
    return [...otherElements, ...adjustedTextElements];
  }

  // For endScreen, endScreenCredits, and aiSummary: respect user-positioned button layout
  // These beats have action buttons (restart, credits) that users position intentionally
  // Only do minimal collision avoidance with text, don't force vertical stacking
  const preserveButtonLayout = beatType === 'endScreen' || beatType === 'endScreenCredits' || beatType === 'aiSummary';

  if (preserveButtonLayout) {
    // Only push buttons down if they overlap text boxes, keep X and relative Y intact
    const adjustedButtonElements = buttonElements.map(el => {
      let newY = el.location.y;
      const buttonTop = el.location.y;
      const overlapsText = textBoxBounds.some(tb => buttonTop < tb.bottom + 10);
      if (overlapsText) {
        const lowestTextBottom = Math.max(...textBoxBounds.map(b => b.bottom));
        newY = Math.max(el.location.y, lowestTextBottom + 35);
      }
      if (newY !== el.location.y) {
        return { ...el, location: { ...el.location, y: newY } };
      }
      return el;
    });
    return [...otherElements, ...adjustedTextElements, ...adjustedButtonElements];
  }

  // Process buttons - align all buttons into a vertical list
  // Dialog choices should form a clean column, not be scattered across the stage
  const sortedButtons = [...buttonElements].sort((a, b) => a.location.y - b.location.y);
  const adjustedButtonElements: PositionedElementData[] = [];

  // For multiple buttons (dialog choices), align them all to a consistent position
  // Use the rightmost button's X position, or center if very different positions
  const buttonXPositions = sortedButtons.map(b => b.location.x);
  const buttonWidths = sortedButtons.map(b => b.location.width);
  const maxButtonWidth = Math.max(...buttonWidths);

  // Calculate target X: use rightmost position if buttons are scattered,
  // otherwise keep original positions
  const minX = Math.min(...buttonXPositions);
  const maxX = Math.max(...buttonXPositions);
  const xSpread = maxX - minX;

  // If buttons are spread across more than 100px horizontally, align them
  const shouldAlignButtons = sortedButtons.length > 1 && xSpread > 100;
  // Target X: right-align buttons to fit on stage, with margin
  const targetX = shouldAlignButtons
    ? Math.min(maxX, stageWidth - maxButtonWidth - 20)
    : -1; // -1 means keep original X

  console.log(`[CollisionDetect] Button alignment: spread=${xSpread}px, shouldAlign=${shouldAlignButtons}, targetX=${targetX}`);

  // Find the lowest point of all text boxes to start buttons below
  const lowestTextBottom = textBoxBounds.length > 0
    ? Math.max(...textBoxBounds.map(b => b.bottom))
    : 0;

  // Stack buttons vertically starting below all text
  let nextY = lowestTextBottom + 35; // Start below text with gap

  // Helper to estimate button height based on text content and width
  // Uses same calculations as calculateSmartButtonDimensions for consistency
  const estimateButtonHeight = (text: string, width: number, fontSize: number): number => {
    const buttonPaddingV = 12; // Vertical padding per side
    const buttonPaddingH = 20; // Horizontal padding per side
    const charWidth = fontSize * 0.6; // Same as calculateSmartButtonDimensions
    const lineHeight = fontSize * 1.4; // Same as calculateSmartButtonDimensions
    const contentPaddingH = buttonPaddingH * 2;
    const contentPaddingV = buttonPaddingV * 2;
    const availableContentWidth = width - contentPaddingH;
    const charsPerLine = Math.max(1, Math.floor(availableContentWidth / charWidth));
    const linesNeeded = Math.max(1, Math.ceil(text.length / charsPerLine));
    const heightNeeded = linesNeeded * lineHeight + contentPaddingV;
    return heightNeeded;
  };

  for (const el of sortedButtons) {
    const buttonWidth = el.location.width || 300;
    const fontSize = el.location.fontSize ?? theme.fonts.buttonFontSize ?? 16;
    const buttonText = el.content || el.location.name || '';

    // Calculate actual button height based on text wrapping
    const estimatedHeight = estimateButtonHeight(buttonText, buttonWidth, fontSize);
    const buttonHeight = Math.max(el.location.height || 42, estimatedHeight);

    // Determine X position - only align if buttons are very scattered
    const newX = shouldAlignButtons ? targetX : el.location.x;

    // Determine Y position - prevent overlap with BOTH text AND other buttons
    let newY = el.location.y;

    // Check if button's top overlaps any text box's bottom
    const buttonTop = el.location.y;
    const overlapsText = textBoxBounds.some(tb => buttonTop < tb.bottom + 10);

    if (overlapsText && buttonTop < lowestTextBottom + 10) {
      // Button overlaps text - push it down below all text
      newY = Math.max(nextY, lowestTextBottom + 35);
    } else if (buttonTop < nextY) {
      // Button doesn't overlap text but would overlap previous button - stack below
      newY = nextY;
    }

    // Track cumulative stacking position for ALL subsequent buttons
    nextY = newY + buttonHeight + 15;

    console.log(`[CollisionDetect] Button "${el.location.name}": original(${el.location.x},${el.location.y}) → adjusted(${newX},${newY}), overlapsText=${overlapsText}`);

    // Create adjusted element
    const positionChanged = newX !== el.location.x || newY !== el.location.y;
    if (positionChanged) {
      adjustedButtonElements.push({
        ...el,
        location: {
          ...el.location,
          x: newX,
          y: newY
        }
      });
    } else {
      adjustedButtonElements.push(el);
    }
  }

  return [...otherElements, ...adjustedTextElements, ...adjustedButtonElements];
}

/**
 * Compute the font size that TextElement/DialogElement will use for rendering.
 * Used by onLayoutComputed callback to pre-compute smart dimensions at PBV level.
 */
function computeRenderedFontSize(
  location: Location,
  content: string,
  theme: RenderThemeSettings
): number {
  if (location.fontSize !== undefined) return location.fontSize;

  if (location.kind === 'dialog') {
    return theme.fonts.textFontSize ?? 18;
  }

  // TextElement logic
  const isTitleElement = location.name?.toLowerCase().includes('title') || location.name?.toLowerCase().includes('author');
  if (isTitleElement && theme.fonts.titleFontSize) return theme.fonts.titleFontSize;
  if (!isTitleElement && theme.fonts.textFontSize) return theme.fonts.textFontSize;

  const contentLength = content?.length || 0;
  if (contentLength > 400) return 11;
  if (contentLength > 200) return 12;
  if (contentLength > 80) return 14;
  if (contentLength < 30) return 36;
  return 16;
}

/**
 * Compute the padding that TextElement/DialogElement will use for smart sizing.
 */
function computeRenderedPadding(location: Location, theme: RenderThemeSettings): number {
  if (location.kind === 'dialog') {
    const paddingH = Math.max(Math.floor(location.width * 0.04), 12);
    const paddingV = Math.max(Math.floor(location.height * 0.1), 12);
    return Math.max(paddingH, paddingV);
  }
  return theme.textBox.padding || 20;
}

// Beat types that have continue buttons (need to reserve space at bottom)
const BUTTON_BEAT_TYPES = ['infoText', 'endScreen', 'aiSummary', 'aiInfoText', 'onlineContent', 'titleScreen', 'inputText'];
// Beat types without buttons (durScreen, aiDurScreen) - can use full height
const NO_BUTTON_BEAT_TYPES = ['durScreen', 'aiDurScreen'];

// Default theme to use if none provided (matches Visual Novel preset style)
const DEFAULT_THEME: RenderThemeSettings = {
  textBox: {
    backgroundColor: '#16213e',  // Dark blue surface
    borderColor: '#4a90d9',      // Blue border
    borderWidth: 2,
    borderRadius: 8,
    padding: 20,
    opacity: 90,
    hideTitleTextBox: false,     // Default: show text boxes for title/author
  },
  button: {
    backgroundColor: '#0f3460',       // Dark blue button
    hoverBackgroundColor: '#1a4a7a',  // Lighter on hover
    textColor: '#ffffff',             // White text
    borderColor: '#4a90d9',           // Blue border
    borderWidth: 1,
    borderRadius: 4,
  },
  colors: {
    textColor: '#ffffff',  // White text
    textAlpha: 100,
  },
  fonts: {
    titleFont: 'serif',
    textFont: 'sans-serif',
    buttonFont: 'sans-serif',
    titleFontSize: 48,
    textFontSize: 18,
    buttonFontSize: 18,
  },
  hotspot: {
    highlightColor: '#ffff00',  // Yellow highlight color (default)
    visible: true,
    showLabels: true,
    opacity: 0.3,  // Default 30% opacity (normalized 0-1)
    showInPreview: 'visible',  // Default: always show hotspot area
    labelDisplay: 'hover',  // Default: show labels as tooltips on hover
  },
};

/**
 * Main positioned beat view component
 */
export const PositionedBeatView: React.FC<PositionedBeatViewProps> = ({
  stageWidth,
  stageHeight,
  backgroundUrl,
  backgroundColor = 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
  elements,
  onAction,
  interactive = true,
  hideTextBoxes = false,
  hideButtonBoxes = false,
  theme = DEFAULT_THEME,
  previewMode = false,
  visitedBeats = [],
  visitedChoiceIds = [],
  showTextOnHover = false,
  soundBlobResolver,
  animations = [],
  counterResolver,
  characterMeterFrameResolver,
  characterInventoryResolver,
  inventoryVisible = false,
  timerState: initialTimerState,
  onSubscribeTimerState,
  beatType,
  editorMode = false,
  onLayoutComputed,
  timerHudConfig,
  timerHudOverrideText: initialTimerHudOverrideText,
  timerHudState: initialTimerHudState,
  onSubscribeTimerHudState,
  onSubscribeTimerHudOverrideText,
  countdownMeterConfig,
  countdownMeterValue,
  overrideCountdownMeter,
  fictionalTimeText: initialFictionalTimeText,
  onSubscribeFictionalTimeText,
  textDirection,
  notoFontFallbacks,
  externalBackground = false,
  mobileFontScale = 1.0,
  speakerName,
  speakerPortraitUrl,
}) => {
  // State to manage input text value (for InputText beats)
  const [inputValue, setInputValue] = React.useState('');

  // Reset inputValue when the beat changes or input element's content (prompt) changes.
  // If the content looks like a resolved variable (non-empty, not a raw ${...} reference),
  // pre-populate the input with it so users can edit an existing value.
  const inputElement = elements.find(el => el.location.name.toLowerCase().includes('input'));
  const inputPrompt = inputElement?.content;
  const inputResetKey = elements.map(el => `${el.location.name}:${el.content?.substring(0, 20)}`).join('|');
  React.useEffect(() => {
    const content = inputPrompt || '';
    // If content is non-empty and doesn't look like an unresolved variable reference,
    // use it as the initial editable value (e.g., resolved ${order_content})
    if (content && !content.startsWith('${') && !content.startsWith('$') && content.trim().length > 0) {
      setInputValue(content);
    } else {
      setInputValue('');
    }
  }, [inputPrompt, inputResetKey]);

  // State for timer - subscribes to updates for real-time progress bar animation
  const [timerState, setTimerState] = React.useState(initialTimerState);

  React.useEffect(() => {
    if (onSubscribeTimerState) {
      const unsubscribe = onSubscribeTimerState(setTimerState);
      return unsubscribe;
    }
  }, [onSubscribeTimerState]);

  // State for timer HUD - separate from progress bar timer
  const [timerHudTime, setTimerHudTime] = React.useState(initialTimerHudState);

  React.useEffect(() => {
    if (onSubscribeTimerHudState) {
      const unsubscribe = onSubscribeTimerHudState(setTimerHudTime);
      return unsubscribe;
    }
  }, [onSubscribeTimerHudState]);

  // Sync timer HUD state from props when no subscriber (e.g. VE editor mode)
  React.useEffect(() => {
    if (!onSubscribeTimerHudState) {
      setTimerHudTime(initialTimerHudState);
    }
  }, [initialTimerHudState, onSubscribeTimerHudState]);

  // State for timer HUD override text - subscribes to updates for per-beat text changes
  const [timerHudOverrideText, setTimerHudOverrideText] = React.useState(initialTimerHudOverrideText);

  React.useEffect(() => {
    if (onSubscribeTimerHudOverrideText) {
      const unsubscribe = onSubscribeTimerHudOverrideText(setTimerHudOverrideText);
      return unsubscribe;
    }
  }, [onSubscribeTimerHudOverrideText]);

  // Sync override text from props when no subscriber
  React.useEffect(() => {
    if (!onSubscribeTimerHudOverrideText) {
      setTimerHudOverrideText(initialTimerHudOverrideText);
    }
  }, [initialTimerHudOverrideText, onSubscribeTimerHudOverrideText]);

  // State for fictional time text - subscribes to updates
  const [fictionalTimeText, setFictionalTimeText] = React.useState(initialFictionalTimeText);

  React.useEffect(() => {
    if (onSubscribeFictionalTimeText) {
      const unsubscribe = onSubscribeFictionalTimeText(setFictionalTimeText);
      return unsubscribe;
    }
  }, [onSubscribeFictionalTimeText]);

  // Sync fictional time text from props when no subscriber
  React.useEffect(() => {
    if (!onSubscribeFictionalTimeText) {
      setFictionalTimeText(initialFictionalTimeText);
    }
  }, [initialFictionalTimeText, onSubscribeFictionalTimeText]);

  // Animation state for button fade-in after text animation completes
  const [animationsComplete, setAnimationsComplete] = React.useState(false);

  // Scroll-to-bottom tracking for scroll-lock feature
  // Tracks which elements requiring scroll-to-bottom have been scrolled
  const [scrolledElementIds, setScrolledElementIds] = React.useState<Set<string>>(new Set());

  // Reset scroll tracking when beat changes (elements change)
  React.useEffect(() => {
    setScrolledElementIds(new Set());
  }, [elements]);

  // Callback for when an element is scrolled to bottom
  const handleElementScrolledToBottom = React.useCallback((elementId: string) => {
    setScrolledElementIds(prev => {
      const next = new Set(prev);
      next.add(elementId);
      return next;
    });
  }, []);

  // Check if all elements requiring scroll have been scrolled
  const elementsRequiringScroll = elements.filter(el => el.location.requireScrollToBottom);
  const allScrollRequirementsMet = elementsRequiringScroll.length === 0 ||
    elementsRequiringScroll.every(el => {
      const elementId = el.location.id || el.location.name;
      return scrolledElementIds.has(elementId);
    });

  // State for tracking path animation positions
  // Maps elementId to current animated position/transform including sprite animation state
  const [animatedPositions, setAnimatedPositions] = React.useState<
    Record<string, { x: number; y: number; scale?: number; rotation?: number; opacity?: number; flipX?: boolean; flipY?: boolean; spriteAnimation?: string; spriteFrames?: number[]; spriteFrameDuration?: number; isAnimating?: boolean }>
  >({});

  // Track which animations have been started (by animation id)
  const startedAnimationsRef = React.useRef<Set<string>>(new Set());
  // Track the previous animations key to detect actual changes
  const prevAnimationsKeyRef = React.useRef<string>('');

  // Create a stable key for animations to detect actual content changes
  // This prevents animation restart when array reference changes but content is same
  const animationsKey = React.useMemo(() => {
    if (!animations || animations.length === 0) return '';
    return animations.map(a => `${a.id}:${a.elementId}:${a.waypoints.length}`).join('|');
  }, [animations]);

  // Create a stable key for elements to detect beat changes
  // When elements change (new beat), we need to reset animated positions
  const elementsKey = React.useMemo(() => {
    return elements.map(e => `${e.location.name}:${e.location.kind}`).join('|');
  }, [elements]);
  const prevElementsKeyRef = React.useRef<string>('');

  // Reset animated positions when beat changes (elements change)
  React.useEffect(() => {
    if (prevElementsKeyRef.current !== elementsKey) {
      // Beat changed - reset all animated positions so scale/rotation/opacity reset to defaults
      setAnimatedPositions({});
      startedAnimationsRef.current.clear();
      prevElementsKeyRef.current = elementsKey;
    }
  }, [elementsKey]);

  // Path animation management effect
  React.useEffect(() => {
    if (!animations || animations.length === 0) {
      return;
    }

    const animationManager = getAnimationManager();

    // Check if animations actually changed (not just array reference)
    const animationsChanged = prevAnimationsKeyRef.current !== animationsKey;
    if (animationsChanged) {
      // Clear old state for new animations
      startedAnimationsRef.current.clear();
      setAnimatedPositions({});
      prevAnimationsKeyRef.current = animationsKey;
    }

    // Start animations that should auto-play on load
    animations.forEach((animation) => {
      // Only start if not already started and has onLoad trigger (or no trigger = default to onLoad)
      // Don't auto-start onClick or onVariable triggered animations - they wait for their trigger
      const alreadyStarted = startedAnimationsRef.current.has(animation.id);
      const isOnLoadTrigger = animation.trigger === 'onLoad' || !animation.trigger;
      const shouldStart = isOnLoadTrigger && !alreadyStarted;

      if (shouldStart) {
        startedAnimationsRef.current.add(animation.id);

        animationManager.play(animation.id, animation, {
          onUpdate: (state: AnimationState) => {
            // Update position for this element (using animation.elementId which is the stable element name)
            // Include sprite animation state so correct animation plays per segment
            setAnimatedPositions(prev => ({
              ...prev,
              [animation.elementId]: {
                x: state.currentPosition.x,
                y: state.currentPosition.y,
                scale: state.currentTransform?.scale,
                rotation: state.currentTransform?.rotation,
                opacity: state.currentTransform?.opacity,
                flipX: state.currentTransform?.flipX,
                flipY: state.currentTransform?.flipY,
                spriteAnimation: state.currentTransform?.spriteAnimation,
                spriteFrames: state.currentTransform?.spriteFrames,
                spriteFrameDuration: state.currentTransform?.spriteFrameDuration,
                isAnimating: true, // Animation is in progress
              }
            }));
          },
          onComplete: () => {
            // Animation finished - stop sprite animation but keep final position
            setAnimatedPositions(prev => ({
              ...prev,
              [animation.elementId]: {
                ...prev[animation.elementId],
                spriteAnimation: undefined, // Stop sprite animation
                spriteFrames: undefined,
                spriteFrameDuration: undefined,
                isAnimating: false, // Animation complete
              }
            }));
          }
        });
      }
    });

    // Cleanup on unmount
    return () => {
      animations.forEach((animation) => {
        animationManager.stop(animation.id);
      });
    };
     
  }, [animationsKey]); // Use stable key to prevent restarts on array reference changes

  // Helper to get animated position for an element
  // Prioritizes name (stable across save/reload) over id (dynamic)
  const getAnimatedPosition = React.useCallback((elementId: string, elementName?: string) => {
    // Try name first (animations use stable element names)
    if (elementName && animatedPositions[elementName]) {
      return animatedPositions[elementName];
    }
    // Fall back to id for backward compatibility
    if (animatedPositions[elementId]) {
      return animatedPositions[elementId];
    }
    return undefined;
  }, [animatedPositions]);

  // Check if an element has pending onClick animations (not yet triggered)
  // This is used to suppress idle sprite animations until the onClick trigger fires
  const hasPendingClickAnimation = React.useCallback((elementId: string, elementName?: string): boolean => {
    if (!animations) return false;

    // Find onClick animations that target this element (animate this element when something is clicked)
    const pendingAnimations = animations.filter(a => {
      if (a.trigger !== 'onClick') return false;

      // Check if this animation animates the given element
      return (elementName && a.elementId === elementName) || a.elementId === elementId;
    });

    if (pendingAnimations.length === 0) return false;

    // Check if any of these animations have already started (animatedPositions has entry with isAnimating or completed)
    const animatedPos = getAnimatedPosition(elementId, elementName);
    // If we have animatedPosition, the animation has been triggered (either running or completed)
    // If animatedPosition is undefined, the animation is still pending
    return !animatedPos;
  }, [animations, getAnimatedPosition]);

  // Handler to trigger onClick animations for an element
  // Returns a Promise that resolves when all animations complete (or immediately if no animations)
  // Animations use stable element names for targeting
  const triggerClickAnimation = React.useCallback((elementId: string, elementName?: string): Promise<void> => {
    if (!animations) return Promise.resolve();

    // Find animations triggered by clicking this element
    // If animation has triggerElementId, use that; otherwise fall back to elementId (animate element itself)
    const clickAnimations = animations.filter(a => {
      if (a.trigger !== 'onClick') return false;

      // Determine which element triggers this animation
      const triggerElement = a.triggerElementId || a.elementId;

      // Match by name (stable) or id (fallback for backward compatibility)
      return (elementName && triggerElement === elementName) || triggerElement === elementId;
    });

    if (clickAnimations.length === 0) {
      return Promise.resolve();
    }

    console.log(`[triggerClickAnimation] Found ${clickAnimations.length} onClick animations for element:`, elementName || elementId);

    const animationManager = getAnimationManager();

    // Create a promise for each animation that resolves when it completes
    const animationPromises = clickAnimations.map((animation) => {
      return new Promise<void>((resolve) => {
        animationManager.play(animation.id, animation, {
          onUpdate: (state: AnimationState) => {
            setAnimatedPositions(prev => ({
              ...prev,
              [animation.elementId]: {
                x: state.currentPosition.x,
                y: state.currentPosition.y,
                scale: state.currentTransform?.scale,
                rotation: state.currentTransform?.rotation,
                opacity: state.currentTransform?.opacity,
                flipX: state.currentTransform?.flipX,
                flipY: state.currentTransform?.flipY,
                spriteAnimation: state.currentTransform?.spriteAnimation,
                spriteFrames: state.currentTransform?.spriteFrames,
                spriteFrameDuration: state.currentTransform?.spriteFrameDuration,
                isAnimating: true,
              }
            }));
          },
          onComplete: () => {
            console.log(`[triggerClickAnimation] Animation completed for:`, animation.elementId);
            setAnimatedPositions(prev => ({
              ...prev,
              [animation.elementId]: {
                ...prev[animation.elementId],
                spriteAnimation: undefined,
                spriteFrames: undefined,
                spriteFrameDuration: undefined,
                isAnimating: false,
              }
            }));
            resolve();
          }
        });
      });
    });

    // Return a promise that resolves when all animations complete
    return Promise.all(animationPromises).then(() => {
      console.log(`[triggerClickAnimation] All animations complete for:`, elementName || elementId);
    });
  }, [animations]);
  const [skipAnimation, setSkipAnimation] = React.useState(false);
  const animationCompleteCountRef = React.useRef(0);
  const totalTextElementsRef = React.useRef(0);
  const prevElementsRef = React.useRef<PositionedElementData[] | null>(null);

  // Track if elements changed this render - if so, force animations to incomplete
  // This prevents the flash where button appears briefly then disappears when changing beats
  const elementsChanged = prevElementsRef.current !== null && prevElementsRef.current !== elements;
  if (elementsChanged) {
    animationCompleteCountRef.current = 0;
  }
  prevElementsRef.current = elements;

  // The effective animation complete state - false if elements just changed
  const effectiveAnimationsComplete = elementsChanged ? false : animationsComplete;
  const effectiveSkipAnimation = elementsChanged ? false : skipAnimation;

  // Reset the actual state after render (for subsequent renders)
  React.useEffect(() => {
    if (elementsChanged) {
      setAnimationsComplete(false);
      setSkipAnimation(false);
    }
  }, [elements, elementsChanged]);

  // Handler to track individual animation completions
  const handleAnimationComplete = React.useCallback(() => {
    animationCompleteCountRef.current += 1;
    if (animationCompleteCountRef.current >= totalTextElementsRef.current) {
      setAnimationsComplete(true);
    }
  }, []);

  // Handler to skip all animations (triggered by clicking during animation)
  const handleSkipAnimations = React.useCallback(() => {
    if (!effectiveAnimationsComplete) {
      setSkipAnimation(true);
      setAnimationsComplete(true);
    }
  }, [effectiveAnimationsComplete]);

  // Check if this beat has an input field (indicates it's an InputText beat)
  // Check for elements with 'input' in the name regardless of kind
  const hasInputField = elements.some(el =>
    el.location.name.toLowerCase().includes('input')
  );

  // Wrapped onAction that passes input value for submit buttons in InputText beats
  const handleAction = (actionId: string) => {
    if (onAction) {
      // If this beat has an input field, pass the input value; otherwise pass actionId
      onAction(hasInputField ? inputValue : actionId);
    }
  };

  // Build container style without mixing shorthand and individual properties
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${stageWidth}px`,
    height: `${stageHeight}px`,
    overflow: 'hidden',
  };

  // Apply background styles based on whether we have a background image
  // When externalBackground is true, parent handles the background (cover mode Layer 0)
  if (externalBackground) {
    containerStyle.background = 'transparent';
  } else if (backgroundUrl) {
    containerStyle.backgroundImage = `url(${backgroundUrl})`;
    // Panorama: stretch full image so layout positions map to full image extent
    containerStyle.backgroundSize = beatType === 'panorama' ? '100% 100%' : 'cover';
    containerStyle.backgroundPosition = 'center';
    containerStyle.backgroundRepeat = 'no-repeat';
  } else {
    containerStyle.background = backgroundColor;
  }

  // In preview mode, use a flex layout for text and buttons to auto-flow
  if (previewMode) {
    // Separate elements by type
    const textElements = elements.filter(el =>
      el.location.kind === 'text' || el.location.kind === 'dialog'
    );
    const buttonElements = elements.filter(el =>
      el.location.kind === 'button'
    );
    const otherElements = elements.filter(el =>
      el.location.kind !== 'text' && el.location.kind !== 'dialog' && el.location.kind !== 'button'
    );

    // Calculate button heights first (so text elements know how much space to reserve)
    let previewMaxButtonHeight = 0;
    for (const btnEl of buttonElements) {
      const btnFontSize = btnEl.location.fontSize ?? theme.fonts.buttonFontSize ?? 16;
      const btnPaddingH = 16;
      const btnPaddingV = 10;
      const btnDims = calculateSmartButtonDimensions(
        btnEl.content || '',
        btnFontSize,
        { x: btnEl.location.x, y: btnEl.location.y, width: btnEl.location.width, height: btnEl.location.height },
        btnPaddingH,
        btnPaddingV,
        stageWidth,
        stageHeight
      );
      if (btnDims.height > previewMaxButtonHeight) {
        previewMaxButtonHeight = btnDims.height;
      }
    }
    const previewCalculatedButtonHeight = previewMaxButtonHeight > 0 ? previewMaxButtonHeight : DEFAULT_BUTTON_HEIGHT;

    // Sort text elements for animation sequencing: title first, then author, then others
    const sortedTextElements = [...textElements].sort((a, b) => {
      const aName = a.location.name?.toLowerCase() || '';
      const bName = b.location.name?.toLowerCase() || '';

      // Title comes first (but not "titleScreen" - just "title")
      const aIsTitle = aName.includes('title') && !aName.includes('screen');
      const bIsTitle = bName.includes('title') && !bName.includes('screen');
      if (aIsTitle && !bIsTitle) return -1;
      if (!aIsTitle && bIsTitle) return 1;

      // Author comes second
      const aIsAuthor = aName.includes('author');
      const bIsAuthor = bName.includes('author');
      if (aIsAuthor && !bIsAuthor) return -1;
      if (!aIsAuthor && bIsAuthor) return 1;

      return 0;
    });

    // Calculate animation delays for sequenced typewriter effect
    const animation = theme.textEffects?.animation || 'none';
    const speed = theme.textEffects?.typewriterSpeed || 30;
    const msPerChar = 1000 / speed;
    const bufferMs = 300; // Small pause between animations

    const animationDelays: number[] = [];
    let cumulativeDelay = 0;

    for (const element of sortedTextElements) {
      animationDelays.push(cumulativeDelay);
      if (animation === 'typewriter') {
        // Next element starts after this one finishes + buffer
        const elementDuration = (element.content?.length || 0) * msPerChar + bufferMs;
        cumulativeDelay += elementDuration;
      }
    }

    // Track total text elements for animation completion
    totalTextElementsRef.current = sortedTextElements.length;

    // If no text elements or no animation, buttons should show immediately
    const shouldShowButtons = effectiveAnimationsComplete || animation === 'none' || sortedTextElements.length === 0;

    return (
      <div
        style={containerStyle}
        onClick={!effectiveAnimationsComplete && animation === 'typewriter' ? handleSkipAnimations : undefined}
      >
        {/* Render other elements (characters, props) with absolute positioning */}
        {otherElements.map((element, index) => (
          <PositionedElement
            key={`other-${index}-${element.location.name}`}
            element={element}
            index={index}
            onAction={handleAction}
            interactive={interactive}
            inputValue={inputValue}
            setInputValue={setInputValue}
            hideTextBoxes={hideTextBoxes}
            hideButtonBoxes={hideButtonBoxes}
            theme={theme}
            previewMode={false} // Keep absolute for assets
            visitedBeats={visitedBeats}
            visitedChoiceIds={visitedChoiceIds}
            showTextOnHover={showTextOnHover}
            animatedPosition={getAnimatedPosition(element.location.id || element.location.name, element.location.name)}
            onTriggerClickAnimation={() => triggerClickAnimation(element.location.id || element.location.name, element.location.name)}
            hasPendingClickAnimation={hasPendingClickAnimation(element.location.id || element.location.name, element.location.name)}
            characterMeterFrameResolver={characterMeterFrameResolver}
            characterInventoryResolver={characterInventoryResolver}
            inventoryVisible={inventoryVisible}
            containerDimensions={{ width: stageWidth, height: stageHeight }}
            beatType={beatType}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            calculatedButtonHeight={previewCalculatedButtonHeight}
            editorMode={editorMode}
            mobileFontScale={mobileFontScale}
          />
        ))}

        {/* Speaker name label overlay (VN-style) in preview mode */}
        {speakerName && theme.speakerDisplay?.nameStyle === 'label' && (() => {
          const namePos = theme.speakerDisplay?.namePosition ?? 'left';
          const isLeft = textDirection === 'rtl' ? namePos === 'right' : namePos === 'left';
          // Position label just above and aligned with first text element
          const firstTextEl = sortedTextElements[0];
          const firstTextY = firstTextEl?.location.y;
          const firstTextX = firstTextEl?.location.x;
          const firstTextW = firstTextEl?.location.width;
          const labelTop = firstTextY != null ? Math.max(firstTextY - Math.round(28 * mobileFontScale), 4) : 12;
          const labelLeft = isLeft
            ? (firstTextX != null ? firstTextX + 8 : 16)
            : undefined;
          const labelRight = !isLeft
            ? (firstTextX != null && firstTextW != null ? stageWidth - (firstTextX + firstTextW) + 8 : 16)
            : undefined;
          return (
          <div
            style={{
              position: 'absolute',
              top: labelTop,
              left: labelLeft,
              right: labelRight,
              zIndex: 200,
              background: 'rgba(0, 0, 0, 0.65)',
              color: '#f0f0f0',
              padding: '4px 14px',
              borderRadius: 6,
              fontSize: Math.round(16 * mobileFontScale),
              fontFamily: theme.fonts?.titleFont ? getFontFamily(theme.fonts.titleFont) : 'inherit',
              fontWeight: 600,
              letterSpacing: '0.02em',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {speakerName}
          </div>
          );
        })()}

        {/* Speaker portrait above text box — flush on top, aligned with text box edges */}
        {speakerName && speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'above-left' || theme.speakerDisplay?.graphicPosition === 'above-right') && (() => {
          const isLeft = theme.speakerDisplay?.graphicPosition === 'above-left';
          const size = theme.speakerDisplay?.graphicSize ?? 80;
          const firstEl = sortedTextElements[0];
          const firstTextY = firstEl?.location.y;
          const firstTextX = firstEl?.location.x;
          const firstTextW = firstEl?.location.width;
          const portraitTop = firstTextY != null ? Math.max(firstTextY - size, 0) : 0;
          const portraitLeft = isLeft
            ? (firstTextX != null ? firstTextX + 8 : 16)
            : undefined;
          const portraitRight = !isLeft
            ? (firstTextX != null && firstTextW != null ? stageWidth - (firstTextX + firstTextW) + 8 : 16)
            : undefined;
          return (
            <img
              src={speakerPortraitUrl}
              alt={speakerName}
              style={{
                position: 'absolute',
                top: portraitTop,
                left: portraitLeft,
                right: portraitRight,
                width: size,
                height: size,
                objectFit: 'cover',
                borderRadius: 8,
                zIndex: 200,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
              }}
            />
          );
        })()}

        {/* Flex container for text and buttons */}
        <div style={{
          position: 'absolute',
          top: sortedTextElements[0]?.location.y || 50,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          padding: '0 20px',
        }}>
          {/* Text elements with sequenced animation */}
          {sortedTextElements.map((element, index) => {
            // For long content (like AI-generated text), use wider width
            const contentLength = element.content?.length || 0;
            const isLongContent = contentLength > 150;
            const isVeryLongContent = contentLength > 300;
            // Use 90% width for very long content, 80% for long, otherwise use location width
            const effectiveWidth = isVeryLongContent ? '90%' : isLongContent ? '80%' : `${Math.min(element.location.width, stageWidth * 0.9)}px`;

            return (
            <div
              key={`text-${index}-${element.location.name}`}
              style={{
                width: effectiveWidth,
                maxWidth: '90%',
              }}
            >
              <FlexTextElement
                element={element}
                hideTextBox={hideTextBoxes}
                theme={theme}
                onAction={handleAction}
                animationDelay={animationDelays[index] || 0}
                onAnimationComplete={handleAnimationComplete}
                skipAnimation={effectiveSkipAnimation}
                mobileFontScale={mobileFontScale}
                speakerName={index === 0 ? speakerName : undefined}
                speakerPortraitUrl={index === 0 ? speakerPortraitUrl : undefined}
              />
            </div>
            );
          })}

          {/* Buttons in a row - fade in after animation completes */}
          {buttonElements.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.buttonLayout?.spacing !== undefined ? `${theme.buttonLayout.spacing}px` : '16px',
              justifyContent: 'center',
              width: '100%',
              maxWidth: '100%',
              overflow: 'hidden',
              opacity: shouldShowButtons ? 1 : 0,
              transition: 'opacity 300ms ease-in',
              pointerEvents: shouldShowButtons ? 'auto' : 'none',
            }}>
              {buttonElements.map((element, index) => {
                // Check if this button leads to a visited beat or is a visited choice
                // Only apply visited styling when markVisited is enabled for the beat
                const isButtonVisited = element.markVisited
                  ? beatType === 'dialogTree'
                    ? (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
                    : (element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false) ||
                      (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
                  : false;
                return (
                  <FlexButtonElement
                    key={`btn-${index}-${element.location.name}`}
                    element={element}
                    onAction={handleAction}
                    interactive={interactive && shouldShowButtons}
                    hideButtonBox={hideButtonBoxes}
                    theme={theme}
                    isVisited={isButtonVisited}
                    soundBlobResolver={soundBlobResolver}
                    stageWidth={stageWidth}
                    buttonCount={buttonElements.length}
                    mobileFontScale={mobileFontScale}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Non-preview mode: use absolute positioning for all elements

  // Calculate button heights FIRST (needed for collision detection to know how much space buttons need)
  const buttonElements = elements.filter(el => el.location.kind === 'button');
  let maxButtonHeight = 0;
  for (const btnEl of buttonElements) {
    const btnFontSize = btnEl.location.fontSize ?? theme.fonts.buttonFontSize ?? 16;
    const btnPaddingH = 16;
    const btnPaddingV = 10;
    const btnDims = calculateSmartButtonDimensions(
      btnEl.content || '',
      btnFontSize,
      { x: btnEl.location.x, y: btnEl.location.y, width: btnEl.location.width, height: btnEl.location.height },
      btnPaddingH,
      btnPaddingV,
      stageWidth,
      stageHeight
    );
    if (btnDims.height > maxButtonHeight) {
      maxButtonHeight = btnDims.height;
    }
  }
  // Use calculated max or default if no buttons found
  const calculatedButtonHeight = maxButtonHeight > 0 ? maxButtonHeight : DEFAULT_BUTTON_HEIGHT;

  // Calculate HUD bottom Y to prevent content from overlapping wide HUD overlays
  // Only applies to top-center HUDs (countdown meter) that span the center of the stage
  // Corner HUDs (top-left, top-right timer) don't overlap with centered content
  let hudBottomY = 0;
  {
    const HUD_MARGIN = 12;
    const HUD_GAP = 8; // Gap between HUD bottom and content
    // Only check Countdown Meter HUD at top-center (wide enough to overlap centered content)
    if (countdownMeterConfig && countdownMeterConfig.enabled && countdownMeterValue) {
      const meterVisible = countdownMeterConfig.showByDefault !== false ? !overrideCountdownMeter : !!overrideCountdownMeter;
      if (meterVisible) {
        const pos = countdownMeterConfig.position || 'top-center';
        if (pos === 'top-center') {
          const meterHeight = countdownMeterConfig.meterHeight || 8;
          const labelHeight = countdownMeterConfig.showLabel ? 19 : 0; // label + gap
          const thisBottom = HUD_MARGIN + 8 + labelHeight + meterHeight + 8 + HUD_GAP;
          hudBottomY = Math.max(hudBottomY, thisBottom);
        }
      }
    }
  }

  // Apply collision detection to adjust button positions when text boxes grow
  // Always run in both editor and preview modes for unified layout
  let adjustedElements = adjustElementsForCollisions(elements, stageWidth, stageHeight, theme, calculatedButtonHeight, hudBottomY, beatType);

  // When portrait is "above" text box, ensure text elements are pushed down if portrait would clip at top
  if (speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'above-left' || theme.speakerDisplay?.graphicPosition === 'above-right')) {
    const abovePortraitSize = theme.speakerDisplay?.graphicSize ?? 80;
    const firstTextEl = adjustedElements.find(el => el.location.kind === 'text' || el.location.kind === 'dialog');
    if (firstTextEl) {
      const neededTop = abovePortraitSize + 4; // portrait height + small margin
      if (firstTextEl.location.y < neededTop) {
        const shift = neededTop - firstTextEl.location.y;
        adjustedElements = adjustedElements.map(el => ({
          ...el,
          location: { ...el.location, y: el.location.y + shift },
        }));
      }
    }
  }

  // Report computed layout positions to parent (for editor selection handles)
  const onLayoutComputedRef = React.useRef(onLayoutComputed);
  onLayoutComputedRef.current = onLayoutComputed;
  React.useEffect(() => {
    if (!onLayoutComputedRef.current) return;
    const positions = adjustedElements.map(el => {
      if ((el.location.kind === 'text' || el.location.kind === 'dialog') && !el.location.manuallyResized) {
        const fontSize = computeRenderedFontSize(el.location, el.content, theme);
        const padding = computeRenderedPadding(el.location, theme);
        const hasButton = beatType ? BUTTON_BEAT_TYPES.includes(beatType) : true;
        const isNoButtonBeat = beatType ? NO_BUTTON_BEAT_TYPES.includes(beatType) : false;
        const effectiveButtonHeight = (hasButton && !isNoButtonBeat)
          ? (calculatedButtonHeight > 0 ? calculatedButtonHeight : DEFAULT_BUTTON_HEIGHT)
          : 0;
        const smartDims = calculateSmartTextBoxDimensions(
          el.content || '',
          fontSize,
          { x: el.location.x, y: el.location.y, width: el.location.width, height: el.location.height },
          padding,
          effectiveButtonHeight,
          stageWidth,
          stageHeight
        );
        return {
          name: el.location.name,
          id: el.location.id,
          x: el.location.x - smartDims.xOffset,
          y: el.location.y - (smartDims.yOffset || 0),
          width: smartDims.width,
          height: smartDims.height,
        };
      }
      return {
        name: el.location.name,
        id: el.location.id,
        x: el.location.x,
        y: el.location.y,
        width: el.location.width,
        height: el.location.height,
      };
    });
    onLayoutComputedRef.current(positions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, stageWidth, stageHeight, theme, beatType, calculatedButtonHeight, hudBottomY]);

  // Calculate animation delays for sequenced typewriter effect on text elements
  const animation = theme.textEffects?.animation || 'none';
  const speed = theme.textEffects?.typewriterSpeed || 30;
  const msPerChar = 1000 / speed;
  const bufferMs = 300; // Small pause between animations

  // Sort text elements for animation sequencing: title first, then author, then others
  const textElements = adjustedElements.filter(el =>
    el.location.kind === 'text' || el.location.kind === 'dialog'
  );
  const sortedTextElements = [...textElements].sort((a, b) => {
    const aName = a.location.name?.toLowerCase() || '';
    const bName = b.location.name?.toLowerCase() || '';

    // Title comes first (but not "titleScreen" - just "title")
    const aIsTitle = aName.includes('title') && !aName.includes('screen');
    const bIsTitle = bName.includes('title') && !bName.includes('screen');
    if (aIsTitle && !bIsTitle) return -1;
    if (!aIsTitle && bIsTitle) return 1;

    // Author comes second
    const aIsAuthor = aName.includes('author');
    const bIsAuthor = bName.includes('author');
    if (aIsAuthor && !bIsAuthor) return -1;
    if (!aIsAuthor && bIsAuthor) return 1;

    return 0;
  });

  // Build a map of element name to animation delay
  const animationDelayMap = new Map<string, number>();
  let cumulativeDelay = 0;

  for (const element of sortedTextElements) {
    animationDelayMap.set(element.location.name, cumulativeDelay);
    if (animation === 'typewriter') {
      // Next element starts after this one finishes + buffer
      const elementDuration = (element.content?.length || 0) * msPerChar + bufferMs;
      cumulativeDelay += elementDuration;
    }
  }

  // Track total text elements for animation completion (non-preview mode)
  totalTextElementsRef.current = sortedTextElements.length;

  // Determine if buttons should be visible
  const shouldShowButtons = effectiveAnimationsComplete || animation === 'none' || sortedTextElements.length === 0;

  return (
    <div
      style={containerStyle}
      dir={textDirection === 'rtl' ? 'rtl' : undefined}
      onClick={!effectiveAnimationsComplete && animation === 'typewriter' ? handleSkipAnimations : undefined}
    >
      {/* Timer progress bar for default target countdown */}
      {timerState && timerState.visible && (
        <TimerProgressBar
          totalTime={timerState.totalTime}
          remainingTime={timerState.remainingTime}
          visible={timerState.visible}
          label={timerState.label}
        />
      )}
      {/* Timer HUD overlay */}
      {timerHudConfig && timerHudConfig.enabled && (
        <TimerHudDisplay
          config={timerHudConfig}
          visible={true}
          remainingTime={timerHudTime?.remainingTime}
          totalTime={timerHudTime?.totalTime}
          displayText={timerHudOverrideText}
          fictionalTimeText={fictionalTimeText}
          fontScale={mobileFontScale}
        />
      )}
      {/* Countdown Meter HUD overlay */}
      {countdownMeterConfig && countdownMeterConfig.enabled && countdownMeterValue &&
        (countdownMeterConfig.showByDefault !== false ? !overrideCountdownMeter : !!overrideCountdownMeter) && (
        <CountdownMeterHud
          config={countdownMeterConfig}
          visible={true}
          counterValue={countdownMeterValue.value}
          counterMin={countdownMeterValue.min}
          counterMax={countdownMeterValue.max}
          fontScale={mobileFontScale}
        />
      )}
      {/* Speaker name label overlay (VN-style) */}
      {speakerName && theme.speakerDisplay?.nameStyle === 'label' && (() => {
        const namePos = theme.speakerDisplay?.namePosition ?? 'left';
        const isLeft = textDirection === 'rtl' ? namePos === 'right' : namePos === 'left';
        // Position label just above and aligned with first text element
        const firstTextEl = adjustedElements.find(el => el.location.kind === 'text' || el.location.kind === 'dialog');
        const firstTextY = firstTextEl?.location.y;
        const firstTextX = firstTextEl?.location.x;
        const firstTextW = firstTextEl?.location.width;
        const labelTop = firstTextY != null ? Math.max(firstTextY - Math.round(28 * mobileFontScale), 4) : 12;
        const labelLeft = isLeft
          ? (firstTextX != null ? firstTextX + 8 : 16)
          : undefined;
        const labelRight = !isLeft
          ? (firstTextX != null && firstTextW != null ? stageWidth - (firstTextX + firstTextW) + 8 : 16)
          : undefined;
        return (
        <div
          style={{
            position: 'absolute',
            top: labelTop,
            left: labelLeft,
            right: labelRight,
            zIndex: 200,
            background: 'rgba(0, 0, 0, 0.65)',
            color: '#f0f0f0',
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: Math.round(16 * mobileFontScale),
            fontFamily: theme.fonts?.titleFont ? getFontFamily(theme.fonts.titleFont) : 'inherit',
            fontWeight: 600,
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {speakerName}
        </div>
        );
      })()}

      {/* Speaker portrait above text box — flush on top, aligned with text box edges */}
      {speakerName && speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'above-left' || theme.speakerDisplay?.graphicPosition === 'above-right') && (() => {
        const isLeft = theme.speakerDisplay?.graphicPosition === 'above-left';
        const size = theme.speakerDisplay?.graphicSize ?? 80;
        const firstTextEl = adjustedElements.find(el => el.location.kind === 'text' || el.location.kind === 'dialog');
        const firstTextY = firstTextEl?.location.y;
        const firstTextX = firstTextEl?.location.x;
        const firstTextW = firstTextEl?.location.width;
        const portraitTop = firstTextY != null ? Math.max(firstTextY - size, 0) : 0;
        const portraitLeft = isLeft
          ? (firstTextX != null ? firstTextX + 8 : 16)
          : undefined;
        const portraitRight = !isLeft
          ? (firstTextX != null && firstTextW != null ? stageWidth - (firstTextX + firstTextW) + 8 : 16)
          : undefined;
        return (
          <img
            src={speakerPortraitUrl}
            alt={speakerName}
            style={{
              position: 'absolute',
              top: portraitTop,
              left: portraitLeft,
              right: portraitRight,
              width: size,
              height: size,
              objectFit: 'cover',
              borderRadius: 8,
              zIndex: 200,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          />
        );
      })()}
      {(() => {
        // Find the index of the first text element to pass speaker props only to it
        const firstTextIdx = adjustedElements.findIndex(el => el.location.kind === 'text' || el.location.kind === 'dialog');
        if (speakerPortraitUrl) {
          console.log(`[PBV] Portrait: firstTextIdx=${firstTextIdx}, beatType=${beatType}, elements=${adjustedElements.map(e => e.location.kind).join(',')}, speakerName=${speakerName}, url=${speakerPortraitUrl ? 'yes' : 'no'}`);
        }
        return adjustedElements.map((element, index) => {
          const isFirstText = index === firstTextIdx && speakerName;
          return (
          <PositionedElement
            key={`element-${index}-${element.location.name}`}
            element={element}
            index={index}
            onAction={handleAction}
            interactive={interactive}
            inputValue={inputValue}
            setInputValue={setInputValue}
            hideTextBoxes={hideTextBoxes}
            hideButtonBoxes={hideButtonBoxes}
            theme={theme}
            previewMode={previewMode}
            visitedBeats={visitedBeats}
            visitedChoiceIds={visitedChoiceIds}
            showTextOnHover={showTextOnHover}
            animationDelay={animationDelayMap.get(element.location.name) || 0}
            onAnimationComplete={handleAnimationComplete}
            skipAnimation={effectiveSkipAnimation}
            shouldShowButtons={shouldShowButtons}
            soundBlobResolver={soundBlobResolver}
            animatedPosition={getAnimatedPosition(element.location.id || element.location.name, element.location.name)}
            onTriggerClickAnimation={() => triggerClickAnimation(element.location.id || element.location.name, element.location.name)}
            hasPendingClickAnimation={hasPendingClickAnimation(element.location.id || element.location.name, element.location.name)}
            characterMeterFrameResolver={characterMeterFrameResolver}
            characterInventoryResolver={characterInventoryResolver}
            inventoryVisible={inventoryVisible}
            containerDimensions={{ width: stageWidth, height: stageHeight }}
            beatType={beatType}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            calculatedButtonHeight={calculatedButtonHeight}
            editorMode={editorMode}
            onScrolledToBottom={handleElementScrolledToBottom}
            scrollRequirementsMet={allScrollRequirementsMet}
            mobileFontScale={mobileFontScale}
            speakerName={isFirstText ? speakerName : undefined}
            speakerPortraitUrl={isFirstText ? speakerPortraitUrl : undefined}
          />
          );
        });
      })()}
    </div>
  );
};

/**
 * Individual positioned element renderer
 */
interface PositionedElementProps {
  element: PositionedElementData;
  index: number;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  inputValue?: string;
  setInputValue?: (value: string) => void;
  hideTextBoxes?: boolean;
  hideButtonBoxes?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
  visitedBeats?: string[];
  visitedChoiceIds?: string[];
  showTextOnHover?: boolean;
  animationDelay?: number;  // Delay in ms before starting animation
  onAnimationComplete?: () => void;  // Callback when text animation finishes
  skipAnimation?: boolean;  // When true, skip animation and show full text
  shouldShowButtons?: boolean;  // Whether buttons should be visible (after animation)
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>;  // Resolver for loading sound blobs
  /** Animated position override from path animations */
  animatedPosition?: { x: number; y: number; scale?: number; rotation?: number; opacity?: number; flipX?: boolean; flipY?: boolean; spriteAnimation?: string; spriteFrames?: number[]; spriteFrameDuration?: number; isAnimating?: boolean };
  /** Callback to trigger onClick animations - returns Promise that resolves when animations complete */
  onTriggerClickAnimation?: () => Promise<void>;
  /** Whether this element has onClick animations waiting to be triggered (suppresses idle sprite animations) */
  hasPendingClickAnimation?: boolean;
  /** Resolver function to get meter frame data for a character (for HUD display) */
  characterMeterFrameResolver?: (characterId: string) => {
    counters: MeterCounterData[];
    config: MeterFrameConfig;
  } | null;
  /** Resolver function to get inventory data for a character (for HUD display) */
  characterInventoryResolver?: (characterId: string) => {
    items: InventoryItemData[];
    config: InventoryFrameConfig;
  } | null;
  /** Whether inventory display is visible (controlled by Ctrl/Cmd+I) */
  inventoryVisible?: boolean;
  /** Container dimensions for screen-docked meter frames */
  containerDimensions?: { width: number; height: number };
  /** Beat type for smart text box sizing (determines if there's a button) */
  beatType?: string;
  /** Stage width from project settings for smart sizing calculations */
  stageWidth?: number;
  /** Stage height from project settings for smart sizing calculations */
  stageHeight?: number;
  /** Calculated button height for this beat (used by text elements to reserve space) */
  calculatedButtonHeight?: number;
  /** Editor mode - cosmetic differences only (hotspot borders, scroll badges) */
  editorMode?: boolean;
  /** Callback when text/dialog element is scrolled to bottom (for scroll-lock feature) */
  onScrolledToBottom?: (elementId: string) => void;
  /** Whether all scroll-to-bottom requirements are met (for enabling buttons) */
  scrollRequirementsMet?: boolean;
  /** Mobile font scale multiplier (1.0 = normal, up to 2.0) */
  mobileFontScale?: number;
  /** Speaker name for inline name display (only passed to first text element) */
  speakerName?: string;
  /** Speaker portrait URL for inside-text portrait (only passed to first text element) */
  speakerPortraitUrl?: string;
}

const PositionedElement: React.FC<PositionedElementProps> = ({
  element,
  index,
  onAction,
  interactive,
  inputValue = '',
  setInputValue,
  hideTextBoxes = false,
  hideButtonBoxes = false,
  theme,
  previewMode = false,
  visitedBeats = [],
  visitedChoiceIds = [],
  showTextOnHover = false,
  animationDelay = 0,
  onAnimationComplete,
  skipAnimation = false,
  shouldShowButtons = true,
  soundBlobResolver,
  animatedPosition,
  onTriggerClickAnimation,
  hasPendingClickAnimation,
  characterMeterFrameResolver,
  characterInventoryResolver,
  inventoryVisible = false,
  containerDimensions,
  beatType,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  calculatedButtonHeight = 0,
  editorMode = false,
  onScrolledToBottom,
  scrollRequirementsMet = true,
  mobileFontScale = 1.0,
  speakerName,
  speakerPortraitUrl,
}) => {
  const { location, content, assetUrl, hyperlinks, description } = element;

  // Check if element should be visible (Phase 5 - Optional Text Boxes)
  // If visible is explicitly set to false, don't render the element
  if (location.visible === false) {
    return null;
  }

  // Use animated position if available, otherwise use location
  const effectiveX = animatedPosition?.x ?? location.x;
  const effectiveY = animatedPosition?.y ?? location.y;

  // Build transform string with rotation, scale, and flip (use animated values if available)
  const transforms: string[] = [];
  const effectiveRotation = animatedPosition?.rotation ?? location.rotation;
  const effectiveScale = animatedPosition?.scale ?? location.scale;
  const effectiveFlipX = animatedPosition?.flipX;
  const effectiveFlipY = animatedPosition?.flipY;

  if (effectiveRotation) {
    transforms.push(`rotate(${effectiveRotation}deg)`);
  }
  if (effectiveScale && effectiveScale !== 1) {
    transforms.push(`scale(${effectiveScale})`);
  }
  // Apply flip transforms (for sprite direction changes)
  if (effectiveFlipX) {
    transforms.push(`scaleX(-1)`);
  }
  if (effectiveFlipY) {
    transforms.push(`scaleY(-1)`);
  }

  // For character/prop elements, use auto sizing to preserve natural image dimensions when:
  // 1. They have a size percentage specified, OR
  // 2. They have default/scaled default dimensions (100x100 or 128x128 from ASML import)
  // The size percentage will be applied as a CSS scale transform in AssetElement
  const hasDefaultDimensions = (location.width === 100 && location.height === 100) ||
                               (location.width === 128 && location.height === 128);
  const isAssetWithSize = (location.kind === 'character' || location.kind === 'prop') &&
                          ((location as any).size !== undefined || hasDefaultDimensions);

  // Ensure text/button/dialog elements always appear above characters/props
  // Characters and props get z-index 0-99, text/button/dialog get 100+
  const isTextOrUI = ['text', 'button', 'dialog', 'hotspot'].includes(location.kind);
  const baseZIndex = isTextOrUI ? 100 : 0;
  const effectiveZIndex = (location.zIndex ?? index) + baseZIndex;

  // Apply animated opacity if available
  const effectiveOpacity = animatedPosition?.opacity;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${effectiveX}px`,
    top: `${effectiveY}px`,
    // For assets with size percentage, don't constrain dimensions - let image use natural size
    width: isAssetWithSize ? 'auto' : `${location.width}px`,
    height: isAssetWithSize ? 'auto' : `${location.height}px`,
    zIndex: effectiveZIndex,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    transformOrigin: 'center center',
    opacity: effectiveOpacity,
  };

  // Special handling for input fields (detected by name containing 'input')
  // This works for both text and button kinds since inputText beats may use either
  if (location.name.toLowerCase().includes('input')) {
    return (
      <InputFieldElement
        style={baseStyle}
        content={content}
        location={location}
        onAction={onAction}
        interactive={interactive}
        inputValue={inputValue}
        setInputValue={setInputValue}
        theme={theme}
        mobileFontScale={mobileFontScale}
      />
    );
  }

  // Render based on element kind
  switch (location.kind) {
    case 'text': {
      // Text elements use auto height to expand for long content
      // The defined height becomes minHeight to maintain layout for short text

      // For long content (like AI-generated text), expand width to use more screen space
      // This ensures AI content isn't constrained to narrow visual editor widths
      // But only for AI beats - for regular beats, respect user positioning
      const contentLength = content?.length || 0;
      const isLongContent = contentLength > 150;
      const isVeryLongContent = contentLength > 300;

      // Use stored dimensions from visual editor
      const effectiveWidth = location.width;
      const effectiveLeft = effectiveX;

      // Log text element positioning for AI beats debugging
      console.log(`[PositionedBeatView] Rendering TEXT "${location.name}": left=${effectiveLeft}, top=${effectiveY}, width=${effectiveWidth}, height=${location.height}, contentLength=${contentLength}, beatType=${beatType}`);

      const textStyle = {
        ...baseStyle,
        left: `${effectiveLeft}px`,
        width: `${effectiveWidth}px`,
        height: 'auto',
        minHeight: `${location.height}px`,
      };
      // Create callback for this specific element
      const elementId = location.id || location.name;
      const handleScrolled = location.requireScrollToBottom && onScrolledToBottom
        ? () => onScrolledToBottom(elementId)
        : undefined;

      return (
        <TextElement
          style={textStyle}
          content={content}
          location={location}
          hideTextBox={hideTextBoxes}
          theme={theme}
          previewMode={previewMode}
          animationDelay={animationDelay}
          onAnimationComplete={onAnimationComplete}
          skipAnimation={skipAnimation}
          beatType={beatType}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          calculatedButtonHeight={calculatedButtonHeight}
          editorMode={editorMode}
          onScrolledToBottom={handleScrolled}
          mobileFontScale={mobileFontScale}
          speakerName={speakerName}
          speakerPortraitUrl={speakerPortraitUrl}
        />
      );
    }

    case 'button': {
      // WYSIWYG: Use stored dimensions from visual editor in both editor and preview modes
      // This ensures what users set in the visual editor is exactly what appears in preview
      // Only fall back to smart sizing if no dimensions are stored (e.g., legacy content)
      const btnFontSize = location.fontSize ?? theme.fonts.buttonFontSize ?? 16;
      const btnPaddingH = 16;
      const btnPaddingV = 10;

      // Always compute smart dimensions to ensure text fits
      const smartBtnDims = calculateSmartButtonDimensions(
        content,
        btnFontSize,
        { x: location.x, y: location.y, width: location.width || 200, height: location.height || 50 },
        btnPaddingH,
        btnPaddingV,
        stageWidth,
        stageHeight
      );
      // If stored dimensions exist, keep stored width but ensure height fits content
      if (location.width && location.height) {
        smartBtnDims.width = location.width;
        // Recompute height for the stored width (account for border-box: padding + border inside height)
        const charWidth = btnFontSize * 0.6;
        const lineHeight = btnFontSize * 1.4;
        const borderWidth = theme.button.borderWidth ?? 2;
        const availW = location.width - btnPaddingH * 2 - borderWidth * 2;
        const cpl = Math.floor(availW / charWidth);
        const lines = cpl > 0 ? Math.ceil(content.length / cpl) : 1;
        // border-box: total height = content + padding + border
        const neededH = lines * lineHeight + btnPaddingV * 2 + borderWidth * 2;
        smartBtnDims.height = Math.max(location.height, Math.ceil(neededH));
      }

      // Debug logging for button overflow issues
      if (content && content.length > 30) {
        console.log(`[Button] "${content.substring(0, 40)}..." x=${location.x}, stageW=${stageWidth}, calcW=${smartBtnDims.width}, calcH=${smartBtnDims.height}`);
      }

      // Check if this button leads to a visited beat or is a visited choice
      // Only apply visited styling when markVisited is enabled for the beat
      const isButtonVisited = element.markVisited
        ? beatType === 'dialogTree'
          ? (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
          : (element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false) ||
            (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
        : false;
      // Wrap button in a div that handles the fade-in animation
      // (ButtonElement has its own opacity/transition that would overwrite if passed directly)
      // Combine animated opacity with button fade-in: use animated opacity if buttons are shown
      // Also dim button if scroll requirements not met (scroll-to-continue feature)
      const buttonsEnabled = shouldShowButtons && scrollRequirementsMet;
      const buttonOpacity = shouldShowButtons
        ? (effectiveOpacity ?? 1) * (scrollRequirementsMet ? 1 : 0.5)
        : 0;
      return (
        <div
          style={{
            ...baseStyle,
            width: `${smartBtnDims.width}px`,
            height: `${smartBtnDims.height}px`,
            opacity: buttonOpacity,
            transition: 'opacity 300ms ease-in',
            pointerEvents: buttonsEnabled ? 'auto' : 'none',
            cursor: buttonsEnabled ? 'pointer' : 'not-allowed',
          }}
        >
          <ButtonElement
            style={{ width: '100%', height: '100%' }}
            content={content}
            location={location}
            actionId={element.actionId}
            onAction={onAction}
            interactive={interactive && buttonsEnabled}
            hideButtonBox={hideButtonBoxes}
            theme={theme}
            isVisited={isButtonVisited}
            description={description}
            soundBlobResolver={soundBlobResolver}
            onTriggerClickAnimation={onTriggerClickAnimation}
            mobileFontScale={mobileFontScale}
          />
        </div>
      );
    }

    case 'hotspot': {
      // Check if this hotspot leads to a visited beat or is a visited choice
      // Only apply visited styling when markVisited is enabled for the beat
      const isHotspotVisited = element.markVisited
        ? beatType === 'dialogTree'
          ? (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
          : (element.targetBeatId ? visitedBeats.includes(element.targetBeatId) : false) ||
            (element.actionId ? visitedChoiceIds.includes(element.actionId) : false)
        : false;
      // Wrap hotspot in a div that handles the fade-in animation
      // (ButtonElement has its own opacity/transition that would overwrite if passed directly)
      // Also apply scroll-to-continue logic for hotspots
      const hotspotsEnabled = shouldShowButtons && scrollRequirementsMet;
      const hotspotOpacity = shouldShowButtons
        ? (scrollRequirementsMet ? 1 : 0.5)
        : 0;
      return (
        <div
          style={{
            ...baseStyle,
            opacity: hotspotOpacity,
            transition: 'opacity 300ms ease-in',
            pointerEvents: hotspotsEnabled ? 'auto' : 'none',
          }}
        >
          <ButtonElement
            style={{ width: '100%', height: '100%' }}
            content={content}
            location={location}
            actionId={element.actionId}
            onAction={onAction}
            interactive={interactive && hotspotsEnabled}
            hideButtonBox={true} // Always hide button box for hotspots
            editorMode={!interactive} // Editor mode when not interactive
            theme={theme}
            isVisited={isHotspotVisited}
            showTextOnHover={showTextOnHover}
            description={description}
            soundBlobResolver={soundBlobResolver}
            onTriggerClickAnimation={onTriggerClickAnimation}
            mobileFontScale={mobileFontScale}
          />
        </div>
      );
    }

    case 'input':
      return (
        <InputFieldElement
          style={baseStyle}
          content={content}
          location={location}
          onAction={onAction}
          interactive={interactive}
          inputValue={inputValue}
          setInputValue={setInputValue}
          theme={theme}
          mobileFontScale={mobileFontScale}
        />
      );

    case 'dialog': {
      // For long content (like AI-generated text), expand width to use more screen space
      // This ensures AI content isn't constrained to narrow visual editor widths
      // BUT: In editor mode, always use exact dimensions to match selection handles
      // Also skip for manually positioned elements (non-AI beats where user set the position)
      const dialogContentLength = content?.length || 0;
      const isDialogLongContent = dialogContentLength > 150;
      const isDialogVeryLongContent = dialogContentLength > 300;

      // Use stored dimensions from visual editor
      const dialogEffectiveWidth = location.width;
      const dialogEffectiveLeft = effectiveX;

      // Log dialog element positioning for AI beats debugging
      console.log(`[PositionedBeatView] Rendering DIALOG "${location.name}": left=${dialogEffectiveLeft}, top=${effectiveY}, width=${dialogEffectiveWidth}, height=${location.height}, contentLength=${dialogContentLength}, beatType=${beatType}`);

      const dialogStyle = {
        ...baseStyle,
        left: `${dialogEffectiveLeft}px`,
        width: `${dialogEffectiveWidth}px`,
        // Unified height: auto with minHeight ensures content fits in both modes
        height: 'auto',
        minHeight: `${location.height}px`,
      };

      // Create callback for this specific element
      const dialogElementId = location.id || location.name;
      const handleDialogScrolled = location.requireScrollToBottom && onScrolledToBottom
        ? () => onScrolledToBottom(dialogElementId)
        : undefined;

      return (
        <DialogElement
          style={dialogStyle}
          content={content}
          location={location}
          hideTextBox={hideTextBoxes}
          theme={theme}
          previewMode={previewMode}
          hyperlinks={hyperlinks}
          onAction={onAction}
          animationDelay={animationDelay}
          onAnimationComplete={onAnimationComplete}
          skipAnimation={skipAnimation}
          beatType={beatType}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          calculatedButtonHeight={calculatedButtonHeight}
          editorMode={editorMode}
          onScrolledToBottom={handleDialogScrolled}
          mobileFontScale={mobileFontScale}
          speakerName={speakerName}
          speakerPortraitUrl={speakerPortraitUrl}
        />
      );
    }

    case 'character': {
      // Get meter frame data if character has one configured
      const meterFrameData = location.characterId && characterMeterFrameResolver
        ? characterMeterFrameResolver(location.characterId)
        : null;

      // Get inventory data if character has one configured
      const inventoryData = location.characterId && characterInventoryResolver
        ? characterInventoryResolver(location.characterId)
        : null;

      // Determine if inventory should be visible (controlled by Ctrl/Cmd+I toggle)
      const shouldShowInventory = inventoryData && inventoryData.items.length > 0 && inventoryVisible;

      // Debug: Log inventory visibility
      if (location.characterId) {
        console.log(`[InventoryHUD] Character "${location.characterId}": inventoryVisible=${inventoryVisible}, hasInventoryData=${!!inventoryData}, itemCount=${inventoryData?.items?.length || 0}, shouldShow=${shouldShowInventory}`);
        if (inventoryData) {
          console.log(`[InventoryHUD]   Items:`, inventoryData.items.map((i: any) => i.name || i.id).join(', '));
        }
      }

      // Merge sprite animation from path animation into spriteSheet
      // When animatedPosition has sprite animation info and isAnimating is true, use it
      let effectiveSpriteSheet = element.spriteSheet;
      if (element.spriteSheet && animatedPosition?.isAnimating) {
        // Determine which animation to play:
        // 1. Use spriteAnimation from waypoint if specified
        // 2. Fall back to element's activeAnimation if set
        // 3. Fall back to a default animation (walk/idle/first) when animating
        let effectiveActiveAnim = animatedPosition.spriteAnimation || element.spriteSheet.activeAnimation;

        // If still no animation but we're animating, try to find a default
        if (!effectiveActiveAnim && element.spriteSheet.animations?.length) {
          const anims = element.spriteSheet.animations;
          const defaultAnim = anims.find(a =>
            a.name.toLowerCase() === 'walk' ||
            a.name.toLowerCase() === 'walking' ||
            a.name.toLowerCase() === 'run' ||
            a.name.toLowerCase() === 'idle'
          );
          effectiveActiveAnim = defaultAnim?.name || anims[0]?.name;
        }

        // Debug: log when sprite animation changes
        if (effectiveActiveAnim !== element.spriteSheet.activeAnimation) {
          console.log('[Character] spriteAnimation from path:', animatedPosition.spriteAnimation, '-> effective:', effectiveActiveAnim);
        }
        effectiveSpriteSheet = {
          ...element.spriteSheet,
          // Use sprite animation from waypoint if specified, otherwise use default
          activeAnimation: effectiveActiveAnim,
        };
      } else if (element.spriteSheet && animatedPosition && !animatedPosition.isAnimating) {
        // Animation completed - clear activeAnimation to stop sprite cycling
        effectiveSpriteSheet = {
          ...element.spriteSheet,
          activeAnimation: undefined,
        };
      } else if (element.spriteSheet && hasPendingClickAnimation) {
        // Has pending onClick animation - suppress sprite animation until triggered
        // Show static first frame instead of cycling animation
        effectiveSpriteSheet = {
          ...element.spriteSheet,
          activeAnimation: undefined,
        };
      }

      return (
        <>
          <AssetElement
            style={baseStyle}
            assetUrl={assetUrl}
            assetId={location.assetId}
            name={location.name}
            kind={location.kind}
            size={location.size}
            interactive={interactive}
            actionId={element.actionId}
            onAction={onAction}
            sound={(location as any).soundAssetId || location.sound}
            soundBlobResolver={soundBlobResolver}
            spriteSheet={effectiveSpriteSheet}
          />
          {meterFrameData && meterFrameData.counters.length > 0 && (
            <CharacterMeterFrame
              counters={meterFrameData.counters}
              config={meterFrameData.config}
              characterPosition={{ x: effectiveX, y: effectiveY }}
              characterDimensions={{ width: location.width, height: location.height }}
              containerDimensions={containerDimensions}
              fontScale={mobileFontScale}
            />
          )}
          {shouldShowInventory && inventoryData && (
            <CharacterInventoryFrame
              items={inventoryData.items}
              config={inventoryData.config}
              characterPosition={{ x: effectiveX, y: effectiveY }}
              characterDimensions={{ width: location.width, height: location.height }}
              containerDimensions={containerDimensions}
              isVisible={true}
              fontScale={mobileFontScale}
              autoMinimize={mobileFontScale > 1.0}
            />
          )}
        </>
      );
    }

    case 'prop':
      return (
        <AssetElement
          style={baseStyle}
          assetUrl={assetUrl}
          assetId={location.assetId}
          assetType={location.assetType}
          editorMode={editorMode}
          name={location.name}
          kind={location.kind}
          size={location.size}
          interactive={interactive}
          actionId={element.actionId}
          onAction={onAction}
          sound={(location as any).soundAssetId || location.sound}
          soundBlobResolver={soundBlobResolver}
          description={description}
          theme={theme}
        />
      );

    case 'meter':
      return (
        <MeterElement
          style={baseStyle}
          location={location}
          counterValue={element.counterValue ?? 0}
          counterMin={element.counterMin ?? 0}
          counterMax={element.counterMax ?? 100}
          theme={theme}
          fontScale={mobileFontScale}
        />
      );

    case 'keypad':
      return (
        <div style={{ ...baseStyle, pointerEvents: interactive ? 'auto' : 'none' }}>
          <KeypadElement
            layout={(element as any).keypadLayout || 'numeric'}
            maxDigits={(element as any).keypadMaxDigits || 4}
            minDigits={(element as any).keypadMinDigits || 1}
            correctCode={(element as any).keypadCorrectCode}
            maxAttempts={(element as any).keypadMaxAttempts || 0}
            maskInput={(element as any).keypadMaskInput ?? true}
            buttonText={(element as any).keypadButtonText || 'Enter'}
            clearButtonText={(element as any).keypadClearButtonText || 'Clear'}
            showDisplay={(element as any).keypadShowDisplay ?? true}
            onSubmit={(code) => onAction?.(code)}
            onFail={() => onAction?.('__keypad_fail__')}
            width={location.width}
            height={location.height}
            fontScale={mobileFontScale}
          />
        </div>
      );

    default:
      return null;
  }
};

/**
 * Text element renderer with smart autosize calculation
 */
const TextElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
  animationDelay?: number;  // Delay in ms before starting animation
  onAnimationComplete?: () => void;  // Callback when animation finishes
  skipAnimation?: boolean;  // When true, immediately show full text
  beatType?: string;  // Beat type to determine if there's a button
  stageWidth?: number;  // Stage width from project settings
  stageHeight?: number;  // Stage height from project settings
  calculatedButtonHeight?: number;  // Pre-calculated button height for this beat
  editorMode?: boolean;  // Editor mode - cosmetic only (scroll badges, hotspot borders)
  onScrolledToBottom?: () => void;  // Callback when user scrolls to bottom
  mobileFontScale?: number;  // Mobile font scale multiplier (1.0 = normal)
  speakerName?: string;  // Speaker name for inline display
  speakerPortraitUrl?: string;  // Speaker portrait URL for inside-text display
}> = ({ style, content, location, hideTextBox = false, theme, previewMode = false, animationDelay = 0, onAnimationComplete, skipAnimation = false, beatType, stageWidth = DEFAULT_STAGE_WIDTH, stageHeight = DEFAULT_STAGE_HEIGHT, calculatedButtonHeight = 0, editorMode = false, onScrolledToBottom, mobileFontScale = 1.0, speakerName, speakerPortraitUrl }) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const [isAnimating, setIsAnimating] = React.useState(true);
  const [animationStarted, setAnimationStarted] = React.useState(false);
  const animationCompletedRef = React.useRef(false);

  // Scroll tracking state
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const [isAtBottom, setIsAtBottom] = React.useState(false);
  const [hasScrolled, setHasScrolled] = React.useState(false); // True once user starts scrolling
  const scrolledToBottomRef = React.useRef(false);

  // Detect overflow and track scroll position
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      const hasVerticalOverflow = container.scrollHeight > container.clientHeight + 5; // 5px threshold
      setHasOverflow(hasVerticalOverflow);

      // If no overflow, consider it "at bottom"
      if (!hasVerticalOverflow) {
        setIsAtBottom(true);
        if (!scrolledToBottomRef.current) {
          scrolledToBottomRef.current = true;
          onScrolledToBottom?.();
        }
      }
    };

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Mark as scrolled once user starts scrolling (hides the indicator)
      if (scrollTop > 0) {
        setHasScrolled(true);
      }

      const atBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
      setIsAtBottom(atBottom);

      if (atBottom && !scrolledToBottomRef.current) {
        scrolledToBottomRef.current = true;
        onScrolledToBottom?.();
      }
    };

    // Initial check
    checkOverflow();

    // Check again after content might have rendered
    const timeoutId = setTimeout(checkOverflow, 100);

    container.addEventListener('scroll', handleScroll);

    // Re-check overflow when content changes
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [content, onScrolledToBottom]);

  // Reset scroll tracking when content changes
  React.useEffect(() => {
    scrolledToBottomRef.current = false;
    setIsAtBottom(false);
    setHasScrolled(false);
  }, [content]);

  // Handle skip animation - immediately show full text
  React.useEffect(() => {
    if (skipAnimation && !animationCompletedRef.current) {
      setDisplayedText(content);
      setIsAnimating(false);
      animationCompletedRef.current = true;
      onAnimationComplete?.();
    }
  }, [skipAnimation, content, onAnimationComplete]);

  // Typewriter animation effect with delay support
  React.useEffect(() => {
    // Reset completion tracking when content changes
    animationCompletedRef.current = false;

    // If already skipped, don't start animation
    if (skipAnimation) {
      setDisplayedText(content);
      setIsAnimating(false);
      return;
    }

    const animation = theme.textEffects?.animation || 'none';

    if (animation === 'typewriter') {
      setDisplayedText('');
      setIsAnimating(true);
      setAnimationStarted(false);

      const speed = theme.textEffects?.typewriterSpeed || 30;
      const msPerChar = 1000 / speed;
      let currentIndex = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      // Start animation after delay
      const delayTimeoutId = setTimeout(() => {
        setAnimationStarted(true);
        intervalId = setInterval(() => {
          if (currentIndex < content.length) {
            setDisplayedText(content.substring(0, currentIndex + 1));
            currentIndex++;
          } else {
            setIsAnimating(false);
            if (intervalId) clearInterval(intervalId);
            if (!animationCompletedRef.current) {
              animationCompletedRef.current = true;
              onAnimationComplete?.();
            }
          }
        }, msPerChar);
      }, animationDelay);

      return () => {
        clearTimeout(delayTimeoutId);
        if (intervalId) clearInterval(intervalId);
      };
    } else {
      setDisplayedText(content);
      setIsAnimating(false);
      // For fade animation, wait for the fade duration before calling completion
      // For 'none', complete immediately after a short delay
      const fadeInDuration = theme.textEffects?.fadeInDuration || 500;
      const waitDuration = animation === 'fade' ? fadeInDuration : 50;
      const timeoutId = setTimeout(() => {
        if (!animationCompletedRef.current) {
          animationCompletedRef.current = true;
          onAnimationComplete?.();
        }
      }, animationDelay + waitDuration);
      return () => clearTimeout(timeoutId);
    }
  }, [content, theme.textEffects?.animation, theme.textEffects?.typewriterSpeed, theme.textEffects?.fadeInDuration, animationDelay, onAnimationComplete, skipAnimation]);

  // Calculate font size - auto-adjust based on content length if no explicit size set
  const contentLength = content?.length || 0;
  const isLongContent = contentLength > 80;
  const isVeryLongContent = contentLength > 200;
  const isExtremelyLongContent = contentLength > 400;

  // Determine if this is a title/author element (for theme font styling)
  const isTitleElement = location.name?.toLowerCase().includes('title') || location.name?.toLowerCase().includes('author');

  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
    console.log(`[PositionedBeatView] Text "${location.name}": using stored fontSize=${computedFontSize}`);
  } else if (isTitleElement && theme.fonts.titleFontSize) {
    // Use theme title font size for title/author elements
    computedFontSize = theme.fonts.titleFontSize;
    console.log(`[PositionedBeatView] Text "${location.name}": using theme titleFontSize=${computedFontSize}`);
  } else if (!isTitleElement && theme.fonts.textFontSize) {
    // Use theme text font size for regular text
    computedFontSize = theme.fonts.textFontSize;
    console.log(`[PositionedBeatView] Text "${location.name}": using theme textFontSize=${computedFontSize}`);
  } else {
    // Auto-size based on content length for better readability
    if (isExtremelyLongContent) {
      computedFontSize = 11;
    } else if (isVeryLongContent) {
      computedFontSize = 12;
    } else if (isLongContent) {
      computedFontSize = 14;
    } else if (contentLength < 30) {
      computedFontSize = 36;
    } else {
      computedFontSize = 16;
    }
    console.log(`[PositionedBeatView] Text "${location.name}": auto-sized to fontSize=${computedFontSize} (contentLength=${contentLength})`);
  }

  // Apply mobile font scale multiplier
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }

  // Use stored textAlign (set by smart sizing or user override), fall back to auto-alignment
  const computedTextAlign = location.textAlign || (isLongContent ? 'left' : 'center');
  // Apply font mapping: use element's font if explicitly set, otherwise use theme default
  // Title/author elements use titleFont, others use textFont
  const defaultFont = isTitleElement ? theme.fonts.titleFont : theme.fonts.textFont;
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : defaultFont;

  // Use theme padding or calculate based on box size
  const padding = theme.textBox.padding;

  // Convert opacity from 0-100 to 0-1
  const opacityValue = theme.textBox.opacity / 100;

  // For title/author elements, check theme setting for hiding text boxes (VN style)
  const shouldHideTextBox = hideTextBox || (isTitleElement && theme.textBox.hideTitleTextBox);

  // Parse background color and add opacity
  const bgColor = shouldHideTextBox ? 'transparent' : (theme.textBox?.backgroundColor || '#000000');
  const bgWithOpacity = shouldHideTextBox ? 'transparent' :
    (bgColor?.startsWith?.('#') ? `${bgColor}${Math.round(opacityValue * 255).toString(16).padStart(2, '0')}` : bgColor);

  // Parse text color and add opacity
  const textColor = theme.colors.textColor;
  const textAlpha = theme.colors.textAlpha / 100;

  // Determine animation style
  const animation = theme.textEffects?.animation || 'none';
  const fadeInDuration = theme.textEffects?.fadeInDuration || 500;

  const animationStyle: React.CSSProperties = animation === 'fade'
    ? { animation: `fadeIn ${fadeInDuration}ms ease-in` }
    : {};

  // Smart text box sizing: grow horizontally first, then vertically, scroll only as last resort
  let dimensionStyle: React.CSSProperties;
  let needsScroll = false;
  if (location.manuallyResized) {
    // User manually resized: use stored dimensions as minimum, allow growth for content
    dimensionStyle = {
      left: `${location.x}px`,
      width: `${location.width}px`,
      height: 'auto',
      minHeight: `${location.height}px`,
      overflowY: 'auto',
    };
  } else {
    // Smart sizing: compute dimensions at render time (identical in editor + preview)
    const hasButton = beatType ? BUTTON_BEAT_TYPES.includes(beatType) : true;
    const isNoButtonBeat = beatType ? NO_BUTTON_BEAT_TYPES.includes(beatType) : false;
    const effectiveButtonHeight = (hasButton && !isNoButtonBeat)
      ? (calculatedButtonHeight > 0 ? calculatedButtonHeight : DEFAULT_BUTTON_HEIGHT)
      : 0;

    // Calculate portrait inline width for smart sizing
    const hasInlinePortrait = speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'inside-left' || theme.speakerDisplay?.graphicPosition === 'inside-right');
    const portraitInlineWidth = hasInlinePortrait ? (theme.speakerDisplay?.graphicSize ?? 48) + 8 : 0;

    // Calculate smart dimensions
    const smartDims = calculateSmartTextBoxDimensions(
      content,
      computedFontSize,
      { x: location.x, y: location.y, width: location.width, height: location.height },
      padding,
      effectiveButtonHeight,
      stageWidth,
      stageHeight,
      portraitInlineWidth
    );

    console.log(`[TextElement] "${location.name}" smartDims: input(x=${location.x}, y=${location.y}, w=${location.width}, h=${location.height}) -> output(w=${smartDims.width}, h=${smartDims.height}, needsScroll=${smartDims.needsScroll}, xOffset=${smartDims.xOffset}, yOffset=${smartDims.yOffset}), fontSize=${computedFontSize}, buttonHeight=${effectiveButtonHeight}`);

    needsScroll = smartDims.needsScroll;
    // Adjust position when box expands beyond original bounds
    const adjustedLeft = location.x - smartDims.xOffset;
    const adjustedTop = location.y - (smartDims.yOffset || 0);

    const DYNAMIC_BEATS = ['aiInfoText', 'aiDurScreen', 'aiDialogTree', 'aiSummary', 'onlineContent'];
    const skipMinHeight = beatType ? DYNAMIC_BEATS.includes(beatType) : false;

    dimensionStyle = {
      left: `${adjustedLeft}px`,
      top: `${adjustedTop}px`,
      width: `${smartDims.width}px`,
      height: 'auto',
      minHeight: skipMinHeight ? undefined : `${smartDims.height}px`,
      overflowY: 'auto',
    };
  }

  // For typewriter animation, render full text but make unrevealed characters transparent
  // This keeps text centered while characters appear one by one
  const revealedLength = displayedText.length;

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: ${textAlpha}; }
          }
        `}
      </style>
      <div
        ref={containerRef}
        style={{
          ...style,
          ...animationStyle,
          ...dimensionStyle,
          // Keep position from style (absolute) - scroll indicator is positioned within inner wrapper
          backgroundColor: bgWithOpacity,
          padding: shouldHideTextBox ? '0' : `${padding}px`,
          border: shouldHideTextBox ? 'none' : `${theme.textBox.borderWidth}px solid ${theme.textBox.borderColor}`,
          borderRadius: shouldHideTextBox ? '0' : `${theme.textBox.borderRadius}px`,
          fontSize: `${computedFontSize}px`,
          fontFamily: computedFont,
          fontWeight: isLongContent ? '400' : '500',
          color: textColor,
          opacity: animation === 'fade' ? undefined : textAlpha,
          boxShadow: shouldHideTextBox ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: computedTextAlign,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          // Don't set overflow here - let dimensionStyle handle it
          lineHeight: isLongContent ? '1.5' : '1.4',
          boxSizing: 'border-box',
          // Use flexbox for centering when content fits without scrolling
          // Only switch to block display when actually needing to scroll
          display: needsScroll ? 'block' : 'flex',
          // Flexbox centering when content fits (vertical centering for non-scrollable content)
          alignItems: needsScroll ? undefined : 'center',
          justifyContent: needsScroll ? undefined : 'center',
          whiteSpace: 'pre-wrap', // Preserve line breaks in imported content
        }}
      >
        {/* Inner wrapper for scroll indicator positioning */}
        <div style={{
          position: 'relative',
          width: '100%',
          // Only set height for scrollable content; for centered content, let it be natural
          height: needsScroll ? '100%' : undefined,
        }}>
          {/* Speaker portrait inside text box (floated) */}
          {speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'inside-left' || theme.speakerDisplay?.graphicPosition === 'inside-right') && (() => {
            const isLeft = theme.speakerDisplay?.graphicPosition === 'inside-left';
            const size = theme.speakerDisplay?.graphicSize ?? 48;
            return (
              <img
                src={speakerPortraitUrl}
                alt={speakerName || ''}
                style={{
                  float: isLeft ? 'left' : 'right',
                  width: size,
                  height: size,
                  objectFit: 'cover',
                  borderRadius: 6,
                  marginRight: isLeft ? 8 : 0,
                  marginLeft: isLeft ? 0 : 8,
                  marginBottom: 4,
                }}
              />
            );
          })()}

          {/* Speaker name inline (bold first line) */}
          {speakerName && theme.speakerDisplay?.nameStyle === 'inline' && (
            <div style={{
              fontWeight: 700,
              fontSize: `${Math.round(computedFontSize * 1.05)}px`,
              color: theme.speakerDisplay?.nameColor || textColor,
              marginBottom: 4,
              textAlign: computedTextAlign,
            }}>
              {speakerName}
            </div>
          )}

          <span
            style={{
              display: 'block',
              textAlign: computedTextAlign,
              width: '100%',
            }}
          >
            {animation === 'typewriter' ? (
              <>
                {/* Revealed portion - visible */}
                <span>{content.substring(0, revealedLength)}</span>
                {/* Unrevealed portion - transparent (maintains spacing) */}
                <span style={{ color: 'transparent' }}>{content.substring(revealedLength)}</span>
              </>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: renderMarkdownLite(displayedText) }} />
            )}
          </span>
          {/* Scroll indicators - only show when scrolling is enabled, hide once user starts scrolling */}
          {editorMode ? (
            <ScrollBadge visible={hasOverflow} fontScale={mobileFontScale} />
          ) : (
            needsScroll && hasOverflow && !hasScrolled && <ScrollIndicator position="bottom" fontScale={mobileFontScale} />
          )}
        </div>
      </div>
    </>
  );
};

/**
 * Convert hex color to rgba with opacity
 */
function hexToRgba(hex: string, opacity: number): string {
  // Handle invalid or non-hex values
  if (!hex || !hex.startsWith('#')) {
    return `rgba(255, 255, 0, ${opacity})`; // Default yellow
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return `rgba(255, 255, 0, ${opacity})`; // Default yellow
  }
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Button element renderer
 */
const ButtonElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  actionId?: string; // Optional actionId to override location.name
  onAction?: (actionId: string) => void;
  interactive: boolean;
  hideButtonBox?: boolean;
  editorMode?: boolean;
  theme: RenderThemeSettings;
  isVisited?: boolean; // Whether this choice leads to an already-visited beat
  showTextOnHover?: boolean; // Only show text when hovering over the hotspot
  description?: string; // Tooltip text shown on hover (e.g., pickProp item description)
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>; // Resolver for sound blobs
  onTriggerClickAnimation?: () => Promise<void>; // Trigger onClick animations and wait for completion
  mobileFontScale?: number; // Mobile font scale multiplier (1.0 = normal)
}> = ({ style, content, location, actionId, onAction, interactive: interactiveProp, hideButtonBox = false, editorMode = false, theme, isVisited = false, showTextOnHover = false, description, soundBlobResolver, onTriggerClickAnimation, mobileFontScale = 1.0 }) => {
  // Visited choices are non-interactive (greyed out and not clickable)
  const interactive = interactiveProp && !isVisited;
  const [isHovered, setIsHovered] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Use stored fontSize, then theme button font size, then default to 16px
  let computedFontSize = location.fontSize ?? theme.fonts.buttonFontSize ?? 16;
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }
  console.log(`[PositionedBeatView] Button "${location.name}": fontSize=${computedFontSize}, location.fontSize=${location.fontSize}, theme.buttonFontSize=${theme.fonts.buttonFontSize}`);

  const computedTextAlign = location.textAlign || 'center';
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : theme.fonts.buttonFont;

  // Use more generous padding for better appearance
  const paddingHorizontal = 16;
  const paddingVertical = 10;

  // Get hotspot settings from theme
  const hotspotColor = theme.hotspot?.highlightColor || '#ffff00';
  const hotspotOpacity = theme.hotspot?.opacity ?? 0.3;  // 0-1 normalized
  const showInPreview = theme.hotspot?.showInPreview ?? 'visible';
  const hotspotVisible = theme.hotspot?.visible ?? true;  // "Show hotspots" checkbox
  const labelDisplay = theme.hotspot?.labelDisplay ?? 'hover';  // Label display mode

  // Determine if this is preview mode (interactive but not in editor)
  const isPreviewMode = interactive && !editorMode;

  // Determine background color based on mode and visited state
  let backgroundColor: string;
  if (hideButtonBox) {
    // Hotspot mode: use highlight color with configurable opacity
    if (editorMode) {
      // Editor mode: always show with slightly reduced opacity
      const baseOpacity = hotspotOpacity * 0.7;
      const hoverOpacity = hotspotOpacity * 1.3;
      backgroundColor = hexToRgba(hotspotColor, isHovered ? hoverOpacity : baseOpacity);
    } else if (!hotspotVisible) {
      // "Show hotspots" unchecked: fully transparent but tooltips still work
      backgroundColor = 'transparent';
    } else if (showInPreview === 'invisible') {
      // Invisible mode: fully transparent (no tooltip either)
      backgroundColor = 'transparent';
    } else if (showInPreview === 'onHover') {
      // Only visible on hover
      backgroundColor = isHovered ? hexToRgba(hotspotColor, hotspotOpacity) : 'transparent';
    } else {
      // Normal visible mode
      const hoverOpacity = Math.min(hotspotOpacity * 1.5, 1);
      backgroundColor = hexToRgba(hotspotColor, isHovered ? hoverOpacity : hotspotOpacity);
    }
  } else if (isVisited) {
    // Visited state: use a dimmed gray color
    backgroundColor = isHovered ? '#c0c0c0' : '#e0e0e0';
  } else {
    backgroundColor = isHovered ? theme.button.hoverBackgroundColor : theme.button.backgroundColor;
  }

  // Determine border color based on mode
  let borderColor: string;
  let borderStyle: string;
  if (hideButtonBox) {
    // Hotspot: use highlight color for border in editor mode
    borderColor = hotspotColor;
    borderStyle = editorMode ? `2px dashed ${hexToRgba(hotspotColor, 0.7)}` : 'none';
  } else if (isVisited) {
    borderColor = '#999999';
    borderStyle = `${theme.button.borderWidth}px solid ${borderColor}`;
  } else {
    borderColor = theme.button.borderColor;
    borderStyle = `${theme.button.borderWidth}px solid ${borderColor}`;
  }

  // Determine if text should be visible inside the button
  // For hotspots in PREVIEW mode (interactive, not editorMode):
  //   - hide text if labelDisplay is 'hover' (use tooltip instead)
  //   - show text if labelDisplay is 'always' (permanent label)
  //   - hide text if labelDisplay is 'none' (no label at all)
  // For hotspots in EDITOR mode: show text inside so users can see/edit labels
  // For regular buttons: always show text
  const shouldShowText = !hideButtonBox || !isPreviewMode || labelDisplay === 'always';

  // Determine if we should use button background images (from Ren'Py theme import)
  const useButtonImage = !hideButtonBox && !isVisited && theme.buttonNormalUrl;
  const buttonImageUrl = useButtonImage
    ? (isHovered && theme.buttonHoverUrl ? theme.buttonHoverUrl : theme.buttonNormalUrl)
    : undefined;

  // Set a reasonable minimum width for buttons
  // Don't base on text length since text wraps - just ensure buttons aren't too narrow
  const effectiveMinWidth = 100; // Just a reasonable minimum

  const buttonStyle: React.CSSProperties = {
    ...style,
    // Use background image if available, otherwise use solid color
    ...(buttonImageUrl ? {
      backgroundImage: `url(${buttonImageUrl})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundColor: 'transparent',
    } : {
      backgroundColor,
    }),
    color: hideButtonBox ? theme.colors.textColor : (isVisited ? '#666666' : theme.button.textColor),
    border: buttonImageUrl ? 'none' : borderStyle,
    opacity: isVisited ? 0.7 : 1,
    borderRadius: hideButtonBox ? '4px' : (buttonImageUrl ? '0' : `${theme.button.borderRadius}px`),
    padding: hideButtonBox ? '8px 12px' : `${paddingVertical}px ${paddingHorizontal}px`,
    fontSize: `${computedFontSize}px`,
    fontFamily: computedFont,
    fontWeight: '600',
    textAlign: computedTextAlign,
    transition: 'all 0.2s',
    boxShadow: hideButtonBox || buttonImageUrl ? 'none' : (isHovered ? '0 4px 8px rgba(0,0,0,0.12)' : '0 2px 4px rgba(0,0,0,0.08)'),
    transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
    cursor: interactive ? 'pointer' : 'default',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'normal',  // Ensure text wraps to multiple lines
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1.4',
    minWidth: `${effectiveMinWidth}px`,
    maxWidth: '100%',  // Never exceed container width - allows text wrapping
    minHeight: `${computedFontSize * 1.4 + (paddingVertical * 2) + 4}px`, // Font + padding + border
    overflow: 'hidden',  // Prevent content from overflowing
  };


  const handleClick = async () => {
    if (interactive) {
      // Play sound if assigned - prefer soundAssetId (proper asset ID) over sound (may be blob URL)
      const soundRef = (location as any).soundAssetId || location.sound;
      // Skip if soundRef is falsy or the literal string "undefined"
      if (soundRef && soundRef !== 'undefined') {
        try {
          const audioManager = getAudioManager();

          // Check if it's a preset sound (external URL)
          if (isPresetSound(soundRef)) {
            const preset = getPresetSound(soundRef);
            if (preset) {
              console.log(`[ButtonElement] Playing preset sound (waiting): ${preset.name}`);
              await audioManager.playSoundAndWait(preset.url, preset.volume);
            }
          } else if (soundBlobResolver) {
            // Custom asset - use blob resolver to get fresh blob data
            console.log(`[ButtonElement] Loading sound blob for: ${soundRef}`);
            const blob = await soundBlobResolver(soundRef);
            if (blob) {
              console.log(`[ButtonElement] Playing sound from blob (waiting)`);
              await audioManager.playSoundFromBlobAndWait(blob, 1.0, soundRef);
            } else {
              console.warn(`[ButtonElement] Could not resolve sound: ${soundRef}`);
            }
          } else if (soundRef.startsWith('http')) {
            // External URL - use playSoundAndWait
            console.log(`[ButtonElement] Playing external sound (waiting): ${soundRef}`);
            await audioManager.playSoundAndWait(soundRef);
          } else {
            console.warn(`[ButtonElement] No sound resolver available for: ${soundRef}`);
          }
        } catch (error) {
          console.error('[ButtonElement] Error playing sound:', error);
          // Don't block the action if sound fails
        }
      }

      // Trigger onClick animations and wait for them to complete
      if (onTriggerClickAnimation) {
        console.log(`[ButtonElement] Triggering onClick animations for: ${location.name}`);
        await onTriggerClickAnimation();
        console.log(`[ButtonElement] onClick animations complete for: ${location.name}`);
      }

      // Then call the action (after sound and animations complete)
      if (onAction) {
        // Use actionId if available (for movementChoice, pickProp, etc.), otherwise use location name
        const actionIdToPass = actionId || location.name || 'continue';
        console.log(`[ButtonElement] Clicked! actionId="${actionId}", location.name="${location.name}", actionIdToPass="${actionIdToPass}"`);
        onAction(actionIdToPass);
      }
    }
  };

  // Show custom tooltip in PREVIEW mode:
  // 1. For hotspots when labelDisplay is 'hover': show label (and description if available)
  // 2. For any interactive element with a description: show description on hover
  const showLabels = theme.hotspot?.showLabels ?? true;
  const showLabelTooltip = hideButtonBox && isPreviewMode && labelDisplay === 'hover' && showLabels && content && content.length > 0 && isHovered;
  const showDescriptionTooltip = isPreviewMode && description && description.length > 0 && isHovered;
  const showTooltip = showLabelTooltip || showDescriptionTooltip;

  // Handle mouse move to track cursor position for tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Build tooltip text: description takes priority, label as fallback for hotspot tooltips
  const tooltipText = description || content;
  const tooltipHasDescription = !!description;

  // Tooltip styles using theme colors
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    left: mousePos.x + 12,
    top: mousePos.y - 8,
    backgroundColor: theme.button.backgroundColor,
    color: theme.button.textColor,
    padding: '6px 12px',
    borderRadius: `${theme.button.borderRadius}px`,
    fontSize: '14px',
    fontFamily: theme.fonts.buttonFont,
    fontWeight: tooltipHasDescription ? 'normal' : '600',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    border: `1px solid ${theme.button.borderColor}`,
    pointerEvents: 'none',
    zIndex: 10000,
    whiteSpace: 'pre-line',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <>
      <button
        ref={buttonRef}
        style={buttonStyle}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        disabled={!interactive}
      >
        {shouldShowText ? content : ''}
      </button>
      {showTooltip && ReactDOM.createPortal(
        <div style={tooltipStyle}>{tooltipText}</div>,
        document.body
      )}
    </>
  );
};

/**
 * Input field element renderer
 */
const InputFieldElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  inputValue?: string;
  setInputValue?: (value: string) => void;
  theme: RenderThemeSettings;
  mobileFontScale?: number;
}> = ({ style, content, location, onAction, interactive, inputValue = '', setInputValue, theme, mobileFontScale = 1.0 }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Tracks whether we've done the one-time auto-select for this beat's input.
  const hasAutoSelectedRef = React.useRef(false);

  // Auto-focus and select pre-filled sample text so interactors can type immediately.
  // Depends on inputValue because the parent sets it asynchronously in its own useEffect
  // (after this component has already mounted). Depending only on [interactive] meant
  // el.select() fired on an empty value and was then wiped when the value arrived.
  React.useEffect(() => {
    if (!interactive) return;
    const el = textareaRef.current || inputRef.current;
    if (!el) return;
    el.focus();
    if (!inputValue) {
      // Value just reset (new beat starting) — clear flag so next populated value triggers select
      hasAutoSelectedRef.current = false;
      return;
    }
    if (hasAutoSelectedRef.current) return; // Already selected for this beat
    try { el.select(); } catch { /* ignore if unsupported */ }
    hasAutoSelectedRef.current = true;
  }, [interactive, inputValue]);

  // Calculate font size based on autosize setting or explicit fontSize
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (location.autosize !== false) {
    // Auto-size for input fields - simpler logic
    computedFontSize = Math.min(Math.floor(location.height * 0.4), 24);
  } else {
    computedFontSize = 16;
  }
  // Apply mobile font scale multiplier
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }

  const computedTextAlign = location.textAlign || 'left';
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : theme.fonts.textFont;

  // Calculate padding as percentage of box size
  const paddingHorizontal = Math.max(Math.floor(location.width * 0.03), 12);
  const paddingVertical = Math.max(Math.floor(location.height * 0.15), 8);

  // Determine if content is multi-line or long enough to need a textarea
  const needsTextarea = inputValue.includes('\n') || inputValue.length > 50 || content.includes('\n') || content.length > 50;

  const baseStyle: React.CSSProperties = {
    ...style,
    backgroundColor: '#fff',
    color: '#000',
    border: '2px solid #d1d5db',
    borderRadius: '8px',
    padding: `${paddingVertical}px ${paddingHorizontal}px`,
    fontSize: `${computedFontSize}px`,
    fontFamily: computedFont,
    textAlign: computedTextAlign,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    cursor: interactive ? 'text' : 'default',
    boxSizing: 'border-box',
    outline: 'none',
  };

  // Auto-grow textarea to fit content
  React.useEffect(() => {
    if (textareaRef.current && needsTextarea) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, location.height)}px`;
    }
  }, [inputValue, needsTextarea, location.height]);

  if (needsTextarea) {
    return (
      <textarea
        ref={textareaRef}
        style={{
          ...baseStyle,
          resize: 'none',
          overflow: 'hidden',
          minHeight: `${location.height}px`,
          lineHeight: '1.4',
        }}
        placeholder={content}
        value={inputValue}
        onChange={(e) => {
          setInputValue?.(e.target.value);
        }}
        disabled={!interactive}
        data-input-field="true"
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      style={baseStyle}
      placeholder={content}
      value={inputValue}
      onChange={(e) => setInputValue?.(e.target.value)}
      disabled={!interactive}
      data-input-field="true"
    />
  );
};

/**
 * HyperTextContent - renders text with clickable link words
 * Finds each hyperlink word in the text and wraps it in a clickable span
 */
const HyperTextContent: React.FC<{
  text: string;
  hyperlinks: HyperlinkData[];
  onLinkClick: (targetBeatId: string) => void;
  defaultLinkStyle?: React.CSSProperties;
}> = ({ text, hyperlinks, onLinkClick, defaultLinkStyle }) => {
  const [hoveredLink, setHoveredLink] = React.useState<string | null>(null);

  // If no hyperlinks, just return plain text
  if (!hyperlinks || hyperlinks.length === 0) {
    return <>{text}</>;
  }

  // Build segments: find each hyperlink word in the text and split around them
  // Sort hyperlinks by their position in the text (first occurrence)
  const sortedLinks = [...hyperlinks]
    .map(link => ({
      ...link,
      index: text.indexOf(link.word),
    }))
    .filter(link => link.index >= 0) // Only include links whose words are found in text
    .sort((a, b) => a.index - b.index);

  if (sortedLinks.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedLinks.forEach((link, i) => {
    // Add text before this link
    if (link.index > lastIndex) {
      segments.push(
        <span key={`text-${i}`}>{text.substring(lastIndex, link.index)}</span>
      );
    }

    // Add the clickable link
    const isHovered = hoveredLink === link.word;
    const linkStyle: React.CSSProperties = {
      color: isHovered && link.style?.hoverColor ? link.style.hoverColor : (link.style?.color || '#3b82f6'),
      textDecoration: link.style?.underline !== false ? 'underline' : 'none',
      fontWeight: link.style?.bold ? 'bold' : 'inherit',
      cursor: 'pointer',
      ...defaultLinkStyle,
    };

    segments.push(
      <span
        key={`link-${i}`}
        style={linkStyle}
        onClick={(e) => {
          e.stopPropagation();
          console.log(`[HyperTextContent] Link clicked: "${link.word}" → ${link.targetBeatId}`);
          onLinkClick(link.targetBeatId);
        }}
        onMouseEnter={() => setHoveredLink(link.word)}
        onMouseLeave={() => setHoveredLink(null)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLinkClick(link.targetBeatId);
          }
        }}
      >
        {link.word}
      </span>
    );

    lastIndex = link.index + link.word.length;
  });

  // Add any remaining text after the last link
  if (lastIndex < text.length) {
    segments.push(
      <span key="text-end">{text.substring(lastIndex)}</span>
    );
  }

  return <>{segments}</>;
};

/**
 * Dialog element renderer with smart autosize calculation
 */
const DialogElement: React.FC<{
  style: React.CSSProperties;
  content: string;
  location: Location;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  previewMode?: boolean;
  hyperlinks?: HyperlinkData[];
  onAction?: (actionId: string) => void;
  animationDelay?: number;
  onAnimationComplete?: () => void;
  skipAnimation?: boolean;
  beatType?: string;  // Beat type to determine if there's a button
  stageWidth?: number;  // Stage width from project settings
  stageHeight?: number;  // Stage height from project settings
  calculatedButtonHeight?: number;  // Pre-calculated button height for this beat
  editorMode?: boolean;  // Editor mode - cosmetic only (scroll badges, hotspot borders)
  onScrolledToBottom?: () => void;  // Callback when user scrolls to bottom
  mobileFontScale?: number;  // Mobile font scale multiplier (1.0 = normal)
  speakerName?: string;
  speakerPortraitUrl?: string;
}> = ({ style, content, location, hideTextBox = false, theme, previewMode = false, hyperlinks, onAction, animationDelay = 0, onAnimationComplete, skipAnimation = false, beatType, stageWidth = DEFAULT_STAGE_WIDTH, stageHeight = DEFAULT_STAGE_HEIGHT, calculatedButtonHeight = 0, editorMode = false, onScrolledToBottom, mobileFontScale = 1.0, speakerName, speakerPortraitUrl }) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const [isAnimating, setIsAnimating] = React.useState(true);
  const hasCalledCompleteRef = React.useRef(false);

  // Scroll tracking state
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const [isAtBottom, setIsAtBottom] = React.useState(false);
  const [hasScrolled, setHasScrolled] = React.useState(false); // True once user starts scrolling
  const scrolledToBottomRef = React.useRef(false);

  // Detect overflow and track scroll position
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      const hasVerticalOverflow = container.scrollHeight > container.clientHeight + 5; // 5px threshold
      setHasOverflow(hasVerticalOverflow);

      // If no overflow, consider it "at bottom"
      if (!hasVerticalOverflow) {
        setIsAtBottom(true);
        if (!scrolledToBottomRef.current) {
          scrolledToBottomRef.current = true;
          onScrolledToBottom?.();
        }
      }
    };

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Mark as scrolled once user starts scrolling (hides the indicator)
      if (scrollTop > 0) {
        setHasScrolled(true);
      }

      const atBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
      setIsAtBottom(atBottom);

      if (atBottom && !scrolledToBottomRef.current) {
        scrolledToBottomRef.current = true;
        onScrolledToBottom?.();
      }
    };

    // Initial check
    checkOverflow();

    // Check again after content might have rendered
    const timeoutId = setTimeout(checkOverflow, 100);

    container.addEventListener('scroll', handleScroll);

    // Re-check overflow when content changes
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => {
      clearTimeout(timeoutId);
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [content, onScrolledToBottom]);

  // Reset scroll tracking when content changes
  React.useEffect(() => {
    scrolledToBottomRef.current = false;
    setIsAtBottom(false);
    setHasScrolled(false);
  }, [content]);

  // Handle skip animation
  React.useEffect(() => {
    if (skipAnimation && isAnimating) {
      setDisplayedText(content);
      setIsAnimating(false);
      if (!hasCalledCompleteRef.current && onAnimationComplete) {
        hasCalledCompleteRef.current = true;
        onAnimationComplete();
      }
    }
  }, [skipAnimation, isAnimating, content, onAnimationComplete]);

  // Typewriter animation effect with delay support
  React.useEffect(() => {
    // Reset completion tracking when content changes
    hasCalledCompleteRef.current = false;

    const animation = theme.textEffects?.animation || 'none';

    if (animation === 'typewriter' && !skipAnimation) {
      setDisplayedText('');
      setIsAnimating(true);

      const speed = theme.textEffects?.typewriterSpeed || 30;
      const msPerChar = 1000 / speed;
      let currentIndex = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      // Start animation after delay
      const delayTimeoutId = setTimeout(() => {
        intervalId = setInterval(() => {
          if (currentIndex < content.length) {
            setDisplayedText(content.substring(0, currentIndex + 1));
            currentIndex++;
          } else {
            setIsAnimating(false);
            if (intervalId) clearInterval(intervalId);
            // Call completion callback
            if (!hasCalledCompleteRef.current && onAnimationComplete) {
              hasCalledCompleteRef.current = true;
              onAnimationComplete();
            }
          }
        }, msPerChar);
      }, animationDelay);

      return () => {
        clearTimeout(delayTimeoutId);
        if (intervalId) clearInterval(intervalId);
      };
    } else {
      setDisplayedText(content);
      setIsAnimating(false);
      // For fade animation, wait for the fade duration before calling completion
      // For 'none', complete immediately
      const fadeInDuration = theme.textEffects?.fadeInDuration || 500;
      const waitDuration = animation === 'fade' ? (animationDelay + fadeInDuration) : 0;
      const timeoutId = setTimeout(() => {
        if (!hasCalledCompleteRef.current && onAnimationComplete) {
          hasCalledCompleteRef.current = true;
          onAnimationComplete();
        }
      }, waitDuration);
      return () => clearTimeout(timeoutId);
    }
  }, [content, theme.textEffects?.animation, theme.textEffects?.typewriterSpeed, theme.textEffects?.fadeInDuration, animationDelay, skipAnimation, onAnimationComplete]);

  // Content length checks for rendering decisions (matching TextElement)
  const contentLength = content?.length || 0;
  const isLongContent = contentLength > 80;
  const isVeryLongContent = contentLength > 200;

  // Calculate font size - use theme's textFontSize for dialogs for consistent sizing
  // Height-based calculation was causing inconsistent sizes depending on ASML import dimensions
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else {
    // Use theme font size for consistent dialog text
    computedFontSize = theme.fonts.textFontSize ?? 18;
  }
  // Apply mobile font scale multiplier
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }

  const animation = theme.textEffects?.animation || 'none';
  // Use stored textAlign (set by smart sizing or user override), fall back to auto-alignment
  const computedTextAlign = location.textAlign || (isLongContent ? 'left' : 'center');
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : theme.fonts.textFont;

  // Calculate padding as percentage of box size
  const paddingHorizontal = Math.max(Math.floor(location.width * 0.04), 12);
  const paddingVertical = Math.max(Math.floor(location.height * 0.1), 12);
  const totalPadding = Math.max(paddingHorizontal, paddingVertical);

  // Smart text box sizing: grow horizontally first, then vertically, scroll only as last resort
  let dimensionStyle: React.CSSProperties;
  let needsScroll = false;
  if (location.manuallyResized) {
    // User manually resized: use stored dimensions as minimum, allow growth for content
    dimensionStyle = {
      left: `${location.x}px`,
      width: `${location.width}px`,
      height: 'auto',
      minHeight: `${location.height}px`,
      overflowY: 'auto',
    };
  } else {
    // Smart sizing: compute dimensions at render time (identical in editor + preview)
    const hasButton = beatType ? BUTTON_BEAT_TYPES.includes(beatType) : true;
    const isNoButtonBeat = beatType ? NO_BUTTON_BEAT_TYPES.includes(beatType) : false;
    const effectiveButtonHeight = (hasButton && !isNoButtonBeat)
      ? (calculatedButtonHeight > 0 ? calculatedButtonHeight : DEFAULT_BUTTON_HEIGHT)
      : 0;

    // Calculate portrait inline width for smart sizing
    const hasDialogInlinePortrait = speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'inside-left' || theme.speakerDisplay?.graphicPosition === 'inside-right');
    const dialogPortraitInlineWidth = hasDialogInlinePortrait ? (theme.speakerDisplay?.graphicSize ?? 48) + 8 : 0;

    const smartDims = calculateSmartTextBoxDimensions(
      content,
      computedFontSize,
      { x: location.x, y: location.y, width: location.width, height: location.height },
      totalPadding,
      effectiveButtonHeight,
      stageWidth,
      stageHeight,
      dialogPortraitInlineWidth
    );

    console.log(`[DialogElement] "${location.name}" smartDims: input(x=${location.x}, y=${location.y}, w=${location.width}, h=${location.height}) -> output(w=${smartDims.width}, h=${smartDims.height}, needsScroll=${smartDims.needsScroll}, xOffset=${smartDims.xOffset}, yOffset=${smartDims.yOffset}), fontSize=${computedFontSize}, buttonHeight=${effectiveButtonHeight}`);

    needsScroll = smartDims.needsScroll;
    const adjustedLeft = location.x - smartDims.xOffset;
    const adjustedTop = location.y - (smartDims.yOffset || 0);

    // For dynamically generated content, skip minHeight — the 15% height buffer
    // in smart sizing overshoots for AI/online content. Let height:auto fit exactly.
    const DYNAMIC_BEATS = ['aiInfoText', 'aiDurScreen', 'aiDialogTree', 'aiSummary', 'onlineContent'];
    const skipMinHeight = beatType ? DYNAMIC_BEATS.includes(beatType) : false;

    dimensionStyle = {
      left: `${adjustedLeft}px`,
      top: `${adjustedTop}px`,
      width: `${smartDims.width}px`,
      height: 'auto',
      minHeight: skipMinHeight ? undefined : `${smartDims.height}px`,
      overflowY: 'auto',
    };
  }

  // Use theme colors for text box styling
  const opacityValue = theme.textBox.opacity / 100;
  const bgColor = hideTextBox ? 'transparent' : theme.textBox.backgroundColor;
  const bgColorWithOpacity = bgColor.startsWith('#') && !hideTextBox
    ? `rgba(${parseInt(bgColor.slice(1,3), 16)}, ${parseInt(bgColor.slice(3,5), 16)}, ${parseInt(bgColor.slice(5,7), 16)}, ${opacityValue})`
    : bgColor;

  // Use textbox frame image if available (from theme assets, e.g., Ren'Py import)
  const hasFrameImage = !hideTextBox && theme.textboxFrameUrl;

  // For typewriter animation, render full text but make unrevealed characters transparent
  const revealedLength = displayedText.length;

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        ...dimensionStyle,
        // Keep position from style (absolute) - scroll indicator is positioned within inner wrapper
        // Use frame image if available, otherwise use solid background
        ...(hasFrameImage ? {
          backgroundImage: `url(${theme.textboxFrameUrl})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundColor: 'transparent',
        } : {
          backgroundColor: bgColorWithOpacity,
        }),
        border: hideTextBox || hasFrameImage ? 'none' : `${theme.textBox.borderWidth}px solid ${theme.textBox.borderColor}`,
        borderRadius: hideTextBox || hasFrameImage ? '0' : `${theme.textBox.borderRadius}px`,
        padding: hideTextBox ? '0' : `${paddingVertical}px ${paddingHorizontal}px`,
        fontSize: `${computedFontSize}px`,
        fontFamily: computedFont,
        color: theme.colors.textColor,
        boxShadow: hideTextBox ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
        textAlign: computedTextAlign,
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        boxSizing: 'border-box',
        // Dialog elements use top-aligned text (block display) to match visual editor behavior
        // This ensures consistency between editor and preview for multi-line content
        display: 'block',
        lineHeight: '1.5',
      }}
    >
      {/* Inner wrapper for scroll indicator positioning */}
      <div style={{
        position: 'relative',
        width: '100%',
        // Only set height for scrollable content
        height: needsScroll ? '100%' : undefined,
      }}>
        {/* Speaker portrait inside dialog box (floated) */}
        {speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'inside-left' || theme.speakerDisplay?.graphicPosition === 'inside-right') && (() => {
          const isLeft = theme.speakerDisplay?.graphicPosition === 'inside-left';
          const size = theme.speakerDisplay?.graphicSize ?? 48;
          return (
            <img
              src={speakerPortraitUrl}
              alt={speakerName || ''}
              style={{
                float: isLeft ? 'left' : 'right',
                width: size,
                height: size,
                objectFit: 'cover',
                borderRadius: 6,
                marginRight: isLeft ? 8 : 0,
                marginLeft: isLeft ? 0 : 8,
                marginBottom: 4,
              }}
            />
          );
        })()}
        {/* Speaker name inline (bold first line) */}
        {speakerName && theme.speakerDisplay?.nameStyle === 'inline' && (
          <div style={{
            fontWeight: 700,
            fontSize: `${Math.round((location.fontSize ?? theme.fonts?.textFontSize ?? 16) * 1.1 * mobileFontScale)}px`,
            marginBottom: 4,
            color: theme.speakerDisplay?.nameColor || undefined,
          }}>
            {speakerName}
          </div>
        )}
        <span style={{ display: 'block', width: '100%', textAlign: computedTextAlign }}>
          {animation === 'typewriter' ? (
            hyperlinks && hyperlinks.length > 0 && onAction ? (
              // For hypertext, just show the revealed portion (hyperlinks would be complex to handle with transparency)
              <HyperTextContent
                text={displayedText}
                hyperlinks={hyperlinks}
                onLinkClick={onAction}
              />
            ) : (
              <>
                {/* Revealed portion - visible */}
                <span>{content.substring(0, revealedLength)}</span>
                {/* Unrevealed portion - transparent (maintains spacing) */}
                <span style={{ color: 'transparent' }}>{content.substring(revealedLength)}</span>
              </>
            )
          ) : (
            hyperlinks && hyperlinks.length > 0 && onAction ? (
              <HyperTextContent
                text={displayedText}
                hyperlinks={hyperlinks}
                onLinkClick={onAction}
              />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: renderMarkdownLite(displayedText) }} />
            )
          )}
        </span>
        {/* Scroll indicators - only show when scrolling is enabled, hide once user starts scrolling */}
        {editorMode ? (
          <ScrollBadge visible={hasOverflow} fontScale={mobileFontScale} />
        ) : (
          needsScroll && hasOverflow && !hasScrolled && <ScrollIndicator position="bottom" fontScale={mobileFontScale} />
        )}
      </div>
    </div>
  );
};

/**
 * Asset element renderer (character/prop)
 */
/**
 * Animated sprite component that cycles through frames based on active animation
 * Memoized to prevent re-renders from parent position updates during path animation
 */
interface AnimatedSpriteProps {
  assetUrl: string;
  spriteSheet: SpriteSheetData;
  finalStyle: React.CSSProperties;
  isClickable: boolean;
  onClick: () => void;
}

// Track mount count globally for debugging
let animatedSpriteMountCount = 0;

const AnimatedSpriteInner: React.FC<AnimatedSpriteProps> = ({ assetUrl, spriteSheet, finalStyle, isClickable, onClick }) => {
  const [currentFrameIndex, setCurrentFrameIndex] = React.useState(0);
  const startTimeRef = React.useRef<number>(Date.now());
  const animationFrameIdRef = React.useRef<number | null>(null);
  const activeAnimRef = React.useRef<{ name: string; frames: number[]; frameDuration: number } | null>(null);
  const prevAnimationKeyRef = React.useRef<string | null>(null);
  const prevAnimationsRef = React.useRef<typeof spriteSheet.animations | null>(null);

  // Debug: track mount/unmount
  React.useEffect(() => {
    animatedSpriteMountCount++;
    console.log('[AnimatedSprite] MOUNTED, total mounts:', animatedSpriteMountCount);
    return () => {
      console.log('[AnimatedSprite] UNMOUNTED');
    };
  }, []);

  // Debug: check if animations array reference changes unexpectedly
  if (prevAnimationsRef.current !== null && prevAnimationsRef.current !== spriteSheet.animations) {
    console.warn('[AnimatedSprite] animations array reference changed!', {
      prevLength: prevAnimationsRef.current?.length,
      newLength: spriteSheet.animations?.length,
      activeAnimation: spriteSheet.activeAnimation,
    });
  }
  prevAnimationsRef.current = spriteSheet.animations;

  // Create a stable animations map to avoid recalculating on every render
  // This uses a ref to compare content and only update when animations actually change
  const stableAnimationsRef = React.useRef<Map<string, { frames: number[]; frameDuration: number }>>(new Map());

  // Update stable animations map only when content changes
  React.useMemo(() => {
    if (!spriteSheet.animations?.length) {
      stableAnimationsRef.current.clear();
      return;
    }

    // Check if content has changed by comparing animation count and content
    const currentMap = stableAnimationsRef.current;
    let hasChanged = currentMap.size !== spriteSheet.animations.length;

    if (!hasChanged) {
      for (const anim of spriteSheet.animations) {
        const existing = currentMap.get(anim.name);
        if (!existing ||
            existing.frameDuration !== anim.frameDuration ||
            existing.frames.length !== anim.frames.length ||
            existing.frames.some((f, i) => f !== anim.frames[i])) {
          hasChanged = true;
          break;
        }
      }
    }

    if (hasChanged) {
      currentMap.clear();
      for (const anim of spriteSheet.animations) {
        currentMap.set(anim.name, {
          frames: [...anim.frames],
          frameDuration: anim.frameDuration,
        });
      }
    }
  }, [spriteSheet.animations]);

  // Create a stable key for the animation to detect actual content changes
  // This prevents animation restart when array reference changes but content is same
  const animationKey = React.useMemo(() => {
    if (!spriteSheet.activeAnimation) {
      return null;
    }
    const anim = stableAnimationsRef.current.get(spriteSheet.activeAnimation);
    if (!anim) {
      // Debug: animation not found
      if (spriteSheet.animations?.length) {
        console.warn('[AnimatedSprite] Animation not found:', spriteSheet.activeAnimation, 'available:', Array.from(stableAnimationsRef.current.keys()));
      }
      return null;
    }
    // Create a key from the animation's actual content
    return `${spriteSheet.activeAnimation}:${anim.frames.join(',')}:${anim.frameDuration}`;
  }, [spriteSheet.activeAnimation]);

  // Get the active animation data using stable lookup
  const activeAnim = React.useMemo(() => {
    if (!spriteSheet.activeAnimation) {
      return null;
    }
    const animData = stableAnimationsRef.current.get(spriteSheet.activeAnimation);
    if (!animData) {
      return null;
    }
    return {
      name: spriteSheet.activeAnimation,
      frames: animData.frames,
      frameDuration: animData.frameDuration,
    };
  }, [spriteSheet.activeAnimation]);

  // Animation loop - only restart when animationKey changes (actual content change)
  React.useEffect(() => {
    // If no animation, stop any running loop
    if (!activeAnim || activeAnim.frames.length === 0) {
      if (animationFrameIdRef.current) {
        console.log('[AnimatedSprite] Stopping animation - no active animation');
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      activeAnimRef.current = null;
      setCurrentFrameIndex(0);
      return;
    }

    // Detect if animation is changing rapidly (potential cause of blinking)
    if (prevAnimationKeyRef.current !== null && prevAnimationKeyRef.current !== animationKey) {
      console.log('[AnimatedSprite] Animation key changed from', prevAnimationKeyRef.current, 'to', animationKey);
    }
    prevAnimationKeyRef.current = animationKey;
    console.log('[AnimatedSprite] Animation changed:', activeAnim.name, 'frames:', activeAnim.frames, 'duration:', activeAnim.frameDuration);

    // Store the current animation data in ref for the animation loop to use
    activeAnimRef.current = {
      name: activeAnim.name,
      frames: activeAnim.frames,
      frameDuration: activeAnim.frameDuration || 100,
    };

    // Reset frame index when animation changes to start from beginning
    setCurrentFrameIndex(0);

    // Only start a new animation loop if one isn't already running
    // or if the animation content actually changed
    if (animationFrameIdRef.current === null) {
      console.log('[AnimatedSprite] Starting new animation loop for:', activeAnim.name);
      startTimeRef.current = Date.now();

      const animate = () => {
        const anim = activeAnimRef.current;
        if (!anim) return;

        const elapsed = Date.now() - startTimeRef.current;
        const frameCount = anim.frames.length;
        const newIndex = Math.floor(elapsed / anim.frameDuration) % frameCount;
        setCurrentFrameIndex(newIndex);
        animationFrameIdRef.current = requestAnimationFrame(animate);
      };

      animationFrameIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [animationKey]); // Only depend on the stable animationKey, not the activeAnim object

  // Calculate frame position with bounds checking
  // When switching animations, currentFrameIndex might be out of bounds for the new animation
  // Also handle edge case where frames array might be empty
  const safeFrameIndex = activeAnim && activeAnim.frames.length > 0
    ? Math.min(Math.max(0, currentFrameIndex), activeAnim.frames.length - 1)
    : 0;
  const frameIndex = activeAnim && activeAnim.frames.length > 0
    ? (activeAnim.frames[safeFrameIndex] ?? spriteSheet.defaultFrame ?? 0)
    : (spriteSheet.defaultFrame || 0);

  // Debug: track frame index jumps for run animation (high frequency, so only log occasional samples)
  const frameDebugRef = React.useRef({ lastFrame: -1, sampleCount: 0, loggedFrames: false });
  if (activeAnim?.name === 'run') {
    // Log the full frames array once
    if (!frameDebugRef.current.loggedFrames) {
      console.log('[AnimatedSprite:run] frames array:', activeAnim.frames, 'frameDuration:', activeAnim.frameDuration);
      frameDebugRef.current.loggedFrames = true;
    }
    if (frameDebugRef.current.sampleCount++ % 30 === 0) {
      if (frameIndex !== frameDebugRef.current.lastFrame) {
        console.log('[AnimatedSprite:run] frame jump:', frameDebugRef.current.lastFrame, '->', frameIndex, 'safeIdx:', safeFrameIndex, 'curIdx:', currentFrameIndex);
        frameDebugRef.current.lastFrame = frameIndex;
      }
    }
  } else {
    // Reset when not in run animation
    frameDebugRef.current.loggedFrames = false;
  }
  const framesPerRow = spriteSheet.imageWidth
    ? Math.floor(spriteSheet.imageWidth / spriteSheet.frameWidth)
    : 10;
  const col = frameIndex % framesPerRow;
  const row = Math.floor(frameIndex / framesPerRow);
  const bgPosX = -col * spriteSheet.frameWidth;
  const bgPosY = -row * spriteSheet.frameHeight;

  // Debug: log sprite position calculation once for run animation
  const posDebugRef = React.useRef(false);
  if (activeAnim?.name === 'run' && !posDebugRef.current) {
    console.log('[AnimatedSprite:run] sprite calc:', {
      imageWidth: spriteSheet.imageWidth,
      frameWidth: spriteSheet.frameWidth,
      frameHeight: spriteSheet.frameHeight,
      framesPerRow,
      frameIndex,
      col,
      row,
      bgPosX,
      bgPosY,
    });
    posDebugRef.current = true;
  }

  return (
    <div
      style={{
        ...finalStyle,
        width: spriteSheet.frameWidth,
        height: spriteSheet.frameHeight,
        backgroundColor: 'transparent',
        backgroundImage: `url(${assetUrl})`,
        backgroundPosition: `${bgPosX}px ${bgPosY}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        cursor: isClickable ? 'pointer' : 'default',
        transition: isClickable ? 'filter 0.1s ease' : undefined,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.filter = 'brightness(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.filter = '';
        }
      }}
    />
  );
};

// Memoized AnimatedSprite - re-render for all prop changes but the internal animation
// loop won't restart unless animationKey changes (controlled by useEffect dependency)
const AnimatedSprite = React.memo(AnimatedSpriteInner);

const AssetElement: React.FC<{
  style: React.CSSProperties;
  assetUrl?: string;
  assetId?: string;
  assetType?: 'image' | 'audio' | 'video' | 'font';  // Asset type for rendering
  editorMode?: boolean;  // True when in Visual Editor (show first frame, no autoplay)
  name: string;
  kind: string;
  size?: number;  // Character-specific: scale percentage (e.g., 90 = 90% scale)
  interactive?: boolean;
  actionId?: string;
  onAction?: (id: string) => void;
  sound?: string;  // Sound to play when clicked (for PickProp)
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>; // Resolver for sound blobs
  spriteSheet?: SpriteSheetData;  // Sprite sheet configuration for character sprites
  description?: string;  // Tooltip text shown on hover (e.g., pickProp item description)
  theme?: RenderThemeSettings;  // Theme for tooltip styling
}> = ({ style, assetUrl, assetId, assetType, editorMode, name, kind, size, interactive, actionId, onAction, sound, soundBlobResolver, spriteSheet, description, theme }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const showTooltip = interactive && description && description.length > 0 && isHovered;
  // Click handler for interactive props (PickProp beat)
  const handleClick = async () => {
    if (interactive && actionId && onAction) {
      console.log(`[AssetElement] Clicked "${name}" with actionId: ${actionId}`);

      // Play sound if assigned - wait for completion before action
      if (sound) {
        try {
          const audioManager = getAudioManager();

          // Check if it's a preset sound (external URL)
          if (isPresetSound(sound)) {
            const preset = getPresetSound(sound);
            if (preset) {
              console.log(`[AssetElement] Playing preset sound (waiting): ${preset.name}`);
              await audioManager.playSoundAndWait(preset.url, preset.volume);
            }
          } else if (soundBlobResolver) {
            // Custom asset - use blob resolver to get fresh blob data
            console.log(`[AssetElement] Loading sound blob for: ${sound}`);
            const blob = await soundBlobResolver(sound);
            if (blob) {
              console.log(`[AssetElement] Playing sound from blob (waiting)`);
              await audioManager.playSoundFromBlobAndWait(blob, 1.0, sound);
            } else {
              console.warn(`[AssetElement] Could not resolve sound: ${sound}`);
            }
          } else if (sound.startsWith('http')) {
            // External URL - use playSoundAndWait
            console.log(`[AssetElement] Playing external sound (waiting): ${sound}`);
            await audioManager.playSoundAndWait(sound);
          } else {
            console.warn(`[AssetElement] No sound resolver available for: ${sound}`);
          }
        } catch (error) {
          console.error('[AssetElement] Error playing sound:', error);
          // Don't block the action if sound fails
        }
      }

      // Call action after sound completes
      onAction(actionId);
    }
  };

  const isClickable = interactive && actionId && onAction;

  // Tooltip portal for prop descriptions
  const tooltipPortal = showTooltip ? ReactDOM.createPortal(
    <div style={{
      position: 'fixed',
      left: mousePos.x + 12,
      top: mousePos.y - 8,
      backgroundColor: theme?.button?.backgroundColor || '#333',
      color: theme?.button?.textColor || '#fff',
      padding: '6px 12px',
      borderRadius: `${theme?.button?.borderRadius || 4}px`,
      fontSize: '14px',
      fontFamily: theme?.fonts?.buttonFont || 'inherit',
      fontWeight: 'normal',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      border: `1px solid ${theme?.button?.borderColor || '#555'}`,
      pointerEvents: 'none' as const,
      zIndex: 10000,
      whiteSpace: 'pre-line' as const,
      maxWidth: '300px',
    }}>{description}</div>,
    document.body
  ) : null;

  // Apply character-specific size scaling
  // size is a percentage (e.g., 90 means 90% of the original size, 115 means 115%)
  const finalStyle: React.CSSProperties = { ...style };

  // Always apply size scaling for character/prop elements when size is defined
  // This works with width/height: 'auto' to scale the natural image dimensions
  if (size !== undefined) {
    const scaleFactor = size / 100;
    // Add scale transform to existing transforms
    const existingTransform = finalStyle.transform || '';
    finalStyle.transform = existingTransform
      ? `${existingTransform} scale(${scaleFactor})`
      : `scale(${scaleFactor})`;
    // Only set top-left origin if there's no existing transform (which might include flip)
    // If there are flip transforms, keep the center origin for correct flip behavior
    if (!existingTransform) {
      finalStyle.transformOrigin = 'top left';
    }
  }

  if (assetUrl) {
    // For sprite sheets, render using CSS background-position to show a specific frame
    if (spriteSheet && spriteSheet.frameWidth > 0 && spriteSheet.frameHeight > 0) {
      // Use AnimatedSprite for active animations, otherwise static sprite
      const shouldAnimate = spriteSheet.activeAnimation && spriteSheet.animations?.length;

      // Debug: detect when we switch between animated and static
      const wasAnimatingRef = React.useRef<boolean | null>(null);
      if (wasAnimatingRef.current !== null && wasAnimatingRef.current !== !!shouldAnimate) {
        console.warn('[AssetElement] Animation state changed!', {
          wasAnimating: wasAnimatingRef.current,
          shouldAnimate: !!shouldAnimate,
          activeAnimation: spriteSheet.activeAnimation,
          animationsLength: spriteSheet.animations?.length,
        });
      }
      wasAnimatingRef.current = !!shouldAnimate;

      if (shouldAnimate) {
        return (
          <AnimatedSprite
            assetUrl={assetUrl}
            spriteSheet={spriteSheet}
            finalStyle={finalStyle}
            isClickable={!!isClickable}
            onClick={handleClick}
          />
        );
      }

      // Static sprite - calculate frame position (default to frame 0)
      const frameIndex = spriteSheet.defaultFrame || 0;
      const framesPerRow = spriteSheet.imageWidth
        ? Math.floor(spriteSheet.imageWidth / spriteSheet.frameWidth)
        : 10; // Fallback to reasonable default
      const col = frameIndex % framesPerRow;
      const row = Math.floor(frameIndex / framesPerRow);
      const bgPosX = -col * spriteSheet.frameWidth;
      const bgPosY = -row * spriteSheet.frameHeight;

      return (
        <div
          style={{
            ...finalStyle,
            width: spriteSheet.frameWidth,
            height: spriteSheet.frameHeight,
            backgroundColor: 'transparent',
            backgroundImage: `url(${assetUrl})`,
            backgroundPosition: `${bgPosX}px ${bgPosY}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
            cursor: isClickable ? 'pointer' : 'default',
            transition: isClickable ? 'transform 0.1s ease, filter 0.1s ease' : undefined,
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (isClickable) {
              e.currentTarget.style.filter = 'brightness(1.1)';
              e.currentTarget.style.transform = (finalStyle.transform || '') + ' scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (isClickable) {
              e.currentTarget.style.filter = '';
              e.currentTarget.style.transform = finalStyle.transform || '';
            }
          }}
        />
      );
    }

    // Video rendering — detect by asset type or URL extension
    const isVideo = assetType === 'video' || /\.(mp4|webm|mov|ogv)(\?|$)/i.test(assetUrl);
    if (isVideo) {
      return (
        <>
          <video
            src={assetUrl}
            style={{
              ...finalStyle,
              objectFit: 'contain',
              cursor: isClickable ? 'pointer' : 'default',
            }}
            muted={editorMode}
            autoPlay={!editorMode}
            loop={editorMode}
            playsInline
            preload="metadata"
            draggable={false}
            onClick={handleClick}
          />
          {tooltipPortal}
        </>
      );
    }

    // Standard image rendering (non-sprite)
    return (
      <>
        <img
          src={assetUrl}
          alt={name}
          style={{
            ...finalStyle,
            // Don't constrain image - let it render at natural size (scaled by size %)
            objectFit: 'none',
            maxWidth: 'none',
            maxHeight: 'none',
            // Make clickable props visually interactive
            cursor: isClickable ? 'pointer' : 'default',
            transition: isClickable ? 'transform 0.1s ease, filter 0.1s ease' : undefined,
          }}
          draggable={false}
          onClick={handleClick}
          onMouseEnter={(e) => {
            setIsHovered(true);
            if (isClickable) {
              e.currentTarget.style.filter = 'brightness(1.1)';
              e.currentTarget.style.transform = (finalStyle.transform || '') + ' scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            setIsHovered(false);
            if (isClickable) {
              e.currentTarget.style.filter = '';
              e.currentTarget.style.transform = finalStyle.transform || '';
            }
          }}
          onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        />
        {tooltipPortal}
      </>
    );
  }

  // Placeholder for missing asset - use reasonable default size
  const placeholderStyle: React.CSSProperties = {
    ...finalStyle,
    // Use explicit dimensions for placeholder when style has 'auto'
    width: style.width === 'auto' ? '150px' : style.width,
    height: style.height === 'auto' ? '200px' : style.height,
    backgroundColor: 'rgba(211, 211, 211, 0.5)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: '#6b7280',
    border: '2px dashed #9ca3af',
    padding: '8px',
    textAlign: 'center',
  };

  return (
    <div style={placeholderStyle}>
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{name}</div>
      <div style={{ fontSize: '10px', opacity: 0.7 }}>({kind})</div>
      {assetId && (
        <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', wordBreak: 'break-all' }}>
          Asset ID: {assetId}
        </div>
      )}
    </div>
  );
};

/**
 * Meter element renderer - displays a counter value as a level meter bar
 */
const MeterElement: React.FC<{
  style: React.CSSProperties;
  location: Location;
  counterValue: number;
  counterMin: number;
  counterMax: number;
  theme: RenderThemeSettings;
  fontScale?: number;
}> = ({ style, location, counterValue, counterMin, counterMax, theme, fontScale = 1.0 }) => {
  const isHorizontal = location.meterOrientation !== 'vertical';
  const percentage = counterMax > counterMin
    ? Math.min(100, Math.max(0, ((counterValue - counterMin) / (counterMax - counterMin)) * 100))
    : 0;

  const barColor = location.meterColor || '#3B82F6';
  const bgColor = location.meterBackgroundColor || 'rgba(255, 255, 255, 0.3)';

  // Format numeric value based on format setting
  const formatValue = () => {
    if (!location.showNumericValue) return null;
    switch (location.numericFormat) {
      case 'fraction':
        return `${counterValue}/${counterMax}`;
      case 'percentage':
        return `${Math.round(percentage)}%`;
      default:
        return `${counterValue}`;
    }
  };

  const numericDisplay = formatValue();

  return (
    <div style={style}>
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Bar container */}
        <div
          style={{
            flex: 1,
            width: isHorizontal ? '100%' : undefined,
            height: isHorizontal ? '100%' : '100%',
            minWidth: isHorizontal ? undefined : '100%',
            backgroundColor: bgColor,
            borderRadius: '4px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column-reverse',
            border: '1px solid rgba(0, 0, 0, 0.2)',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Fill bar */}
          <div
            style={{
              width: isHorizontal ? `${percentage}%` : '100%',
              height: isHorizontal ? '100%' : `${percentage}%`,
              backgroundColor: barColor,
              borderRadius: '3px',
              transition: 'all 300ms ease-out',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
            }}
          />
        </div>

        {/* Numeric value display */}
        {numericDisplay && (
          <span
            style={{
              fontSize: `${Math.round(12 * fontScale)}px`,
              fontWeight: 'bold',
              color: theme.colors.textColor,
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              minWidth: isHorizontal ? '40px' : undefined,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {numericDisplay}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Helper function to create positioned element data from locations and content
 * @param assetResolver Optional function to resolve asset IDs to URLs
 */
/**
 * Convert base64 data URL to blob URL (to avoid memory issues)
 */
function convertBase64ToBlob(base64: string): string {
  if (!base64.startsWith('data:')) {
    return base64; // Not a data URL, return as-is
  }
  try {
    const parts = base64.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    const blob = new Blob([u8arr], { type: mime });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('[PositionedBeatView] Error converting base64 to blob:', error);
    return base64; // Fallback to original
  }
}

export function createPositionedElementData(
  locations: Location[],
  content: Record<string, any>,
  beatType: string,
  assetResolver?: (assetId: string) => string | undefined,
  characterResolver?: (characterId: string, stateId?: string) => string | undefined,
  counterResolver?: (counterName: string) => { value: number; min: number; max: number } | null,
  spriteDataResolver?: (characterId: string) => SpriteSheetData | null
): PositionedElementData[] {
  console.log('[createPositionedElementData] Creating elements:', { beatType, content, locationCount: locations.length });

  return locations.map((location) => {
    // Use location.content if explicitly provided (for phase-aware rendering)
    // Otherwise derive from beat content using schema mapping
    const elementContent = (location as any).content !== undefined
      ? (location as any).content
      : getContentForLocation(location, content, beatType);
    console.log(`[createPositionedElementData] Location "${location.name}" (${location.kind}) → content: "${elementContent}"${(location as any).content !== undefined ? ' (from location)' : ''}`);

    // Store the content in a way that the renderer will use
    // We need to ensure the content is properly passed through

    // Resolve asset URL: handle character elements specially
    let resolvedAssetUrl: string | undefined;
    let spriteSheet: SpriteSheetData | undefined;

    // For character elements, use characterResolver to resolve characterId + stateId to image URL
    if (location.kind === 'character' && location.characterId && characterResolver) {
      resolvedAssetUrl = characterResolver(location.characterId, location.stateId);
      console.log(`[createPositionedElementData] Character "${location.name}" → resolved via characterResolver: ${resolvedAssetUrl ? 'found' : 'not found'}`);

      // Get sprite sheet data if the character has one
      if (spriteDataResolver) {
        const spriteData = spriteDataResolver(location.characterId);
        if (spriteData) {
          spriteSheet = spriteData;
          console.log(`[createPositionedElementData] Character "${location.name}" has sprite sheet:`, {
            frameWidth: spriteData.frameWidth,
            frameHeight: spriteData.frameHeight,
            hasAnimations: !!(spriteData as any).animations?.length,
            activeAnimation: (spriteData as any).activeAnimation,
          });
        }
      }
    }

    // Fall back to assetId resolution for non-character elements or if character resolver didn't find anything
    if (!resolvedAssetUrl && location.assetId && assetResolver) {
      resolvedAssetUrl = assetResolver(location.assetId);
    }
    if (!resolvedAssetUrl && location.imageUrl) {
      resolvedAssetUrl = location.imageUrl;
      // Convert base64 to blob URL if needed
      if (resolvedAssetUrl.startsWith('data:')) {
        resolvedAssetUrl = convertBase64ToBlob(resolvedAssetUrl);
        console.log(`[createPositionedElementData] Converted base64 to blob URL for "${location.name}"`);
      }
    }

    // Extract actionId and targetBeatId for beats that have choice/option mappings
    let actionId: string | undefined;
    let targetBeatId: string | undefined;
    let description: string | undefined;
    const markVisited = content.markVisited || false;

    // For movementChoice: match location.name to choice properties with multiple fallbacks
    if (beatType === 'movementChoice' && content.choices && Array.isArray(content.choices)) {
      // First priority: match by locationName field (explicit association set in builder)
      let choice = content.choices.find((c: any) => c.locationName && c.locationName === location.name);
      if (choice) {
        console.log(`[createPositionedElementData] MovementChoice: matched by locationName "${location.name}"`);
      }
      // Try matching by text (since SchemaLocationInitializer uses choice.text for location.name)
      if (!choice) {
        choice = content.choices.find((c: any) => c.text === location.name);
      }
      // Fallback to location match
      if (!choice) {
        choice = content.choices.find((c: any) => c.location === location.name);
      }
      // Fallback to id match (for legacy imports where hotspot name matches choice id)
      if (!choice) {
        choice = content.choices.find((c: any) => c.id === location.name);
      }
      // Fallback to index match if location.name has numeric suffix (e.g., "hotspot_0" → choices[0])
      if (!choice && location.name) {
        const indexMatch = location.name.match(/[_-]?(\d+)$/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1], 10);
          if (index >= 0 && index < content.choices.length) {
            choice = content.choices[index];
            console.log(`[createPositionedElementData] MovementChoice: matched by index ${index}`);
          }
        }
      }
      // Fallback to case-insensitive partial match - for hotspot and prop elements
      // Don't try to match text, character, or other non-interactive elements to choices
      if (!choice && location.name && (location.kind === 'hotspot' || location.kind === 'prop')) {
        const locNameLower = location.name.toLowerCase();
        choice = content.choices.find((c: any) => {
          // Only match if both sides have content
          const choiceText = c.text?.toLowerCase();
          const choiceLoc = c.location?.toLowerCase();
          if (choiceText && choiceText.includes(locNameLower)) return true;
          if (choiceLoc && choiceLoc.includes(locNameLower)) return true;
          if (choiceText && locNameLower.includes(choiceText)) return true;
          if (choiceLoc && locNameLower.includes(choiceLoc)) return true;
          return false;
        });
        if (choice) {
          console.log(`[createPositionedElementData] MovementChoice: matched by partial/case-insensitive match`);
        }
      }
      if (choice) {
        actionId = choice.id;
        targetBeatId = choice.target;
        console.log(`[createPositionedElementData] MovementChoice: location "${location.name}" (kind=${location.kind}) → choice ID "${actionId}", target "${targetBeatId}", markVisited=${markVisited}`);
      } else if (location.kind === 'hotspot' || location.kind === 'prop') {
        // Only warn for interactive element types that should have been matched
        console.warn(`[createPositionedElementData] MovementChoice: NO MATCH for location "${location.name}" (kind=${location.kind})`);
        console.log(`[createPositionedElementData] Available choices:`, content.choices.map((c: any) => ({ id: c.id, text: c.text, location: c.location, locationName: c.locationName })));
      }
    }

    // For dialogTree: match location.name to choice.text or index to get choice.id
    if (beatType === 'dialogTree' && content.choices && Array.isArray(content.choices)) {
      const locNameLower = location.name?.toLowerCase() || '';
      // Try exact text match first
      let choice = content.choices.find((c: any) => c.text === location.name);
      if (!choice) {
        // Try matching by index (e.g., "button1" → choices[0])
        const indexMatch = locNameLower.match(/button\s*(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1], 10) - 1;
          if (index >= 0 && index < content.choices.length) {
            choice = content.choices[index];
            console.log(`[createPositionedElementData] DialogTree: matched by index ${index}`);
          }
        }
      }
      // Better fallback: use the button's position among all buttons to find the choice
      if (!choice && location.kind === 'button' && content.choices.length > 0) {
        // Count how many buttons we've seen so far to determine this button's index
        const buttonIndex = locations
          .slice(0, locations.indexOf(location))
          .filter(loc => loc.kind === 'button').length;
        if (buttonIndex >= 0 && buttonIndex < content.choices.length) {
          choice = content.choices[buttonIndex];
          console.log(`[createPositionedElementData] DialogTree: matched by button position ${buttonIndex}`);
        } else {
          // Last resort: use first choice (shouldn't happen often)
          choice = content.choices[0];
          console.log(`[createPositionedElementData] DialogTree: using first choice as last resort fallback`);
        }
      }
      if (choice) {
        actionId = choice.id;
        // DialogTree choices can have target (beat ID) or dialogNode (nested dialog)
        // Only set targetBeatId when markVisited is enabled for this beat
        if (markVisited) {
          targetBeatId = choice.target;
        }
        console.log(`[createPositionedElementData] DialogTree: location "${location.name}" → choice ID "${actionId}", target "${targetBeatId}", markVisited=${markVisited}`);
      }
    }

    // For pickProp: match location.name to prop.locationName first, then prop.name (like movementChoice)
    if (beatType === 'pickProp' && content.props && Array.isArray(content.props)) {
      const locNameLower = location.name?.toLowerCase() || '';
      // First priority: explicit locationName association (like movementChoice)
      let prop = content.props.find((p: any) => p.locationName && p.locationName === location.name);
      // Second: exact name match
      if (!prop) {
        prop = content.props.find((p: any) => p.name === location.name);
      }
      // Third: case-insensitive partial match (e.g., "Axe" matches "Axe.png" or vice versa)
      if (!prop && locNameLower) {
        prop = content.props.find((p: any) => {
          const propNameLower = p.name?.toLowerCase() || '';
          return propNameLower && (
            locNameLower.includes(propNameLower) ||
            propNameLower.includes(locNameLower)
          );
        });
      }
      if (prop) {
        actionId = prop.id;
        description = prop.description || undefined;
        targetBeatId = prop.target;
        console.log(`[createPositionedElementData] PickProp: location "${location.name}" → prop ID "${actionId}" (via ${prop.locationName === location.name ? 'locationName' : prop.name === location.name ? 'exact name' : 'partial match'}), target "${targetBeatId}", markVisited=${markVisited}`);
      }
    }

    // For hyperText: include hyperlinks data for clickable text rendering
    // The links array may come from content.links (from renderHyperText) or content.hyperlinks (from beat params)
    let hyperlinks: HyperlinkData[] | undefined;
    if (beatType === 'hyperText') {
      const links = content.links || content.hyperlinks;
      if (links && Array.isArray(links)) {
        hyperlinks = links.map((link: any) => ({
          word: link.word,
          targetBeatId: link.targetBeatId || link.target,
          style: link.style,
        }));
        console.log(`[createPositionedElementData] HyperText: found ${hyperlinks.length} hyperlinks`);
      }
    }

    // For aiSummary and endScreen: set actionId for buttons
    if ((beatType === 'aiSummary' || beatType === 'endScreen') && location.kind === 'button') {
      const nameLower = location.name?.toLowerCase() || '';
      if (nameLower.includes('restart') || nameLower.includes('play') || nameLower.includes('again')) {
        actionId = 'restart';
      } else if (nameLower.includes('credits')) {
        actionId = 'credits';
      }
    }

    // Resolve counter values for meter elements
    let counterValue: number | undefined;
    let counterMin: number | undefined;
    let counterMax: number | undefined;
    if (location.kind === 'meter' && location.counterName && counterResolver) {
      const counterData = counterResolver(location.counterName);
      if (counterData) {
        counterValue = counterData.value;
        counterMin = counterData.min;
        counterMax = counterData.max;
      }
    }

    // Pass keypad options through for keypad elements
    let keypadLayout: 'numeric' | 'phone' | 'pin' | undefined;
    let keypadMaxDigits: number | undefined;
    let keypadMinDigits: number | undefined;
    let keypadCorrectCode: string | undefined;
    let keypadMaxAttempts: number | undefined;
    let keypadMaskInput: boolean | undefined;
    let keypadButtonText: string | undefined;
    let keypadClearButtonText: string | undefined;
    let keypadShowDisplay: boolean | undefined;
    if (location.kind === 'keypad' && beatType === 'keypad') {
      keypadLayout = content.layout || 'numeric';
      keypadMaxDigits = content.maxDigits || 4;
      keypadMinDigits = content.minDigits || 1;
      keypadCorrectCode = content.correctCode;
      keypadMaxAttempts = content.maxAttempts || 0;
      keypadMaskInput = content.maskInput ?? true;
      keypadButtonText = content.buttonText || 'Enter';
      keypadClearButtonText = content.clearButtonText || 'Clear';
      keypadShowDisplay = content.showDisplay ?? true;
    }

    return {
      location,
      content: elementContent,
      assetUrl: resolvedAssetUrl,
      spriteSheet,
      actionId,
      targetBeatId,
      markVisited,
      description,
      hyperlinks,
      counterValue,
      counterMin,
      counterMax,
      keypadLayout,
      keypadMaxDigits,
      keypadMinDigits,
      keypadCorrectCode,
      keypadMaxAttempts,
      keypadMaskInput,
      keypadButtonText,
      keypadClearButtonText,
      keypadShowDisplay,
    };
  });
}

// Import beat definitions for schema-driven mapping
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

/**
 * Smart content resolution - finds the right content for each location
 * Uses schema-driven approach when possible, falls back to heuristics
 */
function getContentForLocation(
  loc: Location,
  content: Record<string, any>,
  beatType: string
): string {
  const nameLower = loc.name?.toLowerCase() || '';

  // ========================================
  // SCHEMA-DRIVEN MAPPING (highest priority)
  // Try to use locationMapping from beat schema
  // ========================================
  const beatDef = (beatDefinitions as any).beatTypes[beatType];
  if (beatDef?.locationMapping) {
    // Try to find a mapping for this location
    for (const [locationKey, paramKey] of Object.entries(beatDef.locationMapping)) {
      if (nameLower.includes(locationKey.toLowerCase())) {
        const value = content[paramKey as string];
        if (value !== undefined && value !== null) {
          console.log(`[getContentForLocation] Schema mapping: ${loc.name} → ${paramKey} = "${value}"`);
          return String(value);
        }
      }
    }
  }

  // ========================================
  // BEAT-TYPE-SPECIFIC CHECKS (fallback for legacy/complex cases)
  // These handle special cases not covered by simple schema mapping
  // ========================================

  // Title Screen specific elements
  if (beatType === 'titleScreen') {
    if (nameLower.includes('title') && !nameLower.includes('screen')) {
      return content.title || 'Untitled';
    }
    if (nameLower.includes('author')) {
      return content.author ? `by ${content.author}` : '';
    }
    if (nameLower === 'startbutton' || (nameLower.includes('start') && nameLower.includes('button'))) {
      return content.buttonText || 'Start';
    }
  }

  // Info Text / Dur Screen specific elements
  if (beatType === 'infoText' || beatType === 'durScreen') {
    if (nameLower.includes('text') || nameLower.includes('message')) {
      return content.text || '';
    }
    if (nameLower.includes('button') || nameLower.includes('continue')) {
      return content.buttonText || 'Continue';
    }
  }

  // Dialog Tree specific elements
  if (beatType === 'dialogTree') {
    // Text element for dialog content (handles both 'text' and 'dialog' kinds)
    if (loc.kind === 'text' || loc.kind === 'dialog' || nameLower.includes('text') || nameLower.includes('dialog') || nameLower.includes('npc')) {
      return content.text || '';
    }
    // Button elements - match by choice text or index
    if (loc.kind === 'button' && content.choices && content.choices.length > 0) {
      // Try exact match first
      const exactChoice = content.choices.find((c: any) => c.text === loc.name);
      if (exactChoice) {
        return exactChoice.text;
      }
      // Try matching by index (e.g., "button1" → choices[0], "button2" → choices[1])
      const indexMatch = nameLower.match(/button\s*(\d+)/);
      if (indexMatch) {
        const index = parseInt(indexMatch[1], 10) - 1; // button1 = index 0
        if (index >= 0 && index < content.choices.length) {
          return content.choices[index].text;
        }
      }
      // Fallback: return first choice text for any button
      return content.choices[0].text;
    }
  }

  // End Screen specific elements
  if (beatType === 'endScreen') {
    // Check for specific patterns first
    if (nameLower.includes('restart') || nameLower.includes('play') || nameLower.includes('again')) {
      return content.restartText || content.buttonText || 'Play Again';
    }
    if (nameLower.includes('credits')) {
      return content.creditsText || 'Credits';
    }
    if (nameLower.includes('message') || nameLower.includes('end') || nameLower.includes('text')) {
      return content.message || 'The End';
    }
    // Fallback based on element kind for legacy imports
    if (loc.kind === 'button') {
      // Any button on endScreen is likely restart or credits
      return content.restartText || content.buttonText || 'Play Again';
    }
    if (loc.kind === 'text') {
      // Any text on endScreen is likely the message
      return content.message || 'The End';
    }
  }

  // EndScreen Credits page specific elements
  if (beatType === 'endScreenCredits') {
    if (nameLower.includes('title')) {
      return content.creditsTitle || 'Credits';
    }
    if (nameLower.includes('body') || nameLower.includes('text') || nameLower.includes('dialog')) {
      return content.creditsBody || '';
    }
    if (nameLower.includes('close') || nameLower.includes('button')) {
      return content.creditsCloseText || 'Close';
    }
    // Fallback based on element kind
    if (loc.kind === 'dialog') return content.creditsBody || '';
    if (loc.kind === 'button') return content.creditsCloseText || 'Close';
    if (loc.kind === 'text') return content.creditsTitle || 'Credits';
  }

  // AI Summary specific elements - separate title from summary
  if (beatType === 'aiSummary') {
    // Title element
    if (nameLower.includes('title')) {
      return content.title || 'Your Journey';
    }
    // Summary element
    if (nameLower.includes('summary') || nameLower.includes('text') || nameLower.includes('message')) {
      return content.summary || '';
    }
    // Restart button
    if (nameLower.includes('restart') || nameLower.includes('play') || nameLower.includes('again')) {
      return content.restartText || 'Play Again';
    }
    // Credits button
    if (nameLower.includes('credits')) {
      return content.creditsText || 'Credits';
    }
    // Generic button handling
    if (nameLower.includes('button')) {
      if (content.showRestart) {
        return content.restartText || 'Play Again';
      }
      return content.creditsText || 'Credits';
    }
    // Fallback based on element kind
    if (loc.kind === 'button') {
      return content.restartText || 'Play Again';
    }
    if (loc.kind === 'text' && !nameLower.includes('title')) {
      return content.summary || '';
    }
    if (loc.kind === 'dialog') {
      return content.summary || '';
    }
  }

  // Movement Choice specific elements
  // Use displayText (translated label) when available, falling back to text
  if (beatType === 'movementChoice') {
    if (nameLower.includes('question')) {
      return content.question || 'Where do you want to go?';
    }
    // Handle individual location hotspots - match by name or text first
    if (content.choices) {
      // FIRST: Try locationName match (hotspot/prop associated via Visual Editor)
      const locationNameMatch = content.choices.find((c: any) =>
        c.locationName && c.locationName === loc.name
      );
      if (locationNameMatch) {
        return locationNameMatch.displayText || locationNameMatch.text || locationNameMatch.location;
      }
      // Try exact match first (case-insensitive)
      const exactMatch = content.choices.find((c: any) =>
        (c.text && c.text.toLowerCase() === nameLower) ||
        (c.location && c.location.toLowerCase() === nameLower)
      );
      if (exactMatch) {
        return exactMatch.displayText || exactMatch.text || exactMatch.location;
      }
      // Try partial match
      const partialMatch = content.choices.find((c: any) =>
        (c.text && c.text.toLowerCase().includes(nameLower)) ||
        (c.location && c.location.toLowerCase().includes(nameLower)) ||
        (nameLower.includes(c.text?.toLowerCase())) ||
        (nameLower.includes(c.location?.toLowerCase()))
      );
      if (partialMatch) {
        return partialMatch.displayText || partialMatch.text || partialMatch.location;
      }
      // Try to match location number
      const locationNum = nameLower.match(/location\s*(\d+)/);
      if (locationNum && content.choices[parseInt(locationNum[1]) - 1]) {
        const choice = content.choices[parseInt(locationNum[1]) - 1];
        return choice.displayText || choice.text || choice.location || `Location ${locationNum[1]}`;
      }
    }
  }

  // PickProp specific elements
  if (beatType === 'pickProp') {
    if (nameLower.includes('question')) {
      return content.question || 'What do you want to interact with?';
    }
    // Handle prop hotspots - match by locationName first, then by name
    // Use displayName (translated label) when available, falling back to name
    if (content.props) {
      // FIRST: Try locationName match (hotspot/prop associated via Visual Editor)
      const locationNameMatch = content.props.find((p: any) =>
        p.locationName && p.locationName === loc.name
      );
      if (locationNameMatch) {
        return locationNameMatch.displayName || locationNameMatch.name || locationNameMatch.description;
      }
      // Try exact name match
      const exactMatch = content.props.find((p: any) =>
        p.name && p.name === loc.name
      );
      if (exactMatch) {
        return exactMatch.displayName || exactMatch.name;
      }
      // Try case-insensitive exact match
      const caseInsensitiveMatch = content.props.find((p: any) =>
        p.name && p.name.toLowerCase() === nameLower
      );
      if (caseInsensitiveMatch) {
        return caseInsensitiveMatch.displayName || caseInsensitiveMatch.name;
      }
      // Try partial match (e.g., "Axe" matches "Axe.png" or vice versa)
      const partialMatch = content.props.find((p: any) => {
        const propNameLower = p.name?.toLowerCase() || '';
        return propNameLower && (
          nameLower.includes(propNameLower) ||
          propNameLower.includes(nameLower)
        );
      });
      if (partialMatch) {
        return partialMatch.displayName || partialMatch.name;
      }
    }
  }

  // ========================================
  // GENERIC CHECKS (lower priority fallbacks)
  // ========================================

  // Button elements
  if (nameLower.includes('continue')) return content.buttonText || 'Continue';
  if (nameLower.includes('submit')) return content.buttonText || 'Continue';

  // Generic restart/credits buttons
  if (nameLower.includes('restart') || nameLower.includes('play again')) {
    return content.restartText || 'Play Again';
  }
  if (nameLower.includes('credits')) return content.creditsText || 'Credits';
  if (nameLower.includes('skip')) return 'Skip Video';
  
  // Dialog Tree elements
  if (nameLower.includes('dialog') || loc.kind === 'dialog') {
    return content.text || content.speaker || '';
  }
  
  // Choice buttons for DialogTree and Movement
  if (nameLower.includes('choice')) {
    const choiceNum = nameLower.match(/choice\s*(\d+)/);
    if (choiceNum && content.choices && content.choices[parseInt(choiceNum[1]) - 1]) {
      const choice = content.choices[parseInt(choiceNum[1]) - 1];
      return typeof choice === 'string' ? choice : (choice.text || choice.name || `Choice ${choiceNum[1]}`);
    }
  }
  
  // Location buttons for Movement beats
  if (nameLower.includes('location')) {
    const locNum = nameLower.match(/location\s*(\d+)/);
    if (locNum && content.choices && content.choices[parseInt(locNum[1]) - 1]) {
      const choice = content.choices[parseInt(locNum[1]) - 1];
      return typeof choice === 'string' ? choice : (choice.text || choice.location || `Location ${locNum[1]}`);
    }
  }
  
  // Prop buttons for PickProp beats
  if (nameLower.includes('prop')) {
    const propNum = nameLower.match(/prop\s*(\d+)/);
    if (propNum && content.props && content.props[parseInt(propNum[1]) - 1]) {
      const prop = content.props[parseInt(propNum[1]) - 1];
      return typeof prop === 'string' ? prop : (prop.displayName || prop.name || prop.text || `Prop ${propNum[1]}`);
    }
  }
  
  // Question text for Movement and PickProp - check both 'question' name AND 'text' name
  if (nameLower.includes('question') || (nameLower === 'text' && (beatType === 'movementChoice' || beatType === 'pickProp'))) {
    return content.question || content.text || '';
  }
  
  // InputText elements
  if (nameLower.includes('prompt')) {
    return content.prompt || '';
  }
  if (nameLower.includes('input') && nameLower.includes('field')) {
    return content.placeholder || 'Type here...';
  }
  
  // HyperText - only render the text location, not the hyperlinks location
  if (nameLower.includes('hypertext') || (beatType === 'hyperText' && (nameLower.includes('main') || nameLower.includes('text')))) {
    return content.text || '';
  }

  // Skip hyperlinks location for hyperText - the links are rendered as part of the text element
  if (beatType === 'hyperText' && nameLower.includes('hyperlink')) {
    return ''; // Return empty to avoid duplicate text
  }

  // Skip "Main Text" elements - they are deprecated and cause duplication
  if (nameLower.includes('main') && nameLower.includes('text')) {
    return ''; // Return empty content to effectively hide this element
  }

  // Video placeholder
  if (nameLower.includes('video')) {
    return 'Video Player';
  }

  // Fallback for buttons/hotspots
  if (loc.kind === 'button' || loc.kind === 'hotspot') {
    return content.buttonText || loc.name || 'Continue';
  }
  
  // Fallback for text (dialog already handled above)
  if (loc.kind === 'text') {
    return content.text || '';
  }

  // Ultimate fallback
  return content.text || content.message || content.prompt || content.question || loc.name || '';
}

// ============================================
// FLEX LAYOUT COMPONENTS (for preview mode)
// These render without absolute positioning
// ============================================

/**
 * Text element for flex layout (no absolute positioning)
 * Supports typewriter animation with delay for sequencing
 */
const FlexTextElement: React.FC<{
  element: PositionedElementData;
  hideTextBox?: boolean;
  theme: RenderThemeSettings;
  onAction?: (actionId: string) => void;
  animationDelay?: number;  // Delay in ms before starting animation
  onAnimationComplete?: () => void;  // Callback when animation finishes
  skipAnimation?: boolean;  // When true, immediately show full text
  mobileFontScale?: number;  // Mobile font scale multiplier (1.0 = normal)
  speakerName?: string;  // Speaker name for inline display
  speakerPortraitUrl?: string;  // Speaker portrait URL for inside-text display
}> = ({ element, hideTextBox = false, theme, onAction, animationDelay = 0, onAnimationComplete, skipAnimation = false, mobileFontScale = 1.0, speakerName, speakerPortraitUrl }) => {
  const { location, content, hyperlinks } = element;

  // Typewriter animation state
  const [displayedText, setDisplayedText] = React.useState('');
  const [animationStarted, setAnimationStarted] = React.useState(false);
  const animationCompletedRef = React.useRef(false);

  // Handle skip animation - immediately show full text
  React.useEffect(() => {
    if (skipAnimation && !animationCompletedRef.current) {
      setDisplayedText(content);
      animationCompletedRef.current = true;
      onAnimationComplete?.();
    }
  }, [skipAnimation, content, onAnimationComplete]);

  // Typewriter animation effect with delay support
  React.useEffect(() => {
    // Reset completion tracking when content changes
    animationCompletedRef.current = false;

    // If already skipped, don't start animation
    if (skipAnimation) {
      setDisplayedText(content);
      return;
    }

    const animation = theme.textEffects?.animation || 'none';

    if (animation === 'typewriter') {
      setDisplayedText('');
      setAnimationStarted(false);

      const speed = theme.textEffects?.typewriterSpeed || 30;
      const msPerChar = 1000 / speed;
      let currentIndex = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      // Start animation after delay
      const delayTimeoutId = setTimeout(() => {
        setAnimationStarted(true);
        intervalId = setInterval(() => {
          if (currentIndex < content.length) {
            setDisplayedText(content.substring(0, currentIndex + 1));
            currentIndex++;
          } else {
            if (intervalId) clearInterval(intervalId);
            if (!animationCompletedRef.current) {
              animationCompletedRef.current = true;
              onAnimationComplete?.();
            }
          }
        }, msPerChar);
      }, animationDelay);

      return () => {
        clearTimeout(delayTimeoutId);
        if (intervalId) clearInterval(intervalId);
      };
    } else {
      setDisplayedText(content);
      // For fade animation, wait for the fade duration before calling completion
      // For 'none', complete immediately after a short delay
      const fadeInDuration = theme.textEffects?.fadeInDuration || 500;
      const waitDuration = animation === 'fade' ? fadeInDuration : 50;
      const timeoutId = setTimeout(() => {
        if (!animationCompletedRef.current) {
          animationCompletedRef.current = true;
          onAnimationComplete?.();
        }
      }, animationDelay + waitDuration);
      return () => clearTimeout(timeoutId);
    }
  }, [content, theme.textEffects?.animation, theme.textEffects?.typewriterSpeed, theme.textEffects?.fadeInDuration, animationDelay, onAnimationComplete, skipAnimation]);

  // Calculate font size - auto-adjust based on content length if no explicit size set
  let computedFontSize: number;
  const contentLength = content?.length || 0;
  const isLongContent = contentLength > 80;
  const isVeryLongContent = contentLength > 200;
  const isExtremelyLongContent = contentLength > 400;

  // Title/author elements use titleFont, others use textFont
  const isTitleElement = location.name?.toLowerCase().includes('title') || location.name?.toLowerCase().includes('author');

  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (isTitleElement && theme.fonts.titleFontSize) {
    // Use theme title font size for title/author elements
    computedFontSize = theme.fonts.titleFontSize;
  } else if (!isTitleElement && theme.fonts.textFontSize) {
    // Use theme text font size for regular text
    computedFontSize = theme.fonts.textFontSize;
  } else {
    // Auto-size based on content length for better readability
    if (isExtremelyLongContent) {
      // Very long narrative content - use compact readable size
      computedFontSize = 11;
    } else if (isVeryLongContent) {
      // Long narrative content - use smaller readable size
      computedFontSize = 12;
    } else if (isLongContent) {
      // Medium-length content
      computedFontSize = 14;
    } else if (contentLength < 30) {
      // Short content like "The End" - use large title-like size
      computedFontSize = 36;
    } else {
      // Default size for flex layout
      computedFontSize = 16;
    }
  }

  // Apply mobile font scale multiplier
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }

  const computedTextAlign = location.textAlign || (isLongContent ? 'left' : 'center');
  const defaultFont = isTitleElement ? theme.fonts.titleFont : theme.fonts.textFont;
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : defaultFont;
  const padding = theme.textBox.padding;

  // Convert opacity from 0-100 to 0-1
  const opacityValue = theme.textBox.opacity / 100;
  const bgColor = hideTextBox ? 'transparent' : theme.textBox.backgroundColor;
  const bgWithOpacity = hideTextBox ? 'transparent' :
    (bgColor.startsWith('#') ? `${bgColor}${Math.round(opacityValue * 255).toString(16).padStart(2, '0')}` : bgColor);

  // Use textbox frame image if available (from theme assets, e.g., Ren'Py import)
  const hasFrameImage = !hideTextBox && theme.textboxFrameUrl;

  const textColor = theme.colors.textColor;
  const textAlpha = theme.colors.textAlpha / 100;

  // Determine animation style
  const animation = theme.textEffects?.animation || 'none';
  const fadeInDuration = theme.textEffects?.fadeInDuration || 500;
  const animationStyle: React.CSSProperties = animation === 'fade'
    ? { animation: `fadeIn ${fadeInDuration}ms ease-in` }
    : {};

  // Text to display (animated or full content)
  const textToDisplay = animation === 'typewriter' ? displayedText : content;

  return (
    <>
      {animation === 'fade' && (
        <style>
          {`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: ${textAlpha}; }
            }
          `}
        </style>
      )}
      <div
        style={{
          ...animationStyle,
          // Use frame image if available, otherwise use solid background
          ...(hasFrameImage ? {
            backgroundImage: `url(${theme.textboxFrameUrl})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'transparent',
          } : {
            backgroundColor: bgWithOpacity,
          }),
          padding: hideTextBox ? '0' : `${padding}px`,
          border: hideTextBox || hasFrameImage ? 'none' : `${theme.textBox.borderWidth}px solid ${theme.textBox.borderColor}`,
          borderRadius: hideTextBox || hasFrameImage ? '0' : `${theme.textBox.borderRadius}px`,
          fontSize: `${computedFontSize}px`,
          fontFamily: computedFont,
          fontWeight: isLongContent ? '400' : '500',
          color: textColor,
          opacity: animation === 'fade' ? undefined : textAlpha,
          boxShadow: hideTextBox ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: computedTextAlign,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          lineHeight: isLongContent ? '1.5' : '1.4',
          boxSizing: 'border-box',
          minHeight: '1.4em', // Prevent layout shift during typewriter
          overflow: 'auto', // Always allow scrolling for content that exceeds element bounds
          whiteSpace: 'pre-wrap', // Preserve line breaks in imported content
        }}
      >
        {/* Speaker portrait inside text box (floated) */}
        {speakerPortraitUrl && (theme.speakerDisplay?.graphicPosition === 'inside-left' || theme.speakerDisplay?.graphicPosition === 'inside-right') && (() => {
          const isLeft = theme.speakerDisplay?.graphicPosition === 'inside-left';
          const size = theme.speakerDisplay?.graphicSize ?? 48;
          return (
            <img
              src={speakerPortraitUrl}
              alt={speakerName || ''}
              style={{
                float: isLeft ? 'left' : 'right',
                width: size,
                height: size,
                objectFit: 'cover',
                borderRadius: 6,
                marginRight: isLeft ? 8 : 0,
                marginLeft: isLeft ? 0 : 8,
                marginBottom: 4,
              }}
            />
          );
        })()}

        {/* Speaker name inline (bold first line) */}
        {speakerName && theme.speakerDisplay?.nameStyle === 'inline' && (
          <div style={{
            fontWeight: 700,
            fontSize: `${Math.round(computedFontSize * 1.05)}px`,
            color: theme.speakerDisplay?.nameColor || textColor,
            marginBottom: 4,
            textAlign: computedTextAlign,
          }}>
            {speakerName}
          </div>
        )}

        {hyperlinks && hyperlinks.length > 0 && onAction ? (
          <HyperTextContent
            text={textToDisplay}
            hyperlinks={hyperlinks}
            onLinkClick={onAction}
          />
        ) : (
          textToDisplay
        )}
      </div>
    </>
  );
};

/**
 * Button element for flex layout (no absolute positioning)
 */
const FlexButtonElement: React.FC<{
  element: PositionedElementData;
  onAction?: (actionId: string) => void;
  interactive: boolean;
  hideButtonBox?: boolean;
  theme: RenderThemeSettings;
  isVisited?: boolean;
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>;
  stageWidth?: number;
  buttonCount?: number;
  mobileFontScale?: number;
}> = ({ element, onAction, interactive: interactiveProp, hideButtonBox = false, theme, isVisited = false, soundBlobResolver, stageWidth, buttonCount = 1, mobileFontScale = 1.0 }) => {
  // Visited choices are non-interactive (greyed out and not clickable)
  const interactive = interactiveProp && !isVisited;
  const { location, content, actionId } = element;
  const [isHovered, setIsHovered] = React.useState(false);

  // Calculate font size: use location fontSize, then theme button font size, then default
  let computedFontSize: number;
  if (location.fontSize !== undefined) {
    computedFontSize = location.fontSize;
  } else if (theme.fonts.buttonFontSize) {
    computedFontSize = theme.fonts.buttonFontSize;
  } else {
    computedFontSize = 18;
  }

  // Apply mobile font scale multiplier
  if (mobileFontScale !== 1.0) {
    computedFontSize = Math.round(computedFontSize * mobileFontScale);
  }

  const computedTextAlign = location.textAlign || 'center';
  // Use element's font if set (user override), otherwise use theme default
  const computedFont = location.font ? getFontFamily(location.font) : theme.fonts.buttonFont;

  // Determine background color based on visited state
  let backgroundColor: string;
  if (hideButtonBox) {
    backgroundColor = 'transparent';
  } else if (isVisited) {
    backgroundColor = isHovered ? '#c0c0c0' : '#e0e0e0';
  } else {
    backgroundColor = isHovered ? theme.button.hoverBackgroundColor : theme.button.backgroundColor;
  }

  // Determine border color based on visited state
  const borderColor = isVisited && !hideButtonBox ? '#999999' : theme.button.borderColor;

  // Determine if we should use button background images (from Ren'Py theme import)
  const useButtonImage = !hideButtonBox && !isVisited && theme.buttonNormalUrl;
  const buttonImageUrl = useButtonImage
    ? (isHovered && theme.buttonHoverUrl ? theme.buttonHoverUrl : theme.buttonNormalUrl)
    : undefined;

  const handleClick = async () => {
    console.log(`[FlexButtonElement] handleClick called, interactive=${interactive}, hasOnAction=${!!onAction}, actionId="${actionId}", location.name="${location.name}"`);
    if (interactive) {
      // Play sound if assigned - prefer soundAssetId (proper asset ID) over sound (may be blob URL)
      const soundRef = (location as any).soundAssetId || location.sound;
      // Skip if soundRef is falsy or the literal string "undefined"
      if (soundRef && soundRef !== 'undefined') {
        try {
          const audioManager = getAudioManager();

          // Check if it's a preset sound
          if (isPresetSound(soundRef)) {
            const preset = getPresetSound(soundRef);
            if (preset) {
              console.log(`[FlexButtonElement] Playing preset sound (waiting): ${preset.name}`);
              await audioManager.playSoundAndWait(preset.url, preset.volume);
            }
          } else if (soundBlobResolver) {
            // Custom asset - resolve blob from storage
            console.log(`[FlexButtonElement] Loading custom sound blob: ${soundRef}`);
            const blob = await soundBlobResolver(soundRef);
            if (blob) {
              console.log(`[FlexButtonElement] Playing custom sound from blob (waiting): ${soundRef}`);
              await audioManager.playSoundFromBlobAndWait(blob, 1.0, soundRef);
            } else {
              console.warn(`[FlexButtonElement] Could not load sound blob: ${soundRef}`);
            }
          } else {
            // Fallback to URL-based playback (for non-builder contexts)
            console.log(`[FlexButtonElement] Playing custom sound (waiting, fallback): ${soundRef}`);
            await audioManager.playSoundAndWait(soundRef);
          }
        } catch (error) {
          console.error('[FlexButtonElement] Error playing sound:', error);
          // Don't block the action if sound fails
        }
      }

      // Then call the action (after sound finishes)
      if (onAction) {
        const actionIdToPass = actionId || location.name || 'continue';
        console.log(`[FlexButtonElement] Calling onAction with: "${actionIdToPass}"`);
        onAction(actionIdToPass);
      } else {
        console.warn(`[FlexButtonElement] No onAction callback available!`);
      }
    } else {
      console.warn(`[FlexButtonElement] Click ignored - not interactive`);
    }
  };

  // Calculate max width based on number of buttons sharing the row
  // For 1 button: 90% of stage width
  // For 2+ buttons: divide available space (accounting for gaps and padding)
  const calculateMaxButtonWidth = () => {
    if (!stageWidth) return undefined;
    const padding = 40; // 20px on each side from parent container
    const gap = 16; // gap between buttons
    const availableWidth = stageWidth - padding;

    if (buttonCount === 1) {
      return availableWidth * 0.9;
    } else if (buttonCount === 2) {
      // For 2 buttons, each can take up to 48% of available width (leaving room for gap)
      return (availableWidth - gap) / 2;
    } else {
      // For 3+ buttons, allow them to take up to 45% each (will wrap to multiple rows if needed)
      return availableWidth * 0.45;
    }
  };
  const maxButtonWidth = calculateMaxButtonWidth();

  return (
    <button
      style={{
        minWidth: buttonCount > 1 ? '80px' : `${Math.min(location.width, 200)}px`,
        maxWidth: maxButtonWidth ? `${maxButtonWidth}px` : '90%',
        flexShrink: 1,
        padding: hideButtonBox ? '0' : '12px 24px',
        // Use background image if available, otherwise use solid color
        ...(buttonImageUrl ? {
          backgroundImage: `url(${buttonImageUrl})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundColor: 'transparent',
        } : {
          backgroundColor,
        }),
        color: hideButtonBox ? theme.colors.textColor : (isVisited ? '#666666' : theme.button.textColor),
        border: buttonImageUrl ? 'none' : (hideButtonBox ? 'none' : `${theme.button.borderWidth}px solid ${borderColor}`),
        borderRadius: hideButtonBox ? '4px' : (buttonImageUrl ? '0' : `${theme.button.borderRadius}px`),
        fontSize: `${computedFontSize}px`,
        fontFamily: computedFont,
        fontWeight: '600',
        textAlign: computedTextAlign,
        transition: 'all 0.2s',
        boxShadow: hideButtonBox || buttonImageUrl ? 'none' : (isHovered ? '0 6px 12px rgba(0,0,0,0.15)' : '0 4px 6px rgba(0,0,0,0.1)'),
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        cursor: interactive ? 'pointer' : 'default',
        opacity: isVisited ? 0.7 : 1,
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        whiteSpace: 'normal',
        boxSizing: 'border-box',
        lineHeight: '1.4',
        overflow: 'hidden', // Prevent text from escaping button bounds
        textOverflow: 'ellipsis', // Show ellipsis if text still overflows after wrapping
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={!interactive}
    >
      {content}
    </button>
  );
};
