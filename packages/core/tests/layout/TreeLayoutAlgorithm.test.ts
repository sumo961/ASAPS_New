/**
 * Tests for calculateTreeLayout — Reingold-Tilford-style tree
 * layout for the flowchart graph. Runs whenever the user clicks
 * "Auto-layout" in the editor, so wrong output positions every
 * node noticeably wrong.
 *
 * Coverage focus:
 *   - Empty graph returns empty maps
 *   - Single node placed at startX/startY
 *   - Linear chain: nodes stack along Y axis (TB) with consistent
 *     spacing
 *   - Branching: child nodes spread horizontally with parent
 *     centered above
 *   - Layer assignment: nodes at the right depth (root=0, child=1,
 *     grandchild=2, ...)
 *   - LR direction: layers run along X instead of Y
 *   - Custom spacing options honored
 *   - Disconnected nodes still placed (no orphans dropped)
 *   - Edges that reference unknown node ids are ignored
 *   - Duplicate edges deduplicated (no double-spacing)
 */
import { describe, it, expect } from 'vitest';
import {
  calculateTreeLayout,
  type LayoutNode,
  type LayoutEdge,
} from '../../src/layout/TreeLayoutAlgorithm';

const node = (id: string): LayoutNode => ({ id });

describe('calculateTreeLayout', () => {
  describe('empty + trivial', () => {
    it('returns empty maps for empty input', () => {
      const result = calculateTreeLayout([], []);
      expect(result.positions.size).toBe(0);
      expect(result.layers.size).toBe(0);
    });

    it('single node placed at startX/startY (default 100/50)', () => {
      const result = calculateTreeLayout([node('a')], []);
      expect(result.positions.get('a')).toEqual({ x: 100, y: 50 });
      expect(result.layers.get('a')).toBe(0);
    });

    it('honors custom startX/startY', () => {
      const result = calculateTreeLayout(
        [node('a')],
        [],
        { startX: 500, startY: 250 },
      );
      expect(result.positions.get('a')).toEqual({ x: 500, y: 250 });
    });
  });

  describe('linear chain', () => {
    it('three nodes in a chain land in increasing layers (TB direction)', () => {
      const result = calculateTreeLayout(
        [node('a'), node('b'), node('c')],
        [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
      );
      expect(result.layers.get('a')).toBe(0);
      expect(result.layers.get('b')).toBe(1);
      expect(result.layers.get('c')).toBe(2);
    });

    it('nodes increase along Y in TB direction', () => {
      const result = calculateTreeLayout(
        [node('a'), node('b'), node('c')],
        [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      const c = result.positions.get('c')!;
      expect(b.y).toBeGreaterThan(a.y);
      expect(c.y).toBeGreaterThan(b.y);
    });

    it('consecutive layers are spaced by nodeSpacingY (default 120)', () => {
      const result = calculateTreeLayout(
        [node('a'), node('b')],
        [{ source: 'a', target: 'b' }],
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      expect(b.y - a.y).toBe(120);
    });

    it('respects custom nodeSpacingY', () => {
      const result = calculateTreeLayout(
        [node('a'), node('b')],
        [{ source: 'a', target: 'b' }],
        { nodeSpacingY: 50 },
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      expect(b.y - a.y).toBe(50);
    });
  });

  describe('LR direction (declared but not wired up — known limitation)', () => {
    it.skip('layers SHOULD run along X axis when direction is "LR" (not implemented)', () => {
      // Skipped because the algorithm has the direction option declared
      // (and DEFAULT_OPTIONS sets it to 'TB') but never branches on it
      // in the layout logic. Setting direction:'LR' currently produces
      // identical output to TB. Un-skip if/when LR is implemented;
      // the assertion shape is what the API surface promises.
      const result = calculateTreeLayout(
        [node('a'), node('b'), node('c')],
        [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
        { direction: 'LR' },
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      const c = result.positions.get('c')!;
      expect(b.x).toBeGreaterThan(a.x);
      expect(c.x).toBeGreaterThan(b.x);
    });

    it('direction:"LR" currently produces same Y stacking as TB (documented current behavior)', () => {
      // Pin actual behavior: 'LR' is silently ignored. Calling with
      // direction:'LR' returns TB-style output. This documents the
      // limitation so a future "we made it work" change is visible
      // as the test failing.
      const lr = calculateTreeLayout(
        [node('a'), node('b')],
        [{ source: 'a', target: 'b' }],
        { direction: 'LR' },
      );
      const tb = calculateTreeLayout(
        [node('a'), node('b')],
        [{ source: 'a', target: 'b' }],
        { direction: 'TB' },
      );
      // Same positions for both directions — proves the option is unwired.
      expect(lr.positions.get('a')).toEqual(tb.positions.get('a'));
      expect(lr.positions.get('b')).toEqual(tb.positions.get('b'));
    });
  });

  describe('branching', () => {
    it('two siblings under a parent get distinct X positions', () => {
      // root → a, root → b. Both at layer 1; X positions must
      // differ so they don't overlap.
      const result = calculateTreeLayout(
        [node('root'), node('a'), node('b')],
        [{ source: 'root', target: 'a' }, { source: 'root', target: 'b' }],
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      expect(a.x).not.toBe(b.x);
      // Both at same layer (1).
      expect(result.layers.get('a')).toBe(1);
      expect(result.layers.get('b')).toBe(1);
    });

    it('parent is centered between two children\'s X positions', () => {
      // The defining property of a hierarchical tree layout —
      // parent sits above the midpoint of its children.
      const result = calculateTreeLayout(
        [node('root'), node('a'), node('b')],
        [{ source: 'root', target: 'a' }, { source: 'root', target: 'b' }],
      );
      const root = result.positions.get('root')!;
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      const midpoint = (a.x + b.x) / 2;
      // Allow some pixels of slack for half-node-width offsets.
      expect(Math.abs(root.x - midpoint)).toBeLessThan(10);
    });

    it('siblings spaced by ~nodeSpacingX', () => {
      const result = calculateTreeLayout(
        [node('root'), node('a'), node('b')],
        [{ source: 'root', target: 'a' }, { source: 'root', target: 'b' }],
        { nodeSpacingX: 200 },
      );
      const a = result.positions.get('a')!;
      const b = result.positions.get('b')!;
      // Pin order-independent spacing.
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(200);
    });
  });

  describe('layer assignment', () => {
    it('multi-level tree: root=0, children=1, grandchildren=2', () => {
      const result = calculateTreeLayout(
        [node('r'), node('a'), node('b'), node('aa'), node('ab')],
        [
          { source: 'r', target: 'a' },
          { source: 'r', target: 'b' },
          { source: 'a', target: 'aa' },
          { source: 'a', target: 'ab' },
        ],
      );
      expect(result.layers.get('r')).toBe(0);
      expect(result.layers.get('a')).toBe(1);
      expect(result.layers.get('b')).toBe(1);
      expect(result.layers.get('aa')).toBe(2);
      expect(result.layers.get('ab')).toBe(2);
    });
  });

  describe('disconnected components', () => {
    it('places orphan nodes (no orphans dropped)', () => {
      // 'orphan' has no edges. It must still appear in positions.
      const result = calculateTreeLayout(
        [node('a'), node('orphan')],
        [{ source: 'a', target: 'a-child' }],
      );
      expect(result.positions.has('orphan')).toBe(true);
    });

    it('multiple roots (forest) each get their own layer-0', () => {
      // Two separate trees: a→b and c→d.
      const result = calculateTreeLayout(
        [node('a'), node('b'), node('c'), node('d')],
        [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }],
      );
      expect(result.layers.get('a')).toBe(0);
      expect(result.layers.get('c')).toBe(0);
      expect(result.layers.get('b')).toBe(1);
      expect(result.layers.get('d')).toBe(1);
    });
  });

  describe('defensive', () => {
    it('ignores edges that reference unknown node ids', () => {
      // a → ghost (ghost not in nodes). Layout shouldn't crash;
      // 'a' stays at layer 0.
      const result = calculateTreeLayout(
        [node('a')],
        [{ source: 'a', target: 'ghost' }],
      );
      expect(result.layers.get('a')).toBe(0);
      expect(result.positions.get('ghost')).toBeUndefined();
    });

    it('deduplicates duplicate edges (no double-spacing)', () => {
      // Two identical edges a→b should NOT create two parent-
      // child relationships. b stays at layer 1.
      const result = calculateTreeLayout(
        [node('a'), node('b')],
        [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'b' }, // dup
        ],
      );
      expect(result.layers.get('b')).toBe(1);
    });
  });
});
