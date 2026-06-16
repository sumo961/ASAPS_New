/**
 * Tests for PreviewWindowManager (web/non-Electron path). Same window.open +
 * postMessage family as the Debug/Ideator managers, plus: an async open(), a
 * pending-data flush on PING, the navigate/state-preset pushes, and the
 * VISITED_BEATS_UPDATE live-trace relay. window.open is spied with a fake
 * window; 'message' events drive the inbound handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreviewWindowManager } from '../PreviewWindowManager';

const ORIGIN = window.location.origin;
const data = (over: any = {}) => ({ storyData: { beats: [], connections: [] }, ...over }) as any;

let mgr: PreviewWindowManager;
let fakeWin: any;
let openSpy: any;

beforeEach(() => {
  fakeWin = { closed: false, focus: vi.fn(), postMessage: vi.fn(), close: vi.fn() };
  openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);
  mgr = new PreviewWindowManager();
});

afterEach(() => {
  mgr.destroy();
  openSpy.mockRestore();
});

const fireMessage = (d: any, origin: string = ORIGIN) =>
  window.dispatchEvent(new MessageEvent('message', { data: d, origin }));

describe('subscribe / state', () => {
  it('notifies the subscriber immediately with the closed/idle state', () => {
    const cb = vi.fn();
    mgr.subscribe(cb);
    expect(cb).toHaveBeenCalledWith({ isOpen: false, isPending: false });
  });

  it('notifies a visited-beats subscriber immediately with the empty trace', () => {
    const cb = vi.fn();
    mgr.subscribeToVisitedBeats(cb);
    expect(cb).toHaveBeenCalledWith({ visitedBeatIds: [], currentBeatId: null });
  });
});

describe('open', () => {
  it('opens the #/preview-window route and reports open + pending', async () => {
    expect(await mgr.open(data())).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('#/preview-window'),
      'asaps-preview',
      expect.stringContaining('width=1200'),
    );
    expect(mgr.getState()).toEqual({ isOpen: true, isPending: true });
  });

  it('is not pending when opened without initial data', async () => {
    await mgr.open();
    expect(mgr.getState()).toEqual({ isOpen: true, isPending: false });
  });

  it('flushes pending data to the window on PING', async () => {
    await mgr.open(data({ storyData: { beats: [{ id: 'b1' }], connections: [] } }));
    fireMessage({ type: 'PING' });
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STORY_UPDATE' }),
      ORIGIN,
    );
    expect(mgr.getState().isPending).toBe(false);
  });

  it('focuses and re-sends when already open', async () => {
    await mgr.open();
    fakeWin.postMessage.mockClear();
    expect(await mgr.open(data())).toBe(true);
    expect(fakeWin.focus).toHaveBeenCalled();
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STORY_UPDATE' }),
      ORIGIN,
    );
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('returns false when the popup is blocked', async () => {
    openSpy.mockReturnValue(null);
    expect(await mgr.open(data())).toBe(false);
    expect(mgr.isWindowOpen()).toBe(false);
  });
});

describe('outbound messages', () => {
  beforeEach(async () => {
    await mgr.open();
    fakeWin.postMessage.mockClear();
  });

  it('sendUpdate posts a STORY_UPDATE', () => {
    mgr.sendUpdate(data());
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STORY_UPDATE' }),
      ORIGIN,
    );
  });

  it('navigateToBeat posts NAVIGATE_TO_BEAT', () => {
    mgr.navigateToBeat('b7');
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      { type: 'NAVIGATE_TO_BEAT', payload: { beatId: 'b7' } },
      ORIGIN,
    );
  });

  it('applyStatePreset posts STATE_PRESET', () => {
    const preset = { id: 'p1', name: 'Midgame', variables: {} } as any;
    mgr.applyStatePreset(preset);
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      { type: 'STATE_PRESET', payload: { statePreset: preset } },
      ORIGIN,
    );
  });
});

describe('outbound messages are no-ops when closed', () => {
  it('sendUpdate / navigateToBeat / applyStatePreset do nothing', () => {
    mgr.sendUpdate(data());
    mgr.navigateToBeat('b1');
    mgr.applyStatePreset({} as any);
    expect(fakeWin.postMessage).not.toHaveBeenCalled();
  });
});

describe('inbound VISITED_BEATS_UPDATE', () => {
  it('relays the trace and remembers it for late subscribers', async () => {
    await mgr.open();
    const cb = vi.fn();
    mgr.subscribeToVisitedBeats(cb);
    cb.mockClear();

    fireMessage({ type: 'VISITED_BEATS_UPDATE', payload: { visitedBeats: ['a', 'b'], currentBeatId: 'b' } });
    expect(cb).toHaveBeenCalledWith({ visitedBeatIds: ['a', 'b'], currentBeatId: 'b' });

    // A new subscriber gets the last-known trace immediately
    const late = vi.fn();
    mgr.subscribeToVisitedBeats(late);
    expect(late).toHaveBeenCalledWith({ visitedBeatIds: ['a', 'b'], currentBeatId: 'b' });
  });

  it('ignores messages from a foreign origin', async () => {
    await mgr.open();
    const cb = vi.fn();
    mgr.subscribeToVisitedBeats(cb);
    cb.mockClear();
    fireMessage({ type: 'VISITED_BEATS_UPDATE', payload: { visitedBeats: ['x'] } }, 'https://evil.example');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('close', () => {
  it('closes the window and clears the visited trace', async () => {
    await mgr.open();
    const cb = vi.fn();
    mgr.subscribeToVisitedBeats(cb);
    cb.mockClear();
    mgr.close();
    expect(fakeWin.close).toHaveBeenCalled();
    expect(mgr.isWindowOpen()).toBe(false);
    expect(cb).toHaveBeenCalledWith({ visitedBeatIds: [], currentBeatId: null });
  });
});
