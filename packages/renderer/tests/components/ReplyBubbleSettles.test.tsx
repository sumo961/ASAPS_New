import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ReplyBubble } from '../../src/components/ReplyBubbleLayer';
import { HUD_LAYOUT_EVENT } from '../../src/utils/speechBubble';

/**
 * The reply bubble is placed from what is measured on the stage. Measured
 * while something around the stage was still moving (the Preview easing to
 * another device size, a screen-docked panel on its way), the place was
 * wrong and stayed: nothing on the stage itself changed afterwards. From
 * Desktop to a tablet in the Preview the replies ended up over a face.
 */
const rects = new Map<Element, [number, number, number, number]>();
const at = (el: Element, x: number, y: number, w: number, h: number) => rects.set(el, [x, y, w, h]);

beforeEach(() => {
  rects.clear();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

const Stage: React.FC = () => (
  <div data-testid="frame">
    <div data-testid="stage" style={{ position: 'relative' }}>
      <div data-character-name="Doctor" />
      <div data-speech-bubble="current" />
      <button>Yes, go on.</button>
      <ReplyBubble
        locations={[{ name: 'Doctor', kind: 'character', characterName: 'Doctor' } as any]}
        history={{ player: 'Doctor', replies: ['Yes, go on.'] } as any}
        theme={{ speakerDisplay: { replyStyle: 'bubble' } } as any}
      />
    </div>
  </div>
);

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = document.createElement('div');
  panel.setAttribute('data-hud-frame', 'meters');
  document.body.appendChild(panel);
  // Sizes have to be there before the layer first looks: lay the stage out by hand.
  const proto = HTMLElement.prototype;
  vi.spyOn(proto, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.testid === 'stage' ? 1000 : 0; });
  vi.spyOn(proto, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.testid === 'stage' ? 700 : 0; });
  // Rects by role, known as soon as the elements exist.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const known = rects.get(this);
    let r: [number, number, number, number] = [0, 0, 0, 0];
    if (known) r = known;
    else if (this.dataset.testid === 'stage') r = [0, 0, 1000, 700];
    else if (this.getAttribute('data-character-name')) r = [700, 300, 200, 400];
    else if (this.getAttribute('data-speech-bubble') === 'current') r = [100, 40, 10, 10];
    else if (this.tagName === 'BUTTON' && !this.hasAttribute('data-reply-line')) r = [300, 640, 200, 40];
    else if (this.getAttribute('aria-hidden') && this.style.visibility === 'hidden') r = [0, 0, 220, 90];
    const [x, y, w, h] = r;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) } as DOMRect;
  });
  const view = render(<Stage />, { container: host });
  const bubble = () => host.querySelector<HTMLElement>('[data-speech-bubble="replies"]');
  return { view, host, panel, bubble };
}

const frame = () => new Promise((r) => setTimeout(r, 5));

describe('the reply bubble looks again once things around the stage have come to rest', () => {
  it('when something the stage is inside has finished moving', async () => {
    const { host, panel, bubble } = mount();
    const first = bubble();
    expect(first).toBeTruthy();
    const was = { left: first!.style.left, top: first!.style.top };
    // A panel is now where the bubble is. Nothing on the stage changed.
    at(panel, parseFloat(was.left), parseFloat(was.top), 240, 120);
    await act(async () => { await frame(); });
    expect(bubble()!.style.left).toBe(was.left);
    await act(async () => {
      host.querySelector('[data-testid="frame"]')!.dispatchEvent(new Event('transitionend', { bubbles: true }));
      await frame();
    });
    const now = bubble();
    expect(now ? { left: now.style.left, top: now.style.top } : null).not.toEqual(was);
  });

  it('and when the screen HUD layer says its panels have moved', async () => {
    const { panel, bubble } = mount();
    const was = { left: bubble()!.style.left, top: bubble()!.style.top };
    at(panel, parseFloat(was.left), parseFloat(was.top), 240, 120);
    await act(async () => {
      window.dispatchEvent(new Event(HUD_LAYOUT_EVENT));
      await frame();
    });
    const now = bubble();
    expect(now ? { left: now.style.left, top: now.style.top } : null).not.toEqual(was);
  });
});

/**
 * Replies that were buttons for a moment (the stage still settling) told the
 * line's bubble to keep clear of the buttons; it moved into the one place the
 * reply bubble has, and the replies stayed buttons for good (author report,
 * 2026-11-21: a wolf, a girl, three replies).
 */
describe('replies that fell back to buttons while the stage settled', () => {
  it('become a bubble again once the line has gone back to its place', async () => {
    const { host, panel, bubble } = mount();
    const stage = host.querySelector<HTMLElement>('[data-testid="stage"]')!;
    const line = host.querySelector<HTMLElement>('[data-speech-bubble="current"]')!;
    const first = bubble()!;
    const place: [number, number, number, number] = [parseFloat(first.style.left), parseFloat(first.style.top), parseFloat(first.style.width), parseFloat(first.style.height)];

    // For a moment there is no place at all (a panel across the stage, on its way): buttons.
    at(panel, 0, 0, 1000, 700);
    await act(async () => { window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); await frame(); await frame(); });
    expect(bubble()).toBeNull();
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(true);

    // The panel is gone, but the line's bubble, keeping clear of the buttons, has moved into the reply bubble's place.
    at(panel, 2000, 0, 10, 10);
    at(line, place[0] + 10, place[1] + 10, 60, 30);
    await act(async () => { window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); await new Promise((r) => setTimeout(r, 1)); });
    // The word was taken back at that moment (the line's bubble is told through this attribute).
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(false);

    // So the line goes home, out of the way (its move is a change the layer sees): the replies are a bubble.
    at(line, 100, 40, 10, 10);
    await act(async () => { line.style.left = '100px'; await frame(); await frame(); await frame(); });
    expect(bubble()).toBeTruthy();
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(false);
  });

  it('stay buttons when the line is in the way wherever it is', async () => {
    const { host, bubble } = mount();
    const stage = host.querySelector<HTMLElement>('[data-testid="stage"]')!;
    at(host.querySelector<HTMLElement>('[data-speech-bubble="current"]')!, 0, 0, 1000, 700);
    for (let i = 0; i < 12; i++) {
      await act(async () => { window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); await frame(); await frame(); });
    }
    expect(bubble()).toBeNull();
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(true);
  });
});

/**
 * The line's bubble likes one place best, and that was where the replies'
 * bubble has to go. With the replies as buttons the line moved aside; with
 * the replies a bubble again it came back, and so on, thirty times a second
 * (author report, 2026-11-22: the wolf in the forest, with a knife in the
 * inventory).
 */
describe('the line and the replies wanting the same place', () => {
  it('the replies say where their bubble is, also at the moment they stop being buttons', async () => {
    const { host, panel, bubble } = mount();
    const stage = host.querySelector<HTMLElement>('[data-testid="stage"]')!;
    const line = host.querySelector<HTMLElement>('[data-speech-bubble="current"]')!;
    await act(async () => { await frame(); await frame(); });
    const first = bubble()!;
    const place = stage.getAttribute('data-reply-bubble-at')!;
    // It names the place the bubble is drawn at.
    expect(place.split(',').map(Number).slice(0, 2)).toEqual([Math.round(parseFloat(first.style.left)), Math.round(parseFloat(first.style.top))]);
    const [px, py] = place.split(',').map(Number);

    // No place for a moment: buttons, and nothing held.
    at(panel, 0, 0, 1000, 700);
    await act(async () => { window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); await frame(); await frame(); });
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(true);
    expect(stage.hasAttribute('data-reply-bubble-at')).toBe(false);

    // Only the line is in the way now. As the word is taken back, the place is already named.
    at(panel, 2000, 0, 10, 10);
    at(line, px + 10, py + 10, 60, 30);
    let heldWhenTold: string | null | undefined;
    const told = new MutationObserver(() => { if (!stage.hasAttribute('data-replies-as-buttons') && heldWhenTold === undefined) heldWhenTold = stage.getAttribute('data-reply-bubble-at'); });
    told.observe(stage, { attributes: true, attributeFilter: ['data-replies-as-buttons'] });
    await act(async () => { window.dispatchEvent(new Event(HUD_LAYOUT_EVENT)); await new Promise((r) => setTimeout(r, 1)); });
    told.disconnect();
    // (Where it would go with the line out of the way.)
    expect(heldWhenTold).toMatch(/^\d+,\d+,\d+,\d+$/);
  });

  it('a line that comes back every time ends in buttons, not in a flicker', async () => {
    const { host, bubble } = mount();
    const stage = host.querySelector<HTMLElement>('[data-testid="stage"]')!;
    const line = host.querySelector<HTMLElement>('[data-speech-bubble="current"]')!;
    expect(bubble()).toBeTruthy();
    // Wherever the replies' bubble could go.
    const inTheWay: [number, number, number, number] = [0, 0, 1000, 700];
    // A line that pays no heed to where the replies are: home while they are
    // buttons, into their place as soon as they are not.
    let flips = 0;
    const stubborn = new MutationObserver(() => {
      flips += 1;
      if (stage.hasAttribute('data-replies-as-buttons')) at(line, 100, 40, 10, 10); else at(line, ...inTheWay);
      line.style.left = `${flips}px`;
    });
    stubborn.observe(stage, { attributes: true, attributeFilter: ['data-replies-as-buttons'] });
    at(line, ...inTheWay);
    await act(async () => { line.style.left = '1px'; for (let i = 0; i < 80; i++) await frame(); });
    const settledAt = flips;
    await act(async () => { for (let i = 0; i < 40; i++) await frame(); });
    stubborn.disconnect();
    expect(flips).toBe(settledAt);
    expect(flips).toBeLessThan(20);
    expect(bubble()).toBeNull();
    expect(stage.hasAttribute('data-replies-as-buttons')).toBe(true);
  });
});

