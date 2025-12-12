/**
 * Default Location Generator for Renderer
 *
 * Generates default positioned locations for beat types when the beat
 * doesn't have locations defined. This ensures consistent rendering
 * between the Visual Editor and Preview.
 */

import type { Location } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

// Type mapping for location names
const LOCATION_TYPE_MAP: Record<string, { kind: 'text' | 'button' | 'dialog' | 'hotspot'; fontSize?: number }> = {
  // Text elements
  'title': { kind: 'text', fontSize: 32 },
  'author': { kind: 'text', fontSize: 20 },
  'text': { kind: 'dialog', fontSize: 18 },
  'message': { kind: 'text', fontSize: 24 },
  'prompt': { kind: 'dialog', fontSize: 18 },
  'question': { kind: 'dialog', fontSize: 18 },
  'dialog': { kind: 'dialog', fontSize: 16 },
  'hyperlinks': { kind: 'dialog', fontSize: 16 },

  // Buttons
  'startButton': { kind: 'button', fontSize: 18 },
  'continueButton': { kind: 'button', fontSize: 18 },
  'submitButton': { kind: 'button', fontSize: 18 },
  'restartButton': { kind: 'button', fontSize: 18 },
  'creditsButton': { kind: 'button', fontSize: 18 },
  'skipButton': { kind: 'button', fontSize: 16 },

  // Input/hotspots
  'inputField': { kind: 'hotspot' },
  'video': { kind: 'hotspot' },
  'controls': { kind: 'hotspot' },
};

/**
 * Generate default locations for a beat type
 */
export function generateDefaultLocations(
  beatType: string,
  content: Record<string, any>,
  stageWidth: number = 1024,
  stageHeight: number = 768
): Location[] {
  const beatDef = (beatDefinitions as any).beatTypes[beatType];
  if (!beatDef || !beatDef.locations) {
    console.warn(`[DefaultLocationGenerator] No schema for beat type: ${beatType}`);
    return [];
  }

  const locations: Location[] = [];
  const centerX = stageWidth / 2;
  let currentY = 100;

  console.log(`[DefaultLocationGenerator] Generating locations for ${beatType}:`, beatDef.locations);

  beatDef.locations.forEach((locationName: string, index: number) => {
    const typeInfo = LOCATION_TYPE_MAP[locationName] || { kind: 'text' as const };

    // Determine dimensions based on type
    let width: number;
    let height: number;

    if (typeInfo.kind === 'button') {
      width = 180;
      height = 50;
    } else if (typeInfo.kind === 'dialog' || typeInfo.kind === 'text') {
      width = 600;
      height = locationName === 'title' ? 60 : locationName === 'author' ? 40 : 100;
    } else {
      width = 400;
      height = 50;
    }

    // Determine position
    let x = centerX - width / 2;
    let y = currentY;

    // Special positioning for specific elements
    if (locationName === 'title') {
      y = 80;
      currentY = y + height + 30;
    } else if (locationName === 'author') {
      y = currentY;
      currentY = y + height + 40;
    } else if (locationName.toLowerCase().includes('button')) {
      if (locationName === 'startButton' || locationName === 'continueButton' || locationName === 'submitButton') {
        // Start/continue buttons at bottom
        y = stageHeight - 150;
      } else {
        // Other buttons stack
        y = currentY;
        currentY += height + 20;
      }
    } else {
      // Stack other elements
      y = currentY;
      currentY += height + 20;
    }

    const location: Location = {
      kind: typeInfo.kind,
      name: locationName.charAt(0).toUpperCase() + locationName.slice(1).replace(/([A-Z])/g, ' $1').trim(),
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      zIndex: index,
      autosize: typeInfo.fontSize === undefined,
    };

    if (typeInfo.fontSize) {
      location.fontSize = typeInfo.fontSize;
    }

    locations.push(location);
  });

  // Handle dynamic elements (choices for dialogTree, movementChoice, pickProp)
  if (beatType === 'dialogTree' && content.choices && Array.isArray(content.choices)) {
    const buttonHeight = 50;
    const buttonWidth = 300;
    let buttonY = currentY;

    content.choices.forEach((choice: any, index: number) => {
      const choiceText = choice.text || `Choice ${index + 1}`;
      locations.push({
        kind: 'button',
        name: choiceText,
        x: Math.round(centerX - buttonWidth / 2),
        y: Math.round(buttonY),
        width: buttonWidth,
        height: buttonHeight,
        zIndex: 10 + index,
        fontSize: 16,
      });
      buttonY += buttonHeight + 15;
    });
  }

  if (beatType === 'movementChoice' && content.choices && Array.isArray(content.choices)) {
    const buttonHeight = 50;
    const buttonWidth = 300;
    let buttonY = currentY;

    content.choices.forEach((choice: any, index: number) => {
      const choiceText = choice.text || choice.location || `Location ${index + 1}`;
      locations.push({
        kind: 'hotspot',
        name: choiceText,
        x: Math.round(centerX - buttonWidth / 2),
        y: Math.round(buttonY),
        width: buttonWidth,
        height: buttonHeight,
        zIndex: 10 + index,
        fontSize: 16,
      });
      buttonY += buttonHeight + 15;
    });
  }

  if (beatType === 'pickProp' && content.props && Array.isArray(content.props)) {
    const propsPerRow = 3;
    const propWidth = 200;
    const propHeight = 50;
    const spacing = 20;

    content.props.forEach((prop: any, index: number) => {
      const propName = prop.name || `Prop ${index + 1}`;
      const row = Math.floor(index / propsPerRow);
      const col = index % propsPerRow;
      const totalWidth = (propWidth * propsPerRow) + (spacing * (propsPerRow - 1));
      const startX = centerX - totalWidth / 2;

      const x = startX + (col * (propWidth + spacing));
      const y = currentY + (row * (propHeight + spacing));

      locations.push({
        kind: 'button',
        name: propName,
        x: Math.round(x),
        y: Math.round(y),
        width: propWidth,
        height: propHeight,
        zIndex: 10 + index,
        fontSize: 14,
      });
    });
  }

  console.log(`[DefaultLocationGenerator] Generated ${locations.length} locations for ${beatType}`);
  return locations;
}
