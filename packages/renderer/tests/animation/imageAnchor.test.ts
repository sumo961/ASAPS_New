import { describe, it, expect } from 'vitest';
import { resolveWaypoint, calculatePositionAtTime } from '../../src/animation/PathInterpolator';
import { imageAnchorRectPx, imageRectPx } from '../../src/components/SpatialFlowView';
import type { AnimationWaypoint } from '@asaps/core';

const wp = (over: Partial<AnimationWaypoint>): AnimationWaypoint => ({
  x: 0, y: 0, duration: 1000, ...over,
});

describe('image-anchored animation resolution (decision C)', () => {
  it('resolveWaypoint applies box offsets to percent coords only', () => {
    const box = { width: 200, height: 100, offsetX: -50, offsetY: 10 };
    const percent = resolveWaypoint(wp({ xPercent: 50, yPercent: 100 }), box);
    expect(percent.x).toBe(50);   // 50% of 200 = 100, -50 offset
    expect(percent.y).toBe(110);  // 100% of 100 = 100, +10 offset
    // Pixel fallback (legacy fixed-mode data) must NOT ride the offset.
    const pixel = resolveWaypoint(wp({ x: 40, y: 40 }), box);
    expect(pixel.x).toBe(40);
    expect(pixel.y).toBe(40);
  });

  it('imageAnchorRectPx equals imageRectPx under contain', () => {
    // Wide image (2:1) in a square box: letterboxed top/bottom.
    expect(imageAnchorRectPx(2, 400, 400, 'contain'))
      .toEqual(imageRectPx(2, 400, 400, 'contain'));
  });

  it('imageAnchorRectPx returns the TRUE oversize rect under cover', () => {
    // 4:3 image cover-filling a 9:16 portrait box (300×533):
    // image height = box height, width = 533*(4/3) ≈ 711 → ~45% cropped.
    const R = imageAnchorRectPx(4 / 3, 300, 533, 'cover');
    expect(R.height).toBe(533);
    expect(R.width).toBeCloseTo(533 * (4 / 3), 5);
    expect(R.x).toBeCloseTo((300 - 533 * (4 / 3)) / 2, 5); // negative
    expect(R.x).toBeLessThan(0);
    expect(R.y).toBe(0);
    // imageRectPx would have approximated this as the container.
    expect(imageRectPx(4 / 3, 300, 533, 'cover')).toEqual({ x: 0, y: 0, width: 300, height: 533 });
  });

  it('the door stays the door: same waypoint, cover crop, image box vs stage box', () => {
    // The door sits at 90% across the image. Portrait phone cover-crops a
    // 4:3 image: stage-box resolution aims at 90% of the *cropped* box;
    // image-box resolution lands on the actual image feature.
    const waypoints = [
      wp({ xPercent: 10, yPercent: 80 }),
      wp({ xPercent: 90, yPercent: 80, duration: 1000 }),
    ];
    const stageBox = { width: 300, height: 533 };
    const R = imageAnchorRectPx(4 / 3, 300, 533, 'cover');
    const imageBox = { width: R.width, height: R.height, offsetX: R.x, offsetY: R.y };

    const atEndStage = calculatePositionAtTime(waypoints, 1000, 'linear', stageBox)!;
    const atEndImage = calculatePositionAtTime(waypoints, 1000, 'linear', imageBox)!;

    expect(atEndStage.x).toBeCloseTo(270, 3); // 90% of the visible box
    // 90% of the true image, shifted by the crop: 0.9*710.67 - 205.33 ≈ 434
    expect(atEndImage.x).toBeCloseTo(0.9 * R.width + R.x, 3);
    expect(atEndImage.x).toBeGreaterThan(stageBox.width); // door is offscreen right — faithful
  });
});
