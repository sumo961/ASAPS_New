/**
 * Tests for useCommandManager — the React wrapper around the singleton
 * CommandManager. Covers execute/undo/redo state sync, the onCommandExecuted
 * callback, history clear, and the Ctrl/Cmd+Z / Shift+Z / Y keyboard shortcuts
 * (and their opt-out). The manager is a singleton, so each test clears it first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCommandManager, useCommandKeyboardShortcuts } from '../useCommandManager';
import { getCommandManager } from '../../commands/CommandManager';
import { Command } from '../../commands/Command';

class FakeCommand extends Command {
  readonly type = 'FAKE';
  description = 'fake';
  constructor(private log: string[] = []) {
    super();
  }
  execute() {
    this.log.push('exec');
  }
  undo() {
    this.log.push('undo');
  }
  protected serializeData() {
    return {};
  }
}

beforeEach(() => {
  getCommandManager().clear();
});
afterEach(() => {
  getCommandManager().clear();
});

const key = (k: string, opts: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key: k, ctrlKey: true, ...opts });

describe('useCommandManager state', () => {
  it('starts with nothing to undo/redo', () => {
    const { result } = renderHook(() => useCommandManager(undefined, false));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('execute enables undo and fires onCommandExecuted', async () => {
    const onCommandExecuted = vi.fn();
    // new-format options MUST carry a `managerOptions` key, else the hook's
    // dual-format detection treats the object as legacy CommandManagerOptions.
    const { result } = renderHook(() =>
      useCommandManager({ managerOptions: undefined, enableKeyboardShortcuts: false, onCommandExecuted }),
    );
    const cmd = new FakeCommand();
    await act(async () => {
      await result.current.execute(cmd);
    });
    expect(result.current.canUndo).toBe(true);
    expect(onCommandExecuted).toHaveBeenCalledWith('execute', cmd);
  });

  it('undo then redo round-trips the state flags', async () => {
    const { result } = renderHook(() => useCommandManager(undefined, false));
    await act(async () => {
      await result.current.execute(new FakeCommand());
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    await act(async () => {
      await result.current.redo();
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('clear() empties the history', async () => {
    const { result } = renderHook(() => useCommandManager(undefined, false));
    await act(async () => {
      await result.current.execute(new FakeCommand());
    });
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
  });
});

describe('keyboard shortcuts', () => {
  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo', async () => {
    const { result } = renderHook(() => useCommandManager(undefined, true));
    await act(async () => {
      await result.current.execute(new FakeCommand());
    });

    await act(async () => {
      window.dispatchEvent(key('z'));
    });
    await waitFor(() => expect(result.current.canRedo).toBe(true));

    await act(async () => {
      window.dispatchEvent(key('z', { shiftKey: true }));
    });
    await waitFor(() => expect(result.current.canRedo).toBe(false));

    // undo again, then redo via Ctrl+Y
    await act(async () => {
      window.dispatchEvent(key('z'));
    });
    await waitFor(() => expect(result.current.canRedo).toBe(true));
    await act(async () => {
      window.dispatchEvent(key('y'));
    });
    await waitFor(() => expect(result.current.canRedo).toBe(false));
  });

  it('does not bind shortcuts when disabled', async () => {
    const { result } = renderHook(() => useCommandManager(undefined, false));
    await act(async () => {
      await result.current.execute(new FakeCommand());
    });
    await act(async () => {
      window.dispatchEvent(key('z'));
    });
    // still undoable — the keydown was ignored
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });
});

describe('useCommandKeyboardShortcuts', () => {
  it('returns platform-appropriate shortcut labels', () => {
    const { result } = renderHook(() => useCommandKeyboardShortcuts());
    expect(result.current.undo).toMatch(/Z$/);
    expect(result.current.redo).toMatch(/Z$/);
    expect(result.current.redoAlt).toMatch(/Y$/);
  });
});

describe('keyboard-shortcut registration (single-owner rule)', () => {
  // The ⌘Z double-undo shipped TWICE through the same hole: the options
  // shim keyed on 'managerOptions' alone, so { enableKeyboardShortcuts:
  // false } fell into the legacy branch and the flag was ignored. The
  // manager's re-entrancy guard cannot save us — browsers run a microtask
  // checkpoint between listeners of one event, so the first listener's
  // async undo completes (guard released) before the second runs. These
  // tests count REAL keydown registrations per argument form.
  const countKeydownRegistrations = (hookArg?: any) => {
    const spy = vi.spyOn(window, 'addEventListener');
    const { unmount } = renderHook(() => useCommandManager(hookArg));
    const count = spy.mock.calls.filter(([type]) => type === 'keydown').length;
    unmount();
    spy.mockRestore();
    return count;
  };

  it('default form registers the shortcut listener', () => {
    expect(countKeydownRegistrations(undefined)).toBe(1);
  });

  it('{ enableKeyboardShortcuts: false } alone is honored (the shipped footgun)', () => {
    expect(countKeydownRegistrations({ enableKeyboardShortcuts: false })).toBe(0);
  });

  it('{ managerOptions, enableKeyboardShortcuts: false } is honored', () => {
    expect(countKeydownRegistrations({ managerOptions: undefined, enableKeyboardShortcuts: false })).toBe(0);
  });

  it('{ onCommandExecuted } counts as hook form and registers by default', () => {
    expect(countKeydownRegistrations({ onCommandExecuted: () => {} })).toBe(1);
  });
});
