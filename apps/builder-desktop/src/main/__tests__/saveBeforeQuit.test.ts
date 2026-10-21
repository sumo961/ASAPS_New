import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { registerSaveBeforeQuit, saveEditorsBeforeQuit, editorCount, unsavedChangesDialog, _resetSaveBeforeQuit } from '../saveBeforeQuit';

class FakeEditor extends EventEmitter {
  sent: Array<[string, number]> = [];
  destroyed = false;
  send(channel: string, id: number) { this.sent.push([channel, id]); }
  isDestroyed() { return this.destroyed; }
}

function setup() {
  const ipc = new EventEmitter();
  registerSaveBeforeQuit({ on: (ch: string, fn: any) => ipc.on(ch, fn) } as any);
  const ready = (e: FakeEditor, on = true) => ipc.emit('app:save-before-quit:ready', { sender: e }, on);
  const answer = (e: FakeEditor, saved: boolean) => ipc.emit('app:save-before-quit:done', {}, e.sent[e.sent.length - 1][1], saved);
  return { ready, answer };
}

describe('saveBeforeQuit', () => {
  beforeEach(() => _resetSaveBeforeQuit());

  it('resolves true at once when no editor registered', async () => {
    setup();
    expect(editorCount()).toBe(0);
    await expect(saveEditorsBeforeQuit()).resolves.toBe(true);
  });

  it('waits for every editor and reports whether all saved', async () => {
    const { ready, answer } = setup();
    const a = new FakeEditor(); const b = new FakeEditor();
    ready(a); ready(b);
    const done = saveEditorsBeforeQuit();
    expect(a.sent[0][0]).toBe('app:save-before-quit');
    answer(a, true); answer(b, false);
    await expect(done).resolves.toBe(false);
  });

  it('ends a request when the window goes away', async () => {
    const { ready } = setup();
    const a = new FakeEditor();
    ready(a);
    const done = saveEditorsBeforeQuit();
    a.emit('render-process-gone');
    await expect(done).resolves.toBe(false);
  });

  it('ends a request when the window hangs', async () => {
    const { ready } = setup();
    const a = new FakeEditor();
    ready(a);
    const done = saveEditorsBeforeQuit((_editor, end) => end());
    await expect(done).resolves.toBe(false);
  });

  it('forgets editors that unregister or are destroyed', () => {
    const { ready } = setup();
    const a = new FakeEditor(); const b = new FakeEditor();
    ready(a); ready(b);
    ready(a, false);
    b.emit('destroyed');
    expect(editorCount()).toBe(0);
  });

  it('names the update in the dialog only when updating', () => {
    expect(unsavedChangesDialog(true).buttons?.[0]).toBe('Restart and install');
    expect(unsavedChangesDialog(false).buttons?.[0]).toBe('Close anyway');
    expect(unsavedChangesDialog(true).cancelId).toBe(1);
  });
});
