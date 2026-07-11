/**
 * Tests for cluster container autosizing. The geometry must match the
 * GraphEditor's default member grid: 2 columns, 200×110 steps, 160×80
 * nodes, 20px padding, 40px header.
 */
import { describe, it, expect } from 'vitest';
import { requiredClusterSize, grownClusterBounds } from '../clusterAutosize';

describe('requiredClusterSize', () => {
  it('small clusters get the minimum box', () => {
    expect(requiredClusterSize(1)).toEqual({ width: 400, height: 300 });
    expect(requiredClusterSize(4)).toEqual({ width: 400, height: 300 });
  });

  it('height grows by grid row beyond the minimum', () => {
    // 10 beats → 5 rows → 40 header + 20 + 4*110 + 80 + 20 = 600
    expect(requiredClusterSize(10)).toEqual({ width: 400, height: 600 });
    // 22 beats (the merge-overflow case) → 11 rows → 40+20+10*110+80+20 = 1260
    expect(requiredClusterSize(22)).toEqual({ width: 400, height: 1260 });
  });
});

describe('grownClusterBounds', () => {
  it('keeps bounds that are already big enough', () => {
    expect(grownClusterBounds({ width: 800, height: 700 }, 10)).toEqual({ width: 800, height: 700 });
  });

  it('grows only the dimension that is too small', () => {
    expect(grownClusterBounds({ width: 800, height: 300 }, 10)).toEqual({ width: 800, height: 600 });
    expect(grownClusterBounds({ width: 200, height: 900 }, 10)).toEqual({ width: 400, height: 900 });
  });

  it('handles missing current bounds', () => {
    expect(grownClusterBounds(undefined, 2)).toEqual({ width: 400, height: 300 });
  });
});
