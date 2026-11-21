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
