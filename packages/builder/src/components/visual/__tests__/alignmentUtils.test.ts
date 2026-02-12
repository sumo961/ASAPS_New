import { describe, it, expect } from 'vitest';
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  alignCenterH,
  alignCenterV,
  distributeH,
  distributeV,
} from '../alignmentUtils';

// Helper to create element rects
function rect(id: string, x: number, y: number, width: number, height: number) {
  return { id, x, y, width, height };
}

describe('alignmentUtils', () => {
  describe('alignLeft', () => {
    it('should align all elements to the leftmost x position', () => {
      const rects = [
        rect('a', 100, 50, 80, 40),
        rect('b', 200, 100, 60, 30),
        rect('c', 50, 200, 100, 50),
      ];
      const result = alignLeft(rects);

      expect(result).toEqual([
        { id: 'a', x: 50, y: 50 },
        { id: 'b', x: 50, y: 100 },
        { id: 'c', x: 50, y: 200 },
      ]);
    });

    it('should preserve y positions', () => {
      const rects = [
        rect('a', 300, 10, 80, 40),
        rect('b', 100, 500, 60, 30),
      ];
      const result = alignLeft(rects);

      expect(result[0].y).toBe(10);
      expect(result[1].y).toBe(500);
    });

    it('should handle a single element (returns it unchanged)', () => {
      const rects = [rect('a', 150, 75, 80, 40)];
      const result = alignLeft(rects);

      expect(result).toEqual([{ id: 'a', x: 150, y: 75 }]);
    });
  });

  describe('alignRight', () => {
    it('should align all right edges to the rightmost right edge', () => {
      const rects = [
        rect('a', 100, 50, 80, 40),   // right edge = 180
        rect('b', 200, 100, 60, 30),   // right edge = 260
        rect('c', 50, 200, 100, 50),   // right edge = 150
      ];
      const result = alignRight(rects);
      // maxRight = 260

      expect(result).toEqual([
        { id: 'a', x: 180, y: 50 },   // 260 - 80 = 180
        { id: 'b', x: 200, y: 100 },  // 260 - 60 = 200 (unchanged - already rightmost)
        { id: 'c', x: 160, y: 200 },  // 260 - 100 = 160
      ]);
    });

    it('should preserve y positions', () => {
      const rects = [
        rect('a', 10, 42, 50, 30),
        rect('b', 200, 99, 100, 30),
      ];
      const result = alignRight(rects);

      expect(result[0].y).toBe(42);
      expect(result[1].y).toBe(99);
    });

    it('should account for varying element widths', () => {
      const rects = [
        rect('a', 0, 0, 200, 40),  // right edge = 200
        rect('b', 0, 50, 50, 40),  // right edge = 50
      ];
      const result = alignRight(rects);
      // maxRight = 200

      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },    // 200 - 200 = 0
        { id: 'b', x: 150, y: 50 }, // 200 - 50 = 150
      ]);
    });
  });

  describe('alignTop', () => {
    it('should align all elements to the topmost y position', () => {
      const rects = [
        rect('a', 100, 200, 80, 40),
        rect('b', 200, 50, 60, 30),
        rect('c', 50, 150, 100, 50),
      ];
      const result = alignTop(rects);

      expect(result).toEqual([
        { id: 'a', x: 100, y: 50 },
        { id: 'b', x: 200, y: 50 },
        { id: 'c', x: 50, y: 50 },
      ]);
    });

    it('should preserve x positions', () => {
      const rects = [
        rect('a', 37, 200, 80, 40),
        rect('b', 999, 50, 60, 30),
      ];
      const result = alignTop(rects);

      expect(result[0].x).toBe(37);
      expect(result[1].x).toBe(999);
    });
  });

  describe('alignBottom', () => {
    it('should align all bottom edges to the bottommost bottom edge', () => {
      const rects = [
        rect('a', 100, 50, 80, 40),   // bottom = 90
        rect('b', 200, 100, 60, 30),  // bottom = 130
        rect('c', 50, 200, 100, 50),  // bottom = 250
      ];
      const result = alignBottom(rects);
      // maxBottom = 250

      expect(result).toEqual([
        { id: 'a', x: 100, y: 210 },  // 250 - 40 = 210
        { id: 'b', x: 200, y: 220 },  // 250 - 30 = 220
        { id: 'c', x: 50, y: 200 },   // 250 - 50 = 200 (unchanged)
      ]);
    });

    it('should preserve x positions', () => {
      const rects = [
        rect('a', 11, 50, 80, 40),
        rect('b', 222, 100, 60, 100),
      ];
      const result = alignBottom(rects);

      expect(result[0].x).toBe(11);
      expect(result[1].x).toBe(222);
    });
  });

  describe('alignCenterH', () => {
    it('should center all elements horizontally at the average center x', () => {
      const rects = [
        rect('a', 0, 10, 100, 40),   // center x = 50
        rect('b', 200, 20, 100, 40), // center x = 250
      ];
      // Average center x = (50 + 250) / 2 = 150
      const result = alignCenterH(rects);

      expect(result).toEqual([
        { id: 'a', x: 100, y: 10 },  // 150 - 100/2 = 100
        { id: 'b', x: 100, y: 20 },  // 150 - 100/2 = 100
      ]);
    });

    it('should handle elements with different widths', () => {
      const rects = [
        rect('a', 0, 0, 200, 40),   // center x = 100
        rect('b', 100, 0, 50, 40),  // center x = 125
        rect('c', 300, 0, 100, 40), // center x = 350
      ];
      // Average center x = (100 + 125 + 350) / 3 = 191.666...
      const result = alignCenterH(rects);
      const avgCenter = (100 + 125 + 350) / 3;

      expect(result[0].x).toBeCloseTo(avgCenter - 200 / 2, 5);
      expect(result[1].x).toBeCloseTo(avgCenter - 50 / 2, 5);
      expect(result[2].x).toBeCloseTo(avgCenter - 100 / 2, 5);
    });

    it('should preserve y positions', () => {
      const rects = [
        rect('a', 0, 77, 100, 40),
        rect('b', 200, 300, 100, 40),
      ];
      const result = alignCenterH(rects);

      expect(result[0].y).toBe(77);
      expect(result[1].y).toBe(300);
    });
  });

  describe('alignCenterV', () => {
    it('should center all elements vertically at the average center y', () => {
      const rects = [
        rect('a', 10, 0, 40, 100),   // center y = 50
        rect('b', 20, 200, 40, 100), // center y = 250
      ];
      // Average center y = (50 + 250) / 2 = 150
      const result = alignCenterV(rects);

      expect(result).toEqual([
        { id: 'a', x: 10, y: 100 },  // 150 - 100/2 = 100
        { id: 'b', x: 20, y: 100 },  // 150 - 100/2 = 100
      ]);
    });

    it('should handle elements with different heights', () => {
      const rects = [
        rect('a', 0, 0, 40, 200),   // center y = 100
        rect('b', 0, 100, 40, 50),  // center y = 125
        rect('c', 0, 300, 40, 100), // center y = 350
      ];
      // Average center y = (100 + 125 + 350) / 3 = 191.666...
      const result = alignCenterV(rects);
      const avgCenter = (100 + 125 + 350) / 3;

      expect(result[0].y).toBeCloseTo(avgCenter - 200 / 2, 5);
      expect(result[1].y).toBeCloseTo(avgCenter - 50 / 2, 5);
      expect(result[2].y).toBeCloseTo(avgCenter - 100 / 2, 5);
    });

    it('should preserve x positions', () => {
      const rects = [
        rect('a', 42, 0, 40, 100),
        rect('b', 500, 200, 40, 100),
      ];
      const result = alignCenterV(rects);

      expect(result[0].x).toBe(42);
      expect(result[1].x).toBe(500);
    });
  });

  describe('distributeH', () => {
    it('should evenly distribute 3+ elements horizontally', () => {
      // First and last by x position stay in place; middle elements are evenly spaced
      const rects = [
        rect('a', 0, 0, 50, 40),
        rect('b', 100, 0, 50, 40),  // Middle - should be repositioned
        rect('c', 300, 0, 50, 40),
      ];
      // sorted by x: a(0), b(100), c(300)
      // totalSpan = (300 + 50) - 0 = 350
      // totalElementWidth = 50 + 50 + 50 = 150
      // gap = (350 - 150) / 2 = 100
      // a.x = 0, b.x = 0 + 50 + 100 = 150, c.x = 150 + 50 + 100 = 300

      const result = distributeH(rects);

      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 150, y: 0 },
        { id: 'c', x: 300, y: 0 },
      ]);
    });

    it('should keep first and last elements in place', () => {
      const rects = [
        rect('left', 10, 0, 40, 30),
        rect('mid1', 80, 0, 40, 30),
        rect('mid2', 200, 0, 40, 30),
        rect('right', 400, 0, 40, 30),
      ];
      // sorted by x: left(10), mid1(80), mid2(200), right(400)
      // totalSpan = (400 + 40) - 10 = 430
      // totalElementWidth = 4 * 40 = 160
      // gap = (430 - 160) / 3 = 90
      // left.x = 10
      // mid1.x = 10 + 40 + 90 = 140
      // mid2.x = 140 + 40 + 90 = 270
      // right.x = 270 + 40 + 90 = 400

      const result = distributeH(rects);

      expect(result[0]).toEqual({ id: 'left', x: 10, y: 0 });
      expect(result[3]).toEqual({ id: 'right', x: 400, y: 0 });
    });

    it('should handle elements with different widths', () => {
      const rects = [
        rect('a', 0, 0, 100, 40),
        rect('b', 200, 0, 50, 40),
        rect('c', 400, 0, 200, 40),
      ];
      // sorted by x: a(0,w=100), b(200,w=50), c(400,w=200)
      // totalSpan = (400 + 200) - 0 = 600
      // totalElementWidth = 100 + 50 + 200 = 350
      // gap = (600 - 350) / 2 = 125
      // a.x = 0
      // b.x = 0 + 100 + 125 = 225
      // c.x = 225 + 50 + 125 = 400

      const result = distributeH(rects);

      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 225, y: 0 },
        { id: 'c', x: 400, y: 0 },
      ]);
    });

    it('should return unchanged positions for 2 elements', () => {
      const rects = [
        rect('a', 50, 10, 80, 40),
        rect('b', 200, 20, 60, 30),
      ];
      const result = distributeH(rects);

      expect(result).toEqual([
        { id: 'a', x: 50, y: 10 },
        { id: 'b', x: 200, y: 20 },
      ]);
    });

    it('should return unchanged position for 1 element', () => {
      const rects = [rect('a', 50, 10, 80, 40)];
      const result = distributeH(rects);

      expect(result).toEqual([{ id: 'a', x: 50, y: 10 }]);
    });

    it('should preserve y positions for all elements', () => {
      const rects = [
        rect('a', 0, 100, 50, 40),
        rect('b', 100, 200, 50, 40),
        rect('c', 300, 300, 50, 40),
      ];
      const result = distributeH(rects);

      expect(result[0].y).toBe(100);
      expect(result[1].y).toBe(200);
      expect(result[2].y).toBe(300);
    });

    it('should sort elements by x position before distributing', () => {
      // Provide elements out of order
      const rects = [
        rect('c', 300, 0, 50, 40),
        rect('a', 0, 0, 50, 40),
        rect('b', 100, 0, 50, 40),
      ];

      const result = distributeH(rects);
      // After sorting by x: a(0), b(100), c(300)
      // Result should be sorted by x position

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
    });
  });

  describe('distributeV', () => {
    it('should evenly distribute 3+ elements vertically', () => {
      const rects = [
        rect('a', 0, 0, 40, 50),
        rect('b', 0, 100, 40, 50),
        rect('c', 0, 300, 40, 50),
      ];
      // sorted by y: a(0), b(100), c(300)
      // totalSpan = (300 + 50) - 0 = 350
      // totalElementHeight = 50 + 50 + 50 = 150
      // gap = (350 - 150) / 2 = 100
      // a.y = 0, b.y = 0 + 50 + 100 = 150, c.y = 150 + 50 + 100 = 300

      const result = distributeV(rects);

      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 0, y: 150 },
        { id: 'c', x: 0, y: 300 },
      ]);
    });

    it('should keep first and last elements in place', () => {
      const rects = [
        rect('top', 0, 10, 30, 40),
        rect('mid1', 0, 80, 30, 40),
        rect('mid2', 0, 200, 30, 40),
        rect('bottom', 0, 400, 30, 40),
      ];
      // totalSpan = (400 + 40) - 10 = 430
      // totalElementHeight = 4 * 40 = 160
      // gap = (430 - 160) / 3 = 90

      const result = distributeV(rects);

      expect(result[0]).toEqual({ id: 'top', x: 0, y: 10 });
      expect(result[3]).toEqual({ id: 'bottom', x: 0, y: 400 });
    });

    it('should handle elements with different heights', () => {
      const rects = [
        rect('a', 0, 0, 40, 100),
        rect('b', 0, 200, 40, 50),
        rect('c', 0, 400, 40, 200),
      ];
      // sorted by y: a(0,h=100), b(200,h=50), c(400,h=200)
      // totalSpan = (400 + 200) - 0 = 600
      // totalElementHeight = 100 + 50 + 200 = 350
      // gap = (600 - 350) / 2 = 125

      const result = distributeV(rects);

      expect(result).toEqual([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 0, y: 225 },   // 0 + 100 + 125 = 225
        { id: 'c', x: 0, y: 400 },   // 225 + 50 + 125 = 400
      ]);
    });

    it('should return unchanged positions for 2 elements', () => {
      const rects = [
        rect('a', 10, 50, 40, 80),
        rect('b', 20, 200, 30, 60),
      ];
      const result = distributeV(rects);

      expect(result).toEqual([
        { id: 'a', x: 10, y: 50 },
        { id: 'b', x: 20, y: 200 },
      ]);
    });

    it('should preserve x positions for all elements', () => {
      const rects = [
        rect('a', 100, 0, 40, 50),
        rect('b', 200, 100, 40, 50),
        rect('c', 300, 300, 40, 50),
      ];
      const result = distributeV(rects);

      expect(result[0].x).toBe(100);
      expect(result[1].x).toBe(200);
      expect(result[2].x).toBe(300);
    });

    it('should sort elements by y position before distributing', () => {
      const rects = [
        rect('c', 0, 300, 40, 50),
        rect('a', 0, 0, 40, 50),
        rect('b', 0, 100, 40, 50),
      ];

      const result = distributeV(rects);

      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
      expect(result[2].id).toBe('c');
    });
  });

  describe('Edge cases', () => {
    it('all elements at the same position should remain unchanged for alignLeft', () => {
      const rects = [
        rect('a', 100, 100, 80, 40),
        rect('b', 100, 100, 80, 40),
        rect('c', 100, 100, 80, 40),
      ];
      const result = alignLeft(rects);

      result.forEach(r => {
        expect(r.x).toBe(100);
        expect(r.y).toBe(100);
      });
    });

    it('all elements at same position should remain unchanged for alignRight', () => {
      const rects = [
        rect('a', 100, 100, 80, 40),
        rect('b', 100, 100, 80, 40),
        rect('c', 100, 100, 80, 40),
      ];
      const result = alignRight(rects);
      // maxRight = 180, each gets x = 180 - 80 = 100

      result.forEach(r => {
        expect(r.x).toBe(100);
        expect(r.y).toBe(100);
      });
    });

    it('all elements at same position should remain unchanged for alignTop', () => {
      const rects = [
        rect('a', 100, 100, 80, 40),
        rect('b', 100, 100, 80, 40),
      ];
      const result = alignTop(rects);

      result.forEach(r => {
        expect(r.y).toBe(100);
      });
    });

    it('all elements at same position should remain unchanged for alignBottom', () => {
      const rects = [
        rect('a', 100, 100, 80, 40),
        rect('b', 100, 100, 80, 40),
      ];
      const result = alignBottom(rects);
      // maxBottom = 140, each gets y = 140 - 40 = 100

      result.forEach(r => {
        expect(r.y).toBe(100);
      });
    });

    it('all elements at same position should remain unchanged for alignCenterH', () => {
      const rects = [
        rect('a', 100, 50, 80, 40),
        rect('b', 100, 100, 80, 40),
      ];
      // Both have center x = 140, avg = 140
      const result = alignCenterH(rects);

      result.forEach(r => {
        expect(r.x).toBe(100); // 140 - 80/2 = 100
      });
    });

    it('all elements at same position should remain unchanged for alignCenterV', () => {
      const rects = [
        rect('a', 50, 100, 40, 80),
        rect('b', 100, 100, 40, 80),
      ];
      // Both have center y = 140, avg = 140
      const result = alignCenterV(rects);

      result.forEach(r => {
        expect(r.y).toBe(100); // 140 - 80/2 = 100
      });
    });

    it('distributeH with overlapping elements at same x produces zero gap', () => {
      const rects = [
        rect('a', 0, 0, 50, 40),
        rect('b', 0, 0, 50, 40),
        rect('c', 0, 0, 50, 40),
      ];
      // sorted by x: all at 0
      // totalSpan = (0 + 50) - 0 = 50
      // totalElementWidth = 150
      // gap = (50 - 150) / 2 = -50 (negative gap means overlap)

      const result = distributeH(rects);

      // First element stays at x=0, rest pile up with negative gap
      expect(result[0].x).toBe(0);
      expect(result[1].x).toBe(0);  // 0 + 50 + (-50) = 0
      expect(result[2].x).toBe(0);  // 0 + 50 + (-50) = 0
    });

    it('distributeV with overlapping elements at same y produces zero gap', () => {
      const rects = [
        rect('a', 0, 0, 40, 50),
        rect('b', 0, 0, 40, 50),
        rect('c', 0, 0, 40, 50),
      ];
      // totalSpan = (0 + 50) - 0 = 50
      // totalElementHeight = 150
      // gap = (50 - 150) / 2 = -50

      const result = distributeV(rects);

      expect(result[0].y).toBe(0);
      expect(result[1].y).toBe(0);
      expect(result[2].y).toBe(0);
    });

    it('all alignment functions preserve element ids', () => {
      const rects = [
        rect('element-1', 10, 20, 30, 40),
        rect('element-2', 50, 60, 70, 80),
      ];

      const fns = [alignLeft, alignRight, alignTop, alignBottom, alignCenterH, alignCenterV, distributeH, distributeV];
      for (const fn of fns) {
        const result = fn(rects);
        const ids = result.map(r => r.id).sort();
        expect(ids).toEqual(['element-1', 'element-2']);
      }
    });
  });
});
