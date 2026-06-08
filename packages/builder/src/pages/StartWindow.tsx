/**
 * StartWindow — Electron-only standalone start screen page. Loads at
 * the URL hash route `#/start-window`, hosted in its own BrowserWindow
 * spawned by the main process at app launch. The route is also
 * reachable in web for dev-time visual verification, but the web
 * build's normal entry point is still the in-editor modal Browser.
 *
 * Surfaces the same three create paths as the in-editor + New picker
 * AND the recent projects grid as a single unified Project Browser
 * page. Whatever the user picks results in `electronAPI.start.pick(...)`
 * being called — the main process then opens the editor window with
 * the encoded intent and closes this start window.
 *
 * Web fallback: when `window.electronAPI?.start` is not available
 * (i.e. web build), picks navigate to `/` with the intent appended
 * as query params so a single-page-app boot can consume them. This
 * makes the route work in plain Vite dev without Electron mock.
 */
import React from 'react';
import { ProjectLibrary } from '../components/ProjectLibrary';
import { useProject } from '../contexts/PersistenceContext';
import { importProjectFromZip } from '../utils/projectZipManager';

interface StartIntent {
  openProject?: string;
  createEmpty?: boolean;
  openStoryGen?: boolean;
  openIdeator?: boolean;
}

function dispatchPick(intent: StartIntent) {
  // Build the editor-window URL params from the intent. Mirrors what
  // the in-editor boot logic reads on mount (see App.tsx consumeBootIntent).
  const params = new URLSearchParams();
  if (intent.openProject) params.set('openProject', intent.openProject);
  if (intent.createEmpty) params.set('createEmpty', '1');
  if (intent.openStoryGen) params.set('openStoryGen', '1');
  if (intent.openIdeator) params.set('openIdeator', '1');

  const electronStart = (window as any).electronAPI?.start;
  if (electronStart?.pick) {
    // Electron: main process opens editor + closes this window.
    electronStart.pick(Object.fromEntries(params.entries()));
    return;
  }

  // Web fallback — navigate the same tab back to the editor. The
  // sessionStorage flag is already set (we opened the Browser once),
  // so the editor won't re-overlay the modal.
  const query = params.toString();
  window.location.href = query ? `/?${query}` : '/';
}

export const StartWindow: React.FC = () => {
  const { create: createProject } = useProject();

  // Empty path — create a fresh project right here in the start
  // window's storage context (same IndexedDB) and hand the new id
  // to the editor.
  const handleEmpty = async () => {
    try {
      const newId = await createProject('Untitled Project', undefined);
      if (newId) {
        dispatchPick({ openProject: newId });
      } else {
        dispatchPick({ createEmpty: true });
      }
    } catch (err) {
      console.warn('[StartWindow] createProject failed; deferring to editor', err);
      dispatchPick({ createEmpty: true });
    }
  };

  const handlePrompt = () => dispatchPick({ openStoryGen: true });
  const handleIdeator = () => dispatchPick({ openIdeator: true });
  const handleLoadExisting = (projectId: string) => dispatchPick({ openProject: projectId });

  // Import — run the existing zip importer in this window's storage
  // context, then hand the imported project's id to the editor.
  const handleImportFile = async (file: File) => {
    try {
      const result = await importProjectFromZip(file, {});
      if (result.success && result.projectId) {
        dispatchPick({ openProject: result.projectId });
      } else if (result.error) {
        alert(`Import failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Stateless ProjectLibrary uses its own currentProjectDeleted, etc.
  // Pass through what we know; isModal=false makes it render full-page.
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📁</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ASAPS Builder</h1>
            <div className="text-xs text-gray-500">Start a new project or continue where you left off</div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <ProjectLibrary
            isModal={false}
            onLoadProject={handleLoadExisting}
            onCreateProject={handleEmpty}
            onOpenStoryFromPrompt={handlePrompt}
            onOpenIdeator={handleIdeator}
            onImportZipFile={handleImportFile}
          />
        </div>
      </div>
    </div>
  );
};

export default StartWindow;
