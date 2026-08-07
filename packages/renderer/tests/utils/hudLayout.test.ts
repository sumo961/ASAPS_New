import { describe, it, expect } from 'vitest';
import { layoutScreenHuds, placementMap, type HudBox } from '../../src/utils/hudLayout';

const stage = { width: 1024, height: 768 };

describe('layoutScreenHuds', () => {
  it('stacks same-corner HUDs downward from a top corner (no overlap)', () => {
    const boxes: HudBox[] = [
      { id: 'timer', corner: 'top-right', width: 180, height: 40, kind: 'timer' },
      { id: 'mood', corner: 'top-right', width: 120, height: 56, kind: 'mood' },
    ];
    const m = placementMap(layoutScreenHuds(boxes, stage));
    // timer (global, priority 0) sits at the edge; mood stacks below it.
    expect(m.get('timer')!.offsetY).toBe(0);
    expect(m.get('mood')!.offsetY).toBe(40 + 8); // timer height + gap
    // no vertical overlap
    expect(m.get('mood')!.top).toBeGreaterThanOrEqual(m.get('timer')!.top + 40);
  });

  it('stacks bottom-corner HUDs upward (negative offset)', () => {
    const boxes: HudBox[] = [
      { id: 'inv', corner: 'bottom-right', width: 200, height: 90, kind: 'inventory' },
      { id: 'meter', corner: 'bottom-right', width: 140, height: 70, kind: 'meter' },
    ];
    const m = placementMap(layoutScreenHuds(boxes, stage));
    // meter (priority 2) before inventory (priority 3): meter at edge.
    expect(m.get('meter')!.offsetY).toBe(0);
    expect(m.get('inv')!.offsetY).toBe(-(70 + 8));
    // inventory sits ABOVE the meter (smaller top)
    expect(m.get('inv')!.top).toBeLessThan(m.get('meter')!.top);
  });

  it('does not stack HUDs in different corners', () => {
    const boxes: HudBox[] = [
      { id: 'a', corner: 'top-left', width: 140, height: 70, kind: 'meter' },
      { id: 'b', corner: 'bottom-right', width: 200, height: 90, kind: 'inventory' },
    ];
    const m = placementMap(layoutScreenHuds(boxes, stage));
    expect(m.get('a')!.offsetY).toBe(0);
    expect(m.get('b')!.offsetY).toBe(0);
  });

  it('anchors left/right/center horizontally', () => {
    const boxes: HudBox[] = [
      { id: 'l', corner: 'top-left', width: 100, height: 40, kind: 'meter' },
      { id: 'r', corner: 'top-right', width: 100, height: 40, kind: 'timer' },
      { id: 'c', corner: 'top-center', width: 100, height: 40, kind: 'countdown' },
    ];
    const m = placementMap(layoutScreenHuds(boxes, stage));
    expect(m.get('l')!.left).toBe(12); // margin
    expect(m.get('r')!.left).toBe(1024 - 12 - 100);
    expect(m.get('c')!.left).toBe(Math.round((1024 - 100) / 2));
  });

  it('orders global HUDs (timer/countdown) before character frames in a shared corner', () => {
    const boxes: HudBox[] = [
      { id: 'mood', corner: 'top-center', width: 120, height: 56, kind: 'mood' },
      { id: 'cd', corner: 'top-center', width: 400, height: 44, kind: 'countdown' },
    ];
    const m = placementMap(layoutScreenHuds(boxes, stage));
    expect(m.get('cd')!.offsetY).toBe(0);         // countdown at edge
    expect(m.get('mood')!.offsetY).toBe(44 + 8);  // mood below
  });
});
