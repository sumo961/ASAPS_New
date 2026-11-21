/**
 * Bubbles keep clear of meter and inventory panels over the stage, also
 * screen-docked ones the screen HUD layer draws outside the stage element.
 */
import { describe, it, expect } from 'vitest';
import { hudFramesOver } from '../../src/utils/speechBubble';

const box = (el: HTMLElement, l: number, t: number, w: number, h: number) => {
  el.getBoundingClientRect = () => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
};

describe('hudFramesOver', () => {
  it('finds panels inside the stage and screen-docked ones beside it, not other views\'', () => {
    document.body.innerHTML = '<div id="stage"><div data-hud-frame="meters" id="a"></div></div><div id="hud"><div data-hud-frame="inventory" id="b"></div></div><div data-hud-frame="inventory" id="c"></div><div data-hud-frame="inventory" id="d"></div>';
    const stage = document.getElementById('stage')!;
    box(document.getElementById('a')!, 10, 500, 100, 100);
    box(document.getElementById('b')!, 800, 10, 200, 100);
    box(document.getElementById('c')!, 1200, 10, 200, 100);
    box(document.getElementById('d')!, 0, 0, 0, 0);
    const found = hudFramesOver(stage, { left: 0, top: 0, right: 1024, bottom: 768 });
    expect(found.map((r) => r.left)).toEqual([10, 800]);
  });

  it('finds the mood tokens at the characters too', () => {
    document.body.innerHTML = '<div id="stage"><div data-mood-token="Tomas" id="t"></div><div data-hud-frame="mood" id="m"></div></div>';
    box(document.getElementById('t')!, 300, 640, 90, 38);
    box(document.getElementById('m')!, 800, 80, 140, 170);
    const found = hudFramesOver(document.getElementById('stage')!, { left: 0, top: 0, right: 1024, bottom: 768 });
    expect(found.map((r) => r.left).sort((a, b) => a - b)).toEqual([300, 800]);
  });
});
