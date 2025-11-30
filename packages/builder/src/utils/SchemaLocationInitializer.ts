/**
 * Schema-Driven Location Initialization
 *
 * This utility replaces hardcoded beat-type conditionals with schema-driven logic.
 * It reads the locations array from beat-definitions.json and creates default
 * visual elements based on location names and types.
 */

import type { Beat } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

export interface VisualElement {
  id: string;
  type: 'text' | 'dialog' | 'button' | 'hotspot' | 'character' | 'prop';
  name: string;
  text?: string;
  speaker?: string;
  assetId?: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  visible: boolean;
  locked: boolean;
  sound?: string;
  font?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
}

interface LocationDefinition {
  name: string;
  type: 'text' | 'dialog' | 'button' | 'hotspot';
  defaultText?: string;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  fontSize?: number;
}

interface ProjectSettings {
  width?: number;
  height?: number;
}

/**
 * Maps location names from schema to element types and properties
 */
const LOCATION_TYPE_MAP: Record<string, Partial<LocationDefinition>> = {
  // Buttons
  'startButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'continueButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'submitButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'restartButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'creditsButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'skipButton': { type: 'button', defaultWidth: 120, defaultHeight: 40, fontSize: 16 },

  // Text elements
  'title': { type: 'text', fontSize: 32, defaultHeight: 60 },
  'author': { type: 'text', fontSize: 20, defaultHeight: 40 },
  'text': { type: 'dialog', fontSize: 18, defaultHeight: 100 },
  'message': { type: 'text', fontSize: 24, defaultHeight: 50 },
  'prompt': { type: 'dialog', fontSize: 18, defaultHeight: 80 },
  'question': { type: 'dialog', fontSize: 18, defaultHeight: 80 },

  // Input fields
  'inputField': { type: 'hotspot', defaultWidth: 400, defaultHeight: 50 },

  // Dialog/Hypertext
  'dialog': { type: 'dialog', fontSize: 16, defaultHeight: 120 },
  'hyperlinks': { type: 'dialog', fontSize: 16, defaultHeight: 120 },

  // Choices (created dynamically)
  'choices': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 16 },
  'props': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 16 },

  // Video/media
  'video': { type: 'hotspot', defaultWidth: 800, defaultHeight: 600 },
  'controls': { type: 'hotspot', defaultWidth: 800, defaultHeight: 50 },
};

/**
 * Auto-size text based on content length
 */
function autoSizeText(
  text: string,
  fontSize: number,
  minWidth: number,
  maxWidth: number,
  isButton: boolean = false
): { width: number; height: number } {
  // Approximate character width (varies by font, this is a reasonable estimate)
  const charWidth = fontSize * 0.6;
  const estimatedWidth = text.length * charWidth + (isButton ? 40 : 20); // Add padding

  const width = Math.max(minWidth, Math.min(maxWidth, estimatedWidth));
  const lines = Math.ceil(estimatedWidth / width);
  const height = lines * fontSize * 1.5 + (isButton ? 20 : 10); // Line height + padding

  return { width, height };
}

/**
 * Get default text for a location based on beat type and location name
 */
function getDefaultTextForLocation(
  beatType: string,
  locationName: string,
  params: Record<string, any>
): string | undefined {
  const nameLower = locationName.toLowerCase();

  // Title screen
  if (beatType === 'titleScreen') {
    if (nameLower.includes('title')) return params.title || 'Untitled Story';
    if (nameLower.includes('author')) return params.author || 'Anonymous';
    if (nameLower.includes('start')) return params.buttonText || 'Start';
  }

  // Intro/Dur text
  if (beatType === 'introText' || beatType === 'durScreen') {
    if (nameLower.includes('text')) return params.text || '';
    if (nameLower.includes('continue')) return params.buttonText || 'Continue';
  }

  // End screen
  if (beatType === 'endScreen') {
    if (nameLower.includes('message')) return params.message || 'The End';
    if (nameLower.includes('restart')) return params.restartText || 'Restart';
    if (nameLower.includes('credits')) return params.creditsText || 'Credits';
  }

  // Input text
  if (beatType === 'inputText') {
    if (nameLower.includes('prompt')) return params.prompt || 'Please enter your response:';
    if (nameLower.includes('submit')) return params.buttonText || 'Continue';
  }

  // HyperText
  if (beatType === 'hyperText') {
    if (nameLower.includes('text') || nameLower.includes('hyper')) {
      return params.text || 'Click on any word to explore.';
    }
  }

  // Dialog tree
  if (beatType === 'dialogTree') {
    if (nameLower.includes('dialog')) {
      return params.dialogTree?.text || params.text || '';
    }
  }

  // Movement/PickProp
  if (beatType === 'movementChoice' || beatType === 'pickProp') {
    if (nameLower.includes('question')) return params.question || '';
  }

  return undefined;
}

/**
 * Initialize default visual elements for a beat based on schema
 */
export function initializeLocationsFromSchema(
  beat: Beat,
  params: Record<string, any>,
  projectSettings: ProjectSettings = {}
): VisualElement[] {
  const elements: VisualElement[] = [];

  // Get beat definition from schema
  const beatDef = (beatDefinitions as any).beatTypes[beat.type];
  if (!beatDef || !beatDef.locations) {
    console.warn(`[SchemaLocationInitializer] No schema definition found for beat type: ${beat.type}`);
    return elements;
  }

  const stageWidth = projectSettings.width || 1024;
  const stageHeight = projectSettings.height || 768;
  const centerX = stageWidth / 2;
  const centerY = stageHeight / 2;

  console.log(`[SchemaLocationInitializer] Initializing ${beatDef.locations.length} locations for ${beat.type}`);

  // Track vertical position for stacking elements
  let currentY = 100;

  // Process each location from schema
  beatDef.locations.forEach((locationName: string, index: number) => {
    // Skip conditional elements based on beat parameters
    if (beat.type === 'endScreen') {
      if (locationName === 'restartButton' && params.showRestart === false) {
        return; // Skip restart button if showRestart is false
      }
      if (locationName === 'creditsButton' && params.showCredits !== true) {
        return; // Skip credits button if showCredits is not explicitly true
      }
    }

    // Skip 'choices' and 'props' locations for beats that handle them dynamically
    // These beats create individual choice/prop buttons programmatically from their parameters
    if ((beat.type === 'movementChoice' || beat.type === 'dialogTree') && locationName === 'choices') {
      return; // Skip - will be created dynamically below
    }
    if (beat.type === 'pickProp' && locationName === 'props') {
      return; // Skip - will be created dynamically below
    }

    const locationDef = LOCATION_TYPE_MAP[locationName] || { type: 'text' as const };
    const elementType = locationDef.type || 'text';

    // Get default text from parameters
    const defaultText = getDefaultTextForLocation(beat.type, locationName, params);

    // Determine size
    let width = locationDef.defaultWidth || 400;
    let height = locationDef.defaultHeight || 50;

    // Auto-size text elements based on content
    if (defaultText && (elementType === 'text' || elementType === 'dialog' || elementType === 'button')) {
      const sized = autoSizeText(
        defaultText,
        locationDef.fontSize || 16,
        elementType === 'button' ? 120 : 200,
        elementType === 'button' ? 400 : 800,
        elementType === 'button'
      );
      width = sized.width;
      height = sized.height;
    }

    // Determine position
    let x = centerX - width / 2; // Center horizontally by default
    let y = currentY;

    // Special positioning for certain elements
    if (locationName.toLowerCase().includes('button')) {
      // Buttons go lower on screen
      if (locationName.toLowerCase().includes('start') || locationName.toLowerCase().includes('continue')) {
        y = stageHeight - 150; // Near bottom
      } else {
        y = currentY;
        currentY += height + 20; // Stack vertically
      }
    } else if (locationName === 'title') {
      // Title at top
      y = 80;
      currentY = y + height + 30;
    } else if (locationName === 'author') {
      // Author below title
      y = currentY;
      currentY = y + height + 40;
    } else {
      // Stack other elements
      y = currentY;
      currentY += height + 20;
    }

    // Create element
    const element: VisualElement = {
      id: `element_${locationName}_${Date.now()}_${index}`,
      type: elementType,
      name: locationName.charAt(0).toUpperCase() + locationName.slice(1).replace(/([A-Z])/g, ' $1'),
      text: defaultText,
      x,
      y,
      z: index,
      width,
      height,
      rotation: 0,
      scale: 1,
      visible: true,
      locked: false,
      font: 'Arial',
      fontSize: locationDef.fontSize || 16,
      textAlign: 'center',
    };

    elements.push(element);
  });

  // Handle dynamic elements (choices, props, etc.)
  // DialogTree - get choices from dialogTree.choices
  if (beat.type === 'dialogTree') {
    let choices: any[] = [];

    if (params.dialogTree?.choices) {
      choices = params.dialogTree.choices;
      console.log('[SchemaLocationInitializer] DialogTree choices:', choices);
    }

    if (choices.length > 0) {
      // First pass: calculate sizes for all choices to find the max width
      const choiceSizes = choices.map((choice: any, index: number) => {
        const choiceText = choice.text || `Choice ${index + 1}`;
        // Auto-size based on text content - use wider min/max for buttons with longer text
        const sized = autoSizeText(choiceText, 16, 200, 600, true);
        return { choiceText, ...sized };
      });

      // Use the maximum width for all buttons (for visual consistency)
      const maxWidth = Math.max(...choiceSizes.map((s: { choiceText: string; width: number; height: number }) => s.width));
      const buttonHeight = 50; // Fixed height for consistency

      let buttonY = currentY;
      choiceSizes.forEach((sizeInfo: any, index: number) => {
        const x = centerX - maxWidth / 2;

        elements.push({
          id: `choice_${index}_${Date.now()}`,
          type: 'button',
          name: sizeInfo.choiceText, // Use actual text as name for visual editor display
          text: sizeInfo.choiceText,
          x,
          y: buttonY,
          z: 10 + index,
          width: maxWidth,
          height: buttonHeight,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          font: 'Arial',
          fontSize: 16,
          textAlign: 'center',
        });
        buttonY += buttonHeight + 15;
      });
    }
  }

  if (beat.type === 'movementChoice' && params.choices) {
    console.log('[SchemaLocationInitializer] MovementChoice choices:', params.choices);

    // First pass: calculate sizes for all choices to find the max width
    const choiceSizes = params.choices.map((choice: any, index: number) => {
      const choiceText = choice.text || choice.location || `Location ${index + 1}`;
      // Auto-size based on text content
      const sized = autoSizeText(choiceText, 16, 200, 600, true);
      return { choiceText, ...sized };
    });

    // Use the maximum width for all buttons (for visual consistency)
    const maxWidth = Math.max(...choiceSizes.map((s: any) => s.width));
    const buttonHeight = 50;

    let buttonY = currentY;
    choiceSizes.forEach((sizeInfo: any, index: number) => {
      const x = centerX - maxWidth / 2;

      elements.push({
        id: `location_${index}_${Date.now()}`,
        type: 'hotspot', // Use hotspot type for location choices
        name: sizeInfo.choiceText, // Use actual text as name for visual editor display
        text: sizeInfo.choiceText,
        x,
        y: buttonY,
        z: 10 + index,
        width: maxWidth,
        height: buttonHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: 'Arial',
        fontSize: 16,
        textAlign: 'center',
      });
      buttonY += buttonHeight + 15;
    });
  }

  if (beat.type === 'pickProp' && params.props) {
    console.log('[SchemaLocationInitializer] PickProp props:', params.props);
    const propsPerRow = 3;
    const propWidth = 200;
    const propHeight = 50;
    const spacing = 20;

    params.props.forEach((prop: any, index: number) => {
      const propName = prop.name || `Prop ${index + 1}`;
      const row = Math.floor(index / propsPerRow);
      const col = index % propsPerRow;
      const totalWidth = (propWidth * propsPerRow) + (spacing * (propsPerRow - 1));
      const startX = centerX - totalWidth / 2;

      const x = startX + (col * (propWidth + spacing));
      const y = currentY + (row * (propHeight + spacing));

      elements.push({
        id: `prop_${index}_${Date.now()}`,
        type: 'button',
        name: propName, // Use actual name for visual editor display
        text: propName,
        x,
        y,
        z: 10 + index,
        width: propWidth,
        height: propHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: 'Arial',
        fontSize: 14,
        textAlign: 'center',
      });
    });
  }

  console.log(`[SchemaLocationInitializer] Created ${elements.length} elements`);
  return elements;
}

/**
 * Get location names from schema for a beat type
 */
export function getLocationNamesForBeatType(beatType: string): string[] {
  const beatDef = (beatDefinitions as any).beatTypes[beatType];
  if (!beatDef || !beatDef.locations) {
    return [];
  }
  return beatDef.locations;
}

/**
 * Check if a beat type supports visual elements
 */
export function supportsVisualElements(beatType: string): boolean {
  const beatDef = (beatDefinitions as any).beatTypes[beatType];
  return beatDef?.category === 'visible' && Array.isArray(beatDef.locations) && beatDef.locations.length > 0;
}

/**
 * Batch initialize locations for multiple beats
 * This is the main entry point used by App.tsx
 */
export function initializeBeatLocations(
  beats: Beat[],
  projectWidth: number = 1024,
  projectHeight: number = 768
): void {
  console.log(`[SchemaLocationInitializer] Initializing locations for ${beats.length} beats`);

  beats.forEach(beat => {
    // Skip beats that don't support visual elements
    if (!supportsVisualElements(beat.type)) {
      console.log(`[SchemaLocationInitializer] Skipping ${beat.type} (not a visual beat)`);
      return;
    }

    // Ensure locations is a Map (convert from array if needed)
    if (!beat.locations) {
      beat.locations = new Map();
    } else if (!(beat.locations instanceof Map)) {
      // Convert array to Map
      const locationsArray = Array.isArray(beat.locations) ? beat.locations : [];
      beat.locations = new Map();
      locationsArray.forEach((loc: any) => {
        beat.locations.set(loc.name, loc);
      });
      console.log(`[SchemaLocationInitializer] Converted ${locationsArray.length} locations from array to Map for ${beat.type} (${beat.id})`);
    }

    // Skip if beat already has locations (don't override existing visual elements)
    if (beat.locations && beat.locations.size > 0) {
      console.log(`[SchemaLocationInitializer] Skipping ${beat.type} (${beat.id}) - already has ${beat.locations.size} locations`);
      return;
    }

    // Get beat parameters
    const params = beat.getParameters ? beat.getParameters() : {};

    // Generate visual elements from schema
    const elements = initializeLocationsFromSchema(
      beat,
      params,
      { width: projectWidth, height: projectHeight }
    );

    // Convert visual elements to beat locations
    elements.forEach(el => {
      const kind = el.type as any;

      const location: any = {
        kind,
        name: el.name || el.text || '',
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      if (el.assetId) location.assetId = el.assetId;
      if (el.sound) location.sound = el.sound;
      if (el.font) location.font = el.font;
      if (el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;
      location.autosize = el.fontSize === undefined;

      beat.locations.set(el.name || el.id, location);
    });

    console.log(`[SchemaLocationInitializer] Initialized ${beat.type} (${beat.id}) with ${beat.locations.size} locations`);
  });
}

/**
 * Regenerate visual elements for dynamic choice-based beats
 * Call this when beat parameters change and new choices/props are added
 */
export function regenerateChoiceElements(
  beatType: string,
  params: Record<string, any>,
  projectSettings: ProjectSettings = {}
): VisualElement[] {
  const elements: VisualElement[] = [];
  const stageWidth = projectSettings.width || 1024;
  const stageHeight = projectSettings.height || 768;
  const centerX = stageWidth / 2;
  let currentY = 250; // Starting position for choice buttons

  console.log(`[SchemaLocationInitializer] Regenerating choice elements for ${beatType}`);

  // movementChoice beats - use hotspot type for location choices
  if (beatType === 'movementChoice' && params.choices) {
    // First pass: calculate sizes for all choices to find the max width
    const choiceSizes = params.choices.map((choice: any, index: number) => {
      const choiceText = choice.text || choice.location || `Location ${index + 1}`;
      const sized = autoSizeText(choiceText, 16, 200, 600, true);
      return { choiceText, ...sized };
    });

    const maxWidth = Math.max(...choiceSizes.map((s: any) => s.width));
    const buttonHeight = 50;

    let buttonY = currentY;
    choiceSizes.forEach((sizeInfo: any, index: number) => {
      const x = centerX - maxWidth / 2;

      elements.push({
        id: `location_${index}_${Date.now()}`,
        type: 'hotspot', // Use hotspot type for location choices
        name: sizeInfo.choiceText, // Use actual text for visual editor
        text: sizeInfo.choiceText,
        x,
        y: buttonY,
        z: 10 + index,
        width: maxWidth,
        height: buttonHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: 'Arial',
        fontSize: 16,
        textAlign: 'center',
      });
      buttonY += buttonHeight + 15;
    });
  }

  // NOTE: dialogTree choice buttons are created in the createElements function above
  // Do NOT duplicate them here - they're already handled at line ~288

  // pickProp beats
  if (beatType === 'pickProp' && params.props) {
    const propsPerRow = 3;
    const propWidth = 200;
    const propHeight = 50;
    const spacing = 20;

    params.props.forEach((prop: any, index: number) => {
      const propName = prop.name || `Prop ${index + 1}`;
      const row = Math.floor(index / propsPerRow);
      const col = index % propsPerRow;
      const totalWidth = (propWidth * propsPerRow) + (spacing * (propsPerRow - 1));
      const startX = centerX - totalWidth / 2;

      const x = startX + (col * (propWidth + spacing));
      const y = currentY + (row * (propHeight + spacing));

      elements.push({
        id: `prop_${index}_${Date.now()}`,
        type: 'button',
        name: propName, // Use actual name for visual editor
        text: propName,
        x,
        y,
        z: 10 + index,
        width: propWidth,
        height: propHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        font: 'Arial',
        fontSize: 14,
        textAlign: 'center',
      });
    });
  }

  console.log(`[SchemaLocationInitializer] Generated ${elements.length} choice elements`);
  return elements;
}
