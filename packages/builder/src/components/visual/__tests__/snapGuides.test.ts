import { describe, it, expect } from 'vitest';
import { computeSnap } from '../snapGuides';
import type { SnapResult, SnapLine } from '../snapGuides';

// The SNAP_THRESHOLD in the source is 5 pixels
const SNAP_THRESHOLD = 5;

describe('snapGuides - computeSnap', () => {
  const stageWidth = 1024;
  const stageHeight = 768;

  describe('no snap when elements are far apart', () => {
    it('should return the original position when no element is within threshold', () => {
      const dragged = { x: 100, y: 100, width: 50, height: 50 };
      const others = [{ x: 500, y: 500, width: 50, height: 50 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(100);
      expect(result.snappedY).toBe(100);
      expect(result.guides).toEqual([]);
    });

    it('should not snap when distance is exactly at threshold', () => {
      // dragLeft = 100, otherLeft = 105 => dist = 5, which is NOT < 5
      const dragged = { x: 100, y: 100, width: 50, height: 50 };
      const others = [{ x: 105, y: 200, width: 50, height: 50 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // dist = |100 - 105| = 5, which is not strictly less than 5, so no snap
      expect(result.snappedX).toBe(100);
    });

    it('should snap when distance is just under threshold', () => {
      // dragLeft = 100, otherLeft = 104 => dist = 4
      const dragged = { x: 100, y: 100, width: 50, height: 50 };
      const others = [{ x: 104, y: 200, width: 50, height: 50 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // dist = |100 - 104| = 4 < 5 => snaps left edge to 104
      expect(result.snappedX).toBe(104);
    });
  });

  describe('snaps to left edge of another element', () => {
    it('should snap dragged left edge to another left edge', () => {
      const dragged = { x: 198, y: 100, width: 50, height: 50 };
      const others = [{ x: 200, y: 300, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // dragLeft = 198, otherLeft = 200 => dist = 2 => snap
      expect(result.snappedX).toBe(200);
    });

    it('should snap dragged right edge to another left edge', () => {
      const dragged = { x: 147, y: 100, width: 50, height: 50 };
      const others = [{ x: 200, y: 300, width: 80, height: 80 }];

      // dragRight = 147 + 50 = 197, otherLeft = 200 => dist = 3
      // offset = 200 - 197 = 3
      // snappedX = 147 + 3 = 150
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(150);
    });

    it('should snap dragged right edge to another right edge', () => {
      const dragged = { x: 228, y: 100, width: 50, height: 50 };
      const others = [{ x: 200, y: 300, width: 80, height: 80 }];

      // dragRight = 278, otherRight = 280 => dist = 2
      // offset = 280 - 278 = 2
      // snappedX = 228 + 2 = 230
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(230);
    });
  });

  describe('snaps to stage center', () => {
    it('should snap horizontally to stage center', () => {
      // stageWidth/2 = 512
      // dragCenterX = x + width/2 = 509 + 50/2 = 534? Let's compute:
      // We want dragCenterX close to 512
      // dragCenterX = x + 25, so x = 487 => dragCenterX = 512 exactly
      // Use x = 489 => dragCenterX = 514, dist = 2
      const dragged = { x: 489, y: 100, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      // dragCenterX = 489 + 25 = 514
      // stageCenter = 512
      // offset = 512 - 514 = -2
      // snappedX = 489 + (-2) = 487
      expect(result.snappedX).toBe(487);
      expect(result.guides.some(g =>
        g.orientation === 'vertical' && g.type === 'stage-center' && g.position === 512
      )).toBe(true);
    });

    it('should snap vertically to stage center', () => {
      // stageHeight/2 = 384
      // dragCenterY = y + height/2
      // Use y = 357 => dragCenterY = 357 + 25 = 382, dist = 2
      const dragged = { x: 100, y: 357, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      // offset = 384 - 382 = 2
      // snappedY = 357 + 2 = 359
      expect(result.snappedY).toBe(359);
      expect(result.guides.some(g =>
        g.orientation === 'horizontal' && g.type === 'stage-center' && g.position === 384
      )).toBe(true);
    });

    it('should snap both axes to stage center simultaneously', () => {
      // dragCenterX near 512, dragCenterY near 384
      const dragged = { x: 489, y: 357, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      expect(result.snappedX).toBe(487);
      expect(result.snappedY).toBe(359);
      expect(result.guides).toHaveLength(2);
    });
  });

  describe('snaps to center alignment with another element', () => {
    it('should snap center-to-center horizontally', () => {
      const other = { x: 200, y: 300, width: 100, height: 80 };
      // otherCenterX = 200 + 50 = 250
      // We want dragCenterX close to 250
      // dragCenterX = x + 30 => use x = 218 => dragCenterX = 248, dist = 2
      const dragged = { x: 218, y: 100, width: 60, height: 60 };

      const result = computeSnap(dragged, [other], stageWidth, stageHeight);

      // offset = 250 - 248 = 2
      // snappedX = 218 + 2 = 220
      expect(result.snappedX).toBe(220);
      expect(result.guides.some(g =>
        g.orientation === 'vertical' && g.type === 'center' && g.position === 250
      )).toBe(true);
    });

    it('should snap center-to-center vertically', () => {
      const other = { x: 300, y: 200, width: 80, height: 100 };
      // otherCenterY = 200 + 50 = 250
      // dragCenterY = y + 30 => use y = 218 => dragCenterY = 248, dist = 2
      const dragged = { x: 100, y: 218, width: 60, height: 60 };

      const result = computeSnap(dragged, [other], stageWidth, stageHeight);

      // offset = 250 - 248 = 2
      // snappedY = 218 + 2 = 220
      expect(result.snappedY).toBe(220);
      expect(result.guides.some(g =>
        g.orientation === 'horizontal' && g.type === 'center' && g.position === 250
      )).toBe(true);
    });
  });

  describe('guide line orientation and type', () => {
    it('should return vertical guide for x-axis snaps', () => {
      // Snap to left edge of another element
      const dragged = { x: 198, y: 100, width: 50, height: 50 };
      const others = [{ x: 200, y: 300, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      const xGuide = result.guides.find(g => g.orientation === 'vertical');
      expect(xGuide).toBeDefined();
      expect(xGuide!.position).toBe(200);
      expect(xGuide!.type).toBe('edge');
    });

    it('should return horizontal guide for y-axis snaps', () => {
      const dragged = { x: 100, y: 298, width: 50, height: 50 };
      const others = [{ x: 300, y: 300, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      const yGuide = result.guides.find(g => g.orientation === 'horizontal');
      expect(yGuide).toBeDefined();
      expect(yGuide!.position).toBe(300);
      expect(yGuide!.type).toBe('edge');
    });

    it('should return stage-center type for stage center snaps', () => {
      const dragged = { x: 489, y: 357, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      expect(result.guides).toHaveLength(2);
      expect(result.guides.every(g => g.type === 'stage-center')).toBe(true);
    });

    it('should return center type for center-to-center snaps', () => {
      const other = { x: 200, y: 200, width: 100, height: 100 };
      // otherCenterX = 250, otherCenterY = 250
      // dragCenterX = x + 25, want near 250 => x = 223, centerX = 248
      // dragCenterY = y + 25, want near 250 => y = 223, centerY = 248
      const dragged = { x: 223, y: 223, width: 50, height: 50 };

      const result = computeSnap(dragged, [other], stageWidth, stageHeight);

      const centerGuides = result.guides.filter(g => g.type === 'center');
      expect(centerGuides.length).toBe(2);
    });
  });

  describe('multiple candidates - picks closest snap', () => {
    it('should pick the closer snap when two elements compete', () => {
      // Element A has left edge at 200, element B has left edge at 103
      // Dragged left = 100
      // Dist to A = |100 - 200| = 100 (too far)
      // Dist to B left = |100 - 103| = 3 (within threshold)
      const dragged = { x: 100, y: 100, width: 50, height: 50 };
      const others = [
        { x: 200, y: 300, width: 80, height: 80 },
        { x: 103, y: 400, width: 60, height: 60 },
      ];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(103);
    });

    it('should prefer closer snap over farther one both within threshold', () => {
      // Two possible snaps for x-axis, both within threshold
      // Dragged left = 100
      // otherA left = 102 => dist = 2
      // otherB left = 104 => dist = 4
      const dragged = { x: 100, y: 500, width: 50, height: 50 };
      const others = [
        { x: 104, y: 300, width: 80, height: 80 },
        { x: 102, y: 400, width: 60, height: 60 },
      ];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // Should snap to 102 (closer)
      expect(result.snappedX).toBe(102);
    });

    it('should prefer element edge snap over stage center if closer', () => {
      // stageCenter = 512
      // Put dragged center near 512 but with an edge snap even closer
      // dragCenterX = x + 25 => x = 485 => centerX = 510, dist to 512 = 2
      // place other at left = 484, dist from dragLeft(485) = 1
      const dragged = { x: 485, y: 100, width: 50, height: 50 };
      const others = [{ x: 484, y: 300, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // edge snap: dragLeft=485 to otherLeft=484, dist=1 => snappedX = 484
      // stage center: dragCenter=510 to 512, dist=2
      // edge is closer
      expect(result.snappedX).toBe(484);
      const xGuide = result.guides.find(g => g.orientation === 'vertical');
      expect(xGuide!.type).toBe('edge');
    });

    it('should prefer stage center snap over element edge if closer', () => {
      // stageCenter = 512
      // dragCenterX = x + 25
      // x = 486 => centerX = 511, dist to 512 = 1
      // other left = 490, dist from dragLeft(486) = 4
      const dragged = { x: 486, y: 100, width: 50, height: 50 };
      const others = [{ x: 490, y: 300, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      // stage center: dragCenter=511 to 512, dist=1
      // edge snap: dragLeft=486 to otherLeft=490, dist=4
      // stage center is closer
      // offset = 512 - 511 = 1 => snappedX = 486 + 1 = 487
      expect(result.snappedX).toBe(487);
      const xGuide = result.guides.find(g => g.orientation === 'vertical');
      expect(xGuide!.type).toBe('stage-center');
    });
  });

  describe('empty otherRects array', () => {
    it('should only produce stage center snaps when no other elements exist', () => {
      // Near stage center
      const dragged = { x: 489, y: 357, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      expect(result.guides.every(g => g.type === 'stage-center')).toBe(true);
    });

    it('should return no guides when dragged is far from stage center', () => {
      const dragged = { x: 50, y: 50, width: 50, height: 50 };

      const result = computeSnap(dragged, [], stageWidth, stageHeight);

      expect(result.snappedX).toBe(50);
      expect(result.snappedY).toBe(50);
      expect(result.guides).toEqual([]);
    });
  });

  describe('snap to various edge combinations', () => {
    it('should snap dragged top edge to another top edge', () => {
      const dragged = { x: 100, y: 198, width: 50, height: 50 };
      const others = [{ x: 300, y: 200, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedY).toBe(200);
    });

    it('should snap dragged top edge to another bottom edge', () => {
      const dragged = { x: 100, y: 278, width: 50, height: 50 };
      const others = [{ x: 300, y: 200, width: 80, height: 80 }];

      // dragTop = 278, otherBottom = 280 => dist = 2
      // offset = 280 - 278 = 2
      // snappedY = 278 + 2 = 280
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedY).toBe(280);
    });

    it('should snap dragged bottom edge to another top edge', () => {
      const dragged = { x: 100, y: 148, width: 50, height: 50 };
      const others = [{ x: 300, y: 200, width: 80, height: 80 }];

      // dragBottom = 198, otherTop = 200 => dist = 2
      // offset = 200 - 198 = 2
      // snappedY = 148 + 2 = 150
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedY).toBe(150);
    });

    it('should snap dragged bottom edge to another bottom edge', () => {
      const dragged = { x: 100, y: 228, width: 50, height: 50 };
      const others = [{ x: 300, y: 200, width: 80, height: 80 }];

      // dragBottom = 278, otherBottom = 280 => dist = 2
      // offset = 280 - 278 = 2
      // snappedY = 228 + 2 = 230
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedY).toBe(230);
    });

    it('should snap dragged left edge to another right edge', () => {
      const dragged = { x: 278, y: 100, width: 50, height: 50 };
      const others = [{ x: 200, y: 300, width: 80, height: 80 }];

      // dragLeft = 278, otherRight = 280 => dist = 2
      // offset = 280 - 278 = 2
      // snappedX = 278 + 2 = 280
      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(280);
    });
  });

  describe('independent x and y snapping', () => {
    it('should snap x and y independently to different elements', () => {
      const dragged = { x: 198, y: 398, width: 50, height: 50 };
      const others = [
        { x: 200, y: 600, width: 80, height: 80 },  // left edge match for x
        { x: 500, y: 400, width: 80, height: 80 },  // top edge match for y
      ];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(200); // snapped to first element's left
      expect(result.snappedY).toBe(400); // snapped to second element's top
      expect(result.guides).toHaveLength(2);
    });

    it('should snap x to element and y to stage center', () => {
      // stageHeight / 2 = 384
      // dragCenterY = y + 25, want near 384 => y = 357, centerY = 382, dist = 2
      const dragged = { x: 198, y: 357, width: 50, height: 50 };
      const others = [{ x: 200, y: 600, width: 80, height: 80 }];

      const result = computeSnap(dragged, others, stageWidth, stageHeight);

      expect(result.snappedX).toBe(200);
      expect(result.snappedY).toBe(359); // 357 + 2

      const xGuide = result.guides.find(g => g.orientation === 'vertical');
      const yGuide = result.guides.find(g => g.orientation === 'horizontal');
      expect(xGuide!.type).toBe('edge');
      expect(yGuide!.type).toBe('stage-center');
    });
  });
});
