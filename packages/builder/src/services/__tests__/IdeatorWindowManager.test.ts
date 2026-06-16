/**
 * Tests for IdeatorWindowManager (web/non-Electron path). Same window.open +
 * postMessage shape as DebugWindowManager: we spy window.open, dispatch
 * 'message' events, and assert the open state machine, the project-context URL
 * params, the SUBMIT_REQUEST relay to onSubmit listeners, and the
 * generation-complete/failed pushes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdeatorWindowManager } from '../IdeatorWindowManager';

const ORIGIN = window.location.origin;

let mgr: IdeatorWindowManager;
let fakeWin: any;
let openSpy: any;

beforeEach(() => {
  fakeWin = { closed: false, focus: vi.fn(), postMessage: vi.fn(), close: vi.fn() };
  openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);
  mgr = new IdeatorWindowManager();
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
});

describe('open', () => {
  it('opens the #/ideator-window route and reports open', () => {
    expect(mgr.open()).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('#/ideator-window'),
      'asaps-ideator',
      expect.stringContaining('width=720'),
    );
    expect(mgr.isWindowOpen()).toBe(true);
  });

  it('encodes project title and id into the URL fragment', () => {
    mgr.open({ projectTitle: 'My Saga', projectId: 'p42' });
    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('title=My+Saga');
    expect(url).toContain('projectId=p42');
  });

  it('focuses without re-opening when already open', () => {
    mgr.open();
    expect(mgr.open()).toBe(true);
    expect(fakeWin.focus).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('returns false when the popup is blocked', () => {
    openSpy.mockReturnValue(null);
    expect(mgr.open()).toBe(false);
    expect(mgr.isWindowOpen()).toBe(false);
  });
});

describe('generation notifications', () => {
  it('posts GENERATION_COMPLETE to the open window', () => {
    mgr.open();
    mgr.notifyGenerationComplete();
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GENERATION_COMPLETE' }),
      ORIGIN,
    );
  });

  it('posts GENERATION_FAILED with the error', () => {
    mgr.open();
    mgr.notifyGenerationFailed('boom');
    expect(fakeWin.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GENERATION_FAILED', payload: { error: 'boom' } }),
      ORIGIN,
    );
  });

  it('is a no-op when the window is closed', () => {
    mgr.notifyGenerationComplete();
    expect(fakeWin.postMessage).not.toHaveBeenCalled();
  });
});

describe('incoming SUBMIT_REQUEST', () => {
  it('relays a valid request to onSubmit listeners', () => {
    const onSubmit = vi.fn();
    mgr.onSubmit(onSubmit);
    const request = { prompt: 'A noir mystery', genre: 'noir' };
    fireMessage({ type: 'SUBMIT_REQUEST', payload: { request } });
    expect(onSubmit).toHaveBeenCalledWith(request);
  });

  it('ignores a request without a string prompt', () => {
    const onSubmit = vi.fn();
    mgr.onSubmit(onSubmit);
    fireMessage({ type: 'SUBMIT_REQUEST', payload: { request: { genre: 'noir' } } });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores messages from a foreign origin', () => {
    const onSubmit = vi.fn();
    mgr.onSubmit(onSubmit);
    fireMessage({ type: 'SUBMIT_REQUEST', payload: { request: { prompt: 'x' } } }, 'https://evil.example');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('unsubscribe stops onSubmit notifications', () => {
    const onSubmit = vi.fn();
    const unsub = mgr.onSubmit(onSubmit);
    unsub();
    fireMessage({ type: 'SUBMIT_REQUEST', payload: { request: { prompt: 'x' } } });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('close', () => {
  it('closes the window and reports closed', () => {
    mgr.open();
    mgr.close();
    expect(fakeWin.close).toHaveBeenCalled();
    expect(mgr.isWindowOpen()).toBe(false);
  });
});
