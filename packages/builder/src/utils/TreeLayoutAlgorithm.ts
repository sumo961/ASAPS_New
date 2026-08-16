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
import { beatLinks, dedupeLinks } from './storyLinks';

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
  // One walk, shared with the validators and both importers — storyLinks.
  // This file used to carry the RICHEST of the six hand-rolled copies (only
  // layout knew about hotspots, keypad failTarget, QR jumps and the entries[]
  // dialog shape), which meant beats reachable only those ways were "unreachable"
  // to everything else. The union now lives in one place.
  const links = beats.flatMap((beat) => beatLinks(beat));
  return dedupeLinks(links).map((l) => ({ source: l.source, target: l.target }));
}

export function applyTreeLayoutToBeats(
  beats: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    parameters?: Record<string, any>;
  }>,
  options?: { nodeSpacingX?: number; nodeSpacingY?: number; startX?: number; startY?: number },
  externalEdges?: Array<{ source: string; target: string }>,
  startBeatId?: string
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

  // Reorder beats to ensure startBeatId is first (will be positioned at top)
  let orderedBeats = beats;
  if (startBeatId) {
    const startIndex = beats.findIndex(b => b.id === startBeatId);
    if (startIndex > 0) {
      orderedBeats = [
        beats[startIndex],
        ...beats.slice(0, startIndex),
        ...beats.slice(startIndex + 1)
      ];
    }
  }

  const nodes = orderedBeats.map((b) => ({ id: b.id, position: b.position }));
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
}

/**
 * Apply tree layout with cluster awareness
 *
 * Clusters are treated as single nodes in the main layout, with their internal
 * beats positioned separately within the cluster bounds.
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

  // Create virtual nodes for clusters (treating them as single large nodes)
  const virtualClusterNodes = clusters.map(cluster => ({
    id: `cluster:${cluster.id}`,
    position: cluster.containerPosition,
  }));

  // Extract edges, replacing clustered beat references with cluster references
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

  // Transform edges: if source or target is in a cluster, point to/from the cluster instead
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

    // Determine actual source/target (either beat ID or cluster virtual node ID)
    const actualSource = sourceCluster ? `cluster:${sourceCluster}` : edge.source;
    const actualTarget = targetCluster ? `cluster:${targetCluster}` : edge.target;

    // Skip internal cluster edges (both source and target in same cluster)
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

  // Create nodes for main layout: unclustered beats + virtual cluster nodes
  const mainLayoutNodes = [
    ...unclusteredBeats.map(b => ({ id: b.id, position: b.position })),
    ...virtualClusterNodes,
  ];

  // Run main layout
  const { positions: mainPositions } = calculateTreeLayout(
    mainLayoutNodes,
    transformedEdges,
    {
      ...opts,
      // Use larger spacing for clusters since they're bigger
      nodeSpacingX: Math.max(opts.nodeSpacingX, 300),
      nodeSpacingY: Math.max(opts.nodeSpacingY, 200),
    }
  );

  // Extract beat and cluster positions from main layout
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

  // Layout beats within each cluster
  const clusterInternalPositions = new Map<string, Map<string, { x: number; y: number }>>();

  clusters.forEach(cluster => {
    const clusterBeats = beatsByCluster.get(cluster.id) || [];
    if (clusterBeats.length === 0) {
      clusterInternalPositions.set(cluster.id, new Map());
      return;
    }

    // Extract internal edges (edges between beats in this cluster)
    const clusterBeatIds = new Set(clusterBeats.map(b => b.id));
    const internalEdges = allEdges.filter(
      e => clusterBeatIds.has(e.source) && clusterBeatIds.has(e.target)
    );

    // Layout internal beats with proper spacing to avoid collisions
    // BEAT_WIDTH=160, PADDING=20, so need spacing > 180 to avoid overlap
    const internalNodes = clusterBeats.map(b => ({ id: b.id }));
    const { positions: internalPos } = calculateTreeLayout(
      internalNodes,
      internalEdges,
      {
        nodeSpacingX: 200,  // 160 (width) + 40 (comfortable gap)
        nodeSpacingY: 120,  // 80 (height) + 40 (comfortable gap)
        startX: 40,  // Padding inside cluster
        startY: 60,  // Account for cluster header
      }
    );

    clusterInternalPositions.set(cluster.id, internalPos);
  });

  return {
    beatPositions,
    clusterPositions,
    clusterInternalPositions,
  };
}
