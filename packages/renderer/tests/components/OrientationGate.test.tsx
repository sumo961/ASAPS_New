/**
 * Tests for OrientationGate — the player's orientation lock. 'flexible' passes
 * children through; 'portrait'/'landscape' draw a blocking "rotate" overlay
 * (role=alert) whenever the device is held the other way, while keeping the
 * children mounted underneath. matchMedia is stubbed with a live getter so the
 * 'change' listener can flip the gate at runtime.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { OrientationGate } from '../../src/components/OrientationGate';

let portrait = true;
let changeListeners: Array<() => void> = [];

beforeEach(() => {
  portrait = true;
  changeListeners = [];
  window.matchMedia = vi.fn((q: string) => ({
    get matches() {
      return q.includes('portrait') ? portrait : !portrait;
    },
    media: q,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => changeListeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      changeListeners = changeListeners.filter((l) => l !== cb);
    },
    addListener: (cb: () => void) => changeListeners.push(cb),
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as any;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const child = <div data-testid="story">STORY</div>;

describe('OrientationGate', () => {
  it('flexible renders children with no overlay', () => {
    portrait = false;
    const { queryByRole, getByTestId } = render(<OrientationGate orientation="flexible">{child}</OrientationGate>);
    expect(getByTestId('story')).toBeTruthy();
    expect(queryByRole('alert')).toBeNull();
  });

  it('no overlay when the device already matches the locked orientation', () => {
    portrait = true;
    const { queryByRole } = render(<OrientationGate orientation="portrait">{child}</OrientationGate>);
    expect(queryByRole('alert')).toBeNull();
  });

  it('shows the rotate overlay when locked portrait but device is landscape', () => {
    portrait = false;
    const { getByRole, getByTestId } = render(<OrientationGate orientation="portrait">{child}</OrientationGate>);
    const alert = getByRole('alert');
    expect(alert.getAttribute('aria-label')).toMatch(/portrait/);
    // story stays mounted underneath
    expect(getByTestId('story')).toBeTruthy();
  });

  it('shows the overlay when locked landscape but device is portrait', () => {
    portrait = true;
    const { getByRole } = render(<OrientationGate orientation="landscape">{child}</OrientationGate>);
    expect(getByRole('alert').getAttribute('aria-label')).toMatch(/landscape/);
  });

  it('clears the overlay when the device rotates into the locked orientation', () => {
    portrait = false; // start mismatched (locked portrait, device landscape)
    const { queryByRole } = render(<OrientationGate orientation="portrait">{child}</OrientationGate>);
    expect(queryByRole('alert')).not.toBeNull();

    act(() => {
      portrait = true; // device rotates to portrait
      changeListeners.forEach((l) => l());
    });
    expect(queryByRole('alert')).toBeNull();
  });
});
