/**
 * ReactRenderer.renderFreeLayout — a Free Layout beat's hand-placed screen:
 * the words on its text boxes and buttons, a click on one of its buttons,
 * its timer, a click anywhere; and the responsive placement by percent.
 */
import { describe, it, expect, vi } from 'vitest';
import { ReactRenderer } from '../../src/renderers/ReactRenderer';
import { placeByPercent } from '../../src/utils/freeLayoutPlacement';
import { FREE_LAYOUT_NEXT, FREE_LAYOUT_TIMEOUT, type FreeLayoutScreen, type Location } from '@asaps/core';

const stage: Location[] = [
  { name: 'Sign', kind: 'text', x: 20, y: 20, width: 400, height: 80 } as Location,
  { name: 'Door', kind: 'button', x: 20, y: 200, width: 160, height: 50 } as Location,
  { name: 'Window', kind: 'button', x: 220, y: 200, width: 160, height: 50 } as Location,
];

// jsdom has no ResizeObserver (the stage measures itself with one).
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = new ReactRenderer({ container, width: 1000, height: 600 } as any);
  return { renderer, container };
}

const screen = (over: Partial<FreeLayoutScreen> = {}): FreeLayoutScreen => ({
  locations: stage,
  texts: { Sign: 'The hall is quiet.', Door: 'Leave', Window: 'Look out' },
  buttons: [{ id: 'b_door', locationName: 'Door' }, { id: 'b_window', locationName: 'Window' }],
  hidden: [],
  duration: 0,
  clickAnywhere: false,
  ...over,
});

const findText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length === 0 && e.textContent?.trim() === text);

describe('renderFreeLayout', () => {
  it('shows the words and answers with the clicked button', async () => {
    const { renderer, container } = setup();
    const answer = renderer.renderFreeLayout(screen());
    await vi.waitFor(() => expect(findText(container, 'Leave')).toBeTruthy());
    await vi.waitFor(() => expect(findText(container, 'The hall is quiet.')).toBeTruthy());
    (findText(container, 'Leave')!.closest('button, [role="button"]') as HTMLElement ?? findText(container, 'Leave')!).click();
    await expect(answer).resolves.toBe('b_door');
  });

  it('a hidden button is not shown, and a click that is not one of its buttons is ignored', async () => {
    const { renderer, container } = setup();
    const answer = renderer.renderFreeLayout(screen({ hidden: ['Window'], buttons: [{ id: 'b_door', locationName: 'Door' }] }));
    await vi.waitFor(() => expect(findText(container, 'Leave')).toBeTruthy());
    expect(findText(container, 'Look out')).toBeUndefined();
    let settled = false;
    void answer.then(() => { settled = true; });
    (renderer as any).handleAction('Sign');
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    (renderer as any).handleAction('b_door');
    await expect(answer).resolves.toBe('b_door');
  });

  it('goes on by itself when the timer runs out', async () => {
    const { renderer } = setup();
    await expect(renderer.renderFreeLayout(screen({ duration: 0.05 }))).resolves.toBe(FREE_LAYOUT_TIMEOUT);
  });

  it('with no buttons and no timer, a click anywhere goes on', async () => {
    const { renderer, container } = setup();
    const answer = renderer.renderFreeLayout(screen({ buttons: [], locations: [stage[0]], clickAnywhere: true }));
    await vi.waitFor(() => expect(findText(container, 'The hall is quiet.')).toBeTruthy());
    findText(container, 'The hall is quiet.')!.click();
    await expect(answer).resolves.toBe(FREE_LAYOUT_NEXT);
  });
});

describe('placeByPercent', () => {
  it('uses the percent position and size on the stage it is drawn on', () => {
    const loc = { name: 'a', kind: 'text', x: 0, y: 0, width: 0, height: 0, xPercent: 10, yPercent: 50, widthPercent: 40, heightPercent: 20 } as Location;
    expect(placeByPercent(loc, { width: 1920, height: 1080 }, { width: 390, height: 740 })).toMatchObject({ x: 39, y: 370, width: 156, height: 148 });
  });
  it('reads a pixel-placed element as a share of the stage it was placed on', () => {
    const loc = { name: 'a', kind: 'text', x: 192, y: 108, width: 960, height: 216 } as Location;
    expect(placeByPercent(loc, { width: 1920, height: 1080 }, { width: 1000, height: 500 })).toMatchObject({ x: 100, y: 50, width: 500, height: 100 });
  });
});
