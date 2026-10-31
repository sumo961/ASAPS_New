import { describe, it, expect } from 'vitest';
import { pictureStart, resizePicture } from '../pictureResize';

const natural = { w: 400, h: 200 };

describe('resizing a picture on the stage', () => {
  it('a plain drag scales the picture and keeps its proportions', () => {
    const start = pictureStart({ x: 10, y: 20, width: 400, height: 200, imageFit: 'scale' }, natural);
    const r = resizePicture(start, 'se', 200, 10, false);
    expect(r).toMatchObject({ x: 10, y: 20, width: 600, height: 300, imageFit: 'scale' });
  });

  it('keeps the opposite corner in place when dragging the top-left corner', () => {
    const start = pictureStart({ x: 100, y: 100, width: 400, height: 200, imageFit: 'scale' }, natural);
    const r = resizePicture(start, 'nw', 200, 0, false);
    expect(r.x + r.width).toBeCloseTo(500);
    expect(r.y + r.height).toBeCloseTo(300);
    expect(r.width / r.height).toBeCloseTo(2);
  });

  it('Option/Alt crops: the picture stays where it is on the stage', () => {
    const start = pictureStart({ x: 0, y: 0, width: 400, height: 200, imageFit: 'scale' }, natural);
    const r = resizePicture(start, 'se', -100, 0, true);
    expect(r).toMatchObject({ x: 0, y: 0, width: 300, height: 200, imageFit: 'crop' });
    // 400 px of picture in a 300 px box, starting at its left edge.
    expect(r.imageFrame).toEqual({ x: 0, y: 0, w: 400 / 300, h: 1 });
    const left = resizePicture(start, 'nw', 100, 0, true);
    expect(left.x).toBe(100);
    expect(left.imageFrame!.x * left.width).toBeCloseTo(-100);
  });

  it('a cropped picture keeps its crop when scaled', () => {
    const frame = { x: -0.25, y: 0, w: 1.5, h: 1 };
    const start = pictureStart({ x: 0, y: 0, width: 200, height: 100, imageFit: 'crop', imageFrame: frame }, natural);
    const r = resizePicture(start, 'se', 200, 0, false);
    expect(r).toMatchObject({ width: 400, height: 200, imageFit: 'crop', imageFrame: frame });
  });

  it('starts from where an older picture is drawn, so it does not jump', () => {
    // A size % draws the picture at natural size × size from the top-left.
    expect(pictureStart({ x: 5, y: 5, width: 100, height: 100, size: 50 }, natural).box)
      .toEqual({ x: 5, y: 5, w: 200, h: 100 });
    // Without one, it sits at natural size in the middle of its box, cut off.
    const old = pictureStart({ x: 0, y: 0, width: 200, height: 200 }, natural);
    expect(old.frame).toEqual({ x: -0.5, y: 0, w: 2, h: 1 });
    // Scaling that keeps the old crop.
    expect(resizePicture(old, 'se', 200, 200, false)).toMatchObject({ width: 400, height: 400, imageFit: 'crop' });
  });

  it('never shrinks below the minimum', () => {
    const start = pictureStart({ x: 0, y: 0, width: 400, height: 200, imageFit: 'scale' }, natural);
    const r = resizePicture(start, 'se', -1000, -1000, false);
    expect(Math.min(r.width, r.height)).toBeCloseTo(20);
  });
});
