/**
 * Save before quitting (2026-10-20). "Restart Now" for an update sometimes
 * stuck: the editor's beforeunload guard (unsaved changes — a pending
 * auto-save, or a save that failed) cancelled the window close, Electron
 * cancels silently, and quitAndInstall stopped halfway until the app was
 * killed. Now the main process first asks every editor to finish saving and
 * waits for the answers; whatever still holds the close gets a real dialog
 * (see unsavedChangesDialog).
 *
 * Signal-based: a window is asked only after it registered (preload
 * onSaveBeforeQuit), and a request ends with its answer or with the window
 * going away (destroyed, renderer gone, unresponsive) — never on a timer.
 */
import type { IpcMain, WebContents, MessageBoxSyncOptions } from 'electron';

type Editor = Pick<WebContents, 'send' | 'once' | 'removeListener' | 'isDestroyed'>;

const editors = new Set<Editor>();
const pending = new Map<number, (saved: boolean) => void>();
let nextId = 0;

export function registerSaveBeforeQuit(ipc: Pick<IpcMain, 'on'>): void {
  ipc.on('app:save-before-quit:ready', (event, ready: boolean) => {
    const editor = event.sender as Editor;
    if (ready) {
      if (!editors.has(editor)) editor.once('destroyed', () => editors.delete(editor));
      editors.add(editor);
    } else {
      editors.delete(editor);
    }
  });
  ipc.on('app:save-before-quit:done', (_event, id: number, saved: boolean) => {
    pending.get(id)?.(saved === true);
  });
}

/** Number of windows that answer save-before-quit. */
export function editorCount(): number {
  return editors.size;
}

/**
 * Ask every registered editor to save. Resolves true when all of them
 * report nothing left unsaved. `unresponsive` lets the caller end a request
 * when the window hangs (BrowserWindow 'unresponsive').
 */
export function saveEditorsBeforeQuit(onUnresponsive?: (editor: Editor, end: () => void) => void): Promise<boolean> {
  const asks = [...editors].filter((e) => !e.isDestroyed()).map((editor) => new Promise<boolean>((resolve) => {
    const id = ++nextId;
    const finish = (saved: boolean) => {
      pending.delete(id);
      editor.removeListener('destroyed', gone);
      editor.removeListener('render-process-gone', gone);
      resolve(saved);
    };
    const gone = () => finish(false);
    pending.set(id, finish);
    editor.once('destroyed', gone);
    editor.once('render-process-gone', gone);
    onUnresponsive?.(editor, gone);
    editor.send('app:save-before-quit', id);
  }));
  return Promise.all(asks).then((results) => results.every(Boolean));
}

/**
 * The dialog for a window whose page still holds the close after saving
 * was tried. Button 0 closes anyway.
 */
export function unsavedChangesDialog(forUpdate: boolean): MessageBoxSyncOptions {
  return {
    type: 'warning',
    title: 'Unsaved changes',
    message: 'Some changes could not be saved.',
    detail: forUpdate
      ? 'Restart and install the update anyway? Changes that could not be saved will be lost. Choose Cancel to keep working and save first; the update installs the next time you quit.'
      : 'Close anyway? Changes that could not be saved will be lost.',
    buttons: [forUpdate ? 'Restart and install' : 'Close anyway', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  };
}

/** Test seam. */
export function _resetSaveBeforeQuit(): void {
  editors.clear();
  pending.clear();
}
