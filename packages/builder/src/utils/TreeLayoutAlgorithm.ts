/**
 * Tree/DAG Layout Algorithm for Story Flowcharts
 *
 * Positions beats in a hierarchical tree layout based on their connections.
 * Uses a modified Reingold-Tilford algorithm approach:
 * 1. Assign layers (depth) based on topological sort
 * 2. Calculate subtree widths for proper spacing
 * 3. Position nodes centered above their children
 * 4. Handle multiple branches with proper spreading
 */

interface NodeData {
  id: string;
  position?: { x: number; y: number };
}

interface EdgeData {
  source: string;
  target: string;
}

interface LayoutOptions {
  /** Horizontal spacing between sibling nodes */
  nodeSpacingX?: number;
  /** Vertical spacing between layers */
  nodeSpacingY?: number;
  /** Starting X position */
  startX?: number;
  /** Starting Y position */
  startY?: number;
  /** Layout direction: 'TB' (top-bottom), 'LR' (left-right) */
  direction?: 'TB' | 'LR';
  /** Minimum width of a node for spacing calculations */
  nodeWidth?: number;
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  layers: Map<string, number>;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeSpacingX: 200,
  nodeSpacingY: 150,
  startX: 100,
  startY: 50,
  direction: 'TB',
  nodeWidth: 180,
};

/**
 * Calculate tree layout positions for a directed graph of story beats
 * Uses a modified Reingold-Tilford algorithm that positions children under their parent
 * with proper spreading to use vertical and horizontal space effectively.
 *
 * @param nodes - Array of nodes with id and optional position
 * @param edges - Array of edges with source and target ids
 * @param options - Layout configuration options
 * @returns Map of node id to calculated position
 */
export function calculateTreeLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Empty graph
  if (nodes.length === 0) {
    return { positions: new Map(), layers: new Map() };
  }

  // Build adjacency lists
  const outgoing = new Map<string, string[]>(); // node -> children
  const incoming = new Map<string, string[]>(); // node -> parents
  const nodeSet = new Set<string>();

  nodes.forEach((node) => {
    nodeSet.add(node.id);
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      // Avoid duplicates
      const existing = outgoing.get(edge.source) || [];
      if (!existing.includes(edge.target)) {
        existing.push(edge.target);
        outgoing.set(edge.source, existing);
      }
      const incomingList = incoming.get(edge.target) || [];
      if (!incomingList.includes(edge.source)) {
        incomingList.push(edge.source);
        incoming.set(edge.target, incomingList);
      }
    }
  });

  // Find root nodes (nodes with no incoming edges)
  const roots: string[] = [];
  nodeSet.forEach((nodeId) => {
    if ((incoming.get(nodeId)?.length || 0) === 0) {
      roots.push(nodeId);
    }
  });

  // If no roots found (cycles or disconnected), use first node
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0].id);
  }

  // Assign layers using BFS from roots, ensuring proper depth for branching
  const layers = new Map<string, number>();
  const visited = new Set<string>();

  // Use iterative BFS with proper handling of multiple paths
  const assignLayers = () => {
    const queue: Array<{ id: string; layer: number }> = [];

    roots.forEach((rootId) => {
      queue.push({ id: rootId, layer: 0 });
      layers.set(rootId, 0);
    });

    while (queue.length > 0) {
      const { id, layer } = queue.shift()!;

      if (visited.has(id)) {
        continue;
      }
      visited.add(id);

      // Process all children
      const children = outgoing.get(id) || [];
      children.forEach((childId) => {
        const currentChildLayer = layers.get(childId);
        const newLayer = layer + 1;

        // Always use the deepest layer for proper vertical distribution
        if (currentChildLayer === undefined || newLayer > currentChildLayer) {
          layers.set(childId, newLayer);
        }

        if (!visited.has(childId)) {
          queue.push({ id: childId, layer: newLayer });
        }
      });
    }
  };

  assignLayers();

  // Handle any unvisited nodes (disconnected components)
  let maxLayer = 0;
  layers.forEach((layer) => {
    maxLayer = Math.max(maxLayer, layer);
  });

  nodeSet.forEach((nodeId) => {
    if (!layers.has(nodeId)) {
      layers.set(nodeId, maxLayer + 1);
    }
  });

  // For DAGs with multiple parents, pick primary parent (closest to root)
  const primaryParent = new Map<string, string>();
  nodeSet.forEach((nodeId) => {
    const parents = incoming.get(nodeId) || [];
    if (parents.length > 0) {
      let bestParent = parents[0];
      let bestLayer = layers.get(bestParent) ?? Infinity;
      parents.forEach((p) => {
        const pLayer = layers.get(p) ?? Infinity;
        if (pLayer < bestLayer) {
          bestParent = p;
          bestLayer = pLayer;
        }
      });
      primaryParent.set(nodeId, bestParent);
    }
  });

  // Build tree structure based on primary parent relationships
  const treeChildren = new Map<string, string[]>();
  nodeSet.forEach((nodeId) => {
    treeChildren.set(nodeId, []);
  });

  nodeSet.forEach((nodeId) => {
    const parent = primaryParent.get(nodeId);
    if (parent) {
      const children = treeChildren.get(parent) || [];
      if (!children.includes(nodeId)) {
        children.push(nodeId);
        treeChildren.set(parent, children);
      }
    }
  });

  // Sort children by their order in the original edges for consistency
  treeChildren.forEach((children, parentId) => {
    const parentOutgoing = outgoing.get(parentId) || [];
    children.sort((a, b) => {
      const aIndex = parentOutgoing.indexOf(a);
      const bIndex = parentOutgoing.indexOf(b);
      return aIndex - bIndex;
    });
  });

  // Calculate subtree width (number of leaf slots needed)
  const subtreeWidth = new Map<string, number>();
  const widthCalculated = new Set<string>();

  const calculateWidth = (nodeId: string): number => {
    if (widthCalculated.has(nodeId)) {
      return subtreeWidth.get(nodeId) || 1;
    }
    widthCalculated.add(nodeId);

    const children = treeChildren.get(nodeId) || [];
    if (children.length === 0) {
      subtreeWidth.set(nodeId, 1);
      return 1;
    }

    let totalWidth = 0;
    children.forEach((childId) => {
      totalWidth += calculateWidth(childId);
    });

    subtreeWidth.set(nodeId, totalWidth);
    return totalWidth;
  };

  // Calculate widths starting from roots
  roots.forEach((rootId) => {
    calculateWidth(rootId);
  });

  // Handle orphaned nodes
  nodeSet.forEach((nodeId) => {
    if (!subtreeWidth.has(nodeId)) {
      subtreeWidth.set(nodeId, 1);
    }
  });

  // Position nodes using a cleaner approach
  const positions = new Map<string, { x: number; y: number }>();
  const positioned = new Set<string>();

  const positionSubtree = (
    nodeId: string,
    leftBound: number
  ): number => {
    if (positioned.has(nodeId)) {
      return leftBound;
    }
    positioned.add(nodeId);

    const layer = layers.get(nodeId) || 0;
    const children = treeChildren.get(nodeId) || [];
    const width = subtreeWidth.get(nodeId) || 1;

    // Calculate Y position based on layer
    const y = opts.startY + layer * opts.nodeSpacingY;

    if (children.length === 0) {
      // Leaf node: place at leftBound + half node spacing
      const x = leftBound + opts.nodeSpacingX / 2;
      positions.set(nodeId, { x, y });
      return leftBound + opts.nodeSpacingX;
    }

    // Internal node: position children first, then center parent above them
    let currentLeft = leftBound;
    const childPositions: number[] = [];

    children.forEach((childId) => {
      const childWidth = subtreeWidth.get(childId) || 1;
      const childLeft = currentLeft;
      const newRight = positionSubtree(childId, childLeft);

      // Get the child's actual X position for centering
      const childPos = positions.get(childId);
      if (childPos) {
        childPositions.push(childPos.x);
      }

      currentLeft = newRight;
    });

    // Center this node above its children
    let x: number;
    if (childPositions.length > 0) {
      const minChildX = Math.min(...childPositions);
      const maxChildX = Math.max(...childPositions);
      x = (minChildX + maxChildX) / 2;
    } else {
      x = leftBound + (width * opts.nodeSpacingX) / 2;
    }

    positions.set(nodeId, { x, y });
    return currentLeft;
  };

  // Position each root tree
  let currentLeft = opts.startX;
  roots.forEach((rootId) => {
    currentLeft = positionSubtree(rootId, currentLeft);
    currentLeft += opts.nodeSpacingX / 2; // Gap between root trees
  });

  // Position any remaining unpositioned nodes (orphans, nodes in cycles)
  let orphanX = currentLeft + opts.nodeSpacingX;
  nodeSet.forEach((nodeId) => {
    if (!positions.has(nodeId)) {
      const layer = layers.get(nodeId) || 0;
      positions.set(nodeId, {
        x: orphanX,
        y: opts.startY + layer * opts.nodeSpacingY
      });
      orphanX += opts.nodeSpacingX;
    }
  });

  return { positions, layers };
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
  options?: LayoutOptions,
  externalEdges?: Array<{ source: string; target: string }>
): Map<string, { x: number; y: number }> {
  // Extract edges from beat parameters (for multi-target beats like dialogTree, movementChoice)
  const parameterEdges = extractConnectionsFromBeats(beats);

  // Combine parameter edges with external edges (from beat.getConnections())
  const allEdges = [...parameterEdges];
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
  options?: LayoutOptions,
  externalEdges?: Array<{ source: string; target: string }>
): ClusterAwareLayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

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

  const transformedEdges: EdgeData[] = [];
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
  const mainLayoutNodes: NodeData[] = [
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

    // Layout internal beats with smaller spacing
    const internalNodes = clusterBeats.map(b => ({ id: b.id }));
    const { positions: internalPos } = calculateTreeLayout(
      internalNodes,
      internalEdges,
      {
        nodeSpacingX: 180,
        nodeSpacingY: 100,
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
