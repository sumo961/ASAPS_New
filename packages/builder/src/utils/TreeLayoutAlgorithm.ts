/**
 * Tree/DAG Layout Algorithm for Story Flowcharts
 *
 * Re-exports the core layout algorithm from @asaps/core and provides
 * beat-specific wrapper functions for the builder.
 */

// Re-export core layout algorithm
export {
  calculateTreeLayout,
  type LayoutNode,
  type LayoutEdge,
  type LayoutOptions,
  type LayoutResult,
} from '@asaps/core';

import { calculateTreeLayout, type LayoutEdge } from '@asaps/core';

interface NodeData {
  id: string;
  position?: { x: number; y: number };
}

interface EdgeData {
  source: string;
  target: string;
}

/**
 * Extract connections from story beat data structure
 * Handles various beat types with embedded connections
 */
export function extractConnectionsFromBeats(
  beats: Array<{
    id: string;
    type: string;
    parameters?: Record<string, any>;
  }>
): EdgeData[] {
  const edges: EdgeData[] = [];
  const seenEdges = new Set<string>();

  const addEdge = (source: string, target: string) => {
    const key = `${source}->${target}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push({ source, target });
    }
  };

  // Helper to extract target from various formats
  const extractTargetId = (target: any): string | null => {
    if (!target) return null;
    // Direct string target
    if (typeof target === 'string') return target;
    // Nested object with .next property (Claude Desktop format)
    if (typeof target === 'object' && target.next) return target.next;
    // Nested object with .target property
    if (typeof target === 'object' && typeof target.target === 'string') return target.target;
    return null;
  };

  // Helper to extract from dialogTree
  // Supports multiple formats: direct targets, nested objects, and entries arrays
  const extractDialogTreeTargets = (node: any, beatId: string): void => {
    if (!node) return;

    // Handle choices array
    if (node.choices && Array.isArray(node.choices)) {
      node.choices.forEach((choice: any) => {
        // Extract target from various formats
        const targetId = extractTargetId(choice.target);
        if (targetId) {
          addEdge(beatId, targetId);
        }
        // New format: dialogNode for nested dialog
        if (choice.dialogNode) {
          extractDialogTreeTargets(choice.dialogNode, beatId);
        }
        // Recurse into nested target objects that contain more dialog data
        if (typeof choice.target === 'object' && choice.target && !choice.target.next) {
          extractDialogTreeTargets(choice.target, beatId);
        }
      });
    }

    // Handle entries array (alternative dialog structure)
    if (node.entries && Array.isArray(node.entries)) {
      node.entries.forEach((entry: any) => {
        if (entry.choices && Array.isArray(entry.choices)) {
          entry.choices.forEach((choice: any) => {
            const targetId = extractTargetId(choice.target);
            if (targetId) {
              addEdge(beatId, targetId);
            }
          });
        }
      });
    }
  };

  beats.forEach((beat) => {
    const params = beat.parameters || {};

    // Single connection
    if (params.connection?.target) {
      addEdge(beat.id, params.connection.target);
    }

    // conditionBeat - supports both direct targets and connection objects
    if (beat.type === 'conditionBeat') {
      // Direct target format (preferred)
      if (params.trueTarget) {
        addEdge(beat.id, params.trueTarget);
      }
      if (params.falseTarget) {
        addEdge(beat.id, params.falseTarget);
      }
      // Legacy connection object format
      if (params.trueConnection?.target) {
        addEdge(beat.id, params.trueConnection.target);
      }
      if (params.falseConnection?.target) {
        addEdge(beat.id, params.falseConnection.target);
      }
    }

    // dialogTree
    if (beat.type === 'dialogTree' && params.dialogTree) {
      extractDialogTreeTargets(params.dialogTree, beat.id);
    }

    // movementChoice
    if (beat.type === 'movementChoice' && params.choices) {
      params.choices.forEach((choice: any) => {
        if (choice.target) {
          addEdge(beat.id, choice.target);
        }
      });
    }

    // pickProp
    if (beat.type === 'pickProp' && params.props) {
      params.props.forEach((prop: any) => {
        if (prop.target) {
          addEdge(beat.id, prop.target);
        }
      });
    }

    // hyperText
    if (beat.type === 'hyperText' && params.hyperlinks) {
      params.hyperlinks.forEach((link: any) => {
        if (link.targetBeatId) {
          addEdge(beat.id, link.targetBeatId);
        }
      });
    }

    // randomTarget
    if (beat.type === 'randomTarget' && params.choices) {
      params.choices.forEach((choice: any) => {
        const target = typeof choice === 'string' ? choice : choice.target;
        if (target) {
          addEdge(beat.id, target);
        }
      });
    }

    // endScreen restart
    if (beat.type === 'endScreen' && params.restartConnection?.target) {
      addEdge(beat.id, params.restartConnection.target);
    }
  });

  return edges;
}

/**
 * Apply tree layout to story beats
 *
 * @param beats - Array of story beats with positions
 * @param options - Layout options
 * @param externalEdges - Optional external edges to include (from beat.getConnections())
 * @returns Map of beat id to new position
 */
export function applyTreeLayoutToBeats(
  beats: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    parameters?: Record<string, any>;
  }>,
  options?: { nodeSpacingX?: number; nodeSpacingY?: number; startX?: number; startY?: number },
  externalEdges?: Array<{ source: string; target: string }>
): Map<string, { x: number; y: number }> {
  // Extract edges from beat parameters (for multi-target beats like dialogTree, movementChoice)
  const parameterEdges = extractConnectionsFromBeats(beats);

  // Combine parameter edges with external edges (from beat.getConnections())
  const allEdges: LayoutEdge[] = [...parameterEdges];
  if (externalEdges) {
    const seenEdges = new Set(parameterEdges.map(e => `${e.source}->${e.target}`));
    externalEdges.forEach(edge => {
      const key = `${edge.source}->${edge.target}`;
      if (!seenEdges.has(key)) {
        allEdges.push(edge);
        seenEdges.add(key);
      }
    });
  }

  const nodes = beats.map((b) => ({ id: b.id, position: b.position }));
  const { positions } = calculateTreeLayout(nodes, allEdges, options);
  return positions;
}

/**
 * Cluster information for layout
 */
interface ClusterInfo {
  id: string;
  beatIds: string[];
  containerBounds: { width: number; height: number };
  containerPosition?: { x: number; y: number };
}

/**
 * Result of cluster-aware layout
 */
export interface ClusterAwareLayoutResult {
  /** Positions for unclustered beats */
  beatPositions: Map<string, { x: number; y: number }>;
  /** Positions for cluster containers */
  clusterPositions: Map<string, { x: number; y: number }>;
  /** Positions for beats within each cluster (relative to cluster origin) */
  clusterInternalPositions: Map<string, Map<string, { x: number; y: number }>>;
  /** Calculated cluster sizes (may be larger than original bounds) */
  clusterSizes: Map<string, { width: number; height: number }>;
}

// Constants for layout
const BEAT_WIDTH = 160;
const BEAT_HEIGHT = 60;
const CLUSTER_PADDING = 40;
const CLUSTER_HEADER_HEIGHT = 50;

/**
 * Apply tree layout with cluster awareness
 *
 * Clusters are treated as single nodes in the main layout, with their internal
 * beats positioned separately within the cluster bounds. Cluster sizes are
 * calculated based on their internal content.
 *
 * @param beats - Array of story beats with cluster assignment
 * @param clusters - Array of cluster definitions
 * @param options - Layout options
 * @param externalEdges - Optional external edges
 * @returns Layout result with positions for beats, clusters, and internal cluster beats
 */
export function applyClusterAwareTreeLayout(
  beats: Array<{
    id: string;
    type: string;
    cluster?: string;
    position?: { x: number; y: number };
    parameters?: Record<string, any>;
  }>,
  clusters: ClusterInfo[],
  options?: { nodeSpacingX?: number; nodeSpacingY?: number; startX?: number; startY?: number },
  externalEdges?: Array<{ source: string; target: string }>
): ClusterAwareLayoutResult {
  const defaultOptions = {
    nodeSpacingX: 200,
    nodeSpacingY: 150,
    startX: 100,
    startY: 50,
  };
  const opts = { ...defaultOptions, ...options };

  // Build cluster map for quick lookup
  const clusterMap = new Map<string, ClusterInfo>();
  clusters.forEach(c => clusterMap.set(c.id, c));

  // Separate beats into clustered and unclustered
  const unclusteredBeats = beats.filter(b => !b.cluster);
  const clusteredBeats = beats.filter(b => b.cluster);

  // Group beats by cluster
  const beatsByCluster = new Map<string, typeof beats>();
  clusteredBeats.forEach(beat => {
    if (beat.cluster) {
      const existing = beatsByCluster.get(beat.cluster) || [];
      existing.push(beat);
      beatsByCluster.set(beat.cluster, existing);
    }
  });

  // Extract all edges
  const allEdges = extractConnectionsFromBeats(beats);
  if (externalEdges) {
    const seenEdges = new Set(allEdges.map(e => `${e.source}->${e.target}`));
    externalEdges.forEach(edge => {
      const key = `${edge.source}->${edge.target}`;
      if (!seenEdges.has(key)) {
        allEdges.push(edge);
        seenEdges.add(key);
      }
    });
  }

  // STEP 1: Layout beats inside each cluster FIRST to determine cluster sizes
  const clusterInternalPositions = new Map<string, Map<string, { x: number; y: number }>>();
  const clusterSizes = new Map<string, { width: number; height: number }>();

  clusters.forEach(cluster => {
    const clusterBeats = beatsByCluster.get(cluster.id) || [];
    if (clusterBeats.length === 0) {
      clusterInternalPositions.set(cluster.id, new Map());
      // Empty cluster gets minimum size
      clusterSizes.set(cluster.id, {
        width: Math.max(cluster.containerBounds.width, 200),
        height: Math.max(cluster.containerBounds.height, 150)
      });
      return;
    }

    // Extract internal edges (edges between beats in this cluster)
    const clusterBeatIds = new Set(clusterBeats.map(b => b.id));
    const internalEdges = allEdges.filter(
      e => clusterBeatIds.has(e.source) && clusterBeatIds.has(e.target)
    );

    // Layout internal beats
    const internalNodes = clusterBeats.map(b => ({ id: b.id }));
    const { positions: internalPos } = calculateTreeLayout(
      internalNodes,
      internalEdges,
      {
        nodeSpacingX: 180,
        nodeSpacingY: 100,
        startX: CLUSTER_PADDING,
        startY: CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING / 2,
      }
    );

    clusterInternalPositions.set(cluster.id, internalPos);

    // Calculate required cluster size based on internal beat positions
    let maxX = 0;
    let maxY = 0;
    internalPos.forEach(pos => {
      maxX = Math.max(maxX, pos.x + BEAT_WIDTH);
      maxY = Math.max(maxY, pos.y + BEAT_HEIGHT);
    });

    // Add padding for right and bottom edges
    const requiredWidth = maxX + CLUSTER_PADDING;
    const requiredHeight = maxY + CLUSTER_PADDING;

    // Use the larger of original bounds or required size
    clusterSizes.set(cluster.id, {
      width: Math.max(cluster.containerBounds.width, requiredWidth),
      height: Math.max(cluster.containerBounds.height, requiredHeight),
    });
  });

  // STEP 2: Transform edges for cluster-level layout
  const beatToCluster = new Map<string, string>();
  clusteredBeats.forEach(beat => {
    if (beat.cluster) {
      beatToCluster.set(beat.id, beat.cluster);
    }
  });

  const transformedEdges: LayoutEdge[] = [];
  const seenTransformed = new Set<string>();

  allEdges.forEach(edge => {
    const sourceCluster = beatToCluster.get(edge.source);
    const targetCluster = beatToCluster.get(edge.target);

    const actualSource = sourceCluster ? `cluster:${sourceCluster}` : edge.source;
    const actualTarget = targetCluster ? `cluster:${targetCluster}` : edge.target;

    // Skip internal cluster edges
    if (sourceCluster && targetCluster && sourceCluster === targetCluster) {
      return;
    }

    // Skip self-loops
    if (actualSource === actualTarget) {
      return;
    }

    const key = `${actualSource}->${actualTarget}`;
    if (!seenTransformed.has(key)) {
      seenTransformed.add(key);
      transformedEdges.push({ source: actualSource, target: actualTarget });
    }
  });

  // STEP 3: Calculate node sizes for spacing
  const nodeSizes = new Map<string, { width: number; height: number }>();

  // Unclustered beats have fixed size
  unclusteredBeats.forEach(b => {
    nodeSizes.set(b.id, { width: BEAT_WIDTH, height: BEAT_HEIGHT });
  });

  // Clusters use their calculated sizes
  clusters.forEach(cluster => {
    const size = clusterSizes.get(cluster.id) || { width: 300, height: 200 };
    nodeSizes.set(`cluster:${cluster.id}`, size);
  });

  // STEP 4: Run main layout with size-aware spacing
  const mainLayoutNodes = [
    ...unclusteredBeats.map(b => ({ id: b.id, position: b.position })),
    ...clusters.map(cluster => ({
      id: `cluster:${cluster.id}`,
      position: cluster.containerPosition,
    })),
  ];

  // Calculate spacing based on largest elements
  let maxNodeWidth = BEAT_WIDTH;
  let maxNodeHeight = BEAT_HEIGHT;
  nodeSizes.forEach(size => {
    maxNodeWidth = Math.max(maxNodeWidth, size.width);
    maxNodeHeight = Math.max(maxNodeHeight, size.height);
  });

  const { positions: mainPositions } = calculateTreeLayout(
    mainLayoutNodes,
    transformedEdges,
    {
      ...opts,
      nodeSpacingX: Math.max(opts.nodeSpacingX, maxNodeWidth + 50),
      nodeSpacingY: Math.max(opts.nodeSpacingY, maxNodeHeight + 50),
    }
  );

  // Extract beat and cluster positions
  const beatPositions = new Map<string, { x: number; y: number }>();
  const clusterPositions = new Map<string, { x: number; y: number }>();

  mainPositions.forEach((pos, id) => {
    if (id.startsWith('cluster:')) {
      const clusterId = id.replace('cluster:', '');
      clusterPositions.set(clusterId, pos);
    } else {
      beatPositions.set(id, pos);
    }
  });

  // STEP 5: Resolve overlaps between all elements
  resolveOverlaps(beatPositions, clusterPositions, nodeSizes);

  return {
    beatPositions,
    clusterPositions,
    clusterInternalPositions,
    clusterSizes,
  };
}

/**
 * Resolve overlaps between beats and clusters
 */
function resolveOverlaps(
  beatPositions: Map<string, { x: number; y: number }>,
  clusterPositions: Map<string, { x: number; y: number }>,
  nodeSizes: Map<string, { width: number; height: number }>
): void {
  const PADDING = 30;
  const MAX_ITERATIONS = 50;

  // Collect all positioned elements
  interface Element {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isCluster: boolean;
  }

  const elements: Element[] = [];

  beatPositions.forEach((pos, id) => {
    const size = nodeSizes.get(id) || { width: BEAT_WIDTH, height: BEAT_HEIGHT };
    elements.push({ id, x: pos.x, y: pos.y, width: size.width, height: size.height, isCluster: false });
  });

  clusterPositions.forEach((pos, id) => {
    const size = nodeSizes.get(`cluster:${id}`) || { width: 300, height: 200 };
    elements.push({ id, x: pos.x, y: pos.y, width: size.width, height: size.height, isCluster: true });
  });

  // Check if two elements overlap
  const overlaps = (a: Element, b: Element): boolean => {
    return !(a.x + a.width + PADDING < b.x ||
             b.x + b.width + PADDING < a.x ||
             a.y + a.height + PADDING < b.y ||
             b.y + b.height + PADDING < a.y);
  };

  // Iteratively resolve overlaps
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let hadOverlap = false;

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i];
        const b = elements[j];

        if (overlaps(a, b)) {
          hadOverlap = true;

          // Calculate overlap amount
          const overlapX = Math.min(
            a.x + a.width + PADDING - b.x,
            b.x + b.width + PADDING - a.x
          );
          const overlapY = Math.min(
            a.y + a.height + PADDING - b.y,
            b.y + b.height + PADDING - a.y
          );

          // Move apart in the direction of least overlap
          if (overlapX < overlapY) {
            const shift = overlapX / 2 + 1;
            if (a.x < b.x) {
              a.x -= shift;
              b.x += shift;
            } else {
              a.x += shift;
              b.x -= shift;
            }
          } else {
            const shift = overlapY / 2 + 1;
            if (a.y < b.y) {
              a.y -= shift;
              b.y += shift;
            } else {
              a.y += shift;
              b.y -= shift;
            }
          }
        }
      }
    }

    if (!hadOverlap) break;
  }

  // Apply resolved positions back
  elements.forEach(el => {
    if (el.isCluster) {
      clusterPositions.set(el.id, { x: el.x, y: el.y });
    } else {
      beatPositions.set(el.id, { x: el.x, y: el.y });
    }
  });
}
