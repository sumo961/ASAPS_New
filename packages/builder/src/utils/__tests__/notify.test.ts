import { describe, it, expect, vi, afterEach } from 'vitest';
import { notify, confirmAction, subscribeNotices, errorMessage, type Notice, type ConfirmRequest } from '../notify';
import { undoCommandAction, undoLatestAction } from '../undoNotice';

let unsubscribe: (() => void) | null = null;
afterEach(() => { unsubscribe?.(); unsubscribe = null; vi.restoreAllMocks(); });

function capture() {
  const notices: Notice[] = [];
  const confirms: ConfirmRequest[] = [];
  unsubscribe = subscribeNotices((n) => notices.push(n), (c) => confirms.push(c));
  return { notices, confirms };
}

describe('notify', () => {
  it('errors are sticky by default; success/info/warning auto-dismiss', () => {
    const { notices } = capture();
    notify.error('boom'); notify.success('ok'); notify.info('fyi'); notify.warning('hm');
    expect(notices.map((n) => [n.kind, n.sticky])).toEqual([
      ['error', true], ['success', false], ['info', false], ['warning', false],
    ]);
  });

  it('carries detail, action and explicit stickiness', () => {
    const { notices } = capture();
    const run = vi.fn();
    notify.warning('changed', { detail: 'a.json', sticky: true, action: { label: 'Reload', run } });
    expect(notices[0]).toMatchObject({ message: 'changed', detail: 'a.json', sticky: true, action: { label: 'Reload' } });
  });

  it('with no host mounted, falls back to the console instead of dropping the message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    notify.error('unseen failure', { detail: 'why' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unseen failure'));
  });

  it('errorMessage handles Error, string and junk', () => {
    expect(errorMessage(new Error('x'))).toBe('x');
    expect(errorMessage('y')).toBe('y');
    expect(errorMessage(42)).toBe('Unknown error');
  });
});

describe('confirmAction', () => {
  it('resolves with the host’s answer', async () => {
    const { confirms } = capture();
    const p = confirmAction({ title: 'Delete?', confirmLabel: 'Delete', destructive: true });
    expect(confirms[0]).toMatchObject({ title: 'Delete?', confirmLabel: 'Delete', cancelLabel: 'Cancel', destructive: true });
    confirms[0].resolve(true);
    await expect(p).resolves.toBe(true);
  });

  it('never destroys data without an answer: no host → fallback (default false)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(confirmAction({ title: 'Delete?' })).resolves.toBe(false);
    await expect(confirmAction({ title: 'Proceed?', fallback: true })).resolves.toBe(true);
  });
});

describe('Undo actions revert THIS change only', () => {
  function fakeManager() {
    const history: unknown[] = [];
    let index = -1;
    return {
      history,
      push(c: unknown) { history.splice(index + 1); history.push(c); index = history.length - 1; },
      getHistory: () => history,
      getCurrentIndex: () => index,
      undo: vi.fn(async () => { index--; return true; }),
    };
  }

  it('undoes the bound command while it is still the latest', async () => {
    const m = fakeManager();
    const cmd = {}; m.push(cmd);
    await undoCommandAction(cmd, 'Undo', m).run();
    expect(m.undo).toHaveBeenCalledTimes(1);
  });

  it('refuses (and explains) once something newer was done', async () => {
    const { notices } = capture();
    const m = fakeManager();
    const cmd = {}; m.push(cmd); m.push({});
    await undoCommandAction(cmd, 'Undo', m).run();
    expect(m.undo).not.toHaveBeenCalled();
    expect(notices.at(-1)?.message).toMatch(/no longer the latest/);
  });

  it('undoLatestAction binds to the command on top at creation time', async () => {
    const m = fakeManager();
    expect(undoLatestAction('Undo', m)).toBeUndefined(); // empty history → no button
    const first = {}; m.push(first);
    const action = undoLatestAction('Undo', m)!;
    m.push({}); // author keeps working
    await action.run();
    expect(m.undo).not.toHaveBeenCalled();
  });
});
