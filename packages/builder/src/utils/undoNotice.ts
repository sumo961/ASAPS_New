/**
 * "Deleted X · Undo" — the replacement for confirm-before-delete on
 * anything the undo history already covers (UX-Eval B4, §3.6).
 *
 * The Undo button must revert THIS action, not whatever the author did in
 * the seconds since. So the action captures the command that is on top of
 * the history when the notice is raised, and undoes only while that command
 * is still the latest one; otherwise it says so instead of reverting the
 * wrong thing (⌘Z and the history panel still reach it).
 */

import { getCommandManager } from '../commands/CommandManager';
import { notify, type NoticeAction } from './notify';

type HistoryLike = {
  getHistory(): ReadonlyArray<unknown>;
  getCurrentIndex(): number;
  undo(): Promise<boolean>;
};

/**
 * Build an Undo action bound to the command currently on top of the
 * history. Returns undefined when there is nothing to undo (the caller then
 * shows the notice without a button).
 */
export function undoLatestAction(
  label = 'Undo',
  manager: HistoryLike = getCommandManager(),
): NoticeAction | undefined {
  const index = manager.getCurrentIndex();
  const target = manager.getHistory()[index];
  if (index < 0 || !target) return undefined;
  return undoCommandAction(target, label, manager);
}

/**
 * Undo action bound to a SPECIFIC command. Use this after
 * `await getCommandManager().execute(cmd)` — execute records the command
 * only once its async work finishes, so `undoLatestAction` called right
 * after an un-awaited execute would capture the PREVIOUS command.
 */
export function undoCommandAction(
  command: unknown,
  label = 'Undo',
  manager: HistoryLike = getCommandManager(),
): NoticeAction {
  return {
    label,
    run: async () => {
      if (manager.getHistory()[manager.getCurrentIndex()] !== command) {
        notify.info('That change is no longer the latest one, so Undo here would revert something else.', {
          detail: 'Use ⌘Z (Ctrl+Z) to step back through your edits.',
        });
        return;
      }
      await manager.undo();
    },
  };
}

/**
 * `notify.success(message)` with an Undo button for the change just made.
 * Only for changes recorded SYNCHRONOUSLY (pushWithoutExecute); after an
 * execute(), use `undoCommandAction(cmd)` instead.
 */
export function notifyUndoable(message: string, detail?: string): void {
  notify.success(message, { detail, action: undoLatestAction() });
}
