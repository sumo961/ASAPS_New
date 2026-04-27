import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  ControlButton,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow, // Move here for children-level usage
  MarkerType,
  Position,
  NodeTypes,
  EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { BeatNode } from './BeatNode';
import { CustomEdge } from './CustomEdge';
import { ClusterContainerNode } from './ClusterContainerNode';
import { ContainerConnectionEdge } from './ContainerConnectionEdge';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';

// Asset type for looking up URLs
interface Asset {
  id: string;
  url: string;
  type: string;
}

interface GraphEditorProps {
  beats: Beat[];
  clusters: Cluster[];
  containerBeatPositions?: ContainerBeatPosition[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, x: number, y: number) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onBeatAdd: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse: (clusterId: string) => void;
  onClusterMove: (clusterId: string, x: number, y: number) => void;
  onBeatInContainerMove: (beatId: string, clusterId: string, x: number, y: number) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  highlightedBeatIds?: string[];
  /** Beats visited during the active Preview Window session — rendered as a red trace. */
  pwVisitedBeatIds?: string[];
  /** Currently-active beat in the Preview Window — highlighted more prominently than past-visited beats. */
  pwCurrentBeatId?: string | null;
  onAutoLayout?: () => void;
  onAddToContainer?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
  // Asset lookup for cluster backgrounds and sounds
  assets?: Asset[];
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: any) => void;
  // Beat actions for context menu
  onBeatDuplicate?: (beatId: string) => void;
  onBeatDelete?: (beatId: string) => void;
  onBeatCopy?: (beatId: string) => void;
  onBeatPaste?: (position: { x: number; y: number }) => void;
  hasBeatClipboard?: boolean;
  // VCS context menu actions
  onViewBeatDiff?: (beatId: string) => void;
  onViewBeatHistory?: (beatId: string) => void;
  onRevertBeat?: (beatId: string) => void;
}

const nodeTypes: NodeTypes = {
  beat: BeatNode,
  cluster: ClusterContainerNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
  containerConnection: ContainerConnectionEdge,
};

// Beat type colors
const beatTypeColors: Record<string, string> = {
  titleScreen: '#3b82f6',
  infoText: '#10b981',
  dialogTree: '#8b5cf6',
  conversationChoice: '#a855f7',
  movementChoice: '#f59e0b',
  pickProp: '#ef4444',
  videoBeat: '#ec4899',
  endScreen: '#6366f1',
  setVariable: '#64748b',
  conditionBeat: '#06b6d4',
};

export const GraphEditor: React.FC<GraphEditorProps> = ({
  beats,
  clusters,
  containerBeatPositions = [],
  selectedBeat,
  selectedCluster,
  onBeatSelect,
  onBeatMove,
  onClusterSelect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  onBeatInContainerMove,
  onDropBeatToCluster,
  onClusterResize,
  onAutoLayoutCluster,
  highlightedBeatIds = [],
  pwVisitedBeatIds = [],
  pwCurrentBeatId,
  onAutoLayout,
  onAddToContainer,
  onRemoveCluster,
  assets = [],
  onSetClusterMap,
  onSetClusterSound,
  onSetClusterSharedVisuals,
  onBeatDuplicate,
  onBeatDelete,
  onBeatCopy,
  onBeatPaste,
  hasBeatClipboard = false,
  onViewBeatDiff,
  onViewBeatHistory,
  onRevertBeat,
}) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const vcs = useVCSStatus();
  const vcsActive = vcs && vcs.initialized && vcs.type !== 'none';

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    beatId: string | null;
    flowPosition: { x: number; y: number } | null;
  } | null>(null);

  // Use ref for assets to avoid triggering unnecessary useMemo recalculations
  // The cluster nodes will access assets via ref for the popover, which updates on render
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // Memoize highlightedBeatIds as a Set to avoid creating new Sets on every render
  // This is critical for performance - prevents O(n) lookups and unnecessary object creation
  const highlightedBeatIdsSet = useMemo(() => {
    return highlightedBeatIds.length > 0 ? new Set(highlightedBeatIds) : null;
  }, [highlightedBeatIds]);

  // Use ref for highlightedBeatIds to avoid triggering full node recalculation
  // Nodes will use the ref for highlighting checks, which updates on render
  const highlightedBeatIdsRef = useRef(highlightedBeatIdsSet);
  highlightedBeatIdsRef.current = highlightedBeatIdsSet;

  // Same treatment for the live Preview Window trace (red overlay).
  const pwVisitedBeatIdsSet = useMemo(() => {
    return pwVisitedBeatIds.length > 0 ? new Set(pwVisitedBeatIds) : null;
  }, [pwVisitedBeatIds]);
  const pwVisitedBeatIdsRef = useRef(pwVisitedBeatIdsSet);
  pwVisitedBeatIdsRef.current = pwVisitedBeatIdsSet;

  // Ref mirror for the currently-active PW beat so nodes can read it without
  // becoming a memo dependency (avoids rebuilding all nodes on each beat step).
  const pwCurrentBeatIdRef = useRef<string | null | undefined>(pwCurrentBeatId);
  pwCurrentBeatIdRef.current = pwCurrentBeatId;

  // DEBUG: Track initial mounting
  const mountRef = useRef(false);

  // Track pending fitView request (for callback-based auto-fit after project load)
  const pendingFitViewRef = useRef(false);

  // Watch ReactFlow initialization with enhanced debugging
  // ReactFlow instance is available for manual controls
  // Removed automatic fitView/zoom debugging code

  // Convert beats to ReactFlow nodes with viewport-aware debugging
  const nodes = useMemo(() => {
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

    const beatNodes = unclusteredBeats.map((beat) => ({
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
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));

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
          getAssets: () => assetsRef.current,
          // Pass getter for highlighted beat IDs to avoid embedding in node data and prevent re-renders
          // Use getter function to access the ref so cluster nodes get the current value without being dependencies
          getHighlightedBeatIds: () => highlightedBeatIdsRef.current,
        },
        style: {
          width: cluster.containerBounds.width,
          height: cluster.isExpanded ? cluster.containerBounds.height : 40,
        },
      };
    });

    return [...beatNodes, ...clusterNodes];

    // return totalNodes; // Uncomment to go back to normal
  // Note: assets and highlightedBeatIds are intentionally NOT in dependency array
  // We use refs to access current values without triggering full node recalculation
  // This is critical for performance - changing highlighted beats shouldn't rebuild all nodes
  }, [beats, clusters, containerBeatPositions, selectedBeat, selectedCluster, onAddToContainer, onRemoveCluster, onClusterExpandCollapse, onBeatInContainerMove, onDropBeatToCluster, onClusterResize, onAutoLayoutCluster, onBeatSelect, onSetClusterMap, onSetClusterSound]);

  // Convert beat connections to ReactFlow edges
  const edges = useMemo(() => {
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

      if (beat.type === 'dialogTree' && params.dialogTree) {
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

      // Add connections with unique IDs, resolving cluster boundaries
      connections.forEach((connection) => {
        const edge = createEdge(beat.id, connection.targetId, {
          id: `conn-${beat.id}-${connection.targetId}`,
          type: 'custom',
          animated: connection.condition !== undefined,
          label: connection.label || (connection.condition ? '?' : ''),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
          },
          style: {
            stroke: connection.condition ? '#fbbf24' : '#64748b',
            strokeWidth: 2,
          },
          data: {
            condition: connection.condition,
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
    });

    return allEdges;
  }, [beats]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);

  // When a beat inside a cluster is selected, clear ReactFlow's internal node selection
  // to prevent both a cluster beat and an unclustered node appearing selected.
  useEffect(() => {
    if (selectedBeat?.cluster) {
      setNodes((prev) =>
        prev.some((n) => n.selected)
          ? prev.map((n) => n.selected ? { ...n, selected: false } : n)
          : prev
      );
    }
  }, [selectedBeat, setNodes]);

  // Track previous beats count to detect when project is loaded
  const prevBeatsLengthRef = useRef(beats.length);

  // Track node IDs to avoid unnecessary setNodes calls that disrupt ReactFlow.
  // When App.tsx re-renders (e.g. from VCS state changes), callback props get new
  // references, causing the nodes useMemo to recalculate. The new node array has
  // the same beat content but new object references. Calling setNodes() with these
  // "identical" nodes disrupts ReactFlow's internal state, causing nodes to vanish.
  const prevNodeIdsRef = useRef('');

  // Update nodes when beats change
  useEffect(() => {
    // Build a fingerprint of the nodes: IDs + positions + selection state
    // Include selectedBeatId for cluster nodes so beat selection across clusters propagates
    const fingerprint = nodes.map(n =>
      `${n.id}:${n.position.x},${n.position.y}:${n.data?.selected}:${n.data?.expanded}:${n.data?.selectedBeatId || ''}`
    ).join('|');

    if (fingerprint === prevNodeIdsRef.current) {
      // Nodes haven't meaningfully changed — skip setNodes to protect ReactFlow state
      return;
    }
    prevNodeIdsRef.current = fingerprint;

    if (nodes.length > 0) {
      console.log('[GraphEditor] setNodes: updating', nodes.length, 'nodes');
    }

    setNodes(nodes);

    // If beats count changed (likely project load or import), mark that we need fitView
    const beatsCountChanged = Math.abs(beats.length - prevBeatsLengthRef.current) > 0;
    const isProjectLoad = beatsCountChanged && beats.length > 1;

    if (isProjectLoad) {
      pendingFitViewRef.current = true;
    }
    prevBeatsLengthRef.current = beats.length;
  }, [nodes, setNodes, beats.length, clusters.length]);

  // Update edges when beats change
  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  // Callback-based fitView: triggers when nodes are ready and a project was loaded
  // This avoids timing-based solutions by waiting for actual render completion
  useEffect(() => {
    if (pendingFitViewRef.current && reactFlowInstance && nodesState.length > 0) {
      // Use requestAnimationFrame to ensure DOM has been painted
      requestAnimationFrame(() => {
        reactFlowInstance.fitView({ padding: 0.2, maxZoom: 1, duration: 300 });
        pendingFitViewRef.current = false;
        console.log('[GraphEditor] Auto fitView completed after project load');
      });
    }
  }, [nodesState.length, reactFlowInstance]);

  // Efficiently update node highlighting without full rebuild
  // This effect updates both beat nodes and cluster nodes when highlightedBeatIdsSet changes
  useEffect(() => {
    // Generate a version key to force cluster re-renders
    const highlightVersion = highlightedBeatIdsSet
      ? Array.from(highlightedBeatIdsSet).sort().join(',')
      : '';

    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        if (node.type === 'beat') {
          const isHighlighted = highlightedBeatIdsSet?.has(node.id) ?? false;
          if (node.data.highlighted !== isHighlighted) {
            return {
              ...node,
              data: {
                ...node.data,
                highlighted: isHighlighted,
              },
            };
          }
        }
        // For cluster nodes, update the highlightVersion to trigger re-render
        if (node.type === 'cluster') {
          if (node.data.highlightVersion !== highlightVersion) {
            return {
              ...node,
              data: {
                ...node.data,
                highlightVersion,
              },
            };
          }
        }
        return node;
      });
    });
  }, [highlightedBeatIdsSet, setNodes]);

  // Separate effect for the PW-visited trace so red/yellow updates don't thrash
  // each other — toggling the trace mid-play must not rebuild the whole graph.
  useEffect(() => {
    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        if (node.type !== 'beat') return node;
        const isVisited = pwVisitedBeatIdsSet?.has(node.id) ?? false;
        if (node.data.pwVisited === isVisited) return node;
        return {
          ...node,
          data: {
            ...node.data,
            pwVisited: isVisited,
          },
        };
      });
    });
  }, [pwVisitedBeatIdsSet, setNodes]);

  // Move the "current beat" marker to whichever beat is executing now. Runs
  // as a focused effect so only the two beats that flipped status re-render.
  useEffect(() => {
    setNodes((currentNodes) => {
      return currentNodes.map((node) => {
        if (node.type !== 'beat') return node;
        const isCurrent = pwCurrentBeatId === node.id;
        if (node.data.pwCurrent === isCurrent) return node;
        return {
          ...node,
          data: {
            ...node.data,
            pwCurrent: isCurrent,
          },
        };
      });
    });
  }, [pwCurrentBeatId, setNodes]);

  // Auto-center and zoom on selected beat for better visibility
  useEffect(() => {
    if (!reactFlowInstance || !selectedBeat) return;

    // Find the node in ReactFlow
    const node = reactFlowInstance.getNode(selectedBeat.id);
    if (!node) {
      // Beat might be inside a cluster - find the cluster and beat position within it
      const clusterId = selectedBeat.cluster;
      if (clusterId) {
        const clusterNode = reactFlowInstance.getNode(clusterId);
        if (clusterNode) {
          // Find beat's position within the cluster from containerBeatPositions
          const beatPosition = containerBeatPositions.find(bp => bp.beatId === selectedBeat.id);

          if (beatPosition?.position) {
            // Calculate absolute position: cluster position + beat position within cluster
            // Add 40px for cluster header height
            const HEADER_HEIGHT = 40;
            const NODE_WIDTH = 160;
            const NODE_HEIGHT = 80;

            const absoluteX = clusterNode.position.x + beatPosition.position.x + (NODE_WIDTH / 2);
            const absoluteY = clusterNode.position.y + HEADER_HEIGHT + beatPosition.position.y + (NODE_HEIGHT / 2);

            reactFlowInstance.setCenter(absoluteX, absoluteY, { zoom: 0.8, duration: 300 });
          } else {
            // Fallback: center on cluster if beat position not found
            reactFlowInstance.setCenter(
              clusterNode.position.x + (clusterNode.style?.width ? Number(clusterNode.style.width) / 2 : 200),
              clusterNode.position.y + (clusterNode.style?.height ? Number(clusterNode.style.height) / 2 : 100),
              { zoom: 0.8, duration: 300 }
            );
          }
        }
      }
      return;
    }

    // Center on the selected beat node at 80% zoom
    // Node width ~160, height ~80, so center offset is 80, 40
    reactFlowInstance.setCenter(
      node.position.x + 80,
      node.position.y + 40,
      { zoom: 0.8, duration: 300 }
    );
  }, [selectedBeat?.id, reactFlowInstance, containerBeatPositions]);

  // Handle node click
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      console.log('[GraphEditor] Node clicked:', node.id, 'type:', node.type);

      // Handle cluster node clicks
      if (node.type === 'cluster') {
        const cluster = clusters.find((c) => c.id === node.id);
        if (cluster) {
          // Check if this is an expand/collapse click by looking at the target
          const target = event.target as HTMLElement;
          const isButtonClick = target.closest('button') !== null;

          if (isButtonClick) {
            // Handle expand/collapse button click
            onClusterExpandCollapse(cluster.id);
          } else {
            // Handle cluster selection
            onClusterSelect(cluster);
          }
        }
      } else {
        // Handle beat node clicks
        const beat = beats.find((b) => b.id === node.id);
        if (beat) {
          onBeatSelect(beat);
        }
      }
    },
    [beats, clusters, onBeatSelect, onClusterSelect, onClusterExpandCollapse]
  );

  // Handle node context menu (right-click)
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();

      // Only show context menu for beat nodes
      if (node.type !== 'beat') {
        return;
      }

      // Get the flow position for paste operations
      const flowPosition = reactFlowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        beatId: node.id,
        flowPosition: flowPosition || null,
      });
    },
    [reactFlowInstance]
  );

  // Handle pane context menu (right-click on empty space)
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();

      // Get the flow position for paste operations
      const flowPosition = reactFlowInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        beatId: null,
        flowPosition: flowPosition || null,
      });
    },
    [reactFlowInstance]
  );

  // Close context menu on click outside
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    (action: 'duplicate' | 'copy' | 'paste' | 'delete') => {
      if (!contextMenu) return;

      switch (action) {
        case 'duplicate':
          if (contextMenu.beatId && onBeatDuplicate) {
            onBeatDuplicate(contextMenu.beatId);
          }
          break;
        case 'copy':
          if (contextMenu.beatId && onBeatCopy) {
            onBeatCopy(contextMenu.beatId);
          }
          break;
        case 'paste':
          if (contextMenu.flowPosition && onBeatPaste) {
            onBeatPaste(contextMenu.flowPosition);
          }
          break;
        case 'delete':
          if (contextMenu.beatId && onBeatDelete) {
            const beat = beats.find(b => b.id === contextMenu.beatId);
            const confirmDelete = window.confirm(`Delete beat "${beat?.name || contextMenu.beatId}"?`);
            if (confirmDelete) {
              onBeatDelete(contextMenu.beatId);
            }
          }
          break;
      }
      closeContextMenu();
    },
    [contextMenu, beats, onBeatDuplicate, onBeatCopy, onBeatPaste, onBeatDelete, closeContextMenu]
  );

  // Handle node drag
  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster') {
        onClusterMove(node.id, node.position.x, node.position.y);
        return;
      }

      // Beat node — first record the move, then check whether the beat was
      // dropped INSIDE any cluster's bounds. If yes, reassign the beat to
      // that cluster (mirrors the sidebar→cluster drag flow).
      onBeatMove(node.id, node.position.x, node.position.y);

      if (!onDropBeatToCluster) return;
      const dropX = node.position.x;
      const dropY = node.position.y;
      for (const cluster of clusters) {
        if (!cluster.isExpanded) continue; // collapsed clusters: no drop zone
        const cx = cluster.containerPosition?.x ?? 0;
        const cy = cluster.containerPosition?.y ?? 0;
        const cw = cluster.containerBounds?.width ?? 0;
        const ch = cluster.containerBounds?.height ?? 0;
        if (cw <= 0 || ch <= 0) continue;
        if (dropX >= cx && dropX <= cx + cw && dropY >= cy && dropY <= cy + ch) {
          // Don't redundantly fire when the beat is already in this cluster
          const beatObj = beats.find(b => b.id === node.id);
          if (beatObj?.cluster === cluster.id) return;
          onDropBeatToCluster(node.id, cluster.id);
          return;
        }
      }
    },
    [onBeatMove, onClusterMove, onDropBeatToCluster, clusters, beats]
  );

// Handle drop to add new beats
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const beatType = event.dataTransfer.getData('beatType');
      if (!beatType || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onBeatAdd(beatType, position);
    },
    [reactFlowInstance, onBeatAdd]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Debug logging for ReactFlow mounting
  useEffect(() => {
    console.log('[GraphEditor] === ReactFlow mounting with', nodesState.length, 'nodes ===');
    console.log('[GraphEditor] ReactFlow node props:', {nodes: nodesState?.length, viewport: 'unknown', zoom: 'unknown'});
  }, [nodesState]);

  // Memoized MiniMap color callback to prevent re-creation on every render
  const miniMapNodeColor = useCallback((node: Node) => node.data?.color || '#94a3b8', []);

  // Debug viewport controller using only the reactFlowInstance
  const debugViewport = useCallback(() => {
    console.log('[GraphEditor] Debug: Viewport control clicked');
    if (reactFlowInstance) {
      try {
        const currentViewport = reactFlowInstance.getViewport?.();
        console.log('[GraphEditor] Current viewport:', currentViewport);
        console.log('[GraphEditor] All nodes:', reactFlowInstance.getNodes?.());

        // Try to center on first node
        const allNodes = reactFlowInstance.getNodes?.() || [];
        if (allNodes.length > 0) {
          const firstNode = allNodes[0] as any;
          console.log('[GraphEditor] Centering on first node:', firstNode.position);
          reactFlowInstance.setCenter?.(firstNode.position.x, firstNode.position.y, 1);
        } else {
          console.log('[GraphEditor] No nodes found to center on');
        }
      } catch (e) {
        console.error('[GraphEditor] Viewport debug error:', e);
      }
    } else {
      console.log('[GraphEditor] No ReactFlow instance available');
    }
  }, [reactFlowInstance]);

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>
      {/* Clean minimal viewport - prepare for final render test */}
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={closeContextMenu}
        onInit={(instance) => {
          // Set the instance for viewport controls
          setReactFlowInstance(instance);
          console.log('🎯 ReactFlow ready');
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        attributionPosition="bottom-left"
        minZoom={0.05}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      >
        <Background color="#aaa" gap={16} />
        <Controls showInteractive={false}>
          {/* Auto-arrange button as first control */}
          {onAutoLayout && (
            <ControlButton onClick={onAutoLayout} title="Auto-arrange beats">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 14, height: 14, maxWidth: '100%', maxHeight: '100%' }}
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <path d="M10 6h4M6 10v4M18 10v4M10 18h4" />
              </svg>
            </ControlButton>
          )}
        </Controls>
        <MiniMap
          nodeStrokeColor={miniMapNodeColor}
          nodeColor={miniMapNodeColor}
          nodeBorderRadius={8}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {contextMenu.beatId ? (
            // Beat context menu
            <>
              <button
                onClick={() => handleContextMenuAction('duplicate')}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                disabled={!onBeatDuplicate}
              >
                <span className="text-gray-500">⌘D</span>
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => handleContextMenuAction('copy')}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                disabled={!onBeatCopy}
              >
                <span className="text-gray-500">⌘C</span>
                <span>Copy</span>
              </button>
              {/* VCS actions */}
              {vcsActive && contextMenu.beatId && (
                <>
                  <div className="h-px bg-gray-200 my-1" />
                  {onViewBeatDiff && (
                    <button
                      onClick={() => { onViewBeatDiff(contextMenu.beatId!); closeContextMenu(); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                    >
                      <span className="text-gray-500 text-xs font-mono">D</span>
                      <span>Show Diff</span>
                    </button>
                  )}
                  {onViewBeatHistory && (
                    <button
                      onClick={() => { onViewBeatHistory(contextMenu.beatId!); closeContextMenu(); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                    >
                      <span className="text-gray-500 text-xs font-mono">H</span>
                      <span>Show History</span>
                    </button>
                  )}
                  {onRevertBeat && vcs!.isBeatChanged(contextMenu.beatId) && (
                    <button
                      onClick={() => { onRevertBeat(contextMenu.beatId!); closeContextMenu(); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-orange-50 text-orange-600 flex items-center gap-2"
                    >
                      <span className="text-orange-400">{'\u21A9'}</span>
                      <span>Revert Changes</span>
                    </button>
                  )}
                  {vcs!.type === 'perforce' && (
                    <>
                      <button
                        onClick={async () => { await vcs!.p4EditFile(contextMenu.beatId!); closeContextMenu(); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span className="text-gray-500">{'\u270E'}</span>
                        <span>Check Out (P4)</span>
                      </button>
                      <button
                        onClick={async () => { await vcs!.p4LockFile(contextMenu.beatId!); closeContextMenu(); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span className="text-gray-500">{'\u{1F512}'}</span>
                        <span>Lock (P4)</span>
                      </button>
                    </>
                  )}
                </>
              )}
              <div className="h-px bg-gray-200 my-1" />
              <button
                onClick={() => handleContextMenuAction('delete')}
                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                disabled={!onBeatDelete}
              >
                <span className="text-red-400">⌫</span>
                <span>Delete</span>
              </button>
            </>
          ) : (
            // Pane context menu (empty space)
            <>
              <button
                onClick={() => handleContextMenuAction('paste')}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                  hasBeatClipboard ? 'hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'
                }`}
                disabled={!hasBeatClipboard || !onBeatPaste}
              >
                <span className="text-gray-500">⌘V</span>
                <span>Paste Beat</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
