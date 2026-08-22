/**
 * Cluster container sizing that matches how the GraphEditor actually
 * renders members: beats without a stored in-container position land on a
 * default 2-column grid (x = 20 + (i % 2) * 200, y = 20 + floor(i / 2) * 110,
 * node 160×80) inside a content area that sits below a 40px header.
 *
 * Any code that adds beats to a cluster (drop, merge, AI pipeline) should
 * grow the container to at least this size, or the members visually
 * overflow the box — the classic symptom in AI-generated stories.
 */

import { CLUSTER_HEADER_H, MIN_CLUSTER_W, MIN_CLUSTER_H } from '../components/graph/graphStyle';

const GRID_STEP_Y = 110;
const NODE_HEIGHT = 80;
const PADDING = 20;
const HEADER_HEIGHT = CLUSTER_HEADER_H;

/** Minimum sensible container — shared with the frame's clamp (graphStyle). */
export const MIN_CLUSTER_WIDTH = MIN_CLUSTER_W;
export const MIN_CLUSTER_HEIGHT = MIN_CLUSTER_H;

/**
 * The container size needed to show `memberCount` beats on the default
 * grid. Width is constant (the grid is 2 columns wide = 400px incl.
 * padding); height grows by row.
 */
export function requiredClusterSize(memberCount: number): { width: number; height: number } {
  const rows = Math.max(1, Math.ceil(memberCount / 2));
  const contentHeight = PADDING + (rows - 1) * GRID_STEP_Y + NODE_HEIGHT + PADDING;
  return {
    width: MIN_CLUSTER_WIDTH,
    height: Math.max(MIN_CLUSTER_HEIGHT, HEADER_HEIGHT + contentHeight),
  };
}

/**
 * Grow-only: keep the author's (or auto-arrange's) bounds when they are
 * already big enough, expand them when the default grid needs more room.
 */
export function grownClusterBounds(
  current: { width: number; height: number } | undefined,
  memberCount: number
): { width: number; height: number } {
  const required = requiredClusterSize(memberCount);
  return {
    width: Math.max(current?.width ?? 0, required.width),
    height: Math.max(current?.height ?? 0, required.height),
  };
}
