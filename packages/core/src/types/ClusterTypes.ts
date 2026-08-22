// Cluster container type definitions for spatial story organization

import type { Sound, Location } from './index';

/**
 * Shared visual content that can be inherited by all beats in a cluster
 */
export interface SharedVisualContent {
  /** Shared background settings (different from mapAssetId which is for flowchart view) */
  background?: {
    assetId: string;
    scale?: number;   // Scale factor (default 1.0)
    opacity?: number; // Opacity (0-1, default 1.0)
  };
  /** Shared visual elements (props, characters) inherited by all beats in cluster */
  locations: Location[];
}

/**
 * Cluster container for spatial organization of beats within the flowchart
 * Clusters appear as expandable rectangles that can contain reference graphics
 */
export interface Cluster {
  id: string;
  name: string;
  type: 'spatial' | 'organizational';

  // Flowchart positioning
  containerPosition: {
    x: number;
    y: number;
  };

  // Container dimensions
  containerBounds: {
    width: number;
    height: number;
  };

  // Expand/collapse state
  isExpanded: boolean;

  // Map/background image for spatial clusters (flowchart view only)
  mapAssetId?: string;
  mapScale?: number;    // Independent scale for background image (0.1-3.0, default 1.0)
  mapOpacity?: number;  // Background image opacity (0-1, default 0.5)
  /** How the image fills the frame: 'natural' (top-left at mapScale, the
   *  historical behavior), 'cover' (fill, may crop), 'contain' (letterbox).
   *  Defaults to 'natural' when absent. */
  mapFit?: 'natural' | 'cover' | 'contain';

  // Visual theming
  color?: string;

  // Ambient sound that plays while in this cluster
  // Loops automatically and fades in/out when entering/leaving the cluster
  sound?: Sound;

  // Shared visual content inherited by all beats in this cluster
  // Beats can override individual elements or the entire background
  sharedVisuals?: SharedVisualContent;
}

/**
 * Position of beat within cluster container (relative to container origin)
 */
export interface ContainerBeatPosition {
  beatId: string;
  clusterId: string;
  position: {
    x: number;
    y: number;
    z: number; // Layering within container
  };
  mapStyle?: ContainerBeatStyle;
}

/**
 * Visual styling for beat within container
 */
export interface ContainerBeatStyle {
  icon?: string; // Emoji or icon identifier
  color?: string; // Custom color for this beat in container
  size?: 'small' | 'medium' | 'large';
  label?: string; // Optional custom label for container view
}

/**
 * Cluster container types from beat definitions
 */
export interface ClusterContainerType {
  icon: string;
  description: string;
  supportsMapGraphics: boolean;
  supportsExpandCollapse: boolean;
  supportsBeatContainment: boolean;
}

/**
 * Portal for connections that cross container boundaries
 */
export interface ConnectionPortal {
  id: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  edgeId: string;
  isInbound: boolean;
  coordinates: { x: number; y: number };
  fromContainerId?: string;
  toContainerId?: string;
}

/**
 * Dimensions and layout for cluster containers
 */
export interface ContainerDimensions {
  headerHeight: number;      // Title bar area
  mapArea: {
    width: number;
    height: number;
  };
  beatViewport: {
    width: number;
    height: number;
  };
}

/**
 * Configuration for cluster container within the flowchart
 */
export interface ClusterContainerConfig {
  container: Cluster;
  containedBeats: ContainerBeatPosition[];
  portals?: ConnectionPortal[];
}

/**
 * Animation settings for container transitions
 */
export interface ContainerAnimation {
  expand: {
    duration: number;
    easing: string;
  };
  collapse: {
    duration: number;
    easing: string;
  };
}

/**
 * Default container animation settings
 */
export const DEFAULT_CONTAINER_ANIMATION: ContainerAnimation = {
  expand: {
    duration: 300,
    easing: 'easeOut'
  },
  collapse: {
    duration: 250,
    easing: 'easeIn'
  }
};

/**
 * Default container dimensions
 */
export const DEFAULT_CONTAINER_DIMENSIONS: ContainerDimensions = {
  headerHeight: 40,
  mapArea: {
    width: 400,
    height: 300
  },
  beatViewport: {
    width: 400,
    height: 400
  }
};

/**
 * Cluster container types available in the system
 */
export const CLUSTER_CONTAINER_TYPES: Record<string, ClusterContainerType> = {
  spatial: {
    icon: '🏠',
    description: 'Spatial organization containers with embedded reference graphics',
    supportsMapGraphics: true,
    supportsExpandCollapse: true,
    supportsBeatContainment: true
  },
  organizational: {
    icon: '📂',
    description: 'Logical grouping containers for story organization',
    supportsMapGraphics: false,
    supportsExpandCollapse: true,
    supportsBeatContainment: true
  }
};