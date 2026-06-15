/**
 * Tests for CommandManager — the undo/redo history stack behind the editor.
 * Auto-save is disabled (no projectId / autoSave:false) so no timers or
 * storage are touched; commands are structural fakes implementing the
 * Command surface the manager calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandManager } from '../CommandManager';
import type { Command } from '../Command';

function makeCmd(type = 'test', over: Partial<Record<string, any>> = {}): Command {
  return {
    type,
    description: type,
    execute: vi.fn(async () => {}),
    undo: vi.fn(async () => {}),
    redo: vi.fn(async () => {}),
    canMergeWith: vi.fn(() => false),
    mergeWith: vi.fn(),
    toJSON: vi.fn(() => ({ type })),
    ...over,
  } as unknown as Command;
}

let mgr: CommandManager;
beforeEach(() => {
  mgr = new CommandManager({ autoSave: false });
});

describe('initial state', () => {
  it('has nothing to undo or redo', () => {
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getHistorySize()).toBe(0);
    expect(mgr.getCurrentIndex()).toBe(-1);
  });
});

describe('execute / undo / redo', () => {
  it('executes a command and pushes it onto history', async () => {
    const c = makeCmd('add');
    await mgr.execute(c);
    expect(c.execute).toHaveBeenCalledOnce();
    expect(mgr.getHistorySize()).toBe(1);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.getUndoCommand()).toBe(c);
  });

  it('undo calls command.undo and flips undo→redo availability', async () => {
    const c = makeCmd();
    await mgr.execute(c);
    const ok = await mgr.undo();
    expect(ok).toBe(true);
    expect(c.undo).toHaveBeenCalledOnce();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(true);
    expect(mgr.getRedoCommand()).toBe(c);
  });

  it('redo calls command.redo and re-applies it', async () => {
    const c = makeCmd();
    await mgr.execute(c);
    await mgr.undo();
    const ok = await mgr.redo();
    expect(ok).toBe(true);
    expect(c.redo).toHaveBeenCalledOnce();
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo/redo return false when there is nothing to do', async () => {
    expect(await mgr.undo()).toBe(false);
    expect(await mgr.redo()).toBe(false);
  });

  it('executing after an undo discards the redo branch', async () => {
    const a = makeCmd('a');
    const b = makeCmd('b');
    const c = makeCmd('c');
    await mgr.execute(a);
    await mgr.execute(b);
    await mgr.undo(); // back to a; b is now redoable
    await mgr.execute(c); // should drop b
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getHistorySize()).toBe(2);
    expect(mgr.getHistory().map((x) => x.type)).toEqual(['a', 'c']);
  });
});

describe('merging', () => {
  it('merges a command into the previous one instead of pushing', async () => {
    const first = makeCmd('typing', { canMergeWith: vi.fn(() => true), mergeWith: vi.fn() });
    const second = makeCmd('typing');
    await mgr.execute(first);
    await mgr.execute(second);
    expect(first.mergeWith).toHaveBeenCalledWith(second);
    expect(mgr.getHistorySize()).toBe(1); // not pushed separately
  });
});

describe('history bounds + clear', () => {
  it('trims history to maxHistory, dropping the oldest', async () => {
    const m = new CommandManager({ autoSave: false, maxHistory: 2 });
    await m.execute(makeCmd('a'));
    await m.execute(makeCmd('b'));
    await m.execute(makeCmd('c'));
    expect(m.getHistorySize()).toBe(2);
    expect(m.getHistory().map((x) => x.type)).toEqual(['b', 'c']);
  });

  it('clear empties the stack', async () => {
    await mgr.execute(makeCmd());
    mgr.clear();
    expect(mgr.getHistorySize()).toBe(0);
    expect(mgr.canUndo()).toBe(false);
  });

  it('pushWithoutExecute records a command without executing it', () => {
    const c = makeCmd('preapplied');
    mgr.pushWithoutExecute(c);
    expect(c.execute).not.toHaveBeenCalled();
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.getHistorySize()).toBe(1);
  });
});

describe('subscribe + stats', () => {
  it('notifies subscribers on execute and stops after unsubscribe', async () => {
    const listener = vi.fn();
    const unsub = mgr.subscribe(listener);
    await mgr.execute(makeCmd());
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    unsub();
    await mgr.execute(makeCmd());
    expect(listener).not.toHaveBeenCalled();
  });

  it('getStats reflects undo/redo counts', async () => {
    await mgr.execute(makeCmd('a'));
    await mgr.undo();
    const s = mgr.getStats();
    expect(s).toMatchObject({ totalCommands: 1, currentIndex: -1, canUndo: false, canRedo: true, undoCount: 0, redoCount: 1 });
  });
});
