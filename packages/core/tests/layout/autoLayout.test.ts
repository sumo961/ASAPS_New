/**
 * Tests for autoLayout — the shared auto-layout logic the editor +
 * renderer both run. We focus on the small pure functions
 * (applyLayoutWithOverrides, calculateOverrides); computeAutoLayout
 * is exercised end-to-end in the integration tests already.
 *
 * Coverage focus:
 *   - applyLayoutWithOverrides: merges layout result with optional
 *     overrides; partial overrides honored; element with no layout
 *     result returns original (or override-merged) unchanged
 *   - calculateOverrides: returns ONLY changed elements (no
 *     entries for elements at the auto-layout-correct position);
 *     epsilon tolerance (0.5px) prevents float noise from creating
 *     spurious overrides
 *   - Per-field detection: only the field that differs is recorded
 *     (not the entire dimension set)
 */
import { describe, it, expect } from 'vitest';
import {
  applyLayoutWithOverrides,
  calculateOverrides,
  type LayoutElement,
  type AutoLayoutOutput,
} from '../../src/layout/autoLayout';

function el(id: string, overrides: Partial<LayoutElement> = {}): LayoutElement {
  return {
    id,
    kind: 'text',
    content: '',
    x: 0, y: 0, width: 200, height: 50,
    ...overrides,
  };
}

function layoutOutput(
  results: Array<{ id: string; x: number; y: number; width: number; height: number }>,
): AutoLayoutOutput {
  return {
    results: new Map(
      results.map(r => [r.id, { ...r, wasAdjusted: false }]),
    ),
    adjustedElements: [],
  };
}

describe('applyLayoutWithOverrides', () => {
  it('returns layout-result position when no override', () => {
    const elements = [el('a', { x: 0, y: 0 })];
    const layout = layoutOutput([{ id: 'a', x: 100, y: 200, width: 300, height: 80 }]);
    const result = applyLayoutWithOverrides(elements, layout, {});
    expect(result[0]).toMatchObject({ id: 'a', x: 100, y: 200, width: 300, height: 80 });
  });

  it('override.x replaces layout x but keeps y/w/h from layout', () => {
    // Partial overrides preserve fields the user didn't manually
    // set — the user manually moved horizontally but lets auto-
    // layout handle vertical positioning.
    const elements = [el('a')];
    const layout = layoutOutput([{ id: 'a', x: 100, y: 200, width: 300, height: 80 }]);
    const overrides = { a: { x: 500 } };
    const result = applyLayoutWithOverrides(elements, layout, overrides);
    expect(result[0]).toMatchObject({ x: 500, y: 200, width: 300, height: 80 });
  });

  it('full-override path: all four fields from overrides', () => {
    const elements = [el('a')];
    const layout = layoutOutput([{ id: 'a', x: 100, y: 200, width: 300, height: 80 }]);
    const overrides = { a: { x: 1, y: 2, width: 3, height: 4 } };
    const result = applyLayoutWithOverrides(elements, layout, overrides);
    expect(result[0]).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('element with no layout result returns ORIGINAL (preserves non-layout fields)', () => {
    // Edge case: layout may skip elements (e.g. hotspots that aren't
    // in the auto-layout pipeline). Those keep their original values.
    const elements = [el('a', { x: 999, y: 888 })];
    const layout = layoutOutput([]); // no result for 'a'
    const result = applyLayoutWithOverrides(elements, layout, {});
    expect(result[0]).toMatchObject({ x: 999, y: 888 });
  });

  it('element with no layout result merges override on top', () => {
    const elements = [el('a', { x: 999, y: 888, width: 100, height: 100 })];
    const layout = layoutOutput([]);
    const result = applyLayoutWithOverrides(elements, layout, { a: { x: 500 } });
    expect(result[0]).toMatchObject({ x: 500, y: 888, width: 100, height: 100 });
  });

  it('preserves non-layout fields (id, kind, content, fontSize, etc.)', () => {
    const elements = [el('a', { kind: 'button', content: 'Click me', fontSize: 24 })];
    const layout = layoutOutput([{ id: 'a', x: 100, y: 200, width: 300, height: 80 }]);
    const result = applyLayoutWithOverrides(elements, layout, {});
    expect(result[0]).toMatchObject({
      id: 'a',
      kind: 'button',
      content: 'Click me',
      fontSize: 24,
    });
  });

  it('returns an array with one entry per input element', () => {
    const elements = [el('a'), el('b'), el('c')];
    const layout = layoutOutput([
      { id: 'a', x: 0, y: 0, width: 1, height: 1 },
      { id: 'b', x: 0, y: 0, width: 1, height: 1 },
    ]);
    const result = applyLayoutWithOverrides(elements, layout, {});
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('calculateOverrides', () => {
  it('returns empty object when every element matches auto-layout', () => {
    const elements = [
      el('a', { x: 100, y: 200, width: 300, height: 80 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 100, y: 200, width: 300, height: 80 },
    ]);
    expect(calculateOverrides(elements, layout)).toEqual({});
  });

  it('records ONLY the differing field per element', () => {
    // The author moved 'a' horizontally; y/w/h unchanged. The
    // override should contain ONLY x — minimizes storage and
    // makes it visible in the editor what the user manually set.
    const elements = [
      el('a', { x: 999, y: 200, width: 300, height: 80 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 100, y: 200, width: 300, height: 80 },
    ]);
    const result = calculateOverrides(elements, layout);
    expect(result.a).toEqual({ x: 999 });
  });

  it('records all four fields when all differ', () => {
    const elements = [
      el('a', { x: 1, y: 2, width: 3, height: 4 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 100, y: 200, width: 300, height: 80 },
    ]);
    expect(calculateOverrides(elements, layout)).toEqual({
      a: { x: 1, y: 2, width: 3, height: 4 },
    });
  });

  it('uses 0.5px epsilon to tolerate float noise', () => {
    // After serialization round-trips, positions can drift by
    // tiny float amounts. A 0.5px diff is below the threshold,
    // so NO override is recorded — prevents the editor from
    // constantly thinking the user moved things.
    const elements = [
      el('a', { x: 100.3, y: 200, width: 300, height: 80 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 100, y: 200, width: 300, height: 80 },
    ]);
    expect(calculateOverrides(elements, layout)).toEqual({});
  });

  it('records when the diff is > 0.5px (boundary)', () => {
    // 0.6px diff is just above the threshold and IS recorded.
    const elements = [
      el('a', { x: 100.6, y: 200, width: 300, height: 80 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 100, y: 200, width: 300, height: 80 },
    ]);
    const result = calculateOverrides(elements, layout);
    expect(result.a).toEqual({ x: 100.6 });
  });

  it('skips elements with no auto-layout result', () => {
    // If the element isn't in auto-layout, there's nothing to
    // compare against — don't record an override.
    const elements = [
      el('a', { x: 100, y: 200, width: 300, height: 80 }),
    ];
    const layout = layoutOutput([]); // no results
    expect(calculateOverrides(elements, layout)).toEqual({});
  });

  it('partitions overrides by element id', () => {
    const elements = [
      el('a', { x: 999, y: 0, width: 100, height: 50 }),
      el('b', { x: 0, y: 999, width: 100, height: 50 }),
    ];
    const layout = layoutOutput([
      { id: 'a', x: 0, y: 0, width: 100, height: 50 },
      { id: 'b', x: 0, y: 0, width: 100, height: 50 },
    ]);
    const result = calculateOverrides(elements, layout);
    expect(result.a).toEqual({ x: 999 });
    expect(result.b).toEqual({ y: 999 });
  });
});
