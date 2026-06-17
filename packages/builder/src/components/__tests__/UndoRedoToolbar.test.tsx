/**
 * Tests for UndoRedoToolbar — renders Undo/Redo (+ History) wired to the
 * singleton CommandManager. Covers the disabled-when-empty state, enabling +
 * aria-label description after a command runs, the history counter, and that
 * clicking the buttons drives undo/redo. The manager is a singleton → cleared
 * each test; commands are executed through it so the toolbar's subscription
 * re-renders.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { UndoRedoToolbar } from '../UndoRedoToolbar';
import { getCommandManager } from '../../commands/CommandManager';
import { Command } from '../../commands/Command';

class FakeCommand extends Command {
  readonly type = 'FAKE';
  description = 'Add beat';
  execute() {}
  undo() {}
  protected serializeData() {
    return {};
  }
}

beforeEach(() => getCommandManager().clear());
afterEach(() => getCommandManager().clear());

const exec = () => act(() => getCommandManager().execute(new FakeCommand()) as any);

describe('UndoRedoToolbar', () => {
  it('renders Undo + Redo disabled with no history button when empty', () => {
    const { getByLabelText, queryByTitle } = render(<UndoRedoToolbar />);
    expect((getByLabelText(/^Undo/) as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText(/^Redo/) as HTMLButtonElement).disabled).toBe(true);
    expect(queryByTitle('Show history')).toBeNull(); // totalCommands === 0
  });

  it('enables Undo + surfaces the command description after a command runs', async () => {
    const { getByLabelText, getByTitle } = render(<UndoRedoToolbar />);
    await exec();
    expect((getByLabelText(/^Undo/) as HTMLButtonElement).disabled).toBe(false);
    expect(getByLabelText(/Undo: Add beat/)).toBeTruthy();
    // history counter appears: 1/1
    expect(getByTitle('Show history').textContent).toContain('1/1');
  });

  it('clicking Undo then Redo toggles the enabled states', async () => {
    const { getByLabelText } = render(<UndoRedoToolbar />);
    await exec();

    await act(async () => {
      (getByLabelText(/^Undo/) as HTMLButtonElement).click();
    });
    expect((getByLabelText(/^Undo/) as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText(/^Redo/) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      (getByLabelText(/^Redo/) as HTMLButtonElement).click();
    });
    expect((getByLabelText(/^Undo/) as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText(/^Redo/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies orientation + className to the container', () => {
    const { container } = render(<UndoRedoToolbar orientation="vertical" className="my-bar" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('my-bar');
  });

  it('omits shortcut hint from tooltips when showShortcuts is false', async () => {
    const { getByLabelText } = render(<UndoRedoToolbar showShortcuts={false} />);
    await exec();
    const undoBtn = getByLabelText(/^Undo/);
    expect(undoBtn.getAttribute('title')).not.toMatch(/Ctrl|⌘/);
  });
});
