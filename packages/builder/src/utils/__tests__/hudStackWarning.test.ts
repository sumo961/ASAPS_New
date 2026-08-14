/**
 * hudStackWarnings — the authoring-time warning for a HUD stack too tall for
 * the smallest screen a story will run on.
 *
 * The quantity that matters is the stack's reach from the screen edge, because
 * that is what the runtime has to reserve. Summing heights would miss the gaps
 * between stacked HUDs and under-report.
 */
import { describe, it, expect } from 'vitest';
import {
  hudStackWarnings,
  describeHudStackWarning,
  SMALLEST_TARGET_HEIGHT,
} from '../hudStackWarning';

const rect = (over: Partial<any> = {}): any => ({
  id: 'meter-ada', kind: 'meter', corner: 'top-left',
  x: 12, y: 12, width: 160, height: 174, ...over,
});

describe('hudStackWarnings', () => {
  it('stays quiet for a stack the smallest phone can absorb', () => {
    // One 174px frame reaches 186px — a quarter of a 740px screen. This is the
    // configuration measured as working at every viewport, so warning here
    // would be noise.
    expect(hudStackWarnings([rect()])).toEqual([]);
  });

  it('warns once a corner passes the share the runtime will reserve', () => {
    // Three frames stacked: reaches 546px, over 40% of 740.
    const stack = [
      rect({ id: 'a', y: 12, height: 174 }),
      rect({ id: 'b', y: 194, height: 174 }),
      rect({ id: 'c', y: 376, height: 158 }),
    ];
    const [w] = hudStackWarnings(stack);
    expect(w.corner).toBe('top-left');
    expect(w.count).toBe(3);
    expect(w.extent).toBe(534);
    expect(w.share).toBeGreaterThan(0.4);
  });

  it('counts the gaps between stacked HUDs, not just their heights', () => {
    // The verified fixture: a 174px meter frame and a 52px inventory frame.
    // Their heights sum to 226, but the reach from the edge is 246 — the gap
    // between them is space the runtime must reserve too.
    const fixture = [rect({ id: 'a', y: 12, height: 174 }), rect({ id: 'b', y: 194, height: 52 })];
    expect(hudStackWarnings(fixture, 740, 0.4)).toEqual([]);
    expect(hudStackWarnings(fixture, 740, 0.3)[0].extent).toBe(246);
  });

  it('warns for two full-height frames in one corner', () => {
    // 174 + 174 reaches 368px — half a portrait phone screen given to chrome.
    const stack = [rect({ id: 'a', y: 12, height: 174 }), rect({ id: 'b', y: 194, height: 174 })];
    const [w] = hudStackWarnings(stack);
    expect(w.extent).toBe(368);
    expect(Math.round(w.share * 100)).toBe(50);
  });

  it('measures a bottom corner from its own edge', () => {
    // Bottom-anchored boxes carry large y values; the reach is still the span
    // from the edge, not the distance from the top of the stage.
    const stack = [
      rect({ id: 'a', corner: 'bottom-right', y: 500, height: 174 }),
      rect({ id: 'b', corner: 'bottom-right', y: 318, height: 174 }),
    ];
    expect(hudStackWarnings(stack, 740, 0.4)[0]?.extent).toBe(368);
  });

  it('keeps corners separate — one crowded corner is not all of them', () => {
    const mixed = [
      rect({ id: 'a', corner: 'top-left', y: 12, height: 174 }),
      rect({ id: 'b', corner: 'top-left', y: 194, height: 174 }),
      rect({ id: 'c', corner: 'top-left', y: 376, height: 158 }),
      rect({ id: 'd', corner: 'top-right', y: 12, height: 60 }),
    ];
    const ws = hudStackWarnings(mixed);
    expect(ws).toHaveLength(1);
    expect(ws[0].corner).toBe('top-left');
  });

  it('ignores centre-anchored HUDs, which span width rather than stacking', () => {
    const wide = rect({ id: '__countdown', kind: 'countdown', corner: 'top-center', height: 400 });
    expect(hudStackWarnings([wide])).toEqual([]);
  });

  it('reports the worst corner first', () => {
    const both = [
      rect({ id: 'a', corner: 'top-left', y: 12, height: 320 }),
      rect({ id: 'b', corner: 'bottom-left', y: 200, height: 500 }),
    ];
    const ws = hudStackWarnings(both);
    expect(ws[0].extent).toBeGreaterThan(ws[1].extent);
  });

  it('is inert with nothing to measure', () => {
    expect(hudStackWarnings([])).toEqual([]);
    expect(hudStackWarnings(null)).toEqual([]);
    expect(hudStackWarnings(undefined)).toEqual([]);
  });
});

describe('describeHudStackWarning', () => {
  it("says what is wrong, what it costs, and what the author can do", () => {
    const s = describeHudStackWarning({ corner: 'top-left', extent: 534, share: 534 / 740, count: 3 });
    expect(s).toContain('3 HUDs');
    expect(s).toContain('top left');
    expect(s).toContain('534px');
    expect(s).toContain(String(SMALLEST_TARGET_HEIGHT));
    // Offers a way out, including "this is fine" — it is a warning, not a rule.
    expect(s).toMatch(/another corner/);
    expect(s).toMatch(/accept it/);
  });
});
