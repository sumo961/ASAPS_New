/**
 * Schema-Driven Location Initialization
 *
 * This utility replaces hardcoded beat-type conditionals with schema-driven logic.
 * It reads the locations array from beat-definitions.json and creates default
 * visual elements based on location names and types.
 */

import type { Beat } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';
import { yawPitchToStage } from './panoramaCoordinates';

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
  fontOverridden?: boolean;  // True if font/size explicitly set, false = use theme defaults
  // Scroll behavior properties
  requireScrollToBottom?: boolean;  // If true, continue button disabled until scrolled
  manuallyResized?: boolean;        // User has manually resized - skip auto-sizing
  initialAutoSized?: boolean;       // Was auto-sized on creation
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
  // Credits page elements
  'creditsTitle': { type: 'text', fontSize: 28, defaultHeight: 60 },
  'creditsBody': { type: 'dialog', fontSize: 16, defaultHeight: 400, defaultWidth: 700 },
  'creditsCloseButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },

  // Buttons
  'startButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'continueButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'submitButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'restartButton': { type: 'button', defaultWidth: 200, defaultHeight: 60, fontSize: 16 },
  'creditsButton': { type: 'button', defaultWidth: 180, defaultHeight: 50, fontSize: 18 },
  'skipButton': { type: 'button', defaultWidth: 120, defaultHeight: 40, fontSize: 16 },

  // Text elements
  'title': { type: 'text', fontSize: 32, defaultHeight: 60 },
  'author': { type: 'text', fontSize: 20, defaultHeight: 40 },
  'text': { type: 'dialog', fontSize: 18, defaultHeight: 100 },
  'summary': { type: 'dialog', fontSize: 16, defaultHeight: 300, defaultWidth: 800 },  // AI Summary
  'message': { type: 'text', fontSize: 18, defaultHeight: 50 },
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

  // Keypad
  'keypadGrid': { type: 'keypad' as any, defaultWidth: 240, defaultHeight: 360 },
  'display': { type: 'text', defaultWidth: 240, defaultHeight: 50 },
};

/**
 * Auto-size text based on content length
 * Padding values match renderer: text=16px/side, button=12h+6v per side
 */
function autoSizeText(
  text: string,
  fontSize: number,
  minWidth: number,
  maxWidth: number,
  isButton: boolean = false
): { width: number; height: number } {
  // Approximate character width - use 0.42 to match renderer's proportional font measurement
  const charWidth = fontSize * 0.42;
  // Padding to match renderer: buttons 24 horizontal (12*2), text 40 (20*2)
  const horizontalPadding = isButton ? 24 : 40;
  // Border width: 2px per side × 2 = 4px total (renderer uses box-sizing: border-box)
  const borderWidth = 4;
  const estimatedWidth = text.length * charWidth + horizontalPadding + borderWidth;

  const width = Math.max(minWidth, Math.min(maxWidth, estimatedWidth));
  const lines = Math.ceil(estimatedWidth / width);
  // Vertical padding: buttons 12 (6*2), text 40 (20*2)
  const verticalPadding = isButton ? 12 : 40;
  const height = lines * fontSize * 1.5 + verticalPadding + borderWidth;

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
  if (beatType === 'infoText' || beatType === 'durScreen') {
    if (nameLower.includes('text')) return params.text || '';
    if (nameLower.includes('continue')) return params.buttonText || 'Continue';
  }

  // End screen
  if (beatType === 'endScreen') {
    if (nameLower.includes('message')) return params.message || 'The End';
    // Support both restartText (new) and buttonText (legacy/Twine import) for restart button
    if (nameLower.includes('restart')) return params.restartText || params.buttonText || 'Restart';
    if (nameLower.includes('credits')) return params.creditsText || 'Credits';
  }

  // AI Summary
  if (beatType === 'aiSummary') {
    if (nameLower.includes('title')) return params.title || 'Your Journey';
    if (nameLower.includes('summary')) return '[AI-generated summary will appear here]';
    if (nameLower.includes('restart')) return params.restartText || 'Play Again';
    if (nameLower.includes('credits')) return params.creditsText || 'Credits';
  }

  // Online Content
  if (beatType === 'onlineContent') {
    if (nameLower === 'title') {
      // If title is provided, use it; otherwise show placeholder for auto-derived title
      if (params.title) return params.title;
      if (params.query) {
        // Show what the auto-derived title might look like
        return `[Title derived from: "${params.query.substring(0, 30)}${params.query.length > 30 ? '...' : ''}"]`;
      }
      return '[Title will be auto-derived]';
    }
    if (nameLower.includes('text')) {
      // Show sample content based on source type
      if (params.sourceType === 'ai-query' && params.query) {
        return `[AI will search: "${params.query.substring(0, 50)}${params.query.length > 50 ? '...' : ''}"]`;
      }
      return params.displayTemplate || '[Online content will appear here]';
    }
    if (nameLower.includes('continue')) return params.buttonText || 'Continue';
  }

  // AI Dialog Tree
  if (beatType === 'aiDialogTree') {
    if (nameLower.includes('dialog')) {
      const npcName = params.npcName || 'Character';
      return `[${npcName} will respond based on: "${(params.scenario || 'scenario').substring(0, 40)}..."]`;
    }
    if (nameLower.includes('choice')) return '[AI-generated choices will appear here]';
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

  // Panorama
  if (beatType === 'panorama') {
    if (nameLower.includes('prompt')) return params.prompt || '';
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
    if (beat.type === 'endScreen' || beat.type === 'aiSummary') {
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
    if (beat.type === 'panorama' && locationName === 'hotspots') {
      return; // Skip - will be created dynamically below
    }
    // Skip 'hyperlinks' location for hyperText - links are rendered as part of the text element
    if (beat.type === 'hyperText' && locationName === 'hyperlinks') {
      return; // Skip - hyperlinks are rendered as clickable spans within the text
    }

    const locationDef = LOCATION_TYPE_MAP[locationName] || { type: 'text' as const };
    const elementType = locationDef.type || 'text';

    // Get default text from parameters
    const defaultText = getDefaultTextForLocation(beat.type, locationName, params);

    // Determine size
    let width = locationDef.defaultWidth || 400;
    let height = locationDef.defaultHeight || 50;

    // AI content beats need special handling
    const isAIContentBeat = ['onlineContent', 'aiSummary', 'aiInfoText'].includes(beat.type);

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

      // For AI content beats, use wider minimum width since content will be longer than placeholder
      // This ensures the text box uses more of the available stage width
      if (isAIContentBeat && (locationName === 'text' || locationName === 'summary')) {
        const minAITextWidth = Math.floor(stageWidth * 0.75); // 75% of stage width
        width = Math.max(width, minAITextWidth);
      }

      // Cap height for endScreen messages to leave room for buttons
      if (beat.type === 'endScreen' && locationName === 'message') {
        const maxMessageHeight = stageHeight - 250; // Leave room for button at bottom
        if (height > maxMessageHeight) {
          height = maxMessageHeight;
        }
      }
    }

    // Determine position
    const x = centerX - width / 2; // Center horizontally by default
    let y = currentY;

    // Special positioning for certain elements
    if (locationName.toLowerCase().includes('button')) {
      // Buttons go lower on screen
      const buttonNameLower = locationName.toLowerCase();
      if (buttonNameLower.includes('start') || buttonNameLower.includes('continue') ||
          buttonNameLower.includes('restart') || buttonNameLower.includes('credits') ||
          buttonNameLower.includes('submit')) {
        y = stageHeight - 150; // Near bottom for action buttons
      } else {
        y = currentY;
        currentY += height + 20; // Stack vertically
      }
    } else if (locationName === 'title') {
      // Title at top - use tighter spacing for AI beats
      y = isAIContentBeat ? 40 : 60;
      // For AI beats, cap title height and reduce gap
      if (isAIContentBeat) {
        const originalHeight = height;
        height = Math.min(height, 80); // Cap title height for AI beats
        currentY = y + height + 15; // Smaller gap after title
        console.log(`[SchemaLocationInitializer] AI title: y=${y}, height=${height} (was ${originalHeight}), nextY=${currentY}`);
      } else {
        currentY = y + height + 40; // Space after title
      }
    } else if (locationName === 'author') {
      // Author below title
      y = currentY;
      currentY = y + height + 40;
    } else if (locationName === 'summary') {
      // Summary gets extra gap from title and more height
      y = currentY + 20; // Extra gap before summary
      currentY = y + height + 30;
    } else if ((locationName === 'text' || locationName === 'summary') && isAIContentBeat) {
      // For AI content beats, text/summary element should fill available space
      // If this is the first element (no title), start higher
      if (beat.type === 'aiInfoText' && currentY === 100) {
        currentY = 60; // Start higher for title-less AI beats
      }
      y = currentY;
      // Calculate available height: from currentY to button area
      const buttonAreaTop = stageHeight - 150; // Button is at stageHeight - 150
      const availableHeight = buttonAreaTop - y - 30; // Leave 30px gap above button
      const originalHeight = height;
      height = Math.max(height, Math.min(availableHeight, 400)); // Use available space, cap at 400
      console.log(`[SchemaLocationInitializer] AI ${locationName}: y=${y}, height=${height} (was ${originalHeight}), availableHeight=${availableHeight}, buttonAreaTop=${buttonAreaTop}`);
      currentY = y + height + 20;
    } else {
      // Stack other elements
      y = currentY;
      currentY += height + 20;
    }

    // Use standard font sizes - let content scroll if needed
    const fontSize = locationDef.fontSize || 16;
    console.log(`[SchemaLocationInitializer] ${beat.type}/${locationName}: fontSize=${fontSize}, locationDef.fontSize=${locationDef.fontSize}`);

    // Determine if this element should require scroll-to-bottom
    // For AI summary beats with medium/long summaries, the summary element should require scrolling
    const shouldRequireScroll = beat.type === 'aiSummary' &&
      locationName === 'summary' &&
      (params.maxLength === 'medium' || params.maxLength === 'long');

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
      font: undefined, // Use theme default
      fontSize,
      textAlign: 'center',
      // Mark as auto-sized so we can re-auto-size when content changes (unless manually resized)
      initialAutoSized: true,
      // For longer AI summaries, require user to scroll to bottom before continuing
      requireScrollToBottom: shouldRequireScroll,
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
          font: undefined, // Use theme default
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
        font: undefined, // Use theme default
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

      // If prop has assetId, create a 'prop' type element with the asset
      // Otherwise, create a button element
      if (prop.assetId) {
        elements.push({
          id: `prop_${index}_${Date.now()}`,
          type: 'prop',  // Prop type for graphic-based props
          name: propName,
          text: propName,
          x,
          y,
          z: 10 + index,
          width: 128,  // Default prop size
          height: 128,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          assetId: prop.assetId,  // Include the asset ID
        });
      } else {
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
          font: undefined, // Use theme default
          fontSize: 14,
          textAlign: 'center',
        });
      }
    });
  }

  // Panorama hotspots → VisualElement hotspots
  // Convert pitch/yaw to x/y using projection-aware conversion
  if (beat.type === 'panorama' && params.hotspots) {
    const projType = params.projectionType || 'equirectangular';
    const imgAspect = params.imageAspectRatio ?? 4;
    console.log(`[SchemaLocationInitializer] Panorama hotspots: ${params.hotspots.length} hotspots, proj=${projType}, imgAspect=${imgAspect}, stage=${stageWidth}x${stageHeight}`);
    const hotspotWidth = 120;
    const hotspotHeight = 50;

    params.hotspots.forEach((hs: any, index: number) => {
      const { centerX: xCenter, centerY: yCenter } = yawPitchToStage(hs.yaw ?? 0, hs.pitch ?? 0, projType, stageWidth, stageHeight, imgAspect);
      console.log(`[SchemaLocationInitializer]   hs=${hs.id} (${hs.text}): yaw=${hs.yaw ?? 0} pitch=${hs.pitch ?? 0} → px(${Math.round(xCenter)},${Math.round(yCenter)})`);

      elements.push({
        id: hs.id || `hotspot_${index}_${Date.now()}`,
        type: 'hotspot',
        name: hs.text || `Hotspot ${index + 1}`,
        text: hs.text || `Hotspot ${index + 1}`,
        x: xCenter - hotspotWidth / 2,
        y: yCenter - hotspotHeight / 2,
        z: 10 + index,
        width: hotspotWidth,
        height: hotspotHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
      });
    });
  }

  // Post-process: EndScreen with both restart and credits buttons → place side by side
  if (beat.type === 'endScreen') {
    const restartBtn = elements.find(e => e.name?.toLowerCase().includes('restart'));
    const creditsBtn = elements.find(e => e.name?.toLowerCase().includes('credits') && e.type === 'button');
    if (restartBtn && creditsBtn) {
      const spacing = 20;
      const totalWidth = restartBtn.width + creditsBtn.width + spacing;
      restartBtn.x = centerX - totalWidth / 2;
      creditsBtn.x = centerX - totalWidth / 2 + restartBtn.width + spacing;
      creditsBtn.y = restartBtn.y; // Same row
    }
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
      // Scroll behavior properties
      if (el.requireScrollToBottom) location.requireScrollToBottom = el.requireScrollToBottom;
      if (el.initialAutoSized) location.initialAutoSized = el.initialAutoSized;
      if (el.manuallyResized) location.manuallyResized = el.manuallyResized;

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
  const currentY = 250; // Starting position for choice buttons

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
        font: undefined, // Use theme default
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

      // If prop has assetId, create a 'prop' type element with the asset
      // Otherwise, create a button element
      if (prop.assetId) {
        elements.push({
          id: `prop_${index}_${Date.now()}`,
          type: 'prop',  // Prop type for graphic-based props
          name: propName,
          text: propName,
          x,
          y,
          z: 10 + index,
          width: 128,
          height: 128,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          assetId: prop.assetId,
        });
      } else {
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
          font: undefined, // Use theme default
          fontSize: 14,
          textAlign: 'center',
        });
      }
    });
  }

  console.log(`[SchemaLocationInitializer] Generated ${elements.length} choice elements`);
  return elements;
}
