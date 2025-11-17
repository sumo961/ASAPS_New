import { ContainerBeatPosition, ContainerDimensions, Beat, DEFAULT_CONTAINER_DIMENSIONS } from '@asaps/core';

/**
 * Calculate optimal container dimensions based on contained beats
 */
export function calculateContainerBounds(
  beatPositions: ContainerBeatPosition[],
  mapAsset?: { width: number; height: number },
  options?: {
    minWidth?: number;
    minHeight?: number;
    padding?: number;
    beatSpacing?: number;
  }
): ContainerDimensions {
  const {
    minWidth = 300,
    minHeight = 200,
    padding = 20,
    beatSpacing = 60
  } = options || {};

  // If there's a map asset with dimensions, prioritize that as minimum
  const mapWidth = mapAsset?.width || 0;
  const mapHeight = mapAsset?.height || 0;

  // Calculate bounds based on beat positions
  let minX = Number.MAX_VALUE;
  let maxX = Number.MIN_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = Number.MIN_VALUE;

  // Consider both beat positions and future expansion room
  beatPositions.forEach(pos => {
    minX = Math.min(minX, pos.position.x - beatSpacing / 2);
    maxX = Math.max(maxX, pos.position.x + beatSpacing / 2);
    minY = Math.min(minY, pos.position.y - beatSpacing / 2);
    maxY = Math.max(maxY, pos.position.y + beatSpacing / 2);
  });

  // Ensure minimum dimensions
  const beatBoundsWidth = Math.max(0, maxX - minX) + padding * 2;
  const beatBoundsHeight = Math.max(0, maxY - minY) + padding * 2;

  // Compare with map dimensions
  const contentWidth = Math.max(mapWidth, beatBoundsWidth);
  const contentHeight = Math.max(mapHeight, beatBoundsHeight);

  // Add header area
  const headerHeight = 40; // Fixed header height
  const totalHeight = contentHeight + headerHeight;

  return {
    headerHeight,
    mapArea: {
      width: Math.max(minWidth, contentWidth),
      height: Math.max(minHeight - headerHeight, Math.max(mapHeight, beatBoundsHeight))
    },
    beatViewport: {
      width: Math.max(minWidth, Math.max(contentWidth, beatBoundsWidth)),
      height: Math.max(minHeight, Math.max(totalHeight, contentHeight))
    }
  };
}

/**
 * Align beat position to grid for neat organization
 */
export function alignToGrid(
  position: { x: number; y: number },
  gridSize: number = 20
): { x: number; y: number } {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize
  };
}

/**
 * Distribute beats evenly within container bounds
 */
export function distributeBeatsInContainer(
  beatPositions: ContainerBeatPosition[],
  containerWidth: number,
  containerHeight: number,
  options?: {
    grid?: boolean;
    gridSize?: number;
    margin?: number;
  }
): ContainerBeatPosition[] {
  const { grid = true, gridSize = 20, margin = 40 } = options || {};

  const availableWidth = containerWidth - margin * 2;
  const availableHeight = containerHeight - margin * 2;

  const n = beatPositions.length;
  if (n === 0) return [];

  if (n === 1) {
    // Single beat - center it
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const aligned = grid ? alignToGrid({ x: centerX, y: centerY }, gridSize) : { x: centerX, y: centerY };

    return [{
      ...beatPositions[0],
      position: {
        ...beatPositions[0].position,
        x: aligned.x,
        y: aligned.y
      }
    }];
  }

  // Calculate optimal grid layout
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const cellWidth = availableWidth / cols;
  const cellHeight = availableHeight / rows;

  return beatPositions.map((pos, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;

    const centerX = margin + col * cellWidth + cellWidth / 2;
    const centerY = margin + row * cellHeight + cellHeight / 2;

    const aligned = grid ? alignToGrid({ x: centerX, y: centerY }, gridSize) : { x: centerX, y: centerY };

    return {
      ...pos,
      position: {
        ...pos.position,
        x: aligned.x,
        y: aligned.y,
        z: index // Ensure proper layering
      }
    };
  });
}

/**
 * Auto-size container to fit all beats plus expansion room
 */
export function autoSizeContainer(
  beatPositions: ContainerBeatPosition[],
  minDimensions: { width: number; height: number } = { width: 300, height: 200 },
  expansionFactor: number = 1.2
): { width: number; height: number } {
  if (beatPositions.length === 0) {
    return minDimensions;
  }

  // Find current bounds
  let minX = Number.MAX_VALUE;
  let maxX = Number.MIN_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = Number.MIN_VALUE;

  beatPositions.forEach(pos => {
    minX = Math.min(minX, pos.position.x);
    maxX = Math.max(maxX, pos.position.x);
    minY = Math.min(minY, pos.position.y);
    maxY = Math.max(maxY, pos.position.y);
  });

  // Add room around current content
  const currentWidth = Math.max(maxX - minX, 0);
  const currentHeight = Math.max(maxY - minY, 0);

  const expandedWidth = Math.max(minDimensions.width, currentWidth * expansionFactor);
  const expandedHeight = Math.max(minDimensions.height, currentHeight * expansionFactor);

  return {
    width: Math.ceil(expandedWidth / 20) * 20, // Round to grid size
    height: Math.ceil(expandedHeight / 20) * 20
  };
}

/**
 * Check if beat position is within container bounds
 */
export function isPositionInContainer(
  position: { x: number; y: number },
  containerBounds: { width: number; height: number },
  padding: number = 10
): boolean {
  return (!!(
    position.x >= padding &&
    position.x <= containerBounds.width - padding &&
    position.y >= padding &&
    position.y <= containerBounds.height - (DEFAULT_CONTAINER_DIMENSIONS.headerHeight + padding)
  ));
}

/**
 * Calculate optimal container type based on beats and their relationships
 */
export function getOptimalContainerType(
  beats: Beat[],
  containerPositions: ContainerBeatPosition[],
  mapAssetId?: string
): 'spatial' | 'organizational' {
  // If map/asset provided → spatial by default
  if (mapAssetId) {
    return 'spatial';
  }

  // Check if beats have strong spatial relationships
  const hasSpatialRelationships = beats.some(beat => {
    const beatType = beat.type.toLowerCase();
    return beatType.includes('movement') ||
           beatType.includes('location') ||
           beatType.includes('place') ||
           beat.name.toLowerCase().includes('at ') ||
           beat.name.toLowerCase().includes('in ') ||
           beat.name.toLowerCase().includes('on ');
  });

  return hasSpatialRelationships ? 'spatial' : 'organizational';
}

/**
 * Find connection portal position on container boundary
 */
export function calculatePortalPosition(
  containerBounds: { width: number; height: number },
  externalPosition: { x: number; y: number },
  containerPosition: { x: number; y: number }
): { side: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number } {
  const relativeX = externalPosition.x - containerPosition.x;
  const relativeY = externalPosition.y - containerPosition.y;

  // Find the closest side
  const distances = {
    top: relativeY,
    bottom: containerBounds.height - relativeY,
    left: relativeX,
    right: containerBounds.width - relativeX
  };

  const closestSide = Object.keys(distances).reduce((closest, side) =>
    distances[side as keyof typeof distances] < distances[closest as keyof typeof distances] ? side : closest,
    'right' as keyof typeof distances
  ) as 'top' | 'bottom' | 'left' | 'right';

  let portalX = 0;
  let portalY = 0;

  switch (closestSide) {
    case 'top':
      portalX = containerBounds.width / 2;
      portalY = 0;
      break;
    case 'bottom':
      portalX = containerBounds.width / 2;
      portalY = containerBounds.height;
      break;
    case 'left':
      portalX = 0;
      portalY = containerBounds.height / 2;
      break;
    case 'right':
      portalX = containerBounds.width;
      portalY = containerBounds.height / 2;
      break;
  }

  return {
    side: closestSide,
    x: portalX,
    y: portalY
  };
}

/**
 * Convert flowchart position to container coordinates
 */
export function flowchartToContainer(
  flowchartPosition: { x: number; y: number },
  containerPosition: { x: number; y: number },
  containerBounds: { width: number; height: number }
): { x: number; y: number } {
  const relativeX = flowchartPosition.x - containerPosition.x;
  const relativeY = flowchartPosition.y - containerPosition.y;

  // Ensure position is within container bounds
  return {
    x: Math.max(0, Math.min(containerBounds.width - 100, relativeX)),
    y: Math.max(DEFAULT_CONTAINER_DIMENSIONS.headerHeight,
              Math.min(containerBounds.height - 100, relativeY))
  };
}

/**
 * Convert container coordinates to flowchart position
 */
export function containerToFlowchart(
  containerPosition: { x: number; y: number },
  containerGlobalPosition: { x: number; y: number },
  isRootContainer: boolean = false
): { x: number; y: number } {
  return {
    x: containerGlobalPosition.x + containerPosition.x,
    y: containerGlobalPosition.y + containerPosition.y
  };
}

export const ContainerPositioningUtils = {
  calculateContainerBounds,
  alignToGrid,
  distributeBeatsInContainer,
  autoSizeContainer,
  isPositionInContainer,
  getOptimalContainerType,
  calculatePortalPosition,
  flowchartToContainer,
  containerToFlowchart
};