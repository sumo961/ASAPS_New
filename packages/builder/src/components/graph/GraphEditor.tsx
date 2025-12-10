import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow, // Move here for children-level usage
  addEdge,
  Connection,
  ConnectionMode,
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

interface GraphEditorProps {
  beats: Beat[];
  clusters: Cluster[];
  containerBeatPositions?: ContainerBeatPosition[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, x: number, y: number) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onConnect: (sourceBeatId: string, targetBeatId: string) => void;
  onBeatAdd: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse: (clusterId: string) => void;
  onClusterMove: (clusterId: string, x: number, y: number) => void;
  onBeatInContainerMove: (beatId: string, clusterId: string, x: number, y: number) => void;
  highlightedBeatIds?: string[];
  onAutoLayout?: () => void;
  onAddToContainer?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
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
  introText: '#10b981',
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
  onConnect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  onBeatInContainerMove,
  highlightedBeatIds = [],
  onAutoLayout,
  onAddToContainer,
  onRemoveCluster,
}) => {
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // DEBUG: Track initial mounting
  const mountRef = useRef(false);

  // Watch ReactFlow initialization with enhanced debugging
  // ReactFlow instance is available for manual controls
  // Removed automatic fitView/zoom debugging code

  // Convert beats to ReactFlow nodes with viewport-aware debugging
  const nodes = useMemo(() => {
    const beatNodes = beats.map((beat) => ({
      id: beat.id,
      type: 'beat',
      position: { x: beat.x || 0, y: beat.y || 0 },
      data: {
        beat,
        label: beat.name,
        type: beat.type,
        selected: selectedBeat?.id === beat.id,
        color: beatTypeColors[beat.type] || '#94a3b8',
        highlighted: highlightedBeatIds.includes(beat.id),
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
      const containerBeats = beatsInThisCluster.map((beat, index) => {
        // Look for existing position
        const existingPosition = containerBeatPositions.find(
          pos => pos.beatId === beat.id && pos.clusterId === cluster.id
        );

        if (existingPosition) {
          return {
            ...existingPosition,
            mapStyle: existingPosition.mapStyle || {
              icon: '📍',
              color: '#3b82f6',
              size: 'medium' as const,
              label: beat.name.substring(0, 10)
            }
          };
        }

        // Default position - simple grid pattern
        return {
          beatId: beat.id,
          clusterId: cluster.id,
          position: {
            x: 50 + (index % 2) * 120,
            y: 50 + Math.floor(index / 2) * 60,
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
        },
        style: {
          width: cluster.containerBounds.width,
          height: cluster.isExpanded ? cluster.containerBounds.height : 40,
        },
      };
    });

    return [...beatNodes, ...clusterNodes];

    // return totalNodes; // Uncomment to go back to normal
  }, [beats, clusters, containerBeatPositions, selectedBeat, selectedCluster, highlightedBeatIds, onAddToContainer, onRemoveCluster, onClusterExpandCollapse, onBeatInContainerMove]);

  // Convert beat connections to ReactFlow edges
  const edges = useMemo(() => {
    const allEdges: Edge[] = [];
    const edgeIds = new Set<string>(); // Track edge IDs to prevent duplicates
    
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
      
      // Add connections with unique IDs
      connections.forEach((connection) => {
        const edgeId = `${beat.id}-to-${connection.targetId}`;
        
        // Skip if we already have this connection to prevent duplicates
        if (edgeIds.has(edgeId)) {
          return;
        }
        
        edgeIds.add(edgeId);
        
        allEdges.push({
          id: edgeId,
          source: beat.id,
          target: connection.targetId,
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
      });
      
      // Add default target
      if (beat.defaultTarget) {
        const defaultEdgeId = `${beat.id}-default-${beat.defaultTarget}`;
        if (!edgeIds.has(defaultEdgeId)) {
          edgeIds.add(defaultEdgeId);
          allEdges.push({
            id: defaultEdgeId,
            source: beat.id,
            target: beat.defaultTarget,
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
        }
      }
    });
    
    return allEdges;
  }, [beats]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);

  // Update nodes when beats change
  useEffect(() => {
    console.log('[GraphEditor] useEffect - setting nodes TRIGGERED. Nodes length:', nodes.length, 'NodesState length:', nodesState.length, 'TIMESTAMP:', Date.now());
    if (nodes.length > 0) {
      console.log('[GraphEditor] Creating nodes from beats:', nodes.length, 'beats');
      console.log('[GraphEditor] Beats data:', nodes.map(n => ({id: n.id, name: n.data?.label, x: n.data?.beat?.x, y: n.data?.beat?.y})));
      console.log('[GraphEditor] Beat nodes positions from beats:');
      nodes.forEach((node, i) => {
        console.log(`  [Beat ${i}] ${node.id}: position=(${node.position.x}, ${node.position.y}), data.x=${node.data?.beat?.x}, data.y=${node.data?.beat?.y}, dataType=${node.data?.type}`);
      });
      console.log('[GraphEditor] Node types available:', Object.keys(nodeTypes));
    }

    console.log('[GraphEditor] BEFORE setNodes: nodesState.length =', nodesState.length, 'new nodes.length =', nodes.length);
    setNodes(nodes);
    console.log('[GraphEditor] AFTER setNodes: nodesState.length =', nodesState.length);
  }, [nodes, setNodes]);

  // Update edges when beats change
  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

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

  // Handle node drag
  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster') {
        onClusterMove(node.id, node.position.x, node.position.y);
      } else {
        onBeatMove(node.id, node.position.x, node.position.y);
      }
    },
    [onBeatMove, onClusterMove]
  );

  // Handle new connection
  const onConnectHandler = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        onConnect(params.source, params.target);
      }
    },
    [onConnect]
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
        onConnect={onConnectHandler}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onInit={(instance) => {
          // Set the instance for viewport controls
          setReactFlowInstance(instance);
          console.log('🎯 ReactFlow ready');
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        attributionPosition="bottom-left"
        minZoom={0.05}
        maxZoom={4}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      >
        <Background color="#aaa" gap={16} />
        <Controls />
        {/* Auto-layout button positioned next to Controls */}
        {onAutoLayout && (
          <div
            className="react-flow__panel react-flow__controls"
            style={{
              position: 'absolute',
              left: 10,
              bottom: 150,
              zIndex: 5,
            }}
          >
            <button
              onClick={onAutoLayout}
              className="react-flow__controls-button"
              title="Auto-arrange beats"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                padding: 0,
                border: 'none',
                background: '#fff',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 14, height: 14 }}
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <path d="M10 6h4M6 10v4M18 10v4M10 18h4" />
              </svg>
            </button>
          </div>
        )}
        <MiniMap
          nodeStrokeColor={(node) => node.data?.color || '#94a3b8'}
          nodeColor={(node) => node.data?.color || '#94a3b8'}
          nodeBorderRadius={8}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
};
