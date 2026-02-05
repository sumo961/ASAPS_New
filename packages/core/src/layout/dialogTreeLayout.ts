/**
 * DialogTree Layout Module
 *
 * SINGLE SOURCE OF TRUTH for DialogTree layout calculations.
 * Used by both the Visual Editor and Preview/Renderer to ensure
 * selection handles and rendered elements always align perfectly.
 *
 * Position priority: overrides > storedLocations > auto-calculated
 */

import type { Location } from '../types';
import { measureTextWidth, calculateButtonDimensions } from './elementSizing';

/**
 * Phase data for layout calculation
 */
export interface DialogTreePhase {
  id: string;
  speaker: string;
  text: string;
  choices: Array<{ id: string; text: string }>;
}

/**
 * Theme settings for layout calculation
 */
export interface DialogTreeLayoutTheme {
  fontSize: number;
  fontFamily: string;
  padding: number;
  maxTextWidthRatio: number;
  maxButtonWidthRatio: number;
  textButtonGap: number;
  buttonGap: number;
  startY: number;
}

/**
 * Input for computeDialogTreeLayout
 */
export interface DialogTreeLayoutInput {
  phase: DialogTreePhase;
  stageWidth: number;
  stageHeight: number;
  theme: DialogTreeLayoutTheme;
  overrides?: Record<string, Partial<{ x: number; y: number; width: number; height: number; z?: number }>>;
  storedLocations?: Map<string, Location>;
}

/**
 * Single element in the layout
 */
export interface DialogTreeLayoutElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z?: number;  // z-index from overrides, if set
  content: string;
  speaker?: string;
  kind: 'dialog' | 'button';
}

/**
 * Output from computeDialogTreeLayout
 */
export interface DialogTreeLayoutOutput {
  dialog: DialogTreeLayoutElement;
  buttons: DialogTreeLayoutElement[];

  /**
   * Convert layout to Location array for renderer
   * These are the positions the renderer will use to display elements
   */
  toLocations(): Location[];

  /**
   * Convert layout to VisualElement-compatible objects for visual editor
   * These are the positions used for selection handles
   *
   * Note: Returns a generic object instead of VisualElement to avoid
   * importing builder types into core. The builder should cast as needed.
   */
  toVisualElements(): Array<{
    id: string;
    type: 'dialog' | 'button';
    name: string;
    text: string;
    speaker?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    z: number;
    rotation: number;
    scale: number;
    visible: boolean;
    locked: boolean;
    font?: string;
    fontSize?: number;
  }>;
}

/**
 * Default theme values
 */
export const DEFAULT_DIALOG_TREE_THEME: DialogTreeLayoutTheme = {
  fontSize: 16,
  fontFamily: 'Arial',
  padding: 20,
  maxTextWidthRatio: 0.8,
  maxButtonWidthRatio: 0.6,
  textButtonGap: 20,
  buttonGap: 16,
  startY: 50,
};

/**
 * Compute the layout for a DialogTree phase
 *
 * This function calculates positions for dialog and button elements.
 * BOTH the visual editor AND the preview/renderer should call this
 * function to ensure identical positions.
 *
 * @param input - Layout input with phase, stage dimensions, theme, and optional overrides
 * @returns Layout output with dialog, buttons, and conversion methods
 */
export function computeDialogTreeLayout(input: DialogTreeLayoutInput): DialogTreeLayoutOutput {
  const { phase, stageWidth, stageHeight, theme, overrides, storedLocations } = input;

  // Merge with defaults
  const t = { ...DEFAULT_DIALOG_TREE_THEME, ...theme };

  const lineHeight = 1.4;
  const contentPadding = t.padding * 2;
  const text = phase.text || '';

  // Calculate text box dimensions (same logic used everywhere)
  const textWidth = text.length * t.fontSize * 0.55;
  const maxTextWidth = stageWidth * t.maxTextWidthRatio;

  let textBoxWidth: number;
  let textBoxHeight: number;

  if (textWidth + contentPadding <= maxTextWidth) {
    // Fits in single line - use actual text width
    textBoxWidth = Math.max(200, Math.min(textWidth + contentPadding, maxTextWidth));
    textBoxHeight = t.fontSize * lineHeight + contentPadding;
  } else {
    // Multiple lines needed - use max width and calculate height
    textBoxWidth = maxTextWidth;
    const availableWidth = maxTextWidth - contentPadding;
    const avgCharWidth = t.fontSize * 0.55;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    textBoxHeight = lines * t.fontSize * lineHeight + contentPadding;
  }

  // Center text box horizontally
  const textCenterX = (stageWidth - textBoxWidth) / 2;

  // Look for stored position for dialog from ASML import
  let storedDialogPosition: { x: number; y: number; width: number; height: number } | undefined;
  if (storedLocations && storedLocations.size > 0) {
    storedLocations.forEach((loc) => {
      // Accept both 'dialog' (modern) and 'text' (legacy ASML) kinds
      // Exclude buttons by checking that name doesn't match button patterns
      const isDialogLike = (loc.kind === 'dialog' || loc.kind === 'text') &&
        !loc.name?.match(/^(choice|button)/i);
      if (isDialogLike && !storedDialogPosition) {
        storedDialogPosition = { x: loc.x, y: loc.y, width: loc.width, height: loc.height };
      }
    });
  }

  // Apply overrides > storedLocations > auto-calculated
  const npcOverride = overrides?.['npc'];
  const dialog: DialogTreeLayoutElement = {
    id: 'npc',
    kind: 'dialog',
    content: text,
    speaker: phase.speaker,
    x: npcOverride?.x ?? storedDialogPosition?.x ?? textCenterX,
    y: npcOverride?.y ?? storedDialogPosition?.y ?? t.startY,
    width: npcOverride?.width ?? storedDialogPosition?.width ?? textBoxWidth,
    height: npcOverride?.height ?? storedDialogPosition?.height ?? textBoxHeight,
    z: npcOverride?.z,  // z-index from override, undefined if not set
  };

  // Calculate button positions - immediately after dialog
  const finalDialogY = dialog.y;
  const finalDialogHeight = dialog.height;
  const buttonStartY = finalDialogY + finalDialogHeight + t.textButtonGap;

  // Calculate button width - max of all button text widths, capped at ratio
  const maxButtonWidth = stageWidth * t.maxButtonWidthRatio;
  const choices = phase.choices || [];

  // Calculate initial dimensions for each button to determine width needs
  const initialButtonDimensions = choices.map(choice => {
    const btnText = choice.text || '';
    return calculateButtonDimensions(btnText, t.fontSize, t.fontFamily, maxButtonWidth);
  });

  // Use uniform width for all buttons (max of calculated widths, capped)
  const uniformButtonWidth = choices.length > 0
    ? Math.min(Math.max(200, ...initialButtonDimensions.map(d => d.width)), maxButtonWidth)
    : 200;

  // Recalculate heights using the actual uniform width (may be different from initial calc)
  const buttonDimensions = choices.map(choice => {
    const btnText = choice.text || '';
    return calculateButtonDimensions(btnText, t.fontSize, t.fontFamily, uniformButtonWidth);
  });
  const buttonCenterX = (stageWidth - uniformButtonWidth) / 2;

  // Get existing buttons from stored locations
  const existingButtons: Array<{ x: number; y: number; width: number; height: number }> = [];
  if (storedLocations && storedLocations.size > 0) {
    storedLocations.forEach((loc) => {
      if (loc.kind === 'button') {
        existingButtons.push({ x: loc.x, y: loc.y, width: loc.width, height: loc.height });
      }
    });
  }

  // Build buttons with cumulative Y based on individual heights
  const buttons: DialogTreeLayoutElement[] = [];
  let currentY = buttonStartY;

  choices.forEach((choice, idx) => {
    // Use calculated height for this specific button
    const calculatedHeight = buttonDimensions[idx]?.height || 50;

    const choiceOverride = overrides?.[`choice_${idx}`];
    const existingButton = existingButtons[idx];

    // Determine button height: use stored/override if available, but ensure it's at least
    // as tall as the calculated height to prevent text clipping
    const storedHeight = choiceOverride?.height ?? existingButton?.height;
    const buttonHeight = storedHeight !== undefined
      ? Math.max(storedHeight, calculatedHeight)  // Ensure stored height isn't too small
      : calculatedHeight;

    buttons.push({
      id: `choice_${idx}`,
      kind: 'button',
      content: choice.text || '',
      x: choiceOverride?.x ?? existingButton?.x ?? buttonCenterX,
      y: choiceOverride?.y ?? existingButton?.y ?? currentY,
      width: choiceOverride?.width ?? existingButton?.width ?? uniformButtonWidth,
      height: buttonHeight,
      z: choiceOverride?.z,  // z-index from override, undefined if not set
    });

    // Move Y position for next button using actual button height
    currentY += buttonHeight + t.buttonGap;
  });

  // Create the output object with conversion methods
  const output: DialogTreeLayoutOutput = {
    dialog,
    buttons,

    toLocations(): Location[] {
      const locations: Location[] = [];

      // Add dialog location
      locations.push({
        kind: 'dialog',
        name: 'npc',
        x: dialog.x,
        y: dialog.y,
        width: dialog.width,
        height: dialog.height,
      });

      // Add button locations
      buttons.forEach((btn) => {
        locations.push({
          kind: 'button',
          name: btn.content || `Choice`,
          x: btn.x,
          y: btn.y,
          width: btn.width,
          height: btn.height,
        });
      });

      return locations;
    },

    toVisualElements() {
      const elements: Array<{
        id: string;
        type: 'dialog' | 'button';
        name: string;
        text: string;
        speaker?: string;
        x: number;
        y: number;
        width: number;
        height: number;
        z: number;
        rotation: number;
        scale: number;
        visible: boolean;
        locked: boolean;
        font?: string;
        fontSize?: number;
      }> = [];

      // Add dialog element
      // Use z from override if set, otherwise assign incremental index-based z
      elements.push({
        id: dialog.id,
        type: 'dialog',
        name: `NPC: ${dialog.speaker || 'Character'}`,
        text: dialog.content,
        speaker: dialog.speaker,
        x: dialog.x,
        y: dialog.y,
        width: dialog.width,
        height: dialog.height,
        z: dialog.z ?? 0,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: t.fontFamily,
        fontSize: t.fontSize,
      });

      // Add button elements
      // Use z from override if set, otherwise assign incremental index-based z
      buttons.forEach((btn, idx) => {
        elements.push({
          id: btn.id,
          type: 'button',
          name: `Choice ${idx}`,
          text: btn.content,
          x: btn.x,
          y: btn.y,
          width: btn.width,
          height: btn.height,
          z: btn.z ?? (idx + 1),  // Default to incremental z if not set
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          font: t.fontFamily,
          fontSize: t.fontSize,
        });
      });

      return elements;
    },
  };

  return output;
}
