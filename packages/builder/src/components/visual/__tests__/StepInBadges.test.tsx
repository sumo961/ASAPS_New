import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepInBadges, type StepInTarget } from '../StepInBadges';

/** jsdom lays nothing out: give every element a box so the replies count as drawn. */
const box = { x: 10, y: 20, left: 10, top: 20, right: 110, bottom: 50, width: 100, height: 30, toJSON: () => ({}) } as DOMRect;

describe('StepInBadges', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const mount = (targets: (host: HTMLElement) => StepInTarget[]) => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(box);
    // The suite's stand-in can't be constructed.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    return render(
      <div style={{ position: 'relative' }}>
        <button data-reply="a">Tell me more</button>
        <button data-reply="b">Goodbye</button>
        <button data-reply="c">Hm</button>
        <StepInBadges findTargets={targets} />
      </div>,
    );
  };

  it('says where each reply leads, and only a next line can be stepped into', () => {
    const onStep = vi.fn();
    mount((host) => {
      const [a, b, c] = Array.from(host.querySelectorAll('[data-reply]'));
      return [
        { key: 'a', node: a, onStep },
        { key: 'b', node: b, label: '→ The forest', title: 'This reply leaves this beat and goes to “The forest”.' },
        { key: 'c', node: c, label: '⚠ No exit', title: 'This reply has no next line and no exit.', warn: true },
      ];
    });

    const step = screen.getByText('Step in →');
    fireEvent.click(step);
    expect(onStep).toHaveBeenCalledTimes(1);

    const leaves = screen.getByText('→ The forest');
    expect(leaves.getAttribute('title')).toMatch(/goes to “The forest”/);
    fireEvent.click(leaves);
    expect(onStep).toHaveBeenCalledTimes(1);

    // A missing connection stands out from a reply that simply leaves the beat.
    const nowhere = screen.getByText('⚠ No exit');
    expect(nowhere.style.background).not.toBe(leaves.style.background);
    expect(nowhere.style.background).not.toBe(step.style.background);
  });

  it('gives a hidden reply no badge', () => {
    mount((host) => {
      const a = host.querySelector('[data-reply="a"]') as HTMLElement;
      a.style.visibility = 'hidden';
      return [{ key: 'a', node: a, onStep: () => undefined }];
    });
    expect(screen.queryByText('Step in →')).toBeNull();
  });
});
