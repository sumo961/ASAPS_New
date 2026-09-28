// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { PlayerUI } from '../src/PlayerUI';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// Node's own localStorage getter throws without --localstorage-file; the UI
// only reads saved settings from it.
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

function mountPlayer() {
  const player: any = {
    restart: vi.fn(async () => {}),
    isPaused: () => false,
    getPlayTime: () => 0,
    getSaveSlots: async () => [],
    getSaveSystem: () => null,
    getStoryTitle: () => 'Test',
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<PlayerUI player={player} />));
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
  return { player, host, root, button };
}

describe('player menu Restart', () => {
  it('asks in the menu instead of a native confirm, and only restarts on "Restart now"', async () => {
    const confirmSpy = vi.fn(() => true);
    (window as any).confirm = confirmSpy;
    const { player, host, root, button } = mountPlayer();

    act(() => button('Restart')!.click());
    expect(player.restart).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Unsaved progress will be lost');

    act(() => button('Keep playing')!.click());
    expect(button('Restart')).toBeDefined();
    expect(player.restart).not.toHaveBeenCalled();

    act(() => button('Restart')!.click());
    await act(async () => button('Restart now')!.click());
    expect(player.restart).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
