/**
 * Cluster drop geometry — pure helpers shared by the graph's drag/drop
 * handlers and App's re-parent/eject callbacks. Everything is in FLOW
 * coordinates; nothing here touches the DOM or ReactFlow.
 *
 * Conventions (see graphBuild.ts): a clustered beat's stored position is
 * CONTENT-relative (below the 40px header) and 20px-snapped; a top-level
 * beat's position is absolute canvas coordinates.
 */
import type { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { CLUSTER_HEADER_H, GRID_SNAP, NODE_WIDTH } from './graphStyle';

export interface Point { x: number; y: number }

export const snapToGrid = (v: number): number => Math.round(v / GRID_SNAP) * GRID_SNAP;

/** The expanded cluster whose frame contains `p`, if any. Collapsed pills are not drop zones. */
export function clusterAt(clusters: readonly Cluster[], p: Point): Cluster | undefined {
  for (const cluster of clusters) {
    if (!cluster.isExpanded) continue;
    const cx = cluster.containerPosition?.x ?? 0;
    const cy = cluster.containerPosition?.y ?? 0;
    const cw = cluster.containerBounds?.width ?? 0;
    const ch = cluster.containerBounds?.height ?? 0;
    if (cw <= 0 || ch <= 0) continue;
    if (p.x >= cx && p.x <= cx + cw && p.y >= cy && p.y <= cy + ch) return cluster;
  }
  return undefined;
}

/** Absolute canvas point → content-relative, snapped, clamped ≥ 0. */
export function toContentRelative(p: Point, cluster: Cluster): Point {
  const cx = cluster.containerPosition?.x ?? 0;
  const cy = cluster.containerPosition?.y ?? 0;
  return {
    x: Math.max(0, snapToGrid(p.x - cx)),
    y: Math.max(0, snapToGrid(p.y - cy - CLUSTER_HEADER_H)),
  };
}

/** Content-relative point → absolute canvas point. */
export function toAbsolute(content: Point, cluster: Cluster): Point {
  return {
    x: (cluster.containerPosition?.x ?? 0) + content.x,
    y: (cluster.containerPosition?.y ?? 0) + content.y + CLUSTER_HEADER_H,
  };
}

/**
 * Where a clustered beat currently sits (content-relative): its stored
 * position, else the default grid slot graphBuild renders it on — so an
 * undo restores what the author actually saw.
 */
export function containerSlotFor(
  beatId: string,
  clusterId: string,
  beats: readonly Beat[],
  containerBeatPositions: readonly ContainerBeatPosition[],
): Point {
  const stored = containerBeatPositions.find(p => p.beatId === beatId && p.clusterId === clusterId);
  if (stored) return { x: stored.position.x, y: stored.position.y };
  const idx = beats.filter(b => b.cluster === clusterId).findIndex(b => b.id === beatId);
  const i = Math.max(0, idx);
  return { x: 20 + (i % 2) * 200, y: 20 + Math.floor(i / 2) * 110 };
}

/**
 * Where the ⏏ eject button puts a beat: just right of the frame, on the
 * row it was on, so it stays visibly related to the cluster it left
 * instead of landing on whatever stale top-level coordinates it carried
 * before it joined.
 */
export function ejectPosition(cluster: Cluster, content: Point): Point {
  const cx = cluster.containerPosition?.x ?? 0;
  const cw = cluster.containerBounds?.width ?? 0;
  return {
    x: snapToGrid(cx + cw + GRID_SNAP * 2),
    y: snapToGrid(toAbsolute(content, cluster).y),
  };
}

/** Result of dropping a beat at an absolute point. */
export type BeatDropOutcome =
  /** Same cluster: just an in-container move. */
  | { kind: 'move-in-cluster'; clusterId: string; x: number; y: number }
  /** Different (or first) cluster: re-parent, land at the drop point. */
  | { kind: 'enter-cluster'; clusterId: string; x: number; y: number }
  /** Dropped outside every frame while clustered: leave the cluster. */
  | { kind: 'eject'; x: number; y: number }
  /** Top-level beat dropped on the canvas: an ordinary move. */
  | { kind: 'move-top-level'; x: number; y: number };

/**
 * Resolve a drop by the beat's TOP-LEFT corner (the hit test the graph has
 * always used, so a beat is "in" a cluster when its corner is). Cluster
 * coordinates come back content-relative; canvas ones absolute.
 */
export function resolveBeatDrop(args: {
  currentClusterId?: string;
  absolute: Point;
  clusters: readonly Cluster[];
}): BeatDropOutcome {
  const { currentClusterId, absolute, clusters } = args;
  const hit = clusterAt(clusters, absolute);
  if (hit) {
    const rel = toContentRelative(absolute, hit);
    return hit.id === currentClusterId
      ? { kind: 'move-in-cluster', clusterId: hit.id, ...rel }
      : { kind: 'enter-cluster', clusterId: hit.id, ...rel };
  }
  const snapped = { x: snapToGrid(absolute.x), y: snapToGrid(absolute.y) };
  return currentClusterId
    ? { kind: 'eject', ...snapped }
    : { kind: 'move-top-level', ...snapped };
}

/** Node width, for callers that want to hit-test by centre instead of corner. */
export const BEAT_NODE_WIDTH = NODE_WIDTH;
