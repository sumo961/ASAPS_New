/**
 * Tree/DAG Layout Algorithm for Story Flowcharts
 *
 * Positions beats in a hierarchical tree layout based on their connections.
 * Uses a modified Sugiyama algorithm approach:
 * 1. Assign layers (depth) based on topological sort
 * 2. Minimize edge crossings within layers
 * 3. Position nodes to minimize edge lengths
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
  /** Horizontal spacing between nodes in the same layer */
  nodeSpacingX?: number;
  /** Vertical spacing between layers */
  nodeSpacingY?: number;
  /** Starting X position */
  startX?: number;
  /** Starting Y position */
  startY?: number;
  /** Layout direction: 'TB' (top-bottom), 'LR' (left-right) */
  direction?: 'TB' | 'LR';
}

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  layers: Map<string, number>;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeSpacingX: 300,
  nodeSpacingY: 150,
  startX: 100,
  startY: 100,
  direction: 'TB',
};

/**
 * Calculate tree layout positions for a directed graph of story beats
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
      outgoing.get(edge.source)?.push(edge.target);
      incoming.get(edge.target)?.push(edge.source);
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

  // Assign layers using BFS from roots
  const layers = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; layer: number }> = [];

  roots.forEach((rootId) => {
    queue.push({ id: rootId, layer: 0 });
  });

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;

    if (visited.has(id)) {
      // Update layer if this path gives a deeper position
      const currentLayer = layers.get(id) || 0;
      if (layer > currentLayer) {
        layers.set(id, layer);
      }
      continue;
    }

    visited.add(id);
    layers.set(id, layer);

    // Add children to queue
    const children = outgoing.get(id) || [];
    children.forEach((childId) => {
      queue.push({ id: childId, layer: layer + 1 });
    });
  }

  // Handle any unvisited nodes (disconnected components)
  nodeSet.forEach((nodeId) => {
    if (!visited.has(nodeId)) {
      // Find max layer and add below
      let maxLayer = 0;
      layers.forEach((layer) => {
        maxLayer = Math.max(maxLayer, layer);
      });
      layers.set(nodeId, maxLayer + 1);
      visited.add(nodeId);
    }
  });

  // Group nodes by layer
  const layerNodes = new Map<number, string[]>();
  layers.forEach((layer, nodeId) => {
    if (!layerNodes.has(layer)) {
      layerNodes.set(layer, []);
    }
    layerNodes.get(layer)!.push(nodeId);
  });

  // Sort nodes within each layer to minimize edge crossings
  // Use barycenter heuristic: position node at the average position of its parents
  const nodePositionInLayer = new Map<string, number>();

  // First pass: assign initial positions based on order in roots
  roots.forEach((rootId, index) => {
    nodePositionInLayer.set(rootId, index);
  });

  // Process layers top-down
  const sortedLayers = Array.from(layerNodes.keys()).sort((a, b) => a - b);

  sortedLayers.forEach((layerIndex) => {
    if (layerIndex === 0) return; // Roots already positioned

    const nodesInLayer = layerNodes.get(layerIndex) || [];

    // Calculate barycenter for each node based on parent positions
    const barycenters: Array<{ id: string; barycenter: number }> = [];

    nodesInLayer.forEach((nodeId) => {
      const parents = incoming.get(nodeId) || [];
      if (parents.length === 0) {
        barycenters.push({ id: nodeId, barycenter: Infinity }); // Put at end
      } else {
        let sum = 0;
        let count = 0;
        parents.forEach((parentId) => {
          const pos = nodePositionInLayer.get(parentId);
          if (pos !== undefined) {
            sum += pos;
            count++;
          }
        });
        const avg = count > 0 ? sum / count : nodesInLayer.indexOf(nodeId);
        barycenters.push({ id: nodeId, barycenter: avg });
      }
    });

    // Sort by barycenter
    barycenters.sort((a, b) => a.barycenter - b.barycenter);

    // Assign positions in sorted order
    barycenters.forEach(({ id }, index) => {
      nodePositionInLayer.set(id, index);
    });

    // Update layerNodes with sorted order
    layerNodes.set(
      layerIndex,
      barycenters.map((b) => b.id)
    );
  });

  // Calculate actual pixel positions
  const positions = new Map<string, { x: number; y: number }>();

  sortedLayers.forEach((layerIndex) => {
    const nodesInLayer = layerNodes.get(layerIndex) || [];
    const layerWidth = (nodesInLayer.length - 1) * opts.nodeSpacingX;
    const layerStartX = opts.startX - layerWidth / 2 + 400; // Center the layer, offset to right

    nodesInLayer.forEach((nodeId, indexInLayer) => {
      let x: number, y: number;

      if (opts.direction === 'TB') {
        x = layerStartX + indexInLayer * opts.nodeSpacingX;
        y = opts.startY + layerIndex * opts.nodeSpacingY;
      } else {
        x = opts.startX + layerIndex * opts.nodeSpacingX;
        y = opts.startY + indexInLayer * opts.nodeSpacingY;
      }

      positions.set(nodeId, { x, y });
    });
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
 * @returns Map of beat id to new position
 */
export function applyTreeLayoutToBeats(
  beats: Array<{
    id: string;
    type: string;
    position?: { x: number; y: number };
    parameters?: Record<string, any>;
  }>,
  options?: LayoutOptions
): Map<string, { x: number; y: number }> {
  const edges = extractConnectionsFromBeats(beats);
  const nodes = beats.map((b) => ({ id: b.id, position: b.position }));
  const { positions } = calculateTreeLayout(nodes, edges, options);
  return positions;
}
