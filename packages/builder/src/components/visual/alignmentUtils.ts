/**
 * Alignment and distribution utilities for the visual editor.
 * Pure functions operating on element rects.
 */

interface ElementRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type PositionUpdate = { id: string; x: number; y: number };

export function alignLeft(rects: ElementRect[]): PositionUpdate[] {
  const minX = Math.min(...rects.map(r => r.x));
  return rects.map(r => ({ id: r.id, x: minX, y: r.y }));
}

export function alignRight(rects: ElementRect[]): PositionUpdate[] {
  const maxRight = Math.max(...rects.map(r => r.x + r.width));
  return rects.map(r => ({ id: r.id, x: maxRight - r.width, y: r.y }));
}

export function alignTop(rects: ElementRect[]): PositionUpdate[] {
  const minY = Math.min(...rects.map(r => r.y));
  return rects.map(r => ({ id: r.id, x: r.x, y: minY }));
}

export function alignBottom(rects: ElementRect[]): PositionUpdate[] {
  const maxBottom = Math.max(...rects.map(r => r.y + r.height));
  return rects.map(r => ({ id: r.id, x: r.x, y: maxBottom - r.height }));
}

export function alignCenterH(rects: ElementRect[]): PositionUpdate[] {
  const avgCenterX = rects.reduce((sum, r) => sum + r.x + r.width / 2, 0) / rects.length;
  return rects.map(r => ({ id: r.id, x: avgCenterX - r.width / 2, y: r.y }));
}

export function alignCenterV(rects: ElementRect[]): PositionUpdate[] {
  const avgCenterY = rects.reduce((sum, r) => sum + r.y + r.height / 2, 0) / rects.length;
  return rects.map(r => ({ id: r.id, x: r.x, y: avgCenterY - r.height / 2 }));
}

export function distributeH(rects: ElementRect[]): PositionUpdate[] {
  if (rects.length < 3) return rects.map(r => ({ id: r.id, x: r.x, y: r.y }));

  const sorted = [...rects].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpan = (last.x + last.width) - first.x;
  const totalElementWidth = sorted.reduce((sum, r) => sum + r.width, 0);
  const gap = (totalSpan - totalElementWidth) / (sorted.length - 1);

  let currentX = first.x;
  return sorted.map(r => {
    const update = { id: r.id, x: currentX, y: r.y };
    currentX += r.width + gap;
    return update;
  });
}

export function distributeV(rects: ElementRect[]): PositionUpdate[] {
  if (rects.length < 3) return rects.map(r => ({ id: r.id, x: r.x, y: r.y }));

  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpan = (last.y + last.height) - first.y;
  const totalElementHeight = sorted.reduce((sum, r) => sum + r.height, 0);
  const gap = (totalSpan - totalElementHeight) / (sorted.length - 1);

  let currentY = first.y;
  return sorted.map(r => {
    const update = { id: r.id, x: r.x, y: currentY };
    currentY += r.height + gap;
    return update;
  });
}
