/**
 * Host chrome as a reserved obstacle.
 *
 * The exported player floats a language panel in the window's top-right,
 * outside the player's tree. The packer already flows character frames around
 * the global timer; chrome is the same kind of obstacle, and without it a
 * top-right meter frame renders underneath the panel.
 */
import { describe, it, expect } from 'vitest';
import { buildScreenHudLayout } from '../../src/components/ScreenHudLayer';
import type { HudBox } from '../../src/utils/hudLayout';

const STAGE = { width: 1024, height: 768 };

const ada = {
  id: 'char_ada',
  name: 'Ada',
  meterFrame: { dockMode: 'screen', screenPosition: 'screen-top-right', width: 160 } as any,
  counters: [
    { name: 'gold', displayName: 'Gold', value: 12, min: 0, max: 100 },
    { name: 'trust', displayName: 'Trust', value: 0, min: -100, max: 100 },
  ] as any,
};

const panel: HudBox = { id: 'chrome-0', corner: 'top-right', width: 220, height: 64, kind: 'chrome' };

describe('reserved host chrome', () => {
  it('pushes a character frame below chrome sharing its corner', () => {
    const without = buildScreenHudLayout({ characters: [ada], stage: STAGE });
    const withChrome = buildScreenHudLayout({ characters: [ada], stage: STAGE, extraBoxes: [panel] });

    const before = without.placements.get('meter-char_ada')!;
    const after = withChrome.placements.get('meter-char_ada')!;
    expect(before.offsetY).toBe(0);
    // Cleared by the panel's height plus the stacking gap.
    expect(after.offsetY).toBe(panel.height + 8);
    expect(after.top).toBeGreaterThan(before.top);
  });

  it('leaves a frame in a different corner alone', () => {
    const left = { ...ada, meterFrame: { ...ada.meterFrame, screenPosition: 'screen-top-left' } };
    const layout = buildScreenHudLayout({ characters: [left], stage: STAGE, extraBoxes: [panel] });
    expect(layout.placements.get('meter-char_ada')!.offsetY).toBe(0);
  });

  it('sits chrome closest to the edge, ahead of a global timer', () => {
    const layout = buildScreenHudLayout({
      characters: [ada], stage: STAGE, extraBoxes: [panel],
      hudOverlays: { timerHud: { enabled: true, position: 'top-right' } },
    });
    const chrome = layout.placements.get('chrome-0')!;
    const timer = layout.placements.get('__timer')!;
    const meter = layout.placements.get('meter-char_ada')!;
    expect(chrome.offsetY).toBe(0);
    expect(timer.offsetY).toBeGreaterThan(chrome.offsetY);
    expect(meter.offsetY).toBeGreaterThan(timer.offsetY);
  });

  it('builds a layout for chrome alone, with no characters', () => {
    // Reserving space is useful even before anyone has a HUD — the rects feed
    // the stage's own content reservation.
    const layout = buildScreenHudLayout({ characters: [], stage: STAGE, extraBoxes: [panel] });
    expect(layout.rects).toHaveLength(1);
    expect(layout.rects[0].kind).toBe('chrome');
  });

  it('draws nothing for chrome — it is reserved, not rendered', () => {
    const layout = buildScreenHudLayout({ characters: [], stage: STAGE, extraBoxes: [panel] });
    expect(layout.meters).toHaveLength(0);
    expect(layout.inventories).toHaveLength(0);
    expect(layout.discs).toHaveLength(0);
    expect(Object.keys(layout.rails)).toHaveLength(0);
  });
});
