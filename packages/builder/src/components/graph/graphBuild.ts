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
import { Beat, Cluster, ContainerBeatPosition, DEFAULT_TARGET_TIMEOUT_TYPES, type StoryLink } from '@asaps/core';
import { liveBeatLinks } from '../../utils/storyLinks';
import { summarizeConditions } from '../../utils/conditionSummary';
import { dialogTreeLayout } from '../../utils/dialogTreeLayout';
import {
  beatTypeColors, CLUSTER_HEADER_H, MIN_CLUSTER_W, MIN_CLUSTER_H,
  linkStyles, beatTypeLinkLooks, DEFAULT_LINK_LOOK, GUARD_LINK_LOOK, LEGACY_CONDITION_LINK_LOOK, STANDALONE_LINK_KINDS, type LinkLook,
} from './graphStyle';

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
  /** End of an interactive resize: one undo entry from `from` to `to`. */
  onClusterResizeCommit?: (clusterId: string, from: { width: number; height: number }, to: { width: number; height: number }) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number, fit?: 'natural' | 'cover' | 'contain') => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: any) => void;
  /** Live getter — the cluster popovers read assets at open time. */
  getAssets: () => Asset[];
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
  /** Needed for collapse-aware endpoint resolution: beats in an expanded
   *  cluster are real child nodes; in a collapsed one they dock at the frame. */
  clusters: Cluster[];
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
    onClusterResizeCommit,
    onAutoLayoutCluster,
    onRemoveCluster,
    onSetClusterMap,
    onSetClusterSound,
    onSetClusterSharedVisuals,
    getAssets,
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

    // Per-cluster running index for the default grid slots — beats without a
    // stored in-container position land on the classic 2-column grid.
    const clusterIndexByBeat = new Map<string, number>();
    {
      const counters = new Map<string, number>();
      for (const b of beats) {
        if (b.cluster && knownClusterIds.has(b.cluster)) {
          const i = counters.get(b.cluster) ?? 0;
          clusterIndexByBeat.set(b.id, i);
          counters.set(b.cluster, i + 1);
        }
      }
    }

    // ONE beat-node constructor for top-level AND clustered beats — the point
    // of the cluster unification. A clustered beat is the same BeatNode,
    // parented to its cluster frame and positioned in parent coordinates.
    // (The hand-rendered card path in ClusterContainerNode kept missing
    // features BeatNode gained; see the Red Story dialogTree-▸ gap.)
    const beatToNodes = (beat: Beat): Node[] => {
      const parentCluster =
        beat.cluster && beat.cluster !== 'undefined' && knownClusterIds.has(beat.cluster)
          ? clusters.find(c => c.id === beat.cluster)
          : undefined;

      let position: { x: number; y: number };
      const parentProps: Partial<Node> = {};
      if (parentCluster) {
        const stored = containerBeatPositions.find(
          p => p.beatId === beat.id && p.clusterId === parentCluster.id
        );
        const idx = clusterIndexByBeat.get(beat.id) ?? 0;
        // Stored positions are CONTENT-relative (below the header bar);
        // ReactFlow children are parent-top-left-relative → +header here,
        // −header when persisting a drag. Disk format unchanged.
        const content = stored?.position ?? {
          x: 20 + (idx % 2) * 200,
          y: 20 + Math.floor(idx / 2) * 110,
        };
        position = { x: content.x, y: content.y + CLUSTER_HEADER_H };
        parentProps.parentNode = parentCluster.id;
        // No extent:'parent' — a child dragged past the frame is a drag-OUT
        // (GraphEditor resolves the drop: eject, or enter another cluster).
        // Clamping it made the ⏏ button the only way back to the top level.
        parentProps.zIndex = 10;
        // Collapsed cluster: children stay in the node array (stable
        // fingerprint/selection) but hidden; their edges re-target to the
        // frame in buildGraphEdges.
        if (!parentCluster.isExpanded) parentProps.hidden = true;
      } else {
        position = { x: beat.x || 0, y: beat.y || 0 };
      }

      // B1b v2 — expanded dialogTree renders CLUSTER-STYLE: a container node
      // (same id, so inbound edges and position carry over) plus the dialog's
      // exchanges/choices as real, read-only child nodes. Their edges are
      // built in the edges memo from the same layout. Works identically for
      // clustered dialogTrees — the container just becomes a child of the
      // cluster frame (same sub-flow mechanic, one level deeper). A collapsed
      // cluster hides the whole expansion with it.
      if (beat.type === 'dialogTree' && expandedDialogs.has(beat.id)) {
        const tree = (beat as any).getParameters?.()?.dialogTree ?? (beat as any).dialogTree;
        if (tree) {
          const layout = dialogTreeLayout(tree);
          const hiddenInCluster = parentCluster && !parentCluster.isExpanded;
          const container: Node = {
            id: beat.id,
            type: 'dialogContainer',
            position,
            // In-cluster: parented to the frame but WITHOUT extent — the
            // expanded tree may be larger than the frame and floats over
            // its edge rather than being clamped into it.
            ...(parentCluster ? { parentNode: parentCluster.id } : {}),
            ...(hiddenInCluster ? { hidden: true } : {}),
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
            // hidden does not cascade in ReactFlow — a collapsed cluster
            // must hide the dialog's grandchildren explicitly.
            ...(hiddenInCluster ? { hidden: true } : {}),
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
        position,
        ...parentProps,
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
          // Clustered beats carry the eject affordance the old card had.
          ...(parentCluster && onRemoveBeatFromCluster
            ? { onEjectFromCluster: onRemoveBeatFromCluster }
            : {}),
          // B1b — dialogTree disclosure trigger on the collapsed node
          // (clustered dialogTrees included — same mechanic, nested)
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
    };

    const beatNodes = unclusteredBeats.flatMap(beatToNodes);
    const clusteredChildNodes = beats
      .filter(b => b.cluster && b.cluster !== 'undefined' && knownClusterIds.has(b.cluster))
      .flatMap(beatToNodes);

    // Cluster frames. The frame renders header + map background + resize +
    // drop target ONLY — its beats are the real child nodes above.
    const clusterNodes = clusters.map((cluster): Node => {
      const containedBeatCount = beats.filter(beat => beat.cluster === cluster.id).length;

      return {
        id: cluster.id,
        type: 'cluster',
        position: { x: cluster.containerPosition.x, y: cluster.containerPosition.y },
        // Only the header moves the frame — the body is canvas for children.
        dragHandle: '.cluster-drag-handle',
        data: {
          cluster,
          selected: selectedCluster?.id === cluster.id,
          expanded: cluster.isExpanded,
          containedBeatCount: containedBeatCount,
          color: cluster.color || '#6366f1',
          onRemoveContainer: onRemoveCluster || (() => {}),
          onExpandCollapse: onClusterExpandCollapse || (() => {}),
          onDropBeatToCluster: onDropBeatToCluster,
          onClusterResize: onClusterResize,
          onClusterResizeCommit,
          onAutoLayoutCluster: onAutoLayoutCluster,
          // Map background - use ref to get current assets without triggering re-render
          mapAssetUrl: cluster.mapAssetId ? assetsRef.current.find(a => a.id === cluster.mapAssetId)?.url : undefined,
          onSetClusterMap: onSetClusterMap,
          // Cluster ambient sound
          onSetClusterSound: onSetClusterSound,
          // Cluster shared visuals
          onSetClusterSharedVisuals: onSetClusterSharedVisuals,
          // Pass a getter function for assets to avoid embedding the whole array in node data
          getAssets,
        },
        style: {
          width: Math.max(cluster.containerBounds.width || 0, MIN_CLUSTER_W),
          height: cluster.isExpanded
            ? Math.max(cluster.containerBounds.height || 0, MIN_CLUSTER_H)
            : 40,
          // The expanded frame BODY is canvas: pane gestures (pan, marquee,
          // click) pass through it. Only the header and the resize handle
          // re-enable pointer events (ClusterContainerNode). Without this, a
          // frame covering the viewport made panning and marquee impossible
          // "inside" a cluster. The collapsed pill stays fully interactive.
          ...(cluster.isExpanded ? { pointerEvents: 'none' as const } : {}),
        },
      };
    });

    // B1b v2 — make room: an expanded dialog pushes its neighbors aside
    // (right of it → right; below it → down) instead of overlapping them.
    // Visual-only: stored beat positions are untouched, so collapsing
    // restores the original layout exactly.
    const grownContainers = beatNodes.filter(n => n.type === 'dialogContainer');
    // Hard ReactFlow invariant: parents precede their children in the array.
    const allNodes = [...beatNodes, ...clusterNodes, ...clusteredChildNodes];
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

    // Make room INSIDE clusters too: an expanded dialog pushes its SIBLING
    // beats aside (same parent, parent-relative coords, same right/down
    // rule), and the frame grows VISUALLY (style only — stored bounds are
    // untouched, so collapsing the dialog restores the frame exactly).
    // Without the growth, shifted siblings would hang outside the frame.
    const grownInClusters = clusteredChildNodes.filter(
      n => n.type === 'dialogContainer' && !n.hidden
    );
    {
      const APPROX_H = 90;
      for (const g of [...grownInClusters].sort((a, b) => a.position.x - b.position.x)) {
        const parentId = (g as any).parentNode as string;
        const W = Number((g.style as any)?.width ?? 0);
        const H = Number((g.style as any)?.height ?? 0);
        const dx = Math.max(0, W - 160);
        const dy = Math.max(0, H - APPROX_H);
        const gx = g.position.x;
        const gy = g.position.y;
        let maxX = gx + W;
        let maxY = gy + H;
        for (const n of clusteredChildNodes) {
          if (n === g || (n as any).parentNode !== parentId || n.hidden) continue;
          const nx = n.position.x;
          const ny = n.position.y;
          const vOverlap = ny + APPROX_H > gy && ny < gy + H;
          const hOverlap = nx + 160 > gx && nx < gx + W;
          if (nx > gx && vOverlap) n.position = { x: nx + dx, y: ny };
          else if (ny > gy && hOverlap) n.position = { x: nx, y: ny + dy };
          maxX = Math.max(maxX, n.position.x + 160);
          maxY = Math.max(maxY, n.position.y + APPROX_H);
        }
        const frame = clusterNodes.find(c => c.id === parentId);
        if (frame?.style) {
          frame.style = {
            ...frame.style,
            width: Math.max(Number((frame.style as any).width ?? 0), maxX + 20),
            height: Math.max(Number((frame.style as any).height ?? 0), maxY + 20),
          };
        }
      }
    }
    return allNodes;
}

export function buildGraphEdges(input: GraphEdgesInput): Edge[] {
  const { beats, clusters, expandedDialogs } = input;

    const allEdges: Edge[] = [];
    const edgeIds = new Set<string>(); // Track edge IDs to prevent duplicates

    const clusterById = new Map(clusters.map(c => [c.id, c]));
    const beatById = new Map(beats.map(b => [b.id, b]));

    // The EXISTING cluster a beat belongs to (orphaned refs → null, so the
    // beat is treated as the standalone node it actually renders as).
    const getBeatCluster = (beatId: string): Cluster | null => {
      const clusterId = beatById.get(beatId)?.cluster;
      if (!clusterId || clusterId === 'undefined') return null;
      return clusterById.get(clusterId) ?? null;
    };

    // Endpoint resolution, collapse-aware: beats in an EXPANDED cluster are
    // real child nodes and keep their own id; beats in a collapsed cluster
    // resolve to the frame so their edges dock at the pill.
    const resolveNodeId = (beatId: string): string => {
      const cluster = getBeatCluster(beatId);
      if (!cluster) return beatId;
      return cluster.isExpanded ? beatId : cluster.id;
    };

    // Helper to create an edge with proper source/target resolution.
    // Returns null when both endpoints resolve to the same node (a beat
    // self-loop, or both beats inside one COLLAPSED cluster).
    const createEdge = (
      sourceId: string,
      targetId: string,
      edgeProps: Partial<Edge>
    ): Edge | null => {
      const resolvedSource = resolveNodeId(sourceId);
      const resolvedTarget = resolveNodeId(targetId);

      if (resolvedSource === resolvedTarget) {
        return null;
      }

      // Edges touching a clustered child must render above the opaque
      // cluster frame (frame z 0, children z 10; RF's default edge layer
      // sits below nodes). Callers with their own tier (dialog edges) win.
      const touchesClusteredChild =
        (resolvedSource === sourceId && !!getBeatCluster(sourceId)) ||
        (resolvedTarget === targetId && !!getBeatCluster(targetId));

      return {
        ...(touchesClusteredChild ? { zIndex: 5 } : {}),
        id: `${resolvedSource}-to-${resolvedTarget}-${edgeProps.id || ''}`,
        source: resolvedSource,
        target: resolvedTarget,
        ...edgeProps,
      } as Edge;
    };

    beats.forEach((beat) => {
      // Get beat parameters for special handling
      const params = typeof beat.getParameters === 'function' ? beat.getParameters() : {};

      // B1b — when a dialogTree is expanded AND its expansion is visible
      // (top-level, or inside an EXPANDED cluster), its outgoing edges are
      // emitted ONLY from the per-exit handles below; both legacy dialog
      // edge emitters are suppressed to avoid doubled edges. Inside a
      // COLLAPSED cluster the expansion is hidden, so the legacy emitters
      // run and dock the edges at the cluster pill as usual.
      const beatClusterHere = getBeatCluster(beat.id);
      const dialogExpandedHere =
        beat.type === 'dialogTree' && expandedDialogs.has(beat.id) &&
        (!beatClusterHere || beatClusterHere.isExpanded);
      
      // The beat's own link list (the engine's: choices, branches, exits,
      // each with its guard and role).
      const connections: any[] = typeof beat.getConnections === 'function'
        ? beat.getConnections()
        : ((beat as any).connections ?? []);

      // B1b — expanded dialogTree: outgoing edges leave from the per-exit
      // handles inside the node (sourceHandle = outline pathId), so each
      // edge visibly originates from the choice that produces it. Only for
      // unclustered beats — a beat resolved into a cluster container has no
      // such handles. Guarded exits keep the ◇ treatment on the edge.
      const expandedExits = new Set<string>();
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
          expandedExits.add(ee.exitTarget!);
          const edge = createEdge(childId(ee.sourcePath), ee.exitTarget!, {
            id: `dlgexit-${beat.id}-${ee.sourcePath}`,
            type: 'custom',
            // 21, not 20: the expanded container is OPAQUE at z 20, so an
            // exit edge on the same tier paints UNDERNEATH it — the segment
            // from the child card to the container border was invisible and
            // the exits read as missing connections (only the far tails
            // peeked out beyond the frame). Same tier as internal edges:
            // above the container, below the child cards (22).
            zIndex: 21,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            // Same weight as regular beat connections — an expanded dialog's
            // exits ARE the beat's outgoing edges, they must not thin out.
            style: { stroke: '#0ea5e9', strokeWidth: 2 },
          });
          if (edge && !edgeIds.has(edge.id)) {
            edgeIds.add(edge.id);
            allEdges.push(edge);
          }
        });
      }

      // ONE pass for every link of every beat type: the shared link walk
      // (core utils/storyLinks) says which links a beat has and of what
      // kind; graphStyle's link table says how each kind looks. This
      // function used to keep its own list of beat types with their own
      // link fields beside the walk (Condition Check, Set Timer, Pick Prop,
      // Hypertext, Dialog Tree, QR scan), and drew those links a second
      // time from the beat's link list (2026-11-26). A new beat type or
      // link field belongs in the walk, and is drawn here without a change.
      const walked = liveBeatLinks(beat, { parameters: params, connections });

      // A link found in the link list AND through its own field (a branch,
      // a choice, a prop…) is one link: the field's kind wins, one for one.
      const isListed = (l: StoryLink) => l.via === 'beat-connections';
      const absorbs = (l: StoryLink) => !isListed(l) && !STANDALONE_LINK_KINDS.has(l.via);
      const sameText = (x?: string, y?: string) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();
      const dropped = new Set<StoryLink>();
      for (const target of new Set(walked.map((l) => l.target))) {
        const own = walked.filter((l) => l.target === target && absorbs(l));
        const listed = walked.filter((l) => l.target === target && isListed(l));
        let toDrop = Math.min(own.length, listed.length);
        const byLabel = listed.filter((g) => own.some((o) => sameText(g.label, o.label) || sameText(g.label, linkStyles[o.via]?.label)));
        for (const g of [...byLabel, ...listed.filter((g) => !byLabel.includes(g)).reverse()]) {
          if (toDrop-- <= 0) break;
          dropped.add(g);
        }
      }

      const sharedLines = new Map<string, { edge: Edge; first: string; labels: Set<string> }>();

      // The guard, role and label the link list holds for a link.
      const listedFor = (l: StoryLink) => {
        const same = connections.filter((c) => c && c.targetId === l.target);
        return same.find((c) => sameText(c.label, l.label) || sameText(c.label, linkStyles[l.via]?.label)) ?? (same.length === 1 ? same[0] : undefined);
      };

      walked.forEach((link) => {
        if (dropped.has(link)) return;
        // An expanded Dialog Tree draws its exits from the choices inside it
        // (above). Its other links stay on the beat: auto-advance and
        // requirements, and an exit the expanded view has no card for (a long
        // tree is cut short there) — that link used to vanish on expanding.
        const fromExpanded = dialogExpandedHere && !STANDALONE_LINK_KINDS.has(link.via);
        if (fromExpanded && expandedExits.has(link.target)) return;

        const listed = STANDALONE_LINK_KINDS.has(link.via) ? undefined : listedFor(link);
        const guardConds = Array.isArray(listed?.condition) && listed.condition.length > 0 ? listed.condition : null;
        const guardSummary = guardConds
          ? summarizeConditions(guardConds, (id: string) => beats.find(b => b.id === id)?.name)
          : null;
        // An old-style condition on the link itself (not a list of guards).
        const legacyCondition = listed?.condition !== undefined && !guardConds ? listed.condition : undefined;
        // A restart leads back into the story with state reset.
        const kind = listed?.role === 'restart' ? 'restart' : link.via;
        const look: LinkLook = {
          ...DEFAULT_LINK_LOOK,
          ...(isListed(link) || link.via === 'choice' ? beatTypeLinkLooks[beat.type] : {}),
          ...linkStyles[kind],
          ...(legacyCondition ? LEGACY_CONDITION_LINK_LOOK : {}),
          // A restart keeps its look also when guarded.
          ...(guardConds && kind !== 'restart' ? GUARD_LINK_LOOK : {}),
        };

        let label = linkStyles[kind]?.label ?? listed?.label ?? link.label ?? (legacyCondition ? '?' : '');
        if (link.via === 'default-target') {
          const timed = DEFAULT_TARGET_TIMEOUT_TYPES.has(beat.type) && ((beat as any).defaultTargetDelay ?? 0) > 0;
          label = timed ? `after ${(beat as any).defaultTargetDelay} s` : 'default';
        } else if (link.via === 'requires') {
          const req = [...(Array.isArray((beat as any).requires) ? (beat as any).requires : []), ...(Array.isArray(params.requires) ? params.requires : [])]
            .find((r: any) => r?.fallbackTarget === link.target && r.explanation);
          if (req) label = `requires: ${String(req.explanation).slice(0, 32)}${req.explanation.length > 32 ? '…' : ''}`;
        }

        // One line per target and look: kinds without a look of their own
        // are all plain links, so two choices that lead to the same beat
        // (or a choice and a field) share a line, as they always did.
        const group = linkStyles[kind] ? kind : 'link';
        const edge = createEdge(beat.id, link.target, {
          id: `${beat.id}-${group}-${link.target}`,
          type: 'custom',
          // above the expanded dialog's opaque frame, like its other exits
          ...(fromExpanded ? { zIndex: 21 } : {}),
          animated: !!look.animated,
          label,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            ...(look.markerColor ? { color: look.markerColor } : {}),
          },
          style: {
            stroke: look.stroke,
            strokeWidth: 2,
            ...(look.dash ? { strokeDasharray: look.dash } : {}),
          },
          data: {
            via: kind,
            condition: legacyCondition,
            guardSummary,
          },
        });
        if (!edge) return;
        if (!edgeIds.has(edge.id)) {
          edgeIds.add(edge.id);
          allEdges.push(edge);
          sharedLines.set(edge.id, { edge, first: String(label ?? ''), labels: new Set([String(label ?? '').trim().toLowerCase()]) });
          return;
        }
        // Another choice (prop, exit…) that leads to the same beat: the line
        // says how many more it stands for, instead of naming only the first.
        const shared = sharedLines.get(edge.id);
        const text = String(label ?? '').trim().toLowerCase();
        if (shared && text && !shared.labels.has(text)) {
          shared.labels.add(text);
          shared.edge.label = `${shared.first} (+${shared.labels.size - 1})`;
        }
      });
    });

    return allEdges;
}
