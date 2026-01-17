/**
 * Tree/DAG Layout Algorithm for Story Flowcharts
 *
 * Positions nodes in a hierarchical tree layout based on their connections.
 * Uses a modified Reingold-Tilford algorithm approach:
 * 1. Assign layers (depth) based on topological sort
 * 2. Calculate subtree widths for proper spacing
 * 3. Position nodes centered above their children
 * 4. Handle multiple branches with proper spreading
 */

export interface LayoutNode {
  id: string;
  position?: { x: number; y: number };
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutOptions {
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

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  layers: Map<string, number>;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeSpacingX: 200,
  nodeSpacingY: 120,
  startX: 100,
  startY: 50,
  direction: 'TB',
  nodeWidth: 160,
};

/**
 * Calculate tree layout positions for a directed graph
 * Uses a modified Reingold-Tilford algorithm that positions children under their parent
 * with proper spreading to use vertical and horizontal space effectively.
 *
 * @param nodes - Array of nodes with id and optional position
 * @param edges - Array of edges with source and target ids
 * @param options - Layout configuration options
 * @returns Map of node id to calculated position
 */
export function calculateTreeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
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
  const firstNodeId = nodes.length > 0 ? nodes[0].id : null;

  nodeSet.forEach((nodeId) => {
    if ((incoming.get(nodeId)?.length || 0) === 0) {
      roots.push(nodeId);
    }
  });

  // If no roots found (cycles or disconnected), use first node
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0].id);
  }

  // Ensure the first node (start beat) is always first in roots array
  // This guarantees it gets positioned at the top-left
  if (firstNodeId && roots.includes(firstNodeId)) {
    const idx = roots.indexOf(firstNodeId);
    if (idx > 0) {
      roots.splice(idx, 1);
      roots.unshift(firstNodeId);
    }
  } else if (firstNodeId && !roots.includes(firstNodeId)) {
    // If first node has incoming edges but should still be treated as start,
    // add it as first root (this handles edge cases where start beat has back-edges)
    roots.unshift(firstNodeId);
  }

  // Assign layers using BFS from roots, ensuring proper depth for branching
  const layers = new Map<string, number>();
  const visited = new Set<string>();

  // Assign layers using a two-pass approach for DAGs:
  // Pass 1: BFS to find minimum possible layer for each node
  // Pass 2: Adjust convergence nodes to be closer to their parents
  const assignLayers = () => {
    const queue: Array<{ id: string; layer: number }> = [];
    const nodeDepths = new Map<string, number[]>(); // Track all depths a node is reachable at

    roots.forEach((rootId) => {
      queue.push({ id: rootId, layer: 0 });
      layers.set(rootId, 0);
      nodeDepths.set(rootId, [0]);
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
        // CRITICAL: Skip already-visited nodes to prevent back-edges from
        // corrupting layer assignments. This handles cases like restart loops
        // (e.g., AI Summary -> Title Screen) where we don't want to push
        // the start beat to a deeper layer.
        if (visited.has(childId)) {
          return;
        }

        const newLayer = layer + 1;

        // Track all layers this node is reachable at
        const depths = nodeDepths.get(childId) || [];
        depths.push(newLayer);
        nodeDepths.set(childId, depths);

        // For convergence nodes (multiple parents), use minimum layer + 1
        // This creates more compact layouts for DAGs
        const parentCount = (incoming.get(childId) || []).length;
        if (parentCount > 1) {
          // Use minimum depth for convergence nodes (more compact)
          const minDepth = Math.min(...depths);
          layers.set(childId, minDepth);
        } else {
          // Regular node: just use the new layer
          const currentChildLayer = layers.get(childId);
          if (currentChildLayer === undefined || newLayer > currentChildLayer) {
            layers.set(childId, newLayer);
          }
        }

        queue.push({ id: childId, layer: newLayer });
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

  // Post-process: Shift all positions so the first root is at startX
  // This ensures the first beat is at the expected starting position
  if (roots.length > 0 && firstNodeId) {
    const firstNodePos = positions.get(firstNodeId);
    if (firstNodePos && firstNodePos.x !== opts.startX) {
      const shiftX = opts.startX - firstNodePos.x;
      positions.forEach((pos, nodeId) => {
        positions.set(nodeId, { x: pos.x + shiftX, y: pos.y });
      });
    }
  }

  return { positions, layers };
}
