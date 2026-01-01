/**
 * Utilities for handling shared visual content between clusters and beats
 */
import type { Location, SharedVisualContent } from '@asaps/core';
import type { VisualElement } from '../components/visual/VisualBeatEditor';

/**
 * Converts cluster shared locations to VisualElements for display
 * These elements are marked as locked (non-editable from beat editor)
 */
export function convertSharedLocationsToElements(
  sharedVisuals: SharedVisualContent | undefined,
  idPrefix = 'shared_'
): VisualElement[] {
  if (!sharedVisuals?.locations || sharedVisuals.locations.length === 0) {
    return [];
  }

  return sharedVisuals.locations.map((loc, index) => ({
    id: `${idPrefix}${loc.name || index}`,
    type: loc.kind as VisualElement['type'],
    assetId: loc.assetId,
    imageUrl: loc.imageUrl,
    characterId: loc.characterId,
    characterName: loc.characterName,
    stateId: loc.stateId,
    size: loc.size,
    text: undefined, // Text would come from beat content, not shared
    x: loc.x,
    y: loc.y,
    z: loc.zIndex ?? index,
    width: loc.width,
    height: loc.height,
    rotation: loc.rotation ?? 0,
    scale: loc.scale ?? 1,
    visible: loc.visible !== false,
    locked: true, // Shared elements are locked in beat editor
    name: `[Shared] ${loc.name}`,
    sound: loc.sound,
    font: loc.font,
    fontSize: loc.fontSize,
    textAlign: loc.textAlign,
    fontOverridden: loc.fontOverridden,
  }));
}

/**
 * Converts VisualElements to Location objects for cluster storage
 */
export function convertElementsToLocations(elements: VisualElement[]): Location[] {
  return elements.map(el => ({
    kind: el.type as Location['kind'],
    name: el.name.replace('[Shared] ', ''),
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.z,
    assetId: el.assetId,
    imageUrl: el.imageUrl,
    characterId: el.characterId,
    characterName: el.characterName,
    stateId: el.stateId,
    size: el.size,
    rotation: el.rotation,
    scale: el.scale,
    sound: el.sound,
    font: el.font,
    fontSize: el.fontSize,
    textAlign: el.textAlign,
    fontOverridden: el.fontOverridden,
    visible: el.visible,
  }));
}

/**
 * Merges cluster shared visuals with beat-specific visuals
 * Cluster shared elements come first (lower z-index base), beat elements overlay
 *
 * @param clusterShared - Shared visuals from the cluster
 * @param beatElements - Beat-specific visual elements
 * @param overrideClusterBackground - If true, beat background takes precedence
 * @returns Merged array of visual elements for rendering
 */
export function mergeClusterAndBeatVisuals(
  clusterShared: SharedVisualContent | undefined,
  beatElements: VisualElement[],
  overrideClusterBackground: boolean = false
): {
  elements: VisualElement[];
  effectiveBackground?: { assetId: string; scale?: number; opacity?: number };
} {
  const sharedElements = convertSharedLocationsToElements(clusterShared);

  // Determine effective background
  let effectiveBackground = clusterShared?.background;
  if (overrideClusterBackground) {
    // Beat background overrides cluster, so we return undefined for cluster background
    effectiveBackground = undefined;
  }

  // Merge elements: shared (locked) first, then beat-specific
  // Adjust z-index: shared elements get negative base to stay behind
  const adjustedShared = sharedElements.map(el => ({
    ...el,
    z: el.z - 1000, // Ensure shared elements are behind beat elements
  }));

  return {
    elements: [...adjustedShared, ...beatElements],
    effectiveBackground,
  };
}

/**
 * Filters out shared elements from an element array (for saving beat-specific only)
 */
export function filterBeatSpecificElements(elements: VisualElement[]): VisualElement[] {
  return elements.filter(el => !el.id.startsWith('shared_') && !el.name.startsWith('[Shared]'));
}

/**
 * Check if an element is a shared (cluster) element
 */
export function isSharedElement(element: VisualElement): boolean {
  return element.id.startsWith('shared_') || element.name.startsWith('[Shared]') || element.locked;
}
