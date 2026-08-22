/**
 * graphBuild — pure node/edge construction for the story graph.
 *
 * Extracted verbatim from GraphEditor's useMemo bodies so that ONE code path
 * builds every node and edge (top-level and, from Phase 2 of the cluster
 * unification, clustered beats too) and so the conversion rules are unit-
 * testable. GraphEditor's memos are thin wrappers around these functions.
 *
 * Both functions are pure: identical inputs give identical outputs, nothing
 * is mutated, no refs are read. Live-updating values the cluster frame needs
 * AFTER build time (asset list for the map/sound popovers, highlight set for
 * the memo-buster) come in as getter callbacks.
 */
import { Node, Edge, MarkerType, Position } from 'reactflow';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { summarizeConditions } from '../../utils/conditionSummary';
import { dialogTreeLayout } from '../../utils/dialogTreeLayout';
import { beatTypeColors } from './graphStyle';

interface Asset {
  id: string;
  url: string;
  type: string;
}

export interface GraphNodeCallbacks {
  toggleDialogExpand: (beatId: string) => void;
  onBeatSelect: (beat: Beat) => void;
  onClusterExpandCollapse: (clusterId: string) => void;
  onBeatInContainerMove: (beatId: string, clusterId: string, x: number, y: number) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onRemoveBeatFromCluster?: (beatId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  onAddToContainer?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: any) => void;
  /** Live getter — the cluster popovers read assets at open time. */
  getAssets: () => Asset[];
  /** Live getter — cluster highlight state reads the current set. */
  getHighlightedBeatIds: () => Set<string> | null;
}

export interface GraphNodesInput {
  beats: Beat[];
  clusters: Cluster[];
  containerBeatPositions: ContainerBeatPosition[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  expandedDialogs: Set<string>;
  /** Snapshots read at build time (GraphEditor passes ref.current). */
  highlighted: Set<string> | null;
  pwVisited: Set<string> | null;
  pwCurrentBeatId: string | null | undefined;
  brokenTargets: Record<string, string> | undefined;
  callbacks: GraphNodeCallbacks;
}

export interface GraphEdgesInput {
  beats: Beat[];
  expandedDialogs: Set<string>;
}

export function buildGraphNodes(input: GraphNodesInput): Node[] {
  const {
    beats,
    clusters,
    containerBeatPositions,
    selectedBeat,
    selectedCluster,
    expandedDialogs,
  } = input;
  const {
    toggleDialogExpand,
    onBeatSelect,
    onClusterExpandCollapse,
    onBeatInContainerMove,
    onDropBeatToCluster,
    onRemoveBeatFromCluster,
    onClusterResize,
    onAutoLayoutCluster,
    onAddToContainer,
    onRemoveCluster,
    onSetClusterMap,
    onSetClusterSound,
    onSetClusterSharedVisuals,
    getAssets,
    getHighlightedBeatIds,
  } = input.callbacks;
  // Ref-shaped shims: the body below was moved verbatim from GraphEditor's
  // useMemo, where these were refs read at memo-execution time. Snapshot
  // semantics are identical.
  const highlightedBeatIdsRef = { current: input.highlighted };
  const pwVisitedBeatIdsRef = { current: input.pwVisited };
  const pwCurrentBeatIdRef = { current: input.pwCurrentBeatId };
  const brokenTargetsRef = { current: input.brokenTargets };
  const assetsRef = { current: getAssets() };

    // Build a set of known cluster IDs for fast lookup
    const knownClusterIds = new Set(clusters.map(c => c.id));

    // Only show beats that are NOT in a known cluster as separate nodes
    // Beats inside clusters are rendered within the cluster container
    // DEFENSIVE: If a beat references a cluster that doesn't exist, render it standalone
    // This prevents empty graphs when cluster data fails to load
    const unclusteredBeats = beats.filter(beat =>
      !beat.cluster || beat.cluster === 'undefined' || !knownClusterIds.has(beat.cluster)
    );

    // Debug: log cluster status
    if (beats.length > 0) {
      const clusteredCount = beats.filter(b => b.cluster && b.cluster !== 'undefined').length;
      const orphanedCount = beats.filter(b => b.cluster && b.cluster !== 'undefined' && !knownClusterIds.has(b.cluster)).length;
      if (orphanedCount > 0) {
        console.warn('[GraphEditor] Orphaned beats (cluster ref but no cluster object):', orphanedCount, 'of', clusteredCount, 'clustered beats. Clusters loaded:', clusters.length);
      }
    }

    // B1b: names for the expanded dialog's exit chips (built once per memo run)
    const beatNamesById: Record<string, string> = {};
    for (const b of beats) beatNamesById[b.id] = b.name;

    const beatNodes = unclusteredBeats.flatMap((beat): Node[] => {
      // B1b v2 — expanded dialogTree renders CLUSTER-STYLE: a container node
      // (same id, so inbound edges and position carry over) plus the dialog's
      // exchanges/choices as real, read-only child nodes. Their edges are
      // built in the edges memo from the same layout.
      if (beat.type === 'dialogTree' && expandedDialogs.has(beat.id)) {
        const tree = (beat as any).getParameters?.()?.dialogTree ?? (beat as any).dialogTree;
        if (tree) {
          const layout = dialogTreeLayout(tree);
          const container: Node = {
            id: beat.id,
            type: 'dialogContainer',
            position: { x: beat.x || 0, y: beat.y || 0 },
            // Expanded dialogs float above neighboring beats (focus overlay) —
            // growing in place would otherwise interleave with whatever the
            // author had placed to the right.
            zIndex: 20,
            style: { width: layout.width, height: layout.height },
            data: {
              beatId: beat.id,
              label: beat.name,
              selected: selectedBeat?.id === beat.id,
              highlighted: highlightedBeatIdsRef.current?.has(beat.id) ?? false,
              onToggleDialogExpand: toggleDialogExpand,
              truncated: layout.truncated,
              // Fingerprint field — expansion must reach the node sync
              dialogExpanded: true,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          };
          const children: Node[] = layout.nodes.map((row) => ({
            id: `dlg:${beat.id}:${row.pathId}`,
            type: 'dialogInternal',
            position: { x: row.x, y: row.y },
            zIndex: 22,
            parentNode: beat.id,
            extent: 'parent' as const,
            draggable: false,
            selectable: false,
            connectable: false,
            data: {
              kind: row.kind,
              speaker: row.speaker,
              text: row.text,
              isRoot: row.pathId === 'root',
              // The guard renders ON the card — between 175px columns an
              // edge-midpoint pill inevitably collides with the next node.
              // The edge keeps the dashed-violet stroke as the signal.
              guardSummary: row.conditions
                ? summarizeConditions(row.conditions, (bid: string) => beats.find(b => b.id === bid)?.name)
                : undefined,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          }));
          return [container, ...children];
        }
      }
      return [{
        id: beat.id,
        type: 'beat',
        position: { x: beat.x || 0, y: beat.y || 0 },
        data: {
          beat,
          label: beat.name,
          type: beat.type,
          selected: selectedBeat?.id === beat.id,
          color: beatTypeColors[beat.type] || '#94a3b8',
          highlighted: highlightedBeatIdsRef.current?.has(beat.id) ?? false,
          pwVisited: pwVisitedBeatIdsRef.current?.has(beat.id) ?? false,
          pwCurrent: pwCurrentBeatIdRef.current === beat.id,
          brokenTarget: brokenTargetsRef.current?.[beat.id],
          // B1b — dialogTree disclosure trigger on the collapsed node
          ...(beat.type === 'dialogTree' ? {
            dialogTree: (beat as any).getParameters?.()?.dialogTree ?? (beat as any).dialogTree,
            dialogExpanded: false,
            onToggleDialogExpand: toggleDialogExpand,
            beatNames: beatNamesById,
          } : {}),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }];
    });

    // Convert clusters to ReactFlow nodes with typed data
    const clusterNodes = clusters.map((cluster): Node => {
      // Calculate actual beat count for this cluster
      const beatsInThisCluster = beats.filter(beat => beat.cluster === cluster.id);
      const containedBeatCount = beatsInThisCluster.length;

      // Get actual positions from containerBeatPositions, or generate default positions
      // Include actual beat objects for rendering connections inside the cluster
      const containerBeats = beatsInThisCluster.map((beat, index) => {
        // Look for existing position
        const existingPosition = containerBeatPositions.find(
          pos => pos.beatId === beat.id && pos.clusterId === cluster.id
        );

        if (existingPosition) {
          return {
            ...existingPosition,
            beat, // Include the actual beat object
            mapStyle: existingPosition.mapStyle || {
              icon: '📍',
              color: '#3b82f6',
              size: 'medium' as const,
              label: beat.name.substring(0, 10)
            }
          };
        }

        // Default position - 2-column grid with proper spacing to avoid overlap
        // NODE_WIDTH is 160, NODE_HEIGHT is 80, so use 180x100 spacing
        return {
          beatId: beat.id,
          clusterId: cluster.id,
          beat, // Include the actual beat object
          position: {
            x: 20 + (index % 2) * 200,
            y: 20 + Math.floor(index / 2) * 110,
            z: index
          },
          mapStyle: {
            icon: '📍',
            color: '#3b82f6',
            size: 'medium' as const,
            label: beat.name.substring(0, 10)
          }
        };
      });

      return {
        id: cluster.id,
        type: 'cluster',
        position: { x: cluster.containerPosition.x, y: cluster.containerPosition.y },
        data: {
          cluster,
          selected: selectedCluster?.id === cluster.id,
          expanded: cluster.isExpanded,
          containedBeatCount: containedBeatCount,
          containedBeats: containerBeats,
          color: cluster.color || '#6366f1',
          onAddToContainer: onAddToContainer || (() => {}),
          onRemoveContainer: onRemoveCluster || (() => {}),
          onExpandCollapse: onClusterExpandCollapse || (() => {}),
          onBeatInContainerMove: onBeatInContainerMove,
          onDropBeatToCluster: onDropBeatToCluster,
          onRemoveBeatFromCluster: onRemoveBeatFromCluster,
          onClusterResize: onClusterResize,
          onAutoLayoutCluster: onAutoLayoutCluster,
          onBeatSelect: onBeatSelect,
          selectedBeatId: selectedBeat?.id || null, // Pass selected beat ID for highlighting
          allBeats: beats, // Pass all beats for external connection calculation
          // Map background - use ref to get current assets without triggering re-render
          mapAssetUrl: cluster.mapAssetId ? assetsRef.current.find(a => a.id === cluster.mapAssetId)?.url : undefined,
          onSetClusterMap: onSetClusterMap,
          // Cluster ambient sound
          onSetClusterSound: onSetClusterSound,
          // Cluster shared visuals
          onSetClusterSharedVisuals: onSetClusterSharedVisuals,
          // Pass a getter function for assets to avoid embedding the whole array in node data
          getAssets,
          // Pass getter for highlighted beat IDs to avoid embedding in node data and prevent re-renders
          // Use getter function to access the ref so cluster nodes get the current value without being dependencies
          getHighlightedBeatIds,
        },
        style: {
          width: cluster.containerBounds.width,
          height: cluster.isExpanded ? cluster.containerBounds.height : 40,
        },
      };
    });

    // B1b v2 — make room: an expanded dialog pushes its neighbors aside
    // (right of it → right; below it → down) instead of overlapping them.
    // Visual-only: stored beat positions are untouched, so collapsing
    // restores the original layout exactly.
    const grownContainers = beatNodes.filter(n => n.type === 'dialogContainer');
    const allNodes = [...beatNodes, ...clusterNodes];
    if (grownContainers.length) {
      const shift = new Map<string, { dx: number; dy: number }>();
      const APPROX_H = 90;
      for (const g of [...grownContainers].sort((a, b) => a.position.x - b.position.x)) {
        const W = Number((g.style as any)?.width ?? 0);
        const H = Number((g.style as any)?.height ?? 0);
        const dx = Math.max(0, W - 160);
        const dy = Math.max(0, H - APPROX_H);
        const gx = g.position.x;
        const gy = g.position.y;
        for (const n of allNodes) {
          if (n.id === g.id || (n as any).parentNode) continue;
          const s = shift.get(n.id) ?? { dx: 0, dy: 0 };
          const nx = n.position.x + s.dx;
          const ny = n.position.y + s.dy;
          const vOverlap = ny + APPROX_H > gy && ny < gy + H;
          const hOverlap = nx + 160 > gx && nx < gx + W;
          if (nx > gx && vOverlap) s.dx += dx;
          else if (ny > gy && hOverlap) s.dy += dy;
          if (s.dx || s.dy) shift.set(n.id, s);
        }
      }
      for (const n of allNodes) {
        const s = shift.get(n.id);
        if (s) n.position = { x: n.position.x + s.dx, y: n.position.y + s.dy };
      }
    }
    return allNodes;
}

export function buildGraphEdges(input: GraphEdgesInput): Edge[] {
  const { beats, expandedDialogs } = input;

    const allEdges: Edge[] = [];
    const edgeIds = new Set<string>(); // Track edge IDs to prevent duplicates

    // Helper to get the cluster ID a beat belongs to (or null if unclustered)
    const getBeatCluster = (beatId: string): string | null => {
      const beat = beats.find(b => b.id === beatId);
      return beat?.cluster || null;
    };

    // Helper to resolve the actual node ID for an edge endpoint
    // If beat is in a cluster, return the cluster ID; otherwise return the beat ID
    const resolveNodeId = (beatId: string): string => {
      const clusterId = getBeatCluster(beatId);
      return clusterId || beatId;
    };

    // Helper to create an edge with proper source/target resolution
    // Returns null if the edge would be internal to a cluster (both endpoints in same cluster)
    const createEdge = (
      sourceId: string,
      targetId: string,
      edgeProps: Partial<Edge>
    ): Edge | null => {
      const sourceCluster = getBeatCluster(sourceId);
      const targetCluster = getBeatCluster(targetId);

      // Skip edges that are internal to the same cluster
      if (sourceCluster && targetCluster && sourceCluster === targetCluster) {
        return null;
      }

      // Resolve to cluster nodes if needed
      const resolvedSource = resolveNodeId(sourceId);
      const resolvedTarget = resolveNodeId(targetId);

      // Skip self-loops (can happen if both endpoints resolve to same cluster)
      if (resolvedSource === resolvedTarget) {
        return null;
      }

      return {
        id: `${resolvedSource}-to-${resolvedTarget}-${edgeProps.id || ''}`,
        source: resolvedSource,
        target: resolvedTarget,
        ...edgeProps,
      } as Edge;
    };

    beats.forEach((beat) => {
      // Get beat parameters for special handling
      const params = typeof beat.getParameters === 'function' ? beat.getParameters() : {};

      // B1b — when a dialogTree is expanded (and rendered as its own node,
      // i.e. not resolved into a cluster container), its outgoing edges are
      // emitted ONLY from the per-exit handles below; both legacy dialog
      // edge emitters are suppressed to avoid doubled edges.
      const dialogExpandedHere =
        beat.type === 'dialogTree' && expandedDialogs.has(beat.id) && !getBeatCluster(beat.id);
      
      // Special handling for setTimer beats - show timer target in red
      if (beat.type === 'setTimer' && params.timerTarget) {
        const timerEdgeId = `${beat.id}-timer-${params.timerTarget}`;
        if (!edgeIds.has(timerEdgeId)) {
          edgeIds.add(timerEdgeId);
          allEdges.push({
            id: timerEdgeId,
            source: beat.id,
            target: params.timerTarget,
            type: 'custom',
            animated: false,
            label: 'Timer Target',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
            style: {
              stroke: '#ef4444', // Red color for timer connections
              strokeWidth: 2,
              strokeDasharray: '5 5', // Dashed line
            },
            data: {
              isTimer: true,
            },
          });
        }
      }
      
      // Special handling for randomTarget beats - show all choices
      if (beat.type === 'randomTarget' && params.choices) {
        params.choices.forEach((choice: any, index: number) => {
          if (choice.target) {
            const choiceEdgeId = `${beat.id}-choice-${choice.target}`;
            if (!edgeIds.has(choiceEdgeId)) {
              edgeIds.add(choiceEdgeId);
              allEdges.push({
                id: choiceEdgeId,
                source: beat.id,
                target: choice.target,
                type: 'custom',
                animated: false,
                label: `Random ${index + 1}`,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  stroke: '#a855f7', // Purple for random choices
                  strokeWidth: 2,
                },
                data: {
                  isRandom: true,
                },
              });
            }
          }
        });
      }

      // Special handling for movementChoice beats - show all location choices
      if (beat.type === 'movementChoice' && params.choices) {
        params.choices.forEach((choice: any, index: number) => {
          if (choice.target) {
            // Include index to ensure unique IDs even when multiple choices target the same beat
            const choiceEdgeId = `${beat.id}-movement-${index}-${choice.target}`;
            if (!edgeIds.has(choiceEdgeId)) {
              edgeIds.add(choiceEdgeId);
              allEdges.push({
                id: choiceEdgeId,
                source: beat.id,
                target: choice.target,
                type: 'custom',
                animated: false,
                label: choice.text || choice.location || `Location ${index + 1}`,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  stroke: '#f59e0b', // Orange for movement choices (matches movementChoice badge)
                  strokeWidth: 2,
                  strokeDasharray: '5 5', // Dashed line for visual distinction
                },
                data: {
                  isMovement: true,
                },
              });
            }
          }
        });
      }

      // Special handling for dialogTree beats - show all dialog choices
      // Helper to extract target from various formats
      const extractTarget = (choice: any): string | null => {
        if (!choice) return null;
        // Direct string target
        if (typeof choice.target === 'string') return choice.target;
        // Nested object with .next property (Claude Desktop format)
        if (choice.target && typeof choice.target === 'object' && choice.target.next) {
          return choice.target.next;
        }
        // Nested object with .target property
        if (choice.target && typeof choice.target === 'object' && choice.target.target) {
          return choice.target.target;
        }
        return null;
      };

      if (beat.type === 'dialogTree' && params.dialogTree && !dialogExpandedHere) {
        const addDialogChoiceEdge = (choice: any, index: number, prefix: string) => {
          const target = extractTarget(choice);
          if (target) {
            const choiceEdgeId = `${beat.id}-dialog-${prefix}-${index}-${target}`;
            if (!edgeIds.has(choiceEdgeId)) {
              edgeIds.add(choiceEdgeId);
              allEdges.push({
                id: choiceEdgeId,
                source: beat.id,
                target: target,
                type: 'custom',
                animated: false,
                label: choice.text || `Choice ${index + 1}`,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  stroke: '#3b82f6', // Blue for dialog choices
                  strokeWidth: 2,
                },
                data: {
                  isDialog: true,
                },
              });
            }
          }
        };

        // Handle direct choices array
        if (params.dialogTree.choices) {
          params.dialogTree.choices.forEach((choice: any, index: number) => {
            addDialogChoiceEdge(choice, index, 'choice');
          });
        }

        // Handle entries array with nested choices
        if (params.dialogTree.entries) {
          params.dialogTree.entries.forEach((entry: any, entryIndex: number) => {
            if (entry.choices) {
              entry.choices.forEach((choice: any, choiceIndex: number) => {
                addDialogChoiceEdge(choice, choiceIndex, `entry${entryIndex}`);
              });
            }
          });
        }
      }

      // Special handling for pickProp beats - show all prop choices
      if (beat.type === 'pickProp' && params.props) {
        params.props.forEach((prop: any, index: number) => {
          if (prop.target) {
            const propEdgeId = `${beat.id}-prop-${index}-${prop.target}`;
            if (!edgeIds.has(propEdgeId)) {
              edgeIds.add(propEdgeId);
              allEdges.push({
                id: propEdgeId,
                source: beat.id,
                target: prop.target,
                type: 'custom',
                animated: false,
                label: prop.name || `Prop ${index + 1}`,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  stroke: '#10b981', // Green for prop choices
                  strokeWidth: 2,
                },
                data: {
                  isProp: true,
                },
              });
            }
          }
        });
      }

      // Special handling for conditionBeat - show true/false branches
      if (beat.type === 'conditionBeat') {
        if (params.trueTarget) {
          const trueEdgeId = `${beat.id}-true-${params.trueTarget}`;
          if (!edgeIds.has(trueEdgeId)) {
            edgeIds.add(trueEdgeId);
            allEdges.push({
              id: trueEdgeId,
              source: beat.id,
              target: params.trueTarget,
              type: 'custom',
              animated: false,
              label: 'True',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
              style: {
                stroke: '#22c55e', // Green for true branch
                strokeWidth: 2,
              },
              data: {
                isCondition: true,
                branch: 'true',
              },
            });
          }
        }
        if (params.falseTarget) {
          const falseEdgeId = `${beat.id}-false-${params.falseTarget}`;
          if (!edgeIds.has(falseEdgeId)) {
            edgeIds.add(falseEdgeId);
            allEdges.push({
              id: falseEdgeId,
              source: beat.id,
              target: params.falseTarget,
              type: 'custom',
              animated: false,
              label: 'False',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
              style: {
                stroke: '#ef4444', // Red for false branch
                strokeWidth: 2,
              },
              data: {
                isCondition: true,
                branch: 'false',
              },
            });
          }
        }
      }

      // Special handling for hyperText beats - show all hyperlink targets
      if (beat.type === 'hyperText' && params.hyperlinks) {
        params.hyperlinks.forEach((link: any, index: number) => {
          if (link.targetBeatId) {
            const linkEdgeId = `${beat.id}-hyperlink-${index}-${link.targetBeatId}`;
            if (!edgeIds.has(linkEdgeId)) {
              edgeIds.add(linkEdgeId);
              allEdges.push({
                id: linkEdgeId,
                source: beat.id,
                target: link.targetBeatId,
                type: 'custom',
                animated: false,
                label: link.word || `Link ${index + 1}`,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  stroke: '#06b6d4', // Cyan for hypertext links
                  strokeWidth: 2,
                },
                data: {
                  isHyperlink: true,
                },
              });
            }
          }
        });
      }

      // Regular connections
      let connections: any[] = [];

      // Check if beat has getConnections method
      if (typeof beat.getConnections === 'function') {
        connections = beat.getConnections();
      } else if (beat.connections) {
        // Fallback to direct property access
        connections = beat.connections;
      }

      // Debug: Log connections for troubleshooting
      if (connections.length > 0 || beat.defaultTarget) {
        console.log(`[GraphEditor] Beat ${beat.id} (${beat.type}): connections=${connections.length}, defaultTarget=${beat.defaultTarget}`);
      }

      // B1b — expanded dialogTree: outgoing edges leave from the per-exit
      // handles inside the node (sourceHandle = outline pathId), so each
      // edge visibly originates from the choice that produces it. Only for
      // unclustered beats — a beat resolved into a cluster container has no
      // such handles. Guarded exits keep the ◇ treatment on the edge.
      if (dialogExpandedHere) {
        const tree = params.dialogTree ?? (beat as any).dialogTree;
        const layout = dialogTreeLayout(tree);
        const childId = (pathId: string) => `dlg:${beat.id}:${pathId}`;

        // Structural edges INSIDE the container — real edges between real
        // nodes, so guards read exactly like top-level guarded edges.
        layout.internalEdges.forEach((ie) => {
          const guardSummary = ie.conditions
            ? summarizeConditions(ie.conditions, (bid: string) => beats.find(b => b.id === bid)?.name)
            : null;
          const isLoop = ie.targetPath === 'root' && ie.sourcePath !== 'root';
          const edgeId = `dlgedge-${beat.id}-${ie.sourcePath}-${ie.targetPath}`;
          if (!edgeIds.has(edgeId)) {
            edgeIds.add(edgeId);
            allEdges.push({
              id: edgeId,
              source: childId(ie.sourcePath),
              target: childId(ie.targetPath!),
              type: 'custom',
              zIndex: 21,
              markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
              style: {
                stroke: guardSummary ? '#8b5cf6' : isLoop ? '#cbd5e1' : '#94a3b8',
                strokeWidth: guardSummary ? 1.75 : 1.25,
                ...(guardSummary || isLoop ? { strokeDasharray: '5 3' } : {}),
              },
              // No label pill inside the container — the ◇ text lives on the
              // guarded card where there is room (see DialogInternalNode).
            } as Edge);
          }
        });

        // Exits — from the child node that produces them to the target beat.
        layout.exitEdges.forEach((ee) => {
          const edge = createEdge(childId(ee.sourcePath), ee.exitTarget!, {
            id: `dlgexit-${beat.id}-${ee.sourcePath}`,
            type: 'custom',
            zIndex: 20,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { stroke: '#0ea5e9', strokeWidth: 1.5 },
          });
          if (edge && !edgeIds.has(edge.id)) {
            edgeIds.add(edge.id);
            allEdges.push(edge);
          }
        });
      }

      // Add connections with unique IDs, resolving cluster boundaries
      if (!dialogExpandedHere) connections.forEach((connection) => {
        // Guarded choice (B1a): choice.conditions travels on the connection
        // (MultiChoice/MovementChoice/PickProp getConnections). The guard is
        // rendered ON the edge it gates — dashed violet + ◇ + summary —
        // "logic visible where it acts".
        const guardConds = Array.isArray(connection.condition) && connection.condition.length > 0
          ? connection.condition
          : null;
        const guardSummary = guardConds
          ? summarizeConditions(guardConds, (id: string) => beats.find(b => b.id === id)?.name)
          : null;
        const edge = createEdge(beat.id, connection.targetId, {
          id: `conn-${beat.id}-${connection.targetId}`,
          type: 'custom',
          animated: connection.condition !== undefined && !guardConds,
          label: connection.label || (connection.condition && !guardConds ? '?' : ''),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
          style: {
            stroke: guardConds ? '#8b5cf6' : connection.condition ? '#fbbf24' : '#64748b',
            strokeWidth: 2,
            ...(guardConds ? { strokeDasharray: '6 3' } : {}),
          },
          data: {
            condition: guardConds ? undefined : connection.condition,
            guardSummary,
          },
        });

        if (edge && !edgeIds.has(edge.id)) {
          edgeIds.add(edge.id);
          allEdges.push(edge);
        }
      });

      // Add default target
      if (beat.defaultTarget) {
        const edge = createEdge(beat.id, beat.defaultTarget, {
          id: `default-${beat.id}`,
          type: 'custom',
          animated: true,
          label: 'default',
          style: {
            stroke: '#22c55e',
            strokeWidth: 2,
            strokeDasharray: '5 5',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#22c55e',
          },
        });

        if (edge && !edgeIds.has(edge.id)) {
          edgeIds.add(edge.id);
          allEdges.push(edge);
        }
      }

      // Add state-requirement fallback redirects. These are visual only — the
      // engine resolves the redirect itself inside Beat.execute(); we draw them
      // so authors can see where the beat escapes to when a gate fails.
      const requires: any[] | undefined = (beat as any).requires;
      if (Array.isArray(requires)) {
        requires.forEach((req, i) => {
          if (!req?.fallbackTarget) return;
          const label = req.explanation
            ? `requires: ${String(req.explanation).slice(0, 32)}${req.explanation.length > 32 ? '…' : ''}`
            : 'requires';
          const edge = createEdge(beat.id, req.fallbackTarget, {
            id: `requires-${beat.id}-${i}`,
            type: 'custom',
            animated: false,
            label,
            style: {
              stroke: '#d97706',
              strokeWidth: 2,
              strokeDasharray: '3 3',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#d97706',
            },
          });
          if (edge && !edgeIds.has(edge.id)) {
            edgeIds.add(edge.id);
            allEdges.push(edge);
          }
        });
      }

      // qrScan QR-jump targets — printed asaps://beat/<id> codes declared in
      // the QR generator. These aren't a runtime connection (the scanned code
      // carries the jump and overrides the Target Beat), so they'd otherwise be
      // invisible to the flowchart. Draw them as distinct dashed purple edges
      // labelled "QR" so authors can see where a scanned code can send players.
      if (beat.type === 'qrScan') {
        const qrParams = typeof beat.getParameters === 'function' ? beat.getParameters() : ((beat as any).parameters || {});
        const jumpTargets: any[] = Array.isArray(qrParams?.qrJumpTargets) ? qrParams.qrJumpTargets : [];
        jumpTargets.forEach((target) => {
          if (typeof target !== 'string' || !target) return;
          const edge = createEdge(beat.id, target, {
            id: `qrjump-${beat.id}-${target}`,
            type: 'custom',
            animated: false,
            label: 'QR',
            style: {
              stroke: '#a855f7',
              strokeWidth: 2,
              strokeDasharray: '4 4',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#a855f7',
            },
          });
          if (edge && !edgeIds.has(edge.id)) {
            edgeIds.add(edge.id);
            allEdges.push(edge);
          }
        });
      }
    });

    return allEdges;
}
