import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ScreenHudLayer, buildScreenHudLayout, type ScreenHudCharacter } from '../../src/components/ScreenHudLayer';
import { HUD_LAYOUT_EVENT } from '../../src/utils/speechBubble';

/**
 * Speech bubbles keep clear of screen-docked panels, which are drawn outside
 * the stage the bubbles watch. In the Preview, going from Desktop back to a
 * tablet moved the panels onto the stage without the stage changing size,
 * and the reply bubble kept a place worked out while they were on their way
 * (over a character's face). The panels now say when they have moved.
 */
const meterFrame = { dockMode: 'screen', screenPosition: 'screen-top-right', width: 160, showLabels: true, meterHeight: 12, meterSpacing: 6, style: { padding: 8 } };
const cast: ScreenHudCharacter[] = [
  { id: 'tomas', name: 'Tomas', meterFrame: meterFrame as any, counters: [{ name: 'trust', label: "Tomas's trust", value: 0, min: -5, max: 5 } as any] },
];

describe('the screen HUD layer tells the bubbles when its panels move', () => {
  afterEach(() => vi.restoreAllMocks());

  it('once when drawn, again when a panel is somewhere else, and not in between', () => {
    let left = 800;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const frame = this.hasAttribute('data-hud-frame');
      return { left: frame ? left : 0, top: 10, right: (frame ? left : 0) + 160, bottom: 80, width: 160, height: 70, x: frame ? left : 0, y: 10, toJSON: () => ({}) } as DOMRect;
    });
    const heard = vi.fn();
    window.addEventListener(HUD_LAYOUT_EVENT, heard);
    const stage = { width: 1024, height: 768 };
    const layout = buildScreenHudLayout({ characters: cast, stage });
    const view = render(<ScreenHudLayer layout={layout} stage={stage} />);
    expect(view.container.querySelector('[data-hud-frame]')).toBeTruthy();
    expect(heard).toHaveBeenCalledTimes(1);

    view.rerender(<ScreenHudLayer layout={layout} stage={stage} />);
    expect(heard).toHaveBeenCalledTimes(1);

    left = 1000;
    view.rerender(<ScreenHudLayer layout={layout} stage={stage} />);
    expect(heard).toHaveBeenCalledTimes(2);
    window.removeEventListener(HUD_LAYOUT_EVENT, heard);
  });
});
