/**
 * Tests for DebugWindowManager (web/non-Electron path). jsdom has no
 * window.electronAPI, so the manager uses window.open + postMessage. We spy on
 * window.open with a fake window, dispatch 'message' events to exercise the
 * highlight relay, and assert the open/close state machine and STORY_UPDATE
 * push. A fresh instance per test (destroyed in afterEach) avoids listener leak.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DebugWindowManager } from '../DebugWindowManager';

const ORIGIN = window.location.origin;
const story = (over: any = {}) => ({ beats: [], connections: [], ...over }) as any;

let mgr: DebugWindowManager;
let fakeWin: any;
let openSpy: any;

beforeEach(() => {
  fakeWin = { closed: false, focus: vi.fn(), postMessage: vi.fn(), close: vi.fn() };
  openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);
  mgr = new DebugWindowManager();
});

afterEach(() => {
  mgr.destroy();
  openSpy.mockRestore();
});

const fireMessage = (data: any, origin: string = ORIGIN) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin }));

describe('subscribe / state', () => {
  it('invokes the subscriber immediately with the closed state', () => {
    const cb = vi.fn();
    mgr.subscribe(cb);
    expect(cb).toHaveBeenCalledWith({ isOpen: false });
  });

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn();
    const unsub = mgr.subscribe(cb);
    cb.mockClear();
    unsub();
    mgr.open(story());
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('open', () => {
  it('opens the #/debug-window hash route and reports open', () => {
    expect(mgr.open(story())).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('#/debug-window'),
      'asaps-debug',
      expect.stringContaining('width=900'),
    );
    expect(mgr.isWindowOpen()).toBe(true);
    expect(mgr.getState()).toEqual({ isOpen: true });
  });

  it('pushes a STORY_UPDATE to the window', () => {
    mgr.open(story({ beats: [{ id: 'b1' }] }));
    // open() does not post by itself when freshly opened, but sendStoryUpdate does
    mgr.sendStoryUpdate(story({ beats: [{ id: 'b2' }] }));
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STORY_UPDATE' }),
      ORIGIN,
    );
  });

  it('focuses and re-sends when already open', () => {
    mgr.open(story());
    fakeWin.postMessage.mockClear();
    expect(mgr.open(story())).toBe(true);
    expect(fakeWin.focus).toHaveBeenCalled();
    expect(fakeWin.postMessage).toHaveBeenCalled();
  });

  it('returns false and stays closed when the popup is blocked', () => {
    openSpy.mockReturnValue(null);
    expect(mgr.open(story())).toBe(false);
    expect(mgr.isWindowOpen()).toBe(false);
  });
});

describe('close', () => {
  it('closes the window and clears highlights', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    mgr.open(story());
    mgr.close();
    expect(fakeWin.close).toHaveBeenCalled();
    expect(mgr.isWindowOpen()).toBe(false);
    expect(hi).toHaveBeenCalledWith({ kind: 'clear' });
  });
});

describe('incoming messages', () => {
  it('relays HIGHLIGHT_PATH to highlight listeners', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    fireMessage({ type: 'HIGHLIGHT_PATH', payload: { beatIds: ['a', 'b'] } });
    expect(hi).toHaveBeenCalledWith({ kind: 'path', beatIds: ['a', 'b'] });
  });

  it('relays HIGHLIGHT_BEAT', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    fireMessage({ type: 'HIGHLIGHT_BEAT', payload: { beatId: 'x' } });
    expect(hi).toHaveBeenCalledWith({ kind: 'beat', beatId: 'x' });
  });

  it('relays CLEAR_HIGHLIGHT', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    fireMessage({ type: 'CLEAR_HIGHLIGHT' });
    expect(hi).toHaveBeenCalledWith({ kind: 'clear' });
  });

  it('ignores messages from a foreign origin', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    fireMessage({ type: 'HIGHLIGHT_BEAT', payload: { beatId: 'x' } }, 'https://evil.example');
    expect(hi).not.toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const hi = vi.fn();
    mgr.subscribeToHighlights(hi);
    fireMessage(null);
    fireMessage({ noType: true });
    expect(hi).not.toHaveBeenCalled();
  });
});
