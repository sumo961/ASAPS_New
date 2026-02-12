/**
 * Snap guides utility for the visual editor.
 * Computes snapping positions and guide lines when dragging elements.
 */

export interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  type: 'edge' | 'center' | 'stage-center';
}

export interface SnapResult {
  snappedX: number;
  snappedY: number;
  guides: SnapLine[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SnapCandidate {
  offset: number;
  dist: number;
  guide: SnapLine;
}

const SNAP_THRESHOLD = 5;

function trySnap(
  current: SnapCandidate | null,
  dragRef: number,
  targetPos: number,
  orientation: 'horizontal' | 'vertical',
  type: SnapLine['type']
): SnapCandidate | null {
  const dist = Math.abs(dragRef - targetPos);
  if (dist < SNAP_THRESHOLD && (!current || dist < current.dist)) {
    return {
      offset: targetPos - dragRef,
      dist,
      guide: { orientation, position: targetPos, type },
    };
  }
  return current;
}

export function computeSnap(
  draggedRect: Rect,
  otherRects: Rect[],
  stageWidth: number,
  stageHeight: number
): SnapResult {
  const guides: SnapLine[] = [];
  let bestX: SnapCandidate | null = null;
  let bestY: SnapCandidate | null = null;

  // Dragged element reference points
  const dragLeft = draggedRect.x;
  const dragRight = draggedRect.x + draggedRect.width;
  const dragCenterX = draggedRect.x + draggedRect.width / 2;
  const dragTop = draggedRect.y;
  const dragBottom = draggedRect.y + draggedRect.height;
  const dragCenterY = draggedRect.y + draggedRect.height / 2;

  // Snap to stage center
  bestX = trySnap(bestX, dragCenterX, stageWidth / 2, 'vertical', 'stage-center');
  bestY = trySnap(bestY, dragCenterY, stageHeight / 2, 'horizontal', 'stage-center');

  // Snap to other elements
  for (const rect of otherRects) {
    const otherLeft = rect.x;
    const otherRight = rect.x + rect.width;
    const otherCenterX = rect.x + rect.width / 2;
    const otherTop = rect.y;
    const otherBottom = rect.y + rect.height;
    const otherCenterY = rect.y + rect.height / 2;

    // Vertical snap lines (X-axis alignment)
    bestX = trySnap(bestX, dragLeft, otherLeft, 'vertical', 'edge');
    bestX = trySnap(bestX, dragLeft, otherRight, 'vertical', 'edge');
    bestX = trySnap(bestX, dragRight, otherLeft, 'vertical', 'edge');
    bestX = trySnap(bestX, dragRight, otherRight, 'vertical', 'edge');
    bestX = trySnap(bestX, dragCenterX, otherCenterX, 'vertical', 'center');

    // Horizontal snap lines (Y-axis alignment)
    bestY = trySnap(bestY, dragTop, otherTop, 'horizontal', 'edge');
    bestY = trySnap(bestY, dragTop, otherBottom, 'horizontal', 'edge');
    bestY = trySnap(bestY, dragBottom, otherTop, 'horizontal', 'edge');
    bestY = trySnap(bestY, dragBottom, otherBottom, 'horizontal', 'edge');
    bestY = trySnap(bestY, dragCenterY, otherCenterY, 'horizontal', 'center');
  }

  const snappedX = draggedRect.x + (bestX?.offset ?? 0);
  const snappedY = draggedRect.y + (bestY?.offset ?? 0);

  if (bestX) guides.push(bestX.guide);
  if (bestY) guides.push(bestY.guide);

  return { snappedX, snappedY, guides };
}
