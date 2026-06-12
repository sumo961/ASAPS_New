/**
 * Tests for ClusterPositioning — pure geometry helpers for cluster
 * containers in the flowchart editor. All math, no DOM. These run
 * on every cluster mount + resize + beat add/remove.
 *
 * Coverage focus:
 *   - calculateContainerBounds: minimums respected, map asset wins
 *     when bigger, padding + beatSpacing applied
 *   - alignToGrid: round-to-nearest semantics
 *   - distributeBeatsInContainer: empty/single/grid-layout cases,
 *     square-ish row/col split (ceil(sqrt(n)))
 *   - autoSizeContainer: expansion factor + grid-rounding
 *   - isPositionInContainer: header height excluded from valid area
 *   - getOptimalContainerType: map → spatial, name-heuristic
 *     ("at"/"in"/"on" + movement/location/place types)
 *   - calculatePortalPosition: closest-side resolution + correct
 *     anchor coords per side
 *   - flowchartToContainer / containerToFlowchart round-trip
 */
import { describe, it, expect } from 'vitest';
import {
  calculateContainerBounds,
  alignToGrid,
  distributeBeatsInContainer,
  autoSizeContainer,
  isPositionInContainer,
  getOptimalContainerType,
  calculatePortalPosition,
  flowchartToContainer,
  containerToFlowchart,
} from '../ClusterPositioning';

describe('alignToGrid', () => {
  it('rounds x and y to the nearest grid multiple', () => {
    expect(alignToGrid({ x: 23, y: 41 }, 20)).toEqual({ x: 20, y: 40 });
    expect(alignToGrid({ x: 27, y: 41 }, 20)).toEqual({ x: 20, y: 40 });
    // Halfway → JS Math.round goes half-to-even-ish; verify the
    // common 30 case lands at 40 (round-half-up for positive).
    expect(alignToGrid({ x: 30, y: 30 }, 20)).toEqual({ x: 40, y: 40 });
  });

  it('uses 20 as default grid size', () => {
    expect(alignToGrid({ x: 17, y: 22 })).toEqual({ x: 20, y: 20 });
  });

  it('handles negative coordinates', () => {
    expect(alignToGrid({ x: -27, y: -33 }, 20)).toEqual({ x: -20, y: -40 });
  });

  it('zero is its own grid point', () => {
    expect(alignToGrid({ x: 0, y: 0 }, 20)).toEqual({ x: 0, y: 0 });
  });
});

describe('calculateContainerBounds', () => {
  it('uses minWidth/minHeight when no beats and no map', () => {
    const result = calculateContainerBounds([]);
    expect(result.beatViewport.width).toBe(300);
    expect(result.beatViewport.height).toBe(200);
    expect(result.headerHeight).toBe(40);
  });

  it('respects custom minWidth/minHeight overrides', () => {
    const result = calculateContainerBounds([], undefined, {
      minWidth: 500,
      minHeight: 400,
    });
    expect(result.beatViewport.width).toBe(500);
    expect(result.beatViewport.height).toBe(400);
  });

  it('expands to fit map dimensions when bigger than minimums', () => {
    const result = calculateContainerBounds([], { width: 800, height: 600 });
    expect(result.beatViewport.width).toBe(800);
    expect(result.mapArea.width).toBe(800);
    // Map height is the bigger of (mapHeight, beatBoundsHeight).
    expect(result.mapArea.height).toBe(600);
  });

  it('expands to fit beat positions when bigger than minimums + map', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0 } },
      { beatId: 'b', position: { x: 1000, y: 800 } },
    ] as any;
    const result = calculateContainerBounds(positions, undefined, {
      minWidth: 100, minHeight: 100, padding: 20, beatSpacing: 60,
    });
    // 1000 spread + 60 beatSpacing/2 each side + 40 padding total.
    expect(result.beatViewport.width).toBeGreaterThanOrEqual(1100);
    expect(result.beatViewport.height).toBeGreaterThanOrEqual(900);
  });

  it('always returns a non-negative width even with single-point beats', () => {
    // Single beat → maxX - minX = 0; Math.max guards against
    // accidentally returning negative widths.
    const positions = [{ beatId: 'a', position: { x: 100, y: 100 } }] as any;
    const result = calculateContainerBounds(positions);
    expect(result.beatViewport.width).toBeGreaterThan(0);
    expect(result.beatViewport.height).toBeGreaterThan(0);
  });
});

describe('distributeBeatsInContainer', () => {
  it('returns empty array for no beats', () => {
    expect(distributeBeatsInContainer([], 400, 400)).toEqual([]);
  });

  it('centers a single beat in the container (grid-aligned)', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0, z: 0 } },
    ] as any;
    const result = distributeBeatsInContainer(positions, 400, 400);
    expect(result).toHaveLength(1);
    // Centered: 200, 200 — grid-aligned to 200, 200.
    expect(result[0].position.x).toBe(200);
    expect(result[0].position.y).toBe(200);
  });

  it('uses ceil(sqrt(n)) cols for the square-ish grid', () => {
    // 9 beats → 3x3 grid. Each cell occupies width/3 height/3.
    const positions = Array.from({ length: 9 }, (_, i) => ({
      beatId: `b${i}`, position: { x: 0, y: 0, z: 0 },
    })) as any;
    const result = distributeBeatsInContainer(positions, 600, 600, {
      grid: false, margin: 0,
    });
    // First row's beats share a Y; first column's beats share an X.
    expect(result[0].position.x).toBe(result[3].position.x); // col 0
    expect(result[0].position.y).toBe(result[1].position.y); // row 0
  });

  it('assigns z by index for layering', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0, z: 0 } },
      { beatId: 'b', position: { x: 0, y: 0, z: 0 } },
      { beatId: 'c', position: { x: 0, y: 0, z: 0 } },
    ] as any;
    const result = distributeBeatsInContainer(positions, 400, 400);
    expect(result[0].position.z).toBe(0);
    expect(result[1].position.z).toBe(1);
    expect(result[2].position.z).toBe(2);
  });

  it('preserves non-position fields from the original beat', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0, z: 0 }, label: 'orig' },
    ] as any;
    const result = distributeBeatsInContainer(positions, 400, 400);
    expect((result[0] as any).label).toBe('orig');
  });
});

describe('autoSizeContainer', () => {
  it('returns minimums when no beats', () => {
    expect(autoSizeContainer([])).toEqual({ width: 300, height: 200 });
  });

  it('returns custom minimums when no beats', () => {
    expect(autoSizeContainer([], { width: 500, height: 400 })).toEqual({
      width: 500,
      height: 400,
    });
  });

  it('expands content size by expansionFactor (default 1.2)', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0 } },
      { beatId: 'b', position: { x: 100, y: 80 } },
    ] as any;
    // current = 100x80; expanded = 120x96 → grid-rounded to 120x100.
    const result = autoSizeContainer(positions, { width: 0, height: 0 }, 1.2);
    expect(result.width).toBe(120);
    expect(result.height).toBe(100); // ceil(96/20)*20 = 100
  });

  it('respects minimums when expanded is smaller', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0 } },
      { beatId: 'b', position: { x: 10, y: 10 } },
    ] as any;
    const result = autoSizeContainer(positions, { width: 500, height: 400 });
    expect(result.width).toBe(500);
    expect(result.height).toBe(400);
  });

  it('rounds dimensions UP to nearest 20 (grid size)', () => {
    const positions = [
      { beatId: 'a', position: { x: 0, y: 0 } },
      { beatId: 'b', position: { x: 91, y: 0 } },
    ] as any;
    // 91 * 1.2 = 109.2 → ceil(109.2/20)*20 = 120.
    const result = autoSizeContainer(positions, { width: 0, height: 0 }, 1.2);
    expect(result.width).toBe(120);
  });
});

describe('isPositionInContainer', () => {
  it('returns true for a centered position', () => {
    expect(isPositionInContainer(
      { x: 100, y: 100 },
      { width: 200, height: 200 },
    )).toBe(true);
  });

  it('rejects positions inside the header area at the top', () => {
    // Header height (40) eats into the top of the valid area —
    // beats can't be placed there.
    expect(isPositionInContainer(
      { x: 100, y: 200 - 40 + 5 }, // inside the header band
      { width: 200, height: 200 },
    )).toBe(false);
  });

  it('rejects positions inside padding zone', () => {
    expect(isPositionInContainer(
      { x: 5, y: 100 }, // padding default is 10
      { width: 200, height: 200 },
    )).toBe(false);
  });

  it('accepts a position just inside the padding boundary', () => {
    expect(isPositionInContainer(
      { x: 10, y: 100 },
      { width: 200, height: 200 },
    )).toBe(true);
  });

  it('respects custom padding override', () => {
    expect(isPositionInContainer(
      { x: 15, y: 100 },
      { width: 200, height: 200 },
      20, // bigger padding
    )).toBe(false);
  });
});

describe('getOptimalContainerType', () => {
  it('returns "spatial" when a mapAssetId is provided', () => {
    // Map → spatial, no further heuristics.
    expect(getOptimalContainerType([], [], 'map-asset-1')).toBe('spatial');
  });

  it('returns "spatial" when any beat type contains "movement"', () => {
    const beats = [{ type: 'movementChoice', name: 'choose' }] as any;
    expect(getOptimalContainerType(beats, [])).toBe('spatial');
  });

  it('returns "spatial" when any beat type contains "location"', () => {
    const beats = [{ type: 'gpsLocation', name: 'walk' }] as any;
    expect(getOptimalContainerType(beats, [])).toBe('spatial');
  });

  it('returns "spatial" when any beat name starts with "at "', () => {
    // The name heuristic catches "At the Library" / "In the
    // Forest" / "On the Bridge" — common spatial-flow naming.
    const beats = [{ type: 'infoText', name: 'At the library' }] as any;
    expect(getOptimalContainerType(beats, [])).toBe('spatial');
  });

  it('returns "spatial" when any beat name contains "in "', () => {
    const beats = [{ type: 'infoText', name: 'In the forest' }] as any;
    expect(getOptimalContainerType(beats, [])).toBe('spatial');
  });

  it('returns "organizational" when no spatial cues present', () => {
    const beats = [
      { type: 'infoText', name: 'Chapter one' },
      { type: 'dialogTree', name: 'Conversation' },
    ] as any;
    expect(getOptimalContainerType(beats, [])).toBe('organizational');
  });
});

describe('calculatePortalPosition', () => {
  const bounds = { width: 400, height: 300 };
  const container = { x: 0, y: 0 };

  it('picks "top" when external position is closest to the top edge', () => {
    // External at (200, 10) relative to container at (0,0). Top
    // distance = 10 (smallest). Portal anchors at top-center.
    const result = calculatePortalPosition(bounds, { x: 200, y: 10 }, container);
    expect(result.side).toBe('top');
    expect(result.x).toBe(200); // width/2
    expect(result.y).toBe(0);
  });

  it('picks "left" when closest to the left edge', () => {
    const result = calculatePortalPosition(bounds, { x: 5, y: 150 }, container);
    expect(result.side).toBe('left');
    expect(result.x).toBe(0);
    expect(result.y).toBe(150); // height/2
  });

  it('picks "right" when closest to the right edge', () => {
    const result = calculatePortalPosition(bounds, { x: 395, y: 150 }, container);
    expect(result.side).toBe('right');
    expect(result.x).toBe(400); // width
    expect(result.y).toBe(150);
  });

  it('picks "bottom" when closest to the bottom edge', () => {
    const result = calculatePortalPosition(bounds, { x: 200, y: 290 }, container);
    expect(result.side).toBe('bottom');
    expect(result.x).toBe(200);
    expect(result.y).toBe(300); // height
  });

  it('uses container position to translate external coordinates', () => {
    // Container at (1000, 1000). External point at (1005, 1150) is
    // (5, 150) relative — closest to left.
    const result = calculatePortalPosition(bounds, { x: 1005, y: 1150 }, { x: 1000, y: 1000 });
    expect(result.side).toBe('left');
  });
});

describe('flowchartToContainer', () => {
  it('translates global coords into container-local space', () => {
    // Container at (1000, 1000). Point at (1100, 1080) → (100, 80).
    const result = flowchartToContainer(
      { x: 1100, y: 1080 },
      { x: 1000, y: 1000 },
      { width: 400, height: 300 },
    );
    expect(result.x).toBe(100);
    // y >= header height (40).
    expect(result.y).toBe(80);
  });

  it('clamps x to within container bounds (leaving room for the beat node)', () => {
    // Container is 400 wide; max x = 400 - 100 = 300.
    const result = flowchartToContainer(
      { x: 1500, y: 1100 },
      { x: 1000, y: 1000 },
      { width: 400, height: 300 },
    );
    expect(result.x).toBe(300);
  });

  it('clamps x to non-negative', () => {
    const result = flowchartToContainer(
      { x: 990, y: 1100 },
      { x: 1000, y: 1000 },
      { width: 400, height: 300 },
    );
    expect(result.x).toBe(0);
  });

  it('clamps y to at least the header height', () => {
    // y must stay below the header band.
    const result = flowchartToContainer(
      { x: 1100, y: 1010 },
      { x: 1000, y: 1000 },
      { width: 400, height: 300 },
    );
    expect(result.y).toBe(40);
  });

  it('clamps y to within container bottom (leaving room for the beat)', () => {
    const result = flowchartToContainer(
      { x: 1100, y: 9999 },
      { x: 1000, y: 1000 },
      { width: 400, height: 300 },
    );
    expect(result.y).toBe(200); // 300 - 100 = 200
  });
});

describe('containerToFlowchart', () => {
  it('translates container-local coords back to global space', () => {
    expect(containerToFlowchart(
      { x: 100, y: 80 },
      { x: 1000, y: 1000 },
    )).toEqual({ x: 1100, y: 1080 });
  });

  it('round-trip with flowchartToContainer (within clamped bounds)', () => {
    // A point that's already inside the valid container area
    // should round-trip exactly.
    const global = { x: 1100, y: 1080 };
    const cluster = { x: 1000, y: 1000 };
    const local = flowchartToContainer(global, cluster, { width: 400, height: 300 });
    const back = containerToFlowchart(local, cluster);
    expect(back).toEqual(global);
  });
});
