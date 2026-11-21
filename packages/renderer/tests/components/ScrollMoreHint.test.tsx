import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { ScrollMoreHint } from '../../src/components/ScrollIndicator';

/**
 * On a phone the player's replies scroll inside the stage, and nothing said
 * so but the last reply being cut off at the edge.
 */
function mount(scrollHeight: number, clientHeight: number, hiddenButtons = false) {
  const view = render(
    <div data-testid="list" style={{ overflowY: 'auto' }}>
      <button style={hiddenButtons ? { visibility: 'hidden' } : undefined}>One</button>
      <ScrollMoreHint />
    </div>,
  );
  const list = view.getByTestId('list');
  let top = 0;
  Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
  act(() => { fireEvent.scroll(list); });
  const hint = () => view.container.querySelector('[data-scroll-more]')!.getAttribute('data-scroll-more');
  return { view, list, hint, scrollTo: (v: number) => act(() => { top = v; fireEvent.scroll(list); }) };
}

describe('the hint that a list scrolls', () => {
  it('shows while there is more below and goes at the end', () => {
    const { hint, scrollTo, view } = mount(400, 200);
    expect(hint()).toBe('yes');
    expect(view.getByLabelText('More below')).toBeTruthy();
    scrollTo(200);
    expect(hint()).toBe('no');
    expect(view.queryByLabelText('More below')).toBeNull();
  });

  it('is not there for a list that fits', () => {
    expect(mount(200, 200).hint()).toBe('no');
  });

  it('a tap on it scrolls on', () => {
    const { list, view } = mount(400, 200);
    fireEvent.click(view.getByLabelText('More below'));
    expect(list.scrollTop).toBe(160);
  });

  it('is not shown for replies that are hidden (they are in a bubble)', () => {
    expect(mount(400, 200, true).hint()).toBe('no');
  });

  it('is not shown when only the empty strip under the last entry is out of sight', () => {
    const view = render(
      <div data-testid="list" style={{ overflowY: 'auto' }}>
        <button id="only">Continue</button>
        <ScrollMoreHint />
      </div>,
    );
    const list = view.getByTestId('list');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 119 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 103 });
    const rect = (top: number, bottom: number) => ({ left: 0, right: 100, top, bottom, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    list.getBoundingClientRect = () => rect(0, 103);
    (view.container.querySelector('#only') as HTMLElement).getBoundingClientRect = () => rect(25, 69);
    act(() => { fireEvent.scroll(list); });
    expect(view.container.querySelector('[data-scroll-more]')!.getAttribute('data-scroll-more')).toBe('no');
  });

  it('takes no room in the list', () => {
    const { view } = mount(400, 200);
    const root = view.container.querySelector<HTMLElement>('[data-scroll-more]')!;
    expect(root.style.height).toBe('0px');
    expect(root.style.position).toBe('sticky');
  });
});
