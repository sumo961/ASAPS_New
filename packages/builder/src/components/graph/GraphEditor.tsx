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
  NodeTypes,
  EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { BeatNode } from './BeatNode';
import { CustomEdge } from './CustomEdge';
import { ClusterContainerNode } from './ClusterContainerNode';
import { DialogContainerNode } from './DialogContainerNode';
import { DialogInternalNode } from './DialogInternalNode';
import { useVCSStatus } from '../../vcs/VCSStatusProvider';
import { buildGraphNodes, buildGraphEdges } from './graphBuild';
import { CLUSTER_HEADER_H } from './graphStyle';

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
  onRemoveBeatFromCluster?: (beatId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  highlightedBeatIds?: string[];
  /** Beats visited during the active Preview Window session — rendered as a red trace. */
  pwVisitedBeatIds?: string[];
  /** beatId → the missing target it points at. Draws a ⚠ mark on the node so
   *  the import banner's list has something to point at in the graph. */
  brokenTargetsByBeatId?: Record<string, string>;
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
  /** Multi-selection actions — receive every selected beat id */
  onBeatsDuplicate?: (beatIds: string[]) => void;
  onBeatsDelete?: (beatIds: string[]) => void;
  /** One sentence naming what a delete would break ("3 links in 2 other
   *  beats point here and will break.") — appended to the delete confirm. */
  describeDeleteImpact?: (beatIds: string[]) => string | null;
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
  // B1b v2 — expanded dialogTree: container + internal exchange/choice nodes
  dialogContainer: DialogContainerNode,
  dialogInternal: DialogInternalNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
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
  onRemoveBeatFromCluster,
  onClusterResize,
  onAutoLayoutCluster,
  highlightedBeatIds = [],
  pwVisitedBeatIds = [],
  brokenTargetsByBeatId,
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
  describeDeleteImpact,
  onBeatsDuplicate,
  onBeatsDelete,
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

  // Ids of all currently multi-selected beat nodes (ReactFlow selection:
  // shift+drag marquee on the pane, or cmd/ctrl/shift+click on nodes).
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

  // B1b — dialogTree disclosure expansion (session-scoped). Expanded beats
  // render their internal tree inside the node; their outgoing edges leave
  // from per-exit handles instead of the node's main source handle.
  const [expandedDialogs, setExpandedDialogs] = useState<Set<string>>(new Set());
  const toggleDialogExpand = useCallback((beatId: string) => {
    setExpandedDialogs(prev => {
      const next = new Set(prev);
      if (next.has(beatId)) next.delete(beatId);
      else next.add(beatId);
      return next;
    });
  }, []);
  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: Node[] }) => {
      setMultiSelectedIds(selNodes.filter(n => n.type === 'beat').map(n => n.id));
    },
    []
  );

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

  // Same ref-mirror treatment: a broken-link mark must not make every node
  // rebuild whenever the map identity changes.
  const brokenTargetsRef = useRef<Record<string, string> | undefined>(brokenTargetsByBeatId);
  brokenTargetsRef.current = brokenTargetsByBeatId;

  // DEBUG: Track initial mounting
  const mountRef = useRef(false);

  // Track pending fitView request (for callback-based auto-fit after project load)
  const pendingFitViewRef = useRef(false);

  // Watch ReactFlow initialization with enhanced debugging
  // ReactFlow instance is available for manual controls
  // Removed automatic fitView/zoom debugging code

  // Convert beats to ReactFlow nodes with viewport-aware debugging
  const nodes = useMemo(() => buildGraphNodes({
    beats,
    clusters,
    containerBeatPositions,
    selectedBeat,
    selectedCluster,
    expandedDialogs,
    highlighted: highlightedBeatIdsRef.current,
    pwVisited: pwVisitedBeatIdsRef.current,
    pwCurrentBeatId: pwCurrentBeatIdRef.current,
    brokenTargets: brokenTargetsRef.current,
    callbacks: {
      toggleDialogExpand,
      onBeatSelect,
      onClusterExpandCollapse,
      onBeatInContainerMove,
      onDropBeatToCluster,
      onRemoveBeatFromCluster,
      onClusterResize,
      onAutoLayoutCluster,
      onRemoveCluster,
      onSetClusterMap,
      onSetClusterSound,
      onSetClusterSharedVisuals,
      getAssets: () => assetsRef.current,
    },
  // Note: assets and highlightedBeatIds are intentionally NOT in dependency array
  // We use refs to access current values without triggering full node recalculation
  // This is critical for performance - changing highlighted beats shouldn't rebuild all nodes
  }), [beats, clusters, containerBeatPositions, selectedBeat, selectedCluster, onRemoveCluster, onClusterExpandCollapse, onBeatInContainerMove, onDropBeatToCluster, onRemoveBeatFromCluster, onClusterResize, onAutoLayoutCluster, onBeatSelect, onSetClusterMap, onSetClusterSound, expandedDialogs, toggleDialogExpand]);

  // Convert beat connections to ReactFlow edges
  const edges = useMemo(
    () => buildGraphEdges({ beats, clusters, expandedDialogs }),
    // clusters is a dep because collapse state changes edge endpoints.
    [beats, clusters, expandedDialogs]
  );

  const [nodesState, setNodes, onNodesChange] = useNodesState(nodes);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(edges);

  // (The old "clear ReactFlow selection when a clustered beat is selected"
  // workaround is gone: clustered beats ARE ReactFlow nodes now, so there is
  // only one selection system.)

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
    // Build a fingerprint of the nodes: IDs + positions + selection state.
    // parentNode + hidden cover cluster membership changes (drop/eject) and
    // collapse — without them the graph would not re-sync on those events.
    const fingerprint = nodes.map(n =>
      `${n.id}:${n.position.x},${n.position.y}:${n.data?.selected}:${n.data?.expanded}:${n.data?.dialogExpanded ? 1 : 0}:${(n as any).parentNode || ''}:${n.hidden ? 1 : 0}`
    ).join('|');

    if (fingerprint === prevNodeIdsRef.current) {
      // Nodes haven't meaningfully changed — skip setNodes to protect ReactFlow state
      return;
    }
    prevNodeIdsRef.current = fingerprint;

    if (nodes.length > 0) {
      console.log('[GraphEditor] setNodes: updating', nodes.length, 'nodes');
    }

    // Preserve ReactFlow's multi-selection: the freshly-built nodes carry no
    // `selected` flags, and a bare setNodes(nodes) would wipe the user's
    // marquee/cmd-click selection on every re-sync (e.g. right after moving
    // the selected group).
    setNodes(prev => {
      const selectedIds = new Set(prev.filter(n => n.selected).map(n => n.id));
      return selectedIds.size === 0
        ? nodes
        : nodes.map(n => (selectedIds.has(n.id) ? { ...n, selected: true } : n));
    });

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

  // Efficiently update node highlighting without full rebuild. Clustered
  // beats are type 'beat' nodes too now, so this single pass covers them —
  // the old highlightVersion memo-buster for cluster nodes is gone.
  useEffect(() => {
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

  // Auto-center and zoom on selected beat for better visibility. Clustered
  // beats are real nodes now — positionAbsolute already folds the parent
  // frame in, so the manual cluster-position reconstruction is gone. A beat
  // hidden inside a COLLAPSED cluster has no useful own position; center on
  // its cluster frame instead.
  useEffect(() => {
    if (!reactFlowInstance || !selectedBeat) return;

    const node = reactFlowInstance.getNode(selectedBeat.id);
    const target = node?.hidden
      ? reactFlowInstance.getNode(selectedBeat.cluster ?? '')
      : node;
    if (!target) return;

    const pos = (target as any).positionAbsolute ?? target.position;
    const w = target.width ?? (target.style?.width ? Number(target.style.width) : 160);
    const h = target.height ?? (target.style?.height ? Number(target.style.height) : 80);
    reactFlowInstance.setCenter(pos.x + w / 2, pos.y + h / 2, { zoom: 0.8, duration: 300 });
  }, [selectedBeat?.id, reactFlowInstance]);

  // Handle node click
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      console.log('[GraphEditor] Node clicked:', node.id, 'type:', node.type);

      // Handle cluster node clicks
      if (node.type === 'cluster') {
        const cluster = clusters.find((c) => c.id === node.id);
        if (cluster) {
          const target = event.target as HTMLElement;
          if (target.closest('.cluster-collapse-btn')) {
            // Explicit collapse/expand control. (The old any-<button>
            // heuristic toggled the cluster for EVERY header button; now
            // that popover buttons stopPropagation, only the marked control
            // ever reaches here — keep it as a fallback for tests/JSDOM.)
            onClusterExpandCollapse(cluster.id);
          } else if (!target.closest('button')) {
            // Handle cluster selection
            onClusterSelect(cluster);
          }
        }
      } else if (node.type === 'dialogInternal') {
        // A dialog's internal node — selection routes to the parent beat
        // (the Dialog editor opens in the Inspector). Per-node deep focus
        // is B1c.
        const parentBeatId = (node as any).parentNode ?? String(node.id).split(':')[1];
        const beat = beats.find((b) => b.id === parentBeatId);
        if (beat) {
          onBeatSelect(beat);
        }
      } else {
        // Handle beat node clicks (incl. the dialogContainer, which keeps
        // the beat's id)
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

      // When the right-clicked beat is part of a multi-selection, the
      // duplicate/delete actions apply to the whole selection.
      const multiTarget =
        contextMenu.beatId && multiSelectedIds.length > 1 && multiSelectedIds.includes(contextMenu.beatId)
          ? multiSelectedIds
          : null;

      switch (action) {
        case 'duplicate':
          if (multiTarget && onBeatsDuplicate) {
            onBeatsDuplicate(multiTarget);
          } else if (contextMenu.beatId && onBeatDuplicate) {
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
          // Confirm ONLY when the delete breaks links elsewhere — a clean
          // delete is undoable (⌘Z) and needs no interruption.
          if (multiTarget && onBeatsDelete) {
            const impact = describeDeleteImpact?.(multiTarget);
            if (!impact || window.confirm(`Delete ${multiTarget.length} selected beats?\n\n${impact}`)) {
              onBeatsDelete(multiTarget);
            }
          } else if (contextMenu.beatId && onBeatDelete) {
            const beat = beats.find(b => b.id === contextMenu.beatId);
            const impact = describeDeleteImpact?.([contextMenu.beatId]);
            if (!impact || window.confirm(`Delete beat "${beat?.name || contextMenu.beatId}"?\n\n${impact}`)) {
              onBeatDelete(contextMenu.beatId);
            }
          }
          break;
      }
      closeContextMenu();
    },
    [contextMenu, beats, multiSelectedIds, onBeatDuplicate, onBeatsDuplicate, onBeatCopy, onBeatPaste, onBeatDelete, onBeatsDelete, describeDeleteImpact, closeContextMenu]
  );

  // Handle node drag. With a multi-selection ReactFlow drags the whole
  // group and passes every dragged node as the third argument — process
  // them all so a group drag records every move and can drop several
  // beats into a cluster at once.
  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node, draggedNodes?: Node[]) => {
      const dragged = draggedNodes && draggedNodes.length > 0 ? draggedNodes : [node];

      const snap20 = (v: number) => Math.round(v / 20) * 20;

      for (const n of dragged) {
        if (n.type === 'cluster') {
          onClusterMove(n.id, n.position.x, n.position.y);
          continue;
        }

        // Clustered child — its position is PARENT-relative, so it must
        // never reach onBeatMove (top-level coords) or the drop hit test.
        // Persist content-relative (−header), 20px-snapped, clamped ≥ 0.
        // Not routed through the undoable MoveBeatCommand: in-container
        // moves were never undoable before either (follow-up).
        const parentId = (n as any).parentNode as string | undefined;
        if (parentId && clusters.some(c => c.id === parentId)) {
          onBeatInContainerMove(
            n.id,
            parentId,
            Math.max(0, snap20(n.position.x)),
            Math.max(0, snap20(n.position.y - CLUSTER_HEADER_H)),
          );
          continue;
        }

        // Beat node — first record the move, then check whether the beat was
        // dropped INSIDE any cluster's bounds. If yes, reassign the beat to
        // that cluster (mirrors the sidebar→cluster drag flow).
        onBeatMove(n.id, n.position.x, n.position.y);

        if (!onDropBeatToCluster) continue;
        const dropX = n.position.x;
        const dropY = n.position.y;
        for (const cluster of clusters) {
          if (!cluster.isExpanded) continue; // collapsed clusters: no drop zone
          const cx = cluster.containerPosition?.x ?? 0;
          const cy = cluster.containerPosition?.y ?? 0;
          const cw = cluster.containerBounds?.width ?? 0;
          const ch = cluster.containerBounds?.height ?? 0;
          if (cw <= 0 || ch <= 0) continue;
          if (dropX >= cx && dropX <= cx + cw && dropY >= cy && dropY <= cy + ch) {
            // Don't redundantly fire when the beat is already in this cluster
            const beatObj = beats.find(b => b.id === n.id);
            if (beatObj?.cluster !== cluster.id) {
              onDropBeatToCluster(n.id, cluster.id);
              // Land the beat where it was dropped, not on the default grid
              // slot: store the content-relative position (−header).
              onBeatInContainerMove(
                n.id,
                cluster.id,
                Math.max(0, snap20(dropX - cx)),
                Math.max(0, snap20(dropY - cy - CLUSTER_HEADER_H)),
              );
            }
            break;
          }
        }
      }
    },
    [onBeatMove, onClusterMove, onBeatInContainerMove, onDropBeatToCluster, clusters, beats]
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

  // The context menu has advertised ⌘D / ⌘C / ⌘V / ⌫ since it was built —
  // this handler is the implementation it promised. Scoped to the graph
  // (bubbling from ReactFlow's focusable nodes/pane), so text fields and
  // other panels keep their native shortcuts.
  const handleGraphKeyDown = useCallback((event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) return;

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const multi = multiSelectedIds.length > 1 ? multiSelectedIds : null;
    const singleId = selectedBeat?.id ?? (multiSelectedIds.length === 1 ? multiSelectedIds[0] : null);

    if (mod && key === 'd') {
      if (multi && onBeatsDuplicate) { event.preventDefault(); onBeatsDuplicate(multi); }
      else if (singleId && onBeatDuplicate) { event.preventDefault(); onBeatDuplicate(singleId); }
    } else if (mod && key === 'c') {
      // Real text selections keep native copy
      if (window.getSelection()?.toString()) return;
      if (singleId && onBeatCopy) { event.preventDefault(); onBeatCopy(singleId); }
    } else if (mod && key === 'v') {
      if (hasBeatClipboard && onBeatPaste && reactFlowInstance) {
        event.preventDefault();
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const pos = reactFlowInstance.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        onBeatPaste(pos);
      }
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && !mod) {
      if (multi && onBeatsDelete) {
        event.preventDefault();
        const impact = describeDeleteImpact?.(multi);
        if (!impact || window.confirm(`Delete ${multi.length} selected beats?\n\n${impact}`)) {
          onBeatsDelete(multi);
        }
      } else if (singleId && onBeatDelete) {
        event.preventDefault();
        const beat = beats.find(b => b.id === singleId);
        const impact = describeDeleteImpact?.([singleId]);
        if (!impact || window.confirm(`Delete beat "${beat?.name || singleId}"?\n\n${impact}`)) {
          onBeatDelete(singleId);
        }
      }
    }
  }, [multiSelectedIds, selectedBeat, beats, onBeatDuplicate, onBeatsDuplicate, onBeatCopy, onBeatPaste, hasBeatClipboard, onBeatDelete, onBeatsDelete, describeDeleteImpact, reactFlowInstance]);

  return (
    <div className="w-full h-full" style={{ position: 'relative' }} onKeyDown={handleGraphKeyDown}>
      {/* Clean minimal viewport - prepare for final render test */}
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        // Selection elevation (+1000) would lift an opaque expanded dialog
        // above its own internal-edge layers; explicit zIndex tiers on the
        // dialog nodes/edges handle stacking instead.
        elevateNodesOnSelect={false}
        deleteKeyCode={null}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={closeContextMenu}
        onInit={(instance) => {
          // Set the instance for viewport controls
          setReactFlowInstance(instance);
          // Dev-only hook so automated tests can drive selection/inspection
          if (import.meta.env.DEV) {
            (window as any).__graphEditorInstance = instance;
          }
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
              {(() => {
                const multiCount =
                  multiSelectedIds.length > 1 && multiSelectedIds.includes(contextMenu.beatId)
                    ? multiSelectedIds.length
                    : 0;
                return (
                  <button
                    onClick={() => handleContextMenuAction('duplicate')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                    disabled={multiCount > 0 ? !onBeatsDuplicate : !onBeatDuplicate}
                  >
                    <span className="text-gray-500">⌘D</span>
                    <span>{multiCount > 0 ? `Duplicate ${multiCount} beats` : 'Duplicate'}</span>
                  </button>
                );
              })()}
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
              {(() => {
                const multiCount =
                  multiSelectedIds.length > 1 && multiSelectedIds.includes(contextMenu.beatId!)
                    ? multiSelectedIds.length
                    : 0;
                return (
                  <button
                    onClick={() => handleContextMenuAction('delete')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                    disabled={multiCount > 0 ? !onBeatsDelete : !onBeatDelete}
                  >
                    <span className="text-red-400">⌫</span>
                    <span>{multiCount > 0 ? `Delete ${multiCount} beats` : 'Delete'}</span>
                  </button>
                );
              })()}
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
